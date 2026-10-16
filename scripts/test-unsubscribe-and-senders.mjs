import assert from "node:assert/strict";
import { listUnsubscribeUrl } from "../src/worker/email/unsubscribe.ts";
import { isNativeSenderAllowed, nativeSendTransportReady } from "../src/worker/providers/senderPolicy.ts";
import { sendViaEmailServiceApi } from "../src/worker/providers/emailServiceApi.ts";

assert.equal(listUnsubscribeUrl("<https://list.example.com/u?id=12>, <mailto:remove@example.com>"), "https://list.example.com/u?id=12");
assert.equal(listUnsubscribeUrl("<mailto:unsubscribe@example.com?subject=stop>"), "mailto:unsubscribe@example.com?subject=stop");
assert.equal(listUnsubscribeUrl("<mailto:unsubscribe@example.com>, <https://list.example.com/stop>"), "https://list.example.com/stop");
assert.equal(listUnsubscribeUrl("<javascript:alert(1)>"), null);
assert.equal(listUnsubscribeUrl("<http://example.com/unsubscribe>"), null);
assert.equal(listUnsubscribeUrl("<https://127.0.0.1/admin>"), null);
assert.equal(listUnsubscribeUrl("<https://localhost/admin>"), null);
assert.equal(listUnsubscribeUrl(null), null);

const env = { PRIMARY_ADDRESS: "contact@liamthemo.com" };
assert.equal(isNativeSenderAllowed(env, "contact@liamthemo.com"), true);
assert.equal(isNativeSenderAllowed(env, "new@liamthemo.com"), true);
assert.equal(isNativeSenderAllowed(env, "future@liamthemo.com"), true);
assert.equal(isNativeSenderAllowed(env, "admin@evil.com"), false);
assert.equal(isNativeSenderAllowed(env, "bad@evil.com@liamthemo.com"), false);
assert.equal(nativeSendTransportReady({}, true), true);
assert.equal(nativeSendTransportReady({}, false), false);
assert.equal(nativeSendTransportReady({ CF_EMAIL_SENDING_ACCOUNT_ID: "a".repeat(32), CF_EMAIL_SENDING_TOKEN: "private" }, false), true);

const accountId = "a".repeat(32);
const secret = "test-secret-private";
const creds = { CF_EMAIL_SENDING_ACCOUNT_ID: accountId, CF_EMAIL_SENDING_TOKEN: secret };
const input = {
  to: ["recipient@example.org"], cc: [], bcc: [], subject: "Hello",
  text: "Text & <markup>", headers: { "In-Reply-To": "<msg@example.org>" },
  attachments: [{ filename: "a.txt", type: "text/plain", content: new TextEncoder().encode("one").buffer }],
};
const originalFetch = globalThis.fetch;
try {
  let captured = null;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({ success: true, result: { delivered: ["recipient@example.org"], queued: [], permanent_bounces: [] } });
  };
  const accepted = await sendViaEmailServiceApi(creds, "new@liamthemo.com", "New Mailbox", input);
  assert.deepEqual(accepted, { providerMessageId: null });
  assert.equal(captured.url, `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`);
  assert.equal(captured.init.headers.Authorization, `Bearer ${secret}`);
  const payload = JSON.parse(captured.init.body);
  assert.equal(payload.from.address, "new@liamthemo.com");
  assert.equal(payload.from.name, "New Mailbox");
  assert.equal(payload.reply_to, "new@liamthemo.com");
  assert.equal(payload.attachments[0].content, "b25l");
  assert.ok(payload.html.includes("&amp;"));
  assert.equal(payload.headers["In-Reply-To"], "<msg@example.org>");

  globalThis.fetch = async () => Response.json({ success: false, errors: [{ code: 10105 }] }, { status: 403 });
  await assert.rejects(sendViaEmailServiceApi(creds, "new@liamthemo.com", "N", input),
    (error) => error.code === "E_EMAIL_SERVICE_NOT_ENTITLED");
  await assert.rejects(sendViaEmailServiceApi({ ...creds, CF_EMAIL_SENDING_TOKEN: undefined }, "new@liamthemo.com", "N", input),
    (error) => error.code === "E_EMAIL_API_NOT_CONFIGURED");
  globalThis.fetch = async () => Response.json({ success: true, result: { delivered: [], queued: [], permanent_bounces: ["recipient@example.org"] } });
  await assert.rejects(sendViaEmailServiceApi(creds, "new@liamthemo.com", "N", input),
    (error) => error.code === "E_DELIVERY_FAILED");
} finally {
  globalThis.fetch = originalFetch;
}
console.log("Unsubscribe and automatic native sending regressions: passed");
