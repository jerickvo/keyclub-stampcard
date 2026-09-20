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

/* The line printed under the viewer: which meeting a scan would stamp.
   It is re-read from the record whenever the record changes, so a
   check-in that opens or closes while the camera is up is reflected. */
function scanStanding(){
  const open = Store.openMeeting();
  const done = open && Store.attended(open.id);
  return !open
    ? { lab:'Nothing open', at:'No check-in right now' }
    : done
      ? { lab:'Already stamped', at:`GM ${pad(open.no)}` }
      : { lab:'Checking in to', at:`GM ${pad(open.no)} / ${fmtDay(open.date)} / ${esc(open.place)}` };
}
function paintScanStanding(){
  const s = scanStanding();
  const lab = $('.standing__lab'), at = $('.standing__at');
  if (lab) lab.textContent = s.lab;
  if (at) at.innerHTML = s.at;
}

/* The decode is the one thing on this page heavy enough to drop frames:
   drawImage + getImageData + jsQR ran on the main thread every third
   frame and took about three quarters of it. It runs in a worker now.

   A worker normally wants its own URL, which the single-file build has
   nothing to serve. This one is built from a Blob URL instead, so there
   is still nothing to fetch — and a Blob worker does construct from
   file://, where the blob simply inherits the page's opaque origin, so
   a page opened off a zip mount keeps its fast decode too. The worker
   gets the decoder by reading the text of the <script> the build
   inlined it into, and each frame is handed over rather than copied
   (see `send`), so the pixels never cross the wire.

   Every piece of that is checked before it is used, and a worker that
   throws or goes quiet is dropped for good: `loop` below then does the
   old inline decode, which is what the page always did. */
const DECODE_WORKER = `
var cv = null, cx = null;
self.onmessage = function(e){
  var m = e.data, img;
  try {
    if (!cv || cv.width !== m.w || cv.height !== m.h){
      cv = new OffscreenCanvas(m.w, m.h);
      cx = cv.getContext('2d', { willReadFrequently:true });
    }
    cx.drawImage(m.frame, 0, 0, m.w, m.h);
    m.frame.close();
    img = cx.getImageData(0, 0, m.w, m.h);
  } catch (_){ try { m.frame.close(); } catch (__){} self.postMessage({ fail:1 }); return; }
  var hit = null;
  try { hit = jsQR(img.data, m.w, m.h, { inversionAttempts:'dontInvert' }); }
  catch (_){}
  self.postMessage({ text: hit && hit.data ? hit.data : null });
};
`;

const Decoder = {
  worker:null, url:null, off:false, sent:null, handoff:null,

  /* The decoder's source, read back from the inlined <script>. In the
     multi-file dev layout that script has a src and no text of its own,
     so there is nothing to give a worker and the inline path is used. */
  source(){
    const el = document.querySelector('script[data-file$="jsQR.js"]');
    const text = el && !el.src ? el.textContent : '';
    return text && text.length > 1000 ? text : null;
  },

  /* Built while the camera is still opening, so the first frame does
     not wait on a cold worker. It outlives Scanner.stop(): coming back
     to Scan is common, and a second build is pure delay. */
  start(){
    if (this.worker || this.off) return;
    const able = typeof Worker === 'function' &&
      (typeof VideoFrame === 'function' || typeof createImageBitmap === 'function');
    const lib = able ? this.source() : null;
    if (!lib) return void (this.off = true);
    this.handoff = typeof VideoFrame === 'function' ? 'frame' : 'bitmap';
    try {
      this.url = URL.createObjectURL(new Blob([lib, DECODE_WORKER], { type:'text/javascript' }));
      this.worker = new Worker(this.url);
    } catch (_) { return this.drop(); }
    this.worker.onerror = () => this.drop();
    this.worker.onmessage = e => {
      const msg = e.data || {}, sent = this.sent;
      this.sent = null;
      if (msg.fail) return this.drop();
      if (!sent || sent.run !== Scanner.run) return;
      if (msg.text) Scanner.hit(msg.text, sent.run);
    };
  },

  /* One frame in flight at a time. A phone that cannot keep up should
     decode less often, not stack frames up behind the worker. */
  ready(){
    if (!this.worker) this.start();
    if (!this.worker) return false;
    if (!this.sent) return true;
    if (performance.now() - this.sent.at < 2500) return false;
    this.drop();                       // answered nothing: it is not coming
    return false;
  },

  /* Getting the frame out of the <video> is the only main-thread work
     left, and the two ways of doing it are not close. A VideoFrame is a
     handle on the frame the video already holds and costs nothing;
     createImageBitmap has to copy and rescale the frame here first,
     about 25ms on a throttled phone — still far better than the 35ms
     drawImage alone used to cost, so it stays as the second choice.
     Either one is transferred, so no pixels are copied to the worker. */
  send(video, w, h, run){
    this.sent = { run, at:performance.now() };
    if (this.handoff === 'frame'){
      let frame = null;
      try { frame = new VideoFrame(video); }
      /* Some browsers have the class but will not make a frame out of a
         <video>; one refusal settles it on the copy for good, because a
         handoff that always throws would scan nothing and say nothing. */
      catch (_) { this.handoff = typeof createImageBitmap === 'function' ? 'bitmap' : null; }
      if (frame) return this.hand(frame, w, h, run);
      if (!this.handoff){ this.sent = null; return this.drop(); }
    }
    createImageBitmap(video, { resizeWidth:w, resizeHeight:h, resizeQuality:'low' })
      .then(frame => this.hand(frame, w, h, run))
      /* A frame that failed because the camera was stopped out from
         under it is a race, not a broken worker; only a run that is
         still live condemns it. */
      .catch(() => { if (run === Scanner.run) this.drop(); else this.sent = null; });
  },

  hand(frame, w, h, run){
    if (!this.worker || run !== Scanner.run){ frame.close(); this.sent = null; return; }
    try { this.worker.postMessage({ frame, w, h }, [frame]); }
    catch (_) { try { frame.close(); } catch (__) {} this.drop(); }
  },

  drop(){
    this.off = true;
    if (this.worker){ this.worker.terminate(); this.worker = null; }
    if (this.url){ URL.revokeObjectURL(this.url); this.url = null; }
    this.sent = null;
  },
};

const Scanner = {
  stream:null, raf:null, cv:null, ctx:null, locked:false, frame:0, zoom:null, run:0, armTimer:null,

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

  /* The camera is opened after the page cut has finished, never under it:
     getUserMedia and the first frames are heavy enough to be seen as a
     stutter, and the viewer already says it is starting. */
  armStart(){
    clearTimeout(this.armTimer);
    this.armTimer = Transit.after(() => { this.armTimer = null; this.start(); });
  },

  async start(){
    const video = $('#cam');
    if (!video) return;
    const run = ++this.run;
    this.locked = false;

    $('#viewer')?.classList.remove('viewer--stalled', 'viewer--feed');
    $('#viewer .stall')?.remove();
    this.setState('boot', 'Starting camera');
    this.showLoader();

    if (!navigator.mediaDevices?.getUserMedia) return this.stall('unsupported');

    Decoder.start();

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

    /* Permission revoked or the device taken mid-scan: the track ends.
       The page says so and offers the camera again, instead of holding
       a dead feed under a live reticle. */
    const track = stream.getVideoTracks()[0];
    if (track) track.addEventListener('ended', () => {
      if (run !== this.run || this.stream !== stream) return;
      this.stop();
      this.stall('ended');
    }, { once:true });

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

  /* Reading a frame costs real time on a phone -- tens of milliseconds --
     and it is spent on the main thread, where it competes with whatever is
     animating. Two rules keep it out of the way.

     A read never starts while the page is moving: a cut into or out of
     Scan, a scene, or the stamp landing. Those last a few hundred
     milliseconds and a code on a wall is not going anywhere.

     Between reads the loop rests for as long as the last read took. So the
     decoder can never take more than about half the main thread, and it
     tunes itself: a quick phone reads often, a slow one reads less often
     rather than dropping every frame trying. */
  paused(){
    return (typeof Scenes !== 'undefined' && Scenes.busy)
        || (typeof Landing !== 'undefined' && Landing.active)
        || (typeof Transit !== 'undefined' && Transit.running)
        || (typeof current !== 'undefined' && current !== 'scan');
  },

  loop(video, run){
    const REST = 1;        /* the inline fallback rests 1x its last read */
    const FLOOR = 40;
    let next = 0;
    /* What the page always did, kept for a browser the worker cannot
       serve. There the read is expensive, so it is the one that rests. */
    const inline = (w, h) => {
      const at = performance.now();
      this.cv.width = w; this.cv.height = h;
      this.ctx.drawImage(video, 0, 0, w, h);
      let img;
      try { img = this.ctx.getImageData(0, 0, w, h); }
      catch (_) { next = performance.now() + FLOOR; return; }
      const found = jsQR(img.data, w, h, { inversionAttempts:'dontInvert' });
      next = performance.now() + Math.max(FLOOR, (performance.now() - at) * REST);
      if (found && found.data) this.hit(found.data, run);
    };
    const step = () => {
      if (run !== this.run) return;
      this.raf = requestAnimationFrame(step);
      if (this.locked || video.readyState !== 4 || !window.jsQR) return;
      if (this.paused()) return;
      const w = 480, h = Math.round(video.videoHeight / video.videoWidth * w) || 480;
      if (Decoder.ready()){
        if ((this.frame++ % 3) !== 0) return;
        Decoder.send(video, w, h, run);
        return;
      }
      if (!Decoder.off) return;                   /* a frame is still with the worker */
      if (performance.now() < next) return;
      this.frame++;
      inline(w, h);
    };
    step();
  },

  /* A code was read -- off the worker or off the inline path, and on a
     camera run that is still the current one. */
  hit(text, run){
    if (run !== this.run || this.locked) return;
    this.locked = true;
    this.setState('hit', 'Locked');
    FX.scanLock();
    setTimeout(() => submitSeal(text, true, run), 190);
  },

  stall(kind){
    const viewer = $('#viewer');
    if (!viewer) return;
    this.hideLoader();
    viewer.classList.remove('viewer--feed');

    const more = MANUAL_ENTRY ? ' Or enter the check-in code below.' : '';
    const copy = {
      denied:{ title:'Camera permission is off', retry:true,
        body:'Allow camera access for this page in your browser settings, then try again.' + more },
      ended:{ title:'Camera stopped', retry:true,
        body:'The camera feed ended. Check that camera access is still allowed, then try again.' + more },
      unavailable:{ title:'No camera found', retry:true,
        body:'This device has no camera.' + (MANUAL_ENTRY
          ? ' Enter the check-in code below instead.'
          : ' Sign in on a phone with a camera to scan the code.') },
      unsupported:{ title:'Scanning needs a secure page', retry:false,
        body:'Camera access only works over https.' + more },
    }[kind] || { title:'Camera off', retry:true, body:'The camera could not be started.' + more };

    /* The note sits over the viewer; the video stays in place, so the
       camera can be offered again without a reload. */
    viewer.querySelector('.stall')?.remove();
    viewer.insertAdjacentHTML('beforeend', `<div class="stall">
      <h2 class="stall__title">${copy.title}</h2>
      <p class="stall__note">${copy.body}</p>
      ${copy.retry ? `<button class="link stall__retry" type="button" data-scan-retry>Try again</button>` : ''}
    </div>`);

    viewer.classList.add('viewer--stalled');
    this.setState('off', 'Camera off');
    $('#manualInput')?.focus({ preventScroll:true });
  },

  stop(){
    this.run++;
    clearTimeout(this.armTimer); this.armTimer = null;
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

    /* The reader may have left Scan during the hold. The record is
       fresh either way; the page they chose is not taken from them. */
    if (current !== 'scan'){
      scene.clear();
      this.armed = null; this.active = false; this.scene = null;
      if (!fresh) Store.hydrate();
      return;
    }

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

/* `run` is the camera run that read the code; the refusal, if any, is
   shown on that run and no other. */
async function submitSeal(raw, fromCamera, run = Scanner.run){
  if (!QRFormat.looksLikeKeystamp(raw)){
    const [t, d] = scanMessage('INVALID_TOKEN');
    toast({ key:'scan', title:t, detail:d, bad:true });
    if (fromCamera) rejectVisual('INVALID_TOKEN', run);
    return;
  }

  if (fromCamera) Scanner.setState('busy', 'Checking with the server');

  const result = await Backend.verifyCode(raw);

  if (!result || !result.ok){
    const code = (result && result.code) || 'SERVER_ERROR';
    const [t, d] = scanMessage(code);

    toast({ key:'scan', title:t, detail:d, bad:true });
    if (fromCamera) rejectVisual(code, run);
    return;
  }

  dropToast('scan');
  Scanner.setState('good', 'Verified');
  Scanner.stop();

  const meeting = Store.meeting(result.meeting_id) ||
                  { id:result.meeting_id, no:result.meeting_number, place:Schedule.PLACE };
  await Landing.run(meeting);
}

/* The refusal is shown on the camera run that read the code; a run
   that has since been stopped or restarted is left alone. */
function rejectVisual(code, run = Scanner.run){
  if (run !== Scanner.run) return;
  Scanner.setState('bad', scanMessage(code)[0]);
  FX.scanReject();
  setTimeout(() => {
    if (run !== Scanner.run || !$('#reticle')) return;
    Scanner.locked = false;
    Scanner.setState('live', 'Looking for the check-in code');
  }, 1900);
}
