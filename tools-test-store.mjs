#!/usr/bin/env node
// The store: whose record is on the page, and where a count of stamps
// puts the member on their cards.
// Run: node --test tools-test-store.mjs
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
vm.runInContext(['./01a-backend.js', './01-core.js'].map(read).join('\n')
  + '\nthis.__x = { Store, Backend, Rules, REWARD_TIERS, rewardState };', ctx);
const { Store, Backend, Rules, REWARD_TIERS, rewardState } = ctx.__x;

const person = id => ({ id, username:id, name:id, role:'member', isBoard:false, joined:'2025-01-01', joinedAt:0 });
const meeting = (id, date) => ({ id, no:Number(id.slice(1)), date, time:'12:40 PM', endTime:'1:30 PM', place:'MPR', open:false, today:false, upcoming:false });
/* a backend that answers as `who` with that account's rows, or fails the reads */
function backend({ who, scans = [], claims = [], fail = false }){
  const no = () => Promise.reject(new Error('network'));
  Backend.currentSession = async () => (who ? person(who) : null);
  Backend.listMeetings = fail ? no : async () => [meeting('m1', '2026-09-01'), meeting('m2', '2026-09-08')];
  Backend.listAttendance = fail ? no : async () => scans;
  Backend.listRewardClaims = fail ? no : async () => claims;
  Backend.listHandovers = async () => false;
}

test('a read for a newly signed-in account that fails does not show the last account\'s record', async () => {
  Store.ready = false; Store.user = null; Store.loadError = null;
  backend({ who:'alice', scans:[{ id:'a1', meetingId:'m1', at:'2026-09-01T20:00:00Z', method:'qr' },
                                { id:'a2', meetingId:'m2', at:'2026-09-08T20:00:00Z', method:'qr' }], claims:[{ id:'r1', at:'x' }] });
  await Store.hydrate();
  assert.equal(Store.user.id, 'alice');
  assert.equal(Store.totalStamps(), 2);
  assert.equal(Store.rewards.find(r => r.id === 'r1').claimed, true);

  // the tab comes back: bob is signed in now, and his record cannot be read
  backend({ who:'bob', fail:true });
  await Store.hydrate({ keep:true });
  assert.equal(Store.user.id, 'bob');
  assert.equal(Store.failed, true);
  assert.equal(Store.totalStamps(), 0, 'alice\'s stamps are not bob\'s');
  assert.equal(Store.meetings.length, 0);
  assert.equal(Store.attended('m1'), false);
  assert.equal(Store.rewards.some(r => r.claimed), false, 'nor her claim');
});

test('the same account whose background read fails keeps what it showed', async () => {
  Store.ready = false; Store.user = null; Store.loadError = null;
  backend({ who:'alice', scans:[{ id:'a1', meetingId:'m1', at:'2026-09-01T20:00:00Z', method:'qr' }] });
  await Store.hydrate();
  backend({ who:'alice', fail:true });
  await Store.hydrate({ keep:true });
  assert.equal(Store.failed, false);
  assert.equal(Store.totalStamps(), 1);
});

test('the card a count of stamps stands on, at every threshold', () => {
  const at = n => { Store.scans = Array.from({ length:n }, (_, i) => ({ meetingId:'x' + i })); const p = Rules.progress(); return `${p.card}:${p.filled}/${p.span}:${p.remaining}`; };
  const want = { 0:'1:0/10:10', 1:'1:1/10:9', 9:'1:9/10:1', 10:'1:10/10:0', 11:'2:1/10:9', 19:'2:9/10:1', 20:'2:10/10:0',
                 21:'3:1/10:9', 29:'3:9/10:1', 30:'3:10/10:0', 31:'4:1/10:9', 39:'4:9/10:1', 40:'4:10/10:0', 41:'5:1/10:9' };
  for (const [n, w] of Object.entries(want)) assert.equal(at(Number(n)), w, `${n} stamps`);
});

test('a prize unlocks at its threshold exactly, and a claim keeps it reached', () => {
  const [r1, r2, r3] = REWARD_TIERS;
  assert.equal(rewardState(r1, 9, false), 'locked');
  assert.equal(rewardState(r1, 10, false), 'unlocked');
  assert.equal(rewardState(r2, 19, false), 'locked');
  assert.equal(rewardState(r2, 20, false), 'unlocked');
  assert.equal(rewardState(r3, 29, false), 'locked');
  assert.equal(rewardState(r3, 30, false), 'unlocked');
  assert.equal(rewardState(r3, 31, false), 'unlocked');
  assert.equal(rewardState(r1, 4, true), 'claimed');
});
