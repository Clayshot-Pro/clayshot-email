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
    if (newPassword.length < 16 || newPassword.length > 128) {
      setError("Choose a password between 16 and 128 characters"); return;
    }
    setError(""); setBusy(true);
    try {
      const response=await fetch("/api/admin/password",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({newPassword,currentPassword:configured?currentPassword:undefined}),
      });
      const result=await response.json() as {error?:string};
      if (!response.ok) throw new Error(result.error ?? "Unable to update administrator password");
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
        <form className="auth-setup admin-password-form" onSubmit={event=>void saveAdminPassword(event)}>
          {configured && <label htmlFor="admin-current-password">Current password
            <input id="admin-current-password" type="password" value={currentPassword}
              onChange={event=>setCurrentPassword(event.target.value)} autoComplete="current-password" required/>
          </label>}
          <label htmlFor="admin-new-password">New password (16–128 characters)
            <input id="admin-new-password" type="password" value={newPassword}
              onChange={event=>setNewPassword(event.target.value)} autoComplete="new-password" minLength={16} maxLength={128} required/>
          </label>
          <label htmlFor="admin-confirm-password">Confirm new password
            <input id="admin-confirm-password" type="password" value={confirmPassword}
              onChange={event=>setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={16} maxLength={128} required/>
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
