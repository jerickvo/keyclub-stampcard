#!/usr/bin/env node
// Scan's camera, reading the wall's code the way a phone in the room
// sees it: the code the projector really draws (the app's own qrSVG, the
// full-length signed link), set into a portrait 1080x1920 camera feed
// with a projected code's grey blacks and dim whites, a little blur,
// grain and tilt, at the size it takes in the frame from a seat.
//
// Each test is its own browser, because the camera is a file Chromium
// is given at launch. The page is served as https://keystamp.vercel.app/
// from this checkout through Playwright's routing (nothing leaves the
// machine), so a code's link is read exactly as on a member's phone; the
// club's records are the test double (mock-supabase.js).
//
// Run: python3 build.py && node --test tools-test-camera.mjs
// Needs Playwright and a Chromium it can launch; without one, every test
// is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch (_) {}
const skip = chromium ? false : 'Playwright is not installed';
const MOCK = readFileSync(path.join(ROOT, 'mock-supabase.js'), 'utf8');
const APP = 'https://keystamp.vercel.app/';

/* ── the code the projector draws ─────────────────────────────────── */
const read = f => readFileSync(path.join(ROOT, f), 'utf8');
const el = () => ({ dataset:{}, classList:{ add(){}, remove(){}, toggle(){} }, style:{}, setAttribute(){}, getAttribute(){ return null; }, textContent:'' });
const app = vm.createContext({
  window:{}, navigator:{}, console, URL, atob, setTimeout, clearTimeout, setInterval, clearInterval,
  document:{ documentElement:el(), body:{ contains(){ return false; } }, querySelector(){ return null; },
             querySelectorAll(){ return []; }, addEventListener(){}, createElement:el },
  matchMedia:() => ({ matches:false }), performance:{ now:() => 0 }, requestAnimationFrame(){}, cancelAnimationFrame(){},
  localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
});
vm.runInContext(read('qrcode.js') + '\nwindow.qrcode = qrcode;\n' +
  ['01a-backend.js', '01-core.js', '02-motion.js', '03-views.js', '05-scan.js'].map(read).join('\n') +
  '\nthis.__x = { QRFormat, qrSVG };', app);
const { QRFormat, qrSVG } = app.__x;

/* ids as long as the real ones, so the code is as dense as the real one */
const SESSION = '6a1f0c2e-3b1d-4c8e-9f7a-0e2d4c6b8a91';
const MEETING = '9b3e5d7f-1a2c-4e6b-8d0f-2c4e6a8b0d13';
const clubDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone:'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
const b64u = t => Buffer.from(t).toString('base64url');
/* the double's verifier takes any signature that starts SERVERSIG; this
   one is as long as an HMAC-SHA256's */
const BARE = `${b64u(`${SESSION}.${MEETING}.${Date.parse(clubDay() + 'T23:59:59-08:00')}`)}.SERVERSIG${'0'.repeat(34)}`;
const LINK = QRFormat.link('keystamp://a/' + BARE);

/* the dark modules of the app's own drawing of that link, quiet zone and all */
function wallCode(){
  const svg = qrSVG(LINK);
  const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)[1]);
  const dark = new Uint8Array(size * size);
  for (const [, c, r] of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) dark[Number(r) * size + Number(c)] = 1;
  return { size, dark };
}

/* ── a camera feed of it ──────────────────────────────────────────── */
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
/* one portrait frame: the code across `frac` of the width, centred, a
   little turned, as a projector shows it; or, with no code, the room */
function frame(code, W, H, frac, turn){
  const DARK = 55, LIGHT = 205, ROOM = 95;
  const img = new Float32Array(W * H);
  const mod = code ? W * frac / code.size : 1, ca = Math.cos(turn), sa = Math.sin(turn);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    if (!code){ img[y * W + x] = ROOM + 40 * Math.sin(x / 90) * Math.cos(y / 140); continue; }
    let acc = 0;
    for (let s = 0; s < 4; s++){
      const px = x + (s & 1 ? .75 : .25) - W / 2, py = y + (s & 2 ? .75 : .25) - H / 2;
      const u = (ca * px + sa * py) / mod + code.size / 2, v = (-sa * px + ca * py) / mod + code.size / 2;
      acc += (u < 0 || v < 0 || u >= code.size || v >= code.size) ? ROOM
        : code.dark[Math.floor(v) * code.size + Math.floor(u)] ? DARK : LIGHT;
    }
    img[y * W + x] = acc / 4;
  }
  /* the lens and the projector's own softness: a box blur, twice */
  const tmp = new Float32Array(W * H);
  for (let pass = 0; pass < 2; pass++){
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const a = img[y * W + Math.max(0, x - 1)], b = img[y * W + x], c = img[y * W + Math.min(W - 1, x + 1)];
      tmp[y * W + x] = (a + b + c) / 3;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const a = tmp[Math.max(0, y - 1) * W + x], b = tmp[y * W + x], c = tmp[Math.min(H - 1, y + 1) * W + x];
      img[y * W + x] = (a + b + c) / 3;
    }
  }
  const Y = Buffer.alloc(W * H);
  for (let i = 0; i < Y.length; i++) Y[i] = Math.max(16, Math.min(235, img[i] + (rnd() - .5) * 12));
  return Y;
}
/* a looping .y4m Chromium plays as the camera */
function feed(dir, name, { frac = 0, W = 1080, H = 1920 } = {}){
  const code = frac ? wallCode() : null;
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < 2; i++) parts.push(Buffer.from('FRAME\n'), frame(code, W, H, frac, (i ? .05 : -.04)), chroma);
  const file = path.join(dir, name + '.y4m');
  writeFileSync(file, Buffer.concat(parts));
  return file;
}

/* ── a member at the meeting ──────────────────────────────────────── */
function club(){
  const t0 = new Date(Date.now() - 400 * 864e5).toISOString();
  const day = clubDay();
  return {
    users:[{ id:'u_alice', email:'alice@keystamp.invalid', password:'password1' }],
    profiles:[{ id:'u_alice', username:'alice', display_name:'Alice', role:'member', created_at:t0 }],
    meetings:[{ id:MEETING, meeting_number:9, meeting_date:day, start_time:'12:40 PM', end_time:'11:59 PM', location:'MPR', check_in_open:true }],
    attendance:[], reward_claims:[], reward_handovers:[],
    sessions:[{ id:SESSION, meeting_id:MEETING, ended_at:null }],
  };
}

let dir = null;
const tmp = () => (dir = dir || mkdtempSync(path.join(os.tmpdir(), 'keystamp-cam-')));
process.on('exit', () => { if (dir) rmSync(dir, { recursive:true, force:true }); });

/* Alice, signed in, on Scan, with `camera` as her camera; `init` runs in
   the page before the app does */
async function onScan(camera, { init = '' } = {}){
  try { statSync(path.join(ROOT, 'index.html')); } catch (_) { throw new Error('index.html is missing: run python3 build.py'); }
  const browser = await chromium.launch({ args:['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${camera}`] });
  const ctx = await browser.newContext({ viewport:{ width:390, height:844 } });
  await ctx.grantPermissions(['camera'], { origin:APP.slice(0, -1) });
  await ctx.route(/supabase\.co|vercel-insights|vercel\.com/, r => r.abort());
  await ctx.route(APP + '**', r => {
    const p = new URL(r.request().url()).pathname;
    if (p === '/' || p === '/index.html') return r.fulfill({ status:200, contentType:'text/html', body:readFileSync(path.join(ROOT, 'index.html')) });
    return r.fulfill({ status:404, body:'' });
  });
  const db = club();
  await ctx.addInitScript({ content:`
    window.KEYSTAMP_SUPABASE_URL = 'https://mockproject.supabase.co';
    window.KEYSTAMP_SUPABASE_ANON_KEY = '${'k'.repeat(64)}';
    try { if (!sessionStorage.getItem('__seeded')){
      localStorage.setItem('__keystamp_mock_db', ${JSON.stringify(JSON.stringify(db))});
      localStorage.setItem('sb-mock-auth-token', JSON.stringify({ access_token:'mock.u_alice', refresh_token:'r',
        expires_at:Math.floor(Date.now() / 1000) + 3600, user:{ id:'u_alice', email:'alice@keystamp.invalid' } }));
      sessionStorage.setItem('__seeded', '1'); } } catch (_) {}
    window.__errors = [];
    addEventListener('error', e => window.__errors.push(String(e.message)));
    addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason && e.reason.message || e.reason)));
    ${init}
    ${MOCK}` });
  const page = await ctx.newPage();
  await page.goto(APP);
  await page.waitForFunction(() => typeof booted !== 'undefined' && booted && Store.ready && Store.signedIn
    && !document.querySelector('#boot:not(.is-done), .scene--welcome'), null, { timeout:20000 });
  await page.click('#tabs [data-go="scan"]');
  return { browser, page };
}
/* the code was read and stamped: one row, and the page went on to Home */
const stamped = page => page.waitForFunction(id =>
  __mockDB.attendance.filter(a => a.meeting_id === id && a.user_id === 'u_alice').length === 1, MEETING, { timeout:15000 })
  .then(() => true, () => false);

test('the projector draws the code with as few modules as the link allows', () => {
  const { size } = wallCode();
  // 49 modules and the quiet zone: the full-length link at error
  // correction L. At M the same link takes 57, every module a seventh smaller
  assert.equal(LINK, APP + '#/a/' + BARE);
  assert.equal(size, 49 + 8);
});

test('a projected code read from a seat: about a fifth of the frame wide', { skip, timeout:60000 }, async () => {
  const { browser, page } = await onScan(feed(tmp(), 'seat', { frac:.21 }));
  try {
    assert.equal(await stamped(page), true, 'the code was not read');
    assert.deepEqual(await page.evaluate(() => window.__errors), []);
  } finally { await browser.close(); }
});

test('a code close up, larger than the middle of the frame, is still read', { skip, timeout:60000 }, async () => {
  const { browser, page } = await onScan(feed(tmp(), 'close', { frac:.86 }));
  try { assert.equal(await stamped(page), true, 'the code was not read'); }
  finally { await browser.close(); }
});

test('a decoder worker that sees nothing does not leave Scan blind', { skip, timeout:60000 }, async () => {
  // a worker that takes every frame and never finds anything, the way a
  // browser that hands it blank or garbled frames would
  const blind = `window.Worker = class { constructor(){ this.onmessage = null; this.onerror = null; }
    postMessage(m){ try { (m.frame || m.bitmap).close(); } catch (_) {}
      setTimeout(() => this.onmessage && this.onmessage({ data:{ text:null } }), 30); }
    terminate(){} };`;
  const { browser, page } = await onScan(feed(tmp(), 'blind', { frac:.45 }), { init:blind });
  try {
    assert.equal(await stamped(page), true, 'the code was never read');
    assert.equal(await page.evaluate(() => Decoder.off), true, 'the blind worker was kept');
  } finally { await browser.close(); }
});

test('a camera frame handed to the worker on its side is not squeezed out of shape', { skip, timeout:60000 }, async () => {
  // what a phone held upright can hand over: the camera's own landscape
  // buffer, while the <video> reports the upright size
  const sideways = `if (window.VideoFrame){ const VF = window.VideoFrame;
    window.VideoFrame = function(src){ const w = src.videoWidth, h = src.videoHeight;
      const c = new OffscreenCanvas(h, w), x = c.getContext('2d');
      x.translate(h, 0); x.rotate(Math.PI / 2); x.drawImage(src, 0, 0);
      return new VF(c, { timestamp:0 }); }; }`;
  const { browser, page } = await onScan(feed(tmp(), 'side', { frac:.28 }), { init:sideways });
  try { assert.equal(await stamped(page), true, 'the code was not read'); }
  finally { await browser.close(); }
});

test('a camera that reads nothing for a while says how to get a read', { skip, timeout:60000 }, async () => {
  const { browser, page } = await onScan(feed(tmp(), 'room', { frac:0 }), {
    init:`addEventListener('DOMContentLoaded', () => { try { Scanner.HINTS = [600, 1400]; } catch (_) {} });` });
  try {
    await page.waitForFunction(() => /closer/i.test(document.querySelector('#scanMsg').textContent), null, { timeout:10000 });
    await page.waitForFunction(() => /Camera app/i.test(document.querySelector('#scanMsg').textContent), null, { timeout:10000 });
    assert.equal(await page.evaluate(() => document.querySelector('#scanLine').classList.contains('scanline--live')), true);
  } finally { await browser.close(); }
});
