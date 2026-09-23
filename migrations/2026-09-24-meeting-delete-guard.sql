-- Run once against a Supabase project created before this change.
-- The board's delete policy refused a meeting anyone had checked in to,
-- but not one whose check-in was open: a meeting page read before the
-- open could delete the meeting on the wall (its session cascaded away
-- and members were told their code was not a Keystamp code). The client
-- now refuses too; this puts the rule in the database. Safe to run twice.

drop policy if exists meetings_board_delete on public.meetings;
create policy meetings_board_delete on public.meetings
  for delete to authenticated using (
    public.is_board()
    and not exists (
      select 1 from public.attendance a where a.meeting_id = meetings.id
    )
    -- nor while its check-in is open, or a session for it is live (the
    -- moment between the start and the open): a page read before the
    -- open cannot take the meeting out from under the wall
    and not meetings.check_in_open
    and not exists (
      select 1 from public.attendance_sessions s
      where s.meeting_id = meetings.id and s.ended_at is null
    )
  );
