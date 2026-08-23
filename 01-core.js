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
   THE VORTEX — Keystamp's seal

   Six logarithmic-spiral arms turning out of a solid centre into a
   closed ring. It replaces the hexagon-and-key sigil everywhere a
   seal is drawn: the stamp slots, the reticle, the verdict, the boot
   screen, the credential band and the empty states.

   Drawn as geometry rather than dropped in as an image, so it takes
   the ink or paper of whatever it lands on, stays sharp at any size,
   and can be struck stroke by stroke by the FX layer the way the old
   sigil was.

   The stroke weight is set INLINE on purpose. Every place a seal is
   used already carries a rule pinning `stroke-width:2` with
   `vector-effect:non-scaling-stroke` — sized for a thin technical
   sigil. This mark is a bold one: it has to scale with the glyph, so
   it overrides both, and only an inline style beats a stylesheet. */
const VX_ARMS = [
  'M50.00 50.00 L52.40 50.00 L52.62 50.28 L52.82 50.61 L53.00 51.00 L53.15 51.44 L53.26 51.93 L53.33 52.49 L53.34 53.10 L53.28 53.77 L53.13 54.49 L52.89 55.26 L52.53 56.07 L52.05 56.91 L51.42 57.77 L50.64 58.63 L49.69 59.48 L48.55 60.29 L47.22 61.04 L45.68 61.71 L43.92 62.26 L41.95 62.64 L39.74 62.84 L37.32 62.79 L34.69 62.45 L31.86 61.78 L28.86 60.71 L25.71 59.20 L22.46 57.19 L19.15 54.61 L15.84 51.42 L12.61 47.55 L9.55 42.96 L6.74 37.60',
  'M50.00 50.00 L51.20 52.08 L51.06 52.41 L50.88 52.75 L50.64 53.09 L50.33 53.45 L49.96 53.79 L49.51 54.13 L48.98 54.44 L48.37 54.72 L47.68 54.96 L46.89 55.13 L46.01 55.22 L45.04 55.23 L43.99 55.11 L42.85 54.87 L41.64 54.47 L40.36 53.89 L39.05 53.12 L37.70 52.11 L36.35 50.86 L35.02 49.35 L33.76 47.54 L32.59 45.42 L31.56 42.97 L30.73 40.18 L30.15 37.05 L29.89 33.57 L30.00 29.74 L30.58 25.59 L31.69 21.13 L33.43 16.40 L35.87 11.45 L39.11 6.34',
  'M50.00 50.00 L48.80 52.08 L48.45 52.12 L48.06 52.13 L47.64 52.10 L47.18 52.01 L46.69 51.86 L46.18 51.64 L45.65 51.34 L45.10 50.95 L44.55 50.47 L44.00 49.87 L43.48 49.16 L42.99 48.32 L42.56 47.35 L42.21 46.24 L41.95 44.99 L41.81 43.60 L41.82 42.07 L42.02 40.40 L42.43 38.61 L43.08 36.70 L44.01 34.70 L45.26 32.63 L46.87 30.52 L48.87 28.40 L51.29 26.34 L54.17 24.36 L57.55 22.55 L61.43 20.98 L65.85 19.71 L70.82 18.85 L76.32 18.49 L82.37 18.74',
  'M50.00 50.00 L47.60 50.00 L47.38 49.72 L47.18 49.39 L47.00 49.00 L46.85 48.56 L46.74 48.07 L46.67 47.51 L46.66 46.90 L46.72 46.23 L46.87 45.51 L47.11 44.74 L47.47 43.93 L47.95 43.09 L48.58 42.23 L49.36 41.37 L50.31 40.52 L51.45 39.71 L52.78 38.96 L54.32 38.29 L56.08 37.74 L58.05 37.36 L60.26 37.16 L62.68 37.21 L65.31 37.55 L68.14 38.22 L71.14 39.29 L74.29 40.80 L77.54 42.81 L80.85 45.39 L84.16 48.58 L87.39 52.45 L90.45 57.04 L93.26 62.40',
  'M50.00 50.00 L48.80 47.92 L48.94 47.59 L49.12 47.25 L49.36 46.91 L49.67 46.55 L50.04 46.21 L50.49 45.87 L51.02 45.56 L51.63 45.28 L52.32 45.04 L53.11 44.87 L53.99 44.78 L54.96 44.77 L56.01 44.89 L57.15 45.13 L58.36 45.53 L59.64 46.11 L60.95 46.88 L62.30 47.89 L63.65 49.14 L64.98 50.65 L66.24 52.46 L67.41 54.58 L68.44 57.03 L69.27 59.82 L69.85 62.95 L70.11 66.43 L70.00 70.26 L69.42 74.41 L68.31 78.87 L66.57 83.60 L64.13 88.55 L60.89 93.66',
  'M50.00 50.00 L51.20 47.92 L51.55 47.88 L51.94 47.87 L52.36 47.90 L52.82 47.99 L53.31 48.14 L53.82 48.36 L54.35 48.66 L54.90 49.05 L55.45 49.53 L56.00 50.13 L56.52 50.84 L57.01 51.68 L57.44 52.65 L57.79 53.76 L58.05 55.01 L58.19 56.40 L58.18 57.93 L57.98 59.60 L57.57 61.39 L56.92 63.30 L55.99 65.30 L54.74 67.37 L53.13 69.48 L51.13 71.60 L48.71 73.66 L45.83 75.64 L42.45 77.45 L38.57 79.02 L34.15 80.29 L29.18 81.15 L23.68 81.51 L17.63 81.26'
];

/* w is the arm weight in viewBox units.

   There is no separate centre element. Every arm starts AT the centre
   point and spirals out, so the six strokes overlap there and BUILD
   the core — which is how
   the mark is actually constructed, and it means the core can never
   be a different colour from the arms or leave a seam between itself
   and them. Two earlier attempts had that seam: a circle stroked
   wider than twice its radius leaves a hairline at the exact centre
   that reads as a pinhole punched through the core, and a
   zero-length capped path did not paint at all. */
function vortex(w, ring){
  const S = `style="fill:none;vector-effect:none;stroke-width:${w};stroke-linecap:butt"`;
  return VX_ARMS.map(d => `<path d="${d}" ${S}/>`).join('')
    + (ring ? `<circle cx="50" cy="50" r="45" ${S}/>` : '')
    + '';
}

/* level 1 slot glyph · 2 medium · 3 full sigil · 4 the arena structure */
function seal(level = 3){
  if (level === 1) return vortex(8, false);
  if (level === 2) return vortex(7, true);
  if (level === 3) return `${vortex(6, true)}
    <circle cx="50" cy="50" r="49"/>${ticks(24, 46.5, 48.5, 6)}`;
  return `${vortex(5.5, true)}
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
