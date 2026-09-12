#!/usr/bin/env node
// Unit checks for the Meetings form helpers. Run: node --test tools-test-meetings.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('./03b-board.js', import.meta.url), 'utf8');
const knit = s => String(s).replace(/ (AM|PM)\b/gi, '\u00a0$1');
const ctx = vm.createContext({ Schedule:{ today:() => '2026-09-07', PLACE:'MPR' }, knit });
vm.runInContext(src + '\nthis.__x = { nextMeetingNumber, spanTime, BoardUI, MEETING_DEFAULTS };', ctx);
const { nextMeetingNumber, spanTime, BoardUI, MEETING_DEFAULTS } = ctx.__x;
const rows = nums => nums.map(n => ({ meeting_number:n }));

test('next number: no meetings -> 1', () => {
  assert.equal(nextMeetingNumber([]), 1);
  assert.equal(nextMeetingNumber(null), 1);
  assert.equal(nextMeetingNumber(undefined), 1);
});
test('next number: highest + 1, gaps allowed', () => {
  assert.equal(nextMeetingNumber(rows([1])), 2);
  assert.equal(nextMeetingNumber(rows([1, 2, 3])), 4);
  assert.equal(nextMeetingNumber(rows([1, 2, 7])), 8);
  assert.equal(nextMeetingNumber(rows([12])), 13);
  assert.equal(nextMeetingNumber(rows([3, 1, 2])), 4);
});
test('next number: null, missing, string and fractional values are ignored', () => {
  assert.equal(nextMeetingNumber(rows([null, undefined, 'abc', 2.5, 4])), 5);
  assert.equal(nextMeetingNumber(rows(['7', 3])), 8);
  assert.equal(nextMeetingNumber([{}, { meeting_number:NaN }, null]), 1);
  assert.equal(nextMeetingNumber(rows([-3, 0])), 1);
});

test('form defaults: number from the list, 12:40 PM to 1:30 PM', () => {
  BoardUI.meetings = { meetings:rows([1, 2, 7]) };
  BoardUI.form = null;
  assert.deepEqual({ ...BoardUI.formValues() }, { no:'8', date:'2026-09-07', start:'12:40', end:'13:30' });
  assert.deepEqual({ ...MEETING_DEFAULTS }, { start:'12:40', end:'13:30' });
});
test('form draft: edited fields win, untouched fields keep following the data', () => {
  BoardUI.meetings = { meetings:rows([1, 2, 7]) };
  BoardUI.form = { no:'14', start:'09:05' };
  assert.deepEqual({ ...BoardUI.formValues() }, { no:'14', date:'2026-09-07', start:'09:05', end:'13:30' });
  BoardUI.meetings = { meetings:rows([1, 2, 7, 20]) };
  assert.equal(BoardUI.formValues().no, '14');
  BoardUI.form = { start:'09:05' };
  assert.equal(BoardUI.formValues().no, '21');
  BoardUI.form = null;
  assert.deepEqual({ ...BoardUI.formValues() }, { no:'21', date:'2026-09-07', start:'12:40', end:'13:30' });
});
test('duplicate guard reads the loaded list', () => {
  BoardUI.meetings = { meetings:rows([1, 2, 7]) };
  assert.equal(BoardUI.hasMeetingNumber(7), true);
  assert.equal(BoardUI.hasMeetingNumber(8), false);
  BoardUI.meetings = null;
  assert.equal(BoardUI.hasMeetingNumber(1), false);
});
test('row time span folds a shared meridian', () => {
  // the space before AM/PM is non-breaking, so a clock reading never wraps
  assert.equal(spanTime('12:40 PM', '1:30 PM'), '12:40–1:30\u00a0PM');
  assert.equal(spanTime('3:15 PM', '4:15 PM'), '3:15–4:15\u00a0PM');
  assert.equal(spanTime('11:30 AM', '1:00 PM'), '11:30\u00a0AM–1:00\u00a0PM');
  assert.equal(spanTime('3:15 PM', null), '3:15\u00a0PM');
});
