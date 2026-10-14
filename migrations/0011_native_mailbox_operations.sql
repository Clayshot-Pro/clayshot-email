-- v2.00: staged deletion, audit, and outbound idempotency.
-- Additive migration; existing mailboxes and messages remain untouched.
ALTER TABLE native_mailboxes ADD COLUMN deleted_at TEXT;
ALTER TABLE native_mailboxes ADD COLUMN purge_after TEXT;
ALTER TABLE native_mailboxes ADD COLUMN forwarded_to TEXT;
ALTER TABLE native_mailboxes ADD COLUMN spam_filter_enabled INTEGER NOT NULL DEFAULT 0 CHECK (spam_filter_enabled IN (0,1));

CREATE TABLE IF NOT EXISTS mailbox_audit (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mailbox_audit_mailbox ON mailbox_audit(mailbox_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_attempts (
  mailbox_id TEXT NOT NULL,
  client_key TEXT NOT NULL,
  message_id TEXT,
  provider_message_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending','accepted','failed','uncertain')),
  error_code TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(mailbox_id, client_key),
  FOREIGN KEY (mailbox_id) REFERENCES native_mailboxes(id)
);
CREATE INDEX IF NOT EXISTS idx_outbound_attempts_started ON outbound_attempts(mailbox_id,started_at DESC);
