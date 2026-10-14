import { mailboxById } from "./mailboxes";

type UsageRow = {
  mailbox_id: string;
  usage_version: number;
  cursor: string;
  total_bytes: number;
  missing_objects: number;
};
type MessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  raw_r2_key: string | null;
  body_text: string | null;
  body_html: string | null;
};

const encoder = new TextEncoder();
const sizeOf = (value: string | null) => value ? encoder.encode(value).byteLength : 0;

/**
 * Authenticated maintenance operation. Each call inspects up to 20 messages,
 * saving server-side progress in D1. Never trusts client-provided byte totals.
 * Concurrent new mail invalidates the reconciliation instead of overwriting it.
 */
export async function reconcileMailboxUsage(env: Env, id: string): Promise<Response> {
  const mailbox = await mailboxById(env, id);
  if (!mailbox || mailbox.deleted_at) {
    return Response.json({ error: "Active or disabled mailbox not found" }, { status: 404 });
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO mailbox_usage_rebuild(mailbox_id,usage_version) VALUES (?1,?2)"
  ).bind(id, mailbox.usage_version).run();
  const run = await env.DB.prepare(
    "SELECT mailbox_id,usage_version,cursor,total_bytes,missing_objects FROM mailbox_usage_rebuild WHERE mailbox_id=?1"
  ).bind(id).first<UsageRow>();
  if (!run) return Response.json({ error: "Usage calculation could not start" }, { status: 500 });
  if (run.usage_version !== mailbox.usage_version) {
    await env.DB.prepare("DELETE FROM mailbox_usage_rebuild WHERE mailbox_id=?1").bind(id).run();
    return Response.json({ error: "Mailbox changed while calculating usage. Retry the calculation." }, { status: 409 });
  }

  const messages = await env.DB.prepare(
    "SELECT id,direction,raw_r2_key,body_text,body_html FROM messages WHERE mailbox_id=?1 AND id>?2 ORDER BY id LIMIT 20"
  ).bind(id, run.cursor).all<MessageRow>();
  let bytes = 0;
  let missing = 0;
  for (const msg of messages.results) {
    if (msg.raw_r2_key) {
      const object = await env.MAIL.head(msg.raw_r2_key);
      if (object) bytes += object.size;
      else missing++;
    } else {
      // Outbound records and legacy messages without a MIME object live in D1.
      bytes += sizeOf(msg.body_text) + sizeOf(msg.body_html);
    }
    const attachments = await env.DB.prepare(
      "SELECT r2_key FROM attachments WHERE message_id=?1"
    ).bind(msg.id).all<{r2_key:string}>();
    for (const attachment of attachments.results) {
      const object = await env.MAIL.head(attachment.r2_key);
      if (object) bytes += object.size;
      else missing++;
    }
  }
  const cursor = messages.results.at(-1)?.id ?? run.cursor;
  const total = run.total_bytes + bytes;
  const missingTotal = run.missing_objects + missing;
  const saved = await env.DB.prepare(
    "UPDATE mailbox_usage_rebuild SET cursor=?3,total_bytes=?4,missing_objects=?5 WHERE mailbox_id=?1 AND cursor=?2 AND usage_version=?6"
  ).bind(id, run.cursor, cursor, total, missingTotal, run.usage_version).run();
  if (!saved.meta.changes) {
    return Response.json({ error: "Another reconciliation request is running" }, { status: 409 });
  }
  if (messages.results.length === 20) {
    return Response.json({ complete: false, countedBytes: total, missingObjects: missingTotal });
  }
  if (missingTotal > 0) {
    await env.DB.prepare("DELETE FROM mailbox_usage_rebuild WHERE mailbox_id=?1").bind(id).run();
    return Response.json({
      complete: true, applied: false, countedBytes: total, missingObjects: missingTotal,
      warning: "Missing R2 objects detected. Storage counter was not overwritten.",
    });
  }
  const updated = await env.DB.prepare(
    "UPDATE native_mailboxes SET used_bytes=?2 WHERE id=?1 AND usage_version=?3"
  ).bind(id, total, run.usage_version).run();
  await env.DB.prepare("DELETE FROM mailbox_usage_rebuild WHERE mailbox_id=?1").bind(id).run();
  if (!updated.meta.changes) {
    return Response.json({ error: "Mailbox changed before the counter could be applied. Retry." }, { status: 409 });
  }
  return Response.json({ complete: true, applied: true, countedBytes: total, missingObjects: 0 });
}
