// ═══════════════════════════════════════════════════════════════════
// verify-attendance
//
// The only thing in Keystamp that can grant a stamp.
//
// Everything the browser sends is treated as a claim, not a fact: the
// member is identified from their JWT, the meeting and session are
// re-read from the database, and the clock is the SERVER's. A token is
// accepted only if it carries a valid HMAC made with a secret that
// exists nowhere outside this function's environment.
//
// Source of the deployed `verify-attendance` function (deployed as its
// index.ts):
//   supabase functions deploy verify-attendance
//   supabase secrets set ATTENDANCE_TOKEN_SECRET="<same value as attendance-session>"
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const TOKEN_SECRET = Deno.env.get('ATTENDANCE_TOKEN_SECRET')!;

// attendance-session issues codes that last 45 s. A signed code that
// claims to last longer than this was made before codes were short-lived
// (one code for the whole day): it is refused as expired, so a photo of
// an old wall cannot be used while that check-in stays open.
const MAX_CODE_LIFE_MS = 60_000;
// ACCEPT_DAY_CODES: true while attendance-session still issues day-long
// codes to the page published before rotation (its
// DAY_CODES_FOR_OLD_PAGES). Both go to false, and both functions are
// deployed together, once the rotating page is live.
const ACCEPT_DAY_CODES = true;

// The club is in one place and meets on one local calendar day. UTC is
// not that calendar: at 4:00 PM Pacific in winter it is already the next
// day in UTC, so a legitimate afternoon check-in was being told
// WRONG_DAY. The comparison has to happen in the club's timezone.
const CLUB_TZ = 'America/Los_Angeles';
const clubDay = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);                                     // YYYY-MM-DD

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
// Verdicts return 200 with ok:false. A rejected code is a normal
// outcome, not a transport failure — the client distinguishes the two.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const fromB64url = (s: string) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(pad + '==='.slice((pad.length + 3) % 4)), c => c.charCodeAt(0));
};
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

// constant-time compare: a fast reject on the first wrong byte leaks
// how much of a guess was right
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!TOKEN_SECRET) return json({ ok: false, code: 'SERVER_ERROR' }, 500);

  // 1. authenticate the member
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, code: 'NOT_AUTHENTICATED' }, 401);

  // Identity is resolved on a client holding the PUBLIC key, with the
  // caller's JWT passed explicitly. The service role appears in exactly
  // one place, below, where privilege is actually the point.
  const jwt = auth.slice('Bearer '.length).trim();
  const asUser = createClient(SUPABASE_URL, ANON_KEY);
  const { data: userData } = await asUser.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ ok: false, code: 'NOT_AUTHENTICATED' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // 2. read the payload
  let body: { code?: string };
  try { body = await req.json(); } catch { return json({ ok: false, code: 'INVALID_TOKEN' }); }
  const raw = String(body.code ?? '').trim();
  if (!raw) return json({ ok: false, code: 'INVALID_TOKEN' });

  // 3. validate the token's shape and signature
  const bare = raw.toLowerCase().startsWith('keystamp://a/') ? raw.slice('keystamp://a/'.length) : raw;
  const dot = bare.lastIndexOf('.');
  if (dot < 1) return json({ ok: false, code: 'INVALID_TOKEN' });

  const encoded = bare.slice(0, dot);
  const provided = bare.slice(dot + 1);

  let payload: string;
  try { payload = new TextDecoder().decode(fromB64url(encoded)); }
  catch { return json({ ok: false, code: 'INVALID_TOKEN' }); }

  if (!safeEqual(provided, await sign(payload)))
    return json({ ok: false, code: 'INVALID_TOKEN' });

  const [sessionId, meetingId, expStr] = payload.split('.');
  if (!sessionId || !meetingId || !expStr) return json({ ok: false, code: 'INVALID_TOKEN' });

  // 4. expiry, on the server's clock: past its expiry, or made to last
  // longer than a code now lasts
  const exp = Number(expStr);
  const now = Date.now();
  if (!Number.isFinite(exp) || now > exp || (!ACCEPT_DAY_CODES && exp - now > MAX_CODE_LIFE_MS))
    return json({ ok: false, code: 'EXPIRED_TOKEN' });

  // 5. the session must still be running.
  // A read that ERRORS is not a read that found nothing: reporting a
  // database outage as INVALID_TOKEN would tell a member standing in the
  // room that their code is fake. Fail closed, but fail honestly.
  const { data: session, error: sErr } = await admin.from('attendance_sessions')
    .select('id, meeting_id, ended_at').eq('id', sessionId).maybeSingle();
  if (sErr) return json({ ok: false, code: 'SERVER_ERROR' }, 500);
  if (!session) return json({ ok: false, code: 'INVALID_TOKEN' });
  if (session.ended_at) return json({ ok: false, code: 'ATTENDANCE_CLOSED' });
  if (session.meeting_id !== meetingId) return json({ ok: false, code: 'INVALID_TOKEN' });

  // 6. the meeting must exist, be open, and be today
  const { data: meeting, error: mErr } = await admin.from('meetings')
    .select('id, meeting_number, meeting_date, check_in_open')
    .eq('id', meetingId).maybeSingle();
  if (mErr) return json({ ok: false, code: 'SERVER_ERROR' }, 500);
  if (!meeting) return json({ ok: false, code: 'MEETING_NOT_FOUND' });
  if (!meeting.check_in_open) return json({ ok: false, code: 'MEETING_NOT_ACTIVE' });

  if (meeting.meeting_date !== clubDay()) return json({ ok: false, code: 'WRONG_DAY' });

  // 7. insert. The unique (user_id, meeting_id) constraint is the real
  // duplicate guard: if two scans race, one insert wins and the other
  // comes back 23505. No read-then-write, so there is no window
  // between the check and the write for a second request to slip into.
  const { data: row, error } = await admin.from('attendance').insert({
    user_id: user.id,
    meeting_id: meetingId,
    verification_method: 'qr',
  }).select('id, checked_in_at').single();

  if (error) {
    if (error.code === '23505') {
      return json({
        ok: false, code: 'ALREADY_CHECKED_IN',
        meeting_id: meetingId, meeting_number: meeting.meeting_number,
      });
    }
    // 23503: attendance.user_id has no matching profiles row yet. That
    // is the profile trigger not having landed for a brand-new account,
    // not a fault the member can do anything about — and it is worth its
    // own message, because "something went wrong" sends them to a board
    // member for a problem that fixes itself in a second.
    if (error.code === '23503') return json({ ok: false, code: 'PROFILE_NOT_READY' });
    return json({ ok: false, code: 'SERVER_ERROR' }, 500);
  }

  // 8. authoritative result
  const { count } = await admin.from('attendance')
    .select('id', { count: 'exact', head: true }).eq('user_id', user.id);

  return json({
    ok: true,
    attendance_id: row.id,
    checked_in_at: row.checked_in_at,
    meeting_id: meetingId,
    meeting_number: meeting.meeting_number,
    total_stamps: count ?? null,
  });
});
