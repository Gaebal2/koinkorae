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

Profile pins and ranking update:

- Apply `202609300006_separate_profile_pins.sql`, then
  `202609300007_feed_activity_ranking.sql`, and finally
  `202609300008_period_activity_ranking.sql`, after migration 005. Deploy the updated
  `community` function before the frontend (trending pagination now carries its
  evaluation time). Do not replay older migrations over these functions.
- Authored posts use `pinnedPostId`; reposts use `pinnedRepostId`. A legacy repost
  pin migrates to the repost tab. Each tab replaces/unpins only its own entry.
- Controversy orders by `abs(support) + abs(oppose)`.
- Trending follows the selected KST calendar period: today, this month, this year
  or all available history. The start timestamp filters activity, not publication
  dates, so an older post can trend today. Each point of battle-counter change and
  each active new comment, repost or like contributes one unit divided by
  `1 + elapsed minutes`. Scores are scaled by 1,000,000 and floored for integer
  pagination. This measures time-weighted activity rather than lifetime totals.
  Coin groups sum feed scores. Open trending lists refresh every minute.
- Comments, reposts and likes use existing creation timestamps; removing an
  engagement removes its contribution. Battle changes are recorded from migration
  time onward; historic totals are not fabricated into recent activity. Activity
  buckets are private, retained for the year/all-period queries, and removed with
  a deleted post. Migration 008 removes the former 24-hour cutoff and pruning;
  any history already pruned by an earlier deployment cannot be reconstructed.
- Cursor pages reuse the first page's evaluation timestamp to avoid shifts caused
  solely by time decay. Concurrent real activity can still change ordering, as
  with the existing live feed; refreshed lists re-evaluate the complete chain.

Validation: `npm test` includes SQL integration coverage for comment limits,
authentication, canonical originals, cursor pagination, profile order, migration
reapplication, deletion and exactly-once support/oppose scoring on both protocols.
