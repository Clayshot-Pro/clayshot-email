export async function healthResponse(env: Env): Promise<Response> {
  const checks = {
    d1: false,
    r2: false,
  };

  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    checks.d1 = true;
  } catch {
    checks.d1 = false;
  }

  try {
    await env.MAIL.list({ limit: 1 });
    checks.r2 = true;
  } catch {
    checks.r2 = false;
  }

  const ok = checks.d1 && checks.r2;
  const primary = checks.d1
    ? await env.DB.prepare(
        "SELECT email_address FROM native_mailboxes WHERE id='native:primary' AND status='active' AND deleted_at IS NULL"
      ).first<{ email_address: string }>().catch(() => null)
    : null;

  return Response.json(
    {
      ok,
      service: "clayshot-pro-email-dev",
      address: primary?.email_address ?? null,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
