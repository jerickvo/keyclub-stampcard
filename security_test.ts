// Phase 7 security tests.
//
// These run the REAL Edge Function source. supabase-js is redirected to a
// stub via import_map.json, and Deno.serve is intercepted so the handler can
// be called directly instead of bound to a port.
//
// Every test below defends a boundary that, if it broke, would let someone
// gain a stamp they did not earn, see data that is not theirs, or be shown a
// backend failure dressed up as real data.

import { db, users, FAIL, reset, createClient } from './stub.ts';

const FN = '../../keystamp/supabase/functions';
type H = (r: Request) => Promise<Response> | Response;

let captured: H | null = null;
(Deno as any).serve = (h: H) => { captured = h; return { finished: Promise.resolve() }; };
Deno.env.set('SUPABASE_URL', 'https://stub.supabase.co');
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
Deno.env.set('ATTENDANCE_TOKEN_SECRET', 'test-secret-not-a-real-one');

async function load(name: string): Promise<H> {
  captured = null;
  await import(`${FN}/${name}/index.ts?v=${crypto.randomUUID()}`);
  if (!captured) throw new Error(`${name} did not register a handler`);
  return captured;
}

const post = (h: H, body: unknown, jwt?: string) =>
  h(new Request('https://x/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body),
  }));

const R: Array<[string, boolean, string]> = [];
const ck = (name: string, cond: unknown, detail = '') => R.push([name, !!cond, detail]);

// ── token minting, exactly as attendance-session does it ──
const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sign(payload: string, secret: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(payload))));
}
const mint = async (sid: string, mid: string, exp: number, secret = 'test-secret-not-a-real-one') => {
  const p = `${sid}.${mid}.${exp}`;
  return `keystamp://a/${b64url(new TextEncoder().encode(p))}.${await sign(p, secret)}`;
};

const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

/** a club with one board member, one ordinary member, one open meeting */
function seed() {
  reset();
  users['jwt-member'] = { id: 'u-member' };
  users['jwt-board']  = { id: 'u-board' };
  db.profiles.push({ id: 'u-member', username: 'member', display_name: 'member', role: 'member', created_at: '2026-01-01' });
  db.profiles.push({ id: 'u-board',  username: 'boardy', display_name: 'boardy', role: 'board',  created_at: '2026-01-01' });
  db.meetings.push({ id: 'm-1', meeting_number: 1, meeting_date: today(), start_time: '3:15 PM',
                     end_time: '4:15 PM', location: 'MPR', check_in_open: true });
  db.attendance_sessions.push({ id: 's-1', meeting_id: 'm-1', started_by: 'u-board', ended_at: null });
}

const verify  = await load('verify-attendance');
const board   = await load('board-data');
const session = await load('attendance-session');

// ═══════════════ 1. QR / ATTENDANCE INTEGRITY ═══════════════
{
  seed();
  const good = await mint('s-1', 'm-1', Date.now() + 20_000);

  let r = await (await post(verify, { code: good }, 'jwt-member')).json();
  ck('valid code grants exactly one stamp', r.ok === true && db.attendance.length === 1, JSON.stringify(r));

  r = await (await post(verify, { code: good }, 'jwt-member')).json();
  ck('same code twice is refused by the unique constraint',
     r.ok === false && r.code === 'ALREADY_CHECKED_IN' && db.attendance.length === 1, JSON.stringify(r));

  // forged signature: right shape, wrong secret
  seed();
  const forged = await mint('s-1', 'm-1', Date.now() + 20_000, 'attacker-guess');
  r = await (await post(verify, { code: forged }, 'jwt-member')).json();
  ck('forged signature rejected', r.code === 'INVALID_TOKEN' && db.attendance.length === 0, JSON.stringify(r));

  // payload edited, signature left alone
  const tampered = good.replace(/\/a\/([^.]+)\./, (_m, p1) =>
    `/a/${b64url(new TextEncoder().encode(`s-1.m-1.${Date.now() + 9e9}`))}.`);
  r = await (await post(verify, { code: tampered }, 'jwt-member')).json();
  ck('edited payload rejected', r.code === 'INVALID_TOKEN' && db.attendance.length === 0, JSON.stringify(r));

  seed();
  r = await (await post(verify, { code: await mint('s-1', 'm-1', Date.now() - 1000) }, 'jwt-member')).json();
  ck('expired token rejected', r.code === 'EXPIRED_TOKEN' && db.attendance.length === 0, JSON.stringify(r));

  // a properly signed token for a meeting the session does not belong to
  seed();
  db.meetings.push({ id: 'm-2', meeting_number: 2, meeting_date: today(), start_time: '3:15 PM',
                     location: 'MPR', check_in_open: true });
  r = await (await post(verify, { code: await mint('s-1', 'm-2', Date.now() + 20_000) }, 'jwt-member')).json();
  ck('token for the wrong meeting rejected', r.code === 'INVALID_TOKEN' && db.attendance.length === 0, JSON.stringify(r));

  seed();
  db.attendance_sessions[0].ended_at = new Date().toISOString();
  r = await (await post(verify, { code: await mint('s-1', 'm-1', Date.now() + 20_000) }, 'jwt-member')).json();
  ck('closed session rejected', r.code === 'ATTENDANCE_CLOSED' && db.attendance.length === 0, JSON.stringify(r));

  seed();
  db.meetings[0].check_in_open = false;
  r = await (await post(verify, { code: await mint('s-1', 'm-1', Date.now() + 20_000) }, 'jwt-member')).json();
  ck('check-in not open rejected', r.code === 'MEETING_NOT_ACTIVE' && db.attendance.length === 0, JSON.stringify(r));

  seed();
  db.meetings[0].meeting_date = '2026-01-07';
  r = await (await post(verify, { code: await mint('s-1', 'm-1', Date.now() + 20_000) }, 'jwt-member')).json();
  ck('code from another day rejected', r.code === 'WRONG_DAY' && db.attendance.length === 0, JSON.stringify(r));

  seed();
  const res = await post(verify, { code: await mint('s-1', 'm-1', Date.now() + 20_000) });
  ck('unauthenticated scan refused', res.status === 401 && db.attendance.length === 0);

  // the member id must come from the JWT, never the body
  seed();
  r = await (await post(verify, {
    code: await mint('s-1', 'm-1', Date.now() + 20_000), user_id: 'u-board',
  }, 'jwt-member')).json();
  ck('user_id in the body is ignored',
     r.ok === true && db.attendance[0].user_id === 'u-member', JSON.stringify(db.attendance[0]));

  ck('server-written rows are labelled qr', db.attendance[0].verification_method === 'qr');

  // a database fault must not read as a bad code
  seed();
  FAIL.add('attendance_sessions');
  const fr = await post(verify, { code: await mint('s-1', 'm-1', Date.now() + 20_000) }, 'jwt-member');
  r = await fr.json();
  ck('session lookup failure is SERVER_ERROR, not INVALID_TOKEN',
     fr.status === 500 && r.code === 'SERVER_ERROR', JSON.stringify(r));
  FAIL.clear();
}

// ═══════════════ 2. BOARD AUTHORIZATION ═══════════════
{
  seed();
  let res = await post(board, { action: 'overview' }, 'jwt-member');
  ck('member cannot read board data', res.status === 403);

  res = await post(board, { action: 'overview' });
  ck('unauthenticated board request refused', res.status === 401);

  res = await post(board, { action: 'overview', role: 'board' }, 'jwt-member');
  ck('role:board in the body does nothing', res.status === 403);

  res = await post(board, { action: 'overview', id: 'u-board', user_id: 'u-board' }, 'jwt-member');
  ck("another user's id in the body does nothing", res.status === 403);

  res = await post(board, { action: 'overview' }, 'jwt-board');
  ck('board member is allowed through', res.status === 200 && (await res.json()).ok === true);

  // demote mid-session: authority is re-read from the database every call
  db.profiles.find(p => p.id === 'u-board')!.role = 'member';
  res = await post(board, { action: 'overview' }, 'jwt-board');
  ck('authority re-read per call, not cached', res.status === 403);

  seed();
  res = await post(session, { action: 'start', meeting_id: 'm-1' }, 'jwt-member');
  ck('member cannot open an attendance session', res.status === 403);

  res = await post(session, { action: 'token', meeting_id: 'm-1' }, 'jwt-member');
  ck('member cannot mint a QR token', res.status === 403);

  const tok = await (await post(session, { action: 'token', meeting_id: 'm-1' }, 'jwt-board')).json();
  ck('board can mint a token', tok.ok === true && typeof tok.token === 'string');
  ck('minted token verifies', (await (await post(verify, { code: tok.token }, 'jwt-member')).json()).ok === true);
}

// ═══════════════ 3. BACKEND FAILURE ≠ EMPTY CLUB ═══════════════
{
  seed();
  db.attendance.push({ id: 'a1', user_id: 'u-member', meeting_id: 'm-1', checked_in_at: new Date().toISOString(), verification_method: 'qr' });

  let r = await (await post(board, { action: 'overview' }, 'jwt-board')).json();
  ck('overview reports real figures', r.total_members === 1 && r.total_seals === 1, JSON.stringify(r));

  for (const table of ['profiles', 'attendance', 'meetings']) {
    FAIL.add(table);
    const res = await post(board, { action: 'overview' }, 'jwt-board');
    const body = await res.json();
    ck(`overview: ${table} failure is an error, never zeros`,
       res.status === 500 && body.ok === false && body.total_seals === undefined,
       JSON.stringify(body));
    FAIL.clear();
  }

  FAIL.add('attendance');
  let res = await post(board, { action: 'members', page: 1, sort: 'username' }, 'jwt-board');
  let body = await res.json();
  ck('member list: attendance failure never becomes 0 stamps',
     res.status === 500 && body.ok === false, JSON.stringify(body));
  FAIL.clear();

  FAIL.add('attendance');
  res = await post(board, { action: 'meeting', id: 'm-1' }, 'jwt-board');
  body = await res.json();
  ck('meeting detail: failure never becomes 0 attendees',
     res.status === 500 && body.ok === false, JSON.stringify(body));
  FAIL.clear();

  FAIL.add('attendance');
  res = await post(board, { action: 'member', id: 'u-member' }, 'jwt-board');
  body = await res.json();
  ck('member detail: failure never becomes 0 stamps',
     res.status === 500 && body.ok === false, JSON.stringify(body));
  FAIL.clear();

  FAIL.add('profiles');
  res = await post(board, { action: 'overview' }, 'jwt-board');
  body = await res.json();
  ck('role lookup failure is 500, not "you are not board"',
     res.status === 500 && body.code === 'SERVER_ERROR', JSON.stringify(body));
  FAIL.clear();

  // ── the club-hub aggregates are subject to the same rule ──
  seed();
  db.profiles.push({ id: 'u-2', username: 'two', display_name: 'two', role: 'member', created_at: '2026-01-01' });
  for (let i = 0; i < 12; i++) {
    db.meetings.push({ id: `m-h${i}`, meeting_number: 10 + i, meeting_date: '2026-01-07',
                       start_time: '3:15 PM', location: 'MPR', check_in_open: false });
    db.attendance.push({ id: `a-${i}`, user_id: 'u-member', meeting_id: `m-h${i}`,
                         checked_in_at: '2026-01-07T22:00:00.000Z', verification_method: 'qr' });
  }
  db.attendance.push({ id: 'a-x', user_id: 'u-2', meeting_id: 'm-h0',
                       checked_in_at: '2026-01-07T22:00:00.000Z', verification_method: 'qr' });

  r = await (await post(board, { action: 'overview' }, 'jwt-board')).json();
  ck('milestones are counted from attendance, not stored',
     r.milestones?.m10 === 1 && r.milestones?.m20 === 0 && r.milestones?.m30 === 0,
     JSON.stringify(r.milestones));
  ck('participating members counts distinct attendees',
     r.participating_members === 2, String(r.participating_members));
  ck('meetings_held counts every meeting whose date has passed',
     r.meetings_held === 13, String(r.meetings_held));   // 12 here + the one seed() makes
  ck('average per meeting is derived, not stored',
     r.average_attendance === Math.round((13 / 13) * 10) / 10, String(r.average_attendance));

  // a scheduled-but-not-yet-held meeting must not count as held
  db.meetings.push({ id: 'm-future', meeting_number: 99, meeting_date: '2099-01-07',
                     start_time: '3:15 PM', location: 'MPR', check_in_open: false });
  r = await (await post(board, { action: 'overview' }, 'jwt-board')).json();
  ck('a future meeting is scheduled but not held',
     r.meetings_held === 13 && r.total_meetings === 14,
     r.meetings_held + '/' + r.total_meetings);
  // today's meeting outranks a meeting years away — "next" means soonest,
  // and a meeting happening this afternoon is the one an officer needs
  ck('the next meeting is the soonest one, not just any future one',
     r.next_meeting?.meeting_number === 1, JSON.stringify(r.next_meeting));

  // a club that has held nothing reports null, not a confident 0.0
  seed();
  db.meetings[0].meeting_date = '2099-01-07';
  r = await (await post(board, { action: 'overview' }, 'jwt-board')).json();
  ck('no meetings held reports null average, not zero',
     r.average_attendance === null, String(r.average_attendance));

  seed();
  FAIL.add('attendance');
  res = await post(board, { action: 'overview' }, 'jwt-board');
  body = await res.json();
  ck('a failed roll-up never becomes zero milestones',
     res.status === 500 && body.milestones === undefined
     && body.participating_members === undefined, JSON.stringify(body));
  FAIL.clear();

  // and no Postgres detail ever reaches the browser
  FAIL.add('attendance');
  const raw = await (await post(board, { action: 'overview' }, 'jwt-board')).text();
  ck('no database detail leaked to the client',
     !/simulated backend failure|XX000|hint|details/i.test(raw), raw.slice(0, 120));
  FAIL.clear();
}

// ═══════════════ 4. SESSION CONTROL FAILS CLOSED ═══════════════
{
  seed();
  db.meetings[0].check_in_open = false;
  db.attendance_sessions.length = 0;

  FAIL.add('meetings');
  let res = await post(session, { action: 'start', meeting_id: 'm-1' }, 'jwt-board');
  ck('a failed start reports failure, not ok:true', res.status === 500, String(res.status));
  FAIL.clear();

  res = await post(session, { action: 'start', meeting_id: 'm-1' }, 'jwt-board');
  const started = await res.json();
  ck('start actually opens check-in',
     started.ok === true && db.meetings[0].check_in_open === true, JSON.stringify(started));

  FAIL.add('meetings');
  res = await post(session, { action: 'end', meeting_id: 'm-1' }, 'jwt-board');
  ck('a failed end reports failure, not "closed"', res.status === 500, String(res.status));
  FAIL.clear();

  const ended = await (await post(session, { action: 'end', meeting_id: 'm-1' }, 'jwt-board')).json();
  ck('end closes both the meeting and the session',
     ended.ok === true && db.meetings[0].check_in_open === false
     && db.attendance_sessions.every(s => s.ended_at), JSON.stringify(ended));

  const after = await (await post(session, { action: 'token', meeting_id: 'm-1' }, 'jwt-board')).json();
  ck('no token is issued once check-in has ended', after.ok === false && after.code === 'ATTENDANCE_CLOSED');
}

// ═══════════════ 5. SECRET HANDLING ═══════════════
{
  seed();
  const tok = await (await post(session, { action: 'token', meeting_id: 'm-1' }, 'jwt-board')).text();
  ck('the signing secret never appears in a response', !tok.includes('test-secret-not-a-real-one'));
  ck('the service-role key never appears in a response', !tok.includes('service-key'));

  const ov = await (await post(board, { action: 'member', id: 'u-member' }, 'jwt-board')).text();
  ck('board payloads carry no synthetic auth address', !/@keystamp\.invalid/.test(ov));
}

const ok = R.filter(([, c]) => c).length;
for (const [n, c, d] of R) console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && d ? '  <- ' + d.slice(0, 90) : ''));
console.log(`\n${ok}/${R.length} passed`);
if (ok !== R.length) Deno.exit(1);
