// ═══════════════════════════════════════════════════════════════════
// board-data — board only
//
// The single privileged read path for club administration. Everything
// a board member needs to run a meeting comes through here, and the
// role is read from the database on every call, so a member cannot
// reach any of it by calling the same endpoint.
//
// It returns the minimum needed to administer attendance. It never
// returns a password hash, a session, a service-role detail, or the
// synthetic auth address — the board manages attendance, not identity
// internals.
//
// deploy:
//   supabase functions deploy board-data
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

// Meeting state is a statement about the club's calendar day, not UTC's.
// See the same helper in verify-attendance.
const CLUB_TZ = 'America/Los_Angeles';
const clubDay = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

// ── the rule this function now follows ──────────────────────────────
// Every read is checked. A query that fails is NOT a query that returned
// nothing, and the difference is the whole point: an unchecked
// `const { data } = await ...` turns a database outage into "0 members,
// 0 stamps, 0 attendees" delivered with ok:true, which is worse than an
// error because the board has no way to tell it apart from the truth.
// `must()` collapses that distinction into a throw, and the catch at the
// bottom turns it into one controlled SERVER_ERROR with no Postgres
// detail attached.
function must<T>(res: { data: T; error: unknown | null }): T {
  if (res.error) throw new Error('QUERY_FAILED');
  return res.data;
}
function mustCount(res: { count: number | null; error: unknown | null }): number {
  if (res.error) throw new Error('QUERY_FAILED');
  if (res.count === null || res.count === undefined) throw new Error('QUERY_FAILED');
  return res.count;
}

const PAGE_SIZE = 25;
const TIERS = [
  { id: 'r1', name: 'Club Merch',    required: 10 },
  { id: 'r2', name: 'Free Blindbox', required: 20 },
  { id: 'r3', name: '???',           required: 30 },
];

// What one tier is to one member: the same three lines the client's
// 01a-backend.js applies to its own stamps and claims. A claim is a fact
// (the member asked for the prize on the record), so a claimed tier stays
// reached even if a deleted meeting later takes stamps back. Whether the
// prize was then handed over is a separate fact, in reward_handovers. Every "rewards unlocked"
// figure this function returns counts the tiers that are not locked.
type Tier = { id: string; name: string; required: number };
const rewardState = (tier: Tier, stamps: number, claimed: boolean) =>
  claimed ? 'claimed' : stamps >= tier.required ? 'unlocked' : 'locked';
const reached = (stamps: number, claimed: Set<string> | undefined) =>
  TIERS.filter(t => rewardState(t, stamps, claimed?.has(t.id) ?? false) !== 'locked').length;
// claims grouped by member, from one read
const claimsByMember = (rows: { user_id: string; reward_id: string }[] | null) => {
  const by = new Map<string, Set<string>>();
  for (const c of rows ?? []) {
    if (!by.has(c.user_id)) by.set(c.user_id, new Set());
    by.get(c.user_id)!.add(c.reward_id);
  }
  return by;
};

// How long the officer who recorded a hand-over may take it back. The
// database decides (undo_hand_over); this only says whether to offer it.
const UNDO_MS = 15 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, code: 'NOT_AUTHENTICATED' }, 401);

  // Identify the caller from THEIR token, never from the request body.
  // Public key here; the service role is confined to `admin` below.
  const jwt = auth.slice('Bearer '.length).trim();
  const asUser = createClient(SUPABASE_URL, ANON_KEY);
  const { data: userData } = await asUser.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ ok: false, code: 'NOT_AUTHENTICATED' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Hand-overs keyed "user:reward", for the given members or everyone.
  // null, not an empty map, when the project has no reward_handovers
  // table yet (migrations/2026-09-23-reward-handover.sql not run): "no
  // prize has been handed over" and "this club does not record hand-overs"
  // are different facts. Any other failure is a failure.
  const handoversOf = async (ids: string[] | null) => {
    let q = admin.from('reward_handovers').select('user_id, reward_id, handed_at, handed_by').limit(20000);
    if (ids) q = q.in('user_id', ids);
    const { data, error } = await q;
    if (error) {
      const code = String((error as { code?: string }).code ?? '');
      if (code === '42P01' || code === 'PGRST205') return null;
      throw new Error('QUERY_FAILED');
    }
    const by = new Map<string, { handed_at: string; handed_by: string | null }>();
    for (const h of data ?? []) by.set(h.user_id + ':' + h.reward_id, h);
    return by;
  };

  // The gate. Read from the database every call — a role in a JWT
  // claim or a request body would be the browser's word for it.
  const { data: me, error: meErr } = await admin
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  // Deny on an outage, but do not call it "not a board account".
  if (meErr) return json({ ok: false, code: 'SERVER_ERROR' }, 500);
  if (!me || me.role !== 'board') return json({ ok: false, code: 'NOT_AUTHORIZED' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, code: 'INVALID_REQUEST' }, 400); }
  const action = String(body.action ?? '');

  try {
    // ── OVERVIEW ───────────────────────────────────────────────────
    if (action === 'overview') {
      const today = clubDay();
      const [members, seals, meetings, open, held, next, roll, claimRows] = await Promise.all([
        admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'member'),
        admin.from('attendance').select('id', { count: 'exact', head: true }),
        admin.from('meetings').select('id', { count: 'exact', head: true }),
        admin.from('meetings')
          .select('id, meeting_number, meeting_date, start_time, end_time, check_in_open')
          .eq('check_in_open', true).maybeSingle(),
        // "held" is meetings whose date has passed, which is what an
        // average-per-meeting figure has to divide by. Dividing by every
        // meeting ever created would count next month's scheduled
        // meetings as zero-attendance ones and drag the average down.
        admin.from('meetings').select('id', { count: 'exact', head: true }).lte('meeting_date', today),
        admin.from('meetings')
          .select('id, meeting_number, meeting_date, start_time, end_time, check_in_open')
          .gte('meeting_date', today).order('meeting_date', { ascending: true }).limit(1),
        // one pass over attendance is enough for participation and every
        // milestone tier. No counter is stored: these are recomputed from
        // the same rows the member's own stamp total comes from, so the
        // board and the member can never disagree.
        admin.from('attendance').select('user_id').limit(20000),
        // and one pass over claims: a milestone counts a member who
        // reached the tier or who holds its prize.
        admin.from('reward_claims').select('user_id, reward_id').limit(20000),
      ]);

      // Each of these four was previously `?? 0`. Every one of those was
      // a place a dead database rendered as a confident zero.
      const totalMembers  = mustCount(members);
      const totalSeals    = mustCount(seals);
      const totalMeetings = mustCount(meetings);
      const activeMeeting = must(open);
      const meetingsHeld  = mustCount(held);
      const nextMeeting   = (must(next) ?? [])[0] ?? null;

      const perMember = new Map<string, number>();
      for (const a of must(roll) ?? []) perMember.set(a.user_id, (perMember.get(a.user_id) ?? 0) + 1);
      const claimed = claimsByMember(must(claimRows));
      const everyone = new Set([...perMember.keys(), ...claimed.keys()]);
      const atTier = (t: Tier) => [...everyone]
        .filter(id => rewardState(t, perMember.get(id) ?? 0, claimed.get(id)?.has(t.id) ?? false) !== 'locked')
        .length;

      let todayCount = 0;
      if (activeMeeting?.id) {
        todayCount = mustCount(await admin.from('attendance')
          .select('id', { count: 'exact', head: true }).eq('meeting_id', activeMeeting.id));
      }

      return json({
        ok: true,
        total_members: totalMembers,
        total_seals: totalSeals,           // derived, never stored
        total_meetings: totalMeetings,
        meetings_held: meetingsHeld,
        participating_members: perMember.size,
        // null rather than 0 when nothing has been held: "no meetings yet"
        // and "nobody comes" are different facts and must look different.
        average_attendance: meetingsHeld > 0
          ? Math.round((totalSeals / meetingsHeld) * 10) / 10
          : null,
        milestones: { m10: atTier(TIERS[0]), m20: atTier(TIERS[1]), m30: atTier(TIERS[2]) },
        active_meeting: activeMeeting ?? null,
        next_meeting: nextMeeting,
        today_attendance: todayCount,
        server_date: today,
      });
    }

    // ── MEMBERS LIST ───────────────────────────────────────────────
    if (action === 'members') {
      const page = Math.max(1, Number(body.page ?? 1));
      const q = String(body.q ?? '').trim().toLowerCase();
      const sort = String(body.sort ?? 'username');

      // Search hits the database, not the rendered page.
      let query = admin.from('profiles')
        .select('id, username, display_name, role, created_at', { count: 'exact' })
        .eq('role', 'member');
      if (q) query = query.ilike('username', `%${q}%`);

      // Stamp-ordered sorts need the counts first, so they are resolved
      // after aggregation below; the database orders the rest.
      if (sort === 'newest') query = query.order('created_at', { ascending: false });
      else query = query.order('username', { ascending: true });

      const wide = sort === 'stamps_desc' || sort === 'stamps_asc' || sort === 'recent';
      const from = wide ? 0 : (page - 1) * PAGE_SIZE;
      const to   = wide ? 499 : from + PAGE_SIZE - 1;      // hard ceiling either way

      const { data: rows, count, error } = await query.range(from, to);
      if (error) throw error;

      const ids = (rows ?? []).map(r => r.id);
      const totals = new Map<string, number>();
      const lastAt = new Map<string, string>();
      let claimed = new Map<string, Set<string>>();

      if (ids.length) {
        // one read, aggregated here, rather than a query per member.
        // Unchecked, a failure here showed every member on the page with
        // 0 stamps — a whole club apparently reset overnight.
        const att = must(await admin.from('attendance')
          .select('user_id, checked_in_at').in('user_id', ids));
        for (const a of att ?? []) {
          totals.set(a.user_id, (totals.get(a.user_id) ?? 0) + 1);
          const prev = lastAt.get(a.user_id);
          if (!prev || a.checked_in_at > prev) lastAt.set(a.user_id, a.checked_in_at);
        }
        claimed = claimsByMember(must(await admin.from('reward_claims')
          .select('user_id, reward_id').in('user_id', ids)));
      }

      let members = (rows ?? []).map(r => {
        const stamps = totals.get(r.id) ?? 0;
        return {
          id: r.id,
          username: r.display_name || r.username,
          stamps,
          rewards_unlocked: reached(stamps, claimed.get(r.id)),
          created_at: r.created_at,
          last_attendance: lastAt.get(r.id) ?? null,
        };
      });

      let total = count ?? members.length;
      if (wide) {
        members.sort((a, b) =>
          sort === 'stamps_desc' ? b.stamps - a.stamps :
          sort === 'stamps_asc'  ? a.stamps - b.stamps :
          String(b.last_attendance ?? '').localeCompare(String(a.last_attendance ?? '')));
        total = members.length;
        members = members.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      }

      return json({
        ok: true, members, page, page_size: PAGE_SIZE, total,
        pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      });
    }

    // ── ONE MEMBER ─────────────────────────────────────────────────
    if (action === 'member') {
      const id = String(body.id ?? '');
      if (!id) return json({ ok: false, code: 'INVALID_REQUEST' }, 400);

      const p = must(await admin.from('profiles')
        .select('id, username, display_name, role, created_at').eq('id', id).maybeSingle());
      if (!p) return json({ ok: false, code: 'MEMBER_NOT_FOUND' });

      // `stamps` below is derived from att.length. Unchecked, a failed
      // read made a 30-stamp member look like they had never attended.
      const att = must(await admin.from('attendance')
        .select('id, meeting_id, checked_in_at, verification_method')
        .eq('user_id', id).order('checked_in_at', { ascending: false }).limit(200));

      const meetingIds = [...new Set((att ?? []).map(a => a.meeting_id))];
      const meetings = new Map<string, Record<string, unknown>>();
      if (meetingIds.length) {
        const ms = must(await admin.from('meetings')
          .select('id, meeting_number, meeting_date, start_time, location').in('id', meetingIds));
        for (const m of ms ?? []) meetings.set(m.id, m);
      }

      const claims = must(await admin.from('reward_claims')
        .select('reward_id, claimed_at').eq('user_id', id));
      const claimed = new Set((claims ?? []).map(c => c.reward_id));
      const claimedAt = new Map((claims ?? []).map(c => [c.reward_id, c.claimed_at]));
      const handed = await handoversOf([id]);

      const stamps = (att ?? []).length;
      return json({
        ok: true,
        member: {
          id: p.id,
          username: p.display_name || p.username,
          role: p.role,
          created_at: p.created_at,
          stamps,
          last_attendance: att?.[0]?.checked_in_at ?? null,
        },
        // `state` keeps its three values so a page built before hand-overs
        // still reads it; the hand-over is a fact beside it. handed_at is
        // null when the prize has not been handed over, and absent
        // altogether (handovers: false) on a project without the table.
        handovers: handed !== null,
        rewards: TIERS.map(t => {
          const h = handed?.get(id + ':' + t.id) ?? null;
          return {
            id: t.id, name: t.name, required: t.required,
            unlocked: stamps >= t.required,
            claimed: claimed.has(t.id),
            claimed_at: claimedAt.get(t.id) ?? null,
            state: rewardState(t, stamps, claimed.has(t.id)),
            handed_at: h?.handed_at ?? null,
            // the officer who recorded it may take it back for a while
            can_undo: Boolean(h && h.handed_by === user.id &&
              Date.now() - Date.parse(h.handed_at) < UNDO_MS),
          };
        }),
        attendance: (att ?? []).map(a => {
          const m = meetings.get(a.meeting_id) ?? {};
          return {
            id: a.id,
            meeting_id: a.meeting_id,
            meeting_number: m.meeting_number ?? null,
            meeting_date: m.meeting_date ?? null,
            location: m.location ?? 'MPR',
            checked_in_at: a.checked_in_at,
            method: a.verification_method,
          };
        }),
      });
    }

    // ── PRIZES OWED ────────────────────────────────────────────────
    // Who is owed a prize right now: every member who has reached a tier
    // (claimed it, or has the stamps) and has not had it handed over. A
    // claim first, because that member has asked; then by tier and name.
    // It is the list an officer works through at the prize table, so it
    // carries nothing else.
    if (action === 'prizes') {
      const [roll, claimRows] = await Promise.all([
        admin.from('attendance').select('user_id').limit(20000),
        admin.from('reward_claims').select('user_id, reward_id, claimed_at').limit(20000),
      ]);
      const perMember = new Map<string, number>();
      for (const a of must(roll) ?? []) perMember.set(a.user_id, (perMember.get(a.user_id) ?? 0) + 1);
      const claimedAt = new Map<string, string>();
      for (const c of must(claimRows) ?? []) claimedAt.set(c.user_id + ':' + c.reward_id, c.claimed_at);

      const handed = await handoversOf(null);
      if (handed === null) return json({ ok: false, code: 'NOT_READY' });

      const owed: { user_id: string; reward_id: string; claimed_at: string | null; stamps: number }[] = [];
      const everyone = new Set([...perMember.keys(), ...[...claimedAt.keys()].map(k => k.split(':')[0])]);
      for (const uid of everyone) {
        const stamps = perMember.get(uid) ?? 0;
        for (const t of TIERS) {
          const key = uid + ':' + t.id;
          const has = claimedAt.has(key);
          if (rewardState(t, stamps, has) === 'locked' || handed.has(key)) continue;
          owed.push({ user_id: uid, reward_id: t.id, claimed_at: claimedAt.get(key) ?? null, stamps });
        }
      }

      // board accounts included: an officer who earns a prize is owed it
      // like anyone, and hand_over_reward refuses the officer themselves
      const ids = [...new Set(owed.map(o => o.user_id))];
      const names = new Map<string, string>();
      if (ids.length) {
        const ps = must(await admin.from('profiles')
          .select('id, username, display_name').in('id', ids));
        for (const p of ps ?? []) names.set(p.id, p.display_name || p.username);
      }

      const tier = new Map(TIERS.map(t => [t.id, t]));
      const list = owed
        .filter(o => names.has(o.user_id))
        .map(o => ({ ...o, username: names.get(o.user_id)!,
                     name: tier.get(o.reward_id)!.name, required: tier.get(o.reward_id)!.required }))
        .sort((a, b) =>
          Number(!a.claimed_at) - Number(!b.claimed_at) ||
          a.required - b.required ||
          a.username.localeCompare(b.username));

      // how many more of each prize the next meeting could add: members
      // one stamp short of a tier they have not reached. A count of
      // rows, not a forecast, so officers bring enough to the table.
      const near: Record<string, number> = {};
      for (const t of TIERS) {
        near[t.id] = [...perMember.entries()].filter(([uid, n]) =>
          n === t.required - 1 && !claimedAt.has(uid + ':' + t.id)).length;
      }

      return json({ ok: true, owed: list, near });
    }

    // ── FIND SOMEONE TO STAMP BY HAND ──────────────────────────────
    // A name said at the table: username or display name, any role, a
    // handful of matches, each marked if already stamped at the meeting
    // in question. The stamp itself is written by stamp_by_hand() in the
    // database, as the officer, not here.
    if (action === 'find') {
      const q = String(body.q ?? '').trim().toLowerCase().slice(0, 40);
      const meetingId = String(body.meeting_id ?? '');
      if (!q) return json({ ok: true, people: [] });
      // % and _ are LIKE wildcards; a search for "_" is not everyone
      const like = '%' + q.replace(/[\\%_]/g, c => '\\' + c).replace(/\*/g, '') + '%';
      const [byUser, byName] = await Promise.all([
        admin.from('profiles').select('id, username, display_name, role').ilike('username', like).limit(8),
        admin.from('profiles').select('id, username, display_name, role').ilike('display_name', like).limit(8),
      ]);
      const seen = new Map<string, { id: string; username: string; display_name: string | null; role: string }>();
      for (const p of [...(must(byUser) ?? []), ...(must(byName) ?? [])]) seen.set(p.id, p);
      const people = [...seen.values()]
        .sort((a, b) => a.username.localeCompare(b.username)).slice(0, 8);

      const stamped = new Set<string>();
      if (meetingId && people.length) {
        const att = must(await admin.from('attendance').select('user_id')
          .eq('meeting_id', meetingId).in('user_id', people.map(p => p.id)));
        for (const a of att ?? []) stamped.add(a.user_id);
      }
      return json({ ok: true, people: people.map(p => ({
        id: p.id,
        name: p.display_name || p.username,
        username: p.username,
        board: p.role === 'board',
        checked_in: stamped.has(p.id),
      })) });
    }

    // ── MEETINGS LIST ──────────────────────────────────────────────
    if (action === 'meetings') {
      // Ordered by date, not by meeting number: the number is a label
      // the board chooses, the date is when the meeting actually is,
      // and meetings may fall on any day in any order.
      const { data: ms, error } = await admin.from('meetings')
        .select('id, meeting_number, meeting_date, start_time, end_time, location, check_in_open')
        .order('meeting_date', { ascending: false }).limit(200);
      if (error) throw error;

      const counts = new Map<string, number>();
      const att = must(await admin.from('attendance').select('meeting_id').limit(20000));
      for (const a of att ?? []) counts.set(a.meeting_id, (counts.get(a.meeting_id) ?? 0) + 1);

      const today = clubDay();
      return json({
        ok: true, server_date: today,
        meetings: (ms ?? []).map(m => ({
          ...m,
          attendance_count: counts.get(m.id) ?? 0,
          state: m.check_in_open ? 'OPEN'
               : m.meeting_date > today ? 'UPCOMING'
               : m.meeting_date === today ? 'ENDED' : 'PAST',
        })),
      });
    }

    // ── ONE MEETING + ATTENDEES ────────────────────────────────────
    if (action === 'meeting') {
      const id = String(body.id ?? '');
      const m = must(await admin.from('meetings')
        .select('id, meeting_number, meeting_date, start_time, end_time, location, check_in_open')
        .eq('id', id).maybeSingle());
      if (!m) return json({ ok: false, code: 'MEETING_NOT_FOUND' });

      // An unchecked failure here rendered "No one has checked in yet"
      // over a meeting that forty people attended.
      const att = must(await admin.from('attendance')
        .select('id, user_id, checked_in_at, verification_method').eq('meeting_id', id)
        .order('checked_in_at', { ascending: false }).limit(500));

      const ids = [...new Set((att ?? []).map(a => a.user_id))];
      const names = new Map<string, string>();
      if (ids.length) {
        const ps = must(await admin.from('profiles')
          .select('id, username, display_name').in('id', ids));
        for (const p of ps ?? []) names.set(p.id, p.display_name || p.username);
      }

      return json({
        ok: true, meeting: m,
        attendees: (att ?? []).map(a => ({
          user_id: a.user_id,
          username: names.get(a.user_id) ?? 'unknown',
          checked_in_at: a.checked_in_at,
          // 'qr' from the verifier; 'manual' or 'board' added by an officer
          method: a.verification_method,
        })),
      });
    }

    return json({ ok: false, code: 'INVALID_REQUEST' }, 400);
  } catch (_err) {
    // never surface a database message to a browser
    return json({ ok: false, code: 'SERVER_ERROR' }, 500);
  }
});
