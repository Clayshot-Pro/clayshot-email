/** Extract a safe, user-opened subscription-management link from RFC 2369 headers.
 * Never fetch this URL on the server or automatically visit it on message load.
 */
export function listUnsubscribeUrl(header: string | null | undefined): string | null {
  if (!header || header.length > 8192) return null;
  const bracketed = Array.from(header.matchAll(/<([^<>]{1,2048})>/g), (match) => match[1].trim());
  const candidates = bracketed.length ? bracketed : header.split(",").map((part) => part.trim());
  // Prefer an HTTPS subscription-management page to opening a mail application.
  for (const desiredProtocol of ["https:", "mailto:"]) for (const candidate of candidates) {
    if (/[\r\n\u0000-\u001f\u007f]/.test(candidate)) continue;
    try {
      const url = new URL(candidate);
      if (desiredProtocol === "https:" && url.protocol === "https:" && !url.username && !url.password && !url.port
          && url.hostname.includes(".")
          && !url.hostname.endsWith(".localhost")
          && !url.hostname.endsWith(".local")
          && !url.hostname.endsWith(".internal")
          && !/^(?:\d+\.\d+\.\d+\.\d+|\[.*\])$/.test(url.hostname)) return url.href;
      if (desiredProtocol === "mailto:" && url.protocol === "mailto:" && /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(url.pathname)
          && !/%0[ad]/i.test(candidate)) return url.href;
    } catch {
      // Ignore malformed or unsupported scheme candidates.
    }
  }
  return null;
}
