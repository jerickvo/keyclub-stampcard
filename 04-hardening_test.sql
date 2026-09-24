-- Check-in transitions, claim ownership and the advisor fixes
-- (migrations/2026-09-24-check-in-transitions.sql, -claim-ownership.sql,
-- -advisor-fixes.sql), tested against real Postgres. Runs after
-- 02-rls_test.sql and 03-handover_test.sql, whose test helpers it uses.
--   fresh project:    00-supabase.sql, schema.sql, 02, 03, this
--   existing project: 00-supabase.sql, the previous schema.sql, 02, the
--                     migrations (each twice), 03, this

\set QUIET on
\pset pager off
set client_min_messages = warning;

truncate test.results;

-- ── fixtures: two officers, three members with ten stamps each ──
insert into auth.users(id, email, raw_user_meta_data) values
  ('70000000-0000-0000-0000-000000000001','dean@keystamp.invalid',  '{"username":"dean"}'),
  ('70000000-0000-0000-0000-000000000002','provost@keystamp.invalid','{"username":"provost"}'),
  ('70000000-0000-0000-0000-000000000003','dana@keystamp.invalid',   '{"username":"dana","display_name":"Dana"}'),
  ('70000000-0000-0000-0000-000000000004','eli@keystamp.invalid',    '{"username":"eli"}'),
  ('70000000-0000-0000-0000-000000000005','fay@keystamp.invalid',    '{"username":"fay"}');
select test.try('service_role', null,
  $$update public.profiles set role = 'board' where id in
    ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002')$$);
insert into public.meetings(id, meeting_number, meeting_date, start_time, end_time)
  select ('c0000000-0000-0000-0000-0000000000'||lpad(i::text, 2, '0'))::uuid, 700 + i,
         date '2026-01-01' + i, '12:40 PM', '1:30 PM'
  from generate_series(10, 21) i;
insert into public.attendance(user_id, meeting_id)
  select u::uuid, ('c0000000-0000-0000-0000-0000000000'||i)::uuid
  from generate_series(10, 19) i,
       unnest(array['70000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000004',
                    '70000000-0000-0000-0000-000000000005']) u;

-- ══ 1. OPENING AND CLOSING CHECK-IN ══
select test.ck('a signed-in account cannot call start_check_in',
  test.try('authenticated','70000000-0000-0000-0000-000000000001',
    $$select public.start_check_in('c0000000-0000-0000-0000-000000000020','70000000-0000-0000-0000-000000000001')$$), '42501');
select test.ck('nor end_check_in',
  test.try('authenticated','70000000-0000-0000-0000-000000000001',
    $$select public.end_check_in('c0000000-0000-0000-0000-000000000020')$$), '42501');
select test.ck('nor anon',
  test.try('anon', null,
    $$select public.start_check_in('c0000000-0000-0000-0000-000000000020','70000000-0000-0000-0000-000000000001')$$), '42501');
select test.ck('a member cannot be the officer who opens',
  test.msg('service_role', null,
    $$select public.start_check_in('c0000000-0000-0000-0000-000000000020','70000000-0000-0000-0000-000000000003')$$), 'P0001 NOT_AUTHORIZED');
select test.ck('an unknown meeting is refused by name',
  test.msg('service_role', null,
    $$select public.start_check_in('c0000000-0000-0000-0000-0000000000ff','70000000-0000-0000-0000-000000000001')$$), 'P0001 MEETING_NOT_FOUND');

-- whatever the earlier suites left open is closed first
update public.meetings set check_in_open = false where check_in_open;
update public.attendance_sessions set ended_at = now() where ended_at is null;

select test.ck('the service role opens GM 720',
  test.val('service_role', null,
    $$select already_open::text from public.start_check_in('c0000000-0000-0000-0000-000000000020','70000000-0000-0000-0000-000000000001')$$), 'false');
select test.ck('GM 720 is open with one live session',
  (select check_in_open::text || ' ' || (select count(*) from public.attendance_sessions s
     where s.meeting_id = m.id and s.ended_at is null)
   from public.meetings m where m.meeting_number = 720), 'true 1');
select test.ck('opening it again is not an error: already open, same session',
  test.val('service_role', null,
    $$select already_open::text || ' ' || (session_id = (select id from public.attendance_sessions
        where meeting_id='c0000000-0000-0000-0000-000000000020' and ended_at is null))::text
      from public.start_check_in('c0000000-0000-0000-0000-000000000020','70000000-0000-0000-0000-000000000002')$$), 'true true');
select test.ck('still exactly one live session for it',
  (select count(*)::text from public.attendance_sessions
    where meeting_id='c0000000-0000-0000-0000-000000000020' and ended_at is null), '1');
select test.ck('opening another meeting is refused while GM 720 is open',
  test.msg('service_role', null,
    $$select public.start_check_in('c0000000-0000-0000-0000-000000000021','70000000-0000-0000-0000-000000000002')$$), 'P0001 ATTENDANCE_ALREADY_OPEN');
select test.ck('and GM 720 is untouched by the refusal',
  (select check_in_open::text || ' ' || (select count(*) from public.attendance_sessions s
     where s.meeting_id = m.id and s.ended_at is null)
   from public.meetings m where m.meeting_number = 720), 'true 1');
select test.ck('GM 721 was not opened and has no session',
  (select check_in_open::text || ' ' || (select count(*) from public.attendance_sessions s
     where s.meeting_id = m.id)
   from public.meetings m where m.meeting_number = 721), 'false 0');

select test.ck('closing GM 720 says it was open',
  test.val('service_role', null,
    $$select public.end_check_in('c0000000-0000-0000-0000-000000000020')::text$$), 'true');
select test.ck('closed together: meeting shut, no live session',
  (select check_in_open::text || ' ' || (select count(*) from public.attendance_sessions s
     where s.meeting_id = m.id and s.ended_at is null)
   from public.meetings m where m.meeting_number = 720), 'false 0');
select test.ck('closing it again changes nothing and is not an error',
  test.val('service_role', null,
    $$select public.end_check_in('c0000000-0000-0000-0000-000000000020')::text$$), 'false');

-- a session left running on a closed meeting (made by hand here)
insert into public.attendance_sessions(meeting_id, started_by)
  values ('c0000000-0000-0000-0000-000000000020','70000000-0000-0000-0000-000000000001');
select test.ck('now GM 721 opens',
  test.val('service_role', null,
    $$select already_open::text
      from public.start_check_in('c0000000-0000-0000-0000-000000000021','70000000-0000-0000-0000-000000000001')$$), 'false');
select test.ck('and the stray session on GM 720 is ended',
  (select count(*)::text from public.attendance_sessions
    where meeting_id='c0000000-0000-0000-0000-000000000020' and ended_at is null), '0');
select test.val('service_role', null, $$select public.end_check_in('c0000000-0000-0000-0000-000000000021')::text$$);

-- ══ 2. NOBODY CHANGES CHECK-IN STATE AROUND THE FUNCTIONS ══
select test.ck('board cannot insert a session directly',
  test.try('authenticated','70000000-0000-0000-0000-000000000001',
    $$insert into public.attendance_sessions(meeting_id, started_by) values ('c0000000-0000-0000-0000-000000000021','70000000-0000-0000-0000-000000000001')$$), '42501');
select test.try('authenticated','70000000-0000-0000-0000-000000000001',
  $$update public.meetings set check_in_open = true where meeting_number = 721$$);
select test.ck('board cannot open check-in by updating the meeting',
  (select check_in_open::text from public.meetings where meeting_number = 721), 'false');
select test.try('authenticated','70000000-0000-0000-0000-000000000001',
  $$update public.meetings set meeting_date = '2027-01-01' where meeting_number = 721$$);
select test.ck('nor edit a meeting at all',
  (select meeting_date::text from public.meetings where meeting_number = 721), '2026-01-22');
select test.ck('the board still reads sessions',
  test.val('authenticated','70000000-0000-0000-0000-000000000001',
    $$select (count(*) > 0)::text from public.attendance_sessions$$), 'true');

-- ══ 3. WHO OWNS A CLAIM ══
-- (a) the member claims first; the hand-over did not make it; Undo keeps it
select test.ck('dana claims r1 herself',
  test.try('authenticated','70000000-0000-0000-0000-000000000003',
    $$select public.claim_reward('r1')$$), 'OK');
select test.ck('the claim is hers',
  (select claimed_by::text from public.reward_claims
    where user_id='70000000-0000-0000-0000-000000000003' and reward_id='r1'), '70000000-0000-0000-0000-000000000003');
select test.try('authenticated','70000000-0000-0000-0000-000000000001',
  $$select public.hand_over_reward('70000000-0000-0000-0000-000000000003','r1')$$);
select test.ck('the hand-over did not make her claim',
  (select made_claim::text from public.reward_handovers
    where user_id='70000000-0000-0000-0000-000000000003' and reward_id='r1'), 'false');
select test.try('authenticated','70000000-0000-0000-0000-000000000001',
  $$select public.undo_hand_over('70000000-0000-0000-0000-000000000003','r1')$$);
select test.ck('Undo takes the hand-over back and leaves her claim',
  (select count(*)::text from public.reward_claims
    where user_id='70000000-0000-0000-0000-000000000003' and reward_id='r1')
  || ' ' || (select count(*) from public.reward_handovers
    where user_id='70000000-0000-0000-0000-000000000003' and reward_id='r1'), '1 0');

-- (b) the officer hands over first (writing the claim); the member then
-- presses Claim; the officer's Undo must not take her claim
select test.try('authenticated','70000000-0000-0000-0000-000000000001',
  $$select public.hand_over_reward('70000000-0000-0000-0000-000000000004','r1')$$);
select test.ck('the hand-over wrote eli''s claim, as the officer''s',
  (select claimed_by::text from public.reward_claims
    where user_id='70000000-0000-0000-0000-000000000004' and reward_id='r1'), '70000000-0000-0000-0000-000000000001');
select test.ck('eli presses Claim: accepted, not an error',
  test.try('authenticated','70000000-0000-0000-0000-000000000004',
    $$select public.claim_reward('r1')$$), 'OK');
select test.ck('the claim is now his own',
  (select claimed_by::text from public.reward_claims
    where user_id='70000000-0000-0000-0000-000000000004' and reward_id='r1'), '70000000-0000-0000-0000-000000000004');
select test.ck('the officer undoes the hand-over',
  test.try('authenticated','70000000-0000-0000-0000-000000000001',
    $$select public.undo_hand_over('70000000-0000-0000-0000-000000000004','r1')$$), 'OK');
select test.ck('eli keeps the claim he made',
  (select count(*)::text from public.reward_claims
    where user_id='70000000-0000-0000-0000-000000000004' and reward_id='r1'), '1');
select test.ck('eli, reloading, reads his claim and no hand-over',
  test.val('authenticated','70000000-0000-0000-0000-000000000004',
    $$select (select count(*) from public.reward_claims where reward_id='r1')::text
      || ' ' || (select count(*) from public.reward_handovers where reward_id='r1')$$), '1 0');
select test.ck('another officer reads the same',
  test.val('authenticated','70000000-0000-0000-0000-000000000002',
    $$select (select count(*) from public.reward_claims where user_id='70000000-0000-0000-0000-000000000004' and reward_id='r1')::text
      || ' ' || (select count(*) from public.reward_handovers where user_id='70000000-0000-0000-0000-000000000004' and reward_id='r1')$$), '1 0');

-- (c) the officer hands over for a member who never pressed Claim; Undo
-- (the wrong name) takes the claim it wrote back with it
select test.try('authenticated','70000000-0000-0000-0000-000000000001',
  $$select public.hand_over_reward('70000000-0000-0000-0000-000000000005','r1')$$);
select test.try('authenticated','70000000-0000-0000-0000-000000000001',
  $$select public.undo_hand_over('70000000-0000-0000-0000-000000000005','r1')$$);
select test.ck('a claim the hand-over wrote goes with its Undo',
  (select count(*)::text from public.reward_claims
    where user_id='70000000-0000-0000-0000-000000000005' and reward_id='r1'), '0');

-- (d) claim_reward's own rules
select test.ck('claiming again is not an error (a retry, a second tab)',
  test.try('authenticated','70000000-0000-0000-0000-000000000003',
    $$select public.claim_reward('r1')$$), 'OK');
select test.ck('and there is still one claim',
  (select count(*)::text from public.reward_claims
    where user_id='70000000-0000-0000-0000-000000000003' and reward_id='r1'), '1');
select test.ck('a tier not earned is refused by name',
  test.msg('authenticated','70000000-0000-0000-0000-000000000003',
    $$select public.claim_reward('r2')$$), 'P0001 NOT_EARNED');
select test.ck('an invented tier is refused by name',
  test.msg('authenticated','70000000-0000-0000-0000-000000000003',
    $$select public.claim_reward('r9')$$), 'P0001 INVALID_REWARD');
select test.ck('anon cannot claim',
  test.try('anon', null, $$select public.claim_reward('r1')$$), '42501');
select test.ck('a member cannot record their own insert as someone else''s',
  test.try('authenticated','70000000-0000-0000-0000-000000000005',
    $$insert into public.reward_claims(user_id, reward_id, claimed_by) values ('70000000-0000-0000-0000-000000000005','r1','70000000-0000-0000-0000-000000000001')$$), '42501');
select test.ck('a member''s direct insert (an older page) is recorded as theirs',
  test.try('authenticated','70000000-0000-0000-0000-000000000005',
    $$insert into public.reward_claims(user_id, reward_id) values ('70000000-0000-0000-0000-000000000005','r1')$$), 'OK');
select test.ck('claimed_by comes from the session',
  (select claimed_by::text from public.reward_claims
    where user_id='70000000-0000-0000-0000-000000000005' and reward_id='r1'), '70000000-0000-0000-0000-000000000005');
select test.ck('nobody can change who made a claim',
  test.refused('authenticated','70000000-0000-0000-0000-000000000005',
    $$update public.reward_claims set claimed_by = '70000000-0000-0000-0000-000000000001' where user_id = auth.uid()$$), 'refused');

-- ══ 4. THE ADVISOR FIXES ══
select test.ck('anon''s is_board answers false (kept callable)',
  test.val('anon', null, $$select public.is_board()::text$$), 'false');
select test.ck('so an anonymous read of attendance is empty, not an error',
  test.val('anon', null, $$select count(*)::text from public.attendance$$), '0');
select test.ck('a signed-in account can (policies need it)',
  test.try('authenticated','70000000-0000-0000-0000-000000000003', $$select public.is_board()$$), 'OK');
select test.ck('a trigger function is not an RPC (anon)',
  test.try('anon', null, $$select public.handle_new_user()$$), '42501');
select test.ck('nor for a signed-in account',
  test.try('authenticated','70000000-0000-0000-0000-000000000003', $$select public.touch_updated_at()$$), '42501');
select test.ck('touch_updated_at has a fixed search_path',
  (select array_to_string(proconfig, ',') from pg_proc where oid = 'public.touch_updated_at()'::regprocedure),
  'search_path=pg_catalog, public');
insert into auth.users(id, email, raw_user_meta_data) values
  ('70000000-0000-0000-0000-000000000006','gus@keystamp.invalid', '{"username":"gus"}');
select test.ck('sign-up still makes a profile (trigger without EXECUTE)',
  (select username from public.profiles where id='70000000-0000-0000-0000-000000000006'), 'gus');
select test.ck('a member still changes the case of their name (both triggers fire)',
  test.try('authenticated','70000000-0000-0000-0000-000000000003',
    $$update public.profiles set display_name = 'DANA' where id = auth.uid()$$), 'OK');
select test.ck('and the freeze trigger still refuses another name',
  test.msg('authenticated','70000000-0000-0000-0000-000000000003',
    $$update public.profiles set display_name = 'provost' where id = auth.uid()$$), 'P0001 display name is the username');
select test.ck('attendance.meeting_id is indexed',
  (select count(*)::text from pg_index i where i.indrelid = 'public.attendance'::regclass
     and (select array_agg(a.attname::text) from unnest(i.indkey) k join pg_attribute a
            on a.attrelid = i.indrelid and a.attnum = k)::text[] = array['meeting_id']), '1');


\pset tuples_only on
select '';
select case when pass then 'PASS ' else 'FAIL ' end || name ||
       case when pass then '' else '  <- ' || got end
from test.results order by n;
select '';
select count(*) filter (where pass)::text || '/' || count(*)::text || ' passed' from test.results;
