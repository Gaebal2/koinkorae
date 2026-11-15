# Shared production Supabase

Production target: `xvqbsiqeoxbkxsvxgnvc` (PSL_Mining). Read `docs/shared-supabase.md` before any database or server deployment.

- This repository owns only `public.korae_*` objects, `community`, `push-dispatch`, `swithpi` Edge Functions, the `community-media` bucket, `KORAE_*` Edge secrets, and `korae_*` Vault/cron entries.
- Do not change PSL_Mining tables, Auth, `mining_private`, `WEB_PUSH_*` secrets, its functions or migration history as part of ordinary koinkorae work.
- Never run remote `supabase db reset`, schema-wide drop/restore, `db push`, `db pull`, or migration repair on the shared project. The default migration history belongs to PSL_Mining; use the separate koinkorae migration runner.
- Deploy only named koinkorae Edge Functions with an explicit project ref. Do not deploy all functions or overwrite shared/global secrets.
- No paid upgrades or add-ons for koinkorae without an explicit user request. Keep the Free organization and review aggregate usage before increasing recurring work.
- `shared-cron-log-retention` is shared infrastructure: retain 7 days of finished cron logs. Do not remove it in ordinary application work.
- Keep operations scoped so this service can later move to a separate project. Historical migration documents referencing `cxvznpfcmorysnwwmbna` are not current deployment instructions.
