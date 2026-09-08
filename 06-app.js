"use strict";

const MEMBER_NAV = [
  { id:'home',    label:'Home'    },
  { id:'record',  label:'Record'  },
  { id:'scan',    label:'Scan'    },
  { id:'rewards', label:'Rewards' },
  { id:'profile', label:'Member'  },
];

const BOARD_NAV = [
  { id:'board',    label:'Club Tools', short:'Club' },
  { id:'bmeet',    label:'Meetings'   },
  { id:'bcheckin', label:'Check-In'   },
  { id:'bmembers', label:'Members'    },
  { id:'baccount', label:'Account'    },
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
        <p>Keystamp could not reach the club records. This is not
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
let loadSeq = 0;

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
  const tabs = $('#tabs'), rail = $('#railNav'), ch = $('#railCh');
  $$('.tab', tabs).forEach(el => el.remove());
  $$('.rail__link', rail).forEach(el => el.remove());

  let chapter = '';
  navFor().forEach((n, i) => {
    const on = current === n.id;
    const cur = on ? ' aria-current="page"' : '';
    if (on) chapter = pad(i + 1);
    tabs.insertAdjacentHTML('beforeend',
      `<button class="tab" data-go="${n.id}"${cur}><span>${n.short || n.label}</span></button>`);
    rail.insertAdjacentHTML('beforeend',
      `<button class="rail__link" data-go="${n.id}"${cur}><span class="rail__idx">${pad(i + 1)}</span><span class="rail__lab">${n.label}</span></button>`);
  });

  if (ch && ch.textContent !== chapter){
    ch.textContent = chapter;
    if (chapter && booted && !Motion.off && window.animate){
      aset(ch, { scale:1.06, translateY:8 });
      animate(ch, { scale:[1.06, 1], translateY:[8, 0], duration:150, ease:STEP(3),
                    onComplete(){ Motion.settle(ch); } });
    }
  }
}

async function go(id, opts = {}){
  if (!ROUTES.includes(id)) id = 'home';
  id = gate(id);
  if (navigating){ pendingNav = { id, opts }; return; }
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
  if (view.firstChild && booted && !opts.instant && !same && window.animate){
    navigating = true;
    await Transit.run(from, id, () => render(true));
    navigating = false;
    if (pendingNav !== null){
      const next = pendingNav; pendingNav = null;
      if (next.id !== current || next.opts.force) go(next.id, next.opts);
    }
  } else {
    render();
  }
}

const seenUnlocked = new Set();

function playViewIntro(id, nav = false){
  if (id === 'home'){
    if (pendingStamp){
      const cell = Landing.cellFor(pendingStamp.meetingId);
      pendingStamp = null;
      Landing.prime(cell);
    } else if (!nav){
      FX.sealGrid($('#seals'));
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
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches('[role="button"]')){
    e.preventDefault();
    e.target.click();
  }
});

document.addEventListener('mousedown', e => {
  if (e.target.closest('[data-eye]')) e.preventDefault();
});

let bqTimer = null;
const MEETING_FIELDS = { mNo:'no', mDate:'date', mStart:'start', mEnd:'end' };
document.addEventListener('input', e => {
  const key = MEETING_FIELDS[e.target.id];
  if (key && e.target.closest('#meetingForm')){
    BoardUI.form = Object.assign({}, BoardUI.form || {}, { [key]:e.target.value });
    return;
  }
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

    const noRaw = String($('#mNo').value || '').trim();
    const no    = Number(noRaw);
    const date  = $('#mDate').value;
    const start = $('#mStart').value;
    const end   = $('#mEnd').value;

    BoardUI.form = { no:noRaw, date, start, end };

    if (!noRaw || !Number.isInteger(no) || no < 1)
      return show('Meeting number must be a whole number, 1 or higher.');
    if (BoardUI.hasMeetingNumber(no))
      return show(`GM ${pad(no)} already exists. Use a different number.`);
    if (!date)          return show('Meeting date is required.');
    if (!start || !end) return show('Start and end time are required.');
    if (start >= end)   return show('End time must be after the start time.');

    show(''); btn.disabled = true; btn.textContent = 'Scheduling…';
    try {
      await Backend.createMeeting({ no, date, startTime:to12h(start), endTime:to12h(end) });
      BoardUI.form = null;
      toast({ key:'board', title:`GM ${pad(no)} scheduled`, detail:'It is now in the schedule.' });
      boardGoto({ tab:'meetings' });
    } catch (ex){
      show(WriteFailure.explain(ex, 'create meeting'));
      btn.disabled = false; btn.textContent = 'Schedule meeting';
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

  const mreset = e.target.closest('[data-mreset]');
  if (mreset){
    BoardUI.form = null;
    const mf = $('#meetingForm');
    if (mf) mf.outerHTML = BoardUI.createForm();
    $('#mNo')?.focus({ preventScroll:true });
    return;
  }

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

  const eye = e.target.closest('[data-eye]');
  if (eye){
    const input = document.getElementById(eye.dataset.eye);
    if (!input) return;
    const show = input.type === 'password';
    const held = document.activeElement === input;
    const start = input.selectionStart, end = input.selectionEnd, dir = input.selectionDirection;
    input.type = show ? 'text' : 'password';
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    eye.setAttribute('aria-pressed', String(show));
    eye.innerHTML = show ? ICON.eyeOff : ICON.eye;
    if (held && start !== null){
      const restore = () => {
        if (document.activeElement !== input) input.focus({ preventScroll:true });
        input.setSelectionRange(start, end, dir || 'none');
      };
      restore();
      setTimeout(restore, 0);
    }
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
      go('rewards', { instant:true });
      FX.claimStamp($(`[data-reward="${claim.dataset.claim}"]`));
      setTimeout(() => toast({ key:'claim', title:`${r.name} claimed`,
        detail:'Show this screen to a board member to pick it up.' }), 260);
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
  const seq = ++loadSeq;
  const pane = () => (seq === loadSeq ? $('#boardPane') : null);
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

  if (seq !== loadSeq) return;
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
    b.innerHTML = b.classList.contains('rail__motion')
      ? `<i aria-hidden="true"></i><span>${Motion.forced ? 'Motion off' : 'Motion on'}</span>`
      : '<span class="motion-btn__opt">On</span><span class="motion-btn__opt">Off</span>';
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

    Store.onChange(() => {
      if (current && current !== 'auth' && current !== 'scan') go(current, { instant:true });
      paintIdentity();
    });

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
    ? `<p class="rail__who"><span>${esc(Store.user.name)}</span>
         <span class="rail__role${Store.isBoard ? ' rail__role--board' : ''}">${Store.isBoard ? 'Board' : 'Member'}</span></p>
       <div class="rail__util">
         <button class="rail__motion" type="button" data-motion></button>
         <button class="rail__out" type="button" data-signout>Sign out</button>
       </div>`
    : `<p class="kicker">Not signed in</p>
       <p class="muted rail__note">Sign in to see your record.</p>`;
  paintMotion();
}
