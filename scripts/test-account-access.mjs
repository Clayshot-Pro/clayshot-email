import assert from "node:assert/strict";
import { requestedMailAccount, protectedAccountPath } from "../src/worker/accountAccess.ts";

const destination = "https://email.liamthemo.com";
const allowed = "native:allowed";
const forbidden = "native:unrelated";

function sent(accountId, query) {
  const form = new FormData();
  form.set("accountId", accountId);
  form.set("to", "person@example.com");
  const url = new URL("/api/send" + (query ? "?accountId=" + encodeURIComponent(query) : ""), destination);
  return { request: new Request(url, { method:"POST", body: form }), url };
}
function draft(accountId, query) {
  const url = new URL("/api/drafts" + (query ? "?accountId=" + encodeURIComponent(query) : ""), destination);
  return { request: new Request(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ accountId }) }),url };
}
const spoofSend=sent(forbidden,allowed);
assert.deepEqual(await requestedMailAccount(spoofSend.request,spoofSend.url),{
  accountId:null,error:"Conflicting account IDs",
});
const spoofDraft=draft(forbidden,allowed);
assert.deepEqual(await requestedMailAccount(spoofDraft.request,spoofDraft.url),{
  accountId:null,error:"Conflicting account IDs",
});
for(const input of [sent(forbidden),draft(forbidden)]) {
  const resolved=await requestedMailAccount(input.request,input.url);
  assert.equal(resolved.accountId,forbidden,"the actual body mailbox is authoritative");
}
for(const input of [sent(allowed,allowed),draft(allowed,allowed)]) {
  const resolved=await requestedMailAccount(input.request,input.url);
  assert.equal(resolved.accountId,allowed);
  assert.equal(resolved.error,undefined);
}
const read=new URL("/api/messages/one?accountId="+encodeURIComponent(allowed),destination);
assert.deepEqual(await requestedMailAccount(new Request(read),read),{accountId:allowed});
assert.equal(protectedAccountPath("/api/contact-avatar"),true,"Gmail contacts must be account-gated");
assert.equal(protectedAccountPath("/api/attachments/one"),true);
assert.equal(protectedAccountPath("/api/attachment-previews/one"),true);
assert.equal(protectedAccountPath("/api/send"),true);
assert.equal(protectedAccountPath("/api/mailboxes"),false);
assert.equal(protectedAccountPath("/api/accounts"),false);
const invalidForm=new URL("/api/send?accountId="+encodeURIComponent(allowed),destination);
const malformed=await requestedMailAccount(new Request(invalidForm,{method:"POST",body:"not-formdata"}),invalidForm);
assert.equal(malformed.accountId,null,"a query cannot authorize a malformed email body");
const missing=new URL("/api/drafts?accountId="+encodeURIComponent(allowed),destination);
const invalidDraft=await requestedMailAccount(new Request(missing,{method:"POST",body:"{bad"}),missing);
assert.equal(invalidDraft.accountId,null,"a query cannot authorize a malformed draft body");
console.log("PASS: sender/draft body-account isolation and contact-avatar authorization guard");
