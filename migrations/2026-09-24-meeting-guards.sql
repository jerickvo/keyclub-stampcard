-- Run once against a Supabase project created before this change.
-- Safe to run twice.
--
-- 1. The board's delete policy refused a meeting anyone had checked in
--    to, but not one whose check-in was open: a meeting page read before
--    the open could delete the meeting on the wall (its session cascaded
--    away and members were told their code was not a Keystamp code). The
--    client now refuses too; this puts the rule in the database. A
--    session left live on a closed meeting does not block the delete: it
--    takes no scans (the verifier needs the meeting open) and goes with
--    the meeting.
-- 2. A meeting date needs a four-digit year: a slip in the date control
--    (20266) was stored and shown as some other day. NOT VALID: it holds
--    every row written from now on and does not re-check old ones.

drop policy if exists meetings_board_delete on public.meetings;
create policy meetings_board_delete on public.meetings
  for delete to authenticated using (
    public.is_board()
    and not exists (
      select 1 from public.attendance a where a.meeting_id = meetings.id
    )
    and not meetings.check_in_open
  );

alter table public.meetings drop constraint if exists meeting_date_range;
alter table public.meetings add constraint meeting_date_range
  check (meeting_date between date '2000-01-01' and date '2999-12-31') not valid;
