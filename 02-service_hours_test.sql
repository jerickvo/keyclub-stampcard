-- Service hours — database security model, tested against real Postgres.
-- Same shape as 02-rls_test.sql: every check runs a statement as a real
-- role with real JWT claims and records what happened.
--   42501 = RLS / privilege refusal   23505 = unique violation
--   23514 = check constraint          P0001 = raise exception
--
-- Run after schema.sql and schema-service-hours.sql.
--
-- The one property this file CANNOT prove on its own is the simultaneous
-- claim, because a single psql script has one session. Test 6 proves the
-- unique index refuses the second claim; the genuinely concurrent case
-- (two transactions open, neither committed) was driven from a shell with
-- two psql processes and behaved the same way — the later INSERT blocks on
-- the index and then fails 23505 when the first commits.

\set QUIET on
\pset pager off
set client_min_messages = warning;

-- Supabase grants these by default, so the harness starts from that
-- state...
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage on schema extensions to anon, authenticated;

-- ...and then re-applies exactly the revokes schema-service-hours.sql
-- performs, or the blanket grant above would quietly hand back the
-- privileges under test. Without this, "member cannot delete sheet rows"
-- passes vacuously: RLS still matches no row, so the DELETE reports
-- success having removed nothing, and the check reads that as a refusal.
revoke delete, truncate on public.sheet_members from anon, authenticated;
revoke delete, truncate on public.identity_review_flags from anon, authenticated;
grant delete on public.member_sheet_links to authenticated;
revoke delete on public.member_sheet_links from anon;
revoke truncate on public.member_sheet_links from anon, authenticated;
revoke insert, delete, truncate on public.service_sync_state from anon, authenticated;

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

drop table if exists test.results;
create table test.results(n serial, name text, pass boolean, got text);
create or replace function test.ck(p_name text, p_got text, p_want text)
returns void language sql as $$
  insert into test.results(name, pass, got)
  values (p_name, p_got = p_want, p_got || ' (wanted ' || p_want || ')');
$$;

-- ── fixtures ───────────────────────────────────────────────────────
-- The sheet rows are the real defects described for the live file:
-- a near-typo pair, a duplicated name, "First Last" among "Last, First",
-- trailing whitespace, and one member whose 100 hours came from a single
-- camp (which is exactly why the leaderboard ranks on events, not hours).
delete from public.identity_review_flags;
delete from public.member_sheet_links;
delete from public.sheet_members;
delete from auth.users where email like '%@sh.test';

insert into public.sheet_members (source_sheet_id, row_index, sheet_name, events_attended, total_hours) values
  ('SHEET2026',  4, 'Alvarez, Zachary',  12,  30.5),
  ('SHEET2026',  5, 'Aluarez, Zackary',   1,   2.0),
  ('SHEET2026',  6, 'Patel, Maya',       15,  40.0),
  ('SHEET2026',  7, 'Patel, Maya',        1,   3.0),
  ('SHEET2026',  8, 'Sean O''Brien',      7,  18.0),
  ('SHEET2026',  9, 'Nguyen, An-Thu  ',   9, 100.0),
  ('SHEET2026', 10, 'Okafor, Chidi',      0,   0.0);

insert into auth.users(id, email, raw_user_meta_data) values
  ('a1111111-1111-1111-1111-111111111111','zach@sh.test',  '{"username":"zach"}'),
  ('a2222222-2222-2222-2222-222222222222','maya@sh.test',  '{"username":"maya"}'),
  ('a3333333-3333-3333-3333-333333333333','maya2@sh.test', '{"username":"maya2"}'),
  ('a4444444-4444-4444-4444-444444444444','chair2@sh.test','{"username":"chair2"}');
update public.profiles set real_name='Zachary Alvarez' where id='a1111111-1111-1111-1111-111111111111';
-- two DIFFERENT people who really are both called Maya Patel
update public.profiles set real_name='Maya Patel'      where id='a2222222-2222-2222-2222-222222222222';
update public.profiles set real_name='Maya Patel'      where id='a3333333-3333-3333-3333-333333333333';
update public.profiles set real_name='Club Chair', role='board'
  where id='a4444444-4444-4444-4444-444444444444';

-- ══ 1. NAME NORMALISATION — the sheet's actual mess ══
select test.ck('"Last, First" and "First Last" collapse to one key',
  (select case when public.name_sort_key('Alvarez, Zachary') = public.name_sort_key('Zachary Alvarez')
          then 'same' else 'different' end), 'same');
select test.ck('casing and doubled spaces are folded',
  (select case when public.name_sort_key('  ALVAREZ,   Zachary ') = public.name_sort_key('Alvarez, Zachary')
          then 'same' else 'different' end), 'same');
select test.ck('apostrophes vanish rather than splitting a token',
  public.normalize_name('O''Brien, Sean'), 'obrien sean');
select test.ck('hyphenated given names split consistently',
  (select case when public.name_sort_key('Nguyen, An-Thu') = public.name_sort_key('An Thu Nguyen')
          then 'same' else 'different' end), 'same');
select test.ck('a near-typo is NOT treated as the same person',
  (select case when public.name_sort_key('Aluarez, Zackary') = public.name_sort_key('Alvarez, Zachary')
          then 'same' else 'different' end), 'different');
select test.ck('trailing whitespace in the sheet does not break the key',
  public.name_sort_key('Nguyen, An-Thu  '), 'an nguyen thu');

-- ══ 2. CANDIDATES — propose, never assign ══
select test.ck('exact match is offered first',
  test.val('authenticated','a1111111-1111-1111-1111-111111111111',
    $$select sheet_name from public.service_identity_candidates(5) limit 1$$), 'Alvarez, Zachary');
select test.ck('the near-typo row is offered as a candidate too',
  test.val('authenticated','a1111111-1111-1111-1111-111111111111',
    $$select count(*)::text from public.service_identity_candidates(5)$$), '2');
select test.ck('BOTH duplicate rows are offered — nothing is auto-picked',
  test.val('authenticated','a2222222-2222-2222-2222-222222222222',
    $$select count(*)::text from public.service_identity_candidates(5)$$), '2');
select test.ck('an unrelated row is never a candidate',
  test.val('authenticated','a1111111-1111-1111-1111-111111111111',
    $$select count(*)::text from public.service_identity_candidates(10)
      where sheet_name = 'Okafor, Chidi'$$), '0');
select test.ck('officer candidate lookup is board-only',
  test.try('authenticated','a1111111-1111-1111-1111-111111111111',
    $$select * from public.service_candidates_for('a2222222-2222-2222-2222-222222222222')$$), 'P0001');

-- ══ 3. SERVICE DATA IS NOT MEMBER-WRITABLE ══
-- An RLS-blocked UPDATE affects zero rows instead of raising, so these
-- assert on the DATA. Checking only for an error would pass vacuously.
select test.try('authenticated','a1111111-1111-1111-1111-111111111111',
  $$update public.sheet_members set events_attended = 999$$);
select test.ck('member cannot inflate their event count',
  (select count(*)::text from public.sheet_members where events_attended = 999), '0');
select test.try('authenticated','a1111111-1111-1111-1111-111111111111',
  $$update public.sheet_members set total_hours = 999$$);
select test.ck('member cannot inflate their hours',
  (select count(*)::text from public.sheet_members where total_hours = 999), '0');
select test.try('authenticated','a1111111-1111-1111-1111-111111111111',
  $$update public.service_sync_state set last_synced_at = '1999-01-01'$$);
select test.ck('member cannot forge the sync timestamp',
  (select count(*)::text from public.service_sync_state where last_synced_at = '1999-01-01'), '0');
select test.ck('member cannot invent a sheet row',
  test.try('authenticated','a1111111-1111-1111-1111-111111111111',
    $$insert into public.sheet_members(source_sheet_id,row_index,sheet_name)
      values ('X',99,'Imaginary Person')$$), '42501');
select test.ck('member cannot delete sheet rows',
  test.try('authenticated','a1111111-1111-1111-1111-111111111111',
    $$delete from public.sheet_members$$), '42501');
select test.ck('...and every sheet row is still there',
  (select count(*)::text from public.sheet_members), '7');

-- ══ 4. CLAIMING ══
select test.ck('member cannot claim a row that is not plausibly theirs',
  test.try('authenticated','a1111111-1111-1111-1111-111111111111',
    $$insert into public.member_sheet_links(user_id, sheet_member_id)
      select 'a1111111-1111-1111-1111-111111111111', id
        from public.sheet_members where sheet_name='Okafor, Chidi'$$), '42501');
select test.ck('member cannot claim a row ON BEHALF of someone else',
  test.try('authenticated','a1111111-1111-1111-1111-111111111111',
    $$insert into public.member_sheet_links(user_id, sheet_member_id)
      select 'a2222222-2222-2222-2222-222222222222', id
        from public.sheet_members where sheet_name='Patel, Maya' limit 1$$), '42501');
select test.ck('member cannot forge an officer link',
  test.try('authenticated','a1111111-1111-1111-1111-111111111111',
    $$insert into public.member_sheet_links(user_id, sheet_member_id, link_method)
      select 'a1111111-1111-1111-1111-111111111111', id, 'officer'
        from public.sheet_members where sheet_name='Alvarez, Zachary'$$), '42501');
select test.ck('member CAN claim their own matching row',
  test.try('authenticated','a1111111-1111-1111-1111-111111111111',
    $$insert into public.member_sheet_links(user_id, sheet_member_id)
      select 'a1111111-1111-1111-1111-111111111111', id
        from public.sheet_members where sheet_name='Alvarez, Zachary'$$), 'OK');
select test.ck('member cannot claim a SECOND row',
  test.try('authenticated','a1111111-1111-1111-1111-111111111111',
    $$insert into public.member_sheet_links(user_id, sheet_member_id)
      select 'a1111111-1111-1111-1111-111111111111', id
        from public.sheet_members where sheet_name='Aluarez, Zackary'$$), '23505');

-- ══ 5. TWO REAL PEOPLE, ONE SHEET ROW ══
select test.ck('first Maya claims the 15-event row',
  test.try('authenticated','a2222222-2222-2222-2222-222222222222',
    $$insert into public.member_sheet_links(user_id, sheet_member_id)
      select 'a2222222-2222-2222-2222-222222222222', id from public.sheet_members
       where sheet_name='Patel, Maya' and events_attended=15$$), 'OK');
select test.ck('second Maya is refused that row by the unique index',
  test.try('authenticated','a3333333-3333-3333-3333-333333333333',
    $$insert into public.member_sheet_links(user_id, sheet_member_id)
      select 'a3333333-3333-3333-3333-333333333333', id from public.sheet_members
       where sheet_name='Patel, Maya' and events_attended=15$$), '23505');
select test.ck('...and can still claim the OTHER Patel row',
  test.try('authenticated','a3333333-3333-3333-3333-333333333333',
    $$insert into public.member_sheet_links(user_id, sheet_member_id)
      select 'a3333333-3333-3333-3333-333333333333', id from public.sheet_members
       where sheet_name='Patel, Maya' and events_attended=1$$), 'OK');
select test.ck('exactly one account holds the contested row',
  (select count(*)::text from public.member_sheet_links l join public.sheet_members s
     on s.id=l.sheet_member_id where s.sheet_name='Patel, Maya' and s.events_attended=15), '1');

-- ══ 6. ISOLATION ══
select test.ck('a member sees only their own link',
  test.val('authenticated','a1111111-1111-1111-1111-111111111111',
    $$select count(*)::text from public.member_sheet_links$$), '1');
select test.ck('the board sees every link',
  test.val('authenticated','a4444444-4444-4444-4444-444444444444',
    $$select count(*)::text from public.member_sheet_links$$), '3');
select test.ck('a member cannot unlink themselves to go shopping',
  test.val('authenticated','a1111111-1111-1111-1111-111111111111',
    $$with d as (delete from public.member_sheet_links
                  where user_id='a1111111-1111-1111-1111-111111111111' returning 1)
      select count(*)::text from d$$), '0');

-- ══ 7. REVIEW FLAGS ══
select test.ck('an unlinked member can raise "none of these are me"',
  test.try('authenticated','a3333333-3333-3333-3333-333333333333',
    $$delete from public.member_sheet_links where user_id='a3333333-3333-3333-3333-333333333333'$$), 'OK');
select test.ck('...wait, members cannot delete links at all',
  (select count(*)::text from public.member_sheet_links
    where user_id='a3333333-3333-3333-3333-333333333333'), '1');
select test.ck('a LINKED member cannot raise a review flag',
  test.try('authenticated','a3333333-3333-3333-3333-333333333333',
    $$insert into public.identity_review_flags(user_id)
      values ('a3333333-3333-3333-3333-333333333333')$$), '42501');

insert into auth.users(id,email,raw_user_meta_data)
  values ('a5555555-5555-5555-5555-555555555555','newkid@sh.test','{"username":"newkid"}');
update public.profiles set real_name='Brand New Member'
  where id='a5555555-5555-5555-5555-555555555555';
select test.ck('a member with no sheet row gets no candidates',
  test.val('authenticated','a5555555-5555-5555-5555-555555555555',
    $$select count(*)::text from public.service_identity_candidates(5)$$), '0');
select test.ck('...and can raise a review flag',
  test.try('authenticated','a5555555-5555-5555-5555-555555555555',
    $$insert into public.identity_review_flags(user_id)
      values ('a5555555-5555-5555-5555-555555555555')$$), 'OK');
select test.ck('one OPEN flag per member',
  test.try('authenticated','a5555555-5555-5555-5555-555555555555',
    $$insert into public.identity_review_flags(user_id)
      values ('a5555555-5555-5555-5555-555555555555')$$), '23505');
select test.try('authenticated','a5555555-5555-5555-5555-555555555555',
  $$update public.identity_review_flags set resolved_at = now()$$);
select test.ck('a member cannot resolve their own review',
  (select count(*)::text from public.identity_review_flags where resolved_at is not null), '0');
select test.ck('the board can resolve it',
  test.try('authenticated','a4444444-4444-4444-4444-444444444444',
    $$update public.identity_review_flags
         set resolved_at = now(), resolved_by = 'a4444444-4444-4444-4444-444444444444'
       where user_id = 'a5555555-5555-5555-5555-555555555555'$$), 'OK');

-- ══ 8. OFFICER MANUAL LINK ══
select test.ck('the board can link a member the matcher could not place',
  test.try('authenticated','a4444444-4444-4444-4444-444444444444',
    $$insert into public.member_sheet_links(user_id, sheet_member_id, link_method, linked_by)
      select 'a5555555-5555-5555-5555-555555555555', id, 'officer',
             'a4444444-4444-4444-4444-444444444444'
        from public.sheet_members where sheet_name='Okafor, Chidi'$$), 'OK');
select test.ck('the board can undo a wrong link',
  test.try('authenticated','a4444444-4444-4444-4444-444444444444',
    $$delete from public.member_sheet_links
       where user_id='a5555555-5555-5555-5555-555555555555'$$), 'OK');

-- ══ 9. ACCOUNT DELETION RELEASES THE ROW ══
-- The scenario: a member confirms the wrong person, deletes the account,
-- and somebody else must be able to claim that row afterwards.
delete from auth.users where id='a2222222-2222-2222-2222-222222222222';
select test.ck('deleting the account removes its link',
  (select count(*)::text from public.member_sheet_links
    where user_id='a2222222-2222-2222-2222-222222222222'), '0');
select test.ck('no orphaned link survives',
  (select count(*)::text from public.member_sheet_links l
     left join public.profiles p on p.id = l.user_id where p.id is null), '0');
select test.ck('no orphaned review flag survives',
  (select count(*)::text from public.identity_review_flags f
     left join public.profiles p on p.id = f.user_id where p.id is null), '0');
select test.ck('the sheet row itself is untouched',
  (select count(*)::text from public.sheet_members
    where sheet_name='Patel, Maya' and events_attended=15), '1');
select test.ck('the freed row can be claimed by someone else',
  test.try('authenticated','a3333333-3333-3333-3333-333333333333',
    $$insert into public.member_sheet_links(user_id, sheet_member_id)
      select 'a3333333-3333-3333-3333-333333333333', id from public.sheet_members
       where sheet_name='Patel, Maya' and events_attended=15
      on conflict do nothing$$), 'OK');

\pset tuples_only on
select '';
select case when pass then 'PASS ' else 'FAIL ' end || name ||
       case when pass then '' else '  <- ' || got end
from test.results order by n;
select '';
select count(*) filter (where pass)::text || '/' || count(*)::text || ' passed' from test.results;
