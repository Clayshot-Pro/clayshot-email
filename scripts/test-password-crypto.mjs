import assert from "node:assert/strict";
import { preparePassword, checkPassword, hashPassword } from "../src/worker/passwordCrypto.ts";
import { mailboxPasswordError } from "../src/worker/mailboxPasswordPolicy.ts";

// Exercise the actual Cloudflare Worker PBKDF2 path under Node Web Crypto.
// Punctuation and Unicode are legal password characters; they are never
// interpolated into SQL, URLs or regular expressions.
for (const password of [
  "Complex?Password#2026!",
  "P@ssword?+[]{}~LongEnough",
  "Unicode?🌞-Password-Long-2026",
]) {
  assert.equal(mailboxPasswordError(password), null);
  const prepared = await preparePassword(password);
  assert.equal(prepared.iterations, 310000);
  assert.equal(prepared.salt.length, 32);
  assert.match(prepared.salt, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(await checkPassword(password, {
    password_salt: prepared.salt,
    password_hash: prepared.hash,
    iterations: prepared.iterations,
  }), true);
  assert.equal(await checkPassword(password + "?", {
    password_salt: prepared.salt,
    password_hash: prepared.hash,
    iterations: prepared.iterations,
  }), false);
  assert.equal(await hashPassword(password, prepared.salt, prepared.iterations), prepared.hash);
}
console.log("PASS: special-character passwords hash and verify using Web Crypto");
