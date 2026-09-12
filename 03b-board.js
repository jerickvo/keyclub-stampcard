"use strict";

function nextMeetingNumber(list){
  let top = 0;
  (Array.isArray(list) ? list : []).forEach(m => {
    const n = Number(m && m.meeting_number);
    if (Number.isInteger(n) && n > top) top = n;
  });
  return top + 1;
}

const MEETING_DEFAULTS = { start:'12:40', end:'13:30' };

function spanTime(start, end){
  const a = String(start || '').trim(), b = String(end || '').trim();
  if (!b) return knit(a);
  const ma = /^(.*?)\s*(AM|PM)$/i.exec(a), mb = /^(.*?)\s*(AM|PM)$/i.exec(b);
  if (ma && mb && ma[2].toUpperCase() === mb[2].toUpperCase())
    return knit(`${ma[1]}–${mb[1]} ${mb[2].toUpperCase()}`);
  return knit(`${a}–${b}`);
}

const BoardUI = {
  tab: 'club',
  loading: false,
  error: null,

  overview: null,
  meetings: null,
  members: null,
  memberDetail: null,
  meetingDetail: null,

  q: '',
  sort: 'username',
  page: 1,
  confirmDelete: null,
  deleteNote: null,
  form: null,

  formDefaults(){
    return { no:String(nextMeetingNumber(this.meetings && this.meetings.meetings)),
             date:Schedule.today(), start:MEETING_DEFAULTS.start, end:MEETING_DEFAULTS.end };
  },
  formValues(){
    const v = this.formDefaults();
    const f = this.form || {};
    ['no', 'date', 'start', 'end'].forEach(k => { if (f[k] !== undefined) v[k] = f[k]; });
    return v;
  },
  hasMeetingNumber(no){
    const list = (this.meetings && this.meetings.meetings) || [];
    return list.some(m => Number(m && m.meeting_number) === no);
  },

  message(note){
    return ({
      NOT_AUTHENTICATED: 'Sign in again to continue.',
      NOT_AUTHORIZED:    'This account is not a board account.',
      MEMBER_NOT_FOUND:  'That member no longer exists.',
      MEETING_NOT_FOUND: 'That meeting no longer exists.',
      DUPLICATE_NUMBER:  'A meeting with that number already exists.',
      HAS_ATTENDANCE:    'Someone has checked in to this meeting. It can be deleted once the meeting is over.',
      SERVER_ERROR:      'Keystamp could not reach the club records. Try again.',
    })[note] || (/^[A-Z_]+$/.test(String(note))
      ? 'Something went wrong. Try again.'
      : String(note));
  },

  pane(){
    if (this.loading) return this.skeleton();
    if (this.error)   return this.failure(this.error);
    if (this.memberDetail)  return this.memberPane();
    if (this.meetingDetail) return this.meetingPane();
    if (this.tab === 'club')     return this.clubPane();
    if (this.tab === 'meetings') return this.meetingsPane();
    if (this.tab === 'progress') return this.progressPane();
    return this.sessionPane();
  },

  skeleton(){
    return `<p class="bwait meta" aria-busy="true">Loading</p>`;
  },

  failure(code){
    return `<section class="empty">
      <h2 class="empty__title">Could not load</h2>
      <p class="empty__note">${esc(this.message(code))}</p>
      <p><button class="btn" type="button" data-breload>Try again</button></p>
    </section>`;
  },

  empty(text){
    return `<p class="bempty">${esc(text)}</p>`;
  },

  when(m){
    return `<span class="nb">${esc(spanTime(m.start_time, m.end_time))}</span>${
      m.location && m.location !== Schedule.PLACE ? ' · ' + esc(m.location) : ''}`;
  },

  /* Club: what is happening now, then the year's standing. */
  clubPane(){
    const o = this.overview || {};
    const active = o.active_meeting;
    const next = o.next_meeting;
    const today = Schedule.today();

    let now;
    if (active){
      now = `<section class="now now--live" data-enter>
        <p class="now__kick">Happening now</p>
        <p class="now__no">GM ${pad(active.meeting_number)}</p>
        <p class="now__meta meta">${esc(fmtDate(active.meeting_date))} · ${this.when(active)}</p>
        <p class="now__count"><b>${esc(String(o.today_attendance ?? 0))}</b> checked in so far</p>
        <button class="btn now__go" type="button" data-go="bcheckin">Show the code</button>
      </section>`;
    } else if (next){
      const isToday = next.meeting_date === today;
      now = `<section class="now" data-enter>
        <p class="now__kick">${isToday ? 'Today' : 'Next general meeting'}</p>
        <p class="now__no">GM ${pad(next.meeting_number)}</p>
        <p class="now__meta meta">${esc(fmtDate(next.meeting_date))} · ${this.when(next)}</p>
        <button class="btn now__go" type="button" data-go="bcheckin">Open check-in</button>
      </section>`;
    } else {
      now = `<section class="now" data-enter>
        <p class="now__kick">Next general meeting</p>
        <p class="now__no">None yet</p>
        <button class="btn now__go" type="button" data-go="bmeet">Schedule one</button>
      </section>`;
    }

    const avg = o.average_attendance === null || o.average_attendance === undefined
      ? '-' : esc(String(o.average_attendance));
    return `<div class="club">
      ${now}
      <section class="standing" data-enter>
        <p class="fig standing__fig">
          <span class="fig__n">${pad(o.meetings_held ?? 0)}</span>
          <span class="fig__of">general meetings held</span>
        </p>
        <ul class="standing__rest">
          <li class="standing__row"><span class="standing__lab">Stamps earned</span>
            <span class="standing__val">${esc(String(o.total_seals ?? 0))}</span></li>
          <li class="standing__row"><span class="standing__lab">Members checked in</span>
            <span class="standing__val">${esc(String(o.participating_members ?? 0))}</span></li>
          <li class="standing__row"><span class="standing__lab">Average per meeting</span>
            <span class="standing__val">${avg}</span></li>
        </ul>
      </section>
    </div>`;
  },

  /* Members: the roster standing, then the roster itself. */
  progressPane(){
    const o = this.overview || {};
    const ms = o.milestones || {};
    const total = this.members && this.members.total;
    const participating = o.participating_members;

    return `<div class="members">
      <section class="standing" data-enter>
        <p class="fig standing__fig">
          <span class="fig__n">${typeof total === 'number' ? pad(total) : '--'}</span>
          <span class="fig__of">${total === 1 ? 'member' : 'members'} on the roster</span>
        </p>
        <ul class="standing__rest">
          ${REWARD_TIERS.map(r => {
            const count = ms['m' + r.required];
            const known = typeof count === 'number';
            return `<li class="standing__row">
              <span class="standing__lab"><span class="row__no">${r.required}</span> ${esc(r.name)}</span>
              <span class="standing__val">${known ? count : '-'}<span class="standing__unit"> ${
                known && count === 1 ? 'member' : 'members'}</span></span>
            </li>`;
          }).join('')}
          ${typeof participating === 'number' ? `<li class="standing__row">
            <span class="standing__lab">Ever checked in</span>
            <span class="standing__val">${participating}</span></li>` : ''}
        </ul>
      </section>

      <section class="roster" data-enter>
        ${this.rosterBody()}
      </section>
    </div>`;
  },

  /* Meetings: one register, the open meeting as its live strip, the
     schedule form beside it. */
  meetingsPane(){
    const list = (this.meetings && this.meetings.meetings) || [];
    const by = dir => (a, b) => String(a.meeting_date) < String(b.meeting_date) ? -dir : dir;
    const open = list.find(m => m.state === 'OPEN') || null;
    const upcoming = list.filter(m => m.state === 'UPCOMING').sort(by(1));
    const past = list.filter(m => m.state !== 'UPCOMING' && m !== open).sort(by(-1));
    const count = n => (n === 1 ? '1 meeting' : `${n} meetings`);

    return `<div class="meetings">
      ${this.deleteNote ? `<p class="err meetings__err" role="alert">${esc(this.message(this.deleteNote))}</p>` : ''}

      ${open ? `<button class="strip strip--live meetings__strip" type="button" data-go="bcheckin" data-enter>
        <span class="strip__verb">Happening now</span>
        <span class="strip__meta">GM ${pad(open.meeting_number)} · ${Number(open.attendance_count) || 0} checked in</span>
      </button>` : ''}

      <section class="ledger meetings__next" data-enter>
        <h2 class="sec">Next<span class="sec__n">${count(upcoming.length)}</span></h2>
        ${upcoming.length
          ? `<ol class="rows">${upcoming.map(m => this.meetingRow(m)).join('')}</ol>`
          : this.empty('Nothing scheduled.')}
      </section>

      <section class="meetings__form" data-enter>${this.createForm()}</section>

      <section class="ledger meetings__held" data-enter>
        <h2 class="sec">Held<span class="sec__n">${count(past.length)}</span></h2>
        ${past.length
          ? `<ol class="rows">${past.map(m => this.meetingRow(m)).join('')}</ol>`
          : this.empty('No meetings yet.')}
      </section>
    </div>`;
  },

  meetingRow(m){
    const no = pad(m.meeting_number);
    const n = Number(m.attendance_count) || 0;
    const past = m.state === 'PAST' || m.state === 'ENDED';
    return `<li class="row mrow${past ? ' mrow--past' : ''}" role="button" tabindex="0"
        data-bmeeting="${esc(m.id)}" aria-label="GM ${no}, ${esc(fmtDate(m.meeting_date))}">
      <span class="row__no">GM ${no}</span>
      <span class="mrow__day">${esc(fmtDate(m.meeting_date))}</span>
      <span class="mrow__when meta">${this.when(m)}</span>
      <span class="mrow__n">${past ? `<b>${n}</b><span class="meta mrow__unit--short"> in</span><span class="meta mrow__unit--long"> checked in</span>` : ''}</span>
    </li>`;
  },

  deleteConfirm(m, stamps){
    const heavy = stamps > 0;
    const no = pad(m.meeting_number);
    const q = heavy
      ? `Delete GM ${no} and its ${stamps} stamp${stamps === 1 ? '' : 's'}?`
      : `Delete GM ${no}?`;
    const why = heavy
      ? `${stamps === 1 ? 'One member loses' : `${stamps} members lose`} this stamp. There is no undo.`
      : 'It is not on anyone\'s record yet.';
    return `<div class="bconfirm${heavy ? ' bconfirm--heavy' : ''}" role="group"
       aria-label="Confirm deleting GM ${no}">
      <p class="bconfirm__q" role="alert">${esc(q)}</p>
      <p class="bconfirm__why">${esc(why)}</p>
      <div class="bconfirm__act">
        <button class="btn" type="button" data-bdelete="${esc(m.id)}" data-bstamps="${stamps}">Delete</button>
        <button class="btn btn--quiet bconfirm__keep" type="button" data-bcancel>Keep</button>
      </div>
    </div>`;
  },

  createForm(){
    const f = this.formValues();
    const d = this.formDefaults();
    return `<form class="bform" id="meetingForm" novalidate>
      <h2 class="sec">Schedule</h2>
      <div class="bform__grid">
        <label class="field"><span class="kicker">Meeting number</span>
          <input class="input" id="mNo" type="number" min="1" step="1" inputmode="numeric"
                 value="${esc(f.no)}" placeholder="${esc(d.no)}"></label>
        <label class="field"><span class="kicker">Date</span>
          <input class="input" id="mDate" type="date" value="${esc(f.date)}"></label>
        <label class="field"><span class="kicker">Start</span>
          <input class="input" id="mStart" type="time" value="${esc(f.start)}"></label>
        <label class="field"><span class="kicker">End</span>
          <input class="input" id="mEnd" type="time" value="${esc(f.end)}"></label>
      </div>
      <p class="err" id="mErr" role="alert" aria-live="assertive" hidden></p>
      <div class="bform__row">
        <button class="btn" type="submit" id="mGo">Schedule meeting</button>
        <button class="link link--quiet" type="button" data-mreset>Reset</button>
      </div>
    </form>`;
  },

  rosterBody(){
    const d = this.members || {};
    const rows = d.members || [];
    const pager = d.pages > 1 ? `<div class="bpage">
        <button class="btn btn--quiet" data-bpage="${Math.max(1, d.page - 1)}" ${d.page <= 1 ? 'disabled' : ''}>Back</button>
        <span class="meta">Page ${d.page} of ${d.pages}</span>
        <button class="btn btn--quiet" data-bpage="${Math.min(d.pages, d.page + 1)}" ${d.page >= d.pages ? 'disabled' : ''}>Next</button>
      </div>` : '';
    return `<h2 class="sec">Roster<span class="sec__n">${typeof d.total === 'number' ? `${d.total} ${d.total === 1 ? 'member' : 'members'}` : ''}</span></h2>
      <div class="bfilters">
        <label class="field bfilters__q"><span class="kicker">Search</span>
          <input class="input" id="bq" type="search" value="${esc(this.q)}"
                 placeholder="username" autocapitalize="none" spellcheck="false"></label>
        <label class="field"><span class="kicker">Sort</span>
          <select class="input" id="bsort">
            ${[['username','Username'],['stamps_desc','Most stamps'],['stamps_asc','Fewest stamps'],
               ['recent','Most recent attendance'],['newest','Newest account']]
              .map(([v,l]) => `<option value="${v}" ${this.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
      </div>
      ${rows.length ? `
        <ol class="rows roster__rows">
          ${rows.map(m => `<li class="row rrow" data-bmember="${esc(m.id)}" tabindex="0" role="button">
            <span class="rrow__name">${esc(m.username)}</span>
            <span class="rrow__meta meta">${m.last_attendance
              ? 'last seen ' + esc(fmtDay(m.last_attendance)) : 'never checked in'}</span>
            <span class="rrow__n"><b>${m.stamps}</b><span class="meta"> ${m.stamps === 1 ? 'stamp' : 'stamps'}</span></span>
            <span class="rrow__rw meta">${m.rewards_unlocked}/${REWARD_TIERS.length}</span>
          </li>`).join('')}
        </ol>
        ${pager}`
        : this.empty(this.q ? 'No member matches that username.' : 'No member accounts yet.')}`;
  },

  memberPane(){
    const d = this.memberDetail;
    const m = d.member;
    return `<div class="detail">
      <p class="detail__back"><button class="link link--quiet" data-bback>&larr; Roster</button></p>
      <section class="standing" data-enter>
        <p class="fig standing__fig">
          <span class="fig__n detail__name">${esc(m.username)}</span>
          <span class="fig__of">${m.stamps} ${m.stamps === 1 ? 'stamp' : 'stamps'}<span class="fig__ln">joined ${esc(fmtDay(m.created_at))}</span></span>
        </p>
        <ul class="standing__rest">
          <li class="standing__row"><span class="standing__lab">Meetings attended</span>
            <span class="standing__val">${d.attendance.length}</span></li>
          ${d.rewards.map(r => `<li class="standing__row">
            <span class="standing__lab"><span class="row__no">${r.required}</span> ${esc(r.name)}</span>
            <span class="standing__val standing__val--word">${r.claimed ? 'Claimed' : r.unlocked ? 'Unlocked' : 'Locked'}</span>
          </li>`).join('')}
        </ul>
      </section>

      <section class="ledger" data-enter>
        <h2 class="sec">Attendance<span class="sec__n">${d.attendance.length === 1 ? '1 meeting' : `${d.attendance.length} meetings`}</span></h2>
        ${d.attendance.length
          ? `<ol class="rows">${d.attendance.map(a => `
              <li class="row mrow" ${a.meeting_id ? `data-bmeeting="${esc(a.meeting_id)}" tabindex="0" role="button"` : ''}>
                <span class="row__no">GM ${a.meeting_number ? pad(a.meeting_number) : '-'}</span>
                <span class="mrow__day">${esc(fmtDate(a.meeting_date))}</span>
                <span class="mrow__when meta">${esc(fmtTime(a.checked_in_at))}</span>
                <span class="mrow__n"></span>
              </li>`).join('')}</ol>`
          : this.empty('No attendance yet.')}
      </section>
    </div>`;
  },

  meetingPane(){
    const d = this.meetingDetail;
    const m = d.meeting;
    const stamps = d.attendees.length;
    const over = String(m.meeting_date) < Schedule.today() && !m.check_in_open;
    const deletable = stamps === 0 ? !m.check_in_open : over;
    const armed = this.confirmDelete === m.id;
    return `<div class="detail">
      <p class="detail__back"><button class="link link--quiet" data-bback>&larr; Meetings</button></p>
      ${this.deleteNote ? `<p class="err" role="alert">${esc(this.message(this.deleteNote))}</p>` : ''}
      <section class="standing" data-enter>
        <p class="fig standing__fig">
          <span class="fig__n">GM ${pad(m.meeting_number)}</span>
          <span class="fig__of">${esc(fmtDate(m.meeting_date))}<span class="fig__ln">${this.when(m)}</span></span>
        </p>
        <ul class="standing__rest">
          <li class="standing__row"><span class="standing__lab">Checked in</span>
            <span class="standing__val">${stamps}</span></li>
          <li class="standing__row"><span class="standing__lab">Of members who attend</span>
            <span class="standing__val">${this.shareOfClub(stamps)}</span></li>
          <li class="standing__row"><span class="standing__lab">Check-in</span>
            <span class="standing__val standing__val--word">${m.check_in_open ? 'Open' : 'Closed'}</span></li>
        </ul>
      </section>

      <section class="ledger" data-enter>
        <h2 class="sec">Attendees<span class="sec__n">${stamps === 1 ? '1 member' : `${stamps} members`}</span></h2>
        ${stamps
          ? `<ol class="rows">${d.attendees.map(a => `
              <li class="row rrow" data-bmember="${esc(a.user_id)}" tabindex="0" role="button">
                <span class="rrow__name">${esc(a.username)}</span>
                <span class="rrow__meta meta">${esc(fmtTime(a.checked_in_at))}</span>
              </li>`).join('')}</ol>`
          : this.empty('No one has checked in yet.')}
      </section>

      ${deletable ? `<section class="detail__danger" data-enter>
        ${armed ? this.deleteConfirm(m, stamps)
                : `<button class="link link--quiet" type="button" data-bconfirm="${esc(m.id)}">Delete this meeting</button>`}
      </section>` : ''}
    </div>`;
  },

  shareOfClub(n){
    const base = this.overview && this.overview.participating_members;
    if (typeof base !== 'number' || base <= 0) return '-';
    return Math.round((n / base) * 100) + '%';
  },

  /* Check-in: the projector. */
  sessionPane(){
    const list = (this.meetings && this.meetings.meetings) || [];
    const open = list.find(m => m.state === 'OPEN');
    const options = list.filter(m => m.state === 'UPCOMING' || m.state === 'ENDED' || m.state === 'OPEN')
      .sort((a, b) => String(a.meeting_date) < String(b.meeting_date) ? -1 : 1);
    const sel = list.find(m => m.id === boardMeeting) || open || options[0] || null;
    boardMeeting = sel ? sel.id : null;

    if (!sel) return `<section class="empty">
      <h2 class="empty__title">Nothing to open yet</h2>
      <p class="empty__note">Schedule a general meeting first.</p>
      <p><button class="btn" type="button" data-go="bmeet">Schedule one</button></p>
    </section>`;

    const isOpen = Boolean(sel.check_in_open);

    return `<div class="checkin">
      ${options.length > 1 ? `<div class="picks" role="group" aria-label="Meeting">
        ${options.map(o => `<button class="pick${o.id === sel.id ? ' pick--on' : ''}" type="button"
          aria-pressed="${o.id === sel.id}" data-bpick="${o.id}">GM ${pad(o.meeting_number)}</button>`).join('')}
      </div>` : ''}

      <section class="proj${isOpen ? ' proj--live' : ''}" data-enter>
        <div class="proj__meet">
          <p class="proj__no">GM ${pad(sel.meeting_number)}</p>
          <p class="proj__when meta">${esc(fmtDate(sel.meeting_date))} · ${this.when(sel)}</p>
        </div>
        <p class="proj__word">${isOpen ? 'Open' : 'Closed'}</p>

        ${isOpen ? `
          <div class="proj__plate">
            <div class="qrpanel__code" id="qrBox"></div>
            <p class="proj__cap">Scan to check in</p>
          </div>
          <p class="proj__count"><b id="attCount">-</b><span>checked in</span></p>
          <button class="btn btn--inv proj__ctl" type="button" data-bend="${esc(sel.id)}">Close check-in</button>
        ` : `
          <p class="proj__count proj__count--shut"><span>Members see the code here once it opens.</span></p>
          <button class="btn proj__ctl" type="button" data-bstart="${esc(sel.id)}">Open check-in</button>
        `}
      </section>
    </div>`;
  },
};
