import assert from "node:assert/strict";
import {
  MAIL_MUTATION_SHIELD_MS, applyMailMutationShields, mailMutationKey,
} from "../src/client/mailMutationShields.ts";
import { gmailMatchesFolder } from "../src/worker/providers/gmailFolder.ts";

const message = {
  id: "message-a", threadId: "conversation-1", direction: "inbound",
  fromAddress: "sender@example.test", fromName: null, toAddresses: [],
  subject: "Test", preview: "", receivedAt: new Date().toISOString(),
  sentAt: null, isRead: false, isStarred: false, isArchived: false,
  isDeleted: false, isJunk: false, hasAttachments: false,
  deliveryStatus: null, isDraft: false,
};
const olderReply = { ...message, id: "message-b" };
const account = "native:primary";
const now = Date.now();
const tKey = mailMutationKey(account, message.threadId, "thread");
const mKey = mailMutationKey(account, message.id);

{
  const guard = new Map([[tKey, { flags: {isDeleted:true}, updatedAt: now }]]);
  // A pre-delete GET may arrive AFTER successful PATCH; neither the selected
  // row nor a different message in the same collapsed thread can reappear.
  assert.deepEqual(applyMailMutationShields("inbox", account, [message, olderReply], guard, now), []);
  assert.equal(applyMailMutationShields("trash", account,
    [{...message,isDeleted:true}], guard, now).length, 1);
  assert.equal(applyMailMutationShields("inbox", "native:other", [message], guard, now).length, 1);
  assert.equal(applyMailMutationShields("inbox", account, [message], guard,
    now + MAIL_MUTATION_SHIELD_MS).length, 1);
  assert.equal(guard.size, 0, "expired mutation guards are released");
}
{
  const guard = new Map([[mKey, {flags:{isDeleted:true},updatedAt:now}]]);
  assert.deepEqual(applyMailMutationShields("inbox",account,[message],guard,now),[]);
  assert.equal(applyMailMutationShields("inbox",account,[olderReply],guard,now).length,1);
}
{
  const guard = new Map([[mKey, {flags:{isDeleted:false},updatedAt:now}]]);
  assert.deepEqual(applyMailMutationShields("trash",account,[{...message,isDeleted:true}],guard,now),[]);
}
{
  const guard = new Map([[mKey,{flags:{},hide:true,updatedAt:now}]]);
  assert.deepEqual(applyMailMutationShields("trash",account,[message],guard,now),[]);
}
{
  const guard = new Map([[mKey,{flags:{isRead:true},updatedAt:now}]]);
  assert.equal(applyMailMutationShields("inbox",account,[message],guard,now)[0].isRead,true);
}
{
  const guard = new Map([[mKey,{flags:{isArchived:true},updatedAt:now}]]);
  assert.deepEqual(applyMailMutationShields("inbox",account,[message],guard,now),[]);
}
assert.equal(gmailMatchesFolder(["INBOX", "UNREAD"], "inbox"), true);
assert.equal(gmailMatchesFolder(["TRASH"], "inbox"), false, "stale Gmail search results must be suppressed");
assert.equal(gmailMatchesFolder(["TRASH"], "trash"), true);
assert.equal(gmailMatchesFolder(["INBOX"], "trash"), false);
assert.equal(gmailMatchesFolder(["SPAM"], "junk"), true);
assert.equal(gmailMatchesFolder(["SPAM"], "inbox"), false);
assert.equal(gmailMatchesFolder(["STARRED"], "starred"), true);
assert.equal(gmailMatchesFolder(["SENT"], "archive"), false);
assert.equal(gmailMatchesFolder(["CATEGORY_UPDATES"], "archive"), true);
assert.equal(gmailMatchesFolder(undefined, "inbox"), false);
console.log("Mailbox mutation race and Gmail label regressions passed.");
