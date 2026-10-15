import type { MailFolder } from "./types";

// Gmail search results may temporarily contain messages whose labels changed.
// Treat the fetched labels as the authoritative folder membership.
export function gmailMatchesFolder(labels: string[] | undefined, folder: MailFolder): boolean {
  if (!labels) return false;
  const current = new Set(labels);
  if (folder === "trash") return current.has("TRASH");
  if (current.has("TRASH")) return false;
  if (folder === "junk") return current.has("SPAM");
  if (current.has("SPAM")) return false;
  if (folder === "inbox") return current.has("INBOX");
  if (folder === "sent") return current.has("SENT");
  if (folder === "starred") return current.has("STARRED");
  return !current.has("INBOX") && !current.has("SENT") && !current.has("DRAFT");
}
