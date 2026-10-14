#!/usr/bin/env python3
"""Offline regression tests for the v2.00 additive native-mailbox D1 migration."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
for migration in sorted((ROOT / "migrations").glob("*.sql")):
    if migration.name == "0010_native_mailboxes.sql":
        # Insert a production-like legacy native mailbox, including flags/drafts.
        db.execute(
            "INSERT INTO threads (id,subject,latest_message_at,message_count) VALUES (?,?,?,?)",
            ("thread-original", "existing", "2026-10-01", 1),
        )
        db.execute(
            """INSERT INTO messages
               (id,message_id,thread_id,direction,from_address,to_addresses,subject,received_at,is_read,body_text)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            ("message-original", "<existing@sender.test>", "thread-original", "inbound",
             "sender@test.com", '["contact@liamthemo.com"]', "existing", "2026-10-01", 1, "legacy email body"),
        )
        db.execute(
            "INSERT INTO drafts (id,subject,body_text) VALUES (?,?,?)",
            ("draft-original", "existing draft", "draft body"),
        )
    db.executescript(migration.read_text(encoding="utf-8"))

assert db.execute(
    "SELECT mailbox_id,original_message_id,is_read FROM messages WHERE id='message-original'"
).fetchone() == ("native:primary", "<existing@sender.test>", 1)
assert db.execute(
    "SELECT mailbox_id FROM drafts WHERE id='draft-original'"
).fetchone() == ("native:primary",)
assert db.execute(
    "SELECT used_bytes FROM native_mailboxes WHERE id='native:primary'"
).fetchone()[0] > 0
assert db.execute(
    "SELECT mailbox_id FROM threads WHERE id='thread-original'"
).fetchone() == ("native:primary",)

box = "native:example"
db.execute(
    "INSERT INTO native_mailboxes (id,email_address) VALUES (?,?)",
    (box, "example@liamthemo.com"),
)
db.execute(
    "INSERT INTO threads (id,subject,latest_message_at,mailbox_id) VALUES (?,?,?,?)",
    ("thread-example", "independent", "2026-10-02", box),
)
db.execute(
    """INSERT INTO messages
       (id,thread_id,direction,from_address,to_addresses,subject,received_at,
        mailbox_id,original_message_id,is_read)
       VALUES (?,?,?,?,?,?,?,?,?,?)""",
    ("message-example", "thread-example", "inbound", "sender@test.com",
     '["example@liamthemo.com"]', "existing", "2026-10-02",
     box, "<existing@sender.test>", 0),
)
assert db.execute(
    "SELECT COUNT(*) FROM messages WHERE original_message_id='<existing@sender.test>'"
).fetchone()[0] == 2
assert db.execute(
    "SELECT is_read FROM messages WHERE mailbox_id=?", (box,)
).fetchone()[0] == 0

try:
    db.execute(
        "INSERT INTO native_mailboxes (id,email_address) VALUES (?,?)",
        ("native:dup", "EXAMPLE@liamthemo.com"),
    )
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("Mailbox addresses must be case-insensitively unique")

# RFC Message-ID is not an SMTP delivery ID. Distinct MIME deliveries can
# legitimately use the same RFC Message-ID and must not be silently dropped.
db.execute(
    """INSERT INTO messages
       (id,thread_id,direction,from_address,to_addresses,subject,received_at,
        mailbox_id,original_message_id)
       VALUES (?,?,?,?,?,?,?,?,?)""",
    ("second-content", "thread-example", "inbound", "sender@test.com",
     "[]", "distinct MIME content", "2026-10-02", box, "<existing@sender.test>"),
)
assert db.execute(
    "SELECT COUNT(*) FROM messages WHERE mailbox_id=? AND original_message_id=?",
    (box, "<existing@sender.test>"),
).fetchone()[0] == 2

db.execute(
    "INSERT INTO inbound_receipts(mailbox_id,fingerprint,state) VALUES (?,?,?)",
    (box, "sha256-content-A", "pending"),
)
dup_receipt = db.execute(
    "INSERT OR IGNORE INTO inbound_receipts(mailbox_id,fingerprint,state) VALUES (?,?,?)",
    (box, "sha256-content-A", "pending"),
)
assert dup_receipt.rowcount == 0

print("PASS: legacy mailbox backfill, independent delivery and retry-safe MIME fingerprints")

db.execute("UPDATE native_mailboxes SET quota_bytes=10 WHERE id=?", (box,))
allowed = db.execute(
    """UPDATE native_mailboxes SET used_bytes=used_bytes+?
       WHERE id=? AND status='active' AND used_bytes+? <= quota_bytes""",
    (7, box, 7),
)
assert allowed.rowcount == 1
denied = db.execute(
    """UPDATE native_mailboxes SET used_bytes=used_bytes+?
       WHERE id=? AND status='active' AND used_bytes+? <= quota_bytes""",
    (7, box, 7),
)
assert denied.rowcount == 0
assert db.execute("SELECT used_bytes FROM native_mailboxes WHERE id=?", (box,)).fetchone()[0] == 7
print("PASS: conditional atomic quota reservation")

# v2.00 operational schema: deletion, audit, idempotency and reconciliation.
assert "deleted_at" in [x[1] for x in db.execute("PRAGMA table_info(native_mailboxes)")]
assert "usage_version" in [x[1] for x in db.execute("PRAGMA table_info(native_mailboxes)")]
db.execute(
    "INSERT INTO outbound_attempts(mailbox_id,client_key,message_id,state) VALUES(?,?,?,?)",
    (box, "draft-unique-1234", "sent-local", "pending"),
)
duplicate = db.execute(
    "INSERT OR IGNORE INTO outbound_attempts(mailbox_id,client_key,message_id,state) VALUES(?,?,?,?)",
    (box, "draft-unique-1234", "not-sent-twice", "pending"),
)
assert duplicate.rowcount == 0
db.execute("UPDATE outbound_attempts SET state='accepted' WHERE mailbox_id=?", (box,))
assert db.execute(
    "SELECT state,message_id FROM outbound_attempts WHERE mailbox_id=?", (box,)
).fetchone() == ("accepted", "sent-local")

db.execute(
    "INSERT INTO mailbox_usage_rebuild(mailbox_id,usage_version,cursor) VALUES (?,?,?)",
    (box, 0, ""),
)
result = db.execute(
    "UPDATE mailbox_usage_rebuild SET cursor=? WHERE mailbox_id=? AND cursor=? AND usage_version=?",
    ("message-example", box, "", 0),
)
assert result.rowcount == 1
db.execute("UPDATE native_mailboxes SET usage_version=usage_version+1 WHERE id=?", (box,))
assert db.execute(
    "SELECT usage_version FROM native_mailboxes WHERE id=?", (box,)
).fetchone()[0] == 1

db.execute(
    "UPDATE native_mailboxes SET status='disabled',deleted_at=datetime('now'),purge_after=datetime('now','+30 days') WHERE id=?",
    (box,),
)
assert db.execute(
    "SELECT COUNT(*) FROM native_mailboxes WHERE id=? AND status='active'", (box,)
).fetchone()[0] == 0
assert db.execute(
    "SELECT COUNT(*) FROM native_mailboxes WHERE id=? AND purge_after>CURRENT_TIMESTAMP", (box,)
).fetchone()[0] == 1
print("PASS: staged deletion, idempotent sends, and R2 usage reconciliation schema")

# v2.01: sessions are bound to one browser and one explicitly signed-in account.
assert "device_nonce_hash" in [field[1] for field in db.execute("PRAGMA table_info(oauth_states)")]
assert "device_session_id" in [field[1] for field in db.execute("PRAGMA table_info(push_subscriptions)")]
assert "owner_session_hash" in [field[1] for field in db.execute("PRAGMA table_info(push_subscriptions)")]
assert db.execute("SELECT COUNT(*) FROM native_mailbox_credentials").fetchone()[0] == 0
db.execute("""INSERT INTO native_mailbox_credentials
    (mailbox_id,password_salt,password_hash,iterations) VALUES (?,?,?,?)""",
    (box, "test-salt-not-a-real-password", "test-hash", 310000))
db.execute("""INSERT INTO device_sessions
    (id,token_hash,expires_at) VALUES (?,?,datetime('now','+30 days'))""",
    ("device-one", "hash-one",))
db.execute("""INSERT INTO device_sessions
    (id,token_hash,expires_at) VALUES (?,?,datetime('now','+30 days'))""",
    ("device-two", "hash-two",))
db.execute("""INSERT INTO device_session_accounts
    (session_id,account_id,provider) VALUES (?,?,?)""",
    ("device-one", box, "native"))
assert db.execute("SELECT COUNT(*) FROM device_session_accounts WHERE session_id='device-one'").fetchone()[0] == 1
assert db.execute("SELECT COUNT(*) FROM device_session_accounts WHERE session_id='device-two'").fetchone()[0] == 0
db.execute("DELETE FROM device_sessions WHERE id='device-one'")
assert db.execute("SELECT COUNT(*) FROM device_session_accounts WHERE session_id='device-one'").fetchone()[0] == 0
db.execute("DELETE FROM native_mailbox_credentials WHERE mailbox_id=?", (box,))
assert db.execute("SELECT COUNT(*) FROM native_mailboxes WHERE id=?", (box,)).fetchone()[0] == 1
print("PASS: isolated per-device grants, schema and session cascade")
