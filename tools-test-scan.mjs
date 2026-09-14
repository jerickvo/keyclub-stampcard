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
  window:{}, navigator:{}, console, setTimeout, clearTimeout, setInterval, clearInterval,
  document:{ documentElement:el(), body:{ contains(){ return false; } },
             querySelector(){ return null; }, querySelectorAll(){ return []; },
             addEventListener(){}, createElement:el },
  matchMedia:() => ({ matches:false }),
  localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
  performance:{ now:() => 0 }, requestAnimationFrame(){}, cancelAnimationFrame(){},
});
vm.runInContext(['./01a-backend.js', './01-core.js', './02-motion.js', './03-views.js', './05-scan.js'].map(read).join('\n')
  + '\nthis.__x = { Store, Views, scanStanding, scanMessage, SCAN_MESSAGES };', ctx);
const { Store, Views, scanStanding, scanMessage, SCAN_MESSAGES } = ctx.__x;

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
  load({ meetings:[...held(3), meeting(4, { upcoming:true })] });
  assert.equal(scanStanding(), 'Nothing open');
  load({ meetings:[...held(3), meeting(4, { open:true, today:true })] });
  assert.equal(scanStanding(), 'GM 04 · today · 12:40 PM');
  load({ meetings:[...held(3), meeting(4, { open:true, today:true })], scans:[{ meetingId:'m4', at:'2026-09-14T19:50:00Z' }] });
  assert.equal(scanStanding(), 'Already stamped · GM 04');
  // the Scan page prints the same line it will later refresh
  assert.equal(Views.scan().includes('<p class="viewer__standing">Already stamped · GM 04</p>'), true);
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

test('the Card sends a member to Scan only while a meeting is open and unstamped', () => {
  const target = html => (html.match(/class="strip[^"]*"[^>]*data-go="([a-z]+)"/) || [])[1];
  load({ meetings:[...held(3), meeting(4, { open:true, today:true })] });
  assert.equal(target(Views.home()), 'scan');
  load({ meetings:[...held(3), meeting(4, { open:true, today:true })], scans:[{ meetingId:'m4', at:'2026-09-14T19:50:00Z' }] });
  assert.equal(target(Views.home()), 'record');
  load({ meetings:[...held(3), meeting(4, { upcoming:true })] });
  assert.equal(target(Views.home()), 'record');
  assert.equal(Views.home().includes('Nothing open'), true);
  load({ meetings:held(3) });
  assert.equal(target(Views.home()), 'record');
  assert.equal(Views.home().includes('No meetings scheduled yet'), true);
});

test('every refusal the verifier can send has its own words; an unknown one has the safe words', () => {
  for (const code of ['INVALID_TOKEN', 'EXPIRED_TOKEN', 'ATTENDANCE_CLOSED', 'MEETING_NOT_ACTIVE', 'ALREADY_CHECKED_IN', 'NETWORK_ERROR', 'VERIFIER_UNAVAILABLE'])
    assert.equal(scanMessage(code), SCAN_MESSAGES[code]);
  assert.equal(scanMessage('SOMETHING_NEW')[0], 'Something went wrong');
  assert.equal(scanMessage('ALREADY_CHECKED_IN')[0], 'Already checked in');
  assert.equal(scanMessage('ATTENDANCE_CLOSED')[0], 'Check-in has ended');
});
