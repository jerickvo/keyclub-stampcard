-- Run once against a Supabase project created before this change.
-- Safe to run twice: every statement is idempotent.
--
-- Two things the club does by hand at a meeting, recorded properly:
--   1. a prize handed over at the prize table (reward_handovers)
--   2. a member stamped by an officer because their phone could not
--      scan (stamp_by_hand, replacing the attendance_board_write policy)
--
-- Before running: `select count(*) from public.reward_claims;` should be
-- 0 (the 2026-09-12 cleanup removed the only claim, which was test
-- data). Every claim on file shows up as a prize still owed. A prize
-- already handed over before this migration would be offered again, so
-- any such row is reconciled by hand first, not by running
-- hand_over_reward (which would date the hand-over today).

-- ═══════════════════════════════════════════════════════════════════
-- 1. PRIZE HAND-OVERS
--
-- Until now a reward had two states in the database: nothing, or a
-- reward_claims row. A member writes that row from their own phone
-- ("Claim"), so it says the member asked for the prize, not that they
-- got it. An officer looking at a "Claimed" member had no way to tell
-- whether another officer had already handed it over.
--
-- A hand-over is its own row in its own table, not two new columns on
-- reward_claims. reward_claims keeps the member's insert policy exactly
-- as it is (with columns, a member could insert a claim already marked
-- handed), and nobody can write a hand-over from a browser at all:
-- there is no insert, update or delete policy on reward_handovers. The
-- only writers are the two functions below, which check the caller is
-- a board account.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.reward_handovers (
  user_id    uuid not null,
  reward_id  text not null check (reward_id in ('r1','r2','r3')),
  handed_at  timestamptz not null default now(),
  handed_by  uuid references public.profiles(id) on delete set null,
  -- the hand-over wrote the claim too (the member never pressed Claim),
  -- so taking the hand-over back takes that claim back with it
  made_claim boolean not null default false,
  primary key (user_id, reward_id),
  -- a prize is only ever handed over against a claim on file; the
  -- claim goes (with the member) and the hand-over goes with it
  constraint reward_handovers_claim_fkey foreign key (user_id, reward_id)
    references public.reward_claims (user_id, reward_id) on delete cascade
);

-- a table created by an earlier run of this file gains the column
alter table public.reward_handovers add column if not exists made_claim boolean not null default false;

alter table public.reward_handovers enable row level security;

-- a member reads their own hand-overs, the board reads everyone's
drop policy if exists handovers_read on public.reward_handovers;
create policy handovers_read on public.reward_handovers
  for select using (user_id = auth.uid() or public.is_board());

-- Reads are granted explicitly rather than left to Supabase's default
-- privileges (board-data reads with the service role, and a missing
-- grant there would fail every member detail). Every write path from a
-- browser is taken away.
grant select on public.reward_handovers to authenticated, service_role;
revoke insert, update, delete, truncate on public.reward_handovers from anon, authenticated;
revoke all on public.reward_handovers from anon;

-- ── hand a prize over ─────────────────────────────────────────────
-- Board-only, checked here, and never to yourself. The member must have
-- earned the tier: the same count the claim policy uses, or a claim
-- already on file (a claim stays reached if a deleted meeting later
-- takes stamps back). A member who never pressed Claim (no phone at the
-- meeting) is claimed for in the same statement, so an officer is never
-- sent away to find one. A second hand-over of the same prize is
-- refused, not repeated: two officers at two tables cannot both give it
-- out.
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

  -- one hand-over at a time per member and prize, so the check below
  -- and the insert after it cannot interleave with another officer's
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
    insert into public.reward_claims (user_id, reward_id)
    values (p_user_id, p_reward_id)
    on conflict (user_id, reward_id) do nothing;
  end if;

  insert into public.reward_handovers (user_id, reward_id, handed_by, made_claim)
  values (p_user_id, p_reward_id, auth.uid(), not claimed)
  returning handed_at into at;
  return at;
end $$;

-- Supabase's default privileges grant every new function to anon
-- directly, which `from public` does not take away
revoke all on function public.hand_over_reward(uuid, text) from public, anon;
grant execute on function public.hand_over_reward(uuid, text) to authenticated;

-- ── take back a mistaken hand-over ────────────────────────────────
-- For the wrong name tapped at a busy table: the officer who recorded a
-- hand-over may withdraw it within fifteen minutes. After that it is
-- part of the record. A claim the member made stays; it was theirs. A
-- claim the hand-over wrote for them goes with it, so the wrong name is
-- not left holding a claim they never made.
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
    where user_id = p_user_id and reward_id = p_reward_id;
  end if;
  return true;
end $$;

-- Supabase's default privileges grant every new function to anon
-- directly, which `from public` does not take away
revoke all on function public.undo_hand_over(uuid, text) from public, anon;
grant execute on function public.undo_hand_over(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 2. A STAMP ADDED BY AN OFFICER
--
-- attendance_board_write let any board account insert attendance from a
-- browser, and constrained nothing but the label: an officer could stamp
-- themselves, stamp a meeting next month, or set checked_in_at to any
-- date. Nothing in the app used it. With a one-tap "add by hand" and
-- prizes at 10/20/30 stamps, it would have been a way to hand yourself a
-- prize. It is replaced by one function that does the one thing the
-- club needs: an officer stamps someone else, at today's meeting, now.
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists attendance_board_write on public.attendance;

create or replace function public.stamp_by_hand(p_user_id uuid, p_meeting_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  day date;
  at timestamptz;
begin
  if not public.is_board() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'SELF_STAMP' using errcode = 'P0001';
  end if;

  select meeting_date into day from public.meetings where id = p_meeting_id;
  if not found then
    raise exception 'MEETING_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- the club's calendar day, the rule verify-attendance applies to a scan
  if day <> (now() at time zone 'America/Los_Angeles')::date then
    raise exception 'NOT_TODAY' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0001';
  end if;

  begin
    insert into public.attendance (user_id, meeting_id, verification_method)
    values (p_user_id, p_meeting_id, 'board')
    returning checked_in_at into at;
  exception when unique_violation then
    raise exception 'ALREADY_CHECKED_IN' using errcode = 'P0001';
  end;
  return at;
end $$;

-- Supabase's default privileges grant every new function to anon
-- directly, which `from public` does not take away
revoke all on function public.stamp_by_hand(uuid, uuid) from public, anon;
grant execute on function public.stamp_by_hand(uuid, uuid) to authenticated;
