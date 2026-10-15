import { startAuthentication } from "@simplewebauthn/browser";

export type AdminApproval = {
  token: string;
  pathname: string;
  method: string;
  body: string | undefined;
};

async function jsonResult(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Administrator passkey verification failed");
  return data;
}
function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2,"0")).join("");
}

export async function approveAdminAction(pathname: string, method: string, body?: string): Promise<AdminApproval> {
  // Hash, rather than retransmit, sensitive request bodies (including passwords).
  const bytes = new TextEncoder().encode(body ?? "");
  const bodyHash = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  const options = await jsonResult(await fetch("/api/admin/step-up/options", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pathname, method, bodyHash }),
  }));
  if (typeof options.challengeId !== "string" || !options.options) throw new Error("Passkey challenge unavailable");
  const signed = await startAuthentication({
    optionsJSON: options.options as Parameters<typeof startAuthentication>[0]["optionsJSON"],
  });
  const verified = await jsonResult(await fetch("/api/admin/step-up/verify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: options.challengeId, response: signed }),
  }));
  if (typeof verified.approval !== "string") throw new Error("Passkey approval unavailable");
  return { token: verified.approval, pathname, method, body };
}

export async function adminActionFetch(
  pathname: string, method: string, body?: string, reusableApproval?: AdminApproval,
): Promise<Response> {
  if (reusableApproval && (reusableApproval.pathname !== pathname || reusableApproval.method !== method
    || reusableApproval.body !== body)) throw new Error("Passkey approval does not match the operation");
  const approval = reusableApproval ?? await approveAdminAction(pathname, method, body);
  return fetch(pathname, {
    method, cache: "no-store",
    headers: {
      "X-Admin-Step-Up": approval.token,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body,
  });
}
