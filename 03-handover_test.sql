-- Prize hand-overs and stamps added by hand
-- (migrations/2026-09-23-prizes-and-hand-stamps.sql), tested against
-- real Postgres. Runs after 02-rls_test.sql, whose fixtures it uses:
-- alice (11 stamps, r1 claimed), bob (no stamps), chair (board).
--   fresh project:    00-supabase.sql, schema.sql, 02-rls_test.sql, this
--   existing project: 00-supabase.sql, the previous schema.sql and
--                     02-rls_test.sql, the migration (twice), this

\set QUIET on
\pset pager off
set client_min_messages = warning;

truncate test.results;

-- the error text, so a refusal can be told apart from another refusal
create or replace function test.msg(p_role text, p_uid text, p_sql text)
returns text language plpgsql as $$
begin
  perform set_config('role', p_role, true);
  perform set_config('request.jwt.claims',
    case when p_uid is null then json_build_object('role', p_role)::text
         else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute p_sql;
  perform set_config('role', 'postgres', true);
  return 'OK';
exception when others then
  perform set_config('role', 'postgres', true);
  return sqlstate || ' ' || sqlerrm;
end $$;

-- a second board account and a member with ten stamps and no claim
insert into auth.users(id, email, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555','veep@keystamp.invalid', '{"username":"veep"}'),
  ('66666666-6666-6666-6666-666666666666','carol@keystamp.invalid', '{"username":"carol"}');
select test.try('service_role', null,
  $$update public.profiles set role = 'board' where id = '55555555-5555-5555-5555-555555555555'$$);
insert into public.attendance(user_id, meeting_id)
  select '22222222-2222-2222-2222-222222222222', ('aaaaaaaa-0000-0000-0000-00000000001'||i)::uuid
  from generate_series(0,9) i;
insert into public.attendance(user_id, meeting_id)
  select '66666666-6666-6666-6666-666666666666', ('aaaaaaaa-0000-0000-0000-00000000001'||i)::uuid
  from generate_series(0,9) i;

-- ══ 1. NOBODY WRITES A HAND-OVER FROM A BROWSER ══
select test.ck('member cannot insert a hand-over',
  test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$insert into public.reward_handovers(user_id, reward_id) values ('11111111-1111-1111-1111-111111111111','r1')$$), '42501');
select test.ck('board cannot insert a hand-over directly either',
  test.try('authenticated','33333333-3333-3333-3333-333333333333',
    $$insert into public.reward_handovers(user_id, reward_id, handed_by) values ('11111111-1111-1111-1111-111111111111','r1','33333333-3333-3333-3333-333333333333')$$), '42501');
select test.ck('anon cannot read hand-overs',
  test.try('anon', null, $$select 1 from public.reward_handovers$$), '42501');
select test.ck('member cannot hand a prize to themselves',
  test.msg('authenticated','11111111-1111-1111-1111-111111111111',
    $$select public.hand_over_reward('11111111-1111-1111-1111-111111111111','r1')$$), 'P0001 NOT_AUTHORIZED');
select test.ck('anon cannot call the function at all',
  test.try('anon', null,
    $$select public.hand_over_reward('11111111-1111-1111-1111-111111111111','r1')$$), '42501');

select test.ck('an officer cannot hand a prize to themselves',
  test.msg('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.hand_over_reward('33333333-3333-3333-3333-333333333333','r1')$$), 'P0001 SELF_HANDOVER');
select test.ck('board-data (service role) can read hand-overs',
  test.try('service_role', null, $$select 1 from public.reward_handovers$$), 'OK');

-- ══ 2. HANDING OVER ══
select test.ck('board hands over a claimed prize',
  test.try('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.hand_over_reward('11111111-1111-1111-1111-111111111111','r1')$$), 'OK');
select test.ck('the hand-over names the officer',
  (select handed_by::text from public.reward_handovers
    where user_id='11111111-1111-1111-1111-111111111111' and reward_id='r1'),
  '33333333-3333-3333-3333-333333333333');
select test.ck('the same prize cannot be handed over twice',
  test.msg('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.hand_over_reward('11111111-1111-1111-1111-111111111111','r1')$$), 'P0001 ALREADY_HANDED_OVER');
select test.ck('nor by a second officer',
  test.msg('authenticated','55555555-5555-5555-5555-555555555555',
    $$select public.hand_over_reward('11111111-1111-1111-1111-111111111111','r1')$$), 'P0001 ALREADY_HANDED_OVER');
select test.ck('a prize not earned is refused (11 stamps, 20-stamp tier)',
  test.msg('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.hand_over_reward('11111111-1111-1111-1111-111111111111','r2')$$), 'P0001 NOT_EARNED');
select test.ck('an invented tier is refused',
  test.msg('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.hand_over_reward('11111111-1111-1111-1111-111111111111','r9')$$), 'P0001 INVALID_REWARD');
select test.ck('an unknown member has earned nothing',
  test.msg('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.hand_over_reward('99999999-9999-9999-9999-999999999999','r1')$$), 'P0001 NOT_EARNED');

select test.ck('bob earned r1 but never pressed Claim',
  (select count(*)::text from public.reward_claims where user_id='22222222-2222-2222-2222-222222222222'), '0');
select test.ck('board hands it over anyway (no phone at the meeting)',
  test.try('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.hand_over_reward('22222222-2222-2222-2222-222222222222','r1')$$), 'OK');
select test.ck('and the claim is on file with it',
  (select count(*)::text from public.reward_claims
    where user_id='22222222-2222-2222-2222-222222222222' and reward_id='r1'), '1');

-- ══ 3. READING ══
select test.ck('a member reads their own hand-over',
  test.val('authenticated','11111111-1111-1111-1111-111111111111',
    $$select count(*)::text from public.reward_handovers$$), '1');
select test.ck('and nobody else''s',
  test.val('authenticated','11111111-1111-1111-1111-111111111111',
    $$select count(*)::text from public.reward_handovers where user_id <> auth.uid()$$), '0');
select test.ck('carol, with none, reads none',
  test.val('authenticated','66666666-6666-6666-6666-666666666666',
    $$select count(*)::text from public.reward_handovers$$), '0');
select test.ck('the board reads all of them',
  test.val('authenticated','55555555-5555-5555-5555-555555555555',
    $$select count(*)::text from public.reward_handovers$$), '2');

-- ══ 4. NOTHING IS EDITED OR ERASED FROM A BROWSER ══
-- Refused either way: by the revoked privilege (42501), or, where a
-- blanket grant has put it back, by RLS with no policy (0 rows).
create or replace function test.refused(p_role text, p_uid text, p_sql text)
returns text language plpgsql as $$
declare r text;
begin
  r := test.val(p_role, p_uid,
    'with x as (' || p_sql || ' returning 1) select count(*)::text from x');
  return case when r in ('0', '42501') then 'refused' else 'ALLOWED ' || r end;
end $$;
select test.ck('member cannot erase their hand-over',
  test.refused('authenticated','11111111-1111-1111-1111-111111111111',
    $$delete from public.reward_handovers$$), 'refused');
select test.ck('board cannot back-date a hand-over',
  test.refused('authenticated','33333333-3333-3333-3333-333333333333',
    $$update public.reward_handovers set handed_at = now() - interval '1 year'$$), 'refused');
select test.ck('board cannot erase one directly',
  test.refused('authenticated','33333333-3333-3333-3333-333333333333',
    $$delete from public.reward_handovers$$), 'refused');
select test.ck('board cannot write one directly',
  test.refused('authenticated','33333333-3333-3333-3333-333333333333',
    $$insert into public.reward_handovers(user_id, reward_id) values ('11111111-1111-1111-1111-111111111111','r1')$$), 'refused');

-- ══ 5. UNDO ══
select test.ck('another officer cannot withdraw it',
  test.msg('authenticated','55555555-5555-5555-5555-555555555555',
    $$select public.undo_hand_over('22222222-2222-2222-2222-222222222222','r1')$$), 'P0001 UNDO_EXPIRED');
select test.ck('a member cannot withdraw it',
  test.msg('authenticated','22222222-2222-2222-2222-222222222222',
    $$select public.undo_hand_over('22222222-2222-2222-2222-222222222222','r1')$$), 'P0001 NOT_AUTHORIZED');
select test.ck('the officer who recorded it can, within fifteen minutes',
  test.try('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.undo_hand_over('22222222-2222-2222-2222-222222222222','r1')$$), 'OK');
select test.ck('the hand-over is gone',
  (select count(*)::text from public.reward_handovers where user_id='22222222-2222-2222-2222-222222222222'), '0');
select test.ck('the claim stays',
  (select count(*)::text from public.reward_claims where user_id='22222222-2222-2222-2222-222222222222'), '1');
select test.ck('and it can be handed over again, properly',
  test.try('authenticated','55555555-5555-5555-5555-555555555555',
    $$select public.hand_over_reward('22222222-2222-2222-2222-222222222222','r1')$$), 'OK');
update public.reward_handovers set handed_at = now() - interval '16 minutes'
  where user_id = '11111111-1111-1111-1111-111111111111';
select test.ck('after fifteen minutes it is part of the record',
  test.msg('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.undo_hand_over('11111111-1111-1111-1111-111111111111','r1')$$), 'P0001 UNDO_EXPIRED');

-- ══ 6. THE MEMBER'S OWN CLAIM IS UNCHANGED ══
select test.ck('a member still claims at the threshold',
  test.try('authenticated','66666666-6666-6666-6666-666666666666',
    $$insert into public.reward_claims(user_id, reward_id) values ('66666666-6666-6666-6666-666666666666','r1')$$), 'OK');
select test.ck('and still cannot claim early',
  test.try('authenticated','66666666-6666-6666-6666-666666666666',
    $$insert into public.reward_claims(user_id, reward_id) values ('66666666-6666-6666-6666-666666666666','r2')$$), '42501');

-- ══ 7. A STAMP ADDED BY HAND ══
insert into public.meetings(id, meeting_number, meeting_date, start_time)
values ('cccccccc-0000-0000-0000-000000000001', 900,
        (now() at time zone 'America/Los_Angeles')::date, '12:40 PM');
select test.ck('nobody inserts attendance directly, board included',
  test.try('authenticated','33333333-3333-3333-3333-333333333333',
    $$insert into public.attendance(user_id, meeting_id, verification_method) values ('22222222-2222-2222-2222-222222222222','cccccccc-0000-0000-0000-000000000001','board')$$), '42501');
select test.ck('a member cannot stamp anyone by hand',
  test.msg('authenticated','11111111-1111-1111-1111-111111111111',
    $$select public.stamp_by_hand('22222222-2222-2222-2222-222222222222','cccccccc-0000-0000-0000-000000000001')$$), 'P0001 NOT_AUTHORIZED');
select test.ck('anon cannot call it at all',
  test.try('anon', null,
    $$select public.stamp_by_hand('22222222-2222-2222-2222-222222222222','cccccccc-0000-0000-0000-000000000001')$$), '42501');
select test.ck('an officer cannot stamp themselves',
  test.msg('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.stamp_by_hand('33333333-3333-3333-3333-333333333333','cccccccc-0000-0000-0000-000000000001')$$), 'P0001 SELF_STAMP');
select test.ck('a meeting on another day is refused',
  test.msg('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.stamp_by_hand('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001')$$), 'P0001 NOT_TODAY');
select test.ck('a meeting that does not exist is refused',
  test.msg('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.stamp_by_hand('22222222-2222-2222-2222-222222222222','dddddddd-0000-0000-0000-000000000001')$$), 'P0001 MEETING_NOT_FOUND');
select test.ck('an account that does not exist is refused',
  test.msg('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.stamp_by_hand('99999999-9999-9999-9999-999999999999','cccccccc-0000-0000-0000-000000000001')$$), 'P0001 MEMBER_NOT_FOUND');
select test.ck('an officer stamps a member at today''s meeting',
  test.try('authenticated','33333333-3333-3333-3333-333333333333',
    $$select public.stamp_by_hand('22222222-2222-2222-2222-222222222222','cccccccc-0000-0000-0000-000000000001')$$), 'OK');
select test.ck('the stamp says it was added by hand, and when',
  (select verification_method || ' ' || (abs(extract(epoch from now() - checked_in_at)) < 60)::text
     from public.attendance where meeting_id = 'cccccccc-0000-0000-0000-000000000001'), 'board true');
select test.ck('a second stamp for the same meeting is refused by name',
  test.msg('authenticated','55555555-5555-5555-5555-555555555555',
    $$select public.stamp_by_hand('22222222-2222-2222-2222-222222222222','cccccccc-0000-0000-0000-000000000001')$$), 'P0001 ALREADY_CHECKED_IN');

-- ══ 8. ACCOUNTS THAT GO ══
delete from auth.users where id = '55555555-5555-5555-5555-555555555555';
select test.ck('an officer who leaves does not erase what they handed over',
  (select count(*)::text from public.reward_handovers), '2');
select test.ck('the hand-over simply no longer names them',
  (select coalesce(handed_by::text, 'null') from public.reward_handovers
    where user_id = '22222222-2222-2222-2222-222222222222'), 'null');
delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
select test.ck('a member who leaves takes their hand-overs with them',
  (select count(*)::text from public.reward_handovers), '1');

\pset tuples_only on
select '';
select case when pass then 'PASS ' else 'FAIL ' end || name ||
       case when pass then '' else '  <- ' || got end
from test.results order by n;
select '';
select count(*) filter (where pass)::text || '/' || count(*)::text || ' passed' from test.results;
