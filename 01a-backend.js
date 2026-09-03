"use strict";

const CLUB_TZ = 'America/Los_Angeles';
const clubDay = (d = new Date()) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: CLUB_TZ, year:'numeric', month:'2-digit', day:'2-digit',
    }).format(d);
  } catch (_) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
};

const WriteFailure = {
  constraintOf(ex){
    const msg = String((ex && ex.message) || '');
    return (ex && ex.constraint) ||
           (msg.match(/(?:check |unique )?constraint "([^"]+)"/) || [])[1] || null;
  },

  classify(ex){
    const code = String((ex && (ex.code || ex.status)) || '');
    const msg  = String((ex && ex.message) || '');
    const c    = this.constraintOf(ex);

    if (/BACKEND_UNAVAILABLE|No backend is configured/i.test(msg))
      return { kind:'backend', say:'The club records are unreachable right now. Try again in a moment.' };
    if (code === '42501' || /row-level security|permission denied/i.test(msg))
      return { kind:'permission', say:'That account is not allowed to schedule meetings.' };
    if (code === '401' || code === '403' || /jwt|not signed in|invalid token/i.test(msg))
      return { kind:'auth', say:'Your session has expired. Sign in again.' };
    if (code === '23505' || /duplicate|already exists|unique/i.test(msg))
      return { kind:'duplicate', say:'A meeting with that number already exists.' };
    if (code === '23514' || /check constraint/i.test(msg)){
      if (c === 'meeting_is_wednesday')
        return { kind:'legacy-rule',
                 say:'The database still restricts meetings to Wednesdays. Re-run schema.sql on the Supabase project to lift it.' };
      if (c === 'meeting_time_order')
        return { kind:'constraint', say:'The database refused those times. The end time must be later than the start time.' };
      if (c && /location/.test(c))
        return { kind:'constraint', say:'Meetings must be held in the MPR.' };
      return { kind:'constraint', say:'The database refused those details.' };
    }
    if (code === '23502') return { kind:'missing', say:'Something required was left blank.' };

    if (/^PGRST2/.test(code) || /could not find the function|schema cache/i.test(msg))
      return { kind:'not-installed',
               say:'The database does not have this operation installed. Re-run schema.sql on the Supabase project.' };

    if (code === 'P0001')
      return { kind:'refused', say: msg.replace(/^TEMP-TEST-TOOLING:\s*/i, '')
                 .replace(/^\w/, ch => ch.toUpperCase()) + '.' };
    if (/failed to fetch|networkerror|load failed/i.test(msg))
      return { kind:'network', say:'Could not reach the club records. Check the connection and try again.' };
    return { kind:'unknown', say:'Could not save that. Check the details and try again.' };
  },

  explain(ex, what){
    const v = this.classify(ex);
    const c = this.constraintOf(ex);
    console.error(`[keystamp] ${what} failed —`, v.kind,
      { code:(ex && (ex.code || ex.status)) || null,
        message:(ex && ex.message) || null,
        details:(ex && ex.details) || null,
        hint:(ex && ex.hint) || null,
        constraint:c });
    return v.say;
  },
};

const Config = {
  meta(name){
    const el = document.querySelector(`meta[name="keystamp:${name}"]`);
    const v = el && el.getAttribute('content');
    return v && !/^\{\{|^\s*$/.test(v) ? v.trim() : null;
  },

  get supabaseUrl(){
    return typeof window.KEYSTAMP_SUPABASE_URL === 'string'
      ? window.KEYSTAMP_SUPABASE_URL : this.meta('supabase-url');
  },
  get supabaseAnonKey(){
    return typeof window.KEYSTAMP_SUPABASE_ANON_KEY === 'string'
      ? window.KEYSTAMP_SUPABASE_ANON_KEY : this.meta('supabase-anon-key');
  },

  PLACEHOLDERS: [
    'your_project', 'your-project', 'yourproject', 'xxx', 'example',
    'your_public_anon_key', 'your-anon-key', 'changeme', 'todo',
  ],
  looksPlaceholder(v){
    const t = String(v || '').trim().toLowerCase();
    if (!t) return false;
    if (this.PLACEHOLDERS.some(ph => t.includes(ph))) return true;

    if (/^ey\.{2,}$/.test(t) || /\.\.\.$/.test(t)) return true;
    return false;
  },

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

  USERNAME_MIN: 3,
  USERNAME_MAX: 24,
  USERNAME_RE: /^[a-zA-Z0-9_.]+$/,

  USERNAME_BLOCKED: ['admin','administrator','board','keystamp','root','system','staff','moderator','mod','owner','support','null','undefined'],
  PASSWORD_MIN: 8,

  canonUsername(u){ return String(u || '').trim().toLowerCase(); },

  AUTH_DOMAIN: 'keystamp.invalid',
  emailForUsername(username){
    return `${this.canonUsername(username)}@${this.AUTH_DOMAIN}`;
  },

  validateUsername(raw){
    const u = String(raw || '').trim();
    if (!u) return 'Username is required.';
    if (u.length < this.USERNAME_MIN) return `Username must be at least ${this.USERNAME_MIN} characters.`;
    if (u.length > this.USERNAME_MAX) return `Username must be ${this.USERNAME_MAX} characters or fewer.`;
    if (!this.USERNAME_RE.test(u)) return 'Username can only use letters, numbers, underscores and periods.';
    if (this.USERNAME_BLOCKED.includes(this.canonUsername(u))) return 'That username is reserved. Pick another.';
    return null;
  },
  validatePassword(pw){
    if (!pw) return 'Password is required.';
    if (String(pw).length < this.PASSWORD_MIN) return `Password must be at least ${this.PASSWORD_MIN} characters.`;
    return null;
  },
};

const REWARD_TIERS = [
  { id:'r1', name:'Club Merch',    required:10, desc:'' },
  { id:'r2', name:'Free Blindbox', required:20, desc:'' },
  { id:'r3', name:'???',           required:30, desc:'A surprise. You will find out.' },
];

const SupabaseAdapter = {
  name: 'supabase',
  client: null,

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

    await SupabaseAdapter.awaitLibrary();
    if (!window.supabase || !window.supabase.createClient)
      throw new Error('supabase-js did not load');
    this.client = window.supabase.createClient(
      Config.supabaseUrl, Config.supabaseAnonKey,
      { auth:{ persistSession:true, autoRefreshToken:true } });
    return this.client;
  },

  async currentSession(){
    const { data } = await this.client.auth.getSession();
    if (!data || !data.session) return null;
    return this.profileFor(data.session.user);
  },

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
    return { id:data.id, username:data.username,
             name:data.display_name || data.username,
             role:data.role === 'board' ? 'board' : 'member',
             isBoard:data.role === 'board' };
  },

  authUnreachable(error){
    if (!error) return false;
    if (error.name === 'AuthRetryableFetchError') return true;
    const status = Number(error.status);
    if (status === 0 || (status >= 500 && status < 600)) return true;
    return !error.status &&
      /fetch|network|load failed|connect/i.test(String(error.message || ''));
  },

  async signIn(username, password){
    const { data, error } = await this.client.auth.signInWithPassword({
      email: Config.emailForUsername(username), password });
    if (error){
      if (this.authUnreachable(error))
        throw new Error('Keystamp cannot reach the server right now. Try again in a moment.');

      throw new Error('That username and password do not match.');
    }
    const profile = await this.profileFor(data.user, { waitMs:1500 });
    if (!profile) throw new Error('That account has no profile yet. Ask a board member.');
    return profile;
  },

  async signUp(username, password){
    const display = String(username).trim();
    const { data, error } = await this.client.auth.signUp({
      email: Config.emailForUsername(display),
      password,

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
      throw new Error('Account created but sign-in is not enabled. Ask a board member to turn off email confirmation.');
    }

    const profile = await this.profileFor(data.user, { waitMs:3000 });
    if (!profile)
      throw new Error('Your account was created but its profile did not appear. Tell a board member before signing in again.');
    return profile;
  },

  async signOut(){ await this.client.auth.signOut(); },

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

  async deleteMeeting(id){
    const { data, error } = await this.client.from('meetings')
      .delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) return { ok:false, code:'HAS_ATTENDANCE' };
    return { ok:true };
  },

  toMeeting(row){
    const today = clubDay();
    return {
      id: row.id,
      no: row.meeting_number,
      date: row.meeting_date,
      time: row.start_time,
      endTime: row.end_time,
      place: row.location || 'MPR',
      open: Boolean(row.check_in_open),
      today: row.meeting_date === today,
      upcoming: row.meeting_date >= today && !row.check_in_open,
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

      return { ok:false, code:'SERVER_ERROR' };
    }
    return res.data || { ok:false, code:'SERVER_ERROR' };
  },

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

    return { token: data && data.token };
  },
  /* TEMP-TEST-TOOLING — remove with the rest of the purge tooling.
     Deletes a past meeting AND its attendance so test data can be
     cleaned up before launch. Board-only and past-only are enforced by
     the database function, not here: this call is just the wire. */
  async purgeMeetingTEMP(meetingId){
    const { data, error } = await this.client
      .rpc('tmp_test_purge_meeting', { p_meeting_id:meetingId });
    if (error) throw error;
    return { removed: Number(data) || 0 };
  },

  async attendanceCount(meetingId){
    const { count, error } = await this.client
      .from('attendance').select('id', { count:'exact', head:true })
      .eq('meeting_id', meetingId);
    if (error) throw error;
    return count || 0;
  },
};

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
  /* TEMP-TEST-TOOLING */
  async purgeMeetingTEMP(){ throw new Error('No backend is configured.'); },
};

const UnavailableAdapter = {
  name: 'unavailable',
  detail: null,
  async init(){ return this; },
  async currentSession(){ return null; },
};
['signIn','signUp','signOut','listMeetings','createMeeting','deleteMeeting','listAttendance',
 'listRewardClaims','claimReward','startAttendance',
 'endAttendance','issueToken','attendanceCount','board',
 'purgeMeetingTEMP'].forEach(fn => {   /* TEMP-TEST-TOOLING */
  UnavailableAdapter[fn] = async () => { throw new Error('BACKEND_UNAVAILABLE'); };
});
UnavailableAdapter.verifyCode = async () => ({ ok:false, code:'BACKEND_UNAVAILABLE' });

const Backend = {
  adapter: null,
  failure: null,

  get mode(){ return this.adapter ? this.adapter.name : 'none'; },

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

    this.adapter = null;

    if (cfg.state !== 'ok'){
      this.adapter = PreviewAdapter;
      this.failure = cfg;
      await this.adapter.init();
      return this.adapter;
    }

    try {
      await SupabaseAdapter.init();
      this.adapter = SupabaseAdapter;
    } catch (err){
      console.error('[keystamp] Supabase client failed to start:', err.message);
      this.adapter = UnavailableAdapter;
      UnavailableAdapter.detail = err.message;
      this.failure = { state:'unavailable', reason:'Keystamp could not start the Supabase client.' };
      await this.adapter.init();
    }
    return this.adapter;
  },
};

['currentSession','signIn','signUp','signOut','listMeetings','createMeeting','deleteMeeting','listAttendance',
 'listRewardClaims','claimReward','verifyCode',
 'startAttendance','endAttendance','issueToken','attendanceCount','board',
 'purgeMeetingTEMP'].forEach(fn => {   /* TEMP-TEST-TOOLING */
  Backend[fn] = function(...a){ return this.adapter[fn](...a); };
});
