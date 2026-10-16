import assert from "node:assert/strict";
import { normalizeMailboxAddress } from "../src/worker/mailboxRules.ts";
import { suspectedJunk } from "../src/worker/email/junk.ts";
import { adminPasswordError, mailboxPasswordError } from "../src/worker/mailboxPasswordPolicy.ts";

assert.equal(normalizeMailboxAddress(" Personal@CLAYSHOTPRO.COM "), "personal@clayshotpro.com");
assert.equal(normalizeMailboxAddress("work"), "work@clayshotpro.com");
assert.equal(normalizeMailboxAddress("work+receipts@clayshotpro.com"), "work+receipts@clayshotpro.com");
assert.equal(normalizeMailboxAddress("Admin@clayshotpro.com"), null, "admin identity is reserved for MFA");
assert.equal(normalizeMailboxAddress("postmaster@clayshotpro.com", true), "postmaster@clayshotpro.com");
assert.equal(normalizeMailboxAddress("abuse@clayshotpro.com", true), "abuse@clayshotpro.com");
for (const invalid of ["", "other@gmail.com", "account@clayshotpro.com.evil", "../test", "x..y", "postmaster", "abuse", "@clayshotpro.com"]) {
  assert.equal(normalizeMailboxAddress(invalid), null, invalid);
}
assert.equal(suspectedJunk("Upcoming meeting notes", "noreply@university.ca", "Agenda attached"), false);
assert.equal(suspectedJunk("Lottery winner!!!", "unknown@contest.test", "Click here to claim"), true);
assert.equal(suspectedJunk("Urgent schedule change", "professor@university.ca", "Please see the course schedule"), false);
console.log("PASS: address normalization and conservative Junk classification");

assert.equal(mailboxPasswordError("correct-horse-battery-staple-2026"),null);
assert.equal(mailboxPasswordError("Ab1!"), null);
assert.match(mailboxPasswordError("Ab!") ?? "", /at least 4/);
assert.match(mailboxPasswordError("X".repeat(33)) ?? "", /at most 32/);
assert.match(mailboxPasswordError("z".repeat(20))??"",/repetitive/);
assert.match(mailboxPasswordError("password-with-newline"+String.fromCharCode(10)+"2026")??"",/control/);
console.log("PASS: admin login address reserved and custom password policy validated");

assert.equal(adminPasswordError("Abcd?789"),null);
assert.equal(adminPasswordError("Ab1!"), null);
assert.match(adminPasswordError("Ab!") ?? "", /at least 4/);
assert.match(adminPasswordError("X".repeat(33))??"",/at most 32/);
