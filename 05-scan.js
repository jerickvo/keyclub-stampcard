"use strict";
/* keystamp — QR encoding and the camera scanner state machine
   Loaded in order by index.html. Order matters. */

/* ══════════════════════════════════════════════════════════════════
   10b. QR ENCODING — draws the string the scanner is looking for.
   Pure black on white with a quiet zone, because that is what phone
   cameras decode most reliably. It also happens to be the most manga
   thing on the site, so it is left undecorated on purpose.
   ══════════════════════════════════════════════════════════════════ */
function qrSVG(text){
  if (!window.qrcode) return null;
  let qr;
  try { qr = qrcode(0, 'M'); qr.addData(text); qr.make(); }
  catch (_) { return null; }
  const n = qr.getModuleCount(), q = 3, size = n + q * 2;
  let d = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"
    role="img" aria-label="Attendance QR code for this meeting">
    <rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

let boardMeeting = null;
let boardTimer = null;

function paintBoard(){
  clearInterval(boardTimer);
  const box = $('#qrBox');
  if (!box) return;

  /* ONE code per meeting, fetched once.
     The server derives the token from the meeting itself, so asking
     again returns the same string — there is nothing to rotate and no
     timer to keep alive. The board still cannot mint a code: if the
     server is unreachable the screen says so rather than drawing
     something that only looks valid. */
  Backend.issueToken(boardMeeting).then(({ token }) => {
    if (!document.body.contains(box)) return;
    const svg = qrSVG(token);
    box.innerHTML = svg || `<p class="qrpanel__fail">The QR encoder did not load. Ask members
      to check in at the door instead.</p>`;
  }).catch(() => {
    if (!document.body.contains(box)) return;
    box.innerHTML = `<p class="qrpanel__fail">Could not reach the attendance server.</p>`;
  });
}

/* Board attendance count, straight from the database. Polled on a slow
   interval rather than a realtime socket: a general meeting check-in lasts minutes
   and a count that is a few seconds stale is fine, whereas a socket per
   board device is a connection to keep alive for no real gain. */
let countTimer = null;
function paintAttendanceCount(meetingId){
  clearInterval(countTimer);
  const el = () => document.querySelector('#attCount');
  const pull = async () => {
    if (!el()) return clearInterval(countTimer);
    /* Resolve the count first, then look the element up again. The node
       can be gone by the time the request lands — the board navigated
       away mid-flight — and the old code called el().textContent inside
       the catch without re-checking, so a failed request after leaving
       the screen threw a TypeError out of an async function. That became
       an unhandled rejection, which Guard reports as a red error bar
       over an app that is working fine. */
    let text;
    try { text = String(await Backend.attendanceCount(meetingId)); }
    catch (_) { text = '—'; }
    const node = el();
    if (!node) return clearInterval(countTimer);
    node.textContent = text;
  };
  pull();
  countTimer = setInterval(pull, 6000);
}

/* ══════════════════════════════════════════════════════════════════
   11. SCANNER — an explicit state machine, so every outcome has a look.
   ══════════════════════════════════════════════════════════════════ */
const Scanner = {
  stream:null, raf:null, cv:null, ctx:null, locked:false, frame:0,

  setState(state, msg){
    const ret = $('#reticle'), el = $('#scanMsg'), viewer = $('#viewer');
    if (el){
      el.textContent = msg;
      el.classList.toggle('viewer__msg--hot', state === 'hit' || state === 'good');
      el.classList.toggle('viewer__msg--soft', state === 'bad' || state === 'boot');
    }
    if (ret){
      ret.classList.toggle('reticle--live', state === 'live');
      ret.classList.toggle('reticle--good', state === 'good' || state === 'hit');
      ret.classList.toggle('reticle--bad',  state === 'bad');
    }
    viewer?.classList.toggle('viewer--hit', state === 'good' || state === 'hit');
  },

  async start(){
    const video = $('#cam');
    if (!video) return;
    this.locked = false;
    this.setState('boot', 'Starting camera');
    this.showLoader();

    if (!navigator.mediaDevices?.getUserMedia) return this.stall('unsupported');

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 } }, audio:false });
    } catch (err) {
      return this.stall(err && err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
    }
    if (!document.body.contains(video)) return this.stop();   /* navigated away mid-await */

    this.hideLoader();
    video.srcObject = this.stream;
    try { await video.play(); } catch (_) {}

    this.cv = document.createElement('canvas');
    this.ctx = this.cv.getContext('2d', { willReadFrequently:true });
    this.setState('live', 'Searching for meeting seal');
    this.loop(video);
  },

  showLoader(){
    const ret = $('#reticle');
    if (!ret || $('#camLoader')) return;
    const l = document.createElement('div');
    l.className = 'loader'; l.id = 'camLoader';
    l.style.cssText = 'position:absolute;inset:0;margin:auto';
    l.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="42" stroke-dasharray="52 220" stroke-linecap="round"/>
      <circle cx="50" cy="50" r="30" stroke-dasharray="28 160" stroke-linecap="round" opacity=".5"/></svg>`;
    ret.appendChild(l);
  },
  hideLoader(){ $('#camLoader')?.remove(); },

  loop(video){
    const step = () => {
      this.raf = requestAnimationFrame(step);
      if (this.locked || video.readyState !== 4 || !window.jsQR) return;
      if ((this.frame++ % 3) !== 0) return;
      const w = 340, h = Math.round(video.videoHeight / video.videoWidth * w) || 340;
      this.cv.width = w; this.cv.height = h;
      this.ctx.drawImage(video, 0, 0, w, h);
      let img;
      try { img = this.ctx.getImageData(0, 0, w, h); } catch (_) { return; }
      const hit = jsQR(img.data, w, h, { inversionAttempts:'dontInvert' });
      if (hit && hit.data){
        this.locked = true;
        this.setState('hit', 'Locked');
        FX.scanLock();
        setTimeout(() => submitSeal(hit.data, true), 190);
      }
    };
    step();
  },

  /* the camera cannot run — say exactly why, and what to do instead */
  stall(kind){
    const viewer = $('#viewer');
    if (!viewer) return;
    this.hideLoader();
    const copy = {
      denied:{ icon:ICON.lock, title:'Camera permission is off',
        body:'Allow camera access for this page in your browser settings, then reload. Or type the code below.' },
      unavailable:{ icon:ICON.camera, title:'No camera found',
        body:'Nothing on this device is reporting a camera. Type the code printed under the seal instead.' },
      unsupported:{ icon:ICON.keypad, title:'Scanning needs a secure page',
        body:'Camera access only works over https. Type the code printed under the seal instead.' },
    }[kind];

    viewer.innerHTML = `<div class="stack">
      <div class="stack__icon">${copy.icon}</div>
      <div><h2 class="h2">${copy.title}</h2>
        <p class="muted" style="margin-top:9px;font-size:13.5px;line-height:1.6">${copy.body}</p></div>
    </div>`;
    viewer.style.aspectRatio = 'auto';
    viewer.style.minHeight = '230px';
    $('#manualInput')?.focus({ preventScroll:true });
  },

  stop(){
    cancelAnimationFrame(this.raf); this.raf = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null; this.locked = false;
  },
};

/* ── one path for every code, camera or keyboard ─────────────────────
   Both the camera and the manual field land here, and here sends the
   raw payload to the server. The client no longer decides anything:
   it cannot compute a valid token, so it cannot grant a stamp. */
let pendingCell = -1;

/* Server verdicts → sentences a student can act on. Nothing here
   leaks a stack trace, a column name or a row id. */
const SCAN_MESSAGES = {
  INVALID_TOKEN:       ['Not a valid code',      'That code is not from Keystamp. Scan the one on the board screen.'],
  EXPIRED_TOKEN:       ['Code expired',          'The code refreshes every few seconds. Scan the one showing right now.'],
  MEETING_NOT_FOUND:   ['No matching meeting',   'Keystamp has no meeting for that code. Ask a board member.'],
  MEETING_NOT_ACTIVE:  ['Check-in not open',     'This meeting is not taking check-ins yet.'],
  ATTENDANCE_CLOSED:   ['Check-in has ended',    'Attendance for this meeting is closed. A board member can add you.'],
  WRONG_DAY:           ['Wrong day',             'That code is for a different meeting date.'],
  ALREADY_CHECKED_IN:  ['Already checked in',    'Your stamp for this general meeting is already recorded.'],
  PROFILE_NOT_READY:   ['Account still setting up','Your account was made seconds ago. Wait a moment and scan again.'],
  NOT_AUTHENTICATED:   ['Sign in first',         'Sign in to record your attendance.'],
  NOT_AUTHORIZED:      ['Not allowed',           'Your account cannot check in to this meeting.'],
  NETWORK_ERROR:       ['No connection',         'Keystamp could not reach the server. Check your signal and try again.'],
  VERIFIER_UNAVAILABLE:['Check-in unavailable',  'Attendance verification is not running. Tell a board member.'],
  SERVER_ERROR:        ['Something went wrong',  'Keystamp could not check that code. Try again in a moment.'],
  NO_BACKEND:          ['Not connected',         'This build has no backend configured, so check-in is unavailable.'],
};
const scanMessage = code => SCAN_MESSAGES[code] || SCAN_MESSAGES.SERVER_ERROR;

async function submitSeal(raw, fromCamera){
  /* a cheap local shape check so an unrelated QR never becomes a
     network round trip. It proves nothing — the server still decides. */
  if (!QRFormat.looksLikeKeystamp(raw)){
    const [t, d] = scanMessage('INVALID_TOKEN');
    toast({ key:'scan', title:t, detail:d, bad:true });
    if (fromCamera) rejectVisual('Seal rejected');
    return;
  }

  if (fromCamera) Scanner.setState('busy', 'Checking with the server');

  const result = await Backend.verifyCode(raw);

  if (!result || !result.ok){
    const code = (result && result.code) || 'SERVER_ERROR';
    const [t, d] = scanMessage(code);
    /* keyed: rapid rescans of a bad code replace, never pile up */
    toast({ key:'scan', title:t, detail:d, bad:true });
    if (fromCamera) rejectVisual(code === 'EXPIRED_TOKEN' ? 'Seal expired' : 'Seal rejected');
    return;
  }

  /* A rejection toast may still be on screen from a previous attempt; the
     scan has now succeeded, so drop it rather than let the two contradict
     each other side by side. */
  dropToast('scan');
  Scanner.setState('good', 'Verified');
  Scanner.stop();
  pendingCell = Rules.progress().filled;

  /* The server already inserted the row. Re-read from the database so
     the count, the record and the rewards all come from stored data
     rather than from an optimistic client increment. */
  await Store.hydrate();
  const meeting = Store.meeting(result.meeting_id) ||
                  { id:result.meeting_id, no:result.meeting_number };
  FX.stampAcquire(meeting, () => go('home'));
}

function rejectVisual(label){
  Scanner.setState('bad', label);
  FX.scanReject();
  setTimeout(() => {
    if (!$('#reticle')) return;
    Scanner.locked = false;
    Scanner.setState('live', 'Searching for meeting seal');
  }, 1900);
}
