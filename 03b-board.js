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

/* The usual time and room are said once, by the club, not on every
   line; a meeting that differs says how. */
function meetingAway(m){
  const span = spanTime(m.start_time, m.end_time), room = m.location || Schedule.PLACE;
  const usual = span === spanTime('12:40 PM', '1:30 PM') && room === Schedule.PLACE;
  return usual ? '' : ` / ${esc(span)} / ${esc(room)}`;
}

/* minutes past midnight at the club */
function clubMinutes(d = new Date()){
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone:CLUB_TZ, hour:'2-digit', minute:'2-digit', hourCycle:'h23' })
      .formatToParts(d);
    const v = t => Number((p.find(x => x.type === t) || {}).value);
    return v('hour') * 60 + v('minute');
  } catch (_) { return d.getHours() * 60 + d.getMinutes(); }
}

/* The server calls every unopened meeting dated today ENDED. Until its
   end time has passed it is today's meeting, not a held one. */
function meetingPhase(m, today, now = clubMinutes()){
  if (!m || m.state !== 'ENDED' || m.meeting_date !== today) return m && m.state;
  const e = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(m.end_time || '').trim());
  if (!e) return 'TODAY';
  const end = (Number(e[1]) % 12 + (/pm/i.test(e[3]) ? 12 : 0)) * 60 + Number(e[2]);
  return now < end ? 'TODAY' : 'ENDED';
}

function spanTime(start, end){
  const a = String(start || '').trim(), b = String(end || '').trim();
  if (!b) return knit(a);
  const ma = /^(.*?)\s*(AM|PM)$/i.exec(a), mb = /^(.*?)\s*(AM|PM)$/i.exec(b);
  if (ma && mb && ma[2].toUpperCase() === mb[2].toUpperCase())
    return knit(`${ma[1]}-${mb[1]} ${mb[2].toUpperCase()}`);
  return knit(`${a}-${b}`);
}

const BoardUI = {
  tab: 'session',
  loading: false,
  shown: null,          /* the tab whose loaded content the pane holds */
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
  formOpen: false,

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
      HAS_ATTENDANCE:    'Someone has checked in to this meeting, so it stays. It can be deleted once the meeting is over.',
      ATTENDANCE_ALREADY_OPEN: 'Another meeting already has check-in open. Close that one first.',
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
    if (this.tab === 'meetings') return this.meetingsPane();
    if (this.tab === 'progress') return this.progressPane();
    return this.sessionPane();
  },

  skeleton(){
    return `<div class="panel bpanel bpanel--wait" aria-busy="true">
      <p class="kicker">Loading</p>
    </div>`;
  },

  failure(code){
    return `<div class="panel bpanel fail">
      <p class="kicker">Could not load</p>
      <p>${esc(this.message(code))}</p>
      <button class="btn btn--go" data-breload data-busy="Retrying">Try again</button>
    </div>`;
  },

  empty(text){
    return `<div class="bempty" role="note"><p>${esc(text)}</p></div>`;
  },

  /* a detail page returns to the list of the tab it was opened in */
  backLabel(){ return 'Back'; },

  progressPane(){
    const o = this.overview || {};
    const ms = o.milestones || {};
    const reached = REWARD_TIERS.map(r => ({ n:r.required, key:'m' + r.required, name:r.name }));
    return `<div class="bpanel memgrid">
      ${(() => {
        /* how many prizes to have ready: only rungs someone has reached */
        const got = reached.map(r => ({ ...r, count:ms[r.key] })).filter(r => typeof r.count === 'number' && r.count > 0);
        return got.length ? `<p class="figline">${got.map(r =>
          `<span><b>${r.count}</b> reached ${esc(r.name)}</span>`).join('')}</p>` : '';
      })()}

      <section class="rosterpanel">
        ${this.rosterBody()}
      </section>
    </div>`;
  },

  meetingsPane(){
    const list = (this.meetings && this.meetings.meetings) || [];

    const by = dir => (a, b) =>
      String(a.meeting_date) < String(b.meeting_date) ? -dir : dir;
    const today = (this.meetings && this.meetings.server_date) || Schedule.today();
    const phased = list.map(m => ({ ...m, state:meetingPhase(m, today) }));
    /* what is open or still ahead is the schedule; the rest is the record */
    const ahead = s => s === 'OPEN' || s === 'TODAY' || s === 'UPCOMING';
    const upcoming = phased.filter(m => ahead(m.state)).sort(by(1));
    const past = phased.filter(m => !ahead(m.state)).sort(by(-1));

    const band = (title, tail = '') => `<h2 class="meetband"><span>${title}</span>${tail}</h2>`;
    const formOpen = this.formOpen || Boolean(this.form);

    return `<div class="bpanel meetgrid">
      ${this.deleteNote ? `<p class="authp__err meetgrid__err" role="alert">${esc(this.message(this.deleteNote))}</p>` : ''}

      <section class="meetgrid__up meetpanel">
        ${band('Scheduled', formOpen ? '' : '<button class="link meetband__act" type="button" data-mform aria-expanded="false">Schedule a meeting</button>')}
        ${formOpen ? this.createForm() : ''}
        ${upcoming.length
          ? `<ul class="blist blist--meet">${upcoming.map(m => this.meetingRow(m)).join('')}</ul>`
          : this.empty('No upcoming meetings.')}
      </section>

      <section class="meetgrid__held meetpanel meetpanel--held">
        ${band('Held', '<span class="meetband__n">Checked in</span>')}
        ${past.length
          ? `<ul class="blist blist--meet">${past.map(m => this.meetingRow(m)).join('')}</ul>`
          : this.empty('No meetings yet.')}
      </section>
    </div>`;
  },

  meetingRow(m){
    const state = String(m.state || '').toLowerCase();
    const no = pad(m.meeting_number);
    const stamps = Number(m.attendance_count) || 0;

    const word = { open:'Open', ended:'Ended', today:'Today' }[state] || '';
    /* today's meeting shows its count once anyone has checked in */
    const upcoming = state === 'upcoming' || (state === 'today' && !stamps);
    /* the usual time and room are not repeated on every row; a meeting
       that differs says so */
    const span = spanTime(m.start_time, m.end_time), room = m.location || Schedule.PLACE;
    const usual = span === spanTime('12:40 PM', '1:30 PM') && room === Schedule.PLACE;

    return `<li class="brow brow--${state}" data-bmeeting="${esc(m.id)}" role="button" tabindex="0">
      <span class="brow__no">GM ${no}</span>
      <span class="brow__day">${esc(fmtDay(m.meeting_date))}</span>
      ${usual ? '' : `<span class="brow__when">${esc(span)} / ${esc(room)}</span>`}
      ${word ? `<span class="bstate bstate--${state}">${word}</span>` : ''}
      ${upcoming ? '' : `<span class="brow__n"><b>${stamps}</b><span class="brow__nlab">checked in</span></span>`}
    </li>`;
  },

  deleteConfirm(m, no, stamps){
    const heavy = stamps > 0;
    const q = heavy
      ? `Delete this meeting and its ${stamps} stamp${stamps === 1 ? '' : 's'}?`
      : 'Delete this meeting?';
    const why = heavy
      ? `${stamps === 1 ? 'One member loses' : `${stamps} members lose`} this stamp. There is no undo.`
      : '';

    return `<span class="bconfirm${heavy ? ' bconfirm--heavy' : ''}" role="group"
       aria-label="Confirm deleting GM ${no}">
      <span class="bconfirm__q">${esc(q)}</span>
      ${why ? `<span class="bconfirm__why">${esc(why)}</span>` : ''}
      <button class="btn bconfirm__keep" type="button" data-bcancel>Keep</button>
      <button class="btn btn--go bconfirm__go" type="button"
              data-bdelete="${esc(m.id)}" data-bstamps="${stamps}" data-busy="Deleting">Delete</button>
    </span>`;
  },

  createForm(){
    const f = this.formValues();
    const d = this.formDefaults();
    return `<form class="bform" id="meetingForm" novalidate aria-label="Schedule a meeting">
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

      <p class="authp__err" id="mErr" role="alert" aria-live="assertive" hidden></p>
      <div class="bform__row">
        <button class="btn btn--go" type="submit" id="mGo" data-busy="Scheduling">Schedule meeting</button>
        <button class="link bform__reset" type="button" data-mform="close">Cancel</button>
      </div>
    </form>`;
  },

  rosterBody(){
    const d = this.members || {};
    const rows = d.members || [];
    return `<div>
      <div class="bfilters">
        <label class="field bfilters__q"><span class="sr-only">Search username</span>
          <input class="input" id="bq" type="search" value="${esc(this.q)}" placeholder="Search username"
                 autocapitalize="none" spellcheck="false"></label>
        <label class="field"><span class="sr-only">Sort by</span>
          <select class="input" id="bsort">
            ${[['username','Name'],['stamps_desc','Stamps'],['recent','Recent']]
              .map(([v,l]) => `<option value="${v}" ${this.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
      </div>

      ${rows.length ? `
        <div class="blist__head" aria-hidden="true">
          <span>Member</span><span>Last check-in</span><span>Stamps</span>
        </div>
        <ul class="blist blist--members">
          ${rows.map(m => `<li class="brow brow--member" data-bmember="${esc(m.id)}" tabindex="0" role="button">
            <span class="brow__mid"><b>${esc(m.username)}</b></span>
            <span class="brow__cell brow__cell--last">${m.last_attendance ? esc(fmtDay(m.last_attendance)) : '<span class="brow__none">none yet</span>'}</span>
            <span class="brow__n"><b>${m.stamps}</b><span class="brow__nlab">${m.stamps === 1 ? 'stamp' : 'stamps'}</span></span>
          </li>`).join('')}
        </ul>
        ${d.pages > 1 ? `<div class="bpage">
          <button class="btn" data-bpage="${Math.max(1, d.page - 1)}" ${d.page <= 1 ? 'disabled' : ''}>Back</button>
          <span class="muted">Page ${d.page} of ${d.pages}</span>
          <button class="btn" data-bpage="${Math.min(d.pages, d.page + 1)}" ${d.page >= d.pages ? 'disabled' : ''}>Next</button>
        </div>` : ''}`
        : this.empty(this.q ? 'No member matches that username.' : 'No member accounts yet.')}
    </div>`;
  },

  memberPane(){
    const d = this.memberDetail;
    const m = d.member;
    return `<div class="panel bpanel">
      <button class="link bback" data-bback>${this.backLabel()}</button>

      <h2 class="bdetail__name bdetail__name--id">${esc(m.username)}</h2>
      <p class="muted">Joined ${esc(fmtDay(m.created_at))}</p>

      ${d.rewards.some(r => r.state !== 'locked') ? `<h2 class="h2 bsec">Rewards</h2>
      <ul class="blist">
        ${d.rewards.filter(r => r.state !== 'locked').map(r => `<li class="brow brow--reward">
          <span class="brow__mid"><b>${esc(r.name)}</b>
            <span class="muted">${r.required} stamps</span></span>
          <span class="bstate bstate--${r.state === 'claimed' ? 'ended' : 'open'}">${
            r.state === 'claimed' ? 'Claimed' : 'Ready to claim'}</span>
        </li>`).join('')}
      </ul>` : ''}

      <h2 class="h2 bsec meetband"><span>Attendance</span>${d.attendance.length
        ? `<span class="meetband__n">${d.attendance.length} ${d.attendance.length === 1 ? 'stamp' : 'stamps'}</span>` : ''}</h2>
      ${d.attendance.length
        ? `<ul class="blist">${d.attendance.map(a => `
            <li class="brow brow--att" ${a.meeting_id ? `data-bmeeting="${esc(a.meeting_id)}" tabindex="0" role="button"` : ''}>
              <span class="brow__no">GM ${a.meeting_number ? pad(a.meeting_number) : '-'}</span>
              <span class="brow__mid"><b>${esc(fmtDay(a.meeting_date))}</b></span>
              <span class="brow__cell">${esc(fmtTime(a.checked_in_at))}${a.location && a.location !== Schedule.PLACE ? ` / ${esc(a.location)}` : ''}</span>
            </li>`).join('')}</ul>`
        : this.empty('No attendance yet.')}
    </div>`;
  },

  meetingPane(){
    const d = this.meetingDetail;
    const m = d.meeting;
    return `<div class="panel bpanel">
      <button class="link bback" data-bback>${this.backLabel()}</button>

      <h2 class="bdetail__name">GM ${pad(m.meeting_number)}</h2>
      <p class="muted">${esc(fmtDay(m.meeting_date))} / ${esc(spanTime(m.start_time, m.end_time))} / ${esc(m.location || 'MPR')}${
        m.check_in_open ? ' / check-in open' : ''}</p>

      ${String(m.meeting_date) > Schedule.today() ? '' : `<h2 class="h2 bsec meetband"><span>Attendees</span>${d.attendees.length
        ? `<span class="meetband__n">${d.attendees.length} checked in</span>` : ''}</h2>
      ${d.attendees.length
        ? `<ul class="blist">${d.attendees.map(a => `
            <li class="brow brow--member" data-bmember="${esc(a.user_id)}" tabindex="0" role="button">
              <span class="brow__mid"><b>${esc(a.username)}</b></span>
              <span class="muted">${esc(fmtTime(a.checked_in_at))}</span>
            </li>`).join('')}</ul>`
        : this.empty('No one has checked in yet.')}`}
      ${this.deleteBlock(m, d.attendees.length)}
    </div>`;
  },

  /* A meeting nobody attended can go at any time; one with stamps only
     once it is over, and then with them, after a second word. */
  deleteBlock(m, stamps){
    const no = pad(m.meeting_number);
    const over = !m.check_in_open && String(m.meeting_date) < Schedule.today();
    if (m.check_in_open || (stamps > 0 && !over)) return '';
    return `<div class="bdel">${this.confirmDelete === m.id
      ? this.deleteConfirm(m, no, stamps)
      : `<button class="link bdel__go" type="button" data-bconfirm="${esc(m.id)}">Delete GM ${no}</button>`}</div>`;
  },

  sessionPane(){
    const list = (this.meetings && this.meetings.meetings) || [];
    const today = (this.meetings && this.meetings.server_date) || Schedule.today();
    /* Check-in is opened only for today's meeting: opening a future one
       would record attendance that never happened. An open check-in is
       shown whatever its date, so one left open can be closed. */
    const open = list.find(m => m.state === 'OPEN') || null;
    const todays = list.filter(m => m.meeting_date === today && m.state !== 'OPEN')
      .sort((a, b) => a.meeting_number - b.meeting_number);
    const sel = open || todays.find(m => m.id === boardMeeting) || todays[0] || null;
    boardMeeting = sel ? sel.id : null;

    if (!sel){
      const next = list.filter(m => String(m.meeting_date) > today)
        .sort((a, b) => String(a.meeting_date) < String(b.meeting_date) ? -1 : 1)[0];
      return `<div class="bpanel fail">
        <p class="nowline"><b class="nowline__lab">No meeting today</b>${next
          ? `<span>Next / GM ${pad(next.meeting_number)} / ${esc(fmtDay(next.meeting_date))}</span>` : ''}</p>
        <button class="link" type="button" data-btab="meetings" data-mnew>Schedule a meeting</button>
      </div>`;
    }

    const isOpen = Boolean(sel.check_in_open);
    const id = esc(sel.id);
    /* a check-in left open on another day says so */
    const stale = isOpen && sel.meeting_date !== today;

    return `<div class="bpanel">
      ${!open && todays.length > 1 ? `<div class="gmtabs" role="tablist" aria-label="Today's meetings">
        ${todays.map(o => `<button class="gmtab ${o.id === sel.id ? 'gmtab--on' : ''}"
          role="tab" aria-selected="${o.id === sel.id}"
          data-bpick="${esc(o.id)}">GM ${pad(o.meeting_number)}</button>`).join('')}
      </div>` : ''}

      <section class="proj ${isOpen ? 'proj--live' : ''}" id="proj">
        <div class="proj__meet">
          <p class="proj__no">GM ${pad(sel.meeting_number)}</p>
          <p class="proj__when">${esc(fmtDay(sel.meeting_date))}${meetingAway(sel)}${stale ? ' / never closed' : ''}</p>
        </div>
        ${isOpen ? `<p class="proj__word">Open</p>
        <p class="proj__count" aria-live="polite"><b id="attCount">${Number.isFinite(sel.attendance_count) ? sel.attendance_count : ''}</b><span>checked in</span></p>` : ''}
        <div class="proj__ctls">
          ${isOpen
            ? `<button class="proj__ctl proj__ctl--go" type="button" data-bfull aria-pressed="false">Project</button>`
            : `<button class="proj__ctl proj__ctl--go" type="button" data-bstart="${id}" data-busy="Opening">Open check-in</button>`}
        </div>
        ${isOpen ? `<button class="link proj__end" type="button" data-bend="${id}">Close check-in</button>
          <div class="proj__plate"><div class="qrpanel__code" id="qrBox"></div></div>` : ''}
      </section>
    </div>`;
  },
};
