import { useState, type FormEvent } from "react";

export function AccountSignIn({ onSignedIn, showGoogle = true }: { onSignedIn: () => void; showGoogle?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"google" | "custom" | null>(null);
  const [error, setError] = useState("");

  async function addGoogle() {
    setPending("google"); setError("");
    try {
      const response = await fetch("/api/accounts/gmail/connect", { method: "POST" });
      const result = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !result.authorizationUrl) throw new Error(result.error || "Google sign-in unavailable");
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google sign-in unavailable");
      setPending(null);
    }
  }

  async function addCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("custom"); setError("");
    try {
      const response = await fetch("/api/device/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as {error?:string};
      if (!response.ok) throw new Error(result.error || "Custom mailbox sign-in failed");
      setPassword("");
      onSignedIn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Custom mailbox sign-in failed");
    } finally { setPending(null); }
  }

  return <div className="account-signin">
    {showGoogle && <button className="auth-primary" type="button" disabled={pending !== null}
      onClick={() => void addGoogle()}>{pending === "google" ? "Connecting Google…" : "Continue with Google"}</button>}
    {showGoogle && <div className="account-signin-divider"><span>or use a custom email</span></div>}
    <form className="auth-setup" onSubmit={(event) => void addCustom(event)}>
      <label htmlFor="device-email">Email address</label>
      <input id="device-email" type="email" value={email} onChange={event => setEmail(event.target.value)}
        placeholder="personal@liamthemo.com" autoComplete="username" required maxLength={254} />
      <label htmlFor="device-password">Mailbox password</label>
      <input id="device-password" type="password" value={password} onChange={event => setPassword(event.target.value)}
        autoComplete="current-password" minLength={16} required />
      <button className="auth-primary" type="submit" disabled={pending !== null}>
        {pending === "custom" ? "Signing in…" : "Sign in to custom email"}
      </button>
    </form>
    {error && <p className="auth-error" role="alert">{error}</p>}
  </div>;
}
