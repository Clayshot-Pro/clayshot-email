import { mailboxPasswordError } from "./mailboxPasswordPolicy";

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
export async function hashPassword(password: string, salt: string, iterations: number = ITERATIONS): Promise<string> {
  const secret = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", iterations, salt: decode(salt) }, secret, 256
  );
  return encode(new Uint8Array(bits));
}
export function constantTimeEqual(a: string, b: string): boolean {
  let mismatch = a.length ^ b.length;
  for (let i=0;i<Math.max(a.length,b.length);i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}
export type PasswordHash = {salt:string;hash:string;iterations:number};
export async function preparePassword(password: string): Promise<PasswordHash> {
  const invalid = mailboxPasswordError(password);
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
