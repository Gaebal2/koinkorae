# Shared Supabase operations

koinkorae uses the existing Free project `xvqbsiqeoxbkxsvxgnvc` with PSL_Mining to avoid a second paid database. Firebase Authentication and the koinkorae domain remain separate. Migration is in progress; the final cutover and billing status must be recorded below after verification.

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

Backups for this move are in ignored `.runtime/shared-db-20261115/`. Keep the source project/data until the final consistency checks pass. After cutover, rollback must first stop destination writes and copy new records back; simply switching the frontend to an old snapshot would lose visibility of new records. A later paid split should copy only the resources in the ownership table and replace media URLs and frontend configuration.

## Release status

In progress. Do not infer completion from the destination being populated.
