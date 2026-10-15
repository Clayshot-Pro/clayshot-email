import assert from "node:assert/strict";
import { preparePassword, checkPassword, hashPassword } from "../src/worker/passwordCrypto.ts";
import { adminPasswordError, mailboxPasswordError } from "../src/worker/mailboxPasswordPolicy.ts";

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

for (const password of ["Abcd?789", "LongAdmin?Password2026!", "𝒜bc?1234"]) {
  assert.equal(adminPasswordError(password), null, "admin password accepted");
  const prepared = await preparePassword(password,"admin");
  assert.equal(prepared.iterations,310000);
  assert.equal(await checkPassword(password,{
    password_salt:prepared.salt,
    password_hash:prepared.hash,
    iterations:prepared.iterations,
  }),true);
}
for (const password of ["short?", "a".repeat(33), "abcdefgh".slice(0,7)]) {
  assert.notEqual(adminPasswordError(password),null);
}
assert.equal(adminPasswordError("Abcd?789"),null);
assert.notEqual(mailboxPasswordError("Abcd?789"),null, "mailbox policy remains 16+ characters");
const legacyPassword = "LegacyAccount?Password2026";
const legacy = await preparePassword(legacyPassword);
const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(legacyPassword),"PBKDF2",false,["deriveBits"]);
const legacySalt = Uint8Array.from(atob(legacy.salt.replace(/-/g,"+").replace(/_/g,"/")),x=>x.charCodeAt(0));
const bits = await crypto.subtle.deriveBits({name:"PBKDF2",salt:legacySalt,hash:"SHA-256",iterations:310000},key,256);
const webCryptoHash = btoa(String.fromCharCode(...new Uint8Array(bits))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
assert.equal(legacy.hash,webCryptoHash,"node:crypto KDF preserves legacy PBKDF2-SHA256");
console.log("PASS: Cloudflare compatible crypto, admin 8–32 length and legacy hashes");
