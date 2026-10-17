# Clayshot Pro Email — Cloudflare setup

## Target configuration

| Setting | Value |
| --- | --- |
| Cloudflare account | `clayshot-pro` |
| Repository | `Clayshot-Pro/clayshot-email` |
| Worker | `clayshot-pro-email-dev` |
| Webmail origin | `https://email.clayshot-dev.com` |
| Incoming email domain | `clayshotpro.com` |
| Catch-all | `*@clayshotpro.com` → `clayshot-pro-email-dev` |
| Primary mailbox | First address created by administrator (none by default) |
| Administrator login | `admin@clayshotpro.com` |
| D1 | `DB` → `clayshot-pro-email-dev` |
| R2 | `MAIL` → `clayshot-pro-email-dev-mail` |

The administrator login is a reserved **sign-in identity**; the
`admin` local part is not a native mailbox. Passkey registration and
verification use **`email.clayshot-dev.com`** as the WebAuthn RP ID
and **`https://email.clayshot-dev.com`** as the expected origin.
Do not switch WebAuthn RP ID to `clayshotpro.com`.

## Cloudflare account prerequisites

1. Ensure the `clayshot-pro` account controls the email-routing zone
   `clayshotpro.com`. The `clayshot-dev.com` zone hosting the custom
   Worker domain must also have a valid Worker-domain configuration;
   if it is in another Cloudflare account, do not assume a cross-account
   custom domain will work without separate setup.
2. Create an **independent** D1 database `clayshot-pro-email-dev`. Do
   not reuse production LTM Email D1 data.
3. On the existing `clayshot-pro-email-dev` Worker, bind that database
   as `DB` and **deploy/save** the binding. The production build
   resolves the private D1 ID from the existing deployed Worker, so do
   not commit the database UUID. Keep the zero UUID placeholder in
   `wrangler.jsonc`.
4. Create the R2 bucket `clayshot-pro-email-dev-mail`, attach as
   `MAIL`, and verify storage access. Do not reuse LTM mail objects.
5. Create a fresh long random Worker **runtime secret** named
   `AUTH_SETUP_TOKEN`. Keep the value private. Other secrets are
   needed only for optional Google OAuth or Web Push integrations.

## GitHub and deployment

1. Connect the **Clayshot-Pro/clayshot-email** repository to the
   existing Worker with production branch **`main`**. Disable
   deployment from every minor/version branch and preview environment
   unless fully isolated.
2. Set build command to `npm run build:cloudflare` and deploy
   command to `npm run deploy`.
3. Set private **Workers Builds environment** credentials:
   `CLOUDFLARE_ACCOUNT_ID` (the Clayshot account) and
   `CLOUDFLARE_API_TOKEN` (least privilege required to read Worker
   bindings, migrate D1 and deploy). These are not the same as runtime
   Worker secrets. Never commit them.
4. Confirm the deployed bootstrap Worker already has exactly one `DB`
   binding before the first production build. Builds hydrate the D1 ID,
   type-check, bundle the Worker/UI and run D1 migrations. The deploy
   command refuses production deployment outside Workers Builds on
   `main`.
5. Ensure the configured custom domain still routes to this Worker:
   `https://email.clayshot-dev.com`. The repository intentionally
   does not replace an existing dashboard-managed custom-domain route.
6. New installations have **no default native mailbox** after all D1
   migrations. The first mailbox you create in **Email administration →
   Mailboxes** gets the protected `native:primary` identifier regardless
   of its email address. No `contact@clayshotpro.com` address is required.
   Migration `0016` safely removes the old unused seeded contact mailbox
   only when it has no saved messages, drafts, credentials, audit history
   or other mailbox references. Older installation seeds using
   `contact@liamthemo.com` are handled the same way. If the previous mailbox contains user
   activity, it is preserved for deliberate manual review and migration.

## Receiving mail

1. In **Email Service → Email Routing**, onboard `clayshotpro.com`
   and verify the Cloudflare MX/TXT records. Do not replace an active
   third-party MX service without a deliberate migration.
2. Manage the `*@clayshotpro.com` catch-all **in the Cloudflare dashboard**:
   under **Email Service → Email Routing → Routing Rules**, set the
   **Catch-all** action to **Send to a Worker → clayshot-pro-email-dev**.
   The existing rule is dashboard-managed, so `wrangler.jsonc`
   intentionally **omits** the `addresses` property. Wrangler leaves
   existing dashboard-managed Email Routing rules unchanged on deploy.
   Do **not** set `"addresses": []`, which would instead remove
   Wrangler-managed rules. Do not run an interactive takeover.
3. Confirm the effective catch-all points to
   `clayshot-pro-email-dev` and that the *deployed* Worker exports
   `email()`. HTTP `fetch()` continues to serve the webmail UI/API.
4. Register the owner passkey and password, open **Email administration →
   Mailboxes**, and create the first address you want (for example
   `team@clayshotpro.com`). This is automatically your protected primary
   mailbox. The catch-all does **not** create addresses automatically.
5. Send test mail to your chosen first address, another admin-created
   mailbox, a plus alias and an unknown recipient. Verify correct D1/R2
   persistence and rejection of unknown recipients.

## Administrator onboarding

1. Open `https://email.clayshot-dev.com` on the final secure host.
2. Enter `AUTH_SETUP_TOKEN` and register a *new* administrator passkey.
3. Set the administrator password (4–32 characters), then log out.
4. Log in using **`admin@clayshotpro.com`**, the password and passkey.
   Confirm sensitive admin changes require fresh passkey approval and
   security activity is recorded.
5. Remove `AUTH_SETUP_TOKEN` from runtime secrets after successful
   enrollment.

## Outbound mail and optional services

Inbound routing does **not** enable native outbound sending.
Onboard `clayshotpro.com` separately under Cloudflare Email Sending,
verify DNS (SPF, DKIM, DMARC, bounces), eligibility and your intended
use case. No native sender is pre-authorized by mailbox creation. All native
outbound sending is gated behind Cloudflare's `EMAIL_MULTI` binding and
`MULTI_SENDER_APPROVED=true`, which must be enabled **only when**
Cloudflare explicitly permits the sender and intended use. Until then,
admin-created mailboxes can receive mail but cannot send native mail.

For Gmail, provision `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `PROVIDER_CREDENTIAL_KEY`, and register
`https://email.clayshot-dev.com/api/accounts/gmail/callback` in
Google Cloud Console. For push, configure the VAPID keypair. On Windows PowerShell with Node.js
installed, generate the keys with:
```powershell
npx --yes web-push generate-vapid-keys --json
```
Store `publicKey` as the Worker secret `VAPID_PUBLIC_KEY` and
`privateKey` as `VAPID_PRIVATE_KEY`. Never commit the private key.
Existing push subscriptions must keep using the same keypair.

## Sign in with Google

The login page's **Sign in with Google** button signs a user into the active
native mailbox whose address matches their verified Google account. Only
`@clayshotpro.com` Google (Cloud Identity / Workspace) accounts are accepted, and
it never grants administrator access: `admin@clayshotpro.com` still requires a
password and passkey. It requests only `openid email`, so Google verification is
not needed and no Google APIs need to be enabled.

1. The OAuth client lives in `clayshot-pro-prod-490017` (see the
   `clayshot-pro-infrastructure` runbook). Set the consent-screen audience to
   **Internal**. Add the redirect URI
   `https://email.clayshot-dev.com/api/auth/google/callback`.
2. Set the Worker secrets. Sign-in needs only these two:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID --name clayshot-pro-email-dev
   npx wrangler secret put GOOGLE_CLIENT_SECRET --name clayshot-pro-email-dev
   ```
3. Create a native mailbox matching the Google account (for example
   `liamkienitz@clayshotpro.com`) in the admin panel, then test the button.

## Final acceptance

- [ ] CI typecheck, build, migration and security scans pass
- [ ] Workers Builds production deployment succeeds **from main**
- [ ] HTTPS webmail loads at `email.clayshot-dev.com`
- [ ] Separate Cloudflare D1 `DB` and R2 `MAIL` bindings work
- [ ] The **first admin-created mailbox** receives external mail in the Inbox
- [ ] Unknown recipients are rejected; plus aliases resolve correctly
- [ ] `admin@clayshotpro.com` authenticates with password and passkey
- [ ] Admin routes are inaccessible to mailbox-only sessions
- [ ] Sign in with Google opens the matching mailbox and rejects other Google accounts
- [ ] Setup secret removed; D1 and R2 backups and restore validated
- [ ] Outbound mail verified only if authorized and needed

**Cloudflare account actions require account-side credentials/access**.
A GitHub repository connection does not itself authorize Cloudflare
DNS, Email Routing, Workers Builds, R2, or Worker secrets changes.
