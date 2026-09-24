// ═══════════════════════════════════════════════════════════════════
// attendance-session — board only
//
// Opens and closes check-in for a meeting, and issues the short-lived
// signed codes the projector shows as a QR code.
//
// The signing secret (ATTENDANCE_TOKEN_SECRET) exists only here and in
// verify-attendance, in the functions' environment. It is never sent to a
// browser, so no member can compute a code no matter what they inspect.
//
// Source of the deployed `attendance-session` function (deployed as its
// index.ts):
//   supabase functions deploy attendance-session
//   supabase secrets set ATTENDANCE_TOKEN_SECRET="$(openssl rand -hex 32)"
// Needs migrations/2026-09-24-check-in-transitions.sql (start_check_in,
// end_check_in) on the database first.
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const TOKEN_SECRET  = Deno.env.get('ATTENDANCE_TOKEN_SECRET')!;

// A code is good for 45 s from the moment it is issued, and the projector
// asks for the next one every 15 s. So the code on the wall always has at
// least 30 s left: a phone with a slow camera, or a slow network, still
// lands inside it. A photo of the wall forwarded out of the room is
// refused within 45 s of being taken, instead of working for as long as
// check-in stays open. The server decides: verify-attendance checks the
// expiry on its own clock, and refuses a code that claims to last longer
// than this (a code from before this change, made to last all day).
const TOKEN_TTL_MS = 45_000;
const REFRESH_MS   = 15_000;

// DAY_CODES_FOR_OLD_PAGES: while the page published before rotation is
// still the live one, a request without rotate:true gets the code that
// page always got (one for the meeting's day, which verify-attendance
// accepts while its ACCEPT_DAY_CODES is true). Once the rotating page is
// live, both switches go to false and both functions are deployed
// together: an old page is then refused (RELOAD_REQUIRED) and no
// day-long code is issued or accepted.
const DAY_CODES_FOR_OLD_PAGES = true;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

// A refusal the database names (raise ... using errcode 'P0001') is a
// verdict for the officer, answered 200 with ok:false like every other
// refusal here; anything else is a server fault.
const REFUSALS = ['ATTENDANCE_ALREADY_OPEN', 'MEETING_NOT_FOUND', 'NOT_AUTHORIZED'];
const refusal = (error: { code?: string; message?: string } | null) =>
  error && error.code === 'P0001' && REFUSALS.find(c => String(error.message ?? '').includes(c));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (!TOKEN_SECRET) return json({ ok: false, code: 'SERVER_ERROR' }, 500);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, code: 'NOT_AUTHENTICATED' }, 401);

  // Identify the caller with THEIR token, so we learn who they really
  // are rather than trusting anything in the request body. The client
  // that does the identifying holds the PUBLIC key: the service role is
  // reserved for `admin` below, where privilege is the point.
  const jwt = auth.slice('Bearer '.length).trim();
  const asUser = createClient(SUPABASE_URL, ANON_KEY);
  const { data: userData } = await asUser.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ ok: false, code: 'NOT_AUTHENTICATED' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Board check reads the database. A role claim in the request body
  // would be worthless — the browser writes that.
  const { data: profile, error: pErr } = await admin
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  // A failed role lookup is not "not a board member". Denying on an
  // outage is the right call, but it gets its own code so a board member
  // is not told their account was demoted.
  if (pErr) return json({ ok: false, code: 'SERVER_ERROR' }, 500);
  if (!profile || profile.role !== 'board')
    return json({ ok: false, code: 'NOT_AUTHORIZED' }, 403);

  let body: { action?: string; meeting_id?: string; rotate?: boolean };
  try { body = await req.json(); } catch { return json({ ok: false, code: 'INVALID_REQUEST' }, 400); }

  const meetingId = body.meeting_id;
  if (!meetingId) return json({ ok: false, code: 'INVALID_REQUEST' }, 400);

  // ── start ────────────────────────────────────────────────────────
  // One state change in the database, under one lock (start_check_in):
  // refused while another meeting is taking check-ins, never closing it;
  // a second officer opening the same meeting at once is told it is
  // already open; the session and the meeting's check_in_open change
  // together.
  if (body.action === 'start') {
    const { data, error } = await admin.rpc('start_check_in',
      { p_meeting_id: meetingId, p_officer: user.id });
    const named = refusal(error);
    if (named) return json({ ok: false, code: named }, named === 'NOT_AUTHORIZED' ? 403 : 200);
    if (error) return json({ ok: false, code: 'SERVER_ERROR' }, 500);
    const row = Array.isArray(data) ? data[0] : data;
    return json({ ok: true, meeting_id: meetingId, open: true, already_open: Boolean(row?.already_open) });
  }

  // ── end ──────────────────────────────────────────────────────────
  // The meeting and its session close together (end_check_in). Closing a
  // meeting that is already closed is not an error.
  if (body.action === 'end') {
    const { data, error } = await admin.rpc('end_check_in', { p_meeting_id: meetingId });
    const named = refusal(error);
    if (named) return json({ ok: false, code: named }, 200);
    if (error) return json({ ok: false, code: 'SERVER_ERROR' }, 500);
    return json({ ok: true, meeting_id: meetingId, open: false, was_open: Boolean(data) });
  }

  // ── token ────────────────────────────────────────────────────────
  if (body.action === 'token') {
    // A page published before codes were short-lived asks for one code
    // and shows it until it is reloaded: it would put up a code that dies
    // in 45 s and never replace it. It is refused instead, so its wall
    // says it could not load the code rather than showing a dead one.
    if (body.rotate !== true && !DAY_CODES_FOR_OLD_PAGES)
      return json({ ok: false, code: 'RELOAD_REQUIRED' }, 200);

    const { data: meeting, error: mErr } = await admin
      .from('meetings').select('id, meeting_date, check_in_open').eq('id', meetingId).maybeSingle();
    if (mErr) return json({ ok: false, code: 'SERVER_ERROR' }, 500);
    if (!meeting) return json({ ok: false, code: 'MEETING_NOT_FOUND' }, 200);

    const { data: session, error: sErr } = await admin.from('attendance_sessions')
      .select('id').eq('meeting_id', meetingId).is('ended_at', null).maybeSingle();
    if (sErr) return json({ ok: false, code: 'SERVER_ERROR' }, 500);
    if (!session || !meeting.check_in_open)
      return json({ ok: false, code: 'ATTENDANCE_CLOSED' }, 200);

    // An old page's code, exactly as the function before this one made it
    if (body.rotate !== true) {
      const day = Date.parse(`${meeting.meeting_date}T23:59:59-08:00`);
      if (!Number.isFinite(day)) return json({ ok: false, code: 'SERVER_ERROR' }, 500);
      const payload = `${session.id}.${meetingId}.${day}`;
      const token = `keystamp://a/${b64url(new TextEncoder().encode(payload))}.${await sign(payload)}`;
      return json({ ok: true, token, expires_at: new Date(day).toISOString(), static: true });
    }

    // The code names the session (closing check-in kills every code it
    // issued), the meeting, and its own expiry, and is signed. The expiry
    // is on the server's clock and checked by the server.
    const exp = Date.now() + TOKEN_TTL_MS;
    const payload = `${session.id}.${meetingId}.${exp}`;
    const token = `keystamp://a/${b64url(new TextEncoder().encode(payload))}.${await sign(payload)}`;

    return json({
      ok: true, token,
      expires_at: new Date(exp).toISOString(),
      // how long the code lasts, so a projector whose clock is off can
      // still tell when it has run out; and when it asks for the next
      expires_in: TOKEN_TTL_MS,
      refresh_in: REFRESH_MS,
    });
  }

  return json({ ok: false, code: 'INVALID_REQUEST' }, 400);
});
