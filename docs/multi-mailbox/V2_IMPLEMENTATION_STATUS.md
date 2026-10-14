# v2.00 implementation status and rollout gates

**Status on 2026-10-13:** Implementation in progress on `feature/v2.00-native-multi-mailbox-foundation` targeting the permanent `v2.00` checkpoint. Production `main` is unchanged.

## Implemented in the feature branch

- Additive `0010_native_mailboxes.sql` migration: native mailbox registry, mailbox IDs on legacy message/thread/draft rows, original inbound RFC Message-ID, native Junk flag and scoped indexes.
- Existing `native:primary` and its stored rows remain the default primary mailbox; existing Gmail provider code and OAuth tables are preserved.
- Owner-authenticated create/list/disable/enable APIs and Settings mailbox-management interface. New native mailbox rows are not independent users, logins, IMAP accounts or SMTP credentials.
- Server-side mailbox scoping for native list, detail, thread, read/star/junk/archive/trash, drafts, forwarding source, outgoing persistence, attachments, and account-specific folder counters.
- Envelope recipient lookup at the Email Worker and rejection of unknown/disabled recipients.
- Per-mailbox original Message-ID deduplication, including separate delivery of the same RFC Message-ID to different mailboxes.
- Sending from additional native addresses is **blocked**. The existing `contact@` sender continues to use its configured Cloudflare binding. UI identifies new addresses as receive-only.
- Offline SQLite regression test included in GitHub validation; checks legacy backfill, per-mailbox delivery uniqueness, independent flags and case-insensitive mailbox identity.

## Intentionally not yet complete

1. **Real outbound from created addresses:** Cloudflare says Email Sending is intended for transactional email. Receive-only is not a complete solution for arbitrary personal/business correspondence; require written provider confirmation and then sender-binding security changes before enabling new senders.
2. **Catch-all routing:** Production Cloudflare Email Routing/DNS settings must be inspected for precedence and configured to route unregistered domain local parts to this Worker. No DNS or routing change was made from the repository. Without the catch-all route, newly created addresses might not receive any mail.
3. **Live migration:** D1 backup, R2 integrity/backups, message/attachment count reconciliation and production migration smoke tests remain unverified.
4. **Account quotas:** Incoming storage reserves raw MIME plus extracted attachment bytes atomically; legacy stored content is backfilled using a metadata-size **estimate**, and historical R2 bytes still require a private inventory and reconciliation. Outgoing attachments and deletion/retention usage accounting are not yet complete; avoid claiming exact usage.
5. **Native Junk classifier:** The schema/flag and folder are available, but automatic spam classification is not implemented. Gmail's Junk remains backed by Gmail Spam.
6. **Deletion:** Owner can disable/reactivate a non-primary mailbox. Permanent deletion, backup/export/retention and object reconciliation are deliberately deferred to avoid destructive migrations.
7. **Runtime e2e and device coverage:** No verified live mail tests yet for a new recipient, reply/forward, attachments, iPhone/iPad PWA, or Gmail regression.
8. **Build previews:** Cloudflare reports non-production branch build failures even when GitHub build/security workflows pass. This repository uses Wrangler `^4.130.0`, while newer Cloudflare Worker Previews require `4.135.0` or later. Inspect the private build logs before attributing failures. To enforce production-only deployments, disable **Enable Preview Builds** in Cloudflare Worker > Settings > Build > Branch control, leaving `main` as the production branch. See https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/.

## Launch procedure (do not skip gates)

1. Confirm current Cloudflare routing and sender authorization settings without exposing secrets.
2. Back up and independently verify recovery of D1 and R2; inspect old native and Gmail data counts privately.
3. Validate the v2.00 GitHub build, security scan, and offline migration test; review pull request feedback.
4. Use a staging environment with real bindings to apply migrations and verify primary and new recipient isolation. Do not use the live primary mailbox as a destructive fixture.
5. Configure domain catch-all routing to the Worker **only after** confirming the existing explicit `contact@` rule will not regress.
6. Verify creation, receive, unknown-recipient rejection, duplicate Message-ID delivery, draft isolation, attachments, flags, notifications, Gmail and mobile use.
7. Only if Cloudflare confirms the general-purpose sending policy: implement audited sender authorization, update Workers binding for safe dynamic sender support and test outbound with SPF/DKIM/DMARC.
8. Commit/merge temporary branch into `v2.00`, run its checks, then merge `v2.00` into `main` for Cloudflare Workers Builds production deployment. Confirm deployment, production health, and delivery with real external test messages.
9. Final audit classifications: **Completed / Passed**, **Requires Manual Validation**, and **Incomplete / Needs Work**, with evidence. Do not mark project complete until all requested mail functionality works.

## Current architecture note

This implementation deliberately keeps a **single owner passkey identity** and many address mailboxes. Each address remains accessible through the same web app session. User-to-user login isolation, SMTP/IMAP credentials, commercial customer registration, and mail server hosting remain out of scope.
