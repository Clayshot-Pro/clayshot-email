/** Cloudflare Workers supports node:crypto at runtime with nodejs_compat.
 * Narrow local declarations avoid bringing the entire Node type surface into
 * our Cloudflare Worker + browser TypeScript project.
 */
declare module "node:crypto" {
  export function pbkdf2Sync(
    password: string | Uint8Array,
    salt: string | Uint8Array,
    iterations: number,
    keylen: number,
    digest: string,
  ): Uint8Array;
}
