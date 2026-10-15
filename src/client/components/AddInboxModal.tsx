import { AccountSignIn } from "../AccountSignIn";
import { Icon } from "./Icon";

export type AddInboxMode = "choose" | "custom" | null;

type Props = {
  mode: AddInboxMode;
  connectingGmail: boolean;
  onClose: () => void;
  onBack: () => void;
  onChooseCustom: () => void;
  onChooseGmail: () => void;
  onCustomSignedIn: () => void;
};

export function AddInboxModal({
  mode,
  connectingGmail,
  onClose,
  onBack,
  onChooseCustom,
  onChooseGmail,
  onCustomSignedIn,
}: Props) {
  if (mode === null) return null;

  return (
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !connectingGmail) onClose();
      }}
    >
      <section
        className="settings-modal account-login-modal add-inbox-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-inbox-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !connectingGmail) onClose();
        }}
      >
        <header>
          <div>
            <span>Manage your accounts</span>
            <h2 id="add-inbox-title">{mode === "choose" ? "Add Inbox" : "Custom email"}</h2>
          </div>
          <button type="button" className="settings-close" onClick={onClose}
            disabled={connectingGmail} aria-label="Close Add Inbox">×</button>
        </header>
        <div className="settings-scroll add-inbox-scroll">
          {mode === "choose" ? (
            <>
              <p className="add-inbox-intro">Choose the type of inbox you want to connect to this device.</p>
              <div className="add-inbox-options">
                <button type="button" className="add-inbox-option" onClick={onChooseCustom} disabled={connectingGmail}>
                  <span className="add-inbox-option-icon"><Icon name="mail" size={21}/></span>
                  <span className="add-inbox-option-copy">
                    <strong>Custom email</strong>
                    <small>Sign in to an existing LTM mailbox with its email address and password.</small>
                  </span>
                  <span className="add-inbox-option-arrow" aria-hidden="true">›</span>
                </button>
                <button type="button" className="add-inbox-option" onClick={onChooseGmail} disabled={connectingGmail}>
                  <span className="add-inbox-option-icon add-inbox-google" aria-hidden="true">G</span>
                  <span className="add-inbox-option-copy">
                    <strong>Gmail</strong>
                    <small>Connect a Google account securely using Google sign-in.</small>
                  </span>
                  <span className="add-inbox-option-arrow" aria-hidden="true">{connectingGmail ? "…" : "›"}</span>
                </button>
              </div>
              {connectingGmail ? <p className="add-inbox-feedback" role="status">Connecting to Google…</p> : null}
            </>
          ) : (
            <>
              <button type="button" className="add-inbox-back" onClick={onBack}>
                <Icon name="back" size={16}/> All inbox types
              </button>
              <AccountSignIn showGoogle={false} onSignedIn={onCustomSignedIn}/>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
