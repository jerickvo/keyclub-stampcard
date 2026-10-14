-- Run once against a Supabase project created before this change.
-- Safe to run twice. The page and the functions already live work with
-- it as they are: the page schedules a meeting closed, as the officer
-- signed in.
--
-- A board account's own insert into meetings was checked only for being
-- a board account. So a row could arrive with check_in_open = true and no
-- session: a meeting that shows as taking check-ins, takes no scans (the
-- verifier needs a live session), and refuses every other meeting's
-- opening (ATTENDANCE_ALREADY_OPEN) until someone closes it. The same
-- insert could name another officer as the one who scheduled it.
--
-- Check-in state changes only through start_check_in() and
-- end_check_in() (2026-09-24-check-in-transitions.sql), so a meeting is
-- created closed; and its creator is the account that created it.

drop policy if exists meetings_board_insert on public.meetings;
create policy meetings_board_insert on public.meetings
  for insert with check (
    public.is_board()
    and not check_in_open
    and (created_by is null or created_by = auth.uid())
  );
