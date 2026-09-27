#!/usr/bin/env node
// The Scan page's meeting line, the store's fingerprint of a page, the
// Card's action strip, and the words for a refused scan.
// Run: node --test tools-test-scan.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const el = () => ({ dataset:{}, classList:{ add(){}, remove(){}, toggle(){} }, style:{}, setAttribute(){}, getAttribute(){ return null; }, textContent:'' });
const ctx = vm.createContext({
  window:{}, navigator:{}, console, URL, atob, setTimeout, clearTimeout, setInterval, clearInterval,
  document:{ documentElement:el(), body:{ contains(){ return false; } },
             querySelector(){ return null; }, querySelectorAll(){ return []; },
             addEventListener(){}, createElement:el },
  matchMedia:() => ({ matches:false }),
  localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
  performance:{ now:() => 0 }, requestAnimationFrame(){}, cancelAnimationFrame(){},
});
vm.runInContext(['./01a-backend.js', './01-core.js', './02-motion.js', './03-views.js', './05-scan.js'].map(read).join('\n')
  + '\nthis.__x = { Store, Views, scanStanding, scanMessage, SCAN_MESSAGES, QRFormat, Arrival };', ctx);
const { Store, Views, scanStanding, scanMessage, SCAN_MESSAGES, QRFormat, Arrival } = ctx.__x;

const meeting = (no, extra = {}) => ({ id:'m' + no, no, date:'2026-09-14', time:'12:40 PM', endTime:'1:30 PM',
                                        place:'MPR', open:false, today:false, upcoming:false, ...extra });
const held = n => Array.from({ length:n }, (_, i) => meeting(i + 1, { date:'2026-08-0' + ((i % 9) + 1) }));
function load({ meetings = [], scans = [], claims = [] } = {}){
  Store.user = { id:'u1', name:'Jerick', role:'member' };
  Store.loadError = null; Store.ready = true;
  Store.meetings = meetings;
  Store.scans = scans;
  Store.rewards = Store.rewards.map(r => ({ ...r, claimed:claims.includes(r.id) }));
}

test('the meeting line over the viewer follows the record', () => {
  const line = () => { const s = scanStanding(); return `${s.lab} | ${s.at}`; };
  load({ meetings:[...held(3), meeting(4, { upcoming:true })] });
  assert.equal(line(), 'Check-in | Not open');
  load({ meetings:[...held(3), meeting(4, { open:true, today:true })] });
  // today's meeting in the usual room: the number is all a member needs
  assert.equal(line(), 'Checking in to | GM 04');
  // the Scan page prints the same line it will later refresh in place
  const page = Views.scan();
  assert.equal(page.includes('<span class="standing__lab">Checking in to</span>'), true);
  assert.equal(page.includes('<span class="standing__at"><i>GM</i><b>04</b></span>'), true);
  // already stamped: no camera, one line, the way Home says it
  load({ meetings:[...held(3), meeting(4, { open:true, today:true })], scans:[{ meetingId:'m4', at:'2026-09-14T19:50:00Z' }] });
  const done = Views.scan();
  assert.equal(done.includes('id="cam"'), false);
  assert.equal(done.includes('Checked in'), true);
  assert.match(done, /<b class="stamped__no">GM 04<\/b>/);
  assert.equal(done.includes('QR verified'), true);
});

test('the store fingerprint changes only when a page would', () => {
  load({ meetings:[...held(3), meeting(4, { upcoming:true })] });
  const a = Store.stamp();
  assert.equal(Store.stamp(), a);
  load({ meetings:[...held(3), meeting(4, { open:true })] });
  const opened = Store.stamp();
  assert.notEqual(opened, a);
  load({ meetings:[...held(3), meeting(4, { open:true })], scans:[{ meetingId:'m4', at:'2026-09-14T19:50:00Z' }] });
  const stamped = Store.stamp();
  assert.notEqual(stamped, opened);
  load({ meetings:[...held(3), meeting(4, { open:true })], scans:[{ meetingId:'m4', at:'2026-09-14T19:50:00Z' }], claims:['r1'] });
  assert.notEqual(Store.stamp(), stamped);
  Store.user = null;
  assert.notEqual(Store.stamp(), stamped);
});

test('Today sends a member to Scan only while a meeting is open and unstamped', () => {
  /* the masthead is the way to Scan only while check-in is open; every
     other day it is a line of type */
  const target = html => (html.match(/class="mast mast--open"[^>]*data-go="([a-z]+)"/) || [])[1];
  const button = html => /<button class="mast/.test(html);
  const gm = (html, no) => html.includes(`class="mast__gm">GM</span><b class="mast__no">${no}`);
  load({ meetings:[...held(3), meeting(4, { open:true, today:true })] });
  assert.equal(target(Views.home()), 'scan');
  assert.equal(Views.home().includes('>Check in<'), true);
  // stamped: a line of type, not a button
  load({ meetings:[...held(3), meeting(4, { open:true, today:true })], scans:[{ meetingId:'m4', at:'2026-09-14T19:50:00Z' }] });
  assert.equal(target(Views.home()), undefined);
  assert.equal(button(Views.home()), false);
  assert.equal(Views.home().includes('Checked in · '), true);
  assert.equal(gm(Views.home(), '04'), true);
  // nothing open: the next meeting's date is the anchor, with no verb
  load({ meetings:[...held(3), meeting(4, { upcoming:true })] });
  assert.equal(target(Views.home()), undefined);
  assert.equal(Views.home().includes('mast--next'), true);
  assert.equal(Views.home().includes('>Next meeting<'), true);
  assert.equal(Views.home().includes('>Check in<'), false);
  // nothing scheduled: the last stamp is the anchor, nothing is promised
  load({ meetings:held(3) });
  assert.equal(target(Views.home()), undefined);
  assert.equal(Views.home().includes('mast--none'), true);
  assert.equal(Views.home().includes('>Nothing scheduled<'), true);
  assert.equal(Views.home().includes('nowline'), false);
});

test('every refusal the verifier can send has its own words; an unknown one has the safe words', () => {
  for (const code of ['INVALID_TOKEN', 'EXPIRED_TOKEN', 'ATTENDANCE_CLOSED', 'MEETING_NOT_ACTIVE', 'ALREADY_CHECKED_IN', 'NETWORK_ERROR', 'VERIFIER_UNAVAILABLE'])
    assert.equal(scanMessage(code), SCAN_MESSAGES[code]);
  assert.equal(scanMessage('SOMETHING_NEW')[0], 'Not recorded');
  assert.equal(scanMessage('ALREADY_CHECKED_IN')[0], 'Already checked in');
  assert.equal(scanMessage('ATTENDANCE_CLOSED')[0], 'Check-in has ended');
});

const BARE = 'NjVlMmIyMzMtMGM3ZS00ZmEyLjE0OWI5MjRiLjE3OTAzMjMxOTkwMDA.-1eTHR7RdqFV1RK-JmJWWRMZ0tcloa9mteCgYhFxNXY';

test('the wall code is a link to the app carrying the same signed code, and nothing else', () => {
  const link = QRFormat.link('keystamp://a/' + BARE);
  assert.equal(link, 'https://keystamp.vercel.app/#/a/' + BARE);
  assert.equal(QRFormat.fromLink(link), BARE);
  assert.equal(QRFormat.canonical(link), 'keystamp://a/' + BARE);
  assert.equal(QRFormat.looksLikeKeystamp(link), true);
  // the scheme form and a bare code are read as before
  assert.equal(QRFormat.canonical('keystamp://a/' + BARE), 'keystamp://a/' + BARE);
  assert.equal(QRFormat.looksLikeKeystamp('keystamp://a/' + BARE), true);
});

test('a link is taken only from the app, over https, with a code of the right shape', () => {
  assert.equal(QRFormat.fromLink('https://keystamp.example/#/a/' + BARE), null);
  assert.equal(QRFormat.fromLink('http://keystamp.vercel.app/#/a/' + BARE), null);
  assert.equal(QRFormat.fromLink('https://keystamp.vercel.app/?a=' + BARE), null);
  assert.equal(QRFormat.fromLink('https://keystamp.vercel.app/#/a/not a code'), null);
  assert.equal(QRFormat.fromLink('https://keystamp.vercel.app/#/a/' + BARE + '&x=1'), null);
  assert.equal(QRFormat.looksLikeKeystamp('https://example.com/'), false);
  // a link that is not ours goes to the verifier as it is, and is refused there
  assert.equal(QRFormat.canonical('https://keystamp.example/#/a/' + BARE), 'https://keystamp.example/#/a/' + BARE);
});

test('the arrival page names the meeting and the way in, and never prints the code', () => {
  Store.user = null; Store.ready = true; Store.loadError = null;
  Arrival.bare = BARE; Arrival.phase = 'idle'; Arrival.refusal = null;
  Arrival.peek = null; Arrival.no = null;
  let page = Views.checkin();
  assert.equal(page.includes('Reading the code'), true);
  Arrival.peek = { ok:true }; Arrival.no = 13;
  page = Views.checkin();
  assert.equal(page.includes('GM 13'), true);
  assert.equal(page.includes('Check-in open'), true);
  assert.equal(page.includes('data-arrive="up"'), true);
  assert.equal(page.includes('data-arrive="in"'), true);
  assert.equal(page.includes(BARE.split('.')[0]) || page.includes(BARE.split('.')[1]), false);
  // a verifier that could not say: the way in, without naming the meeting
  Arrival.peek = { unknown:true }; Arrival.no = null;
  page = Views.checkin();
  assert.equal(page.includes('Check-in open'), false);
  assert.equal(page.includes('Collect your stamp'), true);
  // refused for good
  Arrival.bare = null; Arrival.phase = 'refused'; Arrival.refusal = 'EXPIRED_TOKEN';
  page = Views.checkin();
  assert.equal(page.includes('Check-in unavailable'), true);
  assert.equal(page.includes('Code expired'), true);
  Arrival.refusal = 'ALREADY_CHECKED_IN'; Arrival.no = 13;
  assert.equal(Views.checkin().includes('Already checked in'), true);
  Arrival.forget(); Arrival.leave();
});
