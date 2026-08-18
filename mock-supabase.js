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
  return { users:[], profiles:[], meetings:[], attendance:[], reward_claims:[], sessions:[], session:null };
}
window.__mockDB = loadDB();
window.saveDB = saveDB;
function saveDB(){
  try { localStorage.setItem(MOCK_KEY, JSON.stringify(window.__mockDB)); } catch (_) {}
}

function mkClient(){
  const db = window.__mockDB;
  const uuid = () => 'u_' + Math.random().toString(36).slice(2, 10);

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
      q.select = function(){ return this; };
      q.eq = function(col, val){ this._f.push([col, val]); return this; };
      q.order = function(){ return this; };
      q._rows = function(){
        return rows().filter(r => this._f.every(([c, v]) => r[c] === v));
      };
      q._fail = function(){ return window.__failTable === this._table || window.__failTable === '*'; };
      q.maybeSingle = async function(){
        if (this._fail()) return { data:null, error:{ message:'network' } };
        return { data:this._rows()[0] || null, error:null };
      };
      q.single = async function(){
        const r = this._rows()[0];
        return r ? { data:r, error:null } : { data:null, error:{ message:'no rows' } };
      };
      q.then = function(res){
        if (this._fail()) return Promise.resolve({ data:null, error:{ message:'network' } }).then(res);
        return Promise.resolve({ data:this._rows(), error:null }).then(res);
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
              const row = Object.assign({ id:'m_'+Math.random().toString(36).slice(2,8),
                                          check_in_open:false, location:'MPR' }, payload);
              db.meetings.push(row); saveDB();
              return { data:row, error:null };
            }
            return { data:payload, error:null };
          },
          then(res){ return Promise.resolve({ data:payload, error:null }).then(res); },
        };
      };
      return q;
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
          const lastOf = id => A.filter(a => a.user_id === id)
                .map(a => a.checked_in_at).sort().pop() || null;
          const today = new Date().toISOString().slice(0,10);

          if (body.action === 'overview'){
            const open = M.find(m => m.check_in_open) || null;
            // mirrors the real function: held = date has passed, and the
            // milestone tallies come from one pass over attendance
            const held = M.filter(m => m.meeting_date <= today).length;
            const next = M.filter(m => m.meeting_date >= today)
                          .sort((a,b) => String(a.meeting_date).localeCompare(String(b.meeting_date)))[0] || null;
            const per = new Map();
            for (const a of A) per.set(a.user_id, (per.get(a.user_id) || 0) + 1);
            const counts = [...per.values()];
            const atLeast = n => counts.filter(c => c >= n).length;
            return { data:{ ok:true,
              total_members:P.filter(p => p.role === 'member').length,
              total_seals:A.length, total_meetings:M.length,
              meetings_held:held,
              participating_members:per.size,
              average_attendance:held > 0 ? Math.round((A.length / held) * 10) / 10 : null,
              milestones:{ m10:atLeast(10), m20:atLeast(20), m30:atLeast(30) },
              active_meeting:open, next_meeting:next, server_date:today,
              today_attendance:open ? A.filter(a => a.meeting_id === open.id).length : 0 }, error:null };
          }
          if (body.action === 'members'){
            const q = String(body.q || '').toLowerCase();
            let rows = P.filter(p => p.role === 'member')
                        .filter(p => !q || p.username.toLowerCase().includes(q))
                        .map(p => ({ id:p.id, username:p.display_name || p.username,
                          stamps:stampsOf(p.id),
                          rewards_unlocked:TIERS.filter(t => stampsOf(p.id) >= t.required).length,
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
              rewards:TIERS.map(t => ({ ...t, unlocked:stamps >= t.required, claimed:claimed.has(t.id) })),
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
                         checked_in_at:a.checked_in_at };
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

window.supabase = { createClient: mkClient };
