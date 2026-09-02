"use strict";

const MEMBER_NAV = [
  { id:'home',    label:'Home',    icon:'home'   },
  { id:'record',  label:'Record',  icon:'record' },
  { id:'scan',    label:'Scan',    icon:'scan'   },
  { id:'rewards', label:'Rewards', icon:'reward' },
  { id:'profile', label:'Member',  icon:'member' },
];

const BOARD_NAV = [
  { id:'board',    label:'Club Tools', short:'Club', icon:'home'   },
  { id:'bmeet',    label:'Meetings',   icon:'record' },
  { id:'bcheckin', label:'Check-In',   icon:'scan'   },
  { id:'bmembers', label:'Members',    icon:'member' },
  { id:'baccount', label:'Account',    icon:'account' },
];

const navFor = () => (Store.isBoard ? BOARD_NAV : MEMBER_NAV);

const ROUTES = MEMBER_NAV.map(n => n.id)
  .concat(BOARD_NAV.map(n => n.id), 'auth');

const AuthUI = {
  mode:'in', busy:false,

  setupNotice(){
    const st = Backend.status;
    if (st === 'live') return '';

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
const PANE_ROUTES = ['board', 'bmeet', 'bcheckin', 'bmembers'];

function gate(id){
  if (!Store.ready) return id;
  if (!Store.signedIn) return 'auth';
  if (!Store.isBoard){
    if (BOARD_ROUTES.includes(id)) return 'home';
    if (id === 'auth') return 'home';
    return id;
  }

  if (!BOARD_ROUTES.includes(id)) return 'board';
  return id;
}

let current = 'home';
let navigating = false;

let pendingNav = null;
let booted = false;

function syncHash(id){
  try { if (location.hash !== '#/' + id) history.replaceState(null, '', '#/' + id); }
  catch (_) {  }
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
      `<button class="tab" data-go="${n.id}"${cur}><span>${n.short || n.label}</span></button>`);
    rail.insertAdjacentHTML('beforeend',
      `<button class="rail__link" data-go="${n.id}"${cur}>${ICON[n.icon]}<span>${n.label}</span></button>`);
  });
}

async function go(id, opts = {}){
  if (!ROUTES.includes(id)) id = 'home';
  id = gate(id);
  if (navigating){ pendingNav = id; return; }
  if (current === 'scan' && id !== 'scan') Scanner.stop();

  const view = $('#view');
  const from = current;
  const render = (nav = false) => {
    current = id;
    syncHash(id);
    Motion.settle(view);
    Reveal.clear();
    document.documentElement.dataset.screen = id;

    view.innerHTML = Views[id]();
    paintNav();
    try { scrollTo(0, 0); } catch (_) {}
    afterRender(id, nav, Boolean(opts.covered));
    view.focus({ preventScroll:true });
  };

  const same = from === id && !opts.force;
  if (view.firstChild && booted && !opts.instant && !same && !Motion.off){
    navigating = true;
    await Transit.run(from, id, () => render(true));
    navigating = false;
    if (pendingNav !== null){
      const next = pendingNav; pendingNav = null;
      if (next !== current) go(next);
    }
  } else {
    render();
  }
}

const seenUnlocked = new Set();

function playViewIntro(id, nav = false){
  if (id === 'home'){
    if (!nav && pendingCell < 0) FX.sealGrid($('#seals'));

    if (pendingCell >= 0){
      const cell = $$('#seals .seal')[pendingCell];
      pendingCell = -1;
      if (cell && cell.dataset.seal === 'set') FX.stampLand(cell);
    }
  }

  if (id === 'rewards'){
    $$('[data-reward]').forEach(row => {
      if (!row.classList.contains('tier--ready')) return;
      const rid = row.dataset.reward;
      if (seenUnlocked.has(rid)) return;
      seenUnlocked.add(rid);
      setTimeout(() => FX.rewardUnlock(row), 420);
    });
  }
}

function afterRender(id, nav = false, covered = false){
  if (booted && !covered) playViewIntro(id, nav);

  if (id === 'auth') AuthUI.busy = false;
  paintMotion();
  if (id === 'scan') Scanner.start();
  if (PANE_ROUTES.includes(id)){ loadBoard(); }
  else { clearInterval(countTimer); }
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

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target && e.target.id === 'manualInput'){
    e.preventDefault();
    $('#manualGo')?.click();
  }
});

let bqTimer = null;
document.addEventListener('input', e => {
  if (e.target.id === 'bq'){
    clearTimeout(bqTimer);
    const v = e.target.value;
    bqTimer = setTimeout(() => boardGoto({ q:v, page:1 }), 300);
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'bsort') boardGoto({ sort:e.target.value, page:1 });
});

function to12h(hhmm){
  const [h, m] = String(hhmm).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ap}`;
}

document.addEventListener('submit', async e => {
  if (e.target && e.target.tagName === 'FORM') e.preventDefault();

  const mf = e.target.closest('#meetingForm');
  if (mf){
    e.preventDefault();
    const err = $('#mErr');
    const show = msg => { if (err){ err.hidden = !msg; err.textContent = msg || ''; } };
    const btn = $('#mGo');
    if (btn && btn.disabled) return;

    const no    = Number($('#mNo').value);
    const date  = $('#mDate').value;
    const start = $('#mStart').value;
    const end   = $('#mEnd').value;

    BoardUI.form = { no:$('#mNo').value, date, start, end };

    if (!no || no < 1)  return show('Meeting number is required.');
    if (!date)          return show('Meeting date is required.');
    if (!start || !end) return show('Start and end time are required.');
    if (start >= end)   return show('End time must be after the start time.');

    show(''); btn.disabled = true; btn.textContent = 'Creating…';
    try {
      await Backend.createMeeting({ no, date, startTime:to12h(start), endTime:to12h(end) });
      BoardUI.form = null;
      toast({ key:'board', title:`GM ${pad(no)} created`, detail:'It is now in the schedule.' });
      boardGoto({ tab:'meetings' });
    } catch (ex){
      show(WriteFailure.explain(ex, 'create meeting'));
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

    const scene = Scenes.opening({ tail: up ? 'Member joined' : 'Welcome back',
      reveal(){ FX.pageEntrance($('#view')); playViewIntro(current); } });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      go('home', { instant:true, covered:true });
      scene.release();
    }));
  } catch (err){
    authErr(err && err.message ? err.message : 'Something went wrong. Try again.');
    authBusy(false);
    const pw = $('#authPass'); if (pw) { pw.value = ''; pw.focus(); }
  }
});

document.addEventListener('click', e => {
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
        if (boardMeeting === id) boardMeeting = null;
        boardGoto({ confirmDelete:null,
                    deleteNote: res && res.ok ? null : (res && res.code) || 'SERVER_ERROR',
                    meetings:null, meetingDetail:null });
      })
      .catch(() => boardGoto({ confirmDelete:null, deleteNote:'SERVER_ERROR' }));
    return;
  }

  /* ── TEMP-TEST-TOOLING ──────────────────────────────────────────
     Purge a past meeting and the stamps attached to it, so test data
     can be cleared before launch. One browser confirm, no undo. The
     board-only and past-only rules live in the database function; this
     handler is only the button. Remove this whole block with the rest
     of the tooling. */
  const bpurge = e.target.closest('[data-bpurgetemp]');
  if (bpurge){
    if (bpurge.disabled) return;
    const n = Number(bpurge.dataset.bpurgen) || 0;
    if (!confirm(`Delete GM ${bpurge.dataset.bpurgeno} and its ${n} stamp${n === 1 ? '' : 's'}?\n\nThis cannot be undone.`)) return;
    bpurge.disabled = true; bpurge.textContent = 'Purging…';
    Backend.purgeMeetingTEMP(bpurge.dataset.bpurgetemp)
      .then(res => {
        toast({ key:'board', title:`GM ${bpurge.dataset.bpurgeno} purged`,
                detail:`${res.removed} stamp${res.removed === 1 ? '' : 's'} removed with it.` });
        boardGoto({ meetings:null, meetingDetail:null });
      })
      .catch(ex => {
        bpurge.disabled = false; bpurge.textContent = 'Purge (test)';
        toast({ key:'board', bad:true, title:'Could not purge',
                detail:WriteFailure.explain(ex, 'purge meeting') });
      });
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
      .then(() => { boardMeeting = bstart.dataset.bstart; boardStamp = true; loadBoard(); })
      .catch(() => { bstart.disabled = false; bstart.textContent = 'Start attendance';
        toast({ key:'board', bad:true, title:'Could not start',
                detail:'Attendance did not open. Check the connection and try again.' }); });
    return;
  }
  const bend = e.target.closest('[data-bend]');
  if (bend){
    bend.disabled = true; bend.textContent = 'Ending…';
    Backend.endAttendance(bend.dataset.bend)
      .then(() => { clearInterval(countTimer); boardStamp = true; loadBoard(); })
      .catch(() => { bend.disabled = false; bend.textContent = 'End attendance';
        toast({ key:'board', bad:true, title:'Could not end',
                detail:'Attendance is still open. Try again.' }); });
    return;
  }

  const swap = e.target.closest('#authSwap');
  if (swap){
    AuthUI.mode = AuthUI.mode === 'up' ? 'in' : 'up';
    go('auth', { force:true });
    return;
  }

  const out = e.target.closest('[data-signout]');
  if (out){
    Scenes.exit({
      btn: out,
      swap: () => Store.signOut().then(() => {
        AuthUI.mode = 'in';
        toast({ key:'auth', title:'Signed out' });
        go('auth', { instant:true });
      }),
      fail: () => toast({ key:'auth', bad:true, title:'Could not sign out',
                          detail:'Check your connection and try again.' }),
    });
    return;
  }

  const motion = e.target.closest('[data-motion]');
  if (motion){
    Motion.setForced(!Motion.forced);
    paintMotion();
    toast({ key:'motion',
            title:Motion.forced ? 'Reduced motion on' : 'Reduced motion off',
            detail:Motion.forced ? 'Animations are off.' : 'Animations are back on.' });
    return;
  }

  const nav = e.target.closest('[data-go]');
  if (nav){ go(nav.dataset.go); return; }

  const claim = e.target.closest('[data-claim]');
  if (claim){
    if (claim.disabled) return;
    claim.disabled = true;
    Store.claimReward(claim.dataset.claim).then(r => {
      FX.impactFrame({ word:'Claimed', angle:-24 });

      setTimeout(() => {
        toast({ key:'claim', title:`${r.name} claimed`,
                detail:'Show this screen to a board member to pick it up.' });
        go('rewards');
      }, 220);
    }).catch(() => {
      claim.disabled = false;
      toast({ key:'claim', bad:true, title:'Could not claim',
        detail:'That reward was not saved. Check your connection and try again.' });
    });
    return;
  }

  const go2 = e.target.closest('#manualGo');
  if (go2){
    if (go2.disabled) return;
    const input = $('#manualInput');
    const val = (input && input.value || '').trim();
    if (!val){
      toast({ key:'scan', bad:true, title:'Enter a code',
              detail:'Type the code a board member gives you.' });
      return;
    }
    go2.disabled = true;
    submitSeal(val, false).finally(() => {
      const btn = $('#manualGo');
      if (btn) btn.disabled = false;
    });
    return;
  }
});

let boardStamp = false;

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

  if (BoardUI.tab === 'session' && !BoardUI.error && $('#qrBox')){
    paintBoard();
    paintAttendanceCount(boardMeeting);
  } else {
    clearInterval(countTimer);
  }

  if (boardStamp){
    boardStamp = false;
    if (BoardUI.tab === 'session' && !BoardUI.error) FX.boardSeal();
  }
}

function boardGoto(next){
  Object.assign(BoardUI, next);
  loadBoard();
}

function paintMotion(){
  $$('[data-motion]').forEach(b => {
    b.setAttribute('aria-pressed', String(Motion.forced));
    b.setAttribute('aria-label', Motion.forced ? 'Reduced motion is on. Turn animations back on.'
                                               : 'Reduced motion is off. Turn animations off.');
    b.innerHTML = (Motion.forced ? ICON.still : ICON.waves) +
                  `<span>${Motion.forced ? 'On' : 'Off'}</span>`;
  });
}

addEventListener('hashchange', () => { const id = hashRoute(); if (id !== current) go(id); });

addEventListener('pagehide', () => {
  Scanner.stop(); clearInterval(countTimer);
});

let opening = null;
try {
  opening = Scenes.opening({ root:$('#boot'), reveal(){
    booted = true;
    FX.pageEntrance($('#view'));
    playViewIntro(current);
  } });
} catch (_) {
  booted = true;
  $('#boot')?.classList.add('is-done');
}

(async () => {
  try {
    await Backend.init();
    await Store.hydrate();

    Store.onChange(() => { if (current) go(current, { instant:true }); paintIdentity(); });

    paintBrand();
    $('#barBrand').innerHTML  = wordmark();
    paintIdentity();
    paintMotion();
    go(hashRoute());
  } finally {
    if (opening) opening.release();
  }
})();

function paintIdentity(){
  const foot = $('#railFoot');
  if (!foot) return;
  foot.innerHTML = Store.signedIn
    ? `<p class="rail__who">${esc(Store.user.name)}</p>
       <p class="muted rail__role">${Store.isBoard ? 'Board' : 'Member'}</p>
       <div class="rail__set"><span>Reduced motion</span>
         <button class="motion-btn" type="button" data-motion></button></div>
       <button class="link" data-signout>Sign out</button>`
    : `<p class="kicker">Not signed in</p>
       <p class="muted" style="margin-top:6px;font-size:12.5px">Sign in to see your record.</p>`;
  paintMotion();
}
