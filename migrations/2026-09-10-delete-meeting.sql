-- Run once against a Supabase project created before this change.
-- Replaces tmp_test_purge_meeting with delete_meeting_and_stamps.
-- Safe to run twice: the create is idempotent and the drop is guarded.

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

revoke all on function public.delete_meeting_and_stamps(uuid) from public;
grant execute on function public.delete_meeting_and_stamps(uuid) to authenticated;

revoke all on function public.tmp_test_purge_meeting(uuid) from authenticated;
drop function if exists public.tmp_test_purge_meeting(uuid);
