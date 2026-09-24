-- Run once against a Supabase project created before this change.
-- Safe to run twice.
--
-- Opening and closing check-in become one state change each, made by
-- the database under one lock, instead of a sequence of separate writes
-- in the attendance-session function:
--
--   * Opening refuses (ATTENDANCE_ALREADY_OPEN) while another meeting is
--     taking check-ins. It used to close that meeting, and its session,
--     without a word to the officer running it.
--   * Two officers opening the same meeting at once are served one after
--     the other: the second finds it open and is told so. The second
--     used to get HTTP 500 from the one-live-session index.
--   * A session and its meeting's check_in_open change together, so no
--     session is left running on a closed meeting (or the other way
--     round) by a write that failed halfway.
--
-- Only the attendance-session function (service role) calls these. The
-- board's direct write policies on attendance_sessions and its update
-- policy on meetings are removed: the app never used them, and they let
-- a board account change check-in state around these rules.

create or replace function public.start_check_in(p_meeting_id uuid, p_officer uuid)
returns table (session_id uuid, already_open boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  was_open boolean;
  sid uuid;
begin
  -- one change of check-in state at a time, club-wide
  perform pg_advisory_xact_lock(hashtext('keystamp:check-in'));

  if not exists (select 1 from public.profiles where id = p_officer and role = 'board') then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select check_in_open into was_open from public.meetings where id = p_meeting_id;
  if not found then
    raise exception 'MEETING_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- another meeting taking check-ins is never closed from here
  if exists (select 1 from public.meetings
             where check_in_open and id <> p_meeting_id) then
    raise exception 'ATTENDANCE_ALREADY_OPEN' using errcode = 'P0001';
  end if;

  -- a session left running on a closed meeting takes no scans (the
  -- verifier needs the meeting open); it is ended rather than left behind
  update public.attendance_sessions set ended_at = now()
   where ended_at is null and meeting_id <> p_meeting_id;

  select id into sid from public.attendance_sessions
   where meeting_id = p_meeting_id and ended_at is null;
  if sid is null then
    insert into public.attendance_sessions (meeting_id, started_by)
    values (p_meeting_id, p_officer)
    returning id into sid;
  end if;

  update public.meetings set check_in_open = true
   where id = p_meeting_id and not check_in_open;

  return query select sid, was_open;
end $$;

create or replace function public.end_check_in(p_meeting_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  was_open boolean;
begin
  perform pg_advisory_xact_lock(hashtext('keystamp:check-in'));

  select check_in_open into was_open from public.meetings where id = p_meeting_id;
  if not found then
    raise exception 'MEETING_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- the meeting and its session close together; closing a closed
  -- meeting changes nothing and is not an error
  update public.meetings set check_in_open = false
   where id = p_meeting_id and check_in_open;
  update public.attendance_sessions set ended_at = now()
   where meeting_id = p_meeting_id and ended_at is null;

  return was_open;
end $$;

-- the function's service role only; Supabase's default privileges grant
-- every new function to anon and authenticated directly
revoke all on function public.start_check_in(uuid, uuid) from public, anon, authenticated;
revoke all on function public.end_check_in(uuid) from public, anon, authenticated;
grant execute on function public.start_check_in(uuid, uuid) to service_role;
grant execute on function public.end_check_in(uuid) to service_role;

-- check-in state changes only through the functions above
drop policy if exists sessions_board_insert on public.attendance_sessions;
drop policy if exists sessions_board_update on public.attendance_sessions;
drop policy if exists meetings_board_update on public.meetings;
