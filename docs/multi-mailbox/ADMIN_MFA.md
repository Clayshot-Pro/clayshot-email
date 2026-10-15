# v2.02 — Administrator login with password + passkey

## Intended user experience

- `admin@liamthemo.com` is a **reserved login identity**, not a mail inbox or newly created native mailbox.
- On a device without saved accounts, type `admin@liamthemo.com` into the normal **Custom email** sign-in form, followed by the administrator password.
- The app then requests the previously registered **owner passkey** as a mandatory second factor. Both must succeed on the same browser, within five minutes, to establish an administrator session.
- Once authenticated, the app opens the **standalone Email administration dashboard**, instead of showing a normal inbox or an admin panel buried in Settings.
- On a device already signed into an email account, choose **Add custom email** in Settings and sign in as `admin@liamthemo.com`; after completing both factors the app opens the separate dashboard.
- Admin dashboard supports creating mailboxes, changing their passwords to an owner-chosen value (16–128 characters) or generating a secure random password, quotas, archival and deletion operations.

## Setting your administrator password the first time

Your existing owner passkey is already registered. The v2.02 migration **does not set or transmit an administrator password**. On initial use, the sign-in page offers **Set up admin password using passkey**; authenticate with your existing passkey and choose the password in the standalone admin dashboard. You must choose it in the web app. **Do not put it in repository files, Cloudflare build variables, or chat messages.**

Once the password is saved, all existing passkey-only administrator sessions are invalidated. Sign in using `admin@liamthemo.com`, your chosen password, then your passkey. This prevents legacy passkey-only sign-in from bypassing the new second factor.

## Changing passwords

- **Administrator password:** In the admin dashboard choose **Change administrator password**. Supply the current administrator password, new password (8–32 characters), and confirmation. The change revokes *all* administrator sessions; log in again with password + passkey. The registered passkey is not changed.
- **Individual mailbox password:** In **Custom mailboxes**, select **Set password** for the desired address, provide and confirm a strong password. The password is salted and hashed on the server; the server returns no plaintext. The existing mailbox device sessions are revoked without affecting other email accounts.
- **Generated mailbox password:** Choose **Generate password** to replace a mailbox password with a random strong value. That random password is returned once to the passkey-authenticated admin screen. Store it securely; it cannot be retrieved later.

## Security design

- Only one administrator password record is allowed (`admin_credentials.id=1`). `admin@liamthemo.com` cannot be registered as a normal mailbox or logged into via the ordinary mailbox password flow.
- Administrator password is salted and PBKDF2-SHA256 hashed with 310,000 iterations; plaintext is neither logged nor committed. Per-IP login attempts are rate-limited.
- A successful administrator password entry issues an HttpOnly, Secure, SameSite=Strict cookie for a short-lived pending login. The password proof is stored hashed and expires after five minutes.
- WebAuthn passkey options require the pending password proof once the admin password is configured. Each passkey challenge records the pending proof identifier. Successful passkey verification must consume that matching proof exactly once before the owner session is issued.
- Owner sessions are the only sessions authorized for `/api/mailboxes/*` and protected profile/session administration. Ordinary mailbox or Gmail sessions have no admin authority.
- No WebAuthn credentials are added automatically; existing passkeys and their registration lock remain.
- Changing the administrator password invalidates all administrator sessions and pending password proofs.

## Production steps

1. CI validates TypeScript, Workers build, legacy migrations, admin schema and mailbox password policy.
2. Merge temporary feature branch to permanent `v2.02`, then merge `v2.02` to `main`. Cloudflare Workers Builds deploys production.
3. Confirm additive migration `0014_admin_password_2fa.sql` applied to the correct production D1 database.
4. Use the existing passkey to set the administrator password, and verify the next sign-in requires **both** factors.
5. Test bypass attempts: calling passkey endpoints without a fresh administrator password must fail; a bad password must fail; a replayed pending token must fail; a normal mailbox session must receive 403 from admin endpoints.
6. On two devices, change an individual mailbox password and confirm both normal sessions are revoked. Confirm existing Gmail, content, and notifications are unaffected.
7. Check mobile Safari/Home Screen PWA and desktop workflows for clear admin navigation and successful sign-out.

## Recovery warning

There is no automatic administrator password recovery or passkey bypass. Save the administrator password in a trusted password manager and retain access to the existing registered passkey. A lockout requires a separate owner-controlled recovery process, not a public reset link.

## v2.04 fix: Cloudflare runtime-compatible hashing

Administrator passwords accept **8–32 characters** (the custom mailbox password policy remains 16–128). Punctuation, including `?`, is supported. This release replaces the WebCrypto PBKDF2 call with Workers-supported `node:crypto` PBKDF2, retaining the 310,000-iteration work factor and compatibility with previously stored PBKDF2-SHA256 hashes. Cloudflare Workers may reject the previous WebCrypto call because of production iteration limits; this is not a database table/migration error. The same runtime hashing repair applies to custom mailbox password logins.

[Cloudflare Node.js crypto support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) · [Workers PBKDF2 iteration limit discussion](https://github.com/cloudflare/workerd/issues/1346).

Do not send passwords or password hashes in bug reports. If setup still fails, inspect the exception **name**, HTTP status and Worker invocation outcome, not the submitted password.
