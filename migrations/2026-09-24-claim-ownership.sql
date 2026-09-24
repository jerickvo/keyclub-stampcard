-- Run once, after migrations/2026-09-23-prizes-and-hand-stamps.sql.
-- Safe to run twice.
--
-- A claim records who made it (claimed_by): the member, or the officer
-- whose hand-over wrote it for them. Taking a hand-over back removes the
-- claim only while it is still the one that hand-over wrote. Before this,
-- a member who pressed Claim after an officer had already handed the
-- prize over was told it was claimed, and the officer's Undo then deleted
-- the claim with the hand-over.
--
-- The member's Claim goes through claim_reward(): it writes the claim, or
-- makes a claim a hand-over already wrote their own. The member's insert
-- policy stays for pages published before this change (their inserts
-- are recorded as the member's own through the column default).

alter table public.reward_claims
  add column if not exists claimed_by uuid references public.profiles(id) on delete set null;
alter table public.reward_claims alter column claimed_by set default auth.uid();

-- claims already on file: a hand-over that wrote one made it the
-- officer's (so it can still be taken back within its fifteen minutes);
-- every other claim was the member's own insert
update public.reward_claims c set claimed_by = h.handed_by
  from public.reward_handovers h
 where c.claimed_by is null and h.made_claim
   and h.user_id = c.user_id and h.reward_id = c.reward_id;
update public.reward_claims set claimed_by = user_id where claimed_by is null;

-- a member's own insert is theirs: it cannot be recorded as someone else's
drop policy if exists claims_self_insert on public.reward_claims;
create policy claims_self_insert on public.reward_claims
  for insert with check (
    user_id = auth.uid()
    and claimed_by is not distinct from auth.uid()
    and (select count(*) from public.attendance a where a.user_id = auth.uid())
        >= case reward_id when 'r1' then 10 when 'r2' then 20 else 30 end
  );

-- ── a member claims a prize ───────────────────────────────────────
create or replace function public.claim_reward(p_user_id uuid, p_reward_id text)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  need integer;
  have integer;
  at timestamptz;
begin
  -- the account the page shows must be the one signed in: another tab
  -- may have signed in as someone else since the page was drawn
  if me is null or p_user_id is distinct from me then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  need := case p_reward_id when 'r1' then 10 when 'r2' then 20 when 'r3' then 30 end;
  if need is null then
    raise exception 'INVALID_REWARD' using errcode = 'P0001';
  end if;

  -- the lock a hand-over of this prize takes, so the two are served in turn
  perform pg_advisory_xact_lock(hashtext(me::text || ':' || p_reward_id));

  -- a claim already on file is the member's from now on: one a hand-over
  -- wrote for them is no longer the hand-over's to take back
  update public.reward_claims set claimed_by = me
   where user_id = me and reward_id = p_reward_id
  returning claimed_at into at;
  if found then return at; end if;

  -- the same threshold the insert policy checks, against real attendance
  select count(*) into have from public.attendance where user_id = me;
  if have < need then
    raise exception 'NOT_EARNED' using errcode = 'P0001';
  end if;

  insert into public.reward_claims (user_id, reward_id, claimed_by)
  values (me, p_reward_id, me)
  returning claimed_at into at;
  return at;
end $$;

revoke all on function public.claim_reward(uuid, text) from public, anon;
grant execute on function public.claim_reward(uuid, text) to authenticated;

-- ── a page from before claim_reward ───────────────────────────────
-- It claims with a direct insert that does nothing when a claim is
-- already on file (on conflict do nothing). If that claim is one a
-- hand-over wrote, the member pressing Claim makes it theirs here, before
-- the insert is found to conflict, as claim_reward does; under the same
-- lock. An insert that is then refused (not earned) takes this with it.
create or replace function public.claim_taken_by_member()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.user_id is not distinct from auth.uid() then
    perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':' || new.reward_id));
    update public.reward_claims set claimed_by = new.user_id
     where user_id = new.user_id and reward_id = new.reward_id
       and claimed_by is distinct from new.user_id;
  end if;
  return new;
end $$;

revoke all on function public.claim_taken_by_member() from public, anon, authenticated;

drop trigger if exists reward_claims_member_claim on public.reward_claims;
create trigger reward_claims_member_claim
  before insert on public.reward_claims
  for each row execute function public.claim_taken_by_member();

-- ── hand a prize over (unchanged, but for claimed_by) ──────────────
create or replace function public.hand_over_reward(p_user_id uuid, p_reward_id text)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  need integer;
  have integer;
  claimed boolean;
  made boolean := false;
  at timestamptz;
begin
  if not public.is_board() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'SELF_HANDOVER' using errcode = 'P0001';
  end if;

  need := case p_reward_id when 'r1' then 10 when 'r2' then 20 when 'r3' then 30 end;
  if need is null then
    raise exception 'INVALID_REWARD' using errcode = 'P0001';
  end if;

  -- one change at a time per member and prize: another officer's
  -- hand-over, and the member's own claim_reward, take the same lock
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_reward_id));

  if exists (select 1 from public.reward_handovers
             where user_id = p_user_id and reward_id = p_reward_id) then
    raise exception 'ALREADY_HANDED_OVER' using errcode = 'P0001';
  end if;

  select exists (select 1 from public.reward_claims
                 where user_id = p_user_id and reward_id = p_reward_id) into claimed;
  if not claimed then
    select count(*) into have from public.attendance where user_id = p_user_id;
    if have < need then
      raise exception 'NOT_EARNED' using errcode = 'P0001';
    end if;
    -- a member's direct insert (a page from before claim_reward) does not
    -- take the lock and can still land first; the hand-over made the
    -- claim only if this insert is the one that wrote it
    insert into public.reward_claims (user_id, reward_id, claimed_by)
    values (p_user_id, p_reward_id, auth.uid())
    on conflict (user_id, reward_id) do nothing;
    made := found;
  end if;

  insert into public.reward_handovers (user_id, reward_id, handed_by, made_claim)
  values (p_user_id, p_reward_id, auth.uid(), made)
  returning handed_at into at;
  return at;
end $$;

revoke all on function public.hand_over_reward(uuid, text) from public, anon;
grant execute on function public.hand_over_reward(uuid, text) to authenticated;

-- ── take back a mistaken hand-over ────────────────────────────────
-- The officer who recorded it, within fifteen minutes. The claim goes
-- with it only if the hand-over wrote it and it is still the officer's:
-- a claim the member made, before or after, is theirs and stays.
create or replace function public.undo_hand_over(p_user_id uuid, p_reward_id text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  made boolean;
begin
  if not public.is_board() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_reward_id));

  delete from public.reward_handovers
  where user_id = p_user_id and reward_id = p_reward_id
    and handed_by = auth.uid()
    and handed_at > now() - interval '15 minutes'
  returning made_claim into made;
  if not found then
    raise exception 'UNDO_EXPIRED' using errcode = 'P0001';
  end if;
  if made then
    delete from public.reward_claims
    where user_id = p_user_id and reward_id = p_reward_id
      and claimed_by = auth.uid();
  end if;
  return true;
end $$;

revoke all on function public.undo_hand_over(uuid, text) from public, anon;
grant execute on function public.undo_hand_over(uuid, text) to authenticated;
