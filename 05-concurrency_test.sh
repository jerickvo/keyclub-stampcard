#!/usr/bin/env bash
# Races, tested against real Postgres with real concurrent sessions.
#
# The other SQL tests run one statement after another in one session,
# which proves what each function refuses but not what happens when two
# people press at the same moment. Here every race is run for real: a
# controller session holds an advisory lock as a starting gate, the
# workers (separate psql connections, each signed in as its own account)
# queue on it, and the gate opens for all of them at once. Each race is
# run several rounds, so the order the database serves them in varies.
#
#   fresh project: 00-supabase.sql and schema.sql applied to an empty
#   database, then:   PGDATABASE=<db> ./05-concurrency_test.sh
#   (PGHOST, PGPORT, PGUSER as for psql; the database's owner)
#
# It writes its own fixtures (ids 9xxxxxxx-...) and removes them first,
# so it can be run again on the same database.
set -u
ROUNDS=${ROUNDS:-6}
PSQL="psql -X -q -t -A -v ON_ERROR_STOP=1"
pass=0; fail=0
ck(){  # name, got, want
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "PASS $1"
  else fail=$((fail+1)); echo "FAIL $1  <- got [$2] want [$3]"; fi
}

$PSQL >/dev/null <<'SQL'
create schema if not exists ctest;
-- as Supabase grants it: the functions' service role reads and writes every table
grant all on all tables in schema public to service_role;
-- one statement as one account; 'OK', or the refusal's SQLSTATE and message
create or replace function ctest.as(p_role text, p_uid text, p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('role', p_role, true);
  perform set_config('request.jwt.claims',
    case when p_uid is null then json_build_object('role', p_role)::text
         else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute p_sql into v;
  perform set_config('role', 'postgres', true);
  return coalesce('OK ' || v, 'OK');
exception when others then
  perform set_config('role', 'postgres', true);
  return sqlstate || ' ' || sqlerrm;
end $$;

-- fixtures: two officers, three members, today's meeting and another
delete from public.reward_handovers where user_id::text like '9%';
delete from public.reward_claims where user_id::text like '9%';
delete from public.attendance where user_id::text like '9%' or meeting_id::text like '9%';
delete from public.attendance_sessions where meeting_id::text like '9%';
delete from public.meetings where id::text like '9%';
delete from auth.users where id::text like '9%';
insert into auth.users (id, email, raw_user_meta_data) values
  ('90000000-0000-0000-0000-000000000001', 'chair1@keystamp.invalid', '{"username":"chair1"}'),
  ('90000000-0000-0000-0000-000000000002', 'chair2@keystamp.invalid', '{"username":"chair2"}'),
  ('90000000-0000-0000-0000-000000000011', 'mia@keystamp.invalid',    '{"username":"mia"}'),
  ('90000000-0000-0000-0000-000000000012', 'noel@keystamp.invalid',   '{"username":"noel"}'),
  ('90000000-0000-0000-0000-000000000013', 'opal@keystamp.invalid',   '{"username":"opal"}');
update public.profiles set role = 'board' where id in
  ('90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002');
insert into public.meetings (id, meeting_number, meeting_date, start_time, end_time) values
  ('9aaaaaaa-0000-0000-0000-000000000001', 9001, (now() at time zone 'America/Los_Angeles')::date, '12:40 PM', '1:30 PM'),
  ('9aaaaaaa-0000-0000-0000-000000000002', 9002, (now() at time zone 'America/Los_Angeles')::date, '3:00 PM', '4:00 PM');
-- earlier meetings, for stamps already earned
insert into public.meetings (id, meeting_number, meeting_date, start_time)
select ('9bbbbbbb-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 9100 + n, date '2025-01-01' + n, '12:40 PM'
from generate_series(1, 30) n;
SQL

GATE=4242
gate_open_in(){  # hold the gate this long (s), in the background
  $PSQL -c "select pg_advisory_lock($GATE); select pg_sleep($1);" >/dev/null &
  GATE_PID=$!; sleep 0.3
}
worker(){  # role uid sql -> one line
  $PSQL -c "select pg_advisory_lock_shared($GATE); select ctest.as('$1', $2, \$q\$$3\$q\$);" | tail -n 1
}
race(){  # file, then pairs of (role uid sql) on stdin, one per line, separated by |
  local out=$1; : > "$out"; gate_open_in 1.2
  while IFS='|' read -r role uid sql; do
    [ -z "$role" ] && continue
    worker "$role" "$uid" "$sql" >> "$out" &
  done
  wait
}
q(){ $PSQL -c "$1"; }

M1=9aaaaaaa-0000-0000-0000-000000000001; M2=9aaaaaaa-0000-0000-0000-000000000002
C1="'90000000-0000-0000-0000-000000000001'"; C2="'90000000-0000-0000-0000-000000000002'"
MIA=90000000-0000-0000-0000-000000000011; NOEL=90000000-0000-0000-0000-000000000012; OPAL=90000000-0000-0000-0000-000000000013
T=$(mktemp)

# ── 1. one stamp per member per meeting ─────────────────────────────
# ten scans of the same code at once (the verifier's bare insert, as the
# service role) and two officers adding the same member by hand
for r in $(seq 1 $ROUNDS); do
  q "delete from public.attendance where user_id = '$MIA' and meeting_id = '$M1'" >/dev/null
  { for i in $(seq 1 10); do echo "service_role|null|insert into public.attendance (user_id, meeting_id, verification_method) values ('$MIA', '$M1', 'qr') returning 'row'"; done
    echo "authenticated|$C1|select public.stamp_by_hand('$MIA', '$M1')::text"
    echo "authenticated|$C2|select public.stamp_by_hand('$MIA', '$M1')::text"; } | race $T
  rows=$(q "select count(*) from public.attendance where user_id = '$MIA' and meeting_id = '$M1'")
  ok=$(grep -c '^OK' $T); dup=$(grep -Ec '^(23505|P0001 ALREADY_CHECKED_IN)' $T)
  ck "round $r: twelve simultaneous stamps make one row" "$rows" 1
  ck "round $r: one succeeds, eleven are told already checked in" "$ok/$dup" "1/11"
done

# ── 2. two officers hand over the same prize ────────────────────────
q "insert into public.attendance (user_id, meeting_id) select '$NOEL', id from public.meetings where meeting_number between 9101 and 9110" >/dev/null
for r in $(seq 1 $ROUNDS); do
  q "delete from public.reward_handovers where user_id = '$NOEL'; delete from public.reward_claims where user_id = '$NOEL'" >/dev/null
  { for i in 1 2 3; do echo "authenticated|$C1|select public.hand_over_reward('$NOEL', 'r1')::text"; echo "authenticated|$C2|select public.hand_over_reward('$NOEL', 'r1')::text"; done; } | race $T
  ck "round $r: six hand-overs at once record one" "$(q "select count(*) from public.reward_handovers where user_id = '$NOEL' and reward_id = 'r1'")" 1
  ck "round $r: and one claim, written by the hand-over" "$(q "select count(*) || ' ' || bool_and(claimed_by::text in ('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002')) from public.reward_claims where user_id = '$NOEL'")" "1 true"
  ck "round $r: the other five are told ALREADY_HANDED_OVER" "$(grep -c 'ALREADY_HANDED_OVER' $T)" 5
done

# ── 3. the member claims as an officer hands over ───────────────────
# Whichever is served first, the claim ends up the member's, the prize is
# handed over once, and the officer's Undo then leaves the member's claim.
for r in $(seq 1 $ROUNDS); do
  q "delete from public.reward_handovers where user_id = '$NOEL'; delete from public.reward_claims where user_id = '$NOEL'" >/dev/null
  { echo "authenticated|'$NOEL'|select public.claim_reward('$NOEL', 'r1')::text"
    echo "authenticated|$C1|select public.hand_over_reward('$NOEL', 'r1')::text"; } | race $T
  ck "round $r: claim and hand-over at once both succeed" "$(grep -c '^OK' $T)" 2
  ck "round $r: one claim, the member's own" "$(q "select count(*) || ' ' || bool_and(claimed_by = '$NOEL') from public.reward_claims where user_id = '$NOEL' and reward_id = 'r1'")" "1 true"
  q "select ctest.as('authenticated', '90000000-0000-0000-0000-000000000001', \$x\$select public.undo_hand_over('$NOEL', 'r1')::text\$x\$)" >/dev/null
  ck "round $r: the officer's Undo leaves the member's claim" "$(q "select (select count(*) from public.reward_claims where user_id = '$NOEL') || ' ' || (select count(*) from public.reward_handovers where user_id = '$NOEL')")" "1 0"
done

# ── 4. an officer takes a hand-over back as the member claims ───────
for r in $(seq 1 $ROUNDS); do
  q "delete from public.reward_handovers where user_id = '$NOEL'; delete from public.reward_claims where user_id = '$NOEL'" >/dev/null
  q "select ctest.as('authenticated', '90000000-0000-0000-0000-000000000001', \$x\$select public.hand_over_reward('$NOEL', 'r1')::text\$x\$)" >/dev/null
  { echo "authenticated|'$NOEL'|select public.claim_reward('$NOEL', 'r1')::text"
    echo "authenticated|$C1|select public.undo_hand_over('$NOEL', 'r1')::text"; } | race $T
  ck "round $r: undo and claim at once: the member holds the claim" "$(q "select count(*) || ' ' || bool_and(claimed_by = '$NOEL') from public.reward_claims where user_id = '$NOEL' and reward_id = 'r1'")" "1 true"
  ck "round $r: and the hand-over is gone" "$(q "select count(*) from public.reward_handovers where user_id = '$NOEL'")" 0
done

# ── 5. a member presses Claim five times at once ────────────────────
for r in $(seq 1 $ROUNDS); do
  q "delete from public.reward_handovers where user_id = '$NOEL'; delete from public.reward_claims where user_id = '$NOEL'" >/dev/null
  { for i in 1 2 3 4 5; do echo "authenticated|'$NOEL'|select public.claim_reward('$NOEL', 'r1')::text"; done; } | race $T
  ck "round $r: five claims at once make one row" "$(q "select count(*) from public.reward_claims where user_id = '$NOEL' and reward_id = 'r1'")" 1
  ck "round $r: and every press is answered as claimed" "$(grep -c '^OK' $T)" 5
done

# ── 6. two officers open check-in for two meetings at once ──────────
for r in $(seq 1 $ROUNDS); do
  q "update public.meetings set check_in_open = false where id in ('$M1','$M2'); update public.attendance_sessions set ended_at = now() where ended_at is null and meeting_id in ('$M1','$M2')" >/dev/null
  { echo "service_role|null|select (public.start_check_in('$M1', '90000000-0000-0000-0000-000000000001')).already_open::text"
    echo "service_role|null|select (public.start_check_in('$M2', '90000000-0000-0000-0000-000000000002')).already_open::text"; } | race $T
  ck "round $r: exactly one meeting takes check-ins" "$(q "select count(*) from public.meetings where check_in_open")" 1
  ck "round $r: the other is refused ATTENDANCE_ALREADY_OPEN" "$(grep -c 'ATTENDANCE_ALREADY_OPEN' $T)" 1
  ck "round $r: the open one has one live session, the other none" "$(q "select string_agg(n::text, ',' order by n) from (select count(s.id) n from public.meetings m left join public.attendance_sessions s on s.meeting_id = m.id and s.ended_at is null where m.id in ('$M1','$M2') group by m.id) z")" "0,1"
done

# ── 7. two officers open the same meeting at once ───────────────────
for r in $(seq 1 $ROUNDS); do
  q "update public.meetings set check_in_open = false where id in ('$M1','$M2'); update public.attendance_sessions set ended_at = now() where ended_at is null and meeting_id in ('$M1','$M2')" >/dev/null
  { for i in 1 2 3; do echo "service_role|null|select (public.start_check_in('$M1', '90000000-0000-0000-0000-000000000001')).already_open::text"; done; } | race $T
  ck "round $r: three opens of one meeting all succeed" "$(grep -c '^OK' $T)" 3
  ck "round $r: with one live session between them" "$(q "select count(*) from public.attendance_sessions where meeting_id = '$M1' and ended_at is null")" 1
done

# ── 8. closing as another officer opens ─────────────────────────────
for r in $(seq 1 $ROUNDS); do
  q "update public.meetings set check_in_open = false where id in ('$M1','$M2'); update public.attendance_sessions set ended_at = now() where ended_at is null and meeting_id in ('$M1','$M2')" >/dev/null
  { echo "service_role|null|select (public.start_check_in('$M1', '90000000-0000-0000-0000-000000000001')).already_open::text"
    echo "service_role|null|select public.end_check_in('$M1')::text"; } | race $T
  ck "round $r: open and close at once leave the meeting and its session agreeing" "$(q "select (select check_in_open from public.meetings where id = '$M1')::text || ' ' || (select count(*) from public.attendance_sessions where meeting_id = '$M1' and ended_at is null)")" "$(q "select case when check_in_open then 'true 1' else 'false 0' end from public.meetings where id = '$M1'")"
done

# ── 9. an empty meeting deleted as someone is stamped into it ───────
for r in $(seq 1 $ROUNDS); do
  q "delete from public.attendance where meeting_id = '$M2'; update public.meetings set check_in_open = false where id = '$M2'" >/dev/null
  q "insert into public.meetings (id, meeting_number, meeting_date, start_time, end_time) values ('$M2', 9002, (now() at time zone 'America/Los_Angeles')::date, '3:00 PM', '4:00 PM') on conflict (id) do nothing" >/dev/null
  { echo "authenticated|$C1|delete from public.meetings where id = '$M2' returning 'deleted'"
    echo "authenticated|$C2|select public.stamp_by_hand('$OPAL', '$M2')::text"; } | race $T
  left=$(q "select (select count(*) from public.meetings where id = '$M2') || ' ' || (select count(*) from public.attendance where meeting_id = '$M2')")
  case "$left" in "1 1"|"0 0") ok=yes;; *) ok="$left";; esac
  ck "round $r: either the stamp stands on its meeting, or both are gone" "$ok" yes
done

rm -f $T
$PSQL >/dev/null <<'SQL'
delete from public.reward_handovers where user_id::text like '9%';
delete from public.reward_claims where user_id::text like '9%';
delete from public.attendance where user_id::text like '9%' or meeting_id::text like '9%';
delete from public.attendance_sessions where meeting_id::text like '9%';
delete from public.meetings where id::text like '9%';
delete from auth.users where id::text like '9%';
SQL
echo
echo "$pass/$((pass+fail)) passed"
[ $fail -eq 0 ]
