-- Phase 7 — database security model, tested against real Postgres.
-- Each check runs a statement as a real role with real JWT claims and
-- records whether it succeeded or which SQLSTATE refused it.
--   42501 = RLS / privilege refusal
--   23505 = unique violation      23503 = FK violation
--   23514 = check constraint      P0001 = raise exception (our triggers)

\set QUIET on
\pset pager off
set client_min_messages = warning;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant delete on public.meetings to authenticated;
revoke delete on public.meetings from anon;
revoke truncate on public.meetings from anon, authenticated;

create schema if not exists test;

create or replace function test.try(p_role text, p_uid text, p_sql text)
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
  return sqlstate;
end $$;

create or replace function test.val(p_role text, p_uid text, p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('role', p_role, true);
  perform set_config('request.jwt.claims',
    case when p_uid is null then json_build_object('role', p_role)::text
         else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute p_sql into v;
  perform set_config('role', 'postgres', true);
  return coalesce(v, 'NULL');
exception when others then
  perform set_config('role', 'postgres', true);
  return sqlstate;
end $$;

create table if not exists test.results(n serial, name text, pass boolean, got text);
create or replace function test.ck(p_name text, p_got text, p_want text)
returns void language sql as $$
  insert into test.results(name, pass, got)
  values (p_name, p_got = p_want, p_got || ' (wanted ' || p_want || ')');
$$;

-- ── fixtures: two members and a board account, via the real signup path ──
insert into auth.users(id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','alice@keystamp.invalid',
     '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222','bob@keystamp.invalid',
     '{"username":"bob","display_name":"Bob"}'),
  ('33333333-3333-3333-3333-333333333333','chair@keystamp.invalid',
     '{"username":"chair","display_name":"Chair","role":"board"}');

select test.ck('signup trigger creates a profile',
  (select count(*)::text from public.profiles), '3');
select test.ck('role from signup metadata is IGNORED',
  (select role from public.profiles where id='33333333-3333-3333-3333-333333333333'), 'member');

-- a hostile direct signUp: email x, metadata username y
insert into auth.users(id, email, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444','mallory@keystamp.invalid',
     '{"username":"alice_the_president","display_name":"M"}');
select test.ck('username is bound to the login address, not metadata',
  (select username from public.profiles where id='44444444-4444-4444-4444-444444444444'), 'mallory');

-- promote the chair the way bootstrap-board.mjs does: service role, no sub
select test.ck('service role CAN promote to board (bootstrap works)',
  test.try('service_role', null,
    $$update public.profiles set role='board' where id='33333333-3333-3333-3333-333333333333'$$), 'OK');

insert into public.meetings(id, meeting_number, meeting_date, start_time, end_time, location, check_in_open)
values ('aaaaaaaa-0000-0000-0000-000000000001', 1, '2026-01-07','3:15 PM','4:15 PM','MPR', true);

-- ══ 1. PRIVILEGE ESCALATION ══
select test.ck('member cannot make themselves board',
  test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$update public.profiles set role='board' where id='11111111-1111-1111-1111-111111111111'$$), 'P0001');
select test.ck('member cannot change their own username',
  test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$update public.profiles set username='alice2' where id='11111111-1111-1111-1111-111111111111'$$), 'P0001');
select test.ck('member cannot change their account id',
  case when test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$update public.profiles set id='55555555-5555-5555-5555-555555555555' where id='11111111-1111-1111-1111-111111111111'$$)
    in ('42501','P0001') then 'refused' else 'ALLOWED' end, 'refused');
select test.ck('member cannot promote ANOTHER user',
  test.val('authenticated','11111111-1111-1111-1111-111111111111',
    $$with u as (update public.profiles set role='board' where id='22222222-2222-2222-2222-222222222222' returning 1) select count(*)::text from u$$), '0');
select test.ck('member cannot read another profile',
  test.val('authenticated','11111111-1111-1111-1111-111111111111',
    $$select count(*)::text from public.profiles$$), '1');
select test.ck('anon cannot read profiles at all',
  test.val('anon', null, $$select count(*)::text from public.profiles$$), '0');
select test.ck('reserved usernames are refused',
  test.try('service_role', null,
    $$update public.profiles set username='admin' where id='11111111-1111-1111-1111-111111111111'$$), '23514');

-- ══ 2. ATTENDANCE INTEGRITY ══
select test.ck('member cannot insert their own attendance',
  test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$insert into public.attendance(user_id, meeting_id) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001')$$), '42501');
select test.ck('member cannot insert attendance for someone else',
  test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$insert into public.attendance(user_id, meeting_id) values ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001')$$), '42501');
select test.ck('board CANNOT write a row labelled qr from the browser',
  test.try('authenticated','33333333-3333-3333-3333-333333333333',
    $$insert into public.attendance(user_id, meeting_id, verification_method) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','qr')$$), '42501');
select test.ck('board CAN add someone manually, labelled honestly',
  test.try('authenticated','33333333-3333-3333-3333-333333333333',
    $$insert into public.attendance(user_id, meeting_id, verification_method) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','manual')$$), 'OK');
select test.ck('duplicate attendance is impossible',
  test.try('service_role', null,
    $$insert into public.attendance(user_id, meeting_id) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001')$$), '23505');
select test.ck('member cannot delete a stamp (0 rows affected)',
  test.val('authenticated','11111111-1111-1111-1111-111111111111',
    $$with d as (delete from public.attendance where user_id='11111111-1111-1111-1111-111111111111' returning 1) select count(*)::text from d$$), '0');
select test.ck('member cannot edit a stamp (0 rows affected)',
  test.val('authenticated','11111111-1111-1111-1111-111111111111',
    $$with u as (update public.attendance set verification_method='board' where user_id='11111111-1111-1111-1111-111111111111' returning 1) select count(*)::text from u$$), '0');
select test.ck('member cannot read another member''s attendance',
  test.val('authenticated','22222222-2222-2222-2222-222222222222',
    $$select count(*)::text from public.attendance$$), '0');

-- ══ 3. DESTRUCTIVE MEETING PERMISSIONS ══
-- Board may now delete an EMPTY meeting, so the guarantee here is no
-- longer "delete is refused outright" but "a meeting with attendance is
-- invisible to the delete". Same property, asserted on rows affected
-- rather than on an error code: this meeting has a stamp against it, so
-- the statement must match nothing.
select test.ck('board cannot DELETE a meeting that has attendance',
  test.val('authenticated','33333333-3333-3333-3333-333333333333',
    $$with d as (delete from public.meetings where id='aaaaaaaa-0000-0000-0000-000000000001' returning 1) select count(*)::text from d$$), '0');
select test.ck('even the service role cannot cascade attendance away',
  test.try('service_role', null,
    $$delete from public.meetings where id='aaaaaaaa-0000-0000-0000-000000000001'$$), '23503');
select test.ck('attendance survived the delete attempts',
  (select count(*)::text from public.attendance), '1');
select test.ck('board CAN create a meeting',
  test.try('authenticated','33333333-3333-3333-3333-333333333333',
    $$insert into public.meetings(meeting_number, meeting_date, start_time, end_time) values (2,'2026-01-14','3:15 PM','4:15 PM')$$), 'OK');
select test.ck('board CAN open and close check-in',
  test.try('authenticated','33333333-3333-3333-3333-333333333333',
    $$update public.meetings set check_in_open=false where meeting_number=1$$), 'OK');
select test.ck('member cannot create a meeting',
  test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$insert into public.meetings(meeting_number, meeting_date, start_time) values (99,'2026-01-21','3:15 PM')$$), '42501');
select test.ck('a meeting on any weekday is accepted (Thursday)',
  test.try('service_role', null,
    $$insert into public.meetings(meeting_number, meeting_date, start_time) values (50,'2026-01-08','3:15 PM')$$), 'OK');
select test.ck('a meeting on any weekday is accepted (Sunday)',
  test.try('service_role', null,
    $$insert into public.meetings(meeting_number, meeting_date, start_time) values (52,'2026-01-11','3:15 PM')$$), 'OK');
select test.ck('a meeting outside the MPR is refused',
  test.try('service_role', null,
    $$insert into public.meetings(meeting_number, meeting_date, start_time, location) values (51,'2026-01-21','3:15 PM','Gym')$$), '23514');

-- ══ 3b. DELETING A MEETING ══
insert into public.meetings(id, meeting_number, meeting_date, start_time)
values ('bbbbbbbb-0000-0000-0000-000000000001', 7, '2026-01-14', '3:15 PM');
select test.ck('board CAN delete an empty meeting',
  test.val('authenticated','33333333-3333-3333-3333-333333333333',
    $$with d as (delete from public.meetings where id='bbbbbbbb-0000-0000-0000-000000000001' returning 1) select count(*)::text from d$$), '1');
select test.ck('a meeting WITH attendance cannot be deleted',
  test.val('authenticated','33333333-3333-3333-3333-333333333333',
    $$with d as (delete from public.meetings where id='aaaaaaaa-0000-0000-0000-000000000001' returning 1) select count(*)::text from d$$), '0');
select test.ck('that meeting and its attendance are still there',
  (select count(*)::text from public.attendance
     where meeting_id='aaaaaaaa-0000-0000-0000-000000000001'), '1');
insert into public.meetings(id, meeting_number, meeting_date, start_time)
values ('bbbbbbbb-0000-0000-0000-000000000002', 8, '2026-01-14', '3:15 PM');
select test.ck('a member cannot delete any meeting',
  test.val('authenticated','11111111-1111-1111-1111-111111111111',
    $$with d as (delete from public.meetings where id='bbbbbbbb-0000-0000-0000-000000000002' returning 1) select count(*)::text from d$$), '0');
select test.ck('anon cannot delete any meeting',
  test.try('anon', null,
    $$delete from public.meetings where id='bbbbbbbb-0000-0000-0000-000000000002'$$), '42501');

-- ══ 4. REWARD INTEGRITY ══
select test.ck('claim before the threshold is refused',
  test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$insert into public.reward_claims(user_id, reward_id) values ('11111111-1111-1111-1111-111111111111','r1')$$), '42501');
select test.ck('claiming for someone else is refused',
  test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$insert into public.reward_claims(user_id, reward_id) values ('22222222-2222-2222-2222-222222222222','r1')$$), '42501');

-- give alice a real 10 stamps
insert into public.meetings(id, meeting_number, meeting_date, start_time)
  select ('aaaaaaaa-0000-0000-0000-00000000001'||i)::uuid, 100+i, '2026-01-07','3:15 PM'
  from generate_series(0,9) i;
insert into public.attendance(user_id, meeting_id)
  select '11111111-1111-1111-1111-111111111111', ('aaaaaaaa-0000-0000-0000-00000000001'||i)::uuid
  from generate_series(0,9) i;

select test.ck('claim at the threshold succeeds',
  test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$insert into public.reward_claims(user_id, reward_id) values ('11111111-1111-1111-1111-111111111111','r1')$$), 'OK');
select test.ck('the same reward cannot be claimed twice',
  test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$insert into public.reward_claims(user_id, reward_id) values ('11111111-1111-1111-1111-111111111111','r1')$$), '23505');
select test.ck('the 20-stamp tier is still locked at 11 stamps',
  test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$insert into public.reward_claims(user_id, reward_id) values ('11111111-1111-1111-1111-111111111111','r2')$$), '42501');
select test.ck('a claim cannot be deleted and re-earned (0 rows affected)',
  test.val('authenticated','11111111-1111-1111-1111-111111111111',
    $$with d as (delete from public.reward_claims where user_id='11111111-1111-1111-1111-111111111111' returning 1) select count(*)::text from d$$), '0');
select test.ck('an invented reward tier is refused',
  test.try('service_role', null,
    $$insert into public.reward_claims(user_id, reward_id) values ('11111111-1111-1111-1111-111111111111','r99')$$), '23514');

-- ══ 5. SESSIONS ══
select test.ck('member cannot read attendance sessions',
  test.val('authenticated','11111111-1111-1111-1111-111111111111',
    $$select count(*)::text from public.attendance_sessions$$), '0');
select test.ck('member cannot create an attendance session',
  test.try('authenticated','11111111-1111-1111-1111-111111111111',
    $$insert into public.attendance_sessions(meeting_id, started_by) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111')$$), '42501');

-- ══ 6. CONTROL: prove the bootstrap fix is load-bearing ══
create or replace function public.freeze_identity_fields_OLD()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if public.is_board() then return new; end if;
  if new.role is distinct from old.role then
    raise exception 'role is assigned by the club, not by the account';
  end if;
  return new;
end $$;
drop trigger profiles_freeze on public.profiles;
create trigger profiles_freeze before update on public.profiles
  for each row execute function public.freeze_identity_fields_OLD();
select test.ck('CONTROL: the Phase 6 trigger blocked bootstrap',
  test.try('service_role', null,
    $$update public.profiles set role='board' where id='22222222-2222-2222-2222-222222222222'$$), 'P0001');
drop trigger profiles_freeze on public.profiles;
create trigger profiles_freeze before update on public.profiles
  for each row execute function public.freeze_identity_fields();

\pset tuples_only on
select '' ;
select case when pass then 'PASS ' else 'FAIL ' end || name ||
       case when pass then '' else '  <- ' || got end
from test.results order by n;
select '';
select count(*) filter (where pass)::text || '/' || count(*)::text || ' passed' from test.results;
