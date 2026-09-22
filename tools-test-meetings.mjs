#!/usr/bin/env node
// Unit checks for the Meetings form helpers. Run: node --test tools-test-meetings.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('./03b-board.js', import.meta.url), 'utf8');
const knit = s => String(s).replace(/ (AM|PM)\b/gi, '\u00a0$1');
const ctx = vm.createContext({ Schedule:{ today:() => '2026-09-07', PLACE:'MPR' }, knit,
  esc:s => String(s), pad:n => String(n).padStart(2, '0'), fmtDate:iso => iso, fmtTime:iso => iso,
  fmtDay:iso => iso, brandSeal:() => '<svg></svg>' });
vm.runInContext('const CLUB_TZ = "America/Los_Angeles"; var boardMeeting = null;\n' + src + '\nthis.__x = { nextMeetingNumber, spanTime, BoardUI, MEETING_DEFAULTS, meetingPhase };', ctx);
const { nextMeetingNumber, spanTime, BoardUI, MEETING_DEFAULTS, meetingPhase } = ctx.__x;
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
  // the space before AM/PM is non-breaking, so a clock reading never wraps;
  // the range is a hyphen because the comic faces carry no en dash
  assert.equal(spanTime('12:40 PM', '1:30 PM'), '12:40-1:30\u00a0PM');
  assert.equal(spanTime('3:15 PM', '4:15 PM'), '3:15-4:15\u00a0PM');
  assert.equal(spanTime('11:30 AM', '1:00 PM'), '11:30\u00a0AM-1:00\u00a0PM');
  assert.equal(spanTime('3:15 PM', null), '3:15\u00a0PM');
});

test('a meeting row carries its count, and the count only means something once held', () => {
  const m = { id:'m1', meeting_number:4, meeting_date:'2026-09-09', start_time:'12:40 PM', end_time:'1:30 PM', location:'MPR' };
  const ahead = BoardUI.meetingRow({ ...m, state:'UPCOMING' });
  const held  = BoardUI.meetingRow({ ...m, state:'PAST', attendance_count:12 });
  assert.equal(ahead.includes('brow--upcoming'), true);
  // a meeting that has not happened has no count to show
  assert.equal(ahead.includes('class="brow__n"'), false);
  // a state word is printed only for a live or just-ended meeting
  assert.equal(ahead.includes('bstate'), false);
  assert.equal(held.includes('bstate'), false);
  assert.equal(BoardUI.meetingRow({ ...m, state:'OPEN', attendance_count:3 }).includes('>Open</span>'), true);
  assert.equal(held.includes('brow--past'), true);
  assert.equal(held.includes('<span class="brow__n"><b>12</b>'), true);
  assert.equal(ahead.includes('GM 04'), true);
  // rows carry no delete control; the usual time and room are not repeated
  assert.equal(ahead.includes('data-bconfirm'), false);
  assert.equal(held.includes('data-bconfirm'), false);
  assert.equal(held.includes('brow__when'), false);
  assert.equal(BoardUI.meetingRow({ ...m, start_time:'3:15 PM', end_time:'4:15 PM', state:'PAST' }).includes('3:15-4:15'), true);
});
test('the meetings register splits into coming up and already held', () => {
  BoardUI.meetings = { meetings:[
    { id:'a', meeting_number:1, meeting_date:'2026-09-02', start_time:'12:40 PM', end_time:'1:30 PM', state:'PAST', attendance_count:3 },
    { id:'b', meeting_number:2, meeting_date:'2026-09-16', start_time:'12:40 PM', end_time:'1:30 PM', state:'UPCOMING', attendance_count:0 },
  ] };
  BoardUI.form = null; BoardUI.deleteNote = null;
  const html = BoardUI.meetingsPane();
  assert.equal(html.includes('Scheduled'), true);
  assert.equal(html.includes('>Held<'), true);
  assert.equal((html.match(/class="blist blist--meet"/g) || []).length, 2);
  assert.equal(html.indexOf('GM 02') < html.indexOf('GM 01'), true);
});

test('the club overview: each button does what it says, and a future meeting has none', () => {
  const base = { meetings_held:16, total_seals:214, participating_members:25, average_attendance:13.4, today_attendance:0 };
  BoardUI.overview = { ...base, active_meeting:null, next_meeting:null };
  const none = BoardUI.clubPane();
  assert.equal(none.includes('bnow--none'), true);
  assert.equal(none.includes('None yet'), true);
  assert.equal(none.includes('Schedule one'), true);
  assert.equal(none.includes('bnow--live'), false);
  // statistics that change no decision are gone
  assert.equal(none.includes('figline'), false);

  // a meeting days away: named, no button (opening it would be a false attendance)
  BoardUI.overview = { ...base, active_meeting:null, server_date:'2026-09-07',
    next_meeting:{ id:'m9', meeting_number:9, meeting_date:'2026-09-16', start_time:'12:40 PM', end_time:'1:30 PM', check_in_open:false } };
  const ahead = BoardUI.clubPane();
  assert.equal(ahead.includes('GM 09'), true);
  assert.equal(ahead.includes('Next general meeting'), true);
  assert.equal(ahead.includes('<button'), false);

  // today's meeting: the button opens check-in in place
  BoardUI.overview = { ...base, active_meeting:null, server_date:'2026-09-16',
    next_meeting:{ id:'m9', meeting_number:9, meeting_date:'2026-09-16', start_time:'12:40 PM', end_time:'1:30 PM', check_in_open:false } };
  const today = BoardUI.clubPane();
  assert.equal(today.includes('>Today<'), true);
  assert.equal(today.includes('data-bstart="m9"'), true);

  BoardUI.overview = { ...base, today_attendance:4, next_meeting:null, server_date:'2026-09-16',
    active_meeting:{ id:'m9', meeting_number:9, meeting_date:'2026-09-16', start_time:'12:40 PM', end_time:'1:30 PM', check_in_open:true } };
  const live = BoardUI.clubPane();
  assert.equal(live.includes('bnow--live'), true);
  assert.equal(live.includes('Check-in open'), true);
  assert.equal(live.includes('4 checked in'), true);
  assert.equal(live.includes('Show the code'), true);
  assert.equal(live.includes('left open'), false);
});

test('a check-in left open from another day is named as such, and closes in place', () => {
  BoardUI.overview = { meetings_held:16, total_seals:214, participating_members:25, average_attendance:13.4,
    today_attendance:0, next_meeting:null, server_date:'2026-09-22',
    active_meeting:{ id:'m9', meeting_number:9, meeting_date:'2026-09-16', start_time:'12:40 PM', end_time:'1:30 PM', check_in_open:true } };
  const html = BoardUI.clubPane();
  assert.equal(html.includes('Check-in left open'), true);
  assert.equal(html.includes('Never closed'), true);
  assert.equal(html.includes('data-bend="m9"'), true);
  assert.equal(html.includes('Close check-in'), true);
  assert.equal(html.includes('checked in so far'), false);
});

test('the schedule form stays folded until asked for', () => {
  BoardUI.form = null; BoardUI.deleteNote = null; BoardUI.formOpen = false;
  BoardUI.meetings = { meetings:[
    { id:'b', meeting_number:2, meeting_date:'2026-09-16', start_time:'12:40 PM', end_time:'1:30 PM', state:'UPCOMING', attendance_count:0 },
  ] };
  assert.equal(BoardUI.meetingsPane().includes('id="meetingForm"'), false);
  assert.equal(BoardUI.meetingsPane().includes('data-mform'), true);
  BoardUI.formOpen = true;
  assert.equal(BoardUI.meetingsPane().includes('id="meetingForm"'), true);
  BoardUI.formOpen = false;
  BoardUI.meetings = { meetings:[] };
  assert.equal(BoardUI.meetingsPane().includes('id="meetingForm"'), false);
  assert.equal(BoardUI.meetingsPane().includes('data-mform'), true);
});

test('check-in is offered only for today; an open one is shown whatever its date', () => {
  const mk = (id, no, date, extra = {}) => ({ id, meeting_number:no, meeting_date:date, start_time:'12:40 PM',
    end_time:'1:30 PM', location:'MPR', state:'UPCOMING', check_in_open:false, attendance_count:0, ...extra });
  // newest first, the way the board function returns them
  const future = [mk('f3', 23, '2026-09-28'), mk('f2', 22, '2026-09-21'), mk('f1', 21, '2026-09-14')];
  BoardUI.meetings = { server_date:'2026-09-07', meetings:[...future, mk('t', 20, '2026-09-07', { state:'ENDED' })] };
  let html = BoardUI.sessionPane();
  assert.equal(html.includes('GM 20'), true);
  assert.equal(html.includes('data-bstart="t"'), true);
  assert.equal(html.includes('GM 23'), false);            // never a meeting weeks away
  assert.equal(html.includes('gmtabs'), false);           // one meeting today: nothing to pick

  BoardUI.meetings = { server_date:'2026-09-07', meetings:future };
  html = BoardUI.sessionPane();
  assert.equal(html.includes('No meeting today'), true);
  assert.equal(html.includes('GM 21'), true);             // named as the next one
  assert.equal(html.includes('data-bstart'), false);

  // left open last week: shown live so it can be closed, even with a stale pick
  BoardUI.meetings = { server_date:'2026-09-07', meetings:[...future,
    mk('old', 19, '2026-08-31', { state:'OPEN', check_in_open:true })] };
  html = BoardUI.sessionPane();
  assert.equal(html.includes('GM 19'), true);
  assert.equal(html.includes('data-bend="old"'), true);
  assert.equal(html.includes('data-bfull'), true);
});

test('a meeting dated today is today\'s meeting until its end time, then it has ended', () => {
  const m = { meeting_date:'2026-09-22', end_time:'1:30 PM', state:'ENDED' };
  assert.equal(meetingPhase(m, '2026-09-22', 10 * 60), 'TODAY');
  assert.equal(meetingPhase(m, '2026-09-22', 13 * 60 + 29), 'TODAY');
  assert.equal(meetingPhase(m, '2026-09-22', 13 * 60 + 30), 'ENDED');
  assert.equal(meetingPhase({ ...m, meeting_date:'2026-09-21' }, '2026-09-22', 600), 'ENDED');
  assert.equal(meetingPhase({ ...m, state:'OPEN' }, '2026-09-22', 600), 'OPEN');
  assert.equal(meetingPhase({ ...m, state:'UPCOMING' }, '2026-09-22', 600), 'UPCOMING');
  assert.equal(BoardUI.meetingRow({ id:'t', meeting_number:5, meeting_date:'2026-09-22', start_time:'12:40 PM',
    end_time:'1:30 PM', location:'MPR', state:'TODAY', attendance_count:0 }).includes('>Today</span>'), true);
});

test('delete lives on the meeting page: any time with no stamps, with stamps only once it is over, never while open', () => {
  BoardUI.confirmDelete = null;
  const m = { id:'d1', meeting_number:7, meeting_date:'2026-09-20', start_time:'12:40 PM', end_time:'1:30 PM', check_in_open:false };
  assert.equal(BoardUI.deleteBlock({ ...m, meeting_date:'2026-09-30' }, 0).includes('data-bconfirm="d1"'), true);
  assert.equal(BoardUI.deleteBlock(m, 12), '');                                         // stamped and still ahead
  assert.equal(BoardUI.deleteBlock({ ...m, meeting_date:'2026-09-01' }, 12).includes('data-bconfirm'), true);
  assert.equal(BoardUI.deleteBlock({ ...m, meeting_date:'2026-09-07' }, 3), '');            // today, stamped: not over yet
  assert.equal(BoardUI.deleteBlock({ ...m, check_in_open:true }, 0), '');
  BoardUI.confirmDelete = 'd1';
  assert.equal(BoardUI.deleteBlock({ ...m, meeting_date:'2026-09-01' }, 12).includes('data-bdelete="d1"'), true);
  BoardUI.confirmDelete = null;
});
