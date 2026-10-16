import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminLoginAddress, isAdministratorEmail, passkeyRpId } from "../src/worker/config.ts";
import { normalizeMailboxAddress } from "../src/worker/mailboxRules.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const config = JSON.parse(read("wrangler.jsonc"));
assert.equal(config.name, "clayshot-pro-email-dev");
// Catch-all routing is managed in the Cloudflare dashboard. Omitting the
// property prevents Wrangler from attempting a destructive takeover during CI.
assert.equal(Object.hasOwn(config, "addresses"), false);

assert.equal(config.vars.PRIMARY_ADDRESS, "");
assert.equal(config.vars.ADMIN_LOGIN_ADDRESS, "admin@clayshotpro.com");
assert.deepEqual(config.send_email.map((sender) => sender.name), ["EMAIL_MULTI"]);
assert.match(read("src/worker/mailboxes.ts"), /count\?\.n === 0 \? PRIMARY_MAILBOX_ID/);
assert.match(read("src/worker/providers/registry.ts"), /const primary = await mailboxById\(env, NATIVE_ACCOUNT_ID\)/);
// Active, on-domain mailbox addresses can attempt Cloudflare sending automatically.
const registry = read("src/worker/providers/registry.ts");
assert.ok(registry.includes('sendEnabled: normalizeMailboxAddress(box.email_address, true) === box.email_address.trim().toLowerCase()'));
assert.doesNotMatch(registry, /MULTI_SENDER_APPROVED/);
const sendRoute = read("src/worker/email/send.ts");
assert.ok(sendRoute.includes('normalizeMailboxAddress(provider.address, true)'));
assert.doesNotMatch(sendRoute, /env.MULTI_SENDER_APPROVED/);
const composer = read("src/client/components/ComposeModal.tsx");
assert.match(composer, /const senderDisabled = currentSender.status !== "active"/);
assert.ok(composer.includes('role="alert">{sendError}'));
assert.doesNotMatch(composer, /sendEnabled === false/);
assert.ok(!composer.includes('contact@liamthemo.com'));
const client = read("src/client/App.tsx");
assert.ok(client.includes('sendError={composeError}'));
assert.ok(client.includes('setComposeError(message)'));
assert.ok(!config.send_email[0].allowed_sender_addresses, "Dynamic binding uses the onboarded sending domain");
assert.ok(!Object.hasOwn(config.vars, "MULTI_SENDER_APPROVED"));
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
assert.match(read("migrations/0016_remove_unused_default_mailbox.sql"), /DELETE FROM native_mailboxes/);
assert.match(read("migrations/0016_remove_unused_default_mailbox.sql"), /NOT EXISTS \(SELECT 1 FROM messages/);
for (const path of ["src/worker/mailboxRules.ts","src/worker/mailboxes.ts","src/worker/push.ts"]) {
  assert.doesNotMatch(read(path), /liamthemo\.com/);
}
console.log("PASS: Clayshot domain, admin identity, manual mailbox creation and WebAuthn origin");
