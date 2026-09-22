#!/usr/bin/env node
// The one rule for a reward tier, and the store's reading of it.
// Run: node --test tools-test-rewards.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const ctx = vm.createContext({
  window:{}, document:{}, navigator:{}, console, setTimeout, clearTimeout,
  localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
});
vm.runInContext(read('./01a-backend.js') + '\n' + read('./01-core.js')
  + '\nthis.__x = { rewardState, REWARD_TIERS, Store };', ctx);
const { rewardState, REWARD_TIERS, Store } = ctx.__x;
const [r1, r2, r3] = REWARD_TIERS;

test('a tier is locked, unlocked, or claimed, in that order of fact', () => {
  assert.equal(rewardState(r1, 0, false), 'locked');
  assert.equal(rewardState(r1, 9, false), 'locked');
  assert.equal(rewardState(r1, 10, false), 'unlocked');
  assert.equal(rewardState(r2, 10, false), 'locked');
  assert.equal(rewardState(r2, 20, false), 'unlocked');
  assert.equal(rewardState(r1, 10, true), 'claimed');
});
test('a claim outlives the stamps that earned it', () => {
  // a deleted meeting can take stamps back; the prize was still handed over
  assert.equal(rewardState(r1, 1, true), 'claimed');
  assert.equal(rewardState(r1, 0, true), 'claimed');
});
test('the store counts every tier that is not locked, from the same rule', () => {
  const scans = n => Array.from({ length:n }, (_, i) => ({ meetingId:'m' + i, at:'2026-09-01T00:00:00Z' }));
  const claims = ids => REWARD_TIERS.map(r => ({ ...r, claimed:ids.includes(r.id) }));

  Store.scans = scans(0);  Store.rewards = claims([]);
  assert.equal(Store.rewardsUnlocked(), 0);
  assert.equal(Store.tierState(Store.rewards[0]), 'locked');

  Store.scans = scans(10); Store.rewards = claims([]);
  assert.equal(Store.rewardsUnlocked(), 1);
  assert.equal(Store.tierState(Store.rewards[0]), 'unlocked');

  Store.scans = scans(10); Store.rewards = claims(['r1']);
  assert.equal(Store.rewardsUnlocked(), 1);
  assert.equal(Store.tierState(Store.rewards[0]), 'claimed');

  // the contradiction from the live audit: one stamp, one claim
  Store.scans = scans(1);  Store.rewards = claims(['r1']);
  assert.equal(Store.tierState(Store.rewards[0]), 'claimed');
  assert.equal(Store.rewardsUnlocked(), 1);
  assert.equal(Store.tierState(Store.rewards[1]), 'locked');

  Store.scans = scans(30); Store.rewards = claims(['r1', 'r2', 'r3']);
  assert.equal(Store.rewardsUnlocked(), 3);
  assert.equal(Store.tierState(r3 && Store.rewards[2]), 'claimed');
});

test('a rung\'s ticks count only the stamps since the rung below, so it reads reached exactly when it is', () => {
  const vctx = vm.createContext({
    window:{}, document:{}, navigator:{}, console, setTimeout, clearTimeout,
    localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
  });
  vm.runInContext(read('./01a-backend.js') + '\n' + read('./01-core.js')
    + '\nconst esc = s => String(s).replace(/[&<>"]/g, c => "&#" + c.charCodeAt(0) + ";");\n' + read('./03-views.js')
    + '\nthis.__v = { C, Store, REWARD_TIERS };', vctx);
  const { C, Store: S, REWARD_TIERS: T } = vctx.__v;
  const scans = n => Array.from({ length:n }, (_, i) => ({ meetingId:'m' + i, at:'2026-09-01T00:00:00Z' }));
  const on = html => (html.match(/<i class="is-on">/g) || []).length;
  const all = html => (html.match(/<i class/g) || []).length;

  S.scans = scans(9); S.rewards = T.map(r => ({ ...r, claimed:false }));
  const nine10 = C.tier(S.rewards[0], 9, 0), nine20 = C.tier(S.rewards[1], 9, 10);
  assert.equal(on(nine10), 9);  assert.equal(all(nine10), 10);
  assert.equal(on(nine20), 0);                                   // nothing toward 20 before 10 is reached
  assert.equal(nine10.includes('1 more stamp<'), true);
  assert.equal(nine20.includes('tier--far'), true);

  S.scans = scans(13); S.rewards = T.map(r => ({ ...r, claimed:r.id === 'r1' }));
  const t10 = C.tier(S.rewards[0], 13, 0), t20 = C.tier(S.rewards[1], 13, 10);
  assert.equal(all(t10), 0);                                     // a claimed rung is done: no ticks
  assert.equal(t10.includes('tier--claimed'), true);
  assert.equal((t10.match(/Claimed/g) || []).length, 1);          // said once
  assert.equal(on(t20), 3);
  assert.equal(t20.includes('7 more stamps'), true);
  assert.equal(t20.includes('tier--far'), false);

  S.scans = scans(10); S.rewards = T.map(r => ({ ...r, claimed:false }));
  const ready = C.tier(S.rewards[0], 10, 0);
  assert.equal(ready.includes('tier--ready'), true);
  assert.equal(ready.includes('data-claim="r1"'), true);
});
