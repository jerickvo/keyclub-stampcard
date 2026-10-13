#!/usr/bin/env node
// The built index.html in a real browser, on the test double
// (mock-supabase.js): the flows and the faults the unit tests cannot
// reach. Every request to a real Supabase project or to the analytics
// host is refused, so nothing here can touch the club's records.
//
// Run: node --test tools-test-browser.mjs
// Needs Playwright and a Chromium it can launch (npm i -D playwright, or
// a global install on NODE_PATH). Without one, every test is skipped.
// Build first (python3 build.py): this tests what would be deployed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch (_) {}
const skip = chromium ? false : 'Playwright is not installed';
const MOCK = readFileSync(path.join(ROOT, 'mock-supabase.js'), 'utf8');

/* ── the club, and the place it is served from ─────────────────────── */
const clubDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone:'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
const dayShift = n => { const d = new Date(clubDay() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/* `stamps` meetings attended by alice, today's meeting (open or not), the next one */
function club({ stamps = 3, open = false } = {}){
  const t0 = new Date(Date.now() - 400 * 864e5).toISOString();
  const users = ['alice', 'bob', 'chair', 'vice'].map(u => ({ id:'u_' + u, email:u + '@keystamp.invalid', password:'password1' }));
  const profiles = [
    { id:'u_alice', username:'alice', display_name:'Alice', role:'member', created_at:t0 },
    { id:'u_bob', username:'bob', display_name:'bob', role:'member', created_at:t0 },
    { id:'u_chair', username:'chair', display_name:'chair', role:'board', created_at:t0 },
    { id:'u_vice', username:'vice', display_name:'vice', role:'board', created_at:t0 },
  ];
  const meetings = [], attendance = [], n = Math.max(stamps + 2, 4);
  for (let i = 0; i < n; i++){
    const date = dayShift(-(n - i) * 7);
    meetings.push({ id:'m_' + (i + 1), meeting_number:i + 1, meeting_date:date, start_time:'12:40 PM', end_time:'1:30 PM', location:'MPR', check_in_open:false });
    if (i < stamps) attendance.push({ id:'a_' + i, user_id:'u_alice', meeting_id:'m_' + (i + 1),
      checked_in_at:new Date(Date.parse(date + 'T20:45:00Z')).toISOString(), verification_method:'qr' });
  }
  meetings.push({ id:'m_today', meeting_number:n + 1, meeting_date:clubDay(), start_time:'12:40 PM', end_time:'11:59 PM', location:'MPR', check_in_open:open });
  meetings.push({ id:'m_next', meeting_number:n + 2, meeting_date:dayShift(7), start_time:'12:40 PM', end_time:'1:30 PM', location:'MPR', check_in_open:false });
  return { users, profiles, meetings, attendance, reward_claims:[], reward_handovers:[],
           sessions:open ? [{ id:'sess_today', meeting_id:'m_today', ended_at:null }] : [] };
}
/* a code the double's verifier takes, for today's session */
const code = () => {
  const exp = Date.parse(clubDay() + 'T23:59:59-08:00');
  const b64u = t => Buffer.from(t).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `keystamp://a/${b64u('sess_today.m_today.' + exp)}.SERVERSIGNATURE0000`;
};

let server, base, browser;
before(async () => {
  if (skip) return;
  try { statSync(path.join(ROOT, 'index.html')); } catch (_) { throw new Error('index.html is missing: run python3 build.py'); }
  server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    try { const body = readFileSync(file); res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(body); }
    catch (_) { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/index.html`;
  browser = await chromium.launch({ args:['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

/* A browser context on the double: `db` seeded once, `as` signed in at
   load (or not), the page's own errors collected. */
async function open({ db = club(), as = null, width = 390, height = 844, reduced = false, hash = '', init = '' } = {}){
  const ctx = await browser.newContext({ viewport:{ width, height }, reducedMotion:reduced ? 'reduce' : 'no-preference' });
  await ctx.route(/supabase\.co|vercel-insights|vercel\.com/, r => r.abort());
  await ctx.addInitScript({ content:`
    window.KEYSTAMP_SUPABASE_URL = 'https://mockproject.supabase.co';
    window.KEYSTAMP_SUPABASE_ANON_KEY = '${'k'.repeat(64)}';
    try { if (!sessionStorage.getItem('__seeded')){
      localStorage.setItem('__keystamp_mock_db', ${JSON.stringify(JSON.stringify(db))});
      ${as ? `localStorage.setItem('sb-mock-auth-token', JSON.stringify({ access_token:'mock.${as}', refresh_token:'r',
        expires_at:Math.floor(Date.now() / 1000) + 3600, user:{ id:'${as}', email:'x@keystamp.invalid' } }));` : ''}
      sessionStorage.setItem('__seeded', '1'); } } catch (_) {}
    window.__errors = [];
    addEventListener('error', e => window.__errors.push(String(e.message)));
    addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason && e.reason.message || e.reason)));
    ${init}
    ${MOCK}` });
  const page = await ctx.newPage();
  await page.goto(base + hash);
  return { ctx, page };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout:ms });
/* the page has opened: its record read, its opening scene gone */
const ready = page => until(page, () => typeof booted !== 'undefined' && booted && Store.ready
  && !document.querySelector('#boot:not(.is-done), .scene--welcome'), null, 12000);
async function signIn(page, user){
  await page.waitForSelector('#authUser');
  await page.fill('#authUser', user); await page.fill('#authPass', 'password1'); await page.click('#authGo');
  await until(page, () => typeof Store !== 'undefined' && Store.user && !document.querySelector('.scene--welcome'));
}
const toasts = page => page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.innerText.replace(/\s+/g, ' ').trim()));
const rows = (page, meeting = 'm_today') => page.evaluate(m => __mockDB.attendance.filter(a => a.meeting_id === m).length, meeting);
async function noErrors(page){ assert.deepEqual(await page.evaluate(() => window.__errors), [], 'the page threw'); }

/* ── accounts ──────────────────────────────────────────────────────── */
test('a record that cannot be read for the account signed in now does not show the last account\'s', { skip }, async () => {
  const db = club({ stamps:4, open:true });
  db.attendance.push({ id:'a_t', user_id:'u_alice', meeting_id:'m_today', checked_in_at:new Date().toISOString(), verification_method:'qr' });
  const { ctx, page } = await open({ db, as:'u_alice' });
  await ready(page);
  await page.evaluate(() => go('scan', { instant:true }));
  assert.equal(Boolean(await page.$('.view--scan-done')), true, 'alice sees her own stamp');
  // the tab comes back: bob is signed in now, and the read fails
  await page.evaluate(() => {
    localStorage.setItem('sb-mock-auth-token', JSON.stringify({ access_token:'mock.u_bob', refresh_token:'r',
      expires_at:Math.floor(Date.now() / 1000) + 3600, user:{ id:'u_bob', email:'bob@keystamp.invalid' } }));
    window.__failTable = 'attendance';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await until(page, () => Store.user && Store.user.id === 'u_bob');
  await wait(400);
  assert.equal(Boolean(await page.$('.view--scan-done')), false, 'bob is not shown alice\'s stamp');
  assert.equal(await page.evaluate(() => Store.totalStamps()), 0);
  await noErrors(page); await ctx.close();
});

test('an officer\'s Undo that answers after another account signs in is not announced to it', { skip }, async () => {
  const { ctx, page } = await open({ db:club({ stamps:12 }), as:'u_chair', width:1280, height:800 });
  await ready(page);
  await page.evaluate(() => go('bmembers', { instant:true }));
  await page.waitForSelector('[data-bhand="u_alice:r1"]');
  await page.click('[data-bhand="u_alice:r1"]'); await wait(450); await page.click('[data-bhand="u_alice:r1"]');
  await page.waitForSelector('[data-bundo="u_alice:r1"]');
  await page.evaluate(() => { window.__fault = { delay:{ 'rpc:undo_hand_over':2500 } }; });
  await page.click('[data-bundo="u_alice:r1"]');
  await page.evaluate(() => {
    localStorage.setItem('sb-mock-auth-token', JSON.stringify({ access_token:'mock.u_bob', refresh_token:'r',
      expires_at:Math.floor(Date.now() / 1000) + 3600, user:{ id:'u_bob', email:'bob@keystamp.invalid' } }));
    Store.hydrate();
  });
  await until(page, () => Store.user && Store.user.id === 'u_bob');
  await wait(3000);
  assert.ok(!(await toasts(page)).some(t => /hand-over|taken back/i.test(t)), 'bob hears nothing of the officer\'s Undo');
  await ctx.close();
});

test('another tab signing out takes this one to Sign in, and its next sign-in follows', { skip }, async () => {
  const { ctx, page:a } = await open({ as:'u_alice' });
  await ready(a);
  const b = await ctx.newPage(); await b.goto(base);
  await ready(b);
  await b.evaluate(() => go('profile', { instant:true }));
  await b.locator('[data-signout]').filter({ visible:true }).click();
  await until(a, () => current === 'auth');
  assert.ok((await toasts(a)).some(t => /signed out/i.test(t)));
  await signIn(b, 'bob');
  await until(a, () => Store.user && Store.user.id === 'u_bob' && current === 'home');
  await ctx.close();
});

/* ── checking in ───────────────────────────────────────────────────── */
test('a check-in whose answer was lost is recognised on the next try: one stamp, landed', { skip }, async () => {
  const { ctx, page } = await open({ db:club({ stamps:4, open:true }), as:'u_alice' });
  await ready(page);
  await page.evaluate(() => go('scan', { instant:true }));
  await page.evaluate(() => { window.__fault = { lose:{ 'fn:verify-attendance':1 } }; });
  await page.evaluate(c => submitSeal(c), code());
  await until(page, () => /No connection/.test(document.getElementById('scanMsg').textContent));
  assert.equal(await rows(page), 1, 'the server wrote it');
  await page.evaluate(c => submitSeal(c), code());
  await until(page, () => current === 'home' && !Landing.active && !document.querySelector('.acq'));
  assert.equal(await rows(page), 1);
  assert.equal(await page.evaluate(() => Store.attended('m_today')), true);
  await noErrors(page); await ctx.close();
});

test('a wall code opened on a phone already signed in: the stamp is struck after the opening, in view', { skip }, async () => {
  const bare = code().replace('keystamp://a/', '');
  const { ctx, page } = await open({ db:club({ stamps:9, open:true }), as:'u_alice', hash:'#/a/' + bare,
    init:`window.__seen = []; (function look(){ try { window.__seen.push([!!document.querySelector('.acq'), !!document.querySelector('#boot:not(.is-done)')]); } catch (_) {} requestAnimationFrame(look); })();` });
  await until(page, () => typeof Store !== 'undefined' && Store.attended('m_today') && !Landing.active && !document.querySelector('.acq'), null, 12000);
  const seen = await page.evaluate(() => window.__seen);
  assert.ok(seen.some(([acq]) => acq), 'the stamp sheet was shown');
  assert.ok(!seen.some(([acq, boot]) => acq && boot), 'never under (or over) the opening');
  assert.equal(await rows(page), 1);
  assert.equal(await page.evaluate(() => current), 'home');
  await noErrors(page); await ctx.close();
});

test('an account made from a wall code is checked in without a second scan, after its opening', { skip }, async () => {
  const bare = code().replace('keystamp://a/', '');
  const { ctx, page } = await open({ db:club({ stamps:0, open:true }), hash:'#/a/' + bare,
    init:`window.__seen = []; (function look(){ try { window.__seen.push([!!document.querySelector('.acq'), !!document.querySelector('.scene--welcome'), !!document.querySelector('.cutbox')]); } catch (_) {} requestAnimationFrame(look); })();` });
  await page.waitForSelector('[data-arrive="up"]');
  assert.equal(await page.evaluate(() => location.hash), '#/checkin', 'the code leaves the address');
  await page.click('[data-arrive="up"]'); await page.waitForSelector('#authPass2');
  await page.fill('#authUser', 'NewKid_01'); await page.fill('#authPass', 'longpassword'); await page.fill('#authPass2', 'longpassword');
  await page.click('#authGo');
  await until(page, () => Store.user && Store.attended('m_today') && !Landing.active && !document.querySelector('.acq'), null, 12000);
  const seen = await page.evaluate(() => window.__seen);
  assert.ok(seen.some(([acq]) => acq), 'the stamp sheet was shown');
  assert.ok(!seen.some(([acq, welcome]) => acq && welcome), 'not while the opening is up (no blade crosses the sheet)');
  assert.equal(await page.evaluate(() => Store.user.username), 'newkid_01');
  assert.equal(await rows(page), 1);
  await noErrors(page); await ctx.close();
});

test('an expired wall code is refused for good, and a board account is not stamped from one', { skip }, async () => {
  const exp = Date.now() - 1000;
  const b64u = t => Buffer.from(t).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const old = `${b64u('sess_today.m_today.' + exp)}.SERVERSIGNATURE0000`;
  {
    const { ctx, page } = await open({ db:club({ open:true }), hash:'#/a/' + old });
    await until(page, () => /unavailable/i.test(document.querySelector('#view').innerText));
    assert.match(await page.innerText('#view'), /Code expired/i);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('keystamp:arrival')), null, 'not kept for the next sign-in');
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ db:club({ open:true }), as:'u_chair', hash:'#/a/' + code().replace('keystamp://a/', '') });
    await until(page, () => /Board account/i.test(document.querySelector('#view').innerText));
    assert.equal(await rows(page), 0);
    await ctx.close();
  }
});

/* ── prizes and the board ──────────────────────────────────────────── */
test('a claim whose answer was lost is shown claimed, once', { skip }, async () => {
  const { ctx, page } = await open({ db:club({ stamps:10 }), as:'u_alice' });
  await ready(page);
  await page.evaluate(() => go('rewards', { instant:true }));
  await page.evaluate(() => { window.__fault = { lose:{ 'rpc:claim_reward':1 } }; });
  await page.click('[data-claim="r1"]'); await wait(450); await page.click('[data-claim="r1"]');
  await until(page, () => Store.rewards.find(r => r.id === 'r1').claimed);
  assert.equal(await page.evaluate(() => __mockDB.reward_claims.length), 1);
  await noErrors(page); await ctx.close();
});

test('a hand-over whose answer was lost is "not confirmed", and the next try finds it with its Undo', { skip }, async () => {
  const { ctx, page } = await open({ db:club({ stamps:12 }), as:'u_chair', width:1280, height:800 });
  await ready(page);
  await page.evaluate(() => go('bmembers', { instant:true }));
  await page.waitForSelector('[data-bhand="u_alice:r1"]');
  await page.evaluate(() => { window.__fault = { lose:{ 'rpc:hand_over_reward':1 } }; });
  await page.click('[data-bhand="u_alice:r1"]'); await wait(450); await page.click('[data-bhand="u_alice:r1"]');
  await until(page, () => document.querySelector('.toast--bad'));
  const said = (await toasts(page)).join(' ');
  assert.match(said, /not confirmed/i);
  assert.doesNotMatch(said, /not saved/i, 'it may well have been saved');
  await page.click('[data-bhand="u_alice:r1"]'); await wait(450); await page.click('[data-bhand="u_alice:r1"]');
  await page.waitForSelector('[data-bundo="u_alice:r1"]');
  assert.equal(await page.evaluate(() => __mockDB.reward_handovers.length), 1);
  // the Undo's answer lost too: the next try is told it was taken back
  await page.evaluate(() => { window.__fault = { lose:{ 'rpc:undo_hand_over':1 } }; });
  await page.click('[data-bundo="u_alice:r1"]');
  await until(page, () => [...document.querySelectorAll('.toast')].some(t => /not confirmed/i.test(t.innerText)));
  await page.click('[data-bundo="u_alice:r1"]');
  await until(page, () => [...document.querySelectorAll('.toast')].some(t => /taken back/i.test(t.innerText) && !t.classList.contains('toast--bad')));
  assert.equal(await page.evaluate(() => __mockDB.reward_handovers.length), 0);
  await noErrors(page); await ctx.close();
});

test('the board schedules a meeting (the double takes the request the page really makes)', { skip }, async () => {
  const { ctx, page } = await open({ as:'u_chair', width:1280, height:800 });
  await ready(page);
  await page.evaluate(() => go('bmeet', { instant:true }));
  await page.waitForSelector('[data-mform]'); await page.click('[data-mform]');
  await page.fill('#mNo', '77'); await page.fill('#mDate', dayShift(3));
  await page.fill('#mStart', '09:15'); await page.fill('#mEnd', '10:15');
  await page.click('#mGo');
  await until(page, () => __mockDB.meetings.some(m => m.meeting_number === 77));
  const m = await page.evaluate(() => __mockDB.meetings.find(m => m.meeting_number === 77));
  assert.equal(m.start_time, '9:15 AM'); assert.equal(m.end_time, '10:15 AM');
  assert.equal(m.check_in_open, false); assert.equal(m.created_by, 'u_chair');
  await noErrors(page); await ctx.close();
});

test('a stamp an officer added by hand is labelled so on the member\'s page for the board', { skip }, async () => {
  const db = club({ stamps:2 });
  db.attendance[1].verification_method = 'board';
  const { ctx, page } = await open({ db, as:'u_chair', width:1280, height:800 });
  await ready(page);
  await page.evaluate(() => go('bmembers', { instant:true }));
  await page.waitForSelector('button[data-bmember="u_alice"]'); await page.click('button[data-bmember="u_alice"]');
  await page.waitForSelector('.brow--att');
  const cells = await page.$$eval('.brow--att .brow__cell', els => els.map(e => e.textContent));
  assert.equal(cells.filter(t => /by hand/.test(t)).length, 1);
  await ctx.close();
});

/* ── print and access ──────────────────────────────────────────────── */
/* where a big figure's ink actually reaches, against every other line of text */
const INK = `(() => {
  const cv = document.createElement('canvas').getContext('2d'), hits = [];
  const owns = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const texts = [...document.querySelectorAll('main#view *')].filter(el => owns(el) && el.getClientRects().length
    && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[aria-hidden="true"],.sr-only'));
  for (const el of texts){
    const cs = getComputedStyle(el); if (parseFloat(cs.fontSize) < 36) continue;
    const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    const m = cv.measureText(t), probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    el.insertBefore(probe, [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()));
    const b = probe.getBoundingClientRect(); probe.remove();
    const ink = { l:b.left - m.actualBoundingBoxLeft, r:b.left + m.actualBoundingBoxRight, t:b.top - m.actualBoundingBoxAscent, b:b.top + m.actualBoundingBoxDescent };
    for (const o of texts){
      if (o === el || o.contains(el) || el.contains(o)) continue;
      const r = o.getBoundingClientRect();
      if (Math.min(ink.r, r.right) - Math.max(ink.l, r.left) > 1 && Math.min(ink.b, r.bottom) - Math.max(ink.t, r.top) > 1)
        hits.push(o.className + ' under ' + t);
    }
  }
  return hits;
})()`;

test('the meeting\'s number on the check-in desk does not run into its date', { skip }, async () => {
  for (const width of [1024, 1280, 1920]){
    const { ctx, page } = await open({ db:club({ stamps:13, open:true }), as:'u_chair', width, height:900 });
    await ready(page);
    await page.evaluate(() => go('bcheckin', { instant:true })); await page.waitForSelector('.proj__when');
    const hits = (await page.evaluate(INK)).filter(h => /proj__when/.test(h));
    assert.deepEqual(hits, [], `at ${width}px`);
    await ctx.close();
  }
});

test('the controls on an inked panel show where the keyboard is', { skip }, async () => {
  /* still (nothing on the panel moves), so a difference is the focus ring */
  const { ctx, page } = await open({ db:club({ stamps:3, open:true }), as:'u_chair', width:1280, height:800, reduced:true });
  await ready(page);
  /* how many pixels of two screenshots differ, counted in the page */
  const differ = (a, b) => page.evaluate(async ([a, b]) => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const px = i => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
      const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data; };
    const da = px(ia), db = px(ib); let n = 0;
    for (let k = 0; k < da.length; k += 4) if (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]) > 60) n++;
    return n;
  }, [a.toString('base64'), b.toString('base64')]);
  for (const [route, sel] of [['board', '.tools__cmd'], ['bcheckin', '[data-bfull]']]){
    await page.evaluate(r => go(r, { instant:true }), route); await page.waitForSelector(sel); await wait(400);
    const box = await (await page.$(sel)).boundingBox();
    const clip = { x:box.x - 8, y:box.y - 8, width:box.width + 16, height:box.height + 16 };
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const rest = await page.screenshot({ clip });
    for (let i = 0; i < 30 && !(await page.evaluate(s => document.activeElement === document.querySelector(s), sel)); i++) await page.keyboard.press('Tab');
    await wait(200);
    const held = await page.screenshot({ clip });
    const n = await differ(rest, held);
    assert.ok(n > clip.width * clip.height * .03, `${sel}: only ${n} pixels change when it has the keyboard`);
  }
  await ctx.close();
});

test('the inked fold of today\'s meetings is legible; the card\'s seats are a group of buttons', { skip }, async () => {
  {
    const { ctx, page } = await open({ db:club({ stamps:3, open:true }), as:'u_chair', width:1280, height:800 });
    await ready(page);
    await page.evaluate(() => {   // today's meeting at an unusual hour, so its time is printed
      const m = __mockDB.meetings.find(x => x.id === 'm_today'); m.start_time = '3:00 PM';
    });
    await page.evaluate(() => go('bmeet', { instant:true })); await page.waitForSelector('.minutes__fold .mrow__when');
    const ratio = await page.evaluate(() => {
      const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
      const el = document.querySelector('.minutes__fold .mrow__when');
      const fg = lum(getComputedStyle(el).color), bg = lum(getComputedStyle(el.closest('.mrow__go')).backgroundColor);
      return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
    });
    assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)}:1`);
    await ctx.close();
  }
  for (const width of [320, 360]){   // and on a narrow phone, today's date is not broken in two
    const { ctx, page } = await open({ db:club({ stamps:3, open:true }), as:'u_chair', width, height:740 });
    await ready(page);
    await page.evaluate(() => go('bmeet', { instant:true })); await page.waitForSelector('.minutes__fold .mrow__day');
    const lines = await page.evaluate(() => { const d = document.querySelector('.minutes__fold .mrow__day');
      return Math.round(d.getBoundingClientRect().height / parseFloat(getComputedStyle(d).lineHeight)); });
    assert.equal(lines, 1, `today's date on one line at ${width}px`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ db:club({ stamps:3, open:true }), as:'u_alice' });
    await ready(page);
    const s = await page.evaluate(() => ({ role:document.getElementById('seals').getAttribute('role'),
      lis:document.querySelectorAll('#seals > li').length, buttons:document.querySelectorAll('#seals > [role="button"]').length }));
    assert.deepEqual(s, { role:'group', lis:0, buttons:4 });
    await ctx.close();
  }
});

test('no page is wider than the window, from 320px to 1920px', { skip }, async () => {
  const wide = [];
  for (const [as, routes] of [['u_alice', ['home', 'record', 'scan', 'rewards', 'profile']], ['u_chair', ['board', 'bcheckin', 'bmeet', 'bmembers']]])
    for (const width of [320, 360, 390, 414, 768, 1024, 1280, 1440, 1920]){
      const { ctx, page } = await open({ db:club({ stamps:13, open:true }), as, width, height:900, reduced:true });
      await ready(page);
      for (const r of routes){
        await page.evaluate(r => go(r, { instant:true }), r); await wait(250);
        const w = await page.evaluate(() => document.documentElement.scrollWidth);
        if (w > width) wide.push(`${r}@${width}: ${w}px`);
      }
      await ctx.close();
    }
  assert.deepEqual(wide, []);
});

/* ── what is left running ──────────────────────────────────────────── */
test('the camera is let go when Scan is left or the tab is hidden', { skip }, async () => {
  const { ctx, page } = await open({ db:club({ stamps:3, open:true }), as:'u_alice',
    init:`window.__tracks = []; const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async c => { const s = await gum(c); window.__tracks.push(...s.getTracks()); return s; };` });
  await ctx.grantPermissions(['camera']);
  const live = () => page.evaluate(() => window.__tracks.filter(t => t.readyState === 'live').length);
  await ready(page);
  for (let i = 0; i < 3; i++){
    await page.evaluate(() => go('scan')); await until(page, () => window.__tracks.some(t => t.readyState === 'live'));
    await page.evaluate(() => go('home')); await wait(300);
    assert.equal(await live(), 0, 'left Scan');
  }
  await page.evaluate(() => go('scan')); await until(page, () => window.__tracks.some(t => t.readyState === 'live'));
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable:true, get:() => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange')); });
  await wait(300);
  assert.equal(await live(), 0, 'tab hidden');
  await noErrors(page); await ctx.close();
});
