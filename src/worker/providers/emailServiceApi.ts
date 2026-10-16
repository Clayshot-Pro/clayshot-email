import type { ProviderSendInput, ProviderSendResult } from "./types";

type EmailApiEnv = {
  CF_EMAIL_SENDING_ACCOUNT_ID?: string;
  CF_EMAIL_SENDING_TOKEN?: string;
};

type ApiResult = {
  success?: boolean;
  errors?: Array<{ code?: number }>;
  result?: { delivered?: string[]; queued?: string[]; permanent_bounces?: string[] } | null;
};

type TransportError = Error & { code: string };

function failure(code: string): TransportError {
  return Object.assign(new Error(code), { code });
}

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let raw = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    raw += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(raw);
}

function htmlFromText(text: string): string {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  return `<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${escaped.replace(/\n/g, "<br>")}</div>`;
}

const REST_ERRORS: Record<number, string> = {
  10001: "E_VALIDATION_ERROR",
  10200: "E_CONTENT_TOO_LARGE",
  10101: "E_EMAIL_API_AUTH_FAILED",
  10103: "E_EMAIL_API_AUTH_FAILED",
  10102: "E_EMAIL_API_FORBIDDEN",
  10105: "E_EMAIL_SERVICE_NOT_ENTITLED",
  10203: "E_EMAIL_SENDING_DISABLED",
  10004: "E_RATE_LIMIT_EXCEEDED",
};

/** Dynamically send from any active, authenticated mailbox at an onboarded domain.
 * The API credentials remain solely in Worker runtime secrets, never in client data.
 */
export async function sendViaEmailServiceApi(
  env: EmailApiEnv,
  fromAddress: string,
  senderName: string,
  input: ProviderSendInput,
): Promise<ProviderSendResult> {
  const accountId = env.CF_EMAIL_SENDING_ACCOUNT_ID?.trim();
  const token = env.CF_EMAIL_SENDING_TOKEN?.trim();
  if (!accountId || !token) throw failure("E_EMAIL_API_NOT_CONFIGURED");
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw failure("E_EMAIL_API_NOT_CONFIGURED");

  const payload = {
    from: { address: fromAddress, name: senderName },
    to: input.to,
    cc: input.cc.length ? input.cc : undefined,
    bcc: input.bcc.length ? input.bcc : undefined,
    reply_to: fromAddress,
    subject: input.subject,
    text: input.text,
    html: htmlFromText(input.text),
    headers: input.headers && Object.keys(input.headers).length ? input.headers : undefined,
    attachments: input.attachments.map((item) => ({
      content: base64(item.content),
      filename: item.filename,
      type: item.type,
      disposition: "attachment" as const,
    })),
  };
  const body = JSON.stringify(payload);
  // Cloudflare Email Service is limited to 5 MiB per message including attachments.
  if (new TextEncoder().encode(body).byteLength > 5 * 1024 * 1024) {
    throw failure("E_CONTENT_TOO_LARGE");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch {
    // The request may have reached Cloudflare even on a timeout: do not auto-retry.
    throw failure("E_EMAIL_DELIVERY_UNKNOWN");
  }

  const data = await response.json<ApiResult>().catch(() => null);
  if (!response.ok || data?.success !== true) {
    const errorCode = data?.errors?.[0]?.code;
    throw failure(errorCode && REST_ERRORS[errorCode] || "E_DELIVERY_FAILED");
  }
  const delivered = data.result?.delivered?.length ?? 0;
  const queued = data.result?.queued?.length ?? 0;
  // A 200 with only permanent bounces is not a successful send.
  if (delivered + queued === 0) throw failure("E_DELIVERY_FAILED");
  // REST API reports delivery categories but not the binding's messageId.
  return { providerMessageId: null };
}
