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
  if (!b) return a;
  const ma = /^(.*?)\s*(AM|PM)$/i.exec(a), mb = /^(.*?)\s*(AM|PM)$/i.exec(b);
  if (ma && mb && ma[2].toUpperCase() === mb[2].toUpperCase())
    return `${ma[1]}–${mb[1]} ${mb[2].toUpperCase()}`;
  return `${a}–${b}`;
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

  message(code){
    return ({
      NOT_AUTHENTICATED: 'Sign in again to continue.',
      NOT_AUTHORIZED:    'This account is not a board account.',
      MEMBER_NOT_FOUND:  'That member no longer exists.',
      MEETING_NOT_FOUND: 'That meeting no longer exists.',
      DUPLICATE_NUMBER:  'A meeting with that number already exists.',
      HAS_ATTENDANCE:    'Members have checked in to this meeting, so it cannot be deleted.',
      SERVER_ERROR:      'Keystamp could not reach the club records. Try again.',
    })[code] || 'Something went wrong. Try again.';
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
    return `<div class="panel bpanel bpanel--wait" aria-busy="true">
      <p class="kicker">Loading</p>
    </div>`;
  },

  failure(code){
    return `<div class="panel bpanel">
      <p class="kicker">Could not load</p>
      <p style="margin-top:8px">${esc(this.message(code))}</p>
      <button class="btn btn--go" data-breload style="margin-top:var(--s4)">Try again</button>
    </div>`;
  },

  empty(text){
    return `<div class="bempty" role="note"><p>${esc(text)}</p></div>`;
  },

  clubPane(){
    const o = this.overview || {};
    const active = o.active_meeting;
    const next = o.next_meeting;

    const focus = active || next;
    const isLive = Boolean(active);

    return `<div class="bover">
      <aside class="bident" data-enter>
        <span class="bident__seal" aria-hidden="true">${brandSeal('cnh')}</span>
        <p class="bident__line">Cali-Nev-Ha District</p>
      </aside>
      ${focus ? `
        <div class="bnow ${isLive ? 'bnow--live' : ''}">
          <p class="bnow__lab">${isLive ? 'Happening now' : 'Next general meeting'}</p>
          <p class="bnow__no">GM ${pad(focus.meeting_number)}</p>
          <p class="bnow__at">${esc(fmtDay(focus.meeting_date))} / ${esc(focus.start_time)}${
            focus.end_time ? '-' + esc(focus.end_time) : ''} / ${esc(focus.location || Schedule.PLACE)}</p>
          <p class="bnow__state">${isLive
            ? `Check-in open / ${o.today_attendance} checked in so far`
            : 'Check-in closed'}</p>
          <button class="bnow__go" type="button" data-btab="session">${
            isLive ? 'Show the code' : 'Open check-in'}</button>
        </div>`
        : `<div class="bnow bnow--none">
             <p class="bnow__lab">Next general meeting</p>
             <p class="bnow__no">None yet</p>
             <p class="bnow__at">Schedule one to open check-in.</p>
             <button class="bnow__go" type="button" data-btab="meetings">Schedule one</button>
           </div>`}

      <section class="standing-band">
        <p class="standing-band__fig">${pad(o.meetings_held ?? 0)}</p>
        <p class="standing-band__of">general meetings held</p>
        <dl class="standing-band__rest">
          <div><dt>Stamps earned</dt><dd>${esc(String(o.total_seals ?? 0))}</dd></div>
          <div><dt>Members checked in</dt><dd>${esc(String(o.participating_members ?? 0))}</dd></div>
          <div><dt>Average per meeting</dt><dd>${
            o.average_attendance === null || o.average_attendance === undefined
              ? '-' : esc(String(o.average_attendance))}</dd></div>
        </dl>
      </section>
    </div>`;
  },

  stat(value, label){
    return `<div class="bstat">
      <b>${value === null || value === undefined ? '-' : esc(String(value))}</b>
      <span>${esc(label)}</span>
    </div>`;
  },

  progressPane(){
    const o = this.overview || {};
    const ms = o.milestones || {};
    const reached = REWARD_TIERS.map(r => ({ n:r.required, key:'m' + r.required, name:r.name }));
    const participating = o.participating_members;

    const total = (this.members && this.members.total);
    return `<div class="bpanel memgrid">
      <section class="msummary" data-enter>
        <div class="msummary__lead">
          <p class="msummary__fig">${typeof total === 'number' ? pad(total) : '--'}</p>
          <p class="msummary__of">members on the roster</p>
        </div>
        <ul class="mplates">
          ${reached.map(r => {
            const count = ms[r.key];
            const known = typeof count === 'number' && typeof participating === 'number';
            const pct = known && participating > 0
              ? Math.round((count / participating) * 100) : 0;
            return `<li class="mplate ${known && count > 0 ? 'mplate--lit' : ''}">
              <span class="mplate__no">${r.n}</span>
              <span class="mplate__name">${esc(r.name)}</span>
              <span class="mplate__say">${known
                ? (count === 1 ? '1 member has reached it'
                               : `${count} members have reached it`)
                : 'Not available'}</span>
              <span class="bmile__bar" role="img"
                aria-label="${known ? `${pct} percent of checked-in members` : 'unavailable'}">
                <span class="bmile__fill" style="width:${pct}%"></span></span>
            </li>`;
          }).join('')}
        </ul>
      </section>

      <section class="rosterpanel" data-enter>
        <h2 class="meetband">Roster</h2>
        ${this.rosterBody()}
      </section>
    </div>`;
  },

  meetingsPane(){
    const list = (this.meetings && this.meetings.meetings) || [];

    const by = dir => (a, b) =>
      String(a.meeting_date) < String(b.meeting_date) ? -dir : dir;
    const upcoming = list.filter(m => m.state === 'UPCOMING').sort(by(1));
    const past = list.filter(m => m.state !== 'UPCOMING').sort(by(-1));

    const band = (title, n) => `<h2 class="meetband"><span>${title}</span>
      <span class="meetband__n">${n === 1 ? '1 meeting' : `${n} meetings`}</span></h2>`;

    return `<div class="bpanel meetgrid">
      ${this.deleteNote ? `<p class="authp__err meetgrid__err" role="alert">${esc(this.message(this.deleteNote))}</p>` : ''}

      <section class="meetgrid__form" data-enter>${this.createForm()}</section>

      <section class="meetgrid__up meetpanel" data-enter>
        ${band('Coming up', upcoming.length)}
        ${upcoming.length
          ? `<ul class="blist blist--meet">${upcoming.map(m => this.meetingRow(m)).join('')}</ul>`
          : this.empty('No upcoming meetings.')}
      </section>

      <section class="meetgrid__held meetpanel meetpanel--held" data-enter>
        ${band('Already held', past.length)}
        ${past.length
          ? `<ul class="blist blist--meet">${past.map(m => this.meetingRow(m)).join('')}</ul>`
          : this.empty('No meetings yet.')}
      </section>
    </div>`;
  },

  meetingRow(m){
    const confirm = this.confirmDelete === m.id;
    const state = String(m.state || '').toLowerCase();
    const no = pad(m.meeting_number);

    const action = confirm
      ? `<span class="bconfirm" role="group" aria-label="Confirm deleting GM ${no}">
           <span class="bconfirm__q">Delete this meeting?</span>
           <button class="btn bconfirm__keep" type="button" data-bcancel>Keep</button>
           <button class="btn btn--go bconfirm__go" type="button" data-bdelete="${esc(m.id)}">Delete</button>
         </span>`
      : m.attendance_count === 0
        ? `<button class="brow__del" type="button" data-bconfirm="${esc(m.id)}"
             aria-label="Delete GM ${no}">Delete</button>`
        /* TEMP-TEST-TOOLING — a past meeting WITH stamps can be purged,
           tooling only. Remove this branch with the rest of the tooling
           and the empty action cell below is what is left. */
        : m.state !== 'UPCOMING'
        ? `<button class="brow__del" type="button" data-bpurgetemp="${esc(m.id)}"
             data-bpurgeno="${no}"
             data-bpurgen="${m.attendance_count}"
             aria-label="Purge test meeting GM ${no} and its ${m.attendance_count} stamps"
             >Purge</button>`
        : '';

    return `<li class="brow brow--${state}${confirm ? ' brow--confirm' : ''}">
      <span class="brow__no" data-bmeeting="${esc(m.id)}" role="button" tabindex="0">GM ${no}</span>
      <span class="brow__day" data-bmeeting="${esc(m.id)}" role="button" tabindex="0">${esc(fmtDay(m.meeting_date))}</span>
      <span class="brow__when">${esc(spanTime(m.start_time, m.end_time))} / ${esc(m.location || 'MPR')}</span>
      <span class="bstate bstate--${state}">${esc(m.state)}</span>
      <span class="brow__n"><b>${m.attendance_count}</b><span class="brow__nlab">checked in</span></span>
      <span class="brow__act">${action}</span>
    </li>`;
  },

  createForm(){
    const f = this.formValues();
    const d = this.formDefaults();
    return `<form class="bform" id="meetingForm" novalidate>
      <h2 class="h2 bsec bform__head" style="margin-top:0">Schedule a General Meeting
        <span class="bform__seal" aria-hidden="true">${brandSeal('cnh')}</span></h2>

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
        <button class="btn btn--go" type="submit" id="mGo">Schedule meeting</button>
        <button class="link bform__reset" type="button" data-mreset>Reset</button>
      </div>
    </form>`;
  },

  rosterBody(){
    const d = this.members || {};
    const rows = d.members || [];
    return `<div>
      <div class="bfilters">
        <label class="field bfilters__q"><span class="kicker">Search username</span>
          <input class="input" id="bq" type="search" value="${esc(this.q)}"
                 placeholder="type a username" autocapitalize="none" spellcheck="false"></label>
        <label class="field"><span class="kicker">Sort</span>
          <select class="input" id="bsort">
            ${[['username','Username'],['stamps_desc','Most stamps'],['stamps_asc','Fewest stamps'],
               ['recent','Most recent attendance'],['newest','Newest account']]
              .map(([v,l]) => `<option value="${v}" ${this.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
      </div>

      ${rows.length ? `
        <ul class="blist blist--members">
          ${rows.map(m => `<li class="brow brow--member" data-bmember="${esc(m.id)}" tabindex="0" role="button">
            <span class="brow__mid">
              <b>${esc(m.username)}</b>
              <span class="muted">joined ${esc(fmtDay(m.created_at))}${
                m.last_attendance ? ' / last seen ' + esc(fmtDay(m.last_attendance)) : ' / never checked in'}</span>
            </span>
            <span class="brow__n"><b>${m.stamps}</b><span class="brow__nlab">stamps</span></span>
            <span class="brow__sub muted">${m.rewards_unlocked}/3 rewards</span>
          </li>`).join('')}
        </ul>
        <div class="bpage">
          <button class="btn" data-bpage="${Math.max(1, d.page - 1)}" ${d.page <= 1 ? 'disabled' : ''}>Back</button>
          <span class="muted">Page ${d.page} of ${d.pages} / ${d.total} member${d.total === 1 ? '' : 's'}</span>
          <button class="btn" data-bpage="${Math.min(d.pages, d.page + 1)}" ${d.page >= d.pages ? 'disabled' : ''}>Next</button>
        </div>`
        : this.empty(this.q ? 'No member matches that username.' : 'No member accounts yet.')}
    </div>`;
  },

  memberPane(){
    const d = this.memberDetail;
    const m = d.member;
    return `<div class="panel bpanel">
      <button class="link" data-bback style="margin-bottom:var(--s4)">← Roster</button>

      <p class="kicker">Member</p>
      <h2 class="bdetail__name">${esc(m.username)}</h2>

      <div class="bstats bstats--tight">
        ${this.stat(m.stamps, 'Total stamps')}
        ${this.stat(d.attendance.length, 'Meetings attended')}
        ${this.stat(d.rewards.filter(r => r.unlocked).length, 'Rewards unlocked')}
        ${this.stat(fmtDay(m.created_at), 'Account created')}
      </div>

      <h2 class="h2 bsec">Milestones</h2>
      <ul class="blist">
        ${d.rewards.map(r => `<li class="brow brow--reward">
          <span class="brow__mid"><b>${esc(r.name)}</b>
            <span class="muted">${r.required} stamps</span></span>
          <span class="bstate bstate--${r.claimed ? 'past' : r.unlocked ? 'open' : 'upcoming'}">${
            r.claimed ? 'CLAIMED' : r.unlocked ? 'UNLOCKED' : 'LOCKED'}</span>
        </li>`).join('')}
      </ul>

      <h2 class="h2 bsec">Attendance history</h2>
      ${d.attendance.length
        ? `<ul class="blist">${d.attendance.map(a => `
            <li class="brow" ${a.meeting_id ? `data-bmeeting="${esc(a.meeting_id)}" tabindex="0" role="button"` : ''}>
              <span class="brow__no">GM ${a.meeting_number ? pad(a.meeting_number) : '-'}</span>
              <span class="brow__mid"><b>${esc(fmtDay(a.meeting_date))}</b>
                <span class="muted">${esc(a.location || 'MPR')} / checked in ${esc(fmtTime(a.checked_in_at))}</span></span>
            </li>`).join('')}</ul>`
        : this.empty('No attendance yet.')}
    </div>`;
  },

  meetingPane(){
    const d = this.meetingDetail;
    const m = d.meeting;
    return `<div class="panel bpanel">
      <button class="link" data-bback style="margin-bottom:var(--s4)">← Back</button>

      <p class="kicker">Meeting</p>
      <h2 class="bdetail__name">GM ${pad(m.meeting_number)}</h2>
      <p class="muted">${esc(fmtDay(m.meeting_date))} / ${esc(m.start_time)}${
        m.end_time ? '-' + esc(m.end_time) : ''} / ${esc(m.location || 'MPR')}</p>

      <div class="bstats bstats--tight" style="margin-top:var(--s5)">
        ${this.stat(d.attendees.length, 'Checked in')}
        ${this.stat(this.shareOfClub(d.attendees.length), 'Of members who attend')}
        ${this.stat(m.check_in_open ? 'OPEN' : 'CLOSED', 'Check-in')}
      </div>

      <h2 class="h2 bsec">Attendees</h2>
      ${d.attendees.length
        ? `<ul class="blist">${d.attendees.map(a => `
            <li class="brow brow--member" data-bmember="${esc(a.user_id)}" tabindex="0" role="button">
              <span class="brow__mid"><b>${esc(a.username)}</b></span>
              <span class="muted">${esc(fmtTime(a.checked_in_at))}</span>
            </li>`).join('')}</ul>`
        : this.empty('No one has checked in yet.')}
    </div>`;
  },

  shareOfClub(n){
    const base = this.overview && this.overview.participating_members;
    if (typeof base !== 'number' || base <= 0) return '—';
    return Math.round((n / base) * 100) + '%';
  },

  sessionPane(){
    const list = (this.meetings && this.meetings.meetings) || [];
    const open = list.find(m => m.state === 'OPEN');
    const options = list.filter(m => m.state === 'UPCOMING' || m.state === 'ENDED' || m.state === 'OPEN');
    const sel = list.find(m => m.id === boardMeeting) || open || options[0] || null;
    boardMeeting = sel ? sel.id : null;

    if (!sel) return `<div class="panel bpanel">
      ${this.empty('No General Meeting to open yet.')}
      <button class="btn btn--go" data-btab="meetings" style="margin-top:var(--s4)">Schedule one</button>
    </div>`;

    const isOpen = Boolean(sel.check_in_open);

    return `<div class="bpanel">
      <div class="gmtabs" role="tablist">
        ${options.map(o => `<button class="gmtab ${o.id === sel.id ? 'gmtab--on' : ''}"
          role="tab" aria-selected="${o.id === sel.id}"
          data-bpick="${o.id}">GM ${pad(o.meeting_number)}</button>`).join('')}
      </div>

      <section class="proj ${isOpen ? 'proj--live' : ''}">
        <div class="proj__meet">
          <p class="proj__no">GM ${pad(sel.meeting_number)}</p>
          <p class="proj__when">${esc(fmtDay(sel.meeting_date))} / ${esc(sel.start_time)} / ${esc(sel.location || Schedule.PLACE)}</p>
        </div>
        <p class="proj__word">${isOpen ? 'Open' : 'Closed'}</p>

        ${isOpen ? `
          <div class="proj__plate">
            <div class="qrpanel__code" id="qrBox"></div>
            <p class="proj__cap">GM ${pad(sel.meeting_number)} / scan to check in</p>
          </div>
        ` : `
          <div class="proj__plate proj__plate--empty" aria-hidden="true">
            <svg class="proj__seal" viewBox="0 0 100 100">${sealArt()}</svg>
          </div>
        `}

        ${isOpen ? `
          <p class="proj__count"><b id="attCount">-</b><span>checked in</span></p>
          <button class="proj__ctl" type="button" data-bend="${esc(sel.id)}">Close check-in</button>
        ` : `
          <p class="proj__shut">Nobody can check in until this is open.</p>
          <button class="proj__ctl proj__ctl--go" type="button" data-bstart="${esc(sel.id)}">Open check-in</button>
        `}
      </section>
    </div>`;
  },
};
