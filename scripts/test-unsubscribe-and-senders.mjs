import assert from "node:assert/strict";
import { listUnsubscribeUrl, messageUnsubscribeUrl } from "../src/worker/email/unsubscribe.ts";
import { isNativeSenderAllowed, nativeSendBinding } from "../src/worker/providers/senderPolicy.ts";
import { sendViaEmailServiceApi } from "../src/worker/providers/emailServiceApi.ts";

assert.equal(listUnsubscribeUrl("<https://list.example.com/u?id=12>, <mailto:remove@example.com>"), "https://list.example.com/u?id=12");
assert.equal(listUnsubscribeUrl("<mailto:unsubscribe@example.com?subject=stop>"), "mailto:unsubscribe@example.com?subject=stop");
assert.equal(listUnsubscribeUrl("<mailto:unsubscribe@example.com>, <https://list.example.com/stop>"), "https://list.example.com/stop");
assert.equal(listUnsubscribeUrl("<javascript:alert(1)>"), null);
assert.equal(listUnsubscribeUrl("<http://example.com/unsubscribe>"), null);
assert.equal(listUnsubscribeUrl("<https://127.0.0.1/admin>"), null);
assert.equal(listUnsubscribeUrl("<https://localhost/admin>"), null);
assert.equal(listUnsubscribeUrl(null), null);
assert.equal(
  messageUnsubscribeUrl('<p><a href="https://list.example.com/unsubscribe?id=7&amp;email=a">Unsubscribe</a></p>', ""),
  "https://list.example.com/unsubscribe?id=7&email=a",
);
assert.equal(
  messageUnsubscribeUrl('<p>To unsubscribe, <a href="https://list.example.com/off">click here</a>.</p>', ""),
  "https://list.example.com/off",
);
assert.equal(
  messageUnsubscribeUrl('<a href="javascript:alert(1)">Unsubscribe</a>', ""), null,
);
assert.equal(
  messageUnsubscribeUrl('<a href="http://list.example.com/remove">Unsubscribe</a>', ""), null,
);
assert.equal(
  messageUnsubscribeUrl('<a href="https://example.com/pay">View invoice</a>', ""), null,
);
assert.equal(
  messageUnsubscribeUrl("", "To unsubscribe from emails:\\nhttps://list.example.com/remove?ref=1"),
  "https://list.example.com/remove?ref=1",
);
assert.equal(
  messageUnsubscribeUrl("", "Unsubscribe: mailto:remove@example.com?subject=unsubscribe"),
  "mailto:remove@example.com?subject=unsubscribe",
);
assert.equal(messageUnsubscribeUrl(null, "This message has no unsubscribe instructions."), null);

const env = { PRIMARY_ADDRESS: "contact@liamthemo.com" };
assert.equal(isNativeSenderAllowed(env, "contact@liamthemo.com"), true);
assert.equal(isNativeSenderAllowed(env, "new@liamthemo.com"), true);
assert.equal(isNativeSenderAllowed(env, "future@liamthemo.com"), true);
assert.equal(isNativeSenderAllowed(env, "admin@evil.com"), false);
assert.equal(isNativeSenderAllowed(env, "bad@evil.com@liamthemo.com"), false);
// Existing and future native mailboxes must not depend on REST credentials.
const secondaryBinding = { send: async () => ({ messageId: "mock-dynamic-id" }) };
const primaryBinding = { send: async () => ({ messageId: "mock-primary-id" }) };
const mockEnv = { EMAIL: primaryBinding, EMAIL_DYNAMIC: secondaryBinding };
assert.equal(nativeSendBinding(mockEnv, "native:secondary"), secondaryBinding);
assert.equal(nativeSendBinding(mockEnv, "native:another-new-mailbox"), secondaryBinding);
assert.equal(nativeSendBinding(mockEnv, "native:primary"), primaryBinding);
assert.equal(nativeSendBinding({ EMAIL: primaryBinding }, "native:secondary"), null);
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
