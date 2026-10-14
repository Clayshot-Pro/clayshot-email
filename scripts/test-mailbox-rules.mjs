import assert from "node:assert/strict";
import { normalizeMailboxAddress } from "../src/worker/mailboxRules.ts";
import { suspectedJunk } from "../src/worker/email/junk.ts";
import { mailboxPasswordError } from "../src/worker/mailboxPasswordPolicy.ts";

assert.equal(normalizeMailboxAddress(" Personal@LIAMTHEMO.COM "), "personal@liamthemo.com");
assert.equal(normalizeMailboxAddress("work"), "work@liamthemo.com");
assert.equal(normalizeMailboxAddress("work+receipts@liamthemo.com"), "work+receipts@liamthemo.com");
assert.equal(normalizeMailboxAddress("Admin@liamthemo.com"), null, "admin identity is reserved for MFA");
assert.equal(normalizeMailboxAddress("postmaster@liamthemo.com", true), "postmaster@liamthemo.com");
assert.equal(normalizeMailboxAddress("abuse@liamthemo.com", true), "abuse@liamthemo.com");
for (const invalid of ["", "other@gmail.com", "account@liamthemo.com.evil", "../test", "x..y", "postmaster", "abuse", "@liamthemo.com"]) {
  assert.equal(normalizeMailboxAddress(invalid), null, invalid);
}
assert.equal(suspectedJunk("Upcoming meeting notes", "noreply@university.ca", "Agenda attached"), false);
assert.equal(suspectedJunk("Lottery winner!!!", "unknown@contest.test", "Click here to claim"), true);
assert.equal(suspectedJunk("Urgent schedule change", "professor@university.ca", "Please see the course schedule"), false);
console.log("PASS: address normalization and conservative Junk classification");

assert.equal(mailboxPasswordError("correct-horse-battery-staple-2026"),null);
assert.match(mailboxPasswordError("short")??"",/at least 16/);
assert.match(mailboxPasswordError("z".repeat(20))??"",/repetitive/);
assert.match(mailboxPasswordError("password-with-newline"+String.fromCharCode(10)+"2026")??"",/control/);
console.log("PASS: admin login address reserved and custom password policy validated");
