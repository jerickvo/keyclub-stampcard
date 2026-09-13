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
