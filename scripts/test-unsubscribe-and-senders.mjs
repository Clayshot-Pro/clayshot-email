import assert from "node:assert/strict";
import { listUnsubscribeUrl } from "../src/worker/email/unsubscribe.ts";
import { isNativeSenderAllowed } from "../src/worker/providers/senderPolicy.ts";

assert.equal(listUnsubscribeUrl("<https://list.example.com/u?id=12>, <mailto:remove@example.com>"), "https://list.example.com/u?id=12");
assert.equal(listUnsubscribeUrl("<mailto:unsubscribe@example.com?subject=stop>"), "mailto:unsubscribe@example.com?subject=stop");
assert.equal(listUnsubscribeUrl("<javascript:alert(1)>"), null);
assert.equal(listUnsubscribeUrl("<http://example.com/unsubscribe>"), null);
assert.equal(listUnsubscribeUrl("<https://127.0.0.1/admin>"), null);
assert.equal(listUnsubscribeUrl("<https://localhost/admin>"), null);
assert.equal(listUnsubscribeUrl("<https://admin:secret@example.com/u>"), null);
assert.equal(listUnsubscribeUrl("<https://example.com:8443/u>"), null);
assert.equal(listUnsubscribeUrl("<mailto:remove@example.com?subject=%0d%0aBcc:other@example.com>"), null);
assert.equal(listUnsubscribeUrl(null), null);

const env = { PRIMARY_ADDRESS: "contact@liamthemo.com", CUSTOM_SENDER_ALLOWLIST: "contact@example.org, info@example.net" };
assert.equal(isNativeSenderAllowed(env, "contact@liamthemo.com"), true);
assert.equal(isNativeSenderAllowed(env, "Info@Example.Net"), true);
assert.equal(isNativeSenderAllowed(env, "sales@example.net"), false);
assert.equal(isNativeSenderAllowed({ PRIMARY_ADDRESS: env.PRIMARY_ADDRESS }, "contact@example.org"), false);
console.log("Unsubscribe URL filtering and sender allowlist regression: passed");
