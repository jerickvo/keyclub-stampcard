"use strict";

function qrSVG(text){
  if (!window.qrcode) return null;
  let qr;
  try { qr = qrcode(0, 'M'); qr.addData(text); qr.make(); }
  catch (_) { return null; }
  const n = qr.getModuleCount(), q = 4, size = n + q * 2;   /* the spec's quiet zone */
  let d = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"
    role="img" aria-label="Attendance QR code for this meeting">
    <rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

let boardMeeting = null;
/* the meeting an officer picked (or just closed) on the stage; the
   default is chosen again on every read */
let boardPicked = null;

/* A code on the wall lasts a short while (the server says how long and
   refuses it after that), and the wall asks for the next one well before
   then. Until when, on this device's clock, the code shown is worth
   scanning: a code with only seconds left is taken down, not left up
   for a phone to be told it expired. */
let qrRetry = null, qrExpire = null;
let qrGoodUntil = 0, qrDue = Infinity;
/* the code last put on the wall, for a repaint of the pane to put back */
let qrShown = null;
const QR_MARGIN = 5000;
function paintBoard(attempt = 0){
  const box = $('#qrBox');
  clearTimeout(qrRetry);
  if (!box) return;

  const meeting = boardMeeting;
  const again = (ms, next) => {
    clearTimeout(qrRetry);
    qrDue = Date.now() + ms;
    qrRetry = setTimeout(() => {
      if (document.body.contains(box) && boardMeeting === meeting) paintBoard(next);
    }, ms);
  };
  Backend.issueToken(meeting).then(({ token, lifeMs, refreshMs }) => {
    if (!document.body.contains(box) || boardMeeting !== meeting) return;
    const svg = qrSVG(token);
    box.innerHTML = svg || `<p class="qrpanel__fail">The code could not be drawn. Reload the page.</p>`;
    qrShown = { meeting, svg };
    qrGoodUntil = lifeMs ? Date.now() + lifeMs - QR_MARGIN : Infinity;
    clearTimeout(qrExpire);
    if (lifeMs) qrExpire = setTimeout(takeDownQR, Math.max(0, qrGoodUntil - Date.now()));
    if (refreshMs) again(refreshMs, 0); else qrDue = Infinity;
  }).catch(() => {
    if (!document.body.contains(box)) return;
    /* a code still good stays up; otherwise the wall says it is trying
       again, and does, while it is showing this meeting */
    if (!box.querySelector('svg') || Date.now() >= qrGoodUntil)
      box.innerHTML = `<p class="qrpanel__fail" role="status">Could not load the code. Trying again.</p>`;
    again(Math.min(30000, 3000 * 2 ** attempt), attempt + 1);
  });
}
function takeDownQR(){
  const box = $('#qrBox');
  if (box && box.querySelector('svg') && Date.now() >= qrGoodUntil)
    box.innerHTML = `<p class="qrpanel__fail" role="status">Getting a new code.</p>`;
}
/* a wall put away (a sleeping laptop, a hidden tab) whose timers were
   held back asks for its next code as soon as it is seen again */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !$('#qrBox')) return;
  takeDownQR();
  if (Date.now() >= qrDue) paintBoard();
});

let countTimer = null;
/* A closed stage for today's meeting learns, slowly, that check-in was
   opened from another tab or device, as an open one learns of a close. */
function watchClosedStage(meetingId){
  clearInterval(countTimer);
  const day = Schedule.today();
  const here = () => document.querySelector(`[data-bstart="${meetingId}"]`);
  countTimer = setInterval(async () => {
    if (!here()) return clearInterval(countTimer);
    if (document.hidden) return;
    if (Schedule.today() !== day){ clearInterval(countTimer); loadBoard(); return; }
    let open;
    try { open = await Backend.meetingOpen(meetingId); } catch (_) { return; }
    if (open === true && here() && !busy(here())){ clearInterval(countTimer); dropToast('board', true); loadBoard(); }
  }, 10000);
}
function paintAttendanceCount(meetingId){
  clearInterval(countTimer);
  const el = () => document.querySelector('#attCount');
  /* the club's midnight ends the day's code (the verifier refuses it
     as another day's), so the stage is read again and says Left open */
  const day = Schedule.today();
  const pull = async () => {
    if (!el()) return clearInterval(countTimer);
    if (Schedule.today() !== day){ clearInterval(countTimer); loadBoard(); return; }
    if (document.hidden) return;

    /* a failed poll keeps the last count on the wall; the next poll
       tries again. Check-in closed from another device takes the stage
       back to Closed, and the wall with it. */
    let text, open;
    try {
      [text, open] = await Promise.all([
        Backend.attendanceCount(meetingId).then(String),
        Backend.meetingOpen(meetingId)]);
    }
    catch (_) { return; }
    const node = el();
    if (!node) return clearInterval(countTimer);
    if (node.textContent !== text) node.textContent = text;
    if (open === false){ clearInterval(countTimer); boardStamp = true; loadBoard(); }
  };
  pull();
  countTimer = setInterval(pull, 3000);
}

/* The line printed under the viewer: which meeting a scan would stamp.
   It is re-read from the record whenever the record changes, so a
   check-in that opens or closes while the camera is up is reflected. */
function scanStanding(){
  const open = Store.openMeeting();
  const done = open && Store.attended(open.id);
  if (Store.failed || Scanner.unsure === Store.applied) return { lab:'Record not loaded', at:'Check your connection' };
  return !open || done
    ? { lab:'Check-in', at:open ? `GM ${pad(open.no)} stamped` : 'Not open' }
    : { lab:'Checking in to', at:`GM ${pad(open.no)}` };
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
  /* the last code the server refused; while it stays in view it is not
     sent again, so a refusal is said once, not every two seconds */
  refused:null, forgive:null, lastBad:null,
  /* Store.applied when a re-read the scan needed failed: until a read
     gets through, the line under the camera says the record is not loaded */
  unsure:null,

  stamped(){
    const o = Store.openMeeting();
    return Boolean(o && Store.attended(o.id));
  },

  setState(state, msg){
    const ret = $('#reticle'), el = $('#scanMsg'), line = $('#scanLine');
    if (el) el.textContent = msg;
    if (line){
      const tone = state === 'hit' ? 'good' : state;
      ['boot', 'live', 'busy', 'good', 'bad', 'off'].forEach(s =>
        line.classList.toggle('scanline--' + s, s === tone));
    }
    if (ret){
      ret.classList.toggle('reticle--good', state === 'hit' || state === 'busy');
      ret.classList.toggle('reticle--bad',  state === 'bad');
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
    this.refused = null; this.lastBad = null; clearTimeout(this.forgive);

    $('#viewer')?.classList.remove('viewer--stalled');
    $('#viewer .stall')?.remove();

    this.setState('boot', 'Starting camera');
    this.showLoader();

    if (!navigator.mediaDevices?.getUserMedia) return this.stall('unsupported');

    Decoder.start();

    /* a permission sheet left open, or a camera wedged by another app,
       never answers; after ten seconds the page says so and offers the
       camera again */
    const slow = setTimeout(() => { if (run === this.run) this.stall('failed'); }, 10000);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 } }, audio:false });
    } catch (err) {
      clearTimeout(slow);
      if (run !== this.run) return;
      const name = err && err.name;
      return this.stall(name === 'NotAllowedError' ? 'denied' : name === 'NotFoundError' ? 'unavailable' : 'failed');
    }
    clearTimeout(slow);
    if (run === this.run && $('#viewer .stall')){
      $('#viewer')?.classList.remove('viewer--stalled');
      $('#viewer .stall')?.remove();
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
    this.trackOff = new AbortController();
    if (track) track.addEventListener('ended', () => {
      if (run !== this.run || this.stream !== stream) return;
      this.stop();
      this.stall('ended');
    }, { once:true, signal:this.trackOff.signal });

    this.hideLoader();
    video.srcObject = this.stream;
    try { await video.play(); } catch (_) {}
    if (run !== this.run) return;

    this.cv = document.createElement('canvas');
    this.ctx = this.cv.getContext('2d', { willReadFrequently:true });
    this.setState('live', 'Scanning');
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

    l.innerHTML = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor"
        stroke-width="3" aria-hidden="true">
      <circle cx="50" cy="50" r="42" stroke-dasharray="42 90"/>
      <circle cx="50" cy="50" r="30" stroke-dasharray="24 70" opacity=".5"/></svg>`;
    ret.appendChild(l);
  },
  hideLoader(){ $('#camLoader')?.remove(); },

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
    if (run !== this.run || this.locked || text === this.refused) return;
    this.locked = true;
    /* the frame holds on the code that was read while it is checked */
    try { $('#cam')?.pause(); } catch (_) {}
    this.setState('hit', 'Code read');
    FX.scanLock();
    submitSeal(text, run);
  },

  /* back to reading, on the same run, after a refusal */
  resume(run){
    if (run !== this.run) return;
    this.locked = false;
    try { $('#cam')?.play()?.catch(() => {}); } catch (_) {}
  },

  stall(kind){
    const viewer = $('#viewer');
    if (!viewer) return;
    this.hideLoader();

    const copy = {
      denied:{ title:'Camera permission is off', retry:true,
        body:'Allow the camera in browser settings.' },
      ended:{ title:'Camera stopped', retry:true,
        body:'Check camera access, then try again.' },
      unavailable:{ title:'No camera found', retry:true,
        body:'Scan the code from a phone.' },
      unsupported:{ title:'Camera blocked on this page', retry:false, body:'' },
    }[kind] || { title:'Camera unavailable', retry:true, body:'Close other apps using the camera, then try again.' };

    /* The note sits over the viewer; the video stays in place, so the
       camera can be offered again without a reload. */
    viewer.querySelector('.stall')?.remove();
    viewer.insertAdjacentHTML('beforeend', `<div class="stall">
      <h2 class="stall__title">${copy.title}</h2>
      <p class="stall__note">${copy.body}</p>
      ${copy.retry ? `<button class="link stall__retry" type="button" data-scan-retry>Try again</button>` : ''}
    </div>`);

    viewer.classList.add('viewer--stalled');
    this.setState('off', copy.body ? `${copy.title}. ${copy.body}` : copy.title);
  },

  stop(){
    this.run++;
    clearTimeout(this.armTimer); this.armTimer = null;
    cancelAnimationFrame(this.raf); this.raf = null;
    if (this.zoom) this.zoom.drop();
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null; this.locked = false;
    clearTimeout(this.forgive);
    /* nothing of the run is kept: its listener, the frame canvas, the
       video's hold on the stream */
    this.trackOff?.abort(); this.trackOff = null;
    this.cv = null; this.ctx = null;
    const cam = $('#cam'); if (cam) cam.srcObject = null;
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
    /* only as far as needed: a full card's figure and punch stay in view */
    try { cell.scrollIntoView({ block:'nearest', inline:'nearest', behavior:'instant' }); }
    catch (_) { try { cell.scrollIntoView(); } catch (__) {} }
  },

  /* a read that fails keeps the card on screen (the stamp is on file) */
  async refresh(tries){
    for (let i = 0; i < tries; i++){
      if (await Store.reread({ keep:true }) && !Store.failed) return true;
      await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
    return false;
  },

  async run(meeting){
    const seq = ++this.seq;
    const who = Store.user && Store.user.id;
    this.active = true;
    this.armed = null;
    if (this.scene) this.scene.clear();

    const scene = FX.stampAcquire(meeting);
    this.scene = scene;
    const held = new Promise(r => setTimeout(r, Motion.off ? 750 : 900));
    /* the record is waited for a bounded time, well inside the cover's
       own fuse; the stamp is on file either way */
    const read = Promise.race([this.refresh(3), new Promise(r => setTimeout(() => r(false), 5000))]);
    const [fresh] = await Promise.all([read, held]);
    if (seq !== this.seq) return;
    /* another account signed in during the hold: the stamp was the last
       one's, and is not put on this card or announced to this person */
    if (!Store.user || Store.user.id !== who){
      scene.clear();
      this.armed = null; this.active = false; this.scene = null;
      return;
    }
    /* the record did not come back in time: the page shows the stamp
       the verifier accepted, not a "Check in" for a meeting already done */
    if (!fresh){
      Store.noteStamp(meeting.id);
      toast({ key:'stamp', title:`Checked in to GM ${pad(meeting.no)}`,
              detail:'Your card will update when the connection returns.' });
    }

    /* The reader may have left Scan during the hold. The record is
       fresh either way; the page they chose is not taken from them. */
    if (current !== 'scan'){
      scene.clear();
      this.armed = null; this.active = false; this.scene = null;
      if (!fresh && Store.signedIn){
        if (current !== 'auth') go(current, { instant:true, force:true, quiet:true });
        Store.hydrate({ keep:true });
      }
      return;
    }

    pendingStamp = { meetingId:meeting.id };
    go('home', { instant:true });
    pendingStamp = null;

    const cell = this.armed;
    this.armed = null;
    this.active = false;
    this.scene = null;

    scene.lift(() => {
      if (seq !== this.seq) return;
      if (cell && document.body.contains(cell)) FX.stampLand(cell);
      if (!fresh) Store.hydrate({ keep:true });
    });
  },
};

/* [what happened, what to do]; the scan line under the camera prints
   both, and nothing else repeats them */
const SCAN_MESSAGES = {
  INVALID_TOKEN:       ['Not a Keystamp code',     ''],
  EXPIRED_TOKEN:       ['Code expired',            ''],
  MEETING_NOT_FOUND:   ['No matching meeting',     'Ask a board member'],
  MEETING_NOT_ACTIVE:  ['Check-in not open',       ''],
  ATTENDANCE_CLOSED:   ['Check-in has ended',      ''],
  STALE_CODE:          ['Old code',                'Scan the code on screen now'],
  WRONG_DAY:           ['Code is for another day', ''],
  ALREADY_CHECKED_IN:  ['Already checked in',      ''],
  PROFILE_NOT_READY:   ['Account not ready',       'Hold the code in view'],
  NOT_AUTHENTICATED:   ['Sign in first',           ''],
  NOT_AUTHORIZED:      ['Not allowed',             'This account cannot check in'],
  NETWORK_ERROR:       ['No connection',           'Check your signal'],
  VERIFIER_UNAVAILABLE:['Check-in unavailable',    'Tell a board member'],
  SERVER_ERROR:        ['Not recorded',            'Hold the code in view'],
  NO_BACKEND:          ['Not connected',           ''],
};
const scanMessage = code => SCAN_MESSAGES[code] || SCAN_MESSAGES.SERVER_ERROR;
/* refusals that may pass on a second try; the same code is sent again,
   quietly, after a short wait */
const SCAN_TRANSIENT = new Set(['NETWORK_ERROR', 'SERVER_ERROR', 'VERIFIER_UNAVAILABLE', 'PROFILE_NOT_READY']);
/* refusals that mean the record on this page is out of date */
const SCAN_STALE = new Set(['ALREADY_CHECKED_IN', 'ATTENDANCE_CLOSED', 'MEETING_NOT_ACTIVE', 'WRONG_DAY']);

/* A code whose check is still on its way is not sent again for the
   same account: a second read of it (the member left Scan and came
   back, or a repeat call) waits for that answer, and only the call that
   asked lands the stamp. Keyed by account and code. */
const sealsAsked = new Map();
/* codes whose last check got no answer: the server may have stamped
   them before the answer was lost */
const sealsUnanswered = new Set();

/* `run` is the camera run that read the code; the refusal, if any, is
   shown on that run and no other. */
async function submitSeal(raw, run = Scanner.run){
  if (!QRFormat.looksLikeKeystamp(raw)) return rejectVisual('INVALID_TOKEN', raw, run);

  Scanner.setState('busy', 'Checking');
  const uid = Store.user && Store.user.id;
  const key = `${uid}|${raw}`;
  let asked = sealsAsked.get(key);
  const first = !asked;
  if (first){ asked = Backend.verifyCode(raw, uid); sealsAsked.set(key, asked); }
  const result = await asked;
  if (first) sealsAsked.delete(key);
  /* another account is signed in now: this answer was the last one's,
     and the page has moved to the new account's Scan */
  if (!Store.user || Store.user.id !== uid) return;

  let code = result && result.ok ? null : ((result && result.code) || 'SERVER_ERROR');
  /* "already checked in", right after a check that got no answer, to a
     meeting this page has no stamp for: the lost answer was this stamp */
  if (code === 'ALREADY_CHECKED_IN' && sealsUnanswered.has(key) &&
      result.meeting_id && !Store.attended(result.meeting_id)) code = null;
  if (first){
    if (code === 'NETWORK_ERROR' || code === 'SERVER_ERROR') sealsUnanswered.add(key);
    else sealsUnanswered.delete(key);
  }

  if (code){
    /* refused as signed out: the record is read again, and the page
       goes to Sign in if the session is over */
    if (SCAN_STALE.has(code) || code === 'NOT_AUTHENTICATED'){
      const read = Store.reread({ keep:true });
      /* if the record could not be read again, the line under the
         camera no longer vouches for it: it says the record is not
         loaded until a read gets through */
      read.then(got => {
        if (got || !Store.user || Store.user.id !== uid) return;
        Scanner.unsure = Store.applied;
        paintScanStanding();
      });
      /* an ended session's code while check-in is open again (closed
         and reopened): it is the code that is old, not the check-in.
         Only a record read just now says so, and the refusal is not
         held for long waiting for it. */
      if (code === 'ATTENDANCE_CLOSED'){
        const got = await Promise.race([read, new Promise(r => setTimeout(() => r(false), 4000))]);
        if (got && Store.openMeeting()) code = 'STALE_CODE';
      }
    }
    return rejectVisual(code, raw, run);
  }
  if (!first) return;

  const meeting = Store.meeting(result.meeting_id) ||
                  { id:result.meeting_id, no:result.meeting_number, place:Schedule.PLACE };
  /* said on the live line, under the scene, so a screen reader hears it */
  Scanner.setState('good', `Stamp acquired. GM ${pad(meeting.no)}`);
  Scanner.stop();
  await Landing.run(meeting);
}

/* The refusal is shown on the camera run that read the code and stays
   on the line until another code is read; a run that has since been
   stopped or restarted is left alone. */
function rejectVisual(code, raw, run = Scanner.run){
  if (run !== Scanner.run) return;
  const [what, todo] = scanMessage(code);
  Scanner.setState('bad', todo ? `${what}. ${todo}` : what);
  /* the same refusal again, after a quiet retry, is not shaken twice */
  if (Scanner.lastBad !== code + raw) FX.scanReject();
  Scanner.lastBad = code + raw;
  Scanner.refused = raw;
  clearTimeout(Scanner.forgive);
  if (SCAN_TRANSIENT.has(code))
    Scanner.forgive = setTimeout(() => { if (run === Scanner.run) Scanner.refused = null; }, 4000);
  Scanner.resume(run);
}
