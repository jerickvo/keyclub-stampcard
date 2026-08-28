"use strict";
/* ══════════════════════════════════════════════════════════════════
   keystamp — BACKEND BOUNDARY

   Every piece of club data sits behind this object. The rule the rest
   of the app follows:

       views  →  Store  →  Backend  →  Supabase

   No view, no effect, no scanner talks to Supabase directly. That is
   what makes Phase 3 (moving verification server-side) a change to
   one adapter rather than a change to the application.

   Two adapters implement the same interface:

     SupabaseAdapter   real data. Used whenever credentials are
                       configured. This is the production path.

     PreviewAdapter    an empty, in-memory stand-in so the interface
                       can be exercised with no backend attached. It
                       is NOT sample data and NOT a fake user — it
                       returns an unauthenticated session and empty
                       collections, so an unconfigured build shows the
                       signed-out state instead of quietly pretending
                       somebody is logged in.
   ══════════════════════════════════════════════════════════════════ */

/* ── which Supabase project? ───────────────────────────────────────
   THIS IS THE ONE PLACE THAT DECIDES. Nothing else in the app holds a
   project URL or an anon key.

   Keystamp deploys as a single committed index.html that Vercel serves
   as a static file — build.py does not run on deploy — so the choice
   cannot be made at build time. It is made in the browser, at load,
   from window.location.hostname.

   The rule is deliberately asymmetric. Production is an explicit
   allowlist of hostnames. EVERYTHING else resolves to staging: preview
   deployments, localhost, a file:// page, a domain nobody has heard
   of. An unrecognised host must never reach real member data, so the
   unrecognised case gets the harmless project.

   Forgetting to list a production domain costs one deploy pointed at
   staging, and the members notice immediately. The opposite mistake —
   a preview quietly writing to the real database — is not recoverable,
   which is why there is no suffix match, no wildcard, and no "if it
   looks like production" branch anywhere below.

   Both keys here are PUBLIC anon keys, gated by row level security on
   every table. This switch is NOT a security boundary; it prevents an
   accidental connection and nothing more. RLS and the Edge Functions
   are what actually refuse a write. Never put SUPABASE_SERVICE_ROLE_KEY,
   ATTENDANCE_TOKEN_SECRET or BOARD_PASSWORD in this file.
   ────────────────────────────────────────────────────────────────── */
const SUPABASE_ENVIRONMENTS = {
  production: {
    /* Every hostname served by the production Vercel project, lower
       case, matched whole. A custom domain only becomes production
       once it is added to this list. */
    hosts: ['keystamp.vercel.app'],
    url: 'https://cibumatoeynnlwhyizzw.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpYnVtYXRvZXlubmx3aHlpenp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MDQzNDgsImV4cCI6MjEwMjQ4MDM0OH0.3WSJGpoE5UnIP-UcILZnSZSEq-rd7ZJrwQdH1Eu-6fE',
  },
  /* keystamp-staging. The default, and the only other option. */
  staging: {
    url: 'https://fjqvuvoafgskdlkbzrky.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImZqcXZ1dm9hZmdza2Rsa2J6cmt5IiwiaWF0IjoxNzg3ODA5NTcsImV4cCI6MjEwMzQ1Njk1N30.RzOohU_R95ocULrvKyFJhNdUqmktD8uNLIo1vrsIFck',
  },
};

/* ── configuration ────────────────────────────────────────────────
   Config resolves the pair above, and still accepts an explicit
   override from the host page — on window before the scripts load, or
   via <meta> — which is how the signed-out "no backend" state and the
   test harness are reached. The override is not part of the normal
   deploy path; both meta tags ship empty.

     <meta name="keystamp:supabase-url"      content="https://xxx.supabase.co">
     <meta name="keystamp:supabase-anon-key" content="ey...">
   ────────────────────────────────────────────────────────────────── */
const Config = {
  meta(name){
    const el = document.querySelector(`meta[name="keystamp:${name}"]`);
    const v = el && el.getAttribute('content');
    return v && !/^\{\{|^\s*$/.test(v) ? v.trim() : null;
  },

  ENVIRONMENTS: SUPABASE_ENVIRONMENTS,

  /* Whole-string comparison, not endsWith. A suffix test would hand
     keystamp.vercel.app.example.com the production database. The only
     normalisation is case and the trailing dot of a fully-qualified
     name, both of which are the same host by definition. */
  environmentFor(hostname){
    const h = String(hostname == null ? '' : hostname)
      .trim().toLowerCase().replace(/\.$/, '');
    return h && SUPABASE_ENVIRONMENTS.production.hosts.includes(h)
      ? 'production' : 'staging';
  },

  /* 'production' | 'staging'. Anything that goes wrong reading the
     location — a sandboxed frame, no window at all — lands on staging,
     because the failure case has to be the safe one too. */
  get environment(){
    let host = '';
    try { host = window.location.hostname; } catch (_) { host = ''; }
    return this.environmentFor(host);
  },
  get project(){ return SUPABASE_ENVIRONMENTS[this.environment]; },

  /* A window value wins whenever it is a string — including an empty
     one — so a host page can explicitly declare "no backend" and not be
     silently overridden. Then a filled meta tag. Then, normally, the
     project the hostname selected. */
  get supabaseUrl(){
    return typeof window.KEYSTAMP_SUPABASE_URL === 'string'
      ? window.KEYSTAMP_SUPABASE_URL
      : (this.meta('supabase-url') || this.project.url);
  },
  get supabaseAnonKey(){
    return typeof window.KEYSTAMP_SUPABASE_ANON_KEY === 'string'
      ? window.KEYSTAMP_SUPABASE_ANON_KEY
      : (this.meta('supabase-anon-key') || this.project.anonKey);
  },

  /* Placeholders copied straight out of the README are the most likely
     way to end up "configured" with values that cannot work. They are
     rejected explicitly so the setup notice says WHY rather than
     letting the app try, fail, and look broken. */
  PLACEHOLDERS: [
    'your_project', 'your-project', 'yourproject', 'xxx', 'example',
    'your_public_anon_key', 'your-anon-key', 'changeme', 'todo',
  ],
  looksPlaceholder(v){
    const t = String(v || '').trim().toLowerCase();
    if (!t) return false;
    if (this.PLACEHOLDERS.some(ph => t.includes(ph))) return true;
    /* "ey..." and similar elisions from documentation */
    if (/^ey\.{2,}$/.test(t) || /\.\.\.$/.test(t)) return true;
    return false;
  },

  /* Three distinct states, never collapsed into one boolean:
       ok           usable values are present
       missing      nothing has been filled in yet
       placeholder  something is there but it is documentation text
     `reason` is safe to display: it names WHICH field is wrong and
     never echoes the key itself. */
  status(){
    const url = this.supabaseUrl, key = this.supabaseAnonKey;
    if (!url && !key) return { state:'missing', reason:'No Supabase URL or anon key has been set.' };
    if (!url) return { state:'missing', reason:'The Supabase project URL is missing.' };
    if (!key) return { state:'missing', reason:'The Supabase anon key is missing.' };
    if (this.looksPlaceholder(url))
      return { state:'placeholder', reason:'The Supabase URL is still the example value from the README.' };
    if (this.looksPlaceholder(key))
      return { state:'placeholder', reason:'The Supabase anon key is still the example value from the README.' };
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(String(url).trim()))
      return { state:'placeholder', reason:'The Supabase URL should look like https://yourproject.supabase.co' };
    if (String(key).trim().length < 40)
      return { state:'placeholder', reason:'The Supabase anon key looks too short to be a real key.' };
    return { state:'ok', reason:null };
  },

  get configured(){ return this.status().state === 'ok'; },

  /* Usernames are the only credential the member ever sees or types.
     Supabase Auth is email-based underneath, so a username is mapped
     to a routable-looking internal address that is never shown in the
     UI and never collected from the user. */
  /* Username rules. Mirrored by a CHECK constraint and a unique index
     on lower(username) in schema.sql — the database is the authority,
     these run first only so the member gets a friendly message. */
  USERNAME_MIN: 3,
  USERNAME_MAX: 24,
  USERNAME_RE: /^[a-zA-Z0-9_.]+$/,
  /* names that would let an account impersonate the system */
  USERNAME_BLOCKED: ['admin','administrator','board','keystamp','root','system','staff','moderator','mod','owner','support','null','undefined'],
  PASSWORD_MIN: 8,

  /* One canonical form for comparison so Jvo / jvo / JVO cannot become
     three identities. The typed casing is kept separately for display. */
  canonUsername(u){ return String(u || '').trim().toLowerCase(); },

  AUTH_DOMAIN: 'keystamp.invalid',
  emailForUsername(username){
    return `${this.canonUsername(username)}@${this.AUTH_DOMAIN}`;
  },

  /* returns null when fine, otherwise a sentence a student can act on */
  validateUsername(raw){
    const u = String(raw || '').trim();
    if (!u) return 'Username is required.';
    if (u.length < this.USERNAME_MIN) return `Username must be at least ${this.USERNAME_MIN} characters.`;
    if (u.length > this.USERNAME_MAX) return `Username must be ${this.USERNAME_MAX} characters or fewer.`;
    if (!this.USERNAME_RE.test(u)) return 'Username can only use letters, numbers, underscore and full stop.';
    if (this.USERNAME_BLOCKED.includes(this.canonUsername(u))) return 'That username is reserved. Pick another.';
    return null;
  },
  validatePassword(pw){
    if (!pw) return 'Password is required.';
    if (String(pw).length < this.PASSWORD_MIN) return `Password must be at least ${this.PASSWORD_MIN} characters.`;
    return null;
  },
};

/* ── reward definitions ───────────────────────────────────────────
   Tiers are product rules, not user data, so they stay in the client.
   Whether a given member has CLAIMED one is user data and comes from
   the backend. */
const REWARD_TIERS = [
  { id:'r1', name:'Club Merch',    required:10, desc:'' },
  { id:'r2', name:'Free Blindbox', required:20, desc:'' },
  { id:'r3', name:'???',           required:30, desc:'A surprise. You will find out.' },
];

/* ══════════════════════════════════════════════════════════════════
   SUPABASE ADAPTER
   ══════════════════════════════════════════════════════════════════ */
const SupabaseAdapter = {
  name: 'supabase',
  client: null,

  /* poll for the deferred library, up to ~6s */
  awaitLibrary(timeoutMs = 6000){
    if (window.supabase && window.supabase.createClient) return Promise.resolve(true);
    return new Promise(resolve => {
      const started = Date.now();
      const tick = () => {
        if (window.supabase && window.supabase.createClient) return resolve(true);
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(tick, 60);
      };
      tick();
    });
  },

  async init(){
    if (this.client) return this.client;
    /* supabase-js is loaded as a plain script when configured; if it is
       absent we fail loudly rather than silently falling back to fake
       data, because silently-fake data is the bug we are removing. */
    /* The client library is a deferred third-party script, so it may not
       have executed yet when boot reaches this point. Wait briefly for
       it rather than racing it — and if it never arrives, fail loudly.
       A missing client must surface as "backend unavailable", never as
       a silent downgrade to empty local data. */
    await SupabaseAdapter.awaitLibrary();
    if (!window.supabase || !window.supabase.createClient)
      throw new Error('supabase-js did not load');
    this.client = window.supabase.createClient(
      Config.supabaseUrl, Config.supabaseAnonKey,
      { auth:{ persistSession:true, autoRefreshToken:true } });
    return this.client;
  },

  /* ── auth: username + password only, no email surface ── */
  async currentSession(){
    const { data } = await this.client.auth.getSession();
    if (!data || !data.session) return null;
    return this.profileFor(data.session.user);
  },

  /* The database trigger (on_auth_user_created) is the ONE authority
     that creates a profile row. The frontend never inserts one — two
     writers would race and collide on the primary key. But the trigger
     commits as part of the auth transaction, and the very next request
     can arrive before that is visible, so a fresh signup could read
     back "no profile" and look like a broken account. Waiting is the
     correct fix, not a second insert. */
  async profileFor(authUser, { waitMs = 0 } = {}){
    const deadline = Date.now() + waitMs;
    for (;;){
      const { data, error } = await this.client
        .from('profiles').select('id, username, display_name, role')
        .eq('id', authUser.id).maybeSingle();
      if (error) throw error;
      if (data) return this.shapeProfile(data);
      if (Date.now() >= deadline) return null;
      await new Promise(r => setTimeout(r, 150));
    }
  },

  shapeProfile(data){
    /* role comes from the database and nowhere else. Nothing the browser
       can send changes it — see the freeze_identity_fields trigger. */
    return { id:data.id, username:data.username,
             name:data.display_name || data.username,
             role:data.role === 'board' ? 'board' : 'member',
             isBoard:data.role === 'board' };
  },

  async signIn(username, password){
    const { data, error } = await this.client.auth.signInWithPassword({
      email: Config.emailForUsername(username), password });
    /* One message for "no such username" and "wrong password" on purpose:
       distinguishing them tells an attacker which usernames exist. */
    if (error) throw new Error('That username and password do not match.');
    const profile = await this.profileFor(data.user, { waitMs:1500 });
    if (!profile) throw new Error('That account has no profile yet. Ask a board member.');
    return profile;
  },

  async signUp(username, password){
    const display = String(username).trim();
    const { data, error } = await this.client.auth.signUp({
      email: Config.emailForUsername(display),
      password,
      /* the trigger reads these to build the profile row; role is NOT
         accepted from here — the database always writes 'member' */
      options:{ data:{ username: Config.canonUsername(display), display_name: display } },
    });
    if (error){
      const m = String(error.message || '').toLowerCase();
      if (m.includes('already registered') || m.includes('already exists') || error.status === 422)
        throw new Error('Username is already taken.');
      if (m.includes('password')) throw new Error('Password is too weak. Use at least 8 characters.');
      throw new Error('Could not create that account. Try again in a moment.');
    }
    if (!data.session){
      /* email confirmation is on in the project settings; with synthetic
         addresses nobody can confirm, so this must be surfaced, not hidden */
      throw new Error('Account created but sign-in is not enabled. Ask a board member to turn off email confirmation.');
    }
    /* give the trigger up to 3s to land before declaring failure */
    const profile = await this.profileFor(data.user, { waitMs:3000 });
    if (!profile)
      throw new Error('Your account was created but its profile did not appear. Tell a board member before signing in again.');
    return profile;
  },

  async signOut(){ await this.client.auth.signOut(); },

  /* ── meetings: the board creates these; the client never invents them ── */
  async listMeetings(){
    const { data, error } = await this.client
      .from('meetings')
      .select('id, meeting_number, meeting_date, start_time, end_time, location, check_in_open')
      .order('meeting_number', { ascending:false });
    if (error) throw error;
    return (data || []).map(this.toMeeting);
  },

  async createMeeting(m){
    const { data, error } = await this.client.from('meetings').insert({
      meeting_number:m.no, meeting_date:m.date, start_time:m.startTime,
      end_time:m.endTime, location:'MPR' }).select().single();
    if (error) throw error;
    return this.toMeeting(data);
  },

  /* Deletes only an EMPTY meeting. The RLS policy hides any meeting with
     attendance from this statement, so a delete that matches nothing is
     not a failure to report as an error -- it means the meeting has
     stamps against it. That case gets its own answer. */
  async deleteMeeting(id){
    const { data, error } = await this.client.from('meetings')
      .delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) return { ok:false, code:'HAS_ATTENDANCE' };
    return { ok:true };
  },

  /* one shape for the whole app, so views never see column names */
  toMeeting(row){
    const today = new Date().toISOString().slice(0, 10);
    return {
      id: row.id,
      no: row.meeting_number,
      date: row.meeting_date,
      time: row.start_time,
      endTime: row.end_time,
      place: row.location || 'MPR',
      open: Boolean(row.check_in_open),
      upcoming: row.meeting_date > today && !row.check_in_open,
    };
  },

  async listAttendance(userId){
    const { data, error } = await this.client
      .from('attendance').select('id, meeting_id, checked_in_at, verification_method')
      .eq('user_id', userId).order('checked_in_at', { ascending:false });
    if (error) throw error;
    return (data || []).map(r => ({ id:r.id, meetingId:r.meeting_id,
                                    at:r.checked_in_at, method:r.verification_method }));
  },

  /* There is deliberately NO direct insert into the attendance table
     from the browser: verifyCode() below is the only stamp path, and
     RLS has no member insert policy. Do not add one — a working,
     exported "grant myself a stamp" method on window.Backend would be
     one policy edit away from being the hole. Exactly one way a stamp
     comes into existence, and it is on the server. */

  async listRewardClaims(userId){
    const { data, error } = await this.client
      .from('reward_claims').select('reward_id, claimed_at').eq('user_id', userId);
    if (error) throw error;
    return (data || []).map(r => r.reward_id);
  },

  async claimReward(userId, rewardId){
    const { error } = await this.client.from('reward_claims')
      .insert({ user_id:userId, reward_id:rewardId });
    if (error && error.code !== '23505') throw error;
    return rewardId;
  },

  /* ── ATTENDANCE VERIFICATION ─────────────────────────────────────
     The server is the only authority. This call sends the raw scanned
     payload and returns whatever the Edge Function decides.

     There is deliberately NO local fallback: a client-side check would
     accept tokens the browser could mint itself. A configured build
     FAILS CLOSED — if verification is unreachable, nobody gets a
     stamp. Refusing a real member is recoverable; awarding attendance
     to a forged code is not. */
  async verifyCode(rawCode){
    let res;
    try {
      res = await this.client.functions.invoke('verify-attendance', { body:{ code:rawCode } });
    } catch (err){
      return { ok:false, code:'NETWORK_ERROR' };
    }
    if (res.error){
      const status = (res.error.context && res.error.context.status) || res.error.status;
      if (status === 401) return { ok:false, code:'NOT_AUTHENTICATED' };
      if (status === 403) return { ok:false, code:'NOT_AUTHORIZED' };
      if (status === 404) return { ok:false, code:'VERIFIER_UNAVAILABLE' };
      /* the function returns its verdicts with a 200, so anything else
         here is a genuine fault, not a rejected code */
      return { ok:false, code:'SERVER_ERROR' };
    }
    return res.data || { ok:false, code:'SERVER_ERROR' };
  },

  /* ── board administration ─────────────────────────────────────────
     One privileged endpoint, one place. Views never issue these
     queries themselves, and the function re-reads the caller's role
     from the database, so a member calling the same method gets 403
     rather than data. */
  async board(action, params){
    const { data, error } = await this.client.functions
      .invoke('board-data', { body:{ action, ...(params || {}) } });
    if (error){
      const status = (error.context && error.context.status) || error.status;
      if (status === 401) throw new Error('NOT_AUTHENTICATED');
      if (status === 403) throw new Error('NOT_AUTHORIZED');
      throw new Error('SERVER_ERROR');
    }
    if (!data || !data.ok) throw new Error((data && data.code) || 'SERVER_ERROR');
    return data;
  },

  /* ── board: attendance sessions and rotating tokens ── */
  async startAttendance(meetingId){
    const { data, error } = await this.client.functions
      .invoke('attendance-session', { body:{ action:'start', meeting_id:meetingId } });
    if (error) throw new Error('Could not start attendance.');
    return data;
  },
  async endAttendance(meetingId){
    const { data, error } = await this.client.functions
      .invoke('attendance-session', { body:{ action:'end', meeting_id:meetingId } });
    if (error) throw new Error('Could not end attendance.');
    return data;
  },
  async issueToken(meetingId){
    const { data, error } = await this.client.functions
      .invoke('attendance-session', { body:{ action:'token', meeting_id:meetingId } });
    if (error) throw new Error('Could not get a code.');
    return data;                       /* { token, expires_at } — same every time */
  },
  async attendanceCount(meetingId){
    const { count, error } = await this.client
      .from('attendance').select('id', { count:'exact', head:true })
      .eq('meeting_id', meetingId);
    if (error) throw error;
    return count || 0;
  },
};

/* ══════════════════════════════════════════════════════════════════
   PREVIEW ADAPTER — no backend attached.

   Deliberately empty. It exists so the app boots, renders its
   signed-out state and exercises the interface without a database. It
   never invents a user, a meeting or a stamp.
   ══════════════════════════════════════════════════════════════════ */
const PreviewAdapter = {
  name: 'preview',
  async init(){ return this; },
  async currentSession(){ return null; },
  async signIn(){ throw new Error('No backend is configured, so sign-in is unavailable.'); },
  async signUp(){ throw new Error('No backend is configured, so accounts cannot be created.'); },
  async signOut(){},
  async listMeetings(){ return []; },
  async createMeeting(){ throw new Error('No backend is configured.'); },
  async deleteMeeting(){ throw new Error('No backend is configured.'); },
  async listAttendance(){ return []; },
  async listRewardClaims(){ return []; },
  async claimReward(){ throw new Error('No backend is configured.'); },
  async verifyCode(){ return { ok:false, code:'NO_BACKEND' }; },
  async startAttendance(){ throw new Error('No backend is configured.'); },
  async endAttendance(){ throw new Error('No backend is configured.'); },
  async issueToken(){ throw new Error('No backend is configured.'); },
  async attendanceCount(){ return 0; },
  async board(){ throw new Error('No backend is configured.'); },
};

/* ══════════════════════════════════════════════════════════════════
   UNAVAILABLE ADAPTER — configured, but the client could not start.

   This is NOT PreviewAdapter. A configured project whose connection
   fails must never look like a working app with an empty account: a
   member would see 00 stamps and conclude their attendance was lost.
   Every call here refuses with BACKEND_UNAVAILABLE so the UI can say
   "cannot reach the club records" rather than showing a blank record
   as though it were the truth.
   ══════════════════════════════════════════════════════════════════ */
const UnavailableAdapter = {
  name: 'unavailable',
  detail: null,
  async init(){ return this; },
  async currentSession(){ return null; },
};
['signIn','signUp','signOut','listMeetings','createMeeting','deleteMeeting','listAttendance',
 'listRewardClaims','claimReward','startAttendance',
 'endAttendance','issueToken','attendanceCount','board'].forEach(fn => {
  UnavailableAdapter[fn] = async () => { throw new Error('BACKEND_UNAVAILABLE'); };
});
UnavailableAdapter.verifyCode = async () => ({ ok:false, code:'BACKEND_UNAVAILABLE' });

const Backend = {
  adapter: null,
  failure: null,

  get mode(){ return this.adapter ? this.adapter.name : 'none'; },

  /* live === true means the real Supabase adapter is running. It is
     never true for preview or for a failed connection, so any code
     that gates on it is gating on a genuine backend. */
  get live(){ return this.mode === 'supabase'; },
  get configured(){ return Config.configured; },
  get status(){
    if (!this.adapter) return Config.status().state === 'ok' ? 'starting' : 'unconfigured';
    if (this.mode === 'supabase') return 'live';
    if (this.mode === 'unavailable') return 'unavailable';
    return Config.status().state === 'ok' ? 'unavailable' : 'unconfigured';
  },

  async init(){
    const cfg = Config.status();
    this.failure = null;
    /* until init resolves, nothing is live */
    this.adapter = null;

    if (cfg.state !== 'ok'){
      /* genuinely unconfigured: preview is correct here, and only here */
      this.adapter = PreviewAdapter;
      this.failure = cfg;
      await this.adapter.init();
      return this.adapter;
    }

    /* One line, every load. A preview URL and the production URL look
       alike in a phone's address bar, so the console should never leave
       it ambiguous which database is being written to. */
    console.info(`[keystamp] ${Config.environment} backend \u2014 ${Config.supabaseUrl}`);

    try {
      /* Assign only AFTER init succeeds. Assigning first made
         Backend.live report true for the whole time the library was
         still being awaited, so early callers saw a "live" backend
         whose client was null. */
      await SupabaseAdapter.init();
      this.adapter = SupabaseAdapter;
    } catch (err){
      /* Configured but the client would not start — almost always the
         supabase-js script failing to load. Deliberately does NOT fall
         back to PreviewAdapter. */
      console.error('[keystamp] Supabase client failed to start:', err.message);
      this.adapter = UnavailableAdapter;
      UnavailableAdapter.detail = err.message;
      this.failure = { state:'unavailable', reason:'Keystamp could not start the Supabase client.' };
      await this.adapter.init();
    }
    return this.adapter;
  },
};

/* forward the interface so callers use Backend.x, not Backend.adapter.x */
['currentSession','signIn','signUp','signOut','listMeetings','createMeeting','deleteMeeting','listAttendance',
 'listRewardClaims','claimReward','verifyCode',
 'startAttendance','endAttendance','issueToken','attendanceCount','board'].forEach(fn => {
  Backend[fn] = function(...a){ return this.adapter[fn](...a); };
});
