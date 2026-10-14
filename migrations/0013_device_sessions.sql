-- v2.01: independent browser sessions and per-mailbox password sign-in.
-- No plaintext passwords/tokens; existing owner passkeys and mail data unchanged.
CREATE TABLE IF NOT EXISTS native_mailbox_credentials (
  mailbox_id TEXT PRIMARY KEY REFERENCES native_mailboxes(id) ON DELETE CASCADE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_device_sessions_expiry ON device_sessions(expires_at);

CREATE TABLE IF NOT EXISTS device_session_accounts (
  session_id TEXT NOT NULL REFERENCES device_sessions(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('native','gmail')),
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id,account_id)
);
CREATE INDEX IF NOT EXISTS idx_device_accounts_lookup ON device_session_accounts(account_id);

-- State is bound to the initiating browser so an OAuth callback cannot link
-- an attacker's account into a victim's device session.
ALTER TABLE oauth_states ADD COLUMN device_nonce_hash TEXT;

-- Push subscriptions must be checked against the current device grants.
ALTER TABLE push_subscriptions ADD COLUMN device_session_id TEXT;
