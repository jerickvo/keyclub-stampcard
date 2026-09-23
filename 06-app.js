"use strict";

const MEMBER_NAV = [
  { id:'home',    label:'Home'    },
  { id:'record',  label:'Record'  },
  { id:'scan',    label:'Scan'    },
  { id:'rewards', label:'Rewards' },
  { id:'profile', label:'Member'  },
];

/* an officer lands on Check-in: at a meeting it is the page they need,
   and between meetings it names the next one */
const BOARD_NAV = [
  { id:'bcheckin', label:'Check-in'   },
  { id:'bmeet',    label:'Meetings'   },
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
        <p class="kicker">Could not reach the club records</p>
        <p>Reload the page. If it keeps happening, tell a board member.</p>
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
const PANE_ROUTES = ['bmeet', 'bcheckin', 'bmembers'];

function gate(id){
  if (!Store.ready) return id;
  if (!Store.signedIn) return 'auth';
  if (!Store.isBoard){
    if (BOARD_ROUTES.includes(id)) return 'home';
    if (id === 'auth') return 'home';
    return id;
  }

  if (!BOARD_ROUTES.includes(id)) return 'bcheckin';
  return id;
}

let current = 'home';
let navigating = false;
/* where a page cut in progress is going */
let heading = null;

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

  /* while a check-in is open and not yet stamped, the Scan tab is the
     way in, under the thumb, so it is set in ink */
  const open = !Store.isBoard && Store.openMeeting();
  const live = Boolean(open && !Store.attended(open.id));
  navFor().forEach((n, i) => {
    const cur = current === n.id ? ' aria-current="page"' : '';
    const hot = live && n.id === 'scan' ? ' tab--live' : '';
    tabs.insertAdjacentHTML('beforeend',
      `<button class="tab${hot}" data-go="${n.id}"${cur}><span>${n.short || n.label}</span></button>`);
    rail.insertAdjacentHTML('beforeend',
      `<button class="rail__link" data-go="${n.id}"${cur}><span class="rail__idx" aria-hidden="true">${pad(i + 1)}</span><span class="rail__lab">${n.label}</span></button>`);
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
    /* the page is named in the tab title and read from its heading */
    document.title = id === 'auth' ? 'Sign in / Keystamp'
      : `${(navFor().find(n => n.id === id) || {}).label || 'Keystamp'} / Keystamp`;
    /* a background refresh never moves the reader's focus */
    if (booted && !opts.quiet){
      const head = $('.rechead__title', view);
      if (head){ head.setAttribute('tabindex', '-1'); head.focus({ preventScroll:true }); }
      else view.focus({ preventScroll:true });
    }
  };

  const same = from === id && !opts.force;
  /* Scan is never cut into: the camera image is the page change, and
     the camera is asked for at once */
  if (view.firstChild && booted && !opts.instant && !same && id !== 'scan' && window.animate){
    navigating = true; heading = id;
    await Transit.run(from, id, () => render(true));
    navigating = false; heading = null;
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
  if (id === 'scan'){ Scanner.armStart(); if (Store.signedIn) Store.hydrate({ keep:true }); }
  if (PANE_ROUTES.includes(id)){ loadBoard(); }
  else { clearInterval(countTimer); }
  TodayWatch.sync();
}

/* On a meeting day, a member's Home and Scan learn without a reload
   that check-in has opened or closed, or that a board member has
   stamped them by hand. Two tiny reads every fifteen seconds (which
   meeting is open today; how many stamps this member has), and only
   while today still has a meeting they have no stamp for (up to an hour
   after it ends), one of those two pages is showing, and the tab is in
   view. Anything that changed re-reads the record, and the page
   repaints through Store.onChange; a start or end time passing only
   re-sorts what is already known. */
const TodayWatch = {
  timer: null,
  every: 0,
  EVERY: 15000,
  /* a page with nothing known for today still asks, slowly, whether a
     check-in has opened: a meeting may be scheduled after it loaded */
  IDLE: 60000,

  pace(){
    const on = Store.ready && Store.signedIn && !Store.isBoard && !Store.failed
      && (current === 'home' || current === 'scan');
    return !on ? 0 : Store.dayLive() ? this.EVERY : this.IDLE;
  },
  sync(){
    const every = this.pace();
    if (!every){ this.stop(); return; }
    if (this.timer && this.every === every) return;
    this.stop();
    this.every = every;
    /* a room of phones does not ask in step */
    this.timer = setInterval(() => this.tick(), every + Math.round(Math.random() * 3000));
  },
  stop(){ clearInterval(this.timer); this.timer = null; this.every = 0; },

  /* nothing is asked while a code is being checked or a stamp is
     landing: that read is the one that matters */
  busy(){ return document.hidden || navigating || Landing.active || Scenes.busy || Scanner.locked || !Store.user; },

  async tick(){
    if (this.busy()) return;
    Store.resettle();
    if (this.pace() !== this.every) return this.sync();
    const live = this.every === this.EVERY;
    const was = Store.openMeeting(), had = Store.scans.length;
    let open, count;
    try {
      /* a quiet day asks only whether check-in is open */
      [open, count] = await Promise.all([Backend.openToday(),
        live ? Backend.myStampCount(Store.user.id) : had]);
    } catch (_) { return; }
    if (this.busy()) return;
    if (open !== (was ? was.id : null) || count !== had) Store.hydrate({ keep:true });
  },
};

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
    return;
  }
  if (e.target.id === 'bhq'){
    clearTimeout(bqTimer);
    const v = e.target.value.trim(), mid = e.target.dataset.meeting;
    BoardUI.handQ = v;
    if (!v){ BoardUI.handFound = null; paintHandList(); return; }
    bqTimer = setTimeout(() => handSearch(v, mid), 300);
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
    const show = msg => { const err = $('#mErr'); if (err){ err.hidden = !msg; err.textContent = msg || ''; } };
    const btn = $('#mGo');
    if (btn && btn.disabled) return;

    const noRaw = String($('#mNo').value || '').trim();
    const no    = Number(noRaw);
    const date  = $('#mDate').value;
    const start = $('#mStart').value;
    const end   = $('#mEnd').value;

    BoardUI.form = { no:noRaw, date, start, end };

    if (!/^\d+$/.test(noRaw) || no < 1 || no > MEETING_NO_MAX)
      return show(`Meeting number must be a whole number from 1 to ${MEETING_NO_MAX}.`);
    if (BoardUI.hasMeetingNumber(no))
      return show(`GM ${pad(no)} already exists. Use a different number.`);
    if (!date)          return show('Meeting date is required.');
    const span = meetingDateBounds();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < span.min || date > span.max)
      return show('Pick a date within a year of today.');
    if (!start || !end) return show('Start and end time are required.');
    if (start >= end)   return show('End time must be after the start time.');

    show(''); hold(btn, 'Scheduling');
    const scheduled = () => {
      BoardUI.form = null; BoardUI.formOpen = false;
      toast({ key:'board', title:`GM ${pad(no)} scheduled` });
      boardGoto({ tab:'meetings', refocus:'[data-mform]' });
    };
    try {
      await Backend.createMeeting({ no, date, startTime:to12h(start), endTime:to12h(end) });
      scheduled();
    } catch (ex){
      const kind = WriteFailure.classify(ex).kind;
      const gone = (kind === 'permission' || kind === 'auth') && await sessionGone();
      if (gone){ show('You are no longer signed in here. Sign in again.'); release($('#mGo'), 'Schedule meeting'); return; }
      /* the list is read again: a meeting whose answer was lost is there
         (said as scheduled), and a number another officer took shows */
      const now = await Backend.board('meetings').catch(() => null);
      const asked = { start:to12h(start), end:to12h(end) };
      if (now && (now.meetings || []).some(m => Number(m.meeting_number) === no && m.meeting_date === date &&
                                               m.start_time === asked.start && m.end_time === asked.end))
        return scheduled();
      const msg = WriteFailure.explain(ex, 'create meeting');
      if (now){ BoardUI.meetings = now; const box = $('#boardPane'); if (box) box.innerHTML = BoardUI.pane(); }
      show(msg);
      release($('#mGo'), 'Schedule meeting');
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
    const msg = err && err.message ? err.message : 'Could not sign in. Try again.';
    authErr(msg);
    authBusy(false);
    /* Focus lands on the first field at fault, in form order. A password
       that was refused is cleared so it can be retyped; a username that
       was refused stays, so it can be corrected. A refusal that is not
       about the password (the network, a limit on attempts) keeps it. */
    const nameBad = up ? Config.validateUsername(username) : Config.checkSignInName(username);
    const at = nameBad                           ? '#authUser'
             : Config.validatePassword(password) ? '#authPass'
             : (up && password !== confirm)      ? '#authPass2'
             : /^username|^that username cannot/i.test(msg) ? '#authUser'   /* "Username is already taken." */
             : '#authPass';                                      /* a refused pair: retype the password */
    const keep = /^could not reach|^too many/i.test(msg);
    const field = $(at);
    if (field){
      if (at !== '#authUser' && !keep) field.value = '';
      field.focus();
    }
    /* on a short screen the refusal sits below the fold, under the
       actions: the page scrolls to it (the layout itself never shifts) */
    const box = $('#authErr');
    if (box && box.getBoundingClientRect().bottom > innerHeight)
      box.scrollIntoView({ block:'nearest' });
  }
});

document.addEventListener('click', e => {
  const btab = e.target.closest('[data-btab]');
  if (btab){
    const toRoute = { meetings:'bmeet', session:'bcheckin', progress:'bmembers' };
    Object.assign(BoardUI, { memberDetail:null, meetingDetail:null, page:1, deleteNote:null, confirmDelete:null });
    /* the stage's "Schedule a meeting" opens the form, ready to type in */
    if (btab.hasAttribute('data-mnew')){ BoardUI.formOpen = true; BoardUI.refocus = '#mNo'; }
    go(toRoute[btab.dataset.btab] || 'bcheckin');
    return;
  }
  const bmember = e.target.closest('[data-bmember]');
  if (bmember){
    boardGoto({ memberDetail:'pending', meetingDetail:null, pendingId:bmember.dataset.bmember, refocus:'[data-bback]',
                leftFrom:`button[data-bmember="${bmember.dataset.bmember}"]`, toTop:true });
    return;
  }
  const bmeeting = e.target.closest('[data-bmeeting]');
  if (bmeeting){
    BoardUI.handQ = ''; BoardUI.handFound = null;
    boardGoto({ meetingDetail:'pending', memberDetail:null, pendingId:bmeeting.dataset.bmeeting,
                refocus:bmeeting.hasAttribute('data-bhandfocus') ? '#bhq' : '[data-bback]',
                leftFrom:`button[data-bmeeting="${bmeeting.dataset.bmeeting}"]`, toTop:true });
    return;
  }
  /* Stamping someone by hand cannot be taken back from the app, so it
     takes a second tap, and the second tap names who and which meeting. */
  const stamp = e.target.closest('[data-bstamp]');
  if (stamp){
    if (stamp.disabled) return;
    const who = stamp.dataset.who, no = stamp.dataset.no;
    if (!stamp.dataset.armed){
      stamp.dataset.armed = String(Date.now());
      stamp.textContent = 'Confirm';
      stamp.setAttribute('aria-label', `Confirm: check ${who} in to GM ${no}`);
      stamp.closest('.brow')?.classList.add('brow--armed');
      stamp.addEventListener('blur', () => {
        if (stamp.disabled) return;
        delete stamp.dataset.armed;
        stamp.textContent = 'Add';
        stamp.setAttribute('aria-label', `Add ${who} to GM ${no}`);
        stamp.closest('.brow')?.classList.remove('brow--armed');
      }, { once:true });
      return;
    }
    /* a double-tap is one touch: a confirm this soon after arming is not taken */
    if (Date.now() - Number(stamp.dataset.armed) < 400) return;
    hold(stamp, 'Adding');
    const uid = stamp.dataset.bstamp;
    const mark = () => { const p = ((BoardUI.handFound || {}).people || []).find(x => x.id === uid); if (p) p.checked_in = true; };
    Backend.addAttendance(uid, stamp.dataset.meeting).then(() => {
      mark();
      toast({ key:'board', title:`${who} checked in to GM ${no}`, detail:'Added by hand.' });
      reloadBoardHere('#bhq');
    }).catch(err => {
      const code = String((err && err.message) || '');
      if (code === 'ALREADY_CHECKED_IN'){
        mark();
        toast({ key:'board', title:'Already checked in', detail:`${who} has a stamp for GM ${no}.` });
      } else toast({ key:'board', bad:true, title:'Not checked in', detail:HandStamp.message(code) });
      if (Handover.OFFLINE.includes(code)) return unarm(stamp, 'Add');
      reloadBoardHere('#bhq');
    });
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
    const gm = bdelete.dataset.bno ? `GM ${bdelete.dataset.bno}` : 'Meeting';
    hold(bdelete, 'Deleting');

    /* gone (deleted here, or by another officer): back to the list */
    const clear = note => {
      if (boardMeeting === id) boardMeeting = null;
      boardGoto({ confirmDelete:null, deleteNote:note || null,
                  meetings:null, meetingDetail:null });
    };
    /* refused or unanswered: the meeting's page is read again, and says why */
    const stay = note => boardGoto({ confirmDelete:null, deleteNote:note, meetings:null,
                                     meetingDetail:'pending', pendingId:id,
                                     refocus:'.bdel [data-bconfirm] || [data-bback]' });

    (stamps
      ? Backend.deleteMeetingAndStamps(id).then(res => {
          toast({ key:'board', title:`${gm} deleted`,
                  detail:`${res.removed} stamp${res.removed === 1 ? '' : 's'} removed` });
          clear(null);
        })
      : Backend.deleteMeeting(id).then(res =>
          res && res.ok ? clear(null)
          : res && res.code === 'MEETING_NOT_FOUND' ? clear(res.code)
          : stay((res && res.code) || 'SERVER_ERROR'))
    ).catch(ex => stay(WriteFailure.explain(ex, 'delete meeting')));
    return;
  }

  const bback = e.target.closest('[data-bback]');
  if (bback){ boardGoto({ memberDetail:null, meetingDetail:null, deleteNote:null, confirmDelete:null,
                          refocus:BoardUI.leftFrom || null, leftFrom:null }); return; }
  const bpage = e.target.closest('[data-bpage]');
  if (bpage){ boardGoto({ page:Number(bpage.dataset.bpage) || 1, refocus:'[data-bpage]:not([disabled])' }); return; }
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
    const id = bstart.dataset.bstart;
    const openNow = list => ((list && list.meetings) || []).filter(m => m.state === 'OPEN');
    const opened = () => { boardMeeting = id; boardStamp = true;
                           BoardUI.refocus = '[data-bfull]'; loadBoard(); };
    hold(bstart, 'Opening');
    (async () => {
      /* another officer may have opened a meeting since this stage was
         read; opening this one would end theirs without a word */
      const now = await Backend.board('meetings').catch(() => null);
      if (openNow(now).some(m => m.id !== id)) throw new Error('ATTENDANCE_ALREADY_OPEN');
      await Backend.startAttendance(id);
    })().then(opened).catch(async err => {
      /* the stage is read again: opened at the same moment by another
         officer is open, which is what was asked */
      const now = await Backend.board('meetings').catch(() => null);
      if (openNow(now).some(m => m.id === id)) return opened();
      toast({ key:'board', bad:true, title:'Could not open check-in',
              detail:BoardUI.message(err && err.message) });
      BoardUI.refocus = '[data-bstart]';
      loadBoard();
    });
    return;
  }
  const bend = e.target.closest('[data-bend]');
  if (bend){
    hold(bend, 'Closing');
    Backend.endAttendance(bend.dataset.bend)
      .then(() => { clearInterval(countTimer); boardStamp = true;
                    BoardUI.refocus = '[data-bstart]'; loadBoard(); })
      .catch(err => {
        toast({ key:'board', bad:true, title:'Could not close check-in',
                detail:BoardUI.message(err && err.message) });
        /* read again: closed elsewhere, or deleted, the stage says so */
        BoardUI.refocus = '[data-bend]';
        loadBoard(); });
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
        /* what one officer did at the table is not the next one's */
        BoardUI.reset();
        TodayWatch.stop();
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

  /* Handing a prize over cannot be quietly repeated or taken back
     later, so it takes a second, deliberate tap, the way a claim does,
     and the second tap names who and what. */
  const hand = e.target.closest('[data-bhand]');
  if (hand){
    if (hand.disabled) return;
    const [uid, rid] = hand.dataset.bhand.split(':');
    const who = hand.dataset.who, prize = hand.dataset.prize;
    if (!hand.dataset.armed){
      hand.dataset.armed = String(Date.now());
      hand.textContent = 'Confirm';
      hand.setAttribute('aria-label', `Confirm: hand ${prize} to ${who}`);
      hand.closest('.brow')?.classList.add('brow--armed');
      hand.addEventListener('blur', () => {
        if (hand.disabled) return;
        delete hand.dataset.armed;
        hand.textContent = 'Hand over';
        hand.setAttribute('aria-label', `Hand ${prize} to ${who}`);
        hand.closest('.brow')?.classList.remove('brow--armed');
      }, { once:true });
      return;
    }
    if (Date.now() - Number(hand.dataset.armed) < 400) return;
    hold(hand, 'Saving');
    const key = hand.dataset.bhand;
    Backend.handOverReward(uid, rid).then(at => {
      BoardUI.handed[hand.dataset.bhand] = { at:at || new Date().toISOString(), when:Date.now(),
                                             username:who, prize };
      toast({ key:'board', title:`${prize} handed to ${who}` });
      reloadBoardHere(`[data-bundo="${hand.dataset.bhand}"]`);
    }).catch(err => {
      const code = String((err && err.message) || '');
      /* two officers at one table: the other got there first. That is
         the record working, not a failure to retry */
      /* the first try may have landed with its answer lost on the way
         back; a second try then finds it on file, and it is this
         officer's, with its Undo */
      const retried = BoardUI.lost.has(key);
      if (code === 'ALREADY_HANDED_OVER' && retried){
        BoardUI.lost.delete(key);
        BoardUI.handed[key] = { at:new Date().toISOString(), when:Date.now(), username:who, prize };
        toast({ key:'board', title:`${prize} handed to ${who}`, detail:'The first try had gone through.' });
        return reloadBoardHere(`[data-bundo="${key}"]`);
      }
      if (code === 'ALREADY_HANDED_OVER')
        toast({ key:'board', title:'Already handed over', detail:`${prize} for ${who} is already on the record.` });
      else toast({ key:'board', bad:true, title:'Not handed over', detail:Handover.message(code) });
      /* nothing reached the database, or its answer never came back: the
         row stays as it was, ready to try again, rather than re-reading
         a list over a dead connection */
      if (Handover.OFFLINE.includes(code)){ BoardUI.lost.add(key); return unarm(hand, 'Hand over'); }
      /* otherwise the list on screen is out of date: re-read it, and the
         reader's place is the next thing to hand over */
      reloadBoardHere(AFTER_REFUSAL);
    });
    return;
  }
  const more = e.target.closest('[data-bowed]');
  if (more){
    BoardUI.owedAll = !BoardUI.owedAll;
    const box = $('#boardPane');
    if (box){ box.innerHTML = BoardUI.pane(); $('[data-bowed]')?.focus({ preventScroll:true }); }
    return;
  }
  const undo = e.target.closest('[data-bundo]');
  if (undo){
    if (undo.disabled) return;
    const [uid, rid] = undo.dataset.bundo.split(':');
    hold(undo, 'Undoing');
    Backend.undoHandOver(uid, rid).then(() => {
      delete BoardUI.handed[undo.dataset.bundo];
      toast({ key:'board', title:'Hand-over taken back' });
      /* the row comes back where it sorts, which may be past the fold */
      BoardUI.owedAll = true;
      reloadBoardHere(`[data-bhand="${undo.dataset.bundo}"]`);
    }).catch(err => {
      const code = String((err && err.message) || '');
      if (code === 'UNDO_EXPIRED') delete BoardUI.handed[undo.dataset.bundo];
      toast({ key:'board', bad:true, title:'Not taken back', detail:Handover.message(code) });
      if (Handover.OFFLINE.includes(code)) return release(undo, 'Undo');
      reloadBoardHere(AFTER_REFUSAL);
    });
    return;
  }

  const claim = e.target.closest('[data-claim]');
  if (claim){
    if (claim.disabled) return;
    const rid = claim.dataset.claim;
    const prize = (Store.rewards.find(r => r.id === rid) || {}).name || 'reward';
    const name = armed => claim.setAttribute('aria-label', armed ? `Confirm: claim ${prize}` : `Claim ${prize}`);
    /* a claim cannot be taken back, so it takes a second, deliberate tap */
    if (!claim.dataset.armed){
      claim.dataset.armed = String(Date.now());
      claim.textContent = 'Confirm claim';
      name(true);
      /* it stays armed until the reader moves on, not on a timer */
      claim.addEventListener('blur', () => {
        if (claim.disabled) return;
        delete claim.dataset.armed;
        claim.textContent = 'Claim';
        name(false);
      }, { once:true });
      return;
    }
    /* a double-tap is one touch, not two: a confirm this soon after the
       arming is not taken */
    if (Date.now() - Number(claim.dataset.armed) < 400) return;
    claim.disabled = true;
    const who = Store.user && Store.user.id;
    const landed = r => {
      /* signed out (or someone else) since: not this page's news */
      if (!Store.user || Store.user.id !== who) return;
      /* a reader who has moved on is not pulled back to Rewards */
      if (current === 'rewards'){
        go('rewards', { instant:true });
        FX.claimStamp($(`[data-reward="${rid}"]`));
      }
      setTimeout(() => toast({ key:'claim', title:`${r.name} claimed`,
        detail:Store.handovers ? 'Collect it from an officer at a meeting.' : '' }), 260);
    };
    Store.claimReward(rid).then(landed).catch(async err => {
      delete claim.dataset.armed;
      claim.textContent = 'Claim';
      name(false);
      claim.disabled = false;
      const msg = String((err && err.message) || '');
      /* refused on this page, which counts fewer stamps: nothing was sent */
      if (/not earned/i.test(msg))
        return toast({ key:'claim', bad:true, title:'Could not claim', detail:'This reward is not earned yet.' });
      /* a session that ended says so once, on the key Sign in uses */
      if (/not signed/i.test(msg) || await sessionGone())
        return toast({ key:'auth', bad:true, title:'Could not claim',
                       detail:'You are no longer signed in here. Sign in again to claim.' });
      /* the record as it is now: the claim may have landed with its
         answer lost, or the stamps may have changed since the page loaded */
      await Store.hydrate({ keep:true });
      const now = Store.rewards.find(r => r.id === rid);
      if (now && now.claimed) return landed(now);
      const refused = (err && err.code === '42501') || /row-level security/i.test(msg);
      toast({ key:'claim', bad:true, title:'Could not claim',
        detail:refused ? 'This reward is not earned. Your stamp count has changed.'
             : 'The claim was not saved. Check your connection and try again.' });
    });
    return;
  }

});

let boardStamp = false;

/* A write refused because the session is gone (signed out on another
   device, a refresh the server refused, another account in another
   tab): the record is read again, which takes the page to Sign in, or
   to the account now signed in. False when this account is still here
   or the check itself could not be made. */
async function sessionGone(){
  let now;
  try { now = await Backend.currentSession(); } catch (_) { return false; }
  if (now && Store.user && now.id === Store.user.id) return false;
  Store.hydrate();
  return true;
}

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

  /* what this read is for is decided now, and its answer is written
     only if no later read has begun: a slow detail that lands after the
     officer changed page is dropped, not shown on the new page */
  const kind = BoardUI.memberDetail === 'pending' ? 'member'
             : BoardUI.meetingDetail === 'pending' ? 'meeting'
             : BoardUI.tab === 'progress' ? 'progress' : 'meetings';
  let got = null, error = null;
  try {
    if (kind === 'member') got = await Backend.board('member', { id:BoardUI.pendingId });
    else if (kind === 'meeting') got = await Backend.board('meeting', { id:BoardUI.pendingId });
    else if (kind === 'progress'){
      /* the prize list failing never takes the roster down with it */
      /* the prize list is read when the chapter opens and after a
         hand-over, not again for each search keystroke or page turn */
      got = await Promise.all([
        BoardUI.prizes && !BoardUI.prizes.code && !BoardUI.prizesStale ? BoardUI.prizes
          : Backend.board('prizes').catch(e => ({ code:String((e && e.message) || 'SERVER_ERROR') })),
        Backend.board('members', { q:BoardUI.q, sort:BoardUI.sort, page:BoardUI.page }),
      ]);
    } else got = await Backend.board('meetings');
  } catch (err){
    error = String(err.message || 'SERVER_ERROR');
  }

  if (seq !== loadSeq) return;
  BoardUI.error = error;
  if (!error){
    if (kind === 'member') BoardUI.memberDetail = got;
    else if (kind === 'meeting') BoardUI.meetingDetail = got;
    else if (kind === 'progress'){ [BoardUI.prizes, BoardUI.members] = got; BoardUI.prizesStale = false; }
    else BoardUI.meetings = got;
  }
  if (BoardUI.error === 'NOT_AUTHENTICATED') Store.hydrate();
  /* a meeting that no longer exists (deleted by another officer) is not
     retried: back to the list, which says so */
  if (BoardUI.error === 'MEETING_NOT_FOUND' && BoardUI.meetingDetail === 'pending'){
    BoardUI.loading = false;
    return boardGoto({ error:null, meetingDetail:null, confirmDelete:null, deleteNote:'MEETING_NOT_FOUND' });
  }
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
    /* a detail opened from far down a list starts at its own top, with
       its heading and Back in view */
    if (BoardUI.toTop && !error){ BoardUI.toTop = false; try { scrollTo(0, 0); } catch (_) {} }
    /* "a || b": the first of these the page now has */
    if (BoardUI.refocus){
      BoardUI.refocus.split('||').map(q => $(q.trim())).find(Boolean)?.focus({ preventScroll:true });
      BoardUI.refocus = null;
    }
  }

  if (BoardUI.tab === 'session' && !BoardUI.error && $('#qrBox')){
    paintBoard();
    paintAttendanceCount(boardMeeting);
  } else if (BoardUI.tab === 'session' && !BoardUI.error && boardMeeting && $('[data-bstart]')){
    watchClosedStage(boardMeeting);
  } else {
    clearInterval(countTimer);
  }

  if (boardStamp){
    boardStamp = false;
    if (BoardUI.tab === 'session' && !BoardUI.error) FX.boardSeal();
  }
}

/* The name typed to stamp someone by hand is looked up on the server.
   Only the newest search is shown; the list under the field is
   repainted alone, so the field keeps its focus and caret. A function
   deployed before `find` existed is asked through the roster search. */
let handSeq = 0;
async function handSearch(q, meetingId){
  const seq = ++handSeq;
  let res;
  try { res = await Backend.board('find', { q, meeting_id:meetingId }); }
  catch (e){
    if (String(e && e.message) === 'INVALID_REQUEST'){
      try {
        const r = await Backend.board('members', { q, page:1 });
        res = { people:(r.members || []).slice(0, 8).map(m =>
          ({ id:m.id, name:m.username, username:m.username, board:false, checked_in:false })) };
      } catch (_){ res = { code:'SERVER_ERROR' }; }
    } else res = { code:String((e && e.message) || 'SERVER_ERROR') };
  }
  if (seq !== handSeq || BoardUI.handQ !== q) return;
  BoardUI.handFound = res;
  paintHandList();
}
function paintHandList(){
  const box = $('.hand__found'), d = BoardUI.meetingDetail;
  if (box && d && d.meeting) box.innerHTML = BoardUI.handList(d.meeting);
}

/* after a refusal re-reads the list: the next thing to hand over, or
   the member page's way back */
const AFTER_REFUSAL = '.owed [data-bhand], .brow--reward [data-bhand], [data-bback], .owed .meetband__t';

/* a two-tap button back at rest after a request that never landed */
function unarm(btn, label){
  release(btn, label);
  delete btn.dataset.armed;
  btn.setAttribute('aria-label', btn.dataset.bstamp
    ? `Add ${btn.dataset.who} to GM ${btn.dataset.no}` : `Hand ${btn.dataset.prize} to ${btn.dataset.who}`);
  btn.closest('.brow')?.classList.remove('brow--armed');
  btn.focus({ preventScroll:true });
}

/* re-read what the pane shows, in place: the member open in it, or
   the chapter's list */
function reloadBoardHere(refocus = null){
  BoardUI.prizesStale = true;
  const m = BoardUI.memberDetail && BoardUI.memberDetail.member;
  const g = BoardUI.meetingDetail && BoardUI.meetingDetail.meeting;
  boardGoto(m ? { memberDetail:'pending', pendingId:m.id, refocus }
          : g ? { meetingDetail:'pending', pendingId:g.id, refocus }
          : { refocus });
}

function boardGoto(next){
  Object.assign(BoardUI, next);
  loadBoard();
}

function paintMotion(){
  $$('[data-motion]').forEach(b => {
    b.setAttribute('aria-pressed', String(Motion.forced));
    /* one control, one name: Reduce motion, pressed while it is on */
    b.innerHTML = '<i aria-hidden="true"></i><span>Reduce motion</span>';
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
  if (b) b.textContent = on ? 'Exit full screen' : 'Full screen';
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
  Scanner.stop(); clearInterval(countTimer); TodayWatch.stop();
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
    /* the record may take a while: whatever lifts the cover finds this,
       never an empty page */
    const view = $('#view');
    if (view && !view.firstChild)
      view.innerHTML = '<div class="view"><p class="kicker" role="status">Loading the club records</p></div>';
    await Backend.init();
    await Store.hydrate();

    /* A session that ends or changes under the page (signed out on
       another device, a refresh the server refused, another account
       signed in in another tab) is read again; the page follows. */
    if (Backend.live) SupabaseAdapter.onAuthChange((event, uid) => {
      if (!Store.ready || Store.signingOut || Store.signingIn) return;
      const was = Store.user ? Store.user.id : null;
      if (event === 'SIGNED_OUT' ? was !== null : uid !== null && uid !== was) Store.hydrate();
    });

    let shownUser = Store.user ? Store.user.id : null;
    /* The record changed: the page is repainted only if what it shows
       would differ, and Scan only refreshes its meeting line, so the
       camera is never restarted under the reader. */
    Store.onChange(() => {
      const uid = Store.user ? Store.user.id : null;
      const switched = Boolean(shownUser && uid && uid !== shownUser);
      if (uid !== shownUser){ if (shownUser) BoardUI.reset(); shownUser = uid; }
      /* no signed-in page stays up without a session (the page's own
         sign-out takes itself to Sign in, after its scene) */
      if (!Store.signedIn && current !== 'auth' && !Store.signingOut){
        Scanner.stop(); clearInterval(countTimer); TodayWatch.stop();
        go('auth', { instant:true, force:true });
        paintIdentity();
        if (!Store.failed && !liveToasts.has('auth')) toast({ key:'auth', title:'Signed out', detail:'Sign in again to continue.' });
        return;
      }
      /* signed in from another tab while this one showed the form, or
         another account signed in here: the page is that account's (a
         Scan left up would otherwise check in whoever is signed in now) */
      if ((Store.signedIn && current === 'auth' && !Store.signingIn) || switched){
        if (switched){ Scanner.stop(); clearInterval(countTimer); }
        go(switched ? current : 'home', { instant:true, force:true });
        paintIdentity();
        return;
      }
      /* during a page cut, the page it is going to: repainting the one
         being left would send the reader back to it */
      const here = navigating && heading ? heading : current;
      if (here === 'scan'){
        paintScanStanding();
        /* stamped from elsewhere while the camera is up: nothing to scan */
        if (Scanner.stream && !Landing.active && Scanner.stamped()){
          Scanner.stop(); go('scan', { instant:true, force:true, quiet:true });
        }
      }
      else if (here && here !== 'auth' && Store.stamp() !== painted)
        go(here, { instant:true, force:true, quiet:true });   /* force: not dropped if it lands mid-cut */
      paintIdentity();
      TodayWatch.sync();
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
      } else Store.hydrate({ keep:true });
    });

    paintBrand();
    paintIdentity();
    paintMotion();
    go(hashRoute(), { instant:true });
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
