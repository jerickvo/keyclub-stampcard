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
  + '\nthis.__x = { rewardState, REWARD_TIERS, Store, Schedule, Handover, HandStamp };', ctx);
const { rewardState, REWARD_TIERS, Store, Schedule, Handover, HandStamp } = ctx.__x;
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
  // a deleted meeting can take stamps back; the member still asked for it
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

// ── the member's day, and the join date ────────────────────────────────
// times are minutes past midnight on the club's clock
const T = (h, m = 0) => h * 60 + m;
const day = (over = {}) => ({ id:'m', no:19, date:'2026-09-23', time:'12:40 PM', endTime:'1:30 PM',
  place:'MPR', open:false, today:true, upcoming:true, ...over });
const withDay = (meetings, stamps = [], user = {}, now = T(12)) => {
  Schedule.today = () => '2026-09-23';
  Store.user = { id:'u', joined:null, joinedAt:null, ...user };
  Store.meetings = meetings.map(m => ({ ...m }));
  Store.scans = stamps.map(id => ({ meetingId:id, at:'2026-09-23T19:45:00Z', method:'qr' }));
  Store.settle(now);
  return Store;
};

test('today\'s meeting: ahead before its start, in progress until its end, then over', () => {
  let s = withDay([day()], [], {}, T(12));
  assert.equal(s.meetings[0].upcoming, true);
  s = withDay([day()], [], {}, T(12, 50));                       // started, not open: closed early or late to open
  assert.equal(s.meetings[0].upcoming, false);
  assert.equal(s.state(s.meetings[0]), 'miss');                 // Record says "Not checked in" for today
  assert.equal(s.todayMeeting().id, 'm');
  s = withDay([day()], [], {}, T(13, 30));
  assert.equal(s.meetings[0].ended, true);
  assert.equal(withDay([day({ open:true })], [], {}, T(12)).meetings[0].upcoming, false);
  // open beats over: a board running past its end time
  s = withDay([day({ open:true })], [], {}, T(14));
  assert.equal(s.todayMeeting().open, true);
  // closed again after the member was stamped: held, and on the record today
  s = withDay([day()], ['m'], {}, T(12, 50));
  assert.equal(s.state(s.meetings[0]), 'set');
  assert.equal(s.heldMeetings().length, 1);
  // a meeting with no end time is not over until the day is
  assert.equal(withDay([day({ endTime:null })], [], {}, T(23, 50)).meetings[0].ended, false);
  // a future meeting is ahead, a past one is held
  assert.equal(withDay([day({ id:'f', date:'2026-09-30', today:false })]).meetings[0].upcoming, true);
  assert.equal(withDay([day({ id:'p', date:'2026-09-16', today:false })]).meetings[0].upcoming, false);
});

test('the day\'s meeting: open, in progress, next by time, stamped, over', () => {
  const a = day({ id:'a', no:19, time:'12:40 PM', endTime:'1:30 PM' }), b = day({ id:'b', no:20, time:'3:15 PM', endTime:'4:00 PM' });
  assert.equal(withDay([b, a], [], {}, T(12)).todayMeeting().id, 'a');
  assert.equal(withDay([a, { ...b, open:true }], [], {}, T(12)).todayMeeting().id, 'b');
  assert.equal(withDay([a, b], ['a'], {}, T(12)).todayMeeting().id, 'b');
  assert.equal(withDay([a, b], ['a'], {}, T(16, 30)).todayMeeting().id, 'a');   // both over: the stamped one
  assert.equal(withDay([a], [], {}, T(14)).todayMeeting().id, 'a');             // over, no stamp
  assert.equal(withDay([b, a], [], {}, T(13)).todayMeeting().id, 'a');          // in progress beats next
  // same start time: the lower number, as the board's stage picks it
  const c = day({ id:'c', no:41 }), d = day({ id:'d', no:40 });
  assert.equal(withDay([c, d], [], {}, T(12)).todayMeeting().id, 'd');
  assert.equal(withDay([day({ id:'f', date:'2026-09-30', today:false })]).todayMeeting(), null);
});

test('the day stays watched until an hour after its last meeting with no stamp', () => {
  assert.equal(withDay([day()], [], {}, T(12)).dayLive(T(12)), true);
  assert.equal(withDay([day()], [], {}, T(14)).dayLive(T(14)), true);        // 30 min after the end
  assert.equal(withDay([day()], [], {}, T(14, 31)).dayLive(T(14, 31)), false);
  assert.equal(withDay([day()], ['m'], {}, T(12, 50)).dayLive(T(12, 50)), false);
  const a = day({ id:'a' }), b = day({ id:'b', no:20, time:'3:15 PM', endTime:'4:00 PM' });
  assert.equal(withDay([a, b], ['a'], {}, T(13)).dayLive(T(13)), true);       // stamped at one, another to come
  assert.equal(withDay([day({ id:'f', date:'2026-09-30', today:false })]).dayLive(), false);
});

test('a meeting before the account existed is not one they missed', () => {
  const past = (id, date) => day({ id, date, today:false });
  const ms = [past('m1', '2026-09-02'), past('m2', '2026-09-09'), past('m3', '2026-09-16')];
  let s = withDay(ms, [], { joined:'2026-09-09', joinedAt:T(9) });
  assert.deepEqual(s.heldMeetings().map(m => m.id), ['m2', 'm3']);     // joined that morning: it counts
  assert.equal(s.attendanceRate(), 0);
  s = withDay(ms, [], { joined:'2026-09-09', joinedAt:T(15) });         // joined after it ended that day
  assert.deepEqual(s.heldMeetings().map(m => m.id), ['m3']);
  s = withDay(ms, ['m1', 'm3'], { joined:'2026-09-10', joinedAt:T(9) }); // stamped always counts
  assert.deepEqual(s.heldMeetings().map(m => m.id), ['m1', 'm3']);
  assert.equal(s.attendanceRate(), 100);
  s = withDay(ms, ['m3'], {});                                          // no join date: everything counts
  assert.equal(s.heldMeetings().length, 3);
  assert.equal(s.attendanceRate(), 33);
  // joined today after today's meeting: Home does not say "Not checked in"
  s = withDay([day()], [], { joined:'2026-09-23', joinedAt:T(15) }, T(15, 5));
  assert.equal(s.todayMeeting(), null);
});

test('refusals from the database are named, not printed raw', () => {
  const err = (message, code = 'P0001') => ({ code, message });
  assert.equal(Handover.code(err('ALREADY_HANDED_OVER')), 'ALREADY_HANDED_OVER');
  assert.equal(Handover.code(err('SELF_HANDOVER')), 'SELF_HANDOVER');
  assert.equal(Handover.code(err('x', 'PGRST202')), 'NOT_INSTALLED');
  assert.equal(Handover.absent({ code:'PGRST205' }), true);
  assert.equal(Handover.absent({ code:'42501' }), false);
  assert.equal(HandStamp.code(err('duplicate key', '23505')), 'ALREADY_CHECKED_IN');
  assert.equal(HandStamp.code(err('NOT_TODAY')), 'NOT_TODAY');
  assert.equal(HandStamp.code(err('row-level security', '42501')), 'NOT_AUTHORIZED');
  assert.match(HandStamp.message('ALREADY_CHECKED_IN'), /Already checked in/);
  assert.doesNotMatch(Handover.message('NOT_EARNED'), /NOT_EARNED/);
});
