-- v2.02: administrator password + passkey verification.
-- admin@liamthemo.com is a reserved login identity, not a native mailbox.
CREATE TABLE IF NOT EXISTS admin_credentials (
  id INTEGER PRIMARY KEY CHECK(id=1),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_login_pending (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_login_pending_expiry ON admin_login_pending(expires_at);
ALTER TABLE auth_challenges ADD COLUMN admin_pending_hash TEXT;
