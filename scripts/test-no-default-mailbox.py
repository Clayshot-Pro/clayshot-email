#!/usr/bin/env python3
"""Verify new D1 installations start with zero inboxes and old user data survives."""
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted((ROOT / "migrations").glob("*.sql"))

def database():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    return db

fresh = database()
for sql in MIGRATIONS:
    fresh.executescript(sql.read_text(encoding="utf-8"))
assert fresh.execute("SELECT COUNT(*) FROM native_mailboxes").fetchone()[0] == 0
assert fresh.execute("SELECT COUNT(*) FROM connected_accounts WHERE provider='native'").fetchone()[0] == 0
assert fresh.execute("SELECT COUNT(*) FROM auth_credentials").fetchone()[0] == 0
print("PASS: fresh D1 has zero mailboxes and can begin administrator setup")

retained = database()
for sql in MIGRATIONS:
    if sql.name == "0016_remove_unused_default_mailbox.sql":
        # Existing sender history must prevent automatic deletion.
        retained.execute(
            "INSERT INTO threads (id,subject,latest_message_at,mailbox_id) VALUES (?,?,?,?)",
            ("t-original", "original", "2026-10-15", "native:primary"),
        )
        retained.execute(
            "INSERT INTO messages (id,thread_id,direction,from_address,subject,received_at,mailbox_id) "
            "VALUES (?,?,?,?,?,?,?)",
            ("m-original", "t-original", "inbound", "sender@example.net", "important", "2026-10-15", "native:primary"),
        )
    retained.executescript(sql.read_text(encoding="utf-8"))
assert retained.execute(
    "SELECT email_address FROM native_mailboxes WHERE id='native:primary'"
).fetchone() == ("contact@clayshotpro.com",)
assert retained.execute("SELECT COUNT(*) FROM messages WHERE id='m-original'").fetchone()[0] == 1
print("PASS: existing mailbox with real message history preserved")
