-- v2.00: additive mailbox isolation. Existing rows remain in native:primary.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS native_mailboxes (
  id TEXT PRIMARY KEY,
  email_address TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  quota_bytes INTEGER NOT NULL DEFAULT 5368709120 CHECK (quota_bytes >= 0),
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO native_mailboxes (id, email_address, display_name)
VALUES ('native:primary', 'contact@liamthemo.com', 'LTM Email');

ALTER TABLE threads ADD COLUMN mailbox_id TEXT NOT NULL DEFAULT 'native:primary';
ALTER TABLE messages ADD COLUMN mailbox_id TEXT NOT NULL DEFAULT 'native:primary';
ALTER TABLE messages ADD COLUMN original_message_id TEXT;
ALTER TABLE messages ADD COLUMN is_junk INTEGER NOT NULL DEFAULT 0 CHECK (is_junk IN (0, 1));
ALTER TABLE drafts ADD COLUMN mailbox_id TEXT NOT NULL DEFAULT 'native:primary';

UPDATE messages SET original_message_id = message_id WHERE direction = 'inbound' AND message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_mailbox_folder
  ON messages (mailbox_id, direction, is_deleted, is_archived, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_mailbox_thread ON messages (mailbox_id, thread_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_mailbox_original_id
  ON messages (mailbox_id, original_message_id)
  WHERE direction = 'inbound' AND original_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drafts_mailbox_updated ON drafts (mailbox_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_mailbox ON threads (mailbox_id, latest_message_at DESC);

-- Approximate size of legacy metadata for initial quota accounting; R2 raw MIME
-- blobs from before v2.00 require a private inventory for exact usage.
UPDATE native_mailboxes SET used_bytes = COALESCE((
  SELECT SUM(COALESCE(LENGTH(body_text),0) + COALESCE(LENGTH(body_html),0))
  FROM messages WHERE mailbox_id='native:primary'
),0) WHERE id='native:primary';
