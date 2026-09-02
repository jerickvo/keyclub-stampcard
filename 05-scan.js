"use strict";

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

function paintBoard(){
  const box = $('#qrBox');
  if (!box) return;

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

let countTimer = null;
function paintAttendanceCount(meetingId){
  clearInterval(countTimer);
  const el = () => document.querySelector('#attCount');
  const pull = async () => {
    if (!el()) return clearInterval(countTimer);

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

const Scanner = {
  stream:null, raf:null, cv:null, ctx:null, locked:false, frame:0,

  setState(state, msg){
    const ret = $('#reticle'), el = $('#scanMsg'), viewer = $('#viewer');
    if (el){
      el.textContent = msg;
      el.classList.toggle('viewer__msg--hot', state === 'hit' || state === 'good');
      el.classList.toggle('viewer__msg--soft',
        state === 'bad' || state === 'boot' || state === 'busy');
    }
    if (ret){
      ret.classList.toggle('reticle--live', state === 'live');
      ret.classList.toggle('reticle--good', state === 'good' || state === 'hit');
      ret.classList.toggle('reticle--bad',  state === 'bad');

      ret.classList.toggle('reticle--busy', state === 'busy');
    }

    viewer?.classList.toggle('viewer--hit', state === 'good' || state === 'hit');

    if (viewer){
      viewer.classList.remove('viewer--bad');
      if (state === 'bad'){ void viewer.offsetWidth; viewer.classList.add('viewer--bad'); }
    }
  },

  async start(){
    const video = $('#cam');
    if (!video) return;
    this.locked = false;

    $('#viewer')?.classList.remove('viewer--stalled', 'viewer--feed');
    this.setState('boot', 'Starting camera');
    this.showLoader();

    if (!navigator.mediaDevices?.getUserMedia) return this.stall('unsupported');

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 } }, audio:false });
    } catch (err) {
      return this.stall(err && err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
    }
    if (!document.body.contains(video)) return this.stop();

    this.hideLoader();
    video.srcObject = this.stream;
    try { await video.play(); } catch (_) {}

    $('#viewer')?.classList.add('viewer--feed');

    this.cv = document.createElement('canvas');
    this.ctx = this.cv.getContext('2d', { willReadFrequently:true });
    this.setState('live', 'Looking for the check-in code');
    this.loop(video);
  },

  showLoader(){
    const ret = $('#reticle');
    if (!ret || $('#camLoader')) return;
    const l = document.createElement('div');
    l.className = 'loader'; l.id = 'camLoader';

    ret.classList.add('reticle--wait');

    l.innerHTML = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor"
        stroke-width="3" aria-hidden="true">
      <circle cx="50" cy="50" r="42" stroke-dasharray="42 90"/>
      <circle cx="50" cy="50" r="30" stroke-dasharray="24 70" opacity=".5"/></svg>`;
    ret.appendChild(l);
  },
  hideLoader(){ $('#camLoader')?.remove(); $('#reticle')?.classList.remove('reticle--wait'); },

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

  stall(kind){
    const viewer = $('#viewer');
    if (!viewer) return;
    this.hideLoader();
    viewer.classList.remove('viewer--feed');

    const copy = {
      denied:{ title:'Camera permission is off',
        body:'Allow camera access for this page in your browser settings, then reload. Or enter the code below.' },
      unavailable:{ title:'No camera found',
        body:'Nothing on this device is reporting a camera. Enter the check-in code below instead.' },
      unsupported:{ title:'Scanning needs a secure page',
        body:'Camera access only works over https. Enter the check-in code below instead.' },
    }[kind];

    viewer.innerHTML = `<div class="stall">
      <h2 class="stall__title">${copy.title}</h2>
      <p class="stall__note">${copy.body}</p>
    </div>`;

    viewer.classList.add('viewer--stalled');
    $('#manualInput')?.focus({ preventScroll:true });
  },

  stop(){
    cancelAnimationFrame(this.raf); this.raf = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null; this.locked = false;
    $('#viewer')?.classList.remove('viewer--feed');
  },
};

let pendingCell = -1;

const SCAN_MESSAGES = {
  INVALID_TOKEN:       ['Not a valid code',      'That code is not from Keystamp. Scan the one on the board screen.'],
  EXPIRED_TOKEN:       ['Code expired',          'That code is no longer valid. Scan the code on the board screen, or ask a board member.'],
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
  if (!QRFormat.looksLikeKeystamp(raw)){
    const [t, d] = scanMessage('INVALID_TOKEN');
    toast({ key:'scan', title:t, detail:d, bad:true });
    if (fromCamera) rejectVisual('INVALID_TOKEN');
    return;
  }

  if (fromCamera) Scanner.setState('busy', 'Checking with the server');

  const result = await Backend.verifyCode(raw);

  if (!result || !result.ok){
    const code = (result && result.code) || 'SERVER_ERROR';
    const [t, d] = scanMessage(code);

    toast({ key:'scan', title:t, detail:d, bad:true });
    if (fromCamera) rejectVisual(code);
    return;
  }

  dropToast('scan');
  Scanner.setState('good', 'Verified');
  Scanner.stop();

  await Store.hydrate();

  pendingCell = Rules.progress().filled - 1;
  const meeting = Store.meeting(result.meeting_id) ||
                  { id:result.meeting_id, no:result.meeting_number };
  FX.stampAcquire(meeting, () => go('home', { instant:true }));
}

function rejectVisual(code){
  Scanner.setState('bad', scanMessage(code)[0]);
  FX.scanReject();
  setTimeout(() => {
    if (!$('#reticle')) return;
    Scanner.locked = false;
    Scanner.setState('live', 'Looking for the check-in code');
  }, 1900);
}
