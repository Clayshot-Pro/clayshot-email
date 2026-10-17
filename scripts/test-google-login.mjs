import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifiedGoogleEmail } from "../src/worker/googleIdClaims.ts";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const now = Date.parse("2026-10-17T00:00:00Z");
const valid = {
  iss: "https://accounts.google.com", aud: "client-id", exp: now / 1000 + 300, nonce: "n",
  email: "Liam@ClayshotPro.com", email_verified: true, hd: "clayshotpro.com",
};
const check = (claims) => verifiedGoogleEmail(claims, "client-id", "n", "clayshotpro.com", now);

assert.equal(check(valid), "liam@clayshotpro.com");
assert.equal(check({ ...valid, iss: "accounts.google.com" }), "liam@clayshotpro.com");
assert.equal(check({ ...valid, email_verified: "true" }), "liam@clayshotpro.com");
assert.equal(check(null), null);
assert.equal(check({ ...valid, iss: "https://evil.example" }), null, "issuer");
assert.equal(check({ ...valid, aud: "other-client" }), null, "audience");
assert.equal(check({ ...valid, exp: now / 1000 - 1 }), null, "expired");
assert.equal(check({ ...valid, nonce: "other" }), null, "nonce replay");
assert.equal(check({ ...valid, email_verified: false }), null, "unverified email");
assert.equal(check({ ...valid, hd: undefined, email: "liam@gmail.com" }), null, "consumer account");
assert.equal(check({ ...valid, hd: "evil.com", email: "liam@evil.com" }), null, "other workspace");
assert.equal(check({ ...valid, email: "liam@gmail.com" }), null, "email outside hosted domain");
assert.equal(check({ ...valid, email: "admin@clayshotpro.com" }), null, "admin identity is never granted");

const login = source("src/worker/googleLogin.ts");
assert.match(login, /GOOGLE_LOGIN_SCOPE = "openid email"/, "sign-in requests no Gmail scopes");
assert.match(login, /__Host-ltm_google_login/);
assert.match(login, /HttpOnly; SameSite=Lax/);
assert.match(login, /code_challenge_method: "S256"/);
assert.match(login, /url\.searchParams\.get\("state"\) !== saved\.state/);
assert.match(login, /isAdministratorEmail\(request, email/);
assert.match(login, /status='active' AND deleted_at IS NULL/);
assert.match(login, /grantNativeDeviceSession/);
const router = source("src/worker/index.ts");
assert.match(router, /"\/api\/auth\/google\/start",\n\]\);/, "start is rate limited");
assert.match(router, /"\/api\/auth\/google\/callback" && request.method === "GET"/);
const ui = source("src/client/AccountSignIn.tsx");
assert.match(ui, /fetch\("\/api\/auth\/google\/start"/);
assert.match(source("src/client/AuthGate.tsx"), /params\.get\("google"\)/);
console.log("PASS: Google sign-in claims, CSRF state and mailbox-only grant");
