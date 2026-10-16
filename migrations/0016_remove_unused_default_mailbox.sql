-- v0.02: Remove only the unused bootstrap mailbox created by old setup.
-- Do not erase a mailbox that has received mail, was personalized, or has any
-- saved credentials, ownership grants, audit trail, message data or drafts.
-- Existing installations with real mailbox data require an explicit migration.
PRAGMA foreign_keys = ON;

DELETE FROM native_mailboxes
WHERE id = 'native:primary'
  AND email_address = 'contact@clayshotpro.com'
  AND display_name = 'Clayshot Pro Email'
  AND status = 'active'
  AND used_bytes = 0
  AND deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM messages WHERE mailbox_id = 'native:primary')
  AND NOT EXISTS (SELECT 1 FROM threads WHERE mailbox_id = 'native:primary')
  AND NOT EXISTS (SELECT 1 FROM drafts WHERE mailbox_id = 'native:primary')
  AND NOT EXISTS (SELECT 1 FROM native_mailbox_credentials WHERE mailbox_id = 'native:primary')
  AND NOT EXISTS (SELECT 1 FROM mailbox_audit WHERE mailbox_id = 'native:primary')
  AND NOT EXISTS (SELECT 1 FROM outbound_attempts WHERE mailbox_id = 'native:primary')
  AND NOT EXISTS (SELECT 1 FROM inbound_receipts WHERE mailbox_id = 'native:primary')
  AND NOT EXISTS (SELECT 1 FROM mailbox_usage_rebuild WHERE mailbox_id = 'native:primary')
  AND NOT EXISTS (
    SELECT 1 FROM device_session_accounts
    WHERE provider = 'native' AND account_id = 'native:primary'
  );

-- An old account-list cache may have created a provider-registry placeholder.
-- It is safe to remove only after the unused bootstrap mailbox is gone.
DELETE FROM connected_accounts
WHERE id = 'native:primary'
  AND provider = 'native'
  AND email_address = 'contact@clayshotpro.com'
  AND NOT EXISTS (SELECT 1 FROM native_mailboxes WHERE id = 'native:primary')
  AND NOT EXISTS (SELECT 1 FROM provider_message_map WHERE account_id = 'native:primary')
  AND NOT EXISTS (SELECT 1 FROM provider_credentials WHERE account_id = 'native:primary');
