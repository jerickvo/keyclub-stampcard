/* TEST HARNESS ONLY — never shipped, never referenced by dev.html.
   Implements just enough of the supabase-js surface that Keystamp
   actually uses, backed by an in-memory store that enforces the same
   constraints schema.sql does (unique lower(username), role always
   'member' on signup, no client role writes). It exists so the auth
   flows can be exercised end to end without a live project. */
/* Persisted across reloads the way supabase-js persists a session
   (persistSession:true), so the boot-time restoration path is really
   exercised rather than trivially passing on a fresh in-memory store. */
const MOCK_KEY = '__keystamp_mock_db';
function loadDB(){
  try { const raw = localStorage.getItem(MOCK_KEY); if (raw) return JSON.parse(raw); } catch (_) {}
  return { users:[], profiles:[], meetings:[], attendance:[], reward_claims:[], reward_handovers:[], sessions:[], session:null };
}
window.__mockDB = loadDB();
window.saveDB = saveDB;
function saveDB(){
  try { localStorage.setItem(MOCK_KEY, JSON.stringify(window.__mockDB)); } catch (_) {}
}

function mkClient(){
  const db = window.__mockDB;
  const uuid = () => 'u_' + Math.random().toString(36).slice(2, 10);

  /* Stands in for hand_over_reward and undo_hand_over
     (migrations/2026-09-23-prizes-and-hand-stamps.sql), in the same order of
     checks. As with the rest of this file, it is not evidence the real
     functions behave this way; 03-handover_test.sql is. */
  const NEED = { r1:10, r2:20, r3:30 };
  const raise = m => ({ data:null, error:{ code:'P0001', message:m } });
  /* stands in for stamp_by_hand(), same order of checks */
  function stampByHand({ p_user_id:uid, p_meeting_id:mid }){
    const me = db.session && db.profiles.find(p => p.id === db.session.user.id);
    if (!me || me.role !== 'board') return raise('NOT_AUTHORIZED');
    if (uid === me.id) return raise('SELF_STAMP');
    const m = (db.meetings || []).find(x => x.id === mid);
    if (!m) return raise('MEETING_NOT_FOUND');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Los_Angeles',
      year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
    if (m.meeting_date !== today) return raise('NOT_TODAY');
    if (!db.profiles.some(p => p.id === uid)) return raise('MEMBER_NOT_FOUND');
    db.attendance = db.attendance || [];
    if (db.attendance.some(a => a.user_id === uid && a.meeting_id === mid)) return raise('ALREADY_CHECKED_IN');
    const at = new Date().toISOString();
    db.attendance.push({ id:'att_'+Math.random().toString(36).slice(2,8), user_id:uid, meeting_id:mid,
                         checked_in_at:at, verification_method:'board' });
    saveDB();
    return { data:at, error:null };
  }

  function handover(name, { p_user_id:uid, p_reward_id:rid }){
    const me = db.session && db.profiles.find(p => p.id === db.session.user.id);
    if (!me || me.role !== 'board') return raise('NOT_AUTHORIZED');
    if (name === 'hand_over_reward' && uid === me.id) return raise('SELF_HANDOVER');
    db.reward_handovers = db.reward_handovers || [];
    db.reward_claims = db.reward_claims || [];
    const has = db.reward_handovers.find(h => h.user_id === uid && h.reward_id === rid);
    if (name === 'undo_hand_over'){
      if (!has || has.handed_by !== me.id || Date.now() - Date.parse(has.handed_at) >= 15 * 60 * 1000)
        return raise('UNDO_EXPIRED');
      db.reward_handovers = db.reward_handovers.filter(h => h !== has);
      /* a claim the hand-over wrote goes with it */
      if (has.made_claim) db.reward_claims = db.reward_claims.filter(c => !(c.user_id === uid && c.reward_id === rid));
      saveDB();
      return { data:true, error:null };
    }
    if (!NEED[rid]) return raise('INVALID_REWARD');
    if (has) return raise('ALREADY_HANDED_OVER');
    const claimed = db.reward_claims.some(c => c.user_id === uid && c.reward_id === rid);
    if (!claimed){
      const n = (db.attendance || []).filter(a => a.user_id === uid).length;
      if (n < NEED[rid]) return raise('NOT_EARNED');
      db.reward_claims.push({ id:'rc_'+Math.random().toString(36).slice(2,8), user_id:uid,
                              reward_id:rid, claimed_at:new Date().toISOString() });
    }
    const at = new Date().toISOString();
    db.reward_handovers.push({ user_id:uid, reward_id:rid, handed_at:at, handed_by:me.id, made_claim:!claimed });
    saveDB();
    return { data:at, error:null };
  }

  return {
    auth: {
      async getSession(){ return { data:{ session: db.session }, error:null }; },
      async signInWithPassword({ email, password }){
        const u = db.users.find(x => x.email === email && x.password === password);
        if (!u) return { data:null, error:{ message:'Invalid login credentials' } };
        db.session = { user:{ id:u.id, email:u.email } }; saveDB();
        return { data:{ user:{ id:u.id, email:u.email }, session:db.session }, error:null };
      },
      async signUp({ email, password, options }){
        if (db.users.some(x => x.email === email))
          return { data:null, error:{ message:'User already registered', status:422 } };
        if (String(password).length < 6)
          return { data:null, error:{ message:'Password should be at least 6 characters' } };
        const id = uuid();
        db.users.push({ id, email, password });
        // mirrors the on_auth_user_created trigger
        const meta = (options && options.data) || {};
        const uname = String(meta.username || email.split('@')[0]).toLowerCase();
        if (db.profiles.some(p => p.username.toLowerCase() === uname))
          return { data:null, error:{ message:'duplicate key value', status:422 } };
        const now = new Date().toISOString();
        const row = { id, username:uname, display_name:meta.display_name || uname,
                      role:'member', created_at:now, updated_at:now };
        // window.__profileDelayMs mimics the trigger committing slightly
        // after the auth row is visible
        if (window.__profileDelayMs) setTimeout(() => { db.profiles.push(row); saveDB(); }, window.__profileDelayMs);
        else db.profiles.push(row);
        db.session = { user:{ id, email } }; saveDB();
        return { data:{ user:{ id, email }, session:db.session }, error:null };
      },
      async signOut(){ db.session = null; saveDB(); return { error:null }; },
    },

    from(table){
      const rows = () => db[table] || [];
      const q = { _f:[], _table:table };
      q.select = function(_cols, opts){ if (opts && opts.count) this._count = true; if (opts && opts.head) this._head = true; return this; };
      q.eq = function(col, val){ this._f.push([col, val]); return this; };
      q.order = function(){ return this; };
      q._rows = function(){
        return rows().filter(r => this._f.every(([c, v]) => r[c] === v));
      };
      q._fail = function(){ return window.__failTable === this._table || window.__failTable === '*'; };
      /* a project that has not run the hand-over migration: PostgREST
         answers PGRST205 for a table it does not know */
      q._absent = function(){ return this._table === 'reward_handovers' && window.__noHandovers; };
      q.maybeSingle = async function(){
        if (this._fail()) return { data:null, error:{ message:'network' } };
        return { data:this._rows()[0] || null, error:null };
      };
      q.single = async function(){
        const r = this._rows()[0];
        return r ? { data:r, error:null } : { data:null, error:{ message:'no rows' } };
      };
      q.then = function(res){
        if (this._absent()) return Promise.resolve({ data:null,
          error:{ code:'PGRST205', message:"Could not find the table 'public.reward_handovers' in the schema cache" } }).then(res);
        if (this._fail()) return Promise.resolve({ data:null, error:{ message:'network' } }).then(res);
        const found = this._rows();
        if (this._count) return Promise.resolve({ data:this._head ? null : found, count:found.length, error:null }).then(res);
        return Promise.resolve({ data:found, error:null }).then(res);
      };
      /* Mirrors the meetings_board_delete policy: board only, and only a
         meeting nothing has been checked in to. A meeting with attendance
         is invisible to the statement, so it removes nothing rather than
         erroring -- which is exactly how Postgres behaves. */
      q.delete = function(){
        const self = this;
        return {
          _f: self._f,
          eq(col, val){ this._f = this._f.concat([[col, val]]); return this; },
          select(){ return this; },
          then(res){
            const me = db.session && db.profiles.find(p => p.id === db.session.user.id);
            if (self._table !== 'meetings' || !me || me.role !== 'board')
              return Promise.resolve({ data:[], error:null }).then(res);
            const match = (db.meetings || []).filter(r => this._f.every(([c, v]) => r[c] === v));
            const removable = match.filter(m =>
              !(db.attendance || []).some(a => a.meeting_id === m.id));
            db.meetings = db.meetings.filter(m => !removable.includes(m));
            saveDB();
            return Promise.resolve({ data:removable.map(m => ({ id:m.id })), error:null }).then(res);
          },
        };
      };

      const writeClaim = (payload) => {
        db.reward_claims = db.reward_claims || [];
        const row = Object.assign({ id:'rc_'+Math.random().toString(36).slice(2,8),
                                    claimed_at:new Date().toISOString() }, payload);
        db.reward_claims.push(row); saveDB();
        return row;
      };
      q.insert = function(payload){
        const self = this;
        return {
          select(){ return this; },
          async single(){
            // RLS stand-in: members may not insert attendance directly.
            // Only the verify-attendance function (service role) writes.
            if (self._table === 'attendance')
              return { data:null, error:{ message:'row-level security', code:'42501' } };
            if (self._table === 'meetings'){
              const me = db.session && db.profiles.find(p => p.id === db.session.user.id);
              if (!me || me.role !== 'board')
                return { data:null, error:{ message:'row-level security', code:'42501' } };
              if (db.meetings.some(m => m.meeting_number === payload.meeting_number))
                return { data:null, error:{ message:'duplicate key value', code:'23505' } };
              /* The table's CHECK constraints, which the real database
                 enforces and this mock previously did not — a rejected
                 write looked like a successful one here. */
              const bad = c => ({ data:null, error:{ code:'23514', constraint:c,
                message:`new row for relation "meetings" violates check constraint "${c}"` } });
              const mins = t => {                       /* "3:15 PM" -> 915 */
                const m2 = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(t || '').trim());
                if (!m2) return NaN;
                let h = Number(m2[1]) % 12;
                if (/PM/i.test(m2[3])) h += 12;
                return h * 60 + Number(m2[2]);
              };
              if ((payload.location || 'MPR') !== 'MPR') return bad('meetings_location_check');
              if (payload.end_time != null &&
                  !(mins(payload.start_time) < mins(payload.end_time)))
                return bad('meeting_time_order');
              const row = Object.assign({ id:'m_'+Math.random().toString(36).slice(2,8),
                                          check_in_open:false, location:'MPR' }, payload);
              db.meetings.push(row); saveDB();
              return { data:row, error:null };
            }
            if (self._table === 'reward_claims') return { data:writeClaim(payload), error:null };
            return { data:payload, error:null };
          },
          then(res){
            /* Before migrations/2026-09-23-prizes-and-hand-stamps.sql
               (window.__noHandovers), attendance_board_write let a board
               account insert a stamp labelled 'manual' or 'board'. After
               it, nobody inserts directly; stamp_by_hand() does. The
               unique key refuses a second stamp either way. */
            if (self._table === 'attendance'){
              const me = db.session && db.profiles.find(p => p.id === db.session.user.id);
              if (!window.__noHandovers || !me || me.role !== 'board' || !['manual','board'].includes(payload.verification_method))
                return Promise.resolve({ data:null, error:{ message:'new row violates row-level security policy', code:'42501' } }).then(res);
              if (!(db.meetings || []).some(m => m.id === payload.meeting_id))
                return Promise.resolve({ data:null, error:{ message:'violates foreign key constraint', code:'23503' } }).then(res);
              db.attendance = db.attendance || [];
              if (db.attendance.some(a => a.user_id === payload.user_id && a.meeting_id === payload.meeting_id))
                return Promise.resolve({ data:null, error:{ message:'duplicate key value violates unique constraint "one_stamp_per_meeting"', code:'23505' } }).then(res);
              const row = Object.assign({ id:'att_'+Math.random().toString(36).slice(2,8),
                                          checked_in_at:new Date().toISOString() }, payload);
              db.attendance.push(row); saveDB();
              return Promise.resolve({ data:null, error:null }).then(res);
            }
            /* A claim insert must actually write: otherwise a member
               could claim a reward, see the confirmation, and find it
               still unclaimed on the next read. The real table has a
               unique key on (user_id, reward_id), which is why the
               client tolerates 23505 — so the mock enforces it too. */
            if (self._table === 'reward_claims'){
              const uid = db.session && db.session.user.id;
              const need = { r1:10, r2:20, r3:30 }[payload.reward_id];
              const have = (db.attendance || []).filter(a => a.user_id === uid).length;
              if (!uid || payload.user_id !== uid || !need || have < need)
                return Promise.resolve({ data:null, error:{ message:'new row violates row-level security policy', code:'42501' } }).then(res);
              const dup = (db.reward_claims || []).some(c =>
                c.user_id === payload.user_id && c.reward_id === payload.reward_id);
              if (dup) return Promise.resolve({ data:null,
                error:{ message:'duplicate key value', code:'23505' } }).then(res);
              return Promise.resolve({ data:writeClaim(payload), error:null }).then(res);
            }
            return Promise.resolve({ data:payload, error:null }).then(res);
          },
        };
      };
      return q;
    },

    /* Stands in for delete_meeting_and_stamps. Mirrors the real
       function's guards (board only, held only, not open) so the client
       wiring can be exercised; it is NOT evidence the deployed function
       behaves the same way. */
    async rpc(name, args){
      /* the connection drops mid-request */
      if (window.__failRpc) return { data:null, error:{ message:'TypeError: Failed to fetch' } };
      if ((name === 'hand_over_reward' || name === 'undo_hand_over') && !window.__noHandovers)
        return handover(name, args || {});
      if (name === 'stamp_by_hand' && !window.__noHandovers) return stampByHand(args || {});
      if (name !== 'delete_meeting_and_stamps')
        return { data:null, error:{ message:
          'Could not find the function public.' + name + ' in the schema cache',
          code:'PGRST202' } };
      const me = db.session && db.profiles.find(p => p.id === db.session.user.id);
      if (!me || me.role !== 'board')
        return { data:null, error:{ message:'only board accounts can delete a meeting', code:'P0001' } };
      const today = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Los_Angeles',
        year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
      const id = args && args.p_meeting_id;
      const m = (db.meetings || []).find(x => x.id === id);
      if (!m || m.check_in_open || !(String(m.meeting_date) < today))
        return { data:null, error:{ message:'only a meeting that is over can be deleted', code:'P0001' } };
      const before = (db.attendance || []).length;
      db.attendance = (db.attendance || []).filter(a => a.meeting_id !== id);
      db.sessions = (db.sessions || []).filter(s => s.meeting_id !== id);
      db.meetings = db.meetings.filter(x => x.id !== id);
      saveDB();
      return { data: before - db.attendance.length, error:null };
    },

    /* Stands in for the two Edge Functions. It mirrors their decision
       ORDER so the client's error mapping and fail-closed behaviour can
       be exercised — it is NOT evidence that the deployed Deno code or
       the RLS policies behave the same way. Only a live project proves
       that. */
    functions: {
      invoke: async (name, opts) => {
        const body = (opts && opts.body) || {};
        if (window.__failFunctions) return { data:null, error:{ context:{ status:404 } } };

        if (name === 'attendance-session'){
          const me = db.session && db.profiles.find(p => p.id === db.session.user.id);
          if (!me) return { data:null, error:{ context:{ status:401 } } };
          if (me.role !== 'board') return { data:null, error:{ context:{ status:403 } } };
          const mid = body.meeting_id;
          const meeting = (db.meetings || []).find(m => m.id === mid);
          if (!meeting) return { data:{ ok:false, code:'MEETING_NOT_FOUND' }, error:null };

          if (body.action === 'start'){
            db.sessions = db.sessions || [];
            if (!db.sessions.some(x => x.meeting_id === mid && !x.ended_at))
              db.sessions.push({ id:'sess_'+Math.random().toString(36).slice(2,8), meeting_id:mid, ended_at:null });
            meeting.check_in_open = true; saveDB();
            return { data:{ ok:true, open:true }, error:null };
          }
          if (body.action === 'end'){
            (db.sessions || []).forEach(x => { if (x.meeting_id === mid) x.ended_at = new Date().toISOString(); });
            meeting.check_in_open = false; saveDB();
            return { data:{ ok:true, open:false }, error:null };
          }
          if (body.action === 'token'){
            const sess = (db.sessions || []).find(x => x.meeting_id === mid && !x.ended_at);
            if (!sess || !meeting.check_in_open)
              return { data:{ ok:false, code:'ATTENDANCE_CLOSED' }, error:null };
            /* mirrors the real function: exp comes from the meeting's own
               date, not the clock, so the same meeting always yields the
               same token. The signature is an opaque marker here because
               the browser must not be able to make one either way. */
            const exp = Date.parse(meeting.meeting_date + 'T23:59:59-08:00');
            const token = `keystamp://a/${btoa(sess.id+'.'+mid+'.'+exp)}.SERVERSIG`;
            return { data:{ ok:true, token, expires_at:new Date(exp).toISOString(),
                            static:true }, error:null };
          }
          return { data:null, error:{ context:{ status:400 } } };
        }

        if (name === 'board-data'){
          const me = db.session && db.profiles.find(p => p.id === db.session.user.id);
          if (!me) return { data:null, error:{ context:{ status:401 } } };
          // the gate under test: role read from stored data, not the request
          if (me.role !== 'board') return { data:null, error:{ context:{ status:403 } } };
          const A = db.attendance || [], M = db.meetings || [], P = db.profiles || [];
          const TIERS = [{id:'r1',name:'Club Merch',required:10},
                         {id:'r2',name:'Free Blindbox',required:20},
                         {id:'r3',name:'???',required:30}];
          const stampsOf = id => A.filter(a => a.user_id === id).length;
          const claimedOf = id => new Set((db.reward_claims||[]).filter(c => c.user_id === id).map(c => c.reward_id));
          // the same three lines as rewardState in 01a-backend.js and board-data
          const tierState = (t, stamps, claimed) => claimed ? 'claimed' : stamps >= t.required ? 'unlocked' : 'locked';
          const lastOf = id => A.filter(a => a.user_id === id)
                .map(a => a.checked_in_at).sort().pop() || null;
          const today = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Los_Angeles',
            year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());

          if (body.action === 'overview'){
            const open = M.find(m => m.check_in_open) || null;
            // mirrors the real function: held = date has passed, and the
            // milestone tallies come from one pass over attendance
            const held = M.filter(m => m.meeting_date <= today).length;
            const next = M.filter(m => m.meeting_date >= today)
                          .sort((a,b) => String(a.meeting_date).localeCompare(String(b.meeting_date)))[0] || null;
            const per = new Map();
            for (const a of A) per.set(a.user_id, (per.get(a.user_id) || 0) + 1);
            const everyone = new Set([...per.keys(), ...(db.reward_claims||[]).map(c => c.user_id)]);
            const atTier = t => [...everyone].filter(id => tierState(t, per.get(id) || 0, claimedOf(id).has(t.id)) !== 'locked').length;
            return { data:{ ok:true,
              total_members:P.filter(p => p.role === 'member').length,
              total_seals:A.length, total_meetings:M.length,
              meetings_held:held,
              participating_members:per.size,
              average_attendance:held > 0 ? Math.round((A.length / held) * 10) / 10 : null,
              milestones:{ m10:atTier(TIERS[0]), m20:atTier(TIERS[1]), m30:atTier(TIERS[2]) },
              active_meeting:open, next_meeting:next, server_date:today,
              today_attendance:open ? A.filter(a => a.meeting_id === open.id).length : 0 }, error:null };
          }
          const H = window.__noHandovers ? null : (db.reward_handovers || []);
          if (body.action === 'prizes' && !window.__oldBoardData){
            if (!H) return { data:{ ok:false, code:'NOT_READY' }, error:null };
            const per = new Map();
            for (const a of A) per.set(a.user_id, (per.get(a.user_id) || 0) + 1);
            const C = db.reward_claims || [];
            const everyone = new Set([...per.keys(), ...C.map(c => c.user_id)]);
            const owed = [];
            for (const uid of everyone){
              const p = P.find(x => x.id === uid);
              if (!p) continue;
              const stamps = per.get(uid) || 0;
              for (const t of TIERS){
                const c = C.find(x => x.user_id === uid && x.reward_id === t.id);
                if (tierState(t, stamps, Boolean(c)) === 'locked') continue;
                if (H.some(h => h.user_id === uid && h.reward_id === t.id)) continue;
                owed.push({ user_id:uid, reward_id:t.id, claimed_at:c ? c.claimed_at : null, stamps,
                            username:p.display_name || p.username, name:t.name, required:t.required });
              }
            }
            owed.sort((a, b) => Number(!a.claimed_at) - Number(!b.claimed_at) ||
              a.required - b.required || a.username.localeCompare(b.username));
            const near = {};
            for (const t of TIERS) near[t.id] = [...per.entries()].filter(([uid, n]) =>
              n === t.required - 1 && !C.some(c => c.user_id === uid && c.reward_id === t.id)).length;
            const recent = H.filter(h => h.handed_by === me.id && Date.now() - Date.parse(h.handed_at) < 15 * 60 * 1000)
              .map(h => { const p = P.find(x => x.id === h.user_id) || {}; const t = TIERS.find(x => x.id === h.reward_id);
                return { user_id:h.user_id, reward_id:h.reward_id, handed_at:h.handed_at,
                         username:p.display_name || p.username, name:t.name, required:t.required }; });
            return { data:{ ok:true, owed, near, recent }, error:null };
          }
          if (body.action === 'find' && !window.__oldBoardData){
            const q = String(body.q || '').trim().toLowerCase();
            if (!q) return { data:{ ok:true, people:[] }, error:null };
            const exact = p => p.username.toLowerCase() === q || String(p.display_name || '').toLowerCase() === q;
            const people = P.filter(p => p.username.toLowerCase().includes(q) ||
                                         String(p.display_name || '').toLowerCase().includes(q))
              .sort((a, b) => Number(exact(b)) - Number(exact(a)) || a.username.localeCompare(b.username)).slice(0, 8)
              .map(p => ({ id:p.id, name:p.display_name || p.username, username:p.username,
                           board:p.role === 'board',
                           checked_in:A.some(a => a.user_id === p.id && a.meeting_id === body.meeting_id) }));
            return { data:{ ok:true, people }, error:null };
          }
          if (body.action === 'members'){
            const q = String(body.q || '').toLowerCase();
            let rows = P.filter(p => p.role === 'member')
                        .filter(p => !q || p.username.toLowerCase().includes(q))
                        .map(p => ({ id:p.id, username:p.display_name || p.username,
                          stamps:stampsOf(p.id),
                          rewards_unlocked:TIERS.filter(t => tierState(t, stampsOf(p.id), claimedOf(p.id).has(t.id)) !== 'locked').length,
                          created_at:p.created_at, last_attendance:lastOf(p.id) }));
            const sort = body.sort || 'username';
            rows.sort((a,b) =>
              sort === 'stamps_desc' ? b.stamps - a.stamps :
              sort === 'stamps_asc'  ? a.stamps - b.stamps :
              sort === 'recent'      ? String(b.last_attendance||'').localeCompare(String(a.last_attendance||'')) :
              sort === 'newest'      ? String(b.created_at).localeCompare(String(a.created_at)) :
              a.username.localeCompare(b.username));
            const size = 25, page = Math.max(1, Number(body.page || 1));
            const total = rows.length;
            return { data:{ ok:true, members:rows.slice((page-1)*size, page*size),
              page, page_size:size, total, pages:Math.max(1, Math.ceil(total/size)) }, error:null };
          }
          if (body.action === 'member'){
            const p = P.find(x => x.id === body.id);
            if (!p) return { data:{ ok:false, code:'MEMBER_NOT_FOUND' }, error:null };
            const mine = A.filter(a => a.user_id === p.id)
              .sort((a,b) => String(b.checked_in_at).localeCompare(String(a.checked_in_at)));
            const claimed = new Set((db.reward_claims||[]).filter(c => c.user_id === p.id).map(c => c.reward_id));
            const stamps = mine.length;
            return { data:{ ok:true,
              member:{ id:p.id, username:p.display_name || p.username, role:p.role,
                       created_at:p.created_at, stamps, last_attendance:mine[0]?.checked_in_at || null },
              handovers:Boolean(H) && !window.__oldBoardData,
              rewards:TIERS.map(t => {
                const c = (db.reward_claims||[]).find(x => x.user_id === p.id && x.reward_id === t.id);
                const h = H && H.find(x => x.user_id === p.id && x.reward_id === t.id);
                return { ...t, unlocked:stamps >= t.required, claimed:claimed.has(t.id),
                         claimed_at:c ? c.claimed_at : null,
                         state:tierState(t, stamps, claimed.has(t.id)),
                         handed_at:h ? h.handed_at : null,
                         can_undo:Boolean(h && h.handed_by === me.id && Date.now() - Date.parse(h.handed_at) < 15 * 60 * 1000) };
              }),
              attendance:mine.map(a => {
                const m = M.find(x => x.id === a.meeting_id) || {};
                return { id:a.id, meeting_id:a.meeting_id, meeting_number:m.meeting_number || null,
                         meeting_date:m.meeting_date || null, location:m.location || 'MPR',
                         checked_in_at:a.checked_in_at, method:a.verification_method };
              }) }, error:null };
          }
          if (body.action === 'meetings'){
            return { data:{ ok:true, server_date:today, meetings:M.map(m => ({ ...m,
              attendance_count:A.filter(a => a.meeting_id === m.id).length,
              state:m.check_in_open ? 'OPEN' : m.meeting_date > today ? 'UPCOMING'
                   : m.meeting_date === today ? 'ENDED' : 'PAST' })) }, error:null };
          }
          if (body.action === 'meeting'){
            const m = M.find(x => x.id === body.id);
            if (!m) return { data:{ ok:false, code:'MEETING_NOT_FOUND' }, error:null };
            return { data:{ ok:true, meeting:m,
              attendees:A.filter(a => a.meeting_id === m.id).map(a => {
                const p = P.find(x => x.id === a.user_id) || {};
                return { user_id:a.user_id, username:p.display_name || p.username || 'unknown',
                         checked_in_at:a.checked_in_at, method:a.verification_method };
              }) }, error:null };
          }
          return { data:null, error:{ context:{ status:400 } } };
        }

        if (name === 'verify-attendance'){
          const uid = db.session && db.session.user.id;
          if (!uid) return { data:null, error:{ context:{ status:401 } } };
          const raw = String(body.code || '');
          const bare = raw.replace(/^keystamp:\/\/a\//i, '');
          const dot = bare.lastIndexOf('.');
          if (dot < 1) return { data:{ ok:false, code:'INVALID_TOKEN' }, error:null };
          if (bare.slice(dot+1) !== 'SERVERSIG')
            return { data:{ ok:false, code:'INVALID_TOKEN' }, error:null };
          let payload; try { payload = atob(bare.slice(0,dot)); }
          catch(e){ return { data:{ ok:false, code:'INVALID_TOKEN' }, error:null }; }
          const [sid, mid, expStr] = payload.split('.');
          if (Date.now() > Number(expStr))
            return { data:{ ok:false, code:'EXPIRED_TOKEN' }, error:null };
          const sess = (db.sessions || []).find(x => x.id === sid);
          if (!sess) return { data:{ ok:false, code:'INVALID_TOKEN' }, error:null };
          if (sess.ended_at) return { data:{ ok:false, code:'ATTENDANCE_CLOSED' }, error:null };
          const meeting = (db.meetings || []).find(m => m.id === mid);
          if (!meeting) return { data:{ ok:false, code:'MEETING_NOT_FOUND' }, error:null };
          if (!meeting.check_in_open) return { data:{ ok:false, code:'MEETING_NOT_ACTIVE' }, error:null };
          db.attendance = db.attendance || [];
          if (db.attendance.some(a => a.user_id === uid && a.meeting_id === mid))
            return { data:{ ok:false, code:'ALREADY_CHECKED_IN', meeting_id:mid }, error:null };
          db.attendance.push({ id:'att_'+Math.random().toString(36).slice(2,8), user_id:uid,
                               meeting_id:mid, checked_in_at:new Date().toISOString(),
                               verification_method:'qr' });
          saveDB();
          return { data:{ ok:true, meeting_id:mid, meeting_number:meeting.meeting_number }, error:null };
        }
        return { data:null, error:{ context:{ status:404 } } };
      },
    },
  };
}

/* supabase-js is vendored into the page now, so unlike the CDN era it
   really executes in tests, after this init script, as a top-level
   `var supabase = ...` that would overwrite a plain property. The mock
   must keep winning, so the global is an accessor: every read answers
   with the mock, and the library's own assignment is parked on
   __realSupabase instead of replacing it. */
const mockSupabase = { createClient: mkClient };
Object.defineProperty(window, 'supabase', {
  configurable: true,
  get(){ return mockSupabase; },
  set(v){ window.__realSupabase = v; },
});
