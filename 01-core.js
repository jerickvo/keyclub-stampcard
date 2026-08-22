"use strict";
/* keystamp — assets, the seal, the meeting store, the schedule, QR rules
   Loaded in order by index.html. Order matters. */

/* ══════════════════════════════════════════════════════════════════
   1. THE SEAL — one original mark, drawn at four levels of detail.

   Everything in this app is the same symbol at a different scale: the
   empty stamp slot, the scanner core, the verdict sigil, the sealed
   reward, the boot frame, the structure in the background. That
   repetition is the whole identity system. It is built from a hexagon,
   a ticked ring and a key device (triangle, bar, point) — no existing
   anime symbol is referenced.
   ══════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════
   0. ASSETS — every replaceable image in one object.

   Drop your files into the folders below and the UI picks them up. If
   a file is missing the app falls back to the built-in SVG mark, so
   nothing breaks while you are still gathering artwork.

     assets/logo/keystamp-logo.png    the header + boot mark
     assets/logo/school-seal.png      shown on the member screen
     assets/headers/home-header.jpg   banner across the top of Home
     assets/backgrounds/paper.png     tiled texture behind everything
     assets/icons/favicon.png         browser tab icon (see <head>)

   Set a value to null to keep the built-in vector version.
   ══════════════════════════════════════════════════════════════════ */
const ASSETS = {
  logo:       null,   /* e.g. 'assets/logo/keystamp-logo.png'   */
  schoolSeal: null,   /* e.g. 'assets/logo/school-seal.png'     */
  homeHeader: null,   /* e.g. 'assets/headers/home-header.jpg'  */
  background: null,   /* e.g. 'assets/backgrounds/paper.png'    */
};

/* used by the schedule and the store, both of which run on load */
const pad = n => String(n).padStart(2, '0');

const HEX = '50,16 79.4,33 79.4,67 50,84 20.6,67 20.6,33';

/* the key device on its own — legible down to 14px */
const KEY = `<path d="M50 29 68.5 64.5h-37Z"/><path d="M38.5 56.5h23"/><circle cx="50" cy="45.5" r="3.6"/>`;

function ticks(n, r1, r2, hotEvery){
  let out = '';
  for (let i = 0; i < n; i++){
    const a = (i * 360 / n - 90) * Math.PI / 180;
    const long = i % 3 === 0 ? r2 + 2.4 : r2;
    out += `<line class="${hotEvery && i % hotEvery === 0 ? 'r' : ''}"
      x1="${(50 + Math.cos(a) * r1).toFixed(2)}" y1="${(50 + Math.sin(a) * r1).toFixed(2)}"
      x2="${(50 + Math.cos(a) * long).toFixed(2)}" y2="${(50 + Math.sin(a) * long).toFixed(2)}"/>`;
  }
  return out;
}

/* level 1 slot glyph · 2 medium · 3 full sigil · 4 the arena structure */
function seal(level = 3){
  if (level === 1) return KEY;
  if (level === 2) return `<polygon points="${HEX}"/><circle cx="50" cy="50" r="45"/>${KEY}`;
  if (level === 3) return `
    <circle cx="50" cy="50" r="47"/><circle cx="50" cy="50" r="41" stroke-dasharray="2 6"/>
    <polygon points="${HEX}"/><circle cx="50" cy="50" r="24" class="r"/>
    ${KEY}${ticks(24, 41, 46, 6)}
    <path d="M50 1v6M50 93v6M1 50h6M93 50h6"/>`;
  return `
    <circle cx="50" cy="50" r="49"/><circle cx="50" cy="50" r="44"/>
    <circle cx="50" cy="50" r="36" stroke-dasharray="10 6"/>
    <circle cx="50" cy="50" r="21" class="r"/>
    <polygon points="${HEX}"/><polygon points="50,10 90,50 50,90 10,50"/>
    <path d="M50 4a46 46 0 0 1 39.8 23"/><path d="M50 96a46 46 0 0 1-39.8-23"/>
    ${ticks(36, 44, 47.5, 9)}`;
}

/* Geometric marks, not app icons.

   The set these replace was the standard tray — a house, a bookmark, a
   star, a person, a rounded padlock — drawn with round caps and round
   joins. That vocabulary is an operating system's, and it read as one
   however the rest of the page was set: soft terminals on a page where
   nothing else is soft, and a metaphor (house = home) where everything
   else is a label.

   These are drawn the way the rest of the system is drawn: 1.5px,
   butt caps, mitre joins, right angles and 45s, no radius anywhere. A
   line that ends, ends. */
const SVG = (b) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter" aria-hidden="true">${b}</svg>`;

const ICON = {
  /* the five below are the rail's, and the rail hides them in favour of
     its chapter numerals — kept as the fallback the markup still asks
     for, redrawn so the fallback is not the odd one out */
  home:   SVG('<path d="M3.5 11 12 4l8.5 7"/><path d="M6 11v9h12v-9"/><path d="M10 20v-5h4v5"/>'),
  record: SVG('<path d="M5 3.5h14v17l-7-3.5-7 3.5z"/><path d="M9 9h6M9 12.5h4"/>'),
  scan:   SVG('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><path d="M4 12h16"/>'),
  reward: SVG('<path d="M12 3 20 12l-8 9-8-9z"/><path d="M12 7.5 16 12l-4 4.5L8 12z"/>'),
  member: SVG('<path d="M8 4h8v7H8z"/><path d="M4.5 20.5v-3h15v3"/>'),

  /* a camera is a box with an aperture, drawn square */
  camera: SVG('<path d="M3 8h18v12H3z"/><path d="M8.5 8V5h7v3"/>'
            + '<path d="M12 10.5 15.5 14 12 17.5 8.5 14z"/>'),
  /* a lock is a bolt in a housing — a square shackle standing clear of
     the body, no bent wire and no radius */
  lock:   SVG('<path d="M4.5 11.5h15v9h-15z"/><path d="M8.5 11.5V5.5h7v6"/>'
            + '<path d="M12 14.5v3"/>'),
  /* the keypad is the dot grid the whole system is registered to.
     The dots are squares: with butt caps a zero-length segment paints
     nothing, which is how nine of them turned into nine smudges. */
  keypad: SVG('<path d="M3.5 8V4h4M16.5 4h4v4M20.5 16v4h-4M7.5 20h-4v-4"/>'
            + [8,12,16].flatMap(y => [7,11.5,16].map(x =>
                `<rect x="${x}" y="${y}" width="2" height="2" fill="currentColor" stroke="none"/>`
              )).join('')),
  /* AN UNSTRUCK SEAL. The empty state is not a question mark in a
     dashed circle — it is the stamp that has not landed yet: the
     silhouette present, the mark inside it missing. */
  blank:  SVG('<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/>'
            + '<path d="M12 7.5 16.5 12 12 16.5 7.5 12z" stroke-dasharray="1.6 3.4"/>'),
  /* an engineering arrow: a rule that terminates in a solid head */
  arrow:  SVG('<path d="M3.5 12h11"/><path d="M14 7.5 20.5 12 14 16.5z" fill="currentColor"/>'),
  /* motion on: a square wave. motion off: a rule between two stops. */
  waves:  SVG('<path d="M2.5 16h4v-8h5v8h5v-8h5"/>'),
  still:  SVG('<path d="M4 12h16"/><path d="M4 8v8M20 8v8"/>'),
};

/* A bracketed monospace token — the fault codes on the scanner's dead
   ends. `[ERR.CAM]` says the same thing a padlock glyph says and says
   it in the page's own voice, which is words in brackets, not pictures. */
const codeMark = (s) => `<span class="codemark" aria-hidden="true">${s}</span>`;

/* If ASSETS.logo is set, your image is used; otherwise this vector mark
   is drawn. Both render at the same size, so swapping is safe. */
const logoMark = (cls = 'mark__seal') => ASSETS.logo
  ? `<img class="${cls}" src="${ASSETS.logo}" alt="" aria-hidden="true">`
  : LOGO.replace('class="mark__seal"', `class="${cls}"`);

const LOGO = `
<svg class="mark__seal" viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <path d="M16 1.4 29.2 9v14L16 30.6 2.8 23V9Z" stroke="currentColor" stroke-width="1.2" opacity=".62"/>
  <path d="M16 4.6 26.4 10.5v11.8L16 28.2 5.6 22.3V10.5Z" stroke="currentColor" stroke-width=".7" opacity=".3"/>
  <path d="M12.2 10v12M12.2 16.4 19 10M12.2 15.6 19.4 22" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
</svg>`;

const wordmark = () => `<span class="mark">${logoMark()}<span class="mark__word">Key<b>stamp</b></span></span>`;

/* ══════════════════════════════════════════════════════════════════
   2. STORE — Key Club general meetings. Nothing invented beyond the
   sample data itself. Every read goes through a method, so swapping in
   Supabase touches this object and nothing else.
   ══════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════
   2a. SCHEDULE — every general meeting falls on a Wednesday, in the MPR.

   Dates are not typed in by hand anywhere. They are generated from one
   anchor Wednesday plus a fixed interval, and `wednesdayOf` snaps any
   date it is handed back to the Wednesday of that week. That means a
   future meeting cannot silently land on a Tuesday because someone
   mistyped a date or the interval changed.
   ══════════════════════════════════════════════════════════════════ */
/* Schedule keeps only its DATE MATHS. It is no longer a source of
   meetings — the board creates real meeting rows and the client reads
   them. What survives is the guarantee that any date the board tools
   propose lands on a Wednesday, which is a club rule, not sample data.
   `build()` and the ANCHOR/EVERY_DAYS generators are gone: the app no
   longer invents a season. */
const Schedule = {
  TIME: '3:15 PM',
  PLACE: 'MPR',              /* every meeting is held in the MPR */

  /* snap any date to the Wednesday of its own week */
  wednesdayOf(d){
    const out = new Date(d.getTime());
    out.setDate(out.getDate() + ((3 - out.getDay() + 7) % 7));   /* 3 = Wednesday */
    return out;
  },
  iso(d){
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
  /* the next Wednesday on or after today — used by the board tools */
  nextWednesday(from = new Date()){
    const d = new Date(from.getTime());
    d.setHours(12, 0, 0, 0);
    return this.iso(this.wednesdayOf(d));
  },
};

/* ══════════════════════════════════════════════════════════════════
   STORE — a read-through cache over Backend.

   The views render synchronously and there are a lot of them, so the
   read API is kept synchronous exactly as it was: every method below
   answers from `snap`, a snapshot hydrated from the backend. Writes
   are async because they are network calls, and they re-hydrate.

   What changed underneath:
     · `user` is null until a real session is loaded. There is no
       fallback identity — a signed-out build renders signed-out.
     · `meetings` and `scans` start EMPTY and are filled from the
       backend. Nothing is generated.
     · a stamp is created by the verify-attendance Edge Function. It
       writes through the backend and only then updates the snapshot.
   ══════════════════════════════════════════════════════════════════ */
const Store = {
  user: null,
  meetings: [],
  scans: [],
  rewards: REWARD_TIERS.map(r => ({ ...r, claimed:false })),
  ready: false,
  listeners: new Set(),

  onChange(fn){ this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit(){ this.listeners.forEach(fn => { try { fn(); } catch (_) {} }); },

  /* Pull everything this member is allowed to see. Called at boot and
     after any write. Failure leaves the snapshot empty rather than
     stale-but-wrong. */
  /* `loadError` is the difference between "you have no stamps" and
     "we could not find out how many stamps you have". Those used to be
     the same screen: every fetch below was `.catch(() => [])`, so a
     database outage rendered as 00/10 with an empty record — a member
     would reasonably conclude their attendance had been deleted. The
     failure is now carried, and the views say so instead of lying. */
  loadError: null,

  async hydrate(){
    let session = null;
    try {
      session = await Backend.currentSession();
    } catch (_){
      /* could not even determine who is signed in: say nothing about
         their data rather than guess */
      this.loadError = 'SESSION';
      this.ready = true; this.emit();
      return this;
    }

    this.user = session;
    if (!session){
      this.meetings = []; this.scans = [];
      this.rewards = REWARD_TIERS.map(r => ({ ...r, claimed:false }));
      this.loadError = null; this.ready = true; this.emit();
      return this;
    }

    const [meetings, scans, claims] = await Promise.all([
      Backend.listMeetings().then(v => v, () => null),
      Backend.listAttendance(session.id).then(v => v, () => null),
      Backend.listRewardClaims(session.id).then(v => v, () => null),
    ]);

    /* attendance is the one that must never be faked: stamps, record and
       rewards are all derived from it, so a failure there poisons three
       screens at once */
    if (scans === null || meetings === null || claims === null){
      this.loadError = 'DATA';
      this.ready = true; this.emit();
      return this;
    }

    this.meetings = meetings;
    this.scans = scans;
    this.rewards = REWARD_TIERS.map(r => ({ ...r, claimed:claims.includes(r.id) }));
    this.loadError = null;
    this.ready = true;
    this.emit();
    return this;
  },

  /* true when the snapshot cannot be trusted — views check this before
     rendering any figure derived from attendance */
  get failed(){ return this.loadError !== null; },

  get signedIn(){ return Boolean(this.user); },
  get role(){ return this.user ? this.user.role : null; },
  get isBoard(){ return this.role === 'board'; },

  /* ── auth: the only path in and out of a session ──────────────────
     Views call these; nothing else touches Supabase auth. Each one
     re-hydrates so the snapshot and the session can never disagree. */
  /* A backend problem and a wrong password are different failures and
     must not collapse into one message: telling a member their details
     are wrong when the server is down sends them to reset a password
     that was never the problem. */
  authGuard(){
    const st = Backend.status;
    if (st === 'unconfigured')
      throw new Error('Keystamp is not connected to a Supabase project yet.');
    if (st === 'unavailable')
      throw new Error('Keystamp cannot reach the server right now. Try again in a moment.');
  },

  async signIn(username, password){
    this.authGuard();
    const bad = Config.validateUsername(username) || Config.validatePassword(password);
    if (bad) throw new Error(bad);
    await Backend.signIn(username, password);
    await this.hydrate();
    return this.user;
  },
  async signUp(username, password, confirm){
    this.authGuard();
    const bad = Config.validateUsername(username)
             || Config.validatePassword(password)
             || (password !== confirm ? 'Passwords do not match.' : null);
    if (bad) throw new Error(bad);
    await Backend.signUp(username, password);
    await this.hydrate();
    return this.user;
  },
  async signOut(){
    await Backend.signOut();
    /* clear locally too, so a failed network call cannot leave a
       signed-out user looking signed in */
    this.user = null; this.meetings = []; this.scans = [];
    this.rewards = REWARD_TIERS.map(r => ({ ...r, claimed:false }));
    await this.hydrate();
  },

  /* ── reads (unchanged signatures) ── */
  meeting(id){ return this.meetings.find(m => m.id === id) || null; },
  totalStamps(){ return this.scans.length; },
  attended(id){ return this.scans.some(s => s.meetingId === id); },
  scanFor(id){ return this.scans.find(s => s.meetingId === id) || null; },
  openMeeting(){ return this.meetings.find(m => m.open) || null; },
  nextMeeting(){ return [...this.meetings].reverse().find(m => m.upcoming) || null; },
  pastMeetings(){ return this.meetings.filter(m => !m.upcoming && !m.open); },
  heldMeetings(){ return this.meetings.filter(m => !m.upcoming); },
  rewardsUnlocked(){ const t = this.totalStamps(); return this.rewards.filter(r => t >= r.required).length; },
  attendanceRate(){
    const past = this.pastMeetings();
    if (!past.length) return 0;
    return Math.round(past.filter(m => this.attended(m.id)).length / past.length * 100);
  },
  state(m){
    if (m.upcoming) return 'upcoming';
    if (this.attended(m.id)) return 'set';
    return m.open ? 'open' : 'miss';
  },

  /* ── writes: real, and therefore async ──
     There is no recordScan() here any more. A stamp is created by the
     verify-attendance Edge Function and by nothing else; the client's
     part is to scan, submit, and re-read what the server decided. */
  async claimReward(id){
    if (!this.user) throw new Error('Not signed in.');
    await Backend.claimReward(this.user.id, id);
    await this.hydrate();
    return this.rewards.find(x => x.id === id) || null;
  },
};

/* ══════════════════════════════════════════════════════════════════
   QR ATTENDANCE — where verification lives now

   Nothing in this file can grant a stamp any more. The prototype
   verifier that used to sit here (an FNV hash over a secret compiled
   into this very file) has been deleted, not disabled: any secret the
   browser holds is a secret the member holds, so it could never be
   more than a demo.

   Production flow:

     board   → attendance-session Edge Function → signed token → QR
     member  → verify-attendance  Edge Function → attendance row

   The signing secret lives only in Edge Function environment
   variables. The browser sends the scanned string and is told yes or
   no; it cannot compute the answer itself. See
   supabase/functions/ for both functions.
   ══════════════════════════════════════════════════════════════════ */

/* Parsing is not security, so it stays on the client: it lets the
   scanner reject an unrelated QR code instantly instead of asking the
   server about a bus timetable. A payload that parses still proves
   nothing — only the server decides. */
const QRFormat = {
  SCHEME: 'keystamp://a/',
  looksLikeKeystamp(raw){
    const t = String(raw || '').trim();
    if (t.toLowerCase().startsWith(this.SCHEME)) return true;
    /* another app's deep link */
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return false;
    /* a manually typed code: opaque, server-checked */
    return /^[A-Za-z0-9_.\-]{12,}$/.test(t);
  },
};

/* Product rules — reward tiers and progress maths. No secrets, no
   crypto, safe on the client because none of it grants anything. */
const Rules = {
  TIERS: REWARD_TIERS.map(r => r.required),

  progress(){
    const total = Store.totalStamps();
    const next  = this.TIERS.find(t => total <= t) ?? null;
    const floor = next ? (this.TIERS.filter(t => t < next).pop() || 0) : this.TIERS[this.TIERS.length - 1];
    const span  = next ? next - floor : 10;
    return { total, next, floor, span, filled: next ? total - floor : span,
             remaining: next ? next - total : 0 };
  },
};
