-- Run once, after migrations/2026-09-24-claim-ownership.sql.
-- Safe to run twice.
--
-- The two foreign keys to profiles that the prize tables brought
-- (reward_claims.claimed_by, reward_handovers.handed_by) get an index,
-- as the others did in 2026-09-24-advisor-fixes.sql (unindexed_foreign_keys):
-- deleting a profile sets them null without scanning either table.

create index if not exists reward_claims_claimed_by_idx on public.reward_claims (claimed_by);
create index if not exists reward_handovers_handed_by_idx on public.reward_handovers (handed_by);
