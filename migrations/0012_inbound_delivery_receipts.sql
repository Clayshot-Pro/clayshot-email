-- Distinguish transport retries from distinct deliveries with the same RFC Message-ID.
-- Retained for seven days; no message bodies or sender addresses are stored here.
DROP INDEX IF EXISTS idx_messages_mailbox_original_id;
CREATE INDEX IF NOT EXISTS idx_messages_mailbox_original_id
  ON messages(mailbox_id,original_message_id)
  WHERE direction='inbound' AND original_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS inbound_receipts (
  mailbox_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','accepted')),
  message_id TEXT,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mailbox_id,fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_inbound_receipts_date ON inbound_receipts(first_seen_at);
