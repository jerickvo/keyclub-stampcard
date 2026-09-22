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
  { id:'bcheckin', label:'Check-in'   },
  { id:'bmembers', label:'Members'    },
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
let painted = null;   /* Store.stamp() as of the last paint */

/* A working button keeps its box: the label changes, the width does
   not, and it is neither hoverable nor pressable until it is released.
   A button that names its progress word (data-busy) carries the other
   label as a hidden line, so it is as wide as the wider of the two at
   rest and while working; any other is held at the width it had. */
function hold(btn, label){
  if (!btn || btn.hasAttribute('aria-busy')) return;
  const word = btn.dataset.busy || label;
  if (btn.dataset.busy !== undefined){
    btn.dataset.rest = btn.textContent.trim();
    btn.dataset.busy = btn.dataset.rest;
  } else {
    btn.style.minWidth = btn.getBoundingClientRect().width + 'px';
  }
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.textContent = word;
}
function release(btn, label){
  if (!btn) return;
  const word = label !== undefined ? label : (btn.dataset.rest || btn.textContent);
  if (btn.dataset.rest !== undefined){
    btn.dataset.busy = btn.textContent;
    delete btn.dataset.rest;
  }
  btn.disabled = false;
  btn.removeAttribute('aria-busy');
  btn.style.minWidth = '';
  btn.textContent = word;
}

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

  navFor().forEach((n, i) => {
    const cur = current === n.id ? ' aria-current="page"' : '';
    tabs.insertAdjacentHTML('beforeend',
      `<button class="tab" data-go="${n.id}"${cur}><span>${n.short || n.label}</span></button>`);
    rail.insertAdjacentHTML('beforeend',
      `<button class="rail__link" data-go="${n.id}"${cur}><span class="rail__idx">${pad(i + 1)}</span><span class="rail__lab">${n.label}</span></button>`);
  });
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
    document.documentElement.dataset.screen = id;

    view.innerHTML = Views[id]();
    syncProjector();
    painted = Store.stamp();
    paintNav();
    if (!opts.quiet){ try { scrollTo(0, 0); } catch (_) {} }
    afterRender(id, nav, Boolean(opts.covered || opts.quiet));
    /* focus follows a page turn; the first paint has nowhere to move it
       from, and asking costs a whole layout of a page nobody has seen */
    if (booted) view.focus({ preventScroll:true });
  };

  const same = from === id && !opts.force;
  /* Scan is never cut into: the camera image is the page change, and
     the camera is asked for at once */
  if (view.firstChild && booted && !opts.instant && !same && id !== 'scan' && window.animate){
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

/* the one intro a page has: a stamp just earned is primed to land */
function playViewIntro(id){
  if (id === 'home' && pendingStamp){
    const cell = Landing.cellFor(pendingStamp.meetingId);
    pendingStamp = null;
    Landing.prime(cell);
  }
}

function afterRender(id, nav = false, covered = false){
  if (booted && !covered) playViewIntro(id, nav);

  if (id === 'auth') AuthUI.busy = false;
  paintMotion();
  /* the meeting line under the camera is re-read on arrival */
  if (id === 'scan'){ Scanner.armStart(); if (Store.signedIn) Store.hydrate(); }
  if (PANE_ROUTES.includes(id)){ loadBoard(); }
  else { clearInterval(countTimer); }
}

/* The error box keeps its room whether or not it has words, so a
   refusal never moves the button under the finger. */
function authErr(msg){
  const box = $('#authErr');
  if (!box) return;
  box.classList.toggle('is-on', Boolean(msg));
  box.textContent = msg || '';
}

function authBusy(on, label){
  AuthUI.busy = on;
  const btn = $('#authGo');
  if (!btn) return;
  if (on) hold(btn, label);
  else release(btn, AuthUI.mode === 'up' ? 'Create account' : 'Sign in');
}

document.addEventListener('keydown', e => {
  /* an open stamp closes on Escape, as any slip over the page should */
  if (e.key === 'Escape' && e.target && e.target.matches && e.target.matches('.seal[tabindex]')){
    e.target.blur();
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
    /* the last refusal is withdrawn as soon as the form is edited */
    const err = $('#mErr');
    if (err && !err.hidden){ err.hidden = true; err.textContent = ''; }
    return;
  }
  if (e.target.closest('#authForm')){
    /* likewise on the sign-in form: a refusal is withdrawn on the first
       keystroke; the box keeps its height, so nothing moves */
    const box = $('#authErr');
    if (box && box.classList.contains('is-on')) authErr('');
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

    show(''); hold(btn, 'Scheduling');
    try {
      await Backend.createMeeting({ no, date, startTime:to12h(start), endTime:to12h(end) });
      BoardUI.form = null; BoardUI.formOpen = false;
      toast({ key:'board', title:`GM ${pad(no)} scheduled` });
      boardGoto({ tab:'meetings' });
    } catch (ex){
      show(WriteFailure.explain(ex, 'create meeting'));
      release(btn, 'Schedule meeting');
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
  authBusy(true, up ? 'Creating' : 'Signing in');
  try {
    if (up) await Store.signUp(username, password, confirm);
    else    await Store.signIn(username, password);

    const scene = Scenes.opening({ reveal(){ playViewIntro(current); } });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      go('home', { instant:true, covered:true });
      scene.release();
    }));
  } catch (err){
    const msg = err && err.message ? err.message : 'Something went wrong. Try again.';
    authErr(msg);
    authBusy(false);
    /* Focus lands on the first field at fault, in form order. A password
       that was refused is cleared so it can be retyped; a username that
       was refused stays, so it can be corrected. */
    const at = Config.validateUsername(username) ? '#authUser'
             : Config.validatePassword(password) ? '#authPass'
             : (up && password !== confirm)      ? '#authPass2'
             : /^username/i.test(msg)             ? '#authUser'   /* "Username is already taken." */
             : '#authPass';                                      /* a refused pair: retype the password */
    const field = $(at);
    if (field){
      if (at !== '#authUser') field.value = '';
      field.focus();
    }
  }
});

document.addEventListener('click', e => {
  const btab = e.target.closest('[data-btab]');
  if (btab){
    const toRoute = { club:'board', meetings:'bmeet', session:'bcheckin', progress:'bmembers' };
    Object.assign(BoardUI, { memberDetail:null, meetingDetail:null, page:1 });
    if (btab.hasAttribute('data-mnew')) BoardUI.formOpen = true;
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
    boardGoto({ confirmDelete:bconfirm.dataset.bconfirm, deleteNote:null, refocus:'[data-bcancel]' });
    return;
  }
  const bcancel = e.target.closest('[data-bcancel]');
  if (bcancel){ boardGoto({ confirmDelete:null, refocus:'[data-bconfirm]' }); return; }

  const mform = e.target.closest('[data-mform]');
  if (mform){
    const open = mform.dataset.mform !== 'close';
    BoardUI.formOpen = open;
    if (!open) BoardUI.form = null;
    const box = $('#boardPane');
    if (box){ box.innerHTML = BoardUI.pane(); }
    if (open) $('#mNo')?.focus({ preventScroll:true });
    else $('[data-mform]')?.focus({ preventScroll:true });
    return;
  }
  const bfull = e.target.closest('[data-bfull]');
  if (bfull){ projector(!$('#proj')?.classList.contains('proj--full')); return; }

  const bdelete = e.target.closest('[data-bdelete]');
  if (bdelete){
    if (bdelete.disabled) return;
    const id = bdelete.dataset.bdelete;
    const stamps = Number(bdelete.dataset.bstamps) || 0;
    hold(bdelete, 'Deleting');

    const clear = note => {
      if (boardMeeting === id) boardMeeting = null;
      boardGoto({ confirmDelete:null, deleteNote:note || null,
                  meetings:null, meetingDetail:null });
    };

    (stamps
      ? Backend.deleteMeetingAndStamps(id).then(res => {
          toast({ key:'board', title:'Meeting deleted',
                  detail:`${res.removed} stamp${res.removed === 1 ? '' : 's'} removed with it.` });
          clear(null);
        })
      : Backend.deleteMeeting(id).then(res =>
          clear(res && res.ok ? null : (res && res.code) || 'SERVER_ERROR'))
    ).catch(ex => {
      boardGoto({ confirmDelete:null,
                  deleteNote:WriteFailure.explain(ex, 'delete meeting') });
    });
    return;
  }

  const bback = e.target.closest('[data-bback]');
  if (bback){ boardGoto({ memberDetail:null, meetingDetail:null }); return; }
  const bpage = e.target.closest('[data-bpage]');
  if (bpage){ boardGoto({ page:Number(bpage.dataset.bpage) || 1 }); return; }
  const reload = e.target.closest('[data-reload]');
  if (reload){
    hold(reload, 'Retrying');
    Store.hydrate().then(() => go(current, { instant:true }));
    return;
  }
  const retry = e.target.closest('[data-scan-retry]');
  if (retry){ Scanner.start(); return; }

  const breload = e.target.closest('[data-breload]');
  if (breload){ loadBoard(); return; }
  const bpick = e.target.closest('[data-bpick]');
  if (bpick){ boardMeeting = bpick.dataset.bpick; loadBoard(); return; }

  const bstart = e.target.closest('[data-bstart]');
  if (bstart){
    hold(bstart, 'Opening');
    Backend.startAttendance(bstart.dataset.bstart)
      /* opened from Club Tools, the next thing wanted is the code */
      .then(() => { boardMeeting = bstart.dataset.bstart; boardStamp = true;
                    if (current === 'board') go('bcheckin'); else loadBoard(); })
      .catch(err => { release(bstart, 'Open check-in');
        toast({ key:'board', bad:true, title:'Could not open check-in',
                detail:BoardUI.message(err && err.message) }); });
    return;
  }
  const bend = e.target.closest('[data-bend]');
  if (bend){
    hold(bend, 'Closing');
    Backend.endAttendance(bend.dataset.bend)
      .then(() => { clearInterval(countTimer); boardStamp = true; loadBoard(); })
      .catch(err => { release(bend, 'Close check-in');
        toast({ key:'board', bad:true, title:'Could not close check-in',
                detail:BoardUI.message(err && err.message) }); });
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
    go('auth', { force:true, instant:true });
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
    return;
  }

  const nav = e.target.closest('[data-go]');
  if (nav){ go(nav.dataset.go); return; }

  const claim = e.target.closest('[data-claim]');
  if (claim){
    if (claim.disabled) return;
    /* a claim cannot be taken back, so it takes a second, deliberate tap */
    if (!claim.dataset.armed){
      claim.dataset.armed = '1';
      claim.textContent = 'Confirm claim';
      clearTimeout(claim._disarm);
      claim._disarm = setTimeout(() => {
        if (!document.body.contains(claim) || claim.disabled) return;
        delete claim.dataset.armed;
        claim.textContent = 'Claim';
      }, 4000);
      return;
    }
    clearTimeout(claim._disarm);
    claim.disabled = true;
    Store.claimReward(claim.dataset.claim).then(r => {
      go('rewards', { instant:true });
      FX.claimStamp($(`[data-reward="${claim.dataset.claim}"]`));
      setTimeout(() => toast({ key:'claim', title:`${r.name} claimed` }), 260);
    }).catch(err => {
      delete claim.dataset.armed;
      claim.textContent = 'Claim';
      claim.disabled = false;
      const code = String(err && err.message || '');
      toast({ key:'claim', bad:true, title:'Could not claim',
        detail:/not earned/i.test(code) ? 'This reward is not earned yet.'
             : /not signed/i.test(code) ? 'Sign in again to claim.'
             : 'The claim was not saved. Check your connection and try again.' });
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

  /* A pane that already holds this chapter's content keeps it while the
     record is re-read: opening or closing check-in, a search, a page
     turn, opening a member. Only an empty chapter shows the wait panel. */
  const box = pane();
  const keep = Boolean(box) && !BoardUI.loading && BoardUI.shown === BoardUI.tab;
  /* a field the reader is typing in (the roster search) gets its focus
     back after the repaint */
  const active = document.activeElement;
  const focusId = keep && active && active.id && box.contains(active) ? active.id : null;
  /* the code already on the projector stays up while its token is
     re-issued; a code that was not on screen is never shown early */
  const shownQR = keep && boardMeeting ? { meeting:boardMeeting, svg:$('#qrBox svg', box)?.outerHTML || null } : null;
  if (keep) box.setAttribute('aria-busy', 'true');
  else if (!BoardUI.loading){
    BoardUI.loading = true;
    if (box) box.innerHTML = BoardUI.pane();
  }

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
  BoardUI.shown = BoardUI.error ? null : BoardUI.tab;
  if (pane()){
    pane().innerHTML = BoardUI.pane();
    pane().removeAttribute('aria-busy');
    const again = focusId && document.getElementById(focusId);
    if (again){
      again.focus({ preventScroll:true });
      try { const n = again.value.length; again.setSelectionRange(n, n); } catch (_) {}
    }
    const qb = shownQR && shownQR.svg && boardMeeting === shownQR.meeting ? $('#qrBox') : null;
    if (qb) qb.innerHTML = shownQR.svg;
    syncProjector();
    /* a confirmation takes the focus, and gives it back when dismissed */
    if (BoardUI.refocus){ $(BoardUI.refocus)?.focus({ preventScroll:true }); BoardUI.refocus = null; }
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

/* an unknown hash resolves to the page already showing; the address is
   corrected so it never names a page that does not exist */
addEventListener('hashchange', () => { const id = hashRoute(); if (id !== current) go(id); else syncHash(current); });

/* Projector mode is the stage laid over the whole window. Full screen is
   asked for as well where the browser allows it (not on an iPhone), on the
   page rather than the stage, so a repaint of the stage does not drop it.
   Leaving full screen, Escape or the button all end the mode. */
function projector(on){
  const stage = $('#proj');
  if (!stage) return;
  stage.classList.toggle('proj--full', on);
  document.documentElement.classList.toggle('is-projecting', on);
  const b = $('[data-bfull]');
  if (b){ b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Leave projector' : 'Project'; }
  try {
    if (on && document.fullscreenEnabled && !document.fullscreenElement)
      document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch (_) {}
  if (on) b?.focus({ preventScroll:true });
}
/* a repaint of the pane keeps the mode while check-in is still open;
   anything else (closed, another page) ends it */
function syncProjector(){
  if (!document.documentElement.classList.contains('is-projecting')) return;
  if ($('#proj.proj--live')) projector(true);
  else {
    document.documentElement.classList.remove('is-projecting');
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (_) {}
  }
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && $('#proj')?.classList.contains('proj--full')) projector(false);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#proj')?.classList.contains('proj--full')) projector(false);
});

addEventListener('pagehide', () => {
  Scanner.stop(); clearInterval(countTimer);
});

let opening = null;
try {
  opening = Scenes.opening({ root:$('#boot'), reveal(){
    booted = true;
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

    /* The record changed: the page is repainted only if what it shows
       would differ, and Scan only refreshes its meeting line, so the
       camera is never restarted under the reader. */
    Store.onChange(() => {
      if (current === 'scan'){
        paintScanStanding();
        /* stamped from elsewhere while the camera is up: nothing to scan */
        if (Scanner.stream && !Landing.active && Scanner.stamped()){ Scanner.stop(); Scanner.stall('stamped'); }
      }
      else if (current && current !== 'auth' && Store.stamp() !== painted)
        go(current, { instant:true, force:true, quiet:true });   /* force: not dropped if it lands mid-cut */
      paintIdentity();
    });

    /* Coming back to the tab re-reads what the page shows: the record
       for a member, the chapter's own data for a board pane (kept in
       place while it loads). Nothing is re-read under a working button
       or during a scene. */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!booted || !Store.signedIn || Landing.active || Scenes.busy) return;
      if (PANE_ROUTES.includes(current)){
        if (BoardUI.loading || $('#boardPane [aria-busy]')) return;
        loadBoard();
      } else Store.hydrate();
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
    ? `<p class="rail__who"><span class="rail__name">${esc(Store.user.name)}</span>
         <span class="rail__role">${Store.isBoard ? 'Board' : 'Member'}</span></p>
       <div class="rail__util">
         <button class="rail__motion" type="button" data-motion></button>
         <button class="rail__out" type="button" data-signout>Sign out</button>
       </div>`
    : `<p class="kicker">Not signed in</p>
       <p class="muted rail__note">Sign in to see your record.</p>`;
  paintMotion();
}
