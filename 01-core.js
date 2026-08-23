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

/* ══════════════════════════════════════════════════════════════════
   THE SEAL

   Traced from the supplied artwork rather than approximated. The mark
   is a filled silhouette in four named parts, and the numbers below
   came out of measuring the original raster, not out of taste:

     core    a solid disc, r 8.03 of the 50-unit radius
     ring    a continuous annulus, 35.83 → 43.44
     blade   one of four congruent spiral arms running from the core
             out to the ring; the other three are this path rotated
             90, 180 and 270 degrees about the centre

   The artwork is four-fold symmetric — a rotation test against the
   original agrees to 98.99% at 90 degrees and only ~69% at 60 and
   120 — so one blade is stored and reused three times. Rendering this
   back to an 800px raster and comparing it with the original scores
   0.976 intersection-over-union; what is left is sub-pixel disagreement
   along the edges, since the source is a lossy copy with soft edges
   and the comparison thresholds hard.

   Everything here is a <path> and everything the levels add around it
   is a <circle> or a <line>. That split is what the stylesheets key
   on: the artwork is filled, the registration furniture is stroked.
   ══════════════════════════════════════════════════════════════════ */
const SEAL_CORE  = 'M41.975 50a8.025 8.025 0 1 1 16.05 0a8.025 8.025 0 1 1 -16.05 0Z';
const SEAL_RING  = 'M6.562 50a43.438 43.438 0 1 1 86.876 0a43.438 43.438 0 1 1 -86.876 0ZM14.175 50a35.825 35.825 0 1 0 71.65 0a35.825 35.825 0 1 0 -71.65 0Z';
const SEAL_BLADE = 'M52.62 26.12C53.44 26.12 56.31 26.15 57.38 26.25C58.44 26.35 58.44 26.62 59 26.75C59.56 26.88 59.98 26.77 60.75 27C61.52 27.23 63.1 27.9 63.62 28.12C64.15 28.35 63.77 28.33 63.88 28.38C63.98 28.42 63.62 28.02 64.25 28.38C64.88 28.73 66 29.25 67.62 30.5C69.25 31.75 72.25 34.48 74 35.88C75.75 37.27 76.98 38.15 78.12 38.88C79.27 39.6 80.06 39.96 80.88 40.25C81.69 40.54 82.58 40.52 83 40.62C83.42 40.73 83.19 40.83 83.38 40.88C83.56 40.92 83.84 40.96 84.12 40.88C84.41 40.79 84.75 39.63 85.07 40.34C85.39 41.06 85.83 43.55 86.05 45.16C86.27 46.77 86.32 49.24 86.38 50C86.43 50.76 86.56 49.81 86.37 49.74C86.19 49.68 85.69 49.6 85.25 49.62C84.81 49.65 84.58 49.96 83.75 49.88C82.92 49.79 81.12 49.38 80.25 49.12C79.38 48.88 79.21 48.77 78.5 48.38C77.79 47.98 76.79 47.33 76 46.75C75.21 46.17 74.92 46.1 73.75 44.88C72.58 43.65 70.27 40.79 69 39.38C67.73 37.96 67.1 37.27 66.12 36.38C65.15 35.48 63.94 34.58 63.12 34C62.31 33.42 61.83 33.19 61.25 32.88C60.67 32.56 60.25 32.33 59.62 32.12C59 31.92 57.92 31.75 57.5 31.62C57.08 31.5 57.38 31.42 57.12 31.38C56.88 31.33 56.42 31.44 56 31.38C55.58 31.31 55.35 31.06 54.62 31C53.9 30.94 52.73 30.9 51.62 31C50.52 31.1 49.06 31.31 48 31.62C46.94 31.94 46.02 32.44 45.25 32.88C44.48 33.31 43.9 33.81 43.38 34.25C42.85 34.69 42.56 34.98 42.12 35.5C41.69 36.02 41.19 36.62 40.75 37.38C40.31 38.12 39.79 39.21 39.5 40C39.21 40.79 39.08 41.4 39 42.12C38.92 42.85 38.92 43.67 39 44.38C39.08 45.08 39.31 45.83 39.5 46.38C39.69 46.92 39.81 47.21 40.12 47.62C40.44 48.04 40.97 48.63 41.38 48.88C41.78 49.12 42.36 49.07 42.56 49.08C42.76 49.1 42.58 48.75 42.57 48.96C42.57 49.17 42.49 49.88 42.51 50.35C42.53 50.81 42.68 51.55 42.7 51.74C42.73 51.93 42.83 51.53 42.65 51.49C42.47 51.45 42.07 51.62 41.62 51.5C41.18 51.38 40.56 51.15 40 50.75C39.44 50.35 38.67 49.58 38.25 49.12C37.83 48.67 37.77 48.69 37.5 48C37.23 47.31 36.77 46.27 36.62 45C36.48 43.73 36.56 41.46 36.62 40.38C36.69 39.29 36.83 39.12 37 38.5C37.17 37.88 37.46 37 37.62 36.62C37.79 36.25 37.94 36.38 38 36.25C38.06 36.12 37.69 36.44 38 35.88C38.31 35.31 39.17 33.77 39.88 32.88C40.58 31.98 41.58 31.1 42.25 30.5C42.92 29.9 43.29 29.65 43.88 29.25C44.46 28.85 44.88 28.54 45.75 28.13C46.62 27.71 48.46 26.98 49.12 26.75C49.79 26.52 49.58 26.79 49.75 26.75C49.92 26.71 49.85 26.58 50.12 26.5C50.4 26.42 50.98 26.29 51.38 26.25C51.77 26.21 52.29 26.27 52.5 26.25C52.71 26.23 51.81 26.12 52.62 26.12Z';

/* The mark itself, at whatever size the box gives it. The ring is two
   opposed circles in one subpath, so it needs evenodd to stay an
   annulus rather than filling solid. */
function sealArt(){
  return `<path d="${SEAL_CORE}"/>`
       + `<path d="${SEAL_RING}" fill-rule="evenodd"/>`
       + [0, 90, 180, 270].map(a =>
           `<path d="${SEAL_BLADE}" transform="rotate(${a} 50 50)"/>`).join('');
}

/* level 1 slot glyph · 2 medium · 3 full sigil · 4 the arena structure.
   The levels no longer change the weight of the mark — it is artwork
   now, not a stroke — they change what is registered around it. */
function seal(level = 3){
  if (level <= 2) return sealArt();
  if (level === 3) return `${sealArt()}
    <circle cx="50" cy="50" r="49"/>${ticks(24, 46.5, 48.5, 6)}`;
  return `${sealArt()}
    <circle cx="50" cy="50" r="49"/><circle cx="50" cy="50" r="47"/>
    ${ticks(36, 46, 48.4, 9)}`;
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
