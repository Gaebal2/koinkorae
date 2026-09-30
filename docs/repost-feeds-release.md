# Repost feed release

Production uses Supabase. Reposts now have independent `posts` records linked by
`originalPostId`, with their own timestamp, comment (up to 100 characters), and
battle totals. The existing `reposts` relation keeps one share per user/original.
Sharing another repost resolves to its canonical original. Retrying a share keeps
the first timestamp/comment. Unsharing removes only that user's repost; deleting
an original removes dependent reposts and their comments/likes transactionally.

The feed query includes reposts in cursor pagination. Profile authored feeds
exclude reposts; the repost tab sorts by repost creation time. Both original and
reposting profiles are joined in the page query without per-card requests.
Battle apply/finish locks the session and updates both feed totals once, using
the selected support/oppose side. Old reposts are backfilled at their existing
share timestamps with empty comments and zero independent battle scores.

Deploy in this order:

1. Apply `supabase/migrations/202609300003_repost_feeds.sql` after the existing
   likes migration, inside a transaction. Production migration history is managed
   manually; do not blindly replay previous migrations.
2. Deploy the `community` Edge Function for server-side comment validation.
3. Build and deploy the frontend.

The inactive Firebase rollback adapter and historical SQLite demo retain their
old repost model; this migration targets the production Supabase backend.

Validation: `npm test` includes SQL integration coverage for comment limits,
authentication, canonical originals, cursor pagination, profile order, migration
reapplication, deletion and exactly-once support/oppose scoring on both protocols.
