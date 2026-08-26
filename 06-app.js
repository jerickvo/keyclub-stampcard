"use strict";
/* keystamp — router, interactions, boot
   Loaded in order by index.html. Order matters. */

/* ══════════════════════════════════════════════════════════════════
   12. NAVIGATION
   Five destinations. Record and Profile are back from v1, but only
   with figures the app actually holds — no invented officer titles, no
   membership status, no controls that do nothing. The one real setting,
   reduced motion, stays in the header where it is always reachable.
   ══════════════════════════════════════════════════════════════════ */

const MEMBER_NAV = [
  { id:'home',    label:'Home',    icon:'home',   ch:'01', title:'The Card'   },
  { id:'record',  label:'Record',  icon:'record', ch:'02', title:'The Record' },
  { id:'scan',    label:'Scan',    icon:'scan',   ch:'03', title:'The Scan'   },
  { id:'rewards', label:'Rewards', icon:'reward', ch:'04', title:'The Reward' },
  { id:'profile', label:'Member',  icon:'member', ch:'05', title:'The Member' },
];

const BOARD_NAV = [
  { id:'board',    label:'Club Tools', icon:'home',   ch:'01', title:'Club Tools' },
  { id:'bmeet',    label:'Meetings',   icon:'record', ch:'02', title:'Meetings'   },
  { id:'bcheckin', label:'Check-In',   icon:'scan',   ch:'03', title:'Check-In'   },
  { id:'bmembers', label:'Members',    icon:'member', ch:'04', title:'Members'    },
];

const navFor = () => (Store.isBoard ? BOARD_NAV : MEMBER_NAV);

const ROUTES = MEMBER_NAV.map(n => n.id)
  .concat(BOARD_NAV.map(n => n.id), 'auth');

/* ── AUTH GATE ─────────────────────────────────────────────────────
   One place decides whether a route may render. Signed out, every
   route resolves to 'auth'; signed in, 'auth' resolves away. Board
   tools additionally require the board role — and note this is a UX
   guard only: the real authorisation is the RLS policy on the server,
   which is what actually refuses a member's write. */
const AuthUI = {
  mode:'in', busy:false,

  setupNotice(){
    const st = Backend.status;
    if (st === 'live') return '';        /* normal operation says nothing */

    if (st === 'unavailable'){
      return `<div class="setupbox setupbox--warn">
        <p class="kicker">Backend connection failed</p>
        <p>Keystamp is configured but could not reach Supabase. This is not
           a problem with your username or password.</p>
        <p class="setupbox__hint">Check the connection and reload. If it keeps
           happening, tell a board member.</p>
      </div>`;
    }

    const why = (Backend.failure && Backend.failure.reason) || 'No Supabase project is connected.';
    return `<div class="setupbox">
      <p class="kicker">Setup needed</p>
      <p><b>${esc(why)}</b></p>
      <p class="setupbox__hint">Add the Supabase project URL and public anon key
        to the two <code>keystamp:supabase-*</code> meta tags in
        <code>dev.html</code>, then run <code>python3 build.py</code>.
        Full steps are in the README under "Connect Keystamp to Supabase".</p>
    </div>`;
  },
};

const BOARD_ROUTES = BOARD_NAV.map(n => n.id);

function gate(id){
  if (!Store.ready) return id;
  if (!Store.signedIn) return 'auth';
  if (!Store.isBoard){
    /* a member never reaches a board route, whatever the hash says */
    if (BOARD_ROUTES.includes(id)) return 'home';
    if (id === 'auth') return 'home';
    return id;
  }
  /* a board account lands in Club Tools rather than passing through the
     member spread on the way */
  if (!BOARD_ROUTES.includes(id)) return 'board';
  return id;
}

let current = 'home';
let navigating = false;
let booted = false;

function syncHash(id){
  try { if (location.hash !== '#/' + id) history.replaceState(null, '', '#/' + id); }
  catch (_) { /* sandboxed frames refuse History writes; `current` still rules */ }
}
function hashRoute(){
  try {
    const id = location.hash.replace('#/', '');
    return ROUTES.includes(id) ? id : 'home';
  } catch (_) { return 'home'; }
}

function paintBrand(){
  const el = $('#railBrand');
  if (!el) return;

  el.innerHTML = wordmark();
}

function paintNav(){
  const tabs = $('#tabs'), rail = $('#railNav');
  $$('.tab', tabs).forEach(el => el.remove());
  $$('.rail__link', rail).forEach(el => el.remove());

  navFor().forEach(n => {
    const cur = current === n.id ? ' aria-current="page"' : '';
    tabs.insertAdjacentHTML('beforeend',
      `<button class="tab" data-go="${n.id}"${cur}><span>${n.label}</span></button>`);
    rail.insertAdjacentHTML('beforeend',
      `<button class="rail__link" data-go="${n.id}"${cur}>${ICON[n.icon]}<span>${n.label}</span></button>`);
  });

  requestAnimationFrame(placeIndicators);
}

let indRaf = 0;
function placeIndicators(){
  Motion.indicator($('#tabsInd'), $('#tabs .tab[aria-current]'), 'x');
  Motion.indicator($('#railInd'), $('#railNav .rail__link[aria-current]'), 'y');
}

async function go(id, opts = {}){
  if (opts === true) opts = { instant:true };   /* legacy boolean form */
  if (!ROUTES.includes(id)) id = 'home';
  id = gate(id);
  if (navigating) return;
  if (current === 'scan' && id !== 'scan') Scanner.stop();

  const view = $('#view');
  const render = () => {
    current = id;
    syncHash(id);
    Motion.settle(view);          /* identity in anime's cache too, or a
                                     later cut-push resurrects a stale skew */
    Reveal.clear();
    document.documentElement.dataset.screen = id; /* CSS lays out each spread by name */
    /* One surface for the whole app: warm paper. Black is manga ink --
       spotted blacks, panel frames, active states, the scanner border --
       and is never used as a page-level theme. */
    view.innerHTML = Views[id]();
    paintNav();
    try { scrollTo(0, 0); } catch (_) {}
    afterRender(id);
    view.focus({ preventScroll:true });
  };

  /* The outgoing page stands untouched until the ink sheets cover it;
     the swap happens under full cover, so there is never a blank or a
     half-faded midpoint. opts.instant renders directly — used when a
     covering sequence (welcome, the sign-out wall) is already up. */
  if (view.firstChild && booted && !opts.instant && !Motion.off){
    navigating = true;
    await FX.pageCut(() => { render(); FX.slamType(view, 40); });
    navigating = false;
  } else {
    render();
  }
}

const seenUnlocked = new Set();

/* purely visual — safe to replay, no side effects */
function playViewIntro(id){
  if (id === 'home'){
    const p = Rules.progress();
    Motion.countUp($('#heroNum'), p.total);

    setTimeout(() => FX.sealReveal($('.hero__ring'), { dur:620, spin:-20 }), 220);
    FX.sealGrid($('#seals'));

    if (pendingCell >= 0){
      const cell = $$('#seals .seal')[pendingCell];
      pendingCell = -1;
      if (cell && cell.dataset.seal === 'set') FX.stampLand(cell);
    }
  }

  if (id === 'rewards'){
    /* the unlock plays once per reward per session, not on every visit.
       The slot-array strike went with the arrays: each tier used to
       redraw the whole card as its own progress bar, and the page shows
       one scale for all three now. */
    $$('[data-reward]').forEach(row => {
      if (!row.classList.contains('tier--ready')) return;
      const rid = row.dataset.reward;
      if (seenUnlocked.has(rid)) return;
      seenUnlocked.add(rid);
      setTimeout(() => FX.rewardUnlock(row), 420);
    });
  }

  if (id === 'profile'){
    const seals = $$('.who__seal');
    seals.forEach(s => FX.sealReveal(s, { dur:700, spin:-24, delay:180 }));
  }
}

function afterRender(id){
  if (booted) playViewIntro(id);

  if (id === 'auth') AuthUI.busy = false;
  if (id === 'scan'){ paintDemoHint(); Scanner.start(); }
  if (BOARD_ROUTES.includes(id)){ loadBoard(); }
  else { clearInterval(boardTimer); clearInterval(countTimer); }
}

/* The demo hint is gone. It printed the live attendance code onto the
   member's own Scan screen, which is exactly the secret the Phase 3
   design exists to keep on the server. There is no supported way to
   display a production token as text. */
function paintDemoHint(){
  const box = $('#demoHint');
  if (box){ box.hidden = true; box.innerHTML = ''; }
}

function authErr(msg){
  const box = $('#authErr');
  if (!box) return;
  box.hidden = !msg;
  box.textContent = msg || '';
}

function authBusy(on, label){
  AuthUI.busy = on;
  const btn = $('#authGo');
  if (!btn) return;
  btn.disabled = on;
  btn.setAttribute('aria-busy', String(on));
  btn.textContent = on ? label : (AuthUI.mode === 'up' ? 'Create account' : 'Sign in');
}

let bqTimer = null;
document.addEventListener('input', e => {
  if (e.target.id === 'bq'){
    /* debounced so typing a username is one query, not one per key */
    clearTimeout(bqTimer);
    const v = e.target.value;
    bqTimer = setTimeout(() => boardGoto({ q:v, page:1 }), 300);
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'bsort') boardGoto({ sort:e.target.value, page:1 });
});

/* ── CREATE MEETING ────────────────────────────────────────────────
   Client validation exists to give a useful message, not to enforce
   the rule: the Wednesday CHECK, the start<end CHECK and the unique
   meeting_number all live in the database and remain the authority. */
function to12h(hhmm){
  const [h, m] = String(hhmm).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ap}`;
}

document.addEventListener('submit', async e => {
  /* Keystamp never wants a native form submission: every form here is
     handled in JavaScript, and a native submit navigates the page away
     (and on file:// destroys the app entirely). Prevented up front,
     before any branch, so a form that is re-rendered mid-interaction
     cannot slip past the checks below and take the page with it. */
  if (e.target && e.target.tagName === 'FORM') e.preventDefault();

  const mf = e.target.closest('#meetingForm');
  if (mf){
    e.preventDefault();
    const err = $('#mErr');
    const show = msg => { if (err){ err.hidden = !msg; err.textContent = msg || ''; } };
    const btn = $('#mGo');

    const no    = Number($('#mNo').value);
    const date  = $('#mDate').value;
    const start = $('#mStart').value;
    const end   = $('#mEnd').value;

    BoardUI.form = { no:$('#mNo').value, date, start, end };

    if (!no || no < 1)  return show('Meeting number is required.');
    if (!date)          return show('Meeting date is required.');
    /* T12:00:00 keeps the parse in local noon so a timezone shift
       cannot slide the date onto Tuesday or Thursday */
    if (new Date(date + 'T12:00:00').getDay() !== 3)
      return show('Meeting date must be Wednesday.');
    if (!start || !end) return show('Start and end time are required.');
    if (start >= end)   return show('End time must be after the start time.');

    show(''); btn.disabled = true; btn.textContent = 'Creating…';
    try {
      await Backend.createMeeting({ no, date, startTime:to12h(start), endTime:to12h(end) });
      BoardUI.form = null;
      toast({ key:'board', title:`GM ${pad(no)} created`, detail:'It is now in the schedule.' });
      boardGoto({ tab:'meetings' });
    } catch (ex){
      const dupe = /duplicate|23505|already exists|unique/i.test(String(ex.message || ''));
      show(dupe ? 'A meeting with that number already exists.'
                : 'Could not create that meeting. Check the details and try again.');
      btn.disabled = false; btn.textContent = 'Create meeting';
    }
    return;
  }

  const form = e.target.closest('#authForm');
  if (!form) return;
  e.preventDefault();
  if (AuthUI.busy) return;

  const username = ($('#authUser').value || '').trim();
  const password = $('#authPass').value || '';
  const confirm  = $('#authPass2') ? $('#authPass2').value : password;
  const up = AuthUI.mode === 'up';

  authErr('');
  authBusy(true, up ? 'Creating…' : 'Signing in…');
  try {
    if (up) await Store.signUp(username, password, confirm);
    else    await Store.signIn(username, password);
    /* the ink panel mounts first; the home render waits two frames so
       the page beneath can never visibly change before the panel is
       actually on screen */
    FX.welcomeCut(up ? 'Joined' : 'Welcome');
    if (Motion.off){ go('home', { instant:true }); }
    else requestAnimationFrame(() => requestAnimationFrame(() => go('home', { instant:true })));
  } catch (err){
    authErr(err && err.message ? err.message : 'Something went wrong. Try again.');
    authBusy(false);
    const pw = $('#authPass'); if (pw) { pw.value = ''; pw.focus(); }
  }
});

document.addEventListener('click', e => {
  /* ── board ── */
  const btab = e.target.closest('[data-btab]');
  if (btab){

    const toRoute = { club:'board', meetings:'bmeet', session:'bcheckin', progress:'bmembers' };
    Object.assign(BoardUI, { memberDetail:null, meetingDetail:null, page:1 });
    go(toRoute[btab.dataset.btab] || 'board');
    return;
  }
  const bmember = e.target.closest('[data-bmember]');
  if (bmember){
    boardGoto({ memberDetail:'pending', meetingDetail:null, pendingId:bmember.dataset.bmember });
    return;
  }
  const bmeeting = e.target.closest('[data-bmeeting]');
  if (bmeeting){
    boardGoto({ meetingDetail:'pending', memberDetail:null, pendingId:bmeeting.dataset.bmeeting });
    return;
  }
  const bconfirm = e.target.closest('[data-bconfirm]');
  if (bconfirm){
    boardGoto({ confirmDelete:bconfirm.dataset.bconfirm, deleteNote:null });
    return;
  }
  const bcancel = e.target.closest('[data-bcancel]');
  if (bcancel){ boardGoto({ confirmDelete:null }); return; }

  const bdelete = e.target.closest('[data-bdelete]');
  if (bdelete){
    const id = bdelete.dataset.bdelete;
    bdelete.disabled = true;
    Backend.deleteMeeting(id)
      .then(res => {
        /* the meeting the QR screen was pointed at may have just gone */
        if (boardMeeting === id) boardMeeting = null;
        boardGoto({ confirmDelete:null,
                    deleteNote: res && res.ok ? null : (res && res.code) || 'SERVER_ERROR',
                    meetings:null, meetingDetail:null });
      })
      .catch(() => boardGoto({ confirmDelete:null, deleteNote:'SERVER_ERROR' }));
    return;
  }

  const bback = e.target.closest('[data-bback]');
  if (bback){ boardGoto({ memberDetail:null, meetingDetail:null }); return; }
  const bpage = e.target.closest('[data-bpage]');
  if (bpage){ boardGoto({ page:Number(bpage.dataset.bpage) || 1 }); return; }
  const reload = e.target.closest('[data-reload]');
  if (reload){
    reload.disabled = true; reload.textContent = 'Retrying…';
    Store.hydrate().then(() => go(current, { instant:true }));
    return;
  }

  const breload = e.target.closest('[data-breload]');
  if (breload){ loadBoard(); return; }
  const bpick = e.target.closest('[data-bpick]');
  if (bpick){ boardMeeting = bpick.dataset.bpick; loadBoard(); return; }

  const bstart = e.target.closest('[data-bstart]');
  if (bstart){
    bstart.disabled = true; bstart.textContent = 'Starting…';
    Backend.startAttendance(bstart.dataset.bstart)
      .then(() => { boardMeeting = bstart.dataset.bstart; loadBoard(); })
      .catch(() => { bstart.disabled = false; bstart.textContent = 'Start attendance';
        toast({ key:'board', bad:true, title:'Could not start',
                detail:'Attendance did not open. Check the connection and try again.' }); });
    return;
  }
  const bend = e.target.closest('[data-bend]');
  if (bend){
    bend.disabled = true; bend.textContent = 'Ending…';
    Backend.endAttendance(bend.dataset.bend)
      .then(() => { clearInterval(boardTimer); clearInterval(countTimer); loadBoard(); })
      .catch(() => { bend.disabled = false; bend.textContent = 'End attendance';
        toast({ key:'board', bad:true, title:'Could not end',
                detail:'Attendance is still open. Try again.' }); });
    return;
  }

  const swap = e.target.closest('#authSwap');
  if (swap){
    AuthUI.mode = AuthUI.mode === 'up' ? 'in' : 'up';
    go('auth');
    return;
  }

  const out = e.target.closest('[data-signout]');
  if (out){
    /* the wall freezes the CURRENT page first; only then does the real
       sign-out (and the auth render) happen, invisibly beneath it */
    FX.waffleOut({
      swap: () => Store.signOut().then(() => {
        AuthUI.mode = 'in';       /* whoever signs in next starts at Sign in,
                                     not at the last account's Create form */
        toast({ key:'auth', title:'Signed out' });
        go('auth', { instant:true });
      }),
      fail: () => toast({ key:'auth', bad:true, title:'Could not sign out',
                          detail:'Check your connection and try again.' }),
    });
    return;
  }

  const motion = e.target.closest('#motionBtn');
  if (motion){
    Motion.forced = !Motion.forced;
    Motion.apply?.();
    paintMotionBtn();
    toast({ key:'motion',
            title:Motion.forced ? 'Reduced motion on' : 'Reduced motion off',
            detail:Motion.forced ? 'Cuts, energy and background motion are off.'
                                 : 'Animations are back on.' });
    return;
  }

  const nav = e.target.closest('[data-go]');
  if (nav){ go(nav.dataset.go); return; }

  const claim = e.target.closest('[data-claim]');
  if (claim){
    Store.claimReward(claim.dataset.claim).then(r => {
      FX.impactFrame({ word:'Claimed', angle:-24 });
      setTimeout(() => {
        toast({ key:'claim', title:`${r.name} claimed`,
                detail:'Show this screen to a board member to pick it up.' });
        go('rewards');
      }, 220);
    }).catch(() => toast({ key:'claim', bad:true, title:'Could not claim',
        detail:'That reward was not saved. Check your connection and try again.' }));
    return;
  }

  const go2 = e.target.closest('#manualGo');
  if (go2){
    const input = $('#manualInput');
    const val = (input && input.value || '').trim();
    if (!val){
      toast({ key:'scan', bad:true, title:'Enter a code',
              detail:'Type the code a board member gives you.' });
      return;
    }
    submitSeal(val, false);
    return;
  }
});

/* ── BOARD DATA ────────────────────────────────────────────────────
   Fetches only what the visible pane needs, then re-renders that pane
   in place rather than re-running the whole route — so switching tabs
   does not replay the page-cut transition on every click. */
async function loadBoard(){
  if (!Store.isBoard) return;
  const pane = () => $('#boardPane');
  BoardUI.error = null;
  BoardUI.loading = true;
  if (pane()) pane().innerHTML = BoardUI.pane();

  try {
    if (BoardUI.memberDetail === 'pending'){
      BoardUI.memberDetail = await Backend.board('member', { id:BoardUI.pendingId });
    } else if (BoardUI.meetingDetail === 'pending'){
      BoardUI.meetingDetail = await Backend.board('meeting', { id:BoardUI.pendingId });
    } else if (BoardUI.tab === 'club'){
      BoardUI.overview = await Backend.board('overview');
    } else if (BoardUI.tab === 'progress'){
      /* both, in parallel: the milestone counts come from the overview
         and the roster from the members query, and the pane shows them
         on one screen. Either failing fails the pane — a half-loaded
         progress view would show real milestones over an empty roster
         and read as "nobody is in the club". */
      const [ov, mem] = await Promise.all([
        Backend.board('overview'),
        Backend.board('members', { q:BoardUI.q, sort:BoardUI.sort, page:BoardUI.page }),
      ]);
      BoardUI.overview = ov; BoardUI.members = mem;
    } else {
      BoardUI.meetings = await Backend.board('meetings');
    }
  } catch (err){
    BoardUI.error = String(err.message || 'SERVER_ERROR');
  }

  BoardUI.loading = false;
  if (pane()){
    pane().innerHTML = BoardUI.pane();
  }
  /* the QR and the live count only exist on the session pane */
  if (BoardUI.tab === 'session' && !BoardUI.error && $('#qrBox')){
    paintBoard();
    paintAttendanceCount(boardMeeting);
  } else {
    clearInterval(boardTimer); clearInterval(countTimer);
  }
}

function boardGoto(next){
  Object.assign(BoardUI, next);
  loadBoard();
}

function paintMotionBtn(){
  const b = $('#motionBtn');
  b.setAttribute('aria-pressed', String(Motion.forced));
  b.setAttribute('aria-label', Motion.forced ? 'Reduced motion is on. Turn animations back on.'
                                             : 'Reduced motion is off. Turn animations off.');
  /* the chip says what state it is IN, not a bare noun: an unlabeled
     "MOTION" chip read as debug furniture */
  b.innerHTML = (Motion.forced ? ICON.still : ICON.waves) +
                `<span>Motion ${Motion.forced ? 'off' : 'on'}</span>`;
}

addEventListener('hashchange', () => { const id = hashRoute(); if (id !== current) go(id); });
/* both timers, not just one: countTimer polls the attendance count and
   was left running on pagehide, so a backgrounded tab kept issuing
   requests against a page on its way out. */
addEventListener('pagehide', () => {
  Scanner.stop(); clearInterval(boardTimer); clearInterval(countTimer);
});
addEventListener('resize', () => {
  cancelAnimationFrame(indRaf);
  indRaf = requestAnimationFrame(placeIndicators);
});

/* ══════════════════════════════════════════════════════════════════
   14. BOOT
   ══════════════════════════════════════════════════════════════════ */
/* anime.js is a plain script loaded above this one, so by the time we get
   here it is either present or it failed — either way we can start now. */

(async () => {
  await Backend.init();
  await Store.hydrate();
  /* re-render whenever the snapshot changes (a check-in, a claim, a
     sign-in) so views never read a stale count */
  /* a data refresh re-renders in place — it is not a navigation, so it
     never draws the page-cut */
  Store.onChange(() => { if (current) go(current, { instant:true }); paintIdentity(); paintBrand(); });

  paintBrand();
  $('#barBrand').innerHTML  = wordmark();
  paintIdentity();
  paintMotionBtn();
  buildArena();
  applyBackdrop();
  go(hashRoute());                       /* renders behind the boot curtain */
})();

/* The signed-in block is painted from the real session. With no
   session it says so instead of naming a hardcoded member, and Board
   tools are only offered to accounts the backend marks as board. */
function paintIdentity(){
  const foot = $('#railFoot');
  if (!foot) return;
  /* shown only to board accounts. Hiding it is convenience; the gate
     in go() and the role check inside board-data are the enforcement. */
  const boardBtn = '';
  foot.innerHTML = Store.signedIn
    ? `<p class="rail__who">${esc(Store.user.name)}</p>
       <p class="muted rail__role">${Store.isBoard ? 'Board' : 'Member'}</p>
       ${boardBtn}
       <button class="link" data-signout style="margin-top:10px">Sign out</button>`
    : `<p class="kicker">Not signed in</p>
       <p class="muted" style="margin-top:6px;font-size:12.5px">Sign in to see your record.</p>`;
}
  try {
    FX.loadingSequence(() => {
      booted = true;
      FX.pageEntrance($('#view'));
      playViewIntro(current);
    });
  } catch (_) {
    booted = true;
    $('#boot')?.classList.add('is-done');
  }
  try {
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => Motion.onChange?.());
  } catch (_) {}

