import { startAuthentication } from "@simplewebauthn/browser";

export async function unlockOwnerPasskey(): Promise<void> {
  const envelope = await fetch("/api/auth/login/options", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  const options = await envelope.json() as {
    challengeId?: string;
    options?: Parameters<typeof startAuthentication>[0]["optionsJSON"];
    error?: string;
  };
  if (!envelope.ok || !options.options || !options.challengeId) {
    throw new Error(options.error || "Administrator passkey is unavailable");
  }
  const response = await startAuthentication({ optionsJSON: options.options });
  const verified = await fetch("/api/auth/login/verify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: options.challengeId, response }),
  });
  if (!verified.ok) {
    const result = await verified.json().catch(() => ({})) as {error?:string};
    throw new Error(result.error || "Administrator passkey verification failed");
  }
}
