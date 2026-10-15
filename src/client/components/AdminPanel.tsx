import { useEffect, useState, type FormEvent } from "react";
import { MailboxManager } from "./MailboxManager";

export function AdminPanel() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/status",{cache:"no-store"})
      .then(async response => {
        if (!response.ok) throw new Error("Unable to load administrator settings");
        const status = await response.json() as {passwordConfigured:boolean};
        setConfigured(status.passwordConfigured);
      })
      .catch(cause=>setError(cause instanceof Error?cause.message:"Unable to load administrator settings"));
  }, []);

  async function saveAdminPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {setError("Passwords do not match"); return;}
    if (newPassword.length < 8 || newPassword.length > 32) {
      setError("Choose a password between 8 and 32 characters"); return;
    }
    setError(""); setBusy(true);
    try {
      const response=await fetch("/api/admin/password",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({newPassword,currentPassword:configured?currentPassword:undefined}),
      });
      // A Worker error may return HTML rather than JSON (for example, when
      // the production D1 schema has not migrated). Avoid exposing Safari's
      // misleading "string did not match the expected pattern" exception.
      const contentType=response.headers.get("Content-Type")??"";
      const result=contentType.includes("application/json")
        ? await response.json() as {error?:string}
        : null;
      if (!response.ok) {
        throw new Error(result?.error ?? `Unable to save the administrator password (HTTP ${response.status}). Please try again.`);
      }
      setCurrentPassword("");setNewPassword("");setConfirmPassword("");
      // All prior owner sessions were invalidated by the credential update.
      window.location.assign("/");
    } catch(cause) {
      setError(cause instanceof Error?cause.message:"Unable to change password");
    } finally {setBusy(false);}
  }
  async function signOut() {
    setBusy(true);
    try {await fetch("/api/device/logout",{method:"POST"});}
    finally {window.location.assign("/");}
  }

  return <main className="admin-home">
    <div className="admin-home-card">
      <header className="admin-home-header">
        <div><p className="auth-eyebrow">admin@liamthemo.com</p><h1>Email administration</h1>
          <p>Protected by your administrator password and passkey.</p></div>
        <button type="button" className="auth-secondary" disabled={busy} onClick={() => void signOut()}>Sign out</button>
      </header>
      <section className="settings-section" aria-label="Administrator password">
        <h2>{configured ? "Change administrator password" : "Set administrator password"}</h2>
        <p>{configured
          ? "Changing this password signs out all administrator sessions. Your passkey remains required at the next sign-in."
          : "One-time setup: choose your administrator password. Your existing passkey remains the second factor."}</p>
        <p>Use 8–32 characters. Special characters such as ? and ! are supported.</p>
        <form className="auth-setup admin-password-form" onSubmit={event=>void saveAdminPassword(event)}>
          {configured && <label htmlFor="admin-current-password">Current password
            <input id="admin-current-password" type="password" value={currentPassword}
              onChange={event=>setCurrentPassword(event.target.value)} autoComplete="current-password" required/>
          </label>}
          <label htmlFor="admin-new-password">New password (8–32 characters)
            <input id="admin-new-password" type="password" value={newPassword}
              onChange={event=>setNewPassword(event.target.value)} autoComplete="new-password" autoCapitalize="none" spellCheck={false} minLength={8} maxLength={32} required/>
          </label>
          <label htmlFor="admin-confirm-password">Confirm new password
            <input id="admin-confirm-password" type="password" value={confirmPassword}
              onChange={event=>setConfirmPassword(event.target.value)} autoComplete="new-password" autoCapitalize="none" spellCheck={false} minLength={8} maxLength={32} required/>
          </label>
          <button type="submit" className="settings-primary" disabled={busy||configured===null}>
            {busy?"Saving…":configured?"Change password and sign out":"Save admin password and sign out"}
          </button>
        </form>
        {error && <p role="alert" className="auth-error">{error}</p>}
      </section>
      {configured ? <MailboxManager onChanged={() => undefined}/> :
        <p role="status">Set the administrator password first; then sign in with admin@liamthemo.com and your passkey to manage mailboxes.</p>}
    </div>
  </main>;
}
