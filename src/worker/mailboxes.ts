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
    "SELECT id, email_address, display_name, status, quota_bytes FROM native_mailboxes WHERE id = ?1"
  ).bind(id).first<NativeMailbox>();
}

export async function mailboxForRecipient(env: Env, address: string): Promise<NativeMailbox | null> {
  const normalized = normalizeMailboxAddress(address);
  if (!normalized) return null;
  // Incoming routing rejects disabled and unknown recipients rather than silently storing them.
  return env.DB.prepare(
    "SELECT id, email_address, display_name, status, quota_bytes FROM native_mailboxes WHERE email_address = ?1 AND status = 'active'"
  ).bind(normalized).first<NativeMailbox>();
}

export async function allNativeMailboxes(env: Env): Promise<NativeMailbox[]> {
  const result = await env.DB.prepare(
    "SELECT id, email_address, display_name, status, quota_bytes FROM native_mailboxes ORDER BY CASE WHEN id='native:primary' THEN 0 ELSE 1 END, created_at"
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
  return Response.json({ mailbox: await mailboxById(env, id) }, { status: 201 });
}

export async function updateNativeMailbox(request: Request, env: Env, id: string): Promise<Response> {
  if (id === PRIMARY_MAILBOX_ID) return Response.json({ error: "The primary mailbox cannot be disabled" }, { status: 403 });
  const body = await request.json<{ status?: unknown; displayName?: unknown }>().catch(() => null);
  if (!body || (body.status !== undefined && body.status !== "active" && body.status !== "disabled")
    || (body.displayName !== undefined && typeof body.displayName !== "string"))
    return Response.json({ error: "Invalid mailbox update" }, { status: 400 });
  if (body.status === undefined && body.displayName === undefined)
    return Response.json({ error: "No changes requested" }, { status: 400 });
  const old = await mailboxById(env, id);
  if (!old) return Response.json({ error: "Mailbox not found" }, { status: 404 });
  const status = body.status === "active" || body.status === "disabled" ? body.status : old.status;
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 80) : old.display_name;
  await env.DB.prepare("UPDATE native_mailboxes SET status = ?2, display_name = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?1")
    .bind(id, status, displayName).run();
  return Response.json({ mailbox: await mailboxById(env, id) });
}
