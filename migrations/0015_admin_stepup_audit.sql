-- Fresh WebAuthn authentication for sensitive administrator operations.
-- Grants are bound to owner-session hash, HTTP method, exact route and SHA-256 body.
CREATE TABLE IF NOT EXISTS admin_stepup_challenges (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL,
  challenge TEXT NOT NULL,
  method TEXT NOT NULL,
  pathname TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_stepup_challenges_expiry ON admin_stepup_challenges(expires_at);
CREATE TABLE IF NOT EXISTS admin_stepup_approvals (
  token_hash TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL,
  method TEXT NOT NULL,
  pathname TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 500),
  uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_stepup_approvals_expiry ON admin_stepup_approvals(expires_at);

-- Append-only security log; no passwords, cookies, WebAuthn assertions or email contents.
CREATE TABLE IF NOT EXISTS admin_security_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','denied','failure')),
  actor TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_fingerprint TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_security_events_time ON admin_security_events(created_at DESC);
