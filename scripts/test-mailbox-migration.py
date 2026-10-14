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
               (id,message_id,thread_id,direction,from_address,to_addresses,subject,received_at,is_read)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            ("message-original", "<existing@sender.test>", "thread-original", "inbound",
             "sender@test.com", '["contact@liamthemo.com"]', "existing", "2026-10-01", 1),
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

try:
    db.execute(
        """INSERT INTO messages
           (id,thread_id,direction,from_address,to_addresses,subject,received_at,
            mailbox_id,original_message_id)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        ("duplicate", "thread-example", "inbound", "sender@test.com",
         "[]", "duplicate", "2026-10-02", box, "<existing@sender.test>"),
    )
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("Duplicate deliveries to the same mailbox must be rejected")

print("PASS: legacy mailbox backfill, independent delivery, deduplication and uniqueness")

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
