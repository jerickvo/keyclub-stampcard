-- Test-data cleanup after the live audit of 12 September 2026.
-- Run once. Both statements are guarded so that they can only remove
-- the rows described here, and running them again removes nothing.

-- 1. The temporary meeting the audit scheduled, opened and closed:
--    GM 99, Wednesday 16 September 2026, 12:40 PM to 1:30 PM, MPR.
--    Nobody checked in. Its two attendance_sessions rows go with it
--    (on delete cascade); attendance rows would block the delete
--    (on delete restrict), and there are none.
delete from public.meetings m
 where m.id = '4cad2c3a-8c4f-47e3-8711-56f91a52f7bd'
   and m.meeting_number = 99
   and m.meeting_date = date '2026-09-16'
   and m.check_in_open = false
   and not exists (select 1 from public.attendance a where a.meeting_id = m.id);

-- 2. The claim the test account made against test meetings that were
--    later purged. jerick claimed Club Merch (r1) on 31 August 2026,
--    nine days before the club's first real meeting; the purge that
--    removed those test meetings took the attendance rows with it
--    (tmp_test_purge_meeting) and left this claim standing on one
--    stamp. The row can only be removed while its owner is below the
--    tier's threshold, so a claim that is backed by stamps is safe.
delete from public.reward_claims rc
 where rc.user_id = 'b86092fd-d17c-470b-a2b8-73293829082b'
   and rc.reward_id = 'r1'
   and rc.claimed_at = timestamptz '2026-08-31 04:22:25.453708+00'
   and (select count(*) from public.attendance a where a.user_id = rc.user_id) < 10;
