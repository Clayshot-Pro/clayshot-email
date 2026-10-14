import assert from "node:assert/strict";
import { normalizeMailboxAddress } from "../src/worker/mailboxRules.ts";
import { suspectedJunk } from "../src/worker/email/junk.ts";

assert.equal(normalizeMailboxAddress(" Personal@LIAMTHEMO.COM "), "personal@liamthemo.com");
assert.equal(normalizeMailboxAddress("work"), "work@liamthemo.com");
assert.equal(normalizeMailboxAddress("work+receipts@liamthemo.com"), "work+receipts@liamthemo.com");
assert.equal(normalizeMailboxAddress("Admin@liamthemo.com"), "admin@liamthemo.com");
assert.equal(normalizeMailboxAddress("postmaster@liamthemo.com", true), "postmaster@liamthemo.com");
assert.equal(normalizeMailboxAddress("abuse@liamthemo.com", true), "abuse@liamthemo.com");
for (const invalid of ["", "other@gmail.com", "account@liamthemo.com.evil", "../test", "x..y", "postmaster", "abuse", "@liamthemo.com"]) {
  assert.equal(normalizeMailboxAddress(invalid), null, invalid);
}
assert.equal(suspectedJunk("Upcoming meeting notes", "noreply@university.ca", "Agenda attached"), false);
assert.equal(suspectedJunk("Lottery winner!!!", "unknown@contest.test", "Click here to claim"), true);
assert.equal(suspectedJunk("Urgent schedule change", "professor@university.ca", "Please see the course schedule"), false);
console.log("PASS: address normalization and conservative Junk classification");
