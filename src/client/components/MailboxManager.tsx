import { useCallback, useEffect, useState, type FormEvent } from "react";

type Mailbox = {
  id: string;
  email_address: string;
  display_name: string;
  status: "active" | "disabled";
  quota_bytes: number;
};

export function MailboxManager({ onChanged }: { onChanged: () => void }) {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mailboxes", { cache: "no-store" });
      if (!res.ok) throw new Error("Unable to load native mailboxes");
      const data = await res.json() as { mailboxes: Mailbox[] };
      setMailboxes(data.mailboxes);
    } catch {
      setNotice("Could not load mailboxes. Try reopening Settings.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setNotice(null);
    try {
      const res = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, displayName }),
      });
      const result = await res.json() as { error?: string };
      if (!res.ok) throw new Error(result.error ?? "Unable to create mailbox");
      setAddress(""); setDisplayName("");
      setNotice("Mailbox created. Receiving requires the domain catch-all Email Worker route.");
      await load(); onChanged();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create mailbox");
    } finally { setBusy(false); }
  }

  async function toggle(box: Mailbox) {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch(`/api/mailboxes/${encodeURIComponent(box.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: box.status === "active" ? "disabled" : "active" }),
      });
      const result = await res.json() as { error?: string };
      if (!res.ok) throw new Error(result.error ?? "Unable to update mailbox");
      await load(); onChanged();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update mailbox");
    } finally { setBusy(false); }
  }

  return (
    <section className="settings-section" aria-label="Native mailbox management">
      <h3>Custom mailboxes</h3>
      <p>Create native addresses under liamthemo.com. All are managed by your existing passkey session, not separate passwords or IMAP accounts. New addresses are receive-only until outbound eligibility is confirmed.</p>
      <div className="settings-accounts">
        {mailboxes.map((box) => (
          <div className="settings-account" key={box.id}>
            <span className="settings-avatar-fallback">{box.email_address[0]?.toUpperCase()}</span>
            <div>
              <strong>{box.email_address}</strong>
              <small>{box.status === "active" ? "Active" : "Disabled"}{box.display_name ? ` · ${box.display_name}` : ""}</small>
            </div>
            {box.id !== "native:primary" ? (
              <button type="button" disabled={busy} onClick={() => void toggle(box)}>
                {box.status === "active" ? "Disable" : "Enable"}
              </button>
            ) : <span className="settings-locked">Primary</span>}
          </div>
        ))}
      </div>
      <form onSubmit={(event) => void create(event)} style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <label htmlFor="new-mailbox-address">New mailbox address</label>
        <input id="new-mailbox-address" type="text" autoComplete="off" spellCheck={false}
          placeholder="personal@liamthemo.com" value={address} onChange={(event) => setAddress(event.target.value)}
          required maxLength={254} style={{ width: "100%", padding: 10, color: "var(--text)", background: "var(--surface, #302a26)", border: "1px solid var(--border, #65574c)", borderRadius: 8 }} />
        <label htmlFor="new-mailbox-name">Display name (optional)</label>
        <input id="new-mailbox-name" type="text" autoComplete="off" placeholder="Personal"
          value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80}
          style={{ width: "100%", padding: 10, color: "var(--text)", background: "var(--surface, #302a26)", border: "1px solid var(--border, #65574c)", borderRadius: 8 }} />
        <button className="settings-primary" disabled={busy || !address.trim()} type="submit">
          {busy ? "Saving…" : "Create mailbox"}
        </button>
        {notice && <small role="status">{notice}</small>}
      </form>
    </section>
  );
}
