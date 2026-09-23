-- ═══════════════════════════════════════════════════════════════════
-- keystamp — schema
--
-- The security model in one line: the client is never trusted. Every
-- table is row-level-security protected, members can only ever read
-- their own attendance, and NOBODY can write attendance from the
-- client — that is reserved for the verification function in Phase 3.
-- ═══════════════════════════════════════════════════════════════════

-- ── profiles ───────────────────────────────────────────────────────
-- Supabase Auth is email-backed, but the member never sees an email:
-- the app maps username -> <username>@keystamp.invalid internally.
-- The username lives here and is the only identifier in the UI.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  -- canonical, always lower case: this is what uniqueness is enforced on
  username     text not null
                 check (username ~ '^[a-z0-9_.]{3,24}$'),
  -- the casing the member typed, shown in the UI
  display_name text,
  role         text not null default 'member'
                 check (role in ('member','board')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Jvo / jvo / JVO cannot become three identities. Enforced here, not
-- only in JavaScript, because JavaScript is editable by the person it
-- is meant to constrain.
-- The sign-up form also asks for a letter or digit and no leading,
-- trailing or doubled period (a name of dots reads as a placeholder, and
-- the name makes the sign-in address). Held here too, since the form is
-- editable by the person it constrains. NOT VALID: rows made before the
-- rule are not re-checked.
alter table public.profiles drop constraint if exists username_shape;
alter table public.profiles add constraint username_shape
  check (username ~ '[a-z0-9]' and username !~ '^\.|\.$|\.\.') not valid;

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username));

-- reserved names that would let an account impersonate the system
alter table public.profiles drop constraint if exists username_not_reserved;
alter table public.profiles add constraint username_not_reserved
  check (lower(username) not in
    ('admin','administrator','board','keystamp','root','system','staff',
     'moderator','mod','owner','support','null','undefined'));

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── meetings ───────────────────────────────────────────────────────
-- Created by the board. The client no longer generates a schedule.
-- The meeting's own date is the source of truth: a general meeting may
-- fall on any day of the week. The one club rule enforced here rather
-- than in JavaScript — because JavaScript is editable by the person it
-- is meant to constrain — is that every meeting is in the MPR
-- (exactly that string).
create table if not exists public.meetings (
  id             uuid primary key default gen_random_uuid(),
  meeting_number integer not null unique,
  meeting_date   date not null,
  start_time     text not null,
  end_time       text,
  location       text not null default 'MPR'
                   check (location = 'MPR'),
  check_in_open  boolean not null default false,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id),
  -- a meeting that ends before it starts is a typo, not a meeting.
  -- The columns hold a 12-hour clock as text, so the comparison has to
  -- be on the times, not on the strings.
  constraint meeting_time_order
    check (end_time is null or start_time::time < end_time::time)
);

-- Meetings were once restricted to Wednesdays. They are not: a general
-- meeting may fall on any weekday, and the stored date is the only
-- authority. `create table if not exists` cannot remove a constraint
-- from a table that already exists, so drop it explicitly — re-running
-- this file against a live project is what migrates it.
--
-- THIS STATEMENT IS THE ONE THAT UNBLOCKS NON-WEDNESDAY MEETINGS.
-- While it has not been applied, the database refuses every meeting
-- that is not a Wednesday with SQLSTATE 23514, no matter what the app
-- sends.
alter table public.meetings drop constraint if exists meeting_is_wednesday;

-- start_time and end_time are text holding a 12-hour clock, so the
-- original rule compared them as text: "9:15 AM" sorts AFTER "10:15 AM",
-- and a 9:15–10:15 meeting was refused as though it ended before it
-- began. Compare the times themselves.
alter table public.meetings drop constraint if exists meeting_time_order;
alter table public.meetings add constraint meeting_time_order
  check (end_time is null or start_time::time < end_time::time);

-- A four-digit year: a slip in the date control (20266) is refused
-- rather than stored and shown as some other day. NOT VALID: it holds
-- every row written from now on and does not re-check old ones.
alter table public.meetings drop constraint if exists meeting_date_range;
alter table public.meetings add constraint meeting_date_range
  check (meeting_date between date '2000-01-01' and date '2999-12-31') not valid;

-- Only one meeting may take check-ins at a time.
create unique index if not exists one_open_meeting
  on public.meetings ((check_in_open)) where check_in_open;

-- ── attendance sessions ────────────────────────────────────────────
-- One row per "the board has started check-in". A QR token carries a
-- session id, so ending the session invalidates every token already
-- printed, photographed or forwarded — without waiting for expiry.
create table if not exists public.attendance_sessions (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  started_by uuid not null references public.profiles(id),
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);

-- at most one running session per meeting
create unique index if not exists one_live_session_per_meeting
  on public.attendance_sessions (meeting_id) where ended_at is null;

-- ── attendance ─────────────────────────────────────────────────────
-- The stamp record. The unique constraint is the real defence against
-- double-stamping; the client-side "already stamped" check is only a
-- courtesy message.
create table if not exists public.attendance (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  meeting_id          uuid not null references public.meetings(id) on delete restrict,
  checked_in_at       timestamptz not null default now(),
  verification_method text not null default 'qr'
                        check (verification_method in ('qr','manual','board')),
  created_at          timestamptz not null default now(),
  constraint one_stamp_per_meeting unique (user_id, meeting_id)
);

-- `create table if not exists` is a no-op on a database that already has
-- the table, so the CASCADE -> RESTRICT change is applied explicitly.
-- Removing DELETE from the board policy closes the browser route; this
-- closes the other one. A service-role script deleting a meeting that
-- has attendance now fails loudly instead of silently taking the stamps
-- with it. An EMPTY meeting (a typo, created and removed) still deletes.
do $$
begin
  if exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'attendance'
      and c.conname = 'attendance_meeting_id_fkey'
      and c.confdeltype = 'c'                       -- 'c' = cascade
  ) then
    alter table public.attendance drop constraint attendance_meeting_id_fkey;
    alter table public.attendance add constraint attendance_meeting_id_fkey
      foreign key (meeting_id) references public.meetings(id) on delete restrict;
  end if;
end $$;

-- ── reward claims ──────────────────────────────────────────────────
-- Tier definitions (10/20/30) are product rules and live in the
-- client. Whether a member has claimed one is data and lives here.
create table if not exists public.reward_claims (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  reward_id  text not null check (reward_id in ('r1','r2','r3')),
  claimed_at timestamptz not null default now(),
  constraint one_claim_per_reward unique (user_id, reward_id)
);

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════
alter table public.profiles      enable row level security;
alter table public.meetings      enable row level security;
alter table public.attendance    enable row level security;
alter table public.reward_claims enable row level security;
alter table public.attendance_sessions enable row level security;

-- Defined BEFORE any policy uses it. (An earlier revision of this file
-- had a policy calling public.is_board() above this definition, which
-- fails with "function does not exist" — Postgres checks a policy's
-- USING/CHECK expression against real, already-created functions at
-- creation time, unlike a function body, which only resolves names
-- when it actually runs.)
-- SECURITY DEFINER, so search_path is pinned explicitly. `= public`
-- relied on Postgres implicitly prepending pg_catalog; naming both
-- means the resolution order cannot change under us, and pg_temp is
-- deliberately absent so a caller cannot shadow a name with a
-- temporary object. The body takes no arguments, so there is no
-- caller-controlled value for it to trust: it answers one question
-- about auth.uid() and returns a boolean.
create or replace function public.is_board()
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce((select role = 'board' from public.profiles where id = auth.uid()), false);
$$;

-- is_board() reads a row the caller may not select directly, so it is
-- only ever meant to be called from a policy. Callable by signed-in
-- users (policies evaluate as them), never by anon.
revoke all on function public.is_board() from public;
grant execute on function public.is_board() to authenticated;

-- Sessions are board-only in every direction. Members never need to
-- read them, and a member who could read one would learn a session id
-- that appears inside tokens.
-- Board-only in every direction EXCEPT delete. A session is the record
-- of "check-in was open at this time", which is the audit trail behind
-- every stamp it produced; deleting one from a browser is never part of
-- running a meeting. Ending a session is an UPDATE (ended_at), which is
-- what the attendance-session function actually does.
drop policy if exists sessions_board_only on public.attendance_sessions;
drop policy if exists sessions_board_read on public.attendance_sessions;
create policy sessions_board_read on public.attendance_sessions
  for select using (public.is_board());
drop policy if exists sessions_board_insert on public.attendance_sessions;
create policy sessions_board_insert on public.attendance_sessions
  for insert with check (public.is_board());
drop policy if exists sessions_board_update on public.attendance_sessions;
create policy sessions_board_update on public.attendance_sessions
  for update using (public.is_board()) with check (public.is_board());

revoke delete on public.attendance_sessions from anon, authenticated;
revoke truncate on public.attendance_sessions from anon, authenticated;

-- attendance and reward_claims have no update or delete policy at all,
-- so both are already closed. The grants are revoked to match, for the
-- same reason as above.
revoke delete, truncate on public.attendance from anon, authenticated;
revoke delete, truncate on public.reward_claims from anon, authenticated;
revoke delete, truncate on public.profiles from anon, authenticated;

-- profiles: a member reads their OWN row and nothing else. Board
-- administration does not go through this policy at all — it goes
-- through the board-data Edge Function, which checks the role server
-- side. Keeping board out of the select policy means a member cannot
-- enumerate accounts even if a future bug mislabels their role in a
-- JWT claim: the policy compares row ownership only.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid());

-- A member may update their own row, but the two fields that confer
-- identity and authority are frozen. Without this a member could PATCH
-- role='board' with a perfectly valid session and become board.
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.freeze_identity_fields()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  -- id and created_at are frozen for EVERYONE, board included. The RLS
  -- WITH CHECK already pins id to auth.uid(), but a policy is one edit
  -- away from being loosened and a row that can change its primary key
  -- can move a member's whole attendance history onto another account.
  if new.id is distinct from old.id then
    raise exception 'account id cannot be changed';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;
  -- A trusted server context — the service role, or psql — carries no
  -- auth.uid(). WITHOUT this branch, supabase/bootstrap-board.mjs cannot
  -- work at all: it upserts role='board' with the service role, the
  -- trigger fires, is_board() is false (there is no signed-in user to
  -- read a role for), and the promotion is refused with
  --   'role is assigned by the club, not by the account'
  -- leaving the club with no way to create its first board account.
  --
  -- It is not reachable from a browser. profiles_self_update requires
  -- id = auth.uid(), and `id = null` matches no row, so anon and
  -- authenticated callers are filtered out by RLS before the trigger
  -- ever runs. Only a connection that already bypasses RLS gets here.
  if auth.uid() is null then return new; end if;

  if public.is_board() then return new; end if;   -- board tooling may reassign
  if new.role is distinct from old.role then
    raise exception 'role is assigned by the club, not by the account';
  end if;
  if new.username is distinct from old.username then
    raise exception 'username cannot be changed';
  end if;
  -- The display name is the username as it was typed at sign-up; only
  -- its case may change. Anything else would let a member rename
  -- themselves as another member on the board's roster and lists.
  if new.display_name is distinct from old.display_name
     and lower(coalesce(new.display_name, '')) <> lower(new.username) then
    raise exception 'display name is the username';
  end if;
  return new;
end $$;

drop trigger if exists profiles_freeze on public.profiles;
create trigger profiles_freeze before update on public.profiles
  for each row execute function public.freeze_identity_fields();

-- meetings: everyone signed in may read the schedule; only board writes
drop policy if exists meetings_read on public.meetings;
create policy meetings_read on public.meetings
  for select to authenticated using (true);

-- Board writes are split into one policy per verb. INSERT and UPDATE are
-- below; DELETE is granted separately and narrowly, further down.
--
-- The original `for all` policy included DELETE while attendance.meeting_id
-- was `on delete cascade`. That meant one board account, with nothing but
-- the public anon key and their own session, could issue
--   DELETE /rest/v1/meetings?id=eq.<uuid>
-- from a browser console and silently erase every stamp anyone had ever
-- earned at that meeting. Splitting the verbs is what makes the narrow
-- delete policy below expressible: it can carry its own NOT EXISTS guard
-- instead of inheriting a blanket grant.
drop policy if exists meetings_board_write on public.meetings;
drop policy if exists meetings_board_insert on public.meetings;
create policy meetings_board_insert on public.meetings
  for insert with check (public.is_board());
drop policy if exists meetings_board_update on public.meetings;
create policy meetings_board_update on public.meetings
  for update using (public.is_board()) with check (public.is_board());

-- Board members may delete a meeting they created by mistake -- the
-- wrong date, a duplicate number -- but ONLY while it is empty.
--
-- The NOT EXISTS clause is the whole safety property. A meeting that
-- anyone has checked in to is invisible to this policy, so the DELETE
-- matches no row and removes nothing. That makes "delete the wrong
-- meeting" easy and "delete last month's attendance" impossible, without
-- relying on the interface to tell the difference. The ON DELETE RESTRICT
-- foreign key stays as the backstop underneath it.
drop policy if exists meetings_board_delete on public.meetings;
create policy meetings_board_delete on public.meetings
  for delete to authenticated using (
    public.is_board()
    and not exists (
      select 1 from public.attendance a where a.meeting_id = meetings.id
    )
    -- nor while its check-in is open: a page read before the open
    -- cannot take the meeting out from under the wall. (A session left
    -- live on a closed meeting takes no scans, since the verifier needs
    -- the meeting open, and goes with the meeting.)
    and not meetings.check_in_open
  );

grant delete on public.meetings to authenticated;
revoke delete on public.meetings from anon;
revoke truncate on public.meetings from anon, authenticated;

-- attendance: you may READ your own row and nothing else.
-- There is deliberately NO client insert policy: a member cannot write
-- their own attendance even with a valid session. Inserts come from
-- the verification Edge Function (service role) or from a board member.
-- attendance: your own rows only. A member cannot read another
-- member's attendance, and cannot count the room. Board reads go
-- through board-data. The one exception is the live count on the board
-- QR screen, which is also board-gated in the client and would return
-- zero rows for a member here anyway.
drop policy if exists attendance_self_read on public.attendance;
create policy attendance_self_read on public.attendance
  for select using (user_id = auth.uid() or public.is_board());

-- Board members add someone by hand (a broken phone, a flat battery)
-- through stamp_by_hand() at the end of this file, not by inserting
-- here: there is no member insert, no board insert, no update policy and
-- no delete policy on this table for anyone, so a stamp cannot be
-- written, edited or removed from a browser. The verify-attendance
-- function writes with the service role, which bypasses RLS by design.
-- (An earlier attendance_board_write policy let a board account insert
-- any row labelled 'manual' or 'board': a stamp for themselves, for a
-- meeting next month, at any checked_in_at. It is dropped.)
drop policy if exists attendance_board_write on public.attendance;

-- reward claims: yours to read and to claim, but only once you have
-- actually earned the tier. The threshold is checked in the database
-- against real attendance, so editing JavaScript cannot unlock a prize.
drop policy if exists claims_self_read on public.reward_claims;
create policy claims_self_read on public.reward_claims
  for select using (user_id = auth.uid() or public.is_board());

drop policy if exists claims_self_insert on public.reward_claims;
create policy claims_self_insert on public.reward_claims
  for insert with check (
    user_id = auth.uid()
    and (select count(*) from public.attendance a where a.user_id = auth.uid())
        >= case reward_id when 'r1' then 10 when 'r2' then 20 else 30 end
  );

-- ── new sign-ups get a profile row automatically ───────────────────
-- SECURITY DEFINER because it writes public.profiles during the auth
-- transaction, before the new account has any session to write with.
-- The only caller-controlled values it touches are username and
-- display_name, and both land in a column guarded by a CHECK constraint
-- and the reserved-name constraint, so a hostile sign-up payload can
-- fail the insert but cannot write something the constraints forbid.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  uname text := case
    when lower(coalesce(new.raw_user_meta_data->>'username',''))
         = lower(split_part(new.email, '@', 1))
    then lower(new.raw_user_meta_data->>'username')
    else lower(split_part(new.email, '@', 1))
  end;
  typed text := new.raw_user_meta_data->>'display_name';
begin
  -- role is deliberately NOT read from raw_user_meta_data. Anything the
  -- browser sends at sign-up is ignored; every new account is a member.
  -- Keystamp derives the login address FROM the username, so the two
  -- must agree. Taking the metadata name on trust let a hostile client
  -- call auth.signUp directly with email x@... and username 'y': an
  -- account the board roster shows as "y" but which actually signs in
  -- as x. On any mismatch the address wins, because the address is what
  -- authenticates. display_name is the one member-controlled string
  -- other members see: it is the username as it was typed (its case
  -- kept), and one that says anything else (another member's name) is
  -- not taken; the username stands in.
  insert into public.profiles (id, username, display_name, role)
  values (new.id, uname,
          case when lower(coalesce(typed, '')) = uname then typed else uname end,
          'member');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════
-- DELETE A HELD MEETING AND THE STAMPS ON IT
--
-- The normal delete path (meetings_board_delete) only removes a
-- meeting nothing has checked in to: attendance has no delete policy,
-- and the foreign key is ON DELETE RESTRICT. Those stay as they are.
-- This function is the one audited way through them, for the case the
-- board actually needs — a meeting that was held, is over, and has to
-- come off the record along with the stamps it handed out.
--
-- Board-only is enforced HERE, in the database, by is_board(), not by
-- the button being hidden. Held-and-over is enforced here too, so a
-- meeting that is running right now can never be taken out from under
-- the members checking in to it.
--
-- No soft delete, no archive, no undo. attendance_sessions rows go
-- with the meeting through the existing ON DELETE CASCADE.
--
-- This replaced tmp_test_purge_meeting. A project created before that
-- change still carries the old name until
-- migrations/2026-09-10-delete-meeting.sql is run against it.
-- ═══════════════════════════════════════════════════════════════════
create or replace function public.delete_meeting_and_stamps(p_meeting_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  removed integer;
begin
  if not public.is_board() then
    raise exception 'only board accounts can delete a meeting';
  end if;

  -- held means the club's day has moved on and check-in is closed
  if not exists (
    select 1 from public.meetings m
    where m.id = p_meeting_id
      and m.check_in_open = false
      and m.meeting_date < (now() at time zone 'America/Los_Angeles')::date
  ) then
    raise exception 'only a meeting that is over can be deleted';
  end if;

  delete from public.attendance where meeting_id = p_meeting_id;
  get diagnostics removed = row_count;
  delete from public.meetings where id = p_meeting_id;
  return removed;
end $$;

revoke all on function public.delete_meeting_and_stamps(uuid) from public, anon;
grant execute on function public.delete_meeting_and_stamps(uuid) to authenticated;

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
    -- the member's own claim can land between the check above and this
    -- insert (their insert does not take the lock); the hand-over made
    -- the claim only if this insert is the one that wrote it
    insert into public.reward_claims (user_id, reward_id)
    values (p_user_id, p_reward_id)
    on conflict (user_id, reward_id) do nothing;
    made := found;
  end if;

  insert into public.reward_handovers (user_id, reward_id, handed_by, made_claim)
  values (p_user_id, p_reward_id, auth.uid(), made)
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
