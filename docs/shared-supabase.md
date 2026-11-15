# Shared Supabase operations

koinkorae uses the existing Free project `xvqbsiqeoxbkxsvxgnvc` with PSL_Mining to avoid a second paid database. Firebase Authentication and the koinkorae domain remain separate. Production cutover, retirement of the old project, and cancellation of its Pro subscription completed on 2026-11-15.

## Ownership

| Resource | koinkorae ownership |
| --- | --- |
| PostgreSQL | `public.korae_*` tables, sequences, views and functions; their indexes, triggers and policies |
| Edge Functions | `community`, `push-dispatch`, `swithpi` |
| Edge secrets | `KORAE_*` only |
| Storage | `community-media` only |
| Vault | `korae_project_url`, `korae_push_dispatch_secret` |
| Cron | `korae-push-dispatch`, `korae-push-cleanup` |
| Migration history | `public.korae_schema_migrations`, not `supabase_migrations.schema_migrations` |

PSL_Mining retains its existing Auth accounts, `public` tables without the `korae_` prefix, `mining_private`, its Edge Functions and `WEB_PUSH_*` secrets. Do not overwrite any of these. Its current migration history is unchanged, so its own reviewed migrations can continue normally. Whole-project resets, schema replacement, global default privilege changes, Auth changes, deleting a shared project, or bulk secret replacement affect both services and are outside normal application deployment.

## Deployment

Use an explicit project ref and function name for each deployment:

```sh
supabase functions deploy community --project-ref xvqbsiqeoxbkxsvxgnvc
supabase functions deploy push-dispatch --project-ref xvqbsiqeoxbkxsvxgnvc
supabase functions deploy swithpi --project-ref xvqbsiqeoxbkxsvxgnvc
```

Apply new koinkorae SQL with `scripts/apply-korae-migration.mjs`, which records only koinkorae's own history. Never run this repository's historical `supabase db push`, remote reset, pull or migration repair against the shared project. Review SQL scope before running it; the ownership rule covers statements inside stored function bodies too.

`scripts/prepare-notifications.mjs` preserves VAPID key values and produces a separate `korae-secrets.env`. Never upload the old unprefixed `secrets.env` into this project: those names are used by PSL_Mining. Keep all secret files and backups under ignored `.runtime/`, never in commits.

For frontend deployments, `SUPABASE_URL` in GitHub Actions and `VITE_SUPABASE_URL` locally must identify the shared project. Firebase remains `koinkorae-map`. The service worker must allow the destination media origin.

## Cost controls and recovery

At the 2026-11-15 preflight, the Free organization used 108 Edge invocations and 0.034 GB egress; koinkorae's paid organization used 32,607 invocations and 0.076 GB egress in the current October 28–November 28 period. These are observations, not future guarantees. Organization quotas also include Youngmasal.

`shared-cron-log-retention` removes completed scheduler logs older than seven days daily at 16:25 UTC (01:25 KST). This is shared infrastructure, not a koinkorae-owned application job. The first cleanup was preceded by a verified local archive. Only the log table was compacted. Application records were not deleted.

Push dispatch queues due check-in notifications in SQL and invokes the Edge worker only when delivery work is ready, avoiding idle minute-by-minute Edge calls. Game replay validation remains enabled: current aggregate usage does not require weakening score verification to fit the Free plan.

Backups for this move are in ignored `.runtime/shared-db-20261115/`. The original project was deleted with explicit user approval after final consistency checks. Recovery therefore requires a new project and restoring backups plus all changes made on the destination since cutover; the former project URL cannot be reused. A later paid split should copy only the resources in the ownership table and replace media URLs and frontend configuration.

## Release status

Production switched on 2026-11-15 (KST), commits `0d6f19e` and `0e7ea9f`. GitHub Pages deployment and CI passed. The served site uses the destination URL and a fresh IndexedDB cache; its service worker caches only the new media origin.

- Compared all 26 source service tables: 601 rows, matching normalized checksums after the intended media-host replacement. The destination has an additional isolated migration-ledger table.
- Copied 44 images; all content hashes matched. Verified source media inventory again after write freeze.
- Preserved 387 PSL_Mining schema objects without differences. Existing Edge secret digests were unchanged. PSL's migration history was not modified.
- Passed 232 automated tests, 11 targeted media/cache tests, 32 cache/chat tests, frontend build and Edge bundles. Live public API, unauthenticated access rejection, realtime readiness and a fully rolled-back member/battle/idempotency probe passed.
- The source was frozen before the final copy; its jobs were disabled before enabling destination jobs. The retired source `cxvznpfcmorysnwwmbna` was then permanently deleted with the user's explicit approval. All current writes belong to the destination.
- The initial downgrade was blocked by the two-active-Free-project limit. After the approved source deletion, its organization was successfully downgraded from Pro to Free. The dashboard confirms **Free Plan**; its Pro subscription is no longer active. PSL_Mining and Youngmasal were not paused, deleted or upgraded.
- Final shared DB size: 30,739,603 bytes (about 30.7 MB against the 500 MB Free limit). Images: 44 objects, 2,036,106 bytes. No retired-host image references or verification records remain. PSL's 41 migration records are unchanged; koinkorae has its own ledger. Both PSL jobs, both koinkorae jobs and shared log retention are active.

Verified archives, final source SQL, checksums and media backups: `.runtime/shared-db-20261115/`. Source public schema/data are in `source.dump` and `source.sql`; the frozen final data are in `source-final-data.private.sql`. Original PSL schema/data are in `target.dump` and `target.sql`; the archived scheduler history is `target-cron-logs.dump`. These contain private records and must never be committed.

Billing evidence is in `free-plan-confirmed.png`, source deletion evidence in `source-deleted.png`, and archive hashes in `retirement-backup-checksums.json` within that private directory. Cancellation does not erase prior paid invoices; the cancellation screen states that unused time is credited to the organization.
