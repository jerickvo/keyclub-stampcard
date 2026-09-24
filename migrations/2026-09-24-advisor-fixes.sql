-- Run once against a Supabase project created before this change.
-- Safe to run twice. What the Supabase database advisors reported, and
-- what is done about each:
--
-- 1. touch_updated_at had no fixed search_path (function_search_path_mutable).
--    It is pinned like every other function here.
-- 2. The trigger functions (handle_new_user, freeze_identity_fields,
--    touch_updated_at) were callable as RPCs by anon and signed-in users
--    (Supabase's default privileges grant every function). A trigger
--    function called as an RPC only errors, but nothing should call them
--    that way; a trigger does not need EXECUTE granted to fire.
-- 3. attendance.meeting_id had no index (unindexed_foreign_keys): every
--    count of a meeting's attendance, and every delete of a meeting,
--    scanned the whole table. The two small foreign keys the advisor also
--    lists (attendance_sessions.started_by, meetings.created_by) get one
--    too, so deleting a profile never scans those tables.
--
-- is_board() stays callable by anon: it answers false there, and the
-- read policies that call it are evaluated for anon too (an anonymous
-- read of attendance returns no rows; without EXECUTE it would error).
--
-- Leaked-password protection is an Auth setting, not SQL: it is switched
-- on in the Supabase dashboard (Authentication, password security).

alter function public.touch_updated_at() set search_path = pg_catalog, public;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.freeze_identity_fields() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create index if not exists attendance_meeting_id_idx on public.attendance (meeting_id);
create index if not exists attendance_sessions_started_by_idx on public.attendance_sessions (started_by);
create index if not exists meetings_created_by_idx on public.meetings (created_by);
