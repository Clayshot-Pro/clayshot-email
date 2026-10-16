import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeMailboxAddress } from "../src/worker/mailboxRules.ts";
import { suspectedJunk } from "../src/worker/email/junk.ts";
import { adminPasswordError, mailboxPasswordError } from "../src/worker/mailboxPasswordPolicy.ts";

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

assert.equal(mailboxPasswordError("correct-horse-battery-2026"),null);
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

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
assert.match(source("src/worker/mailboxes.ts"), /crypto\.getRandomValues\(new Uint8Array\(24\)\)/);
assert.match(source("src/worker/deviceAuth.ts"), /rotateMailboxPassword[\s\S]*?new Uint8Array\(24\)/);
console.log("PASS: generated mailbox passwords remain within 4–32 characters");
