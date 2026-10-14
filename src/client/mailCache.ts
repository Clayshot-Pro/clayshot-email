/**
 * Device-specific account isolation requires every message read to be
 * authorized by the Worker. Never replay sessionStorage contents as a response
 * to a protected /api/messages fetch: a different login in the same tab may
 * otherwise see a previous mailbox's cached content.
 */
export function installMailFetchCache(): void {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith("ltm-mail-cache:")) sessionStorage.removeItem(key);
    }
  } catch {
    // Browsers can disable session storage. Network-only mail is still safe.
  }
}
