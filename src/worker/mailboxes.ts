/**
 * Native mailboxes are addresses managed by the single existing passkey owner.
 * They are not distinct web-app login identities or SMTP accounts.
 */
export const PRIMARY_MAILBOX_ID = "native:primary";
const DOMAIN = "liamthemo.com";
const MAX_MAILBOXES = 100;
const RESERVED = new Set(["postmaster", "abuse", "mailer-daemon", "root", "admin"]);

export type NativeMailbox = {
  id: string;
  email_address: string;
  display_name: string;
  status: "active" | "disabled";
  quota_bytes: number;
  used_bytes: number;
  deleted_at: string | null;
  purge_after: string | null;
  spam_filter_enabled: number;
  usage_version: number;
  forwarded_to: string | null;
};

export function normalizeMailboxAddress(value: string): string | null {
  const address = value.trim().toLowerCase();
  const at = address.indexOf("@");
  const local = at >= 0 ? address.slice(0, at) : address;
  const domain = at >= 0 ? address.slice(at + 1) : DOMAIN;
  if (domain !== DOMAIN || local.length < 1 || local.length > 64
    || !/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?$/.test(local)
    || local.includes("..") || RESERVED.has(local)
    || address.length > 254) return null;
  return `${local}@${DOMAIN}`;
}

export async function mailboxById(env: Env, id: string): Promise<NativeMailbox | null> {
  return env.DB.prepare(
    "SELECT id, email_address, display_name, status, quota_bytes, used_bytes, deleted_at, purge_after, forwarded_to, spam_filter_enabled, usage_version FROM native_mailboxes WHERE id = ?1"
  ).bind(id).first<NativeMailbox>();
}

export async function mailboxForRecipient(env: Env, address: string): Promise<NativeMailbox | null> {
  const normalized = normalizeMailboxAddress(address);
  if (!normalized) return null;
  // Incoming routing rejects disabled and unknown recipients rather than silently storing them.
  return env.DB.prepare(
    "SELECT id, email_address, display_name, status, quota_bytes, used_bytes, deleted_at, purge_after, forwarded_to, spam_filter_enabled, usage_version FROM native_mailboxes WHERE email_address = ?1 AND status = 'active'"
  ).bind(normalized).first<NativeMailbox>();
}

export async function allNativeMailboxes(env: Env): Promise<NativeMailbox[]> {
  const result = await env.DB.prepare(
    "SELECT id, email_address, display_name, status, quota_bytes, used_bytes, deleted_at, purge_after, forwarded_to, spam_filter_enabled, usage_version FROM native_mailboxes ORDER BY CASE WHEN id='native:primary' THEN 0 ELSE 1 END, created_at"
  ).all<NativeMailbox>();
  return result.results;
}

export async function createNativeMailbox(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ address?: unknown; displayName?: unknown }>().catch(() => null);
  const address = typeof body?.address === "string" ? normalizeMailboxAddress(body.address) : null;
  if (!address) return Response.json({ error: "Use an address under liamthemo.com with valid characters" }, { status: 400 });
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 80) : "";
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM native_mailboxes").first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_MAILBOXES) return Response.json({ error: "Mailbox limit reached" }, { status: 409 });
  const id = `native:${crypto.randomUUID()}`;
  try {
    // The single INSERT is the source of truth; no separate provider row is necessary.
    await env.DB.prepare("INSERT INTO native_mailboxes (id,email_address,display_name) VALUES (?1,?2,?3)")
      .bind(id, address, displayName).run();
  } catch {
    return Response.json({ error: "Mailbox already exists or could not be created" }, { status: 409 });
  }
  await audit(env, id, "create");
  return Response.json({ mailbox: await mailboxById(env, id) }, { status: 201 });
}


async function audit(env: Env, id: string, action: string) {
  await env.DB.prepare("INSERT INTO mailbox_audit (id,mailbox_id,operation) VALUES (?1,?2,?3)")
    .bind(crypto.randomUUID(), id, action).run();
}

export async function updateNativeMailbox(request: Request, env: Env, id: string): Promise<Response> {
  const body = await request.json<{ status?: unknown; displayName?: unknown; quotaBytes?: unknown; spamFilterEnabled?: unknown }>().catch(() => null);
  if (!body || (body.status !== undefined && body.status !== "active" && body.status !== "disabled")
    || (body.displayName !== undefined && typeof body.displayName !== "string")
    || (body.quotaBytes !== undefined && (!Number.isSafeInteger(body.quotaBytes) || Number(body.quotaBytes) < 10485760 || Number(body.quotaBytes) > 10737418240))
    || (body.spamFilterEnabled !== undefined && typeof body.spamFilterEnabled !== "boolean"))
    return Response.json({ error: "Invalid mailbox update" }, { status: 400 });
  if (body.status === undefined && body.displayName === undefined && body.quotaBytes === undefined && body.spamFilterEnabled === undefined)
    return Response.json({ error: "No changes requested" }, { status: 400 });
  if (id === PRIMARY_MAILBOX_ID && body.status === "disabled")
    return Response.json({ error: "Primary mailbox cannot be disabled" }, { status: 403 });
  const old = await mailboxById(env, id);
  if (!old) return Response.json({ error: "Mailbox not found" }, { status: 404 });
  if (old.deleted_at) return Response.json({ error: "Restore the mailbox before editing" }, { status: 409 });
  const status = body.status === "active" || body.status === "disabled" ? body.status : old.status;
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 80) : old.display_name;
  const quota = typeof body.quotaBytes === "number" ? body.quotaBytes : old.quota_bytes;
  const spam = typeof body.spamFilterEnabled === "boolean" ? Number(body.spamFilterEnabled) : old.spam_filter_enabled;
  await env.DB.prepare("UPDATE native_mailboxes SET status=?2, display_name=?3, quota_bytes=?4, spam_filter_enabled=?5, updated_at=CURRENT_TIMESTAMP WHERE id=?1")
    .bind(id, status, displayName, quota, spam).run();
  await audit(env, id, "update");
  return Response.json({ mailbox: await mailboxById(env, id) });
}

export async function scheduleNativeMailboxDeletion(env: Env, id: string): Promise<Response> {
  if (id === PRIMARY_MAILBOX_ID) return Response.json({ error: "Primary mailbox cannot be deleted" }, { status: 403 });
  const old = await mailboxById(env, id);
  if (!old) return Response.json({ error: "Mailbox not found" }, { status: 404 });
  if (!old.deleted_at) {
    await env.DB.prepare("UPDATE native_mailboxes SET status='disabled', deleted_at=CURRENT_TIMESTAMP, purge_after=datetime('now','+30 days'), updated_at=CURRENT_TIMESTAMP WHERE id=?1")
      .bind(id).run();
    await audit(env, id, "schedule_deletion");
  }
  return Response.json({ mailbox: await mailboxById(env, id), retentionDays: 30 });
}

export async function restoreNativeMailbox(env: Env, id: string): Promise<Response> {
  const old = await mailboxById(env, id);
  if (!old || !old.deleted_at) return Response.json({ error: "Mailbox not pending deletion" }, { status: 404 });
  const eligible = await env.DB.prepare("SELECT 1 AS eligible FROM native_mailboxes WHERE id=?1 AND purge_after > CURRENT_TIMESTAMP").bind(id).first();
  if (!eligible) return Response.json({ error: "Recovery period expired; restore is unavailable" }, { status: 409 });
  await env.DB.prepare("UPDATE native_mailboxes SET status='active', deleted_at=NULL, purge_after=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?1")
    .bind(id).run();
  await audit(env, id, "restore");
  return Response.json({ mailbox: await mailboxById(env, id) });
}

// Irreversible cleanup is deliberately paged so an interrupted request can be
// retried. Storage objects are deleted before DB references; restore must not be
// offered after the grace period until purge has completed.
export async function purgeNativeMailbox(env: Env, id: string): Promise<Response> {
  if (id === PRIMARY_MAILBOX_ID) return Response.json({ error: "Primary mailbox cannot be purged" }, { status: 403 });
  const box = await mailboxById(env, id);
  if (!box?.deleted_at || !box.purge_after) return Response.json({ error: "Mailbox not pending deletion" }, { status: 409 });
  const ready = await env.DB.prepare("SELECT 1 AS ready FROM native_mailboxes WHERE id=?1 AND purge_after <= CURRENT_TIMESTAMP")
    .bind(id).first<{ready: number}>();
  if (!ready) return Response.json({ error: "30-day recovery period has not elapsed" }, { status: 409 });
  const batch = await env.DB.prepare("SELECT id,raw_r2_key FROM messages WHERE mailbox_id=?1 LIMIT 50")
    .bind(id).all<{id:string; raw_r2_key:string|null}>();
  if (batch.results.length) {
    const ids = batch.results.map(row => row.id);
    const files = await env.DB.prepare(`SELECT r2_key FROM attachments WHERE message_id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids).all<{r2_key:string}>();
    const keys = [...batch.results.map(row => row.raw_r2_key).filter((key):key is string => Boolean(key)),...files.results.map(row => row.r2_key)];
    if (keys.length) await env.MAIL.delete(keys);
    await env.DB.prepare(`DELETE FROM messages WHERE id IN (${ids.map(() => "?").join(",")}) AND mailbox_id=?`)
      .bind(...ids,id).run();
    return Response.json({ complete: false, remaining: true, removed: ids.length });
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM drafts WHERE mailbox_id=?1").bind(id),
    env.DB.prepare("DELETE FROM threads WHERE mailbox_id=?1").bind(id),
    env.DB.prepare("DELETE FROM outbound_attempts WHERE mailbox_id=?1").bind(id),
    env.DB.prepare("DELETE FROM native_mailboxes WHERE id=?1").bind(id),
  ]);
  // Keep minimal audit entries to establish that irreversible deletion happened.
  return Response.json({ complete: true });
}



/** Daily purge is opt-in; production must have a verified R2+D1 backup first. */
export async function purgeExpiredNativeMailboxes(env: Env): Promise<void> {
  const expired = await env.DB.prepare(
    "SELECT id FROM native_mailboxes WHERE deleted_at IS NOT NULL AND purge_after<=CURRENT_TIMESTAMP ORDER BY purge_after LIMIT 10"
  ).all<{id:string}>();
  for (const { id } of expired.results) {
    for (let batch = 0; batch < 10; batch++) {
      const result = await purgeNativeMailbox(env, id);
      if (!result.ok) break;
      const payload = await result.json() as {complete?:boolean};
      if (payload.complete) break;
    }
  }
}
