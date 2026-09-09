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
  stream:null, raf:null, cv:null, ctx:null, locked:false, frame:0, zoom:null, run:0,

  setState(state, msg){
    const ret = $('#reticle'), el = $('#scanMsg'), line = $('#scanLine'), viewer = $('#viewer');
    if (el) el.textContent = msg;
    if (line){
      const tone = state === 'hit' ? 'good' : state;
      ['boot', 'live', 'busy', 'good', 'bad', 'off'].forEach(s =>
        line.classList.toggle('scanline--' + s, s === tone));
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
    const run = ++this.run;
    this.locked = false;

    $('#viewer')?.classList.remove('viewer--stalled', 'viewer--feed');
    this.setState('boot', 'Starting camera');
    this.showLoader();

    if (!navigator.mediaDevices?.getUserMedia) return this.stall('unsupported');

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 } }, audio:false });
    } catch (err) {
      if (run !== this.run) return;
      return this.stall(err && err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
    }

    if (run !== this.run || !document.body.contains(video)){
      stream.getTracks().forEach(t => t.stop());
      if (run === this.run) this.stop();
      return;
    }
    this.stream = stream;

    this.hideLoader();
    video.srcObject = this.stream;
    try { await video.play(); } catch (_) {}
    if (run !== this.run) return;

    $('#viewer')?.classList.add('viewer--feed');

    this.cv = document.createElement('canvas');
    this.ctx = this.cv.getContext('2d', { willReadFrequently:true });
    this.setState('live', 'Looking for the check-in code');
    this.mountZoom();
    this.loop(video, run);
  },

  mountZoom(){
    const host = $('#viewer');
    const track = this.stream && this.stream.getVideoTracks()[0];
    if (!host || !track || typeof track.getCapabilities !== 'function') return;

    let caps = null, settings = null;
    try { caps = track.getCapabilities(); } catch (_) { return; }
    try { settings = track.getSettings(); } catch (_) { settings = null; }
    const z = caps && caps.zoom;
    if (!z || typeof z.min !== 'number' || typeof z.max !== 'number' || !(z.max > z.min)) return;

    const step = typeof z.step === 'number' && z.step > 0 ? z.step : (z.max - z.min) / 20;
    const start = settings && typeof settings.zoom === 'number' ? settings.zoom : z.min;
    const label = v => `${(Number(v) / z.min).toFixed(1)}×`;

    const el = document.createElement('div');
    el.className = 'zoom'; el.id = 'zoom';
    el.innerHTML = `<label class="zoom__lab" for="zoomRange">Zoom</label>
      <input class="zoom__range" id="zoomRange" type="range"
             min="${z.min}" max="${z.max}" step="${step}" value="${start}">
      <output class="zoom__val" for="zoomRange">${label(start)}</output>`;
    host.appendChild(el);
    host.classList.add('viewer--zoom');

    const range = el.querySelector('input'), out = el.querySelector('output');
    let timer = null, want = start;
    const drop = () => {
      clearTimeout(timer); timer = null;
      el.remove(); host.classList.remove('viewer--zoom');
      if (this.zoom && this.zoom.el === el) this.zoom = null;
    };
    const apply = () => {
      timer = null;
      if (this.stream !== track.__stream) return;
      track.applyConstraints({ advanced:[{ zoom:want }] }).catch(drop);
    };
    track.__stream = this.stream;
    range.addEventListener('input', () => {
      want = Number(range.value);
      out.textContent = label(want);
      if (timer === null) timer = setTimeout(apply, 40);
    });
    this.zoom = { el, drop };
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

  loop(video, run){
    const step = () => {
      if (run !== this.run) return;
      this.raf = requestAnimationFrame(step);
      if (this.locked || video.readyState !== 4 || !window.jsQR) return;
      if ((this.frame++ % 3) !== 0) return;
      const w = 480, h = Math.round(video.videoHeight / video.videoWidth * w) || 480;
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

    const more = MANUAL_ENTRY ? ' Or enter the check-in code below.' : '';
    const copy = {
      denied:{ title:'Camera permission is off',
        body:'Allow camera access for this page in your browser settings, then reload.' + more },
      unavailable:{ title:'No camera found',
        body:'This device has no camera.' + (MANUAL_ENTRY
          ? ' Enter the check-in code below instead.'
          : ' Sign in on a phone with a camera to scan the code.') },
      unsupported:{ title:'Scanning needs a secure page',
        body:'Camera access only works over https.' + more },
    }[kind];

    viewer.innerHTML = `<div class="stall">
      <h2 class="stall__title">${copy.title}</h2>
      <p class="stall__note">${copy.body}</p>
    </div>`;

    viewer.classList.add('viewer--stalled');
    this.setState('off', 'Camera off');
    $('#manualInput')?.focus({ preventScroll:true });
  },

  stop(){
    this.run++;
    cancelAnimationFrame(this.raf); this.raf = null;
    if (this.zoom) this.zoom.drop();
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null; this.locked = false;
    $('#viewer')?.classList.remove('viewer--feed');
  },
};

let pendingStamp = null;

const Landing = {
  seq: 0,
  active: false,
  armed: null,
  scene: null,

  cellFor(meetingId){
    const p = Rules.progress();
    const chrono = [...Store.scans].sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);
    const at = chrono.findIndex(s => s.meetingId === meetingId);
    if (at < 0) return null;
    const i = at - p.floor;
    if (i < 0 || i >= p.span) return null;
    const cell = $$('#seals .seal')[i];
    return cell && cell.dataset.seal === 'set' ? cell : null;
  },

  prime(cell){
    if (!this.active || !cell) return;
    this.armed = cell;
    if (!Motion.off) cell.style.opacity = '0';
    try { cell.scrollIntoView({ block:'center', inline:'nearest', behavior:'instant' }); }
    catch (_) { try { cell.scrollIntoView(); } catch (__) {} }
  },

  async refresh(tries){
    for (let i = 0; i < tries; i++){
      await Store.hydrate();
      if (!Store.failed) return true;
      await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
    return false;
  },

  async run(meeting){
    const seq = ++this.seq;
    this.active = true;
    this.armed = null;
    if (this.scene) this.scene.clear();

    const scene = FX.stampAcquire(meeting);
    this.scene = scene;
    const held = new Promise(r => setTimeout(r, Motion.off ? 750 : 900));
    const [fresh] = await Promise.all([this.refresh(3), held]);
    if (seq !== this.seq) return;

    pendingStamp = fresh ? { meetingId:meeting.id } : null;
    go('home', { instant:true });
    pendingStamp = null;

    const cell = this.armed;
    this.armed = null;
    this.active = false;
    this.scene = null;

    scene.lift(() => {
      if (seq !== this.seq) return;
      if (cell && document.body.contains(cell)) FX.stampLand(cell);
      if (!fresh) Store.hydrate();
    });
  },
};

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

  const meeting = Store.meeting(result.meeting_id) ||
                  { id:result.meeting_id, no:result.meeting_number, place:Schedule.PLACE };
  await Landing.run(meeting);
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
