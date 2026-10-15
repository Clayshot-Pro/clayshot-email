import { pbkdf2Sync } from "node:crypto";
import { adminPasswordError, mailboxPasswordError } from "./mailboxPasswordPolicy.ts";

const encoder = new TextEncoder();
const ITERATIONS = 310_000;

function encode(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  const chars = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4-value.length%4)%4));
  return Uint8Array.from(chars, ch => ch.charCodeAt(0));
}
/** Cloudflare Workers supports node:crypto with nodejs_compat.
 * Its WebCrypto PBKDF2 may cap per-call iterations at 100,000 in production,
 * causing the prior 310,000-iteration setup to fail after passing Node CI.
 * Native node:crypto supports our full existing work factor and retains the
 * exact RFC 8018 PBKDF2-SHA256 output for previously stored hashes.
 */
export async function hashPassword(password: string, salt: string, iterations: number = ITERATIONS): Promise<string> {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 1_000_000) {
    throw new Error("Unsupported password hash parameters");
  }
  const saltBytes = decode(salt);
  if (saltBytes.length < 16 || saltBytes.length > 64) {
    throw new Error("Invalid password salt");
  }
  return encode(pbkdf2Sync(encoder.encode(password), saltBytes, iterations, 32, "sha256"));
}
export function constantTimeEqual(a: string, b: string): boolean {
  let mismatch = a.length ^ b.length;
  for (let i=0;i<Math.max(a.length,b.length);i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}
export type PasswordHash = {salt:string;hash:string;iterations:number};
export async function preparePassword(password: string, policy: "admin" | "mailbox" = "mailbox"): Promise<PasswordHash> {
  const invalid = policy === "admin" ? adminPasswordError(password) : mailboxPasswordError(password);
  if (invalid) throw new Error(invalid);
  const salt = encode(crypto.getRandomValues(new Uint8Array(24)));
  return { salt, hash:await hashPassword(password,salt,ITERATIONS),iterations:ITERATIONS };
}
export async function checkPassword(password: string, row: {
 password_salt:string;password_hash:string;iterations:number
} | null): Promise<boolean> {
  if (password.length > 128) return false;
  const computed = await hashPassword(password,row?.password_salt??"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",row?.iterations??ITERATIONS);
  return Boolean(row && constantTimeEqual(row.password_hash, computed));
}
