import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminLoginAddress, isAdministratorEmail, passkeyRpId } from "../src/worker/config.ts";
import { normalizeMailboxAddress } from "../src/worker/mailboxRules.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const config = JSON.parse(read("wrangler.jsonc"));
assert.equal(config.name, "clayshot-pro-email-dev");
assert.deepEqual(config.addresses, ["*@clayshotpro.com"]);
assert.equal(config.vars.PRIMARY_ADDRESS, "contact@clayshotpro.com");
assert.equal(config.vars.ADMIN_LOGIN_ADDRESS, "admin@clayshotpro.com");
assert.deepEqual(config.send_email[0].allowed_sender_addresses, ["contact@clayshotpro.com"]);
assert.equal(config.d1_databases[0].binding, "DB");
assert.equal(config.r2_buckets[0].binding, "MAIL");
const req = new Request("https://email.clayshot-dev.com/api/auth/login/options");
assert.equal(passkeyRpId(req), "email.clayshot-dev.com");
assert.equal(adminLoginAddress(req, config.vars.ADMIN_LOGIN_ADDRESS), "admin@clayshotpro.com");
assert.equal(isAdministratorEmail(req, "admin@clayshotpro.com", config.vars.PRIMARY_ADDRESS, config.vars.ADMIN_LOGIN_ADDRESS), true);
assert.equal(isAdministratorEmail(req, "admin@email.clayshot-dev.com", config.vars.PRIMARY_ADDRESS, config.vars.ADMIN_LOGIN_ADDRESS), false);
assert.equal(normalizeMailboxAddress("help@clayshotpro.com"), "help@clayshotpro.com");
assert.equal(normalizeMailboxAddress("help@liamthemo.com"), null);
const worker = read("src/worker/index.ts");
assert.match(worker, /async email\(message, env, ctx\)/);
assert.match(worker, /await receiveEmail\(message, env, ctx\)/);
assert.match(read("migrations/0010_native_mailboxes.sql"), /contact@clayshotpro\.com/);
for (const path of ["src/worker/mailboxRules.ts","src/worker/mailboxes.ts","src/worker/push.ts"]) {
  assert.doesNotMatch(read(path), /liamthemo\.com/);
}
console.log("PASS: Clayshot email routing, mailbox data, admin identity and WebAuthn origin");
