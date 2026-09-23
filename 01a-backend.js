"use strict";

const CLUB_TZ = 'America/Los_Angeles';
/* Building the formatter costs about as much as reading twenty meetings
   does, and toMeeting() asks for the club's date once per row, so the
   one formatter is kept and only the reading is repeated. */
let clubFmt = null;
const clubDay = (d = new Date()) => {
  try {
    if (!clubFmt) clubFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: CLUB_TZ, year:'numeric', month:'2-digit', day:'2-digit',
    });
    return clubFmt.format(d);
  } catch (_) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
};

/* minutes past midnight at the club */
function clubMinutes(d = new Date()){
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone:CLUB_TZ, hour:'2-digit', minute:'2-digit', hourCycle:'h23' })
      .formatToParts(d);
    const v = t => Number((p.find(x => x.type === t) || {}).value);
    return v('hour') * 60 + v('minute');
  } catch (_) { return d.getHours() * 60 + d.getMinutes(); }
}

/* "1:30 PM" as minutes past midnight; NaN for anything else */
function clockMinutes(t){
  const e = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(t || '').trim());
  if (!e) return NaN;
  return (Number(e[1]) % 12 + (/pm/i.test(e[3]) ? 12 : 0)) * 60 + Number(e[2]);
}

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
      return { kind:'backend', say:'Could not reach the club records. Try again.' };
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
      return { kind:'refused',
               say: msg.replace(/^TEMP-TEST-TOOLING:\s*/i, '')
                       .replace(/^\w/, ch => ch.toUpperCase()) + '.' };
    if (/failed to fetch|networkerror|load failed/i.test(msg))
      return { kind:'network', say:'Could not reach the club records. Check your connection.' };
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
    /* a name of only dots or underscores reads as a placeholder on the
       roster, and the dots have to make a valid sign-in address */
    if (!/[a-z0-9]/i.test(u)) return 'Username needs at least one letter or number.';
    if (/^\.|\.$|\.\./.test(u)) return 'Username cannot start or end with a period, or have two in a row.';
    if (this.USERNAME_BLOCKED.includes(this.canonUsername(u))) return 'That username is reserved. Pick another.';
    return null;
  },
  /* signing in asks only whether it could be a username at all; whether
     the account exists is the server's answer, said the same way for
     every name (a reserved one included) */
  checkSignInName(raw){
    const u = String(raw || '').trim();
    if (!u) return 'Username is required.';
    if (u.length < this.USERNAME_MIN) return `Username must be at least ${this.USERNAME_MIN} characters.`;
    if (u.length > this.USERNAME_MAX) return `Username must be ${this.USERNAME_MAX} characters or fewer.`;
    if (!this.USERNAME_RE.test(u)) return 'Username can only use letters, numbers, underscores and periods.';
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
  { id:'r3', name:'???',           required:30, desc:'' },
];

/* What one tier is to one member, read from the stamp count and
   whether a claim row is on file. A claim is the member asking for the
   prize on the record, so a claimed tier stays reached even if a
   deleted meeting later takes stamps back, and every count of "rewards
   unlocked" is the number of tiers that are not locked. Whether an
   officer then handed the prize over is a separate fact
   (reward_handovers), carried beside this, never folded into it. The
   board function and the test double carry these same lines. */
const rewardState = (tier, stamps, claimed) =>
  claimed ? 'claimed' : stamps >= tier.required ? 'unlocked' : 'locked';

/* Hand-over refusals, as the database raises them. */
const Handover = {
  CODES: ['NOT_AUTHORIZED', 'NOT_EARNED', 'ALREADY_HANDED_OVER', 'UNDO_EXPIRED', 'INVALID_REWARD', 'SELF_HANDOVER'],
  /* refusals that mean the request never reached a decision */
  OFFLINE: ['NETWORK_ERROR', 'SERVER_ERROR', 'NOT_INSTALLED'],
  /* the table or the function is not on this project yet */
  absent(error){
    const code = String((error && error.code) || '');
    return code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || code === '42883';
  },
  code(error){
    if (this.absent(error)) return 'NOT_INSTALLED';
    const msg = String((error && error.message) || '');
    const hit = this.CODES.find(c => msg.includes(c));
    if (hit) return hit;
    return WriteFailure.classify(error).kind === 'network' ? 'NETWORK_ERROR' : 'SERVER_ERROR';
  },
  message(code){
    return ({
      NOT_AUTHORIZED:      'Only a board account can hand over a prize.',
      NOT_EARNED:          'This member has not earned that prize.',
      ALREADY_HANDED_OVER: 'Another officer has already handed this over.',
      UNDO_EXPIRED:        'It can only be taken back by the officer who recorded it, within 15 minutes.',
      INVALID_REWARD:      'That prize does not exist.',
      SELF_HANDOVER:       'Another officer has to hand you your prize.',
      NOT_INSTALLED:       'Prize hand-overs are not set up on this project yet.',
      NETWORK_ERROR:       'Not saved. Check your connection and try again.',
    })[code] || 'Not saved. Try again.';
  },
};

/* Stamp-by-hand refusals, from the function or from the table. */
const HandStamp = {
  CODES: ['NOT_AUTHORIZED', 'SELF_STAMP', 'NOT_TODAY', 'MEETING_NOT_FOUND', 'MEMBER_NOT_FOUND', 'ALREADY_CHECKED_IN'],
  code(error){
    const code = String((error && error.code) || ''), msg = String((error && error.message) || '');
    const hit = this.CODES.find(c => msg.includes(c));
    if (hit) return hit;
    if (code === '23505') return 'ALREADY_CHECKED_IN';
    if (code === '23503') return 'MEETING_NOT_FOUND';
    if (code === '42501') return 'NOT_AUTHORIZED';
    return WriteFailure.classify(error).kind === 'network' ? 'NETWORK_ERROR' : 'SERVER_ERROR';
  },
  message(code){
    return ({
      ALREADY_CHECKED_IN: 'Already checked in.',
      SELF_STAMP:         'Another officer has to add you.',
      NOT_TODAY:          'Only today\'s meeting takes stamps by hand.',
      MEETING_NOT_FOUND:  'That meeting no longer exists.',
      MEMBER_NOT_FOUND:   'That account no longer exists.',
      NOT_AUTHORIZED:     'Only a board account can add a stamp.',
      NETWORK_ERROR:      'Not saved. Check your connection and try again.',
    })[code] || 'Not saved. Try again.';
  },
};

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
    const { data, error } = await this.client.auth.getSession();
    /* a stored session whose refresh could not reach the server is not
       a signed-out one: the page says it could not load, and keeps it */
    if (error && this.authUnreachable(error)) throw error;
    if (!data || !data.session) return null;
    return this.profileFor(data.session.user);
  },

  /* Session changes the page did not make: a refresh the server refused
     (signed out on another device, or revoked), or another tab signing
     out or in as someone else. */
  onAuthChange(fn){
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      /* outside supabase-js's lock: the listener reads the record again */
      setTimeout(() => fn(event, session ? session.user.id : null), 0);
    });
    return data && data.subscription;
  },

  /* this device forgets the session, whether or not the server heard */
  forgetSession(){
    const key = this.client && this.client.auth && this.client.auth.storageKey;
    if (!key) return;
    try {
      Object.keys(localStorage).filter(k => k === key || k.startsWith(key + '-'))
        .forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  },

  async profileFor(authUser, { waitMs = 0 } = {}){
    const deadline = Date.now() + waitMs;
    for (;;){
      const { data, error } = await this.client
        .from('profiles').select('id, username, display_name, role, created_at')
        .eq('id', authUser.id).maybeSingle();
      if (error) throw error;
      if (data) return this.shapeProfile(data);
      if (Date.now() >= deadline) return null;
      await new Promise(r => setTimeout(r, 150));
    }
  },

  shapeProfile(data){
    const made = data.created_at ? new Date(data.created_at) : null;
    return { id:data.id, username:data.username,
             name:data.display_name || data.username,
             role:data.role === 'board' ? 'board' : 'member',
             isBoard:data.role === 'board',
             /* the club day the account was made; a meeting before it
                is not one the member could have checked in to */
             joined: made && !Number.isNaN(made.getTime()) ? clubDay(made) : null,
             joinedAt: made && !Number.isNaN(made.getTime()) ? clubMinutes(made) : null };
  },

  authUnreachable(error){
    if (!error) return false;
    if (error.name === 'AuthRetryableFetchError') return true;
    const status = Number(error.status);
    if (status === 0 || (status >= 500 && status < 600)) return true;
    return !error.status &&
      /fetch|network|load failed|connect/i.test(String(error.message || ''));
  },

  SIGN_IN_WAIT: 20000,
  async signIn(username, password){
    const UNREACHABLE = 'Could not reach the club records. Try again.';
    /* a sign-in that never answers is given up on; if it answers after
       the page has said so, that session is not kept */
    let gaveUp = false;
    const asked = this.client.auth.signInWithPassword({
      email: Config.emailForUsername(username), password });
    asked.then(r => { if (gaveUp && r && r.data && r.data.session) this.signOut(); }, () => {});
    const { data, error } = await Promise.race([asked,
      new Promise(r => setTimeout(() => { gaveUp = true; r({ error:{ name:'AuthRetryableFetchError', status:0 } }); }, this.SIGN_IN_WAIT))]);
    if (error){
      if (this.authUnreachable(error)) throw new Error(UNREACHABLE);
      /* a limit on attempts from this network, not a refusal of the password */
      if (Number(error.status) === 429 || /rate.?limit/i.test(String(error.code || error.message || '')))
        throw new Error('Too many sign-in attempts from this network. Wait a minute and try again.');

      throw new Error('That username and password do not match.');
    }
    /* the password was accepted but the account could not be read: the
       half-made session is not left behind to sign in on the next load */
    let profile;
    try { profile = await this.profileFor(data.user, { waitMs:1500 }); }
    catch (_){ await this.signOut(); throw new Error(UNREACHABLE); }
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
      const m = String(error.message || '').toLowerCase(), code = String(error.code || '');
      /* the auth server answers 422 for several refusals; each says which */
      if (code === 'weak_password' || (!code && m.includes('password')))
        throw new Error('Password is too weak. Pick a longer or less common one.');
      if (code === 'user_already_exists' || code === 'email_exists' ||
          m.includes('already registered') || m.includes('already exists'))
        throw new Error('Username is already taken.');
      if (code === 'email_address_invalid' || code === 'validation_failed')
        throw new Error('That username cannot be used. Pick another.');
      if (Number(error.status) === 429 || /rate.?limit/i.test(code))
        throw new Error('Too many accounts made from this network. Wait a minute and try again.');
      throw new Error('Could not create that account. Try again.');
    }
    if (!data.session){
      throw new Error('Account created but sign-in is not enabled. Ask a board member to turn off email confirmation.');
    }

    const profile = await this.profileFor(data.user, { waitMs:3000 });
    if (!profile)
      throw new Error('Your account was created but its profile did not appear. Tell a board member before signing in again.');
    return profile;
  },

  /* Signing out ends this device's session; another phone or the
     projector laptop signed in to the same account stays signed in.
     The device forgets its session even when the server cannot be told
     (offline, or a token that cannot refresh), so a reload never signs
     the last person back in. */
  SIGN_OUT_WAIT: 5000,
  async signOut(){
    let error = null;
    try {
      ({ error } = await Promise.race([
        this.client.auth.signOut({ scope:'local' }),
        new Promise(r => setTimeout(() => r({ error:new Error('SIGN_OUT_TIMEOUT') }), this.SIGN_OUT_WAIT))]));
    } catch (ex){ error = ex; }
    if (error) this.forgetSession();
  },

  async listMeetings(){
    const { data, error } = await this.client
      .from('meetings')
      .select('id, meeting_number, meeting_date, start_time, end_time, location, check_in_open')
      .order('meeting_number', { ascending:false });
    if (error) throw error;
    return (data || []).map(this.toMeeting);
  },

  async createMeeting(m){
    /* who scheduled it goes on the record (meetings.created_by), as the
       officer who opened check-in does on its session */
    const { data:auth } = await this.client.auth.getSession();
    const by = auth && auth.session && auth.session.user ? auth.session.user.id : null;
    const { data, error } = await this.client.from('meetings').insert({
      meeting_number:m.no, meeting_date:m.date, start_time:m.startTime,
      end_time:m.endTime, location:'MPR', ...(by ? { created_by:by } : {}) }).select().single();
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
      /* a check-in left open from an earlier day takes no scans (its
         codes have expired), so for a member it is a held meeting */
      open: Boolean(row.check_in_open) && row.meeting_date === today,
      today: row.meeting_date === today,
      /* ahead of the member, until Store.settle() has the stamps and
         the club's clock (started, ended) */
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
    return (data || []).map(r => ({ id:r.reward_id, at:r.claimed_at }));
  },

  /* The prizes an officer has handed this member. `false`, not an
     empty list, on a project that has not run
     migrations/2026-09-23-prizes-and-hand-stamps.sql: there, a claim is all
     the club records, and the page says only that. */
  async listHandovers(userId){
    /* asked once per page: a project without the table answers 404 to
       every read, and a browser logs each one as an error */
    if (this.noHandovers) return false;
    const { data, error } = await this.client
      .from('reward_handovers').select('reward_id, handed_at').eq('user_id', userId);
    if (error){
      if (Handover.absent(error)){ this.noHandovers = true; return false; }
      throw error;
    }
    return (data || []).map(r => ({ id:r.reward_id, at:r.handed_at }));
  },

  /* Board only, decided by the database (hand_over_reward). Resolves
     to the time it was recorded; refuses with one of Handover.CODES. */
  async handOverReward(userId, rewardId){
    const { data, error } = await this.client.rpc('hand_over_reward',
      { p_user_id:userId, p_reward_id:rewardId });
    if (error) throw new Error(Handover.code(error));
    return data;
  },
  async undoHandOver(userId, rewardId){
    const { error } = await this.client.rpc('undo_hand_over',
      { p_user_id:userId, p_reward_id:rewardId });
    if (error) throw new Error(Handover.code(error));
    return true;
  },

  /* A board member stamps someone at today's meeting by hand: a flat
     battery, no phone. The database decides (stamp_by_hand: board only,
     today's meeting only, never yourself, labelled 'board', the time is
     the server's). A project that has not run
     migrations/2026-09-23-prizes-and-hand-stamps.sql has no function
     but still has the older insert policy, so the same row is written
     directly there, and the page holds it to today's meeting. */
  async addAttendance(userId, meetingId){
    const { error } = await this.client.rpc('stamp_by_hand', { p_user_id:userId, p_meeting_id:meetingId });
    if (!error) return true;
    if (!Handover.absent(error)) throw new Error(HandStamp.code(error));
    const { error:e2 } = await this.client.from('attendance')
      .insert({ user_id:userId, meeting_id:meetingId, verification_method:'board' });
    if (!e2) return true;
    throw new Error(HandStamp.code(e2));
  },

  async claimReward(userId, rewardId){
    /* a claim already on file (another tab, a retry after a lost answer)
       is the same outcome, so it is asked for as one: no conflict */
    const { error } = await this.client.from('reward_claims')
      .upsert({ user_id:userId, reward_id:rewardId },
              { onConflict:'user_id,reward_id', ignoreDuplicates:true });
    if (error && error.code !== '23505') throw error;
    return rewardId;
  },

  /* a check that never answers is given up on, as no connection */
  VERIFY_WAIT: 12000,
  async verifyCode(rawCode){
    let res;
    try {
      res = await this.client.functions.invoke('verify-attendance',
        { body:{ code:rawCode }, timeout:this.VERIFY_WAIT });
    } catch (err){
      return { ok:false, code:'NETWORK_ERROR' };
    }
    if (res.error){
      const status = (res.error.context && res.error.context.status) || res.error.status;
      if (status === 401) return { ok:false, code:'NOT_AUTHENTICATED' };
      if (status === 403) return { ok:false, code:'NOT_AUTHORIZED' };
      if (status === 404) return { ok:false, code:'VERIFIER_UNAVAILABLE' };
      /* no answer at all: a dropped connection, or the wait ran out
         (supabase-js returns these as FunctionsFetchError, never throws) */
      if (!status) return { ok:false, code:'NETWORK_ERROR' };

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
      /* an action the deployed function does not know yet */
      if (status === 400) throw new Error('INVALID_REQUEST');
      throw new Error('SERVER_ERROR');
    }
    if (!data || !data.ok) throw new Error((data && data.code) || 'SERVER_ERROR');
    return data;
  },

  /* the function answers 200 with {ok:false, code} for a refusal; that
     is a failure to the caller, never a success */
  async startAttendance(meetingId){
    const { data, error } = await this.client.functions
      .invoke('attendance-session', { body:{ action:'start', meeting_id:meetingId } });
    if (error) throw new Error(this.functionCode(error));
    if (data && data.ok === false) throw new Error(data.code || 'SERVER_ERROR');
    return data;
  },
  async endAttendance(meetingId){
    const { data, error } = await this.client.functions
      .invoke('attendance-session', { body:{ action:'end', meeting_id:meetingId } });
    if (error) throw new Error(this.functionCode(error));
    if (data && data.ok === false) throw new Error(data.code || 'SERVER_ERROR');
    return data;
  },
  functionCode(error){
    const status = (error && error.context && error.context.status) || (error && error.status);
    if (status === 401) return 'NOT_AUTHENTICATED';
    if (status === 403) return 'NOT_AUTHORIZED';
    return 'SERVER_ERROR';
  },
  async issueToken(meetingId){
    const { data, error } = await this.client.functions
      .invoke('attendance-session', { body:{ action:'token', meeting_id:meetingId } });
    if (error) throw new Error(this.functionCode(error));
    if (!data || data.ok === false || !data.token) throw new Error((data && data.code) || 'NO_TOKEN');
    return { token: data.token };
  },
  /* Board-only and held-only are enforced by the database function,
     not here. The legacy name is tried once for projects that have not
     run migrations/2026-09-10-delete-meeting.sql yet. */
  async deleteMeetingAndStamps(meetingId){
    const call = name => this.client.rpc(name, { p_meeting_id:meetingId });
    let { data, error } = await call('delete_meeting_and_stamps');
    if (error && /^PGRST2/.test(String(error.code || '')))
      ({ data, error } = await call('tmp_test_purge_meeting'));
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

  /* the meeting whose check-in is open today, if any: one row at most
     (the database allows one open meeting) */
  async openToday(){
    const { data, error } = await this.client
      .from('meetings').select('id, meeting_date').eq('check_in_open', true);
    if (error) throw error;
    const row = (data || []).find(m => m.meeting_date === clubDay());
    return row ? row.id : null;
  },

  /* how many stamps this member has: a count, no rows */
  async myStampCount(userId){
    const { count, error } = await this.client
      .from('attendance').select('id', { count:'exact', head:true }).eq('user_id', userId);
    if (error) throw error;
    return count || 0;
  },

  /* whether check-in is still open, so a wall left projecting learns
     that another officer closed it */
  async meetingOpen(meetingId){
    const { data, error } = await this.client
      .from('meetings').select('check_in_open').eq('id', meetingId).maybeSingle();
    if (error) throw error;
    return Boolean(data && data.check_in_open);
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
  async listHandovers(){ return false; },
  async handOverReward(){ throw new Error('NO_BACKEND'); },
  async undoHandOver(){ throw new Error('NO_BACKEND'); },
  async addAttendance(){ throw new Error('NO_BACKEND'); },
  async claimReward(){ throw new Error('No backend is configured.'); },
  async verifyCode(){ return { ok:false, code:'NO_BACKEND' }; },
  async startAttendance(){ throw new Error('No backend is configured.'); },
  async endAttendance(){ throw new Error('No backend is configured.'); },
  async issueToken(){ throw new Error('No backend is configured.'); },
  async attendanceCount(){ return 0; },
  async meetingOpen(){ return false; },
  async myStampCount(){ return 0; },
  async openToday(){ return null; },
  async board(){ throw new Error('No backend is configured.'); },
  async deleteMeetingAndStamps(){ throw new Error('No backend is configured.'); },
};

const UnavailableAdapter = {
  name: 'unavailable',
  detail: null,
  async init(){ return this; },
  async currentSession(){ return null; },
};
['signIn','signUp','signOut','listMeetings','createMeeting','deleteMeeting','listAttendance',
 'listRewardClaims','listHandovers','handOverReward','undoHandOver','addAttendance','claimReward','startAttendance',
 'endAttendance','issueToken','attendanceCount','meetingOpen','myStampCount','openToday','board',
 'deleteMeetingAndStamps'].forEach(fn => {
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
 'listRewardClaims','listHandovers','handOverReward','undoHandOver','addAttendance','claimReward','verifyCode',
 'startAttendance','endAttendance','issueToken','attendanceCount','meetingOpen','myStampCount','openToday','board',
 'deleteMeetingAndStamps'].forEach(fn => {
  Backend[fn] = function(...a){ return this.adapter[fn](...a); };
});
