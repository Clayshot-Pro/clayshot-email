import { appOrigin, isAdministratorEmail } from "./config";
import { grantNativeDeviceSession } from "./deviceAuth";
import { configuredMailDomain } from "./mailboxRules";
import { verifiedGoogleEmail, type GoogleIdClaims } from "./googleIdClaims";
import { GOOGLE_TOKEN_ENDPOINT } from "./providers/googleConfig";

/** "Sign in with Google" for native mailboxes. The verified Google account
 * must belong to the configured mail domain and match an active mailbox; it
 * never grants administrator access. Uses only openid/email scopes. */
export const GOOGLE_LOGIN_SCOPE = "openid email";
const LOGIN_COOKIE = "__Host-ltm_google_login";
const LOGIN_TTL_SECONDS = 600;
const encoder = new TextEncoder();

type GoogleLoginEnv = Env & { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string };

const callbackUri = (request: Request) => `${appOrigin(request)}/api/auth/google/callback`;
const loginCookie = (value: string, age: number) =>
  `${LOGIN_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;

function b64url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
const random = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

function isGoogleLoginConfigured(env: Env): env is GoogleLoginEnv {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function readLoginCookie(request: Request): { state: string; verifier: string; nonce: string } | null {
  for (const pair of (request.headers.get("Cookie") ?? "").split(";")) {
    const index = pair.indexOf("=");
    if (index <= 0 || pair.slice(0, index).trim() !== LOGIN_COOKIE) continue;
    const [state, verifier, nonce] = pair.slice(index + 1).trim().split(".");
    return state && verifier && nonce && [state, verifier, nonce].every(v => /^[\w-]{30,100}$/.test(v))
      ? { state, verifier, nonce } : null;
  }
  return null;
}

function decodeIdToken(idToken: string): GoogleIdClaims | null {
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as GoogleIdClaims;
  } catch {
    return null;
  }
}

function finish(request: Request, status: string, setCookie?: string | null): Response {
  const headers = new Headers({
    Location: `${appOrigin(request)}/?google=${encodeURIComponent(status)}`,
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", loginCookie("", 0));
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(null, { status: 303, headers });
}

export async function startGoogleLogin(request: Request, env: Env): Promise<Response> {
  if (!isGoogleLoginConfigured(env)) {
    return Response.json({ error: "Google sign-in is not configured" }, { status: 503 });
  }
  const state = random();
  const verifier = random(48);
  const nonce = random();
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
  const query = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUri(request),
    response_type: "code",
    scope: GOOGLE_LOGIN_SCOPE,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    hd: configuredMailDomain(env.PRIMARY_ADDRESS),
    prompt: "select_account",
  });
  return Response.json(
    { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${query}` },
    { headers: { "Set-Cookie": loginCookie(`${state}.${verifier}.${nonce}`, LOGIN_TTL_SECONDS), "Cache-Control": "no-store" } },
  );
}

export async function googleLoginCallback(request: Request, env: Env): Promise<Response> {
  if (!isGoogleLoginConfigured(env)) return finish(request, "configuration_error");
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return finish(request, "cancelled");
  const code = url.searchParams.get("code") ?? "";
  const saved = readLoginCookie(request);
  // The state must match the HttpOnly __Host- cookie set when sign-in started.
  if (!code || !saved || url.searchParams.get("state") !== saved.state) return finish(request, "invalid_state");

  let idToken: string | undefined;
  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUri(request),
        grant_type: "authorization_code",
        code_verifier: saved.verifier,
      }),
    });
    if (!response.ok) return finish(request, "exchange_failed");
    idToken = (await response.json<{ id_token?: string }>()).id_token;
  } catch {
    return finish(request, "exchange_failed");
  }

  const domain = configuredMailDomain(env.PRIMARY_ADDRESS);
  const email = idToken
    ? verifiedGoogleEmail(decodeIdToken(idToken), env.GOOGLE_CLIENT_ID, saved.nonce, domain)
    : null;
  if (!email || isAdministratorEmail(request, email, env.PRIMARY_ADDRESS, env.ADMIN_LOGIN_ADDRESS)) {
    return finish(request, "account_not_allowed");
  }
  const mailbox = await env.DB.prepare(
    "SELECT id FROM native_mailboxes WHERE email_address=?1 AND status='active' AND deleted_at IS NULL"
  ).bind(email).first<{ id: string }>();
  if (!mailbox) return finish(request, "no_mailbox");
  return finish(request, "signed_in", await grantNativeDeviceSession(request, env, mailbox.id));
}
