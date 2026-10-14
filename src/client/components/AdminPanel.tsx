import { MailboxManager } from "./MailboxManager";
export function AdminPanel({ onClose, onMailboxesChanged }: {
  onClose: () => void;
  onMailboxesChanged: () => void;
}) {
  return <div className="settings-backdrop" role="presentation" onMouseDown={event => {
    if (event.currentTarget === event.target) onClose();
  }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="admin-panel-title">
      <header>
        <div><span>Owner passkey verified</span><h2 id="admin-panel-title">Email administration</h2></div>
        <button className="settings-close" type="button" aria-label="Close admin panel" onClick={onClose}>×</button>
      </header>
      <div className="settings-scroll">
        <p>Only the administrator passkey can create, disable, delete or reset the passwords for custom email addresses.</p>
        <MailboxManager onChanged={onMailboxesChanged}/>
      </div>
    </section>
  </div>;
}
