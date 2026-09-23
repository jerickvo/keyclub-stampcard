"use strict";

function nextMeetingNumber(list){
  let top = 0;
  (Array.isArray(list) ? list : []).forEach(m => {
    const n = Number(m && m.meeting_number);
    if (Number.isInteger(n) && n > top) top = n;
  });
  /* past the form's own limit, it proposes nothing rather than a number
     it would refuse */
  return top + 1 <= MEETING_NO_MAX ? top + 1 : '';
}

const MEETING_DEFAULTS = { start:'12:40', end:'13:30' };
/* a meeting is scheduled within a year either side of today: a slip in
   the year (20266) is caught, not stored */
const MEETING_NO_MAX = 9999;
function meetingDateBounds(today = Schedule.today()){
  const shift = n => { const d = new Date(today + 'T12:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10); };
  return { min:shift(-1), max:shift(1) };
}

/* the officer who recorded a hand-over may take it back this long
   (undo_hand_over holds the same line in the database) */
const HANDOVER_UNDO_MS = 15 * 60 * 1000;

/* the thirty-stamp prize is a secret to members; the board sees which
   rung it is */
const prizeName = r => r.name === '???' ? `${r.required || 30}-stamp prize` : r.name;

/* The usual time and room are said once, by the club, not on every
   line; a meeting that differs says how. */
function meetingAway(m){
  const span = spanTime(m.start_time, m.end_time), room = m.location || Schedule.PLACE;
  const usual = span === spanTime('12:40 PM', '1:30 PM') && room === Schedule.PLACE;
  return usual ? '' : ` / ${esc(span)} / ${esc(room)}`;
}

/* The server calls every unopened meeting dated today ENDED. Until its
   end time has passed it is today's meeting, not a held one. */
function meetingPhase(m, today, now = clubMinutes()){
  if (!m || m.state !== 'ENDED' || m.meeting_date !== today) return m && m.state;
  const end = clockMinutes(m.end_time);
  if (Number.isNaN(end)) return 'TODAY';
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

/* everything an officer leaves in the board's pages: none of it is the
   next account's */
const BOARD_FRESH = () => ({
  tab:'session', loading:false, shown:null, error:null,
  prizes:null, owedAll:false, prizesStale:false, lost:new Set(),
  handQ:'', handFound:null, handed:{}, meetings:null, members:null,
  memberDetail:null, meetingDetail:null, pendingId:null, refocus:null, leftFrom:null, toTop:false,
  q:'', sort:'username', page:1, confirmDelete:null, deleteNote:null, form:null, formOpen:false,
});

/* Meetings in calendar order: by date, and within a day by start
   time, then number (the Meetings list, the check-in stage and "Next"
   all agree). dir -1 is newest first. */
const meetingOrder = dir => {
  const at = m => { const v = clockMinutes(m.start_time); return Number.isNaN(v) ? 0 : v; };
  return (a, b) => dir * (String(a.meeting_date).localeCompare(String(b.meeting_date))
    || at(a) - at(b) || a.meeting_number - b.meeting_number);
};

const BoardUI = {
  reset(){ Object.assign(this, BOARD_FRESH()); boardMeeting = null; boardPicked = null; },
  tab: 'session',
  loading: false,
  shown: null,          /* the tab whose loaded content the pane holds */
  error: null,

  prizes: null,         /* {owed} | {code} when it could not be read | null */
  owedAll: false,       /* the prize list unfolded past its first rows */
  prizesStale: false,   /* re-read the prize list on the next load */
  lost: new Set(),      /* hand-overs whose answer never came back */
  handQ: '',            /* the name typed to stamp someone by hand */
  handFound: null,      /* {people} | {code} | null before any search */
  handed: {},           /* "user:reward" -> what this officer just handed over */
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
      CHECK_IN_OPEN:     'Check-in is open for this meeting. Close it before deleting.',
      NOT_DELETED:       'Not deleted. Try again.',
      SERVER_ERROR:      'Could not reach the club records.',
    })[note] || (/^[A-Z_]+$/.test(String(note))
      ? 'Could not complete that. Try again.'
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
    return `<div class="bpanel memgrid">
      ${this.owedBody()}
      <section class="rosterpanel">
        ${this.rosterBody()}
      </section>
    </div>`;
  },

  /* The prize table's list: who is owed a prize now, the member who has
     asked (claimed) first. Each row is handed over where it stands, and
     one handed over a moment ago stays, with its undo, until the window
     for it closes. A project without hand-overs, or a function that
     does not know the list yet, shows nothing here. */
  owedBody(){
    const pz = this.prizes;
    if (!pz || pz.code === 'INVALID_REQUEST' || pz.code === 'NOT_READY') return '';
    if (pz.code) return `<section class="owed">
        <div class="meetband"><h2 class="meetband__t">To hand over</h2></div>
        ${this.empty('The prize list could not be read. Try again in a moment.')}
      </section>`;

    /* hand-overs this officer made in the last fifteen minutes: from this
       page's memory, and from the server, so a refresh keeps the Undo */
    const now = Date.now();
    const mem = Object.entries(this.handed)
      .filter(([, h]) => now - h.when < HANDOVER_UNDO_MS)
      .map(([key, h]) => ({ key, ...h }));
    const fromServer = (pz.recent || [])
      .map(r => ({ key:r.user_id + ':' + r.reward_id, at:r.handed_at, when:Date.parse(r.handed_at),
                   username:r.username, prize:prizeName(r) }))
      .filter(r => !this.handed[r.key] && now - r.when < HANDOVER_UNDO_MS);
    const just = [...mem, ...fromServer];
    const owed = (pz.owed || []).filter(o => !this.handed[o.user_id + ':' + o.reward_id]);

    /* how many of each prize to bring: owed now, and how many more the
       next meeting could add (members one stamp short). Counts, not a
       forecast; the only sums an officer at the prize table needs */
    const near = pz.near || {};
    const tally = REWARD_TIERS.map(t => [t, owed.filter(o => o.reward_id === t.id).length, Number(near[t.id]) || 0])
      .filter(([, n, k]) => n || k)
      .map(([t, n, k]) => `${n} ${esc(prizeName(t))}${k ? ` (+${k} a stamp away)` : ''}`).join(' / ');

    const row = o => {
      const key = o.user_id + ':' + o.reward_id;
      return `<li class="brow brow--owed">
        <span class="brow__mid"><b>${esc(o.username)}</b>
          <span class="muted">${esc(prizeName(o))} / ${o.claimed_at ? `claimed ${esc(fmtClubDay(o.claimed_at))}` : 'earned, not claimed'}</span></span>
        ${o.user_id === (Store.user && Store.user.id)
          ? '<span class="muted owed__self">Another officer hands this over</span>'
          : `<button class="btn owed__go" type="button" data-bhand="${esc(key)}"
          data-who="${esc(o.username)}" data-prize="${esc(prizeName(o))}"
          aria-label="${esc(`Hand ${prizeName(o)} to ${o.username}`)}">Hand over</button>`}
      </li>`;
    };
    const done = h => `<li class="brow brow--owed brow--handed">
        <span class="brow__mid"><b>${esc(h.username)}</b>
          <span class="muted">${esc(h.prize)} / handed over ${esc(fmtTime(h.at))}</span></span>
        <button class="link owed__undo" type="button" data-bundo="${esc(h.key)}" data-busy="Undoing"
          aria-label="${esc(`Undo: ${h.prize} to ${h.username}`)}">Undo</button>
      </li>`;

    /* a long list folds after a few rows, so the roster below it is not
       pushed out of reach; the claimed ones come first either way */
    const FOLD = 6;
    const shown = this.owedAll ? owed : owed.slice(0, FOLD);
    return `<section class="owed" aria-label="Prizes to hand over">
      <div class="meetband"><h2 class="meetband__t" tabindex="-1">To hand over</h2>${tally ? `<span class="meetband__n">${tally}</span>` : ''}</div>
      ${owed.length || just.length
        ? `<ul class="blist" id="owedList">${just.map(done).join('')}${shown.map(row).join('')}</ul>
           ${owed.length > FOLD ? `<button class="link owed__more" type="button" data-bowed aria-controls="owedList"
             aria-expanded="${this.owedAll}">${this.owedAll ? 'Show fewer' : `Show all ${owed.length}`}</button>` : ''}`
        : this.empty('No prizes owed')}
    </section>`;
  },

  meetingsPane(){
    const list = (this.meetings && this.meetings.meetings) || [];

    const by = meetingOrder;
    const today = (this.meetings && this.meetings.server_date) || Schedule.today();
    const phased = list.map(m => ({ ...m, state:meetingPhase(m, today),
                                    left:m.state === 'OPEN' && String(m.meeting_date) < today }));
    /* what is open or still ahead is the schedule; the rest is the record
       (a check-in left open on an earlier day included) */
    const ahead = m => !m.left && (m.state === 'OPEN' || m.state === 'TODAY' || m.state === 'UPCOMING');
    const upcoming = phased.filter(ahead).sort(by(1));
    const past = phased.filter(m => !ahead(m)).sort(by(-1));

    const band = (title, tail = '') => `<div class="meetband"><h2 class="meetband__t">${title}</h2>${tail}</div>`;
    const formOpen = this.formOpen || Boolean(this.form);

    return `<div class="bpanel meetgrid">
      ${this.deleteNote ? `<p class="authp__err meetgrid__err" role="alert">${esc(this.message(this.deleteNote))}</p>` : ''}

      <section class="meetgrid__up meetpanel">
        ${band('Upcoming', formOpen ? '' : '<button class="link meetband__act" type="button" data-mform>Schedule a meeting</button>')}
        ${formOpen ? this.createForm() : ''}
        ${upcoming.length
          ? `<ul class="blist blist--meet">${upcoming.map(m => this.meetingRow(m)).join('')}</ul>`
          : this.empty('No upcoming meetings')}
      </section>

      <section class="meetgrid__held meetpanel meetpanel--held">
        ${band('Held', '<span class="meetband__n" aria-hidden="true">Checked in</span>')}
        ${past.length
          ? `<ul class="blist blist--meet">${past.map(m => this.meetingRow(m)).join('')}</ul>`
          : this.empty('No meetings held yet')}
      </section>
    </div>`;
  },

  meetingRow(m){
    const state = String(m.state || '').toLowerCase();
    const no = pad(m.meeting_number);
    const stamps = Number(m.attendance_count) || 0;

    const word = m.left ? 'Left open' : ({ open:'Open', ended:'Ended', today:'Today' }[state] || '');
    /* today's meeting shows its count once anyone has checked in */
    const upcoming = state === 'upcoming' || (state === 'today' && !stamps);
    /* the usual time and room are not repeated on every row; a meeting
       that differs says so */
    const span = spanTime(m.start_time, m.end_time), room = m.location || Schedule.PLACE;
    const usual = span === spanTime('12:40 PM', '1:30 PM') && room === Schedule.PLACE;

    return `<li class="brow brow--${state}"><button class="brow__go" type="button" data-bmeeting="${esc(m.id)}">
      <span class="brow__no">GM ${no}</span>
      <span class="brow__day">${esc(fmtDay(m.meeting_date))}</span>
      ${usual ? '' : `<span class="brow__when">${esc(span)} / ${esc(room)}</span>`}
      ${word ? `<span class="bstate bstate--${state}">${word}</span>` : ''}
      ${upcoming ? '' : `<span class="brow__n"><b>${stamps}</b> <span class="brow__nlab">checked in</span></span>`}
    </button></li>`;
  },

  deleteConfirm(m, no, stamps){
    const heavy = stamps > 0;
    const q = heavy
      ? `Delete GM ${no} and ${stamps} stamp${stamps === 1 ? '' : 's'}?`
      : `Delete GM ${no}?`;
    const why = heavy ? 'Cannot be undone.' : '';

    return `<span class="bconfirm${heavy ? ' bconfirm--heavy' : ''}" role="group"
       aria-label="Confirm deleting GM ${no}">
      <span class="bconfirm__q">${esc(q)}</span>
      ${why ? `<span class="bconfirm__why">${esc(why)}</span>` : ''}
      <button class="btn bconfirm__keep" type="button" data-bcancel>Keep</button>
      <button class="btn btn--go bconfirm__go" type="button"
              data-bdelete="${esc(m.id)}" data-bstamps="${stamps}" data-bno="${no}" data-busy="Deleting">Delete</button>
    </span>`;
  },

  createForm(){
    const f = this.formValues();
    const d = this.formDefaults();
    return `<form class="bform" id="meetingForm" novalidate aria-label="Schedule a meeting">
      <div class="bform__grid">
        <label class="field"><span class="kicker">Meeting number</span>
          <input class="input" id="mNo" type="number" min="1" max="${MEETING_NO_MAX}" step="1" inputmode="numeric"
                 value="${esc(f.no)}" placeholder="${esc(d.no)}"></label>
        <label class="field"><span class="kicker">Date</span>
          <input class="input" id="mDate" type="date" value="${esc(f.date)}"
                 min="${meetingDateBounds().min}" max="${meetingDateBounds().max}"></label>
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
          <input class="input" id="bq" type="search" value="${esc(this.q)}" placeholder="Search"
                 autocapitalize="none" spellcheck="false"></label>
        <label class="field"><span class="sr-only">Sort by</span>
          <select class="input" id="bsort">
            ${[['username','Member'],['stamps_desc','Stamps'],['recent','Last check-in']]
              .map(([v,l]) => `<option value="${v}" ${this.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
      </div>

      ${rows.length ? `
        <table class="roster">
          <thead><tr><th scope="col">Member</th><th scope="col">Last check-in</th><th scope="col">Stamps</th></tr></thead>
          <tbody>${rows.map(m => `<tr data-bmember="${esc(m.id)}">
            <th scope="row"><button class="roster__name" type="button" data-bmember="${esc(m.id)}">${esc(m.username)}</button></th>
            <td>${m.last_attendance ? esc(fmtDay(m.last_attendance)) : '<span class="brow__none">-</span>'}</td>
            <td>${m.stamps}</td>
          </tr>`).join('')}</tbody>
        </table>
        ${d.pages > 1 ? `<div class="bpage">
          <button class="btn" data-bpage="${Math.max(1, d.page - 1)}" ${d.page <= 1 ? 'disabled' : ''}>Previous</button>
          <span class="muted">Page ${d.page} of ${d.pages}</span>
          <button class="btn" data-bpage="${Math.min(d.pages, d.page + 1)}" ${d.page >= d.pages ? 'disabled' : ''}>Next</button>
        </div>` : ''}`
        : this.empty(this.q ? 'No match' : 'No members yet')}
    </div>`;
  },

  memberPane(){
    const d = this.memberDetail;
    const m = d.member;
    /* the member's total, as the server counts it; the list below is
       their most recent check-ins only */
    const total = Number(m.stamps) || d.attendance.length;
    return `<div class="panel bpanel">
      <button class="link bback" data-bback>${this.backLabel()}</button>

      <h2 class="bdetail__name bdetail__name--id">${esc(m.username)}</h2>

      ${d.rewards.some(r => r.state !== 'locked') ? `<h2 class="h2 bsec">Rewards</h2>
      <ul class="blist">
        ${d.rewards.filter(r => r.state !== 'locked').map(r => this.rewardRow(m, r, d.handovers)).join('')}
      </ul>` : ''}

      <h2 class="h2 bsec meetband"><span>Attendance</span>${total
        ? `<span class="meetband__n">${total} ${total === 1 ? 'stamp' : 'stamps'}</span>` : ''}</h2>
      ${d.attendance.length
        ? `<ul class="blist">${d.attendance.map(a => `
            <li class="brow brow--att"><${a.meeting_id ? `button class="brow__go" type="button" data-bmeeting="${esc(a.meeting_id)}"` : 'div class="brow__go"'}>
              <span class="brow__no">GM ${a.meeting_number ? pad(a.meeting_number) : '-'}</span>
              <span class="brow__mid"><b>${esc(fmtDay(a.meeting_date))}</b></span>
              <span class="brow__cell">${esc(fmtTime(a.checked_in_at))}${a.location && a.location !== Schedule.PLACE ? ` / ${esc(a.location)}` : ''}</span>
            </${a.meeting_id ? 'button' : 'div'}></li>`).join('')}</ul>${total > d.attendance.length
            ? `<p class="muted bempty">The newest ${d.attendance.length} check-ins are shown.</p>` : ''}`
        : this.empty('No attendance yet')}
    </div>`;
  },

  /* one prize, for one member: what it is, where it stands, and the
     one thing an officer can do about it */
  rewardRow(m, r, tracked){
    const key = m.id + ':' + r.id;
    const handed = r.handed_at || (this.handed[key] && this.handed[key].at);
    /* where it stands, in one line under the prize, as the owed list
       says it; the one action beside it */
    const when = handed ? `Handed over ${fmtClubDay(handed)}`
      : r.state === 'claimed' ? (r.claimed_at ? `Claimed ${fmtClubDay(r.claimed_at)}` : 'Claimed')
      : 'Earned, not claimed';
    const undo = handed && (r.can_undo || (this.handed[key] && Date.now() - this.handed[key].when < HANDOVER_UNDO_MS));
    return `<li class="brow brow--reward${handed ? ' brow--handed' : ''}">
      <span class="brow__mid"><b>${esc(prizeName(r))}</b>
        <span class="muted">${esc(when)}</span></span>
      ${!tracked ? '' : undo
        ? `<button class="link owed__undo" type="button" data-bundo="${esc(key)}" data-busy="Undoing">Undo</button>`
        : handed ? ''
        : m.id === (Store.user && Store.user.id) ? '<span class="muted owed__self">Another officer hands this over</span>'
        : `<button class="btn owed__go" type="button" data-bhand="${esc(key)}"
            data-who="${esc(m.username)}" data-prize="${esc(prizeName(r))}"
            aria-label="${esc(`Hand ${prizeName(r)} to ${m.username}`)}">Hand over</button>`}
    </li>`;
  },

  meetingPane(){
    const d = this.meetingDetail;
    const m = d.meeting;
    const today = String(m.meeting_date) === Schedule.today();
    return `<div class="panel bpanel">
      <button class="link bback" data-bback>${this.backLabel()}</button>

      <h2 class="bdetail__name">GM ${pad(m.meeting_number)}</h2>
      <p class="muted">${esc(fmtDay(m.meeting_date))}${meetingAway(m)}${m.check_in_open ? ' / Check-in open' : ''}</p>

      ${today ? this.handBlock(m) : ''}

      ${String(m.meeting_date) > Schedule.today() ? '' : `<h2 class="h2 bsec meetband"><span>Attendees</span>${d.attendees.length
        ? `<span class="meetband__n">${d.attendees.length} checked in</span>` : ''}</h2>
      ${d.attendees.length
        ? `<ul class="blist">${d.attendees.map(a => `
            <li class="brow brow--member"><button class="brow__go" type="button" data-bmember="${esc(a.user_id)}">
              <span class="brow__mid"><b>${esc(a.username)}</b></span>
              <span class="muted">${esc(fmtTime(a.checked_in_at))}${
                a.method === 'board' || a.method === 'manual' ? ' / by hand' : ''}</span>
            </button></li>`).join('')}</ul>`
        : this.empty('No check-ins yet')}`}
      ${this.deleteNote ? `<p class="authp__err meetgrid__err" role="alert">${esc(this.message(this.deleteNote))}</p>` : ''}
      ${this.deleteBlock(m, d.attendees.length)}
    </div>`;
  },

  /* Stamping someone by hand, for a phone that cannot scan. Offered on
     today's meeting only, and on this page only, never on the stage: the
     stage is what goes up on the projector, and this lists names. The
     name is looked up on the server; there is no typing a stamp in for
     someone without an account. */
  handBlock(m){
    return `<section class="hand" aria-label="Add someone by hand">
      <h2 class="h2 bsec meetband"><span>Add by hand</span></h2>
      <label class="field"><span class="sr-only">Find a member by name</span>
        <input class="input" id="bhq" type="search" value="${esc(this.handQ)}" placeholder="Name or username"
               autocapitalize="none" autocomplete="off" spellcheck="false" data-meeting="${esc(m.id)}"></label>
      <div class="hand__found" aria-live="polite">${this.handList(m)}</div>
    </section>`;
  },

  handList(m){
    const f = this.handFound;
    /* a stamp the attendee list already shows counts, whatever the
       search said a moment ago */
    const inn = new Set(((this.meetingDetail && this.meetingDetail.attendees) || []).map(a => a.user_id));
    const me = Store.user && Store.user.id;
    const people = ((f && f.people) || []).map(p => ({ ...p,
      checked_in: p.checked_in || inn.has(p.id), self: p.id === me }));
    return !this.handQ ? ''
      : !f ? ''
      : f.code ? this.empty('Could not search. Try again.')
      : !people.length ? this.empty('No account by that name')
      : `<ul class="blist handlist">${people.map(p => `<li class="brow brow--hand">
          <span class="brow__mid"><b>${esc(p.name)}</b>${
            p.name.toLowerCase() !== String(p.username).toLowerCase() || p.board
              ? `<span class="muted">${[p.name.toLowerCase() !== String(p.username).toLowerCase() ? esc(p.username) : '', p.board ? 'Board' : ''].filter(Boolean).join(' / ')}</span>` : ''}</span>
          ${p.checked_in
            ? '<span class="bstate bstate--ended">Checked in</span>'
            : p.self ? '<span class="muted">Another officer adds you</span>'
            : `<button class="btn owed__go" type="button" data-bstamp="${esc(p.id)}" data-who="${esc(p.name)}"
                 data-meeting="${esc(m.id)}" data-no="${pad(m.meeting_number)}"
                 aria-label="${esc(`Add ${p.name} to GM ${pad(m.meeting_number)}`)}">Add</button>`}
        </li>`).join('')}</ul>`;
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
      .sort(meetingOrder(1));
    /* by default the first of today's meetings not yet over, as Home
       and the Meetings list point at */
    const sel = open || todays.find(m => m.id === boardPicked)
      || todays.find(m => meetingPhase(m, today) !== 'ENDED') || todays[todays.length - 1] || null;
    boardMeeting = sel ? sel.id : null;

    if (!sel){
      const next = list.filter(m => String(m.meeting_date) > today).sort(meetingOrder(1))[0];
      return `<div class="bpanel fail">
        <p class="nowline"><b class="nowline__lab">No meeting today</b>${next
          ? `<span>Next GM ${pad(next.meeting_number)} / ${esc(fmtDay(next.meeting_date))}</span>` : ''}</p>
        <button class="link" type="button" data-btab="meetings" data-mnew>Schedule a meeting</button>
      </div>`;
    }

    const isOpen = Boolean(sel.check_in_open);
    const id = esc(sel.id);
    /* today's meeting, not open: how many it has already, so a closed
       check-in reads as a result rather than an invitation to reopen */
    const held = !isOpen && Number(sel.attendance_count) > 0 ? Number(sel.attendance_count) : 0;
    /* a check-in left open on another day says so */
    const stale = isOpen && sel.meeting_date !== today;

    /* a live code stays at full strength while the stage is read again */
    return `<div class="bpanel${isOpen && !stale ? ' bpanel--live' : ''}">
      ${!open && todays.length > 1 ? `<div class="gmtabs" role="group" aria-label="Today's meetings">
        ${todays.map(o => `<button class="gmtab ${o.id === sel.id ? 'gmtab--on' : ''}" type="button"
          aria-pressed="${o.id === sel.id}"
          data-bpick="${esc(o.id)}">GM ${pad(o.meeting_number)}</button>`).join('')}
      </div>` : ''}

      <section class="proj ${isOpen && !stale ? 'proj--live' : ''}" id="proj">
        <div class="proj__meet">
          <p class="proj__no">GM ${pad(sel.meeting_number)}</p>
          <p class="proj__when">${esc(fmtDay(sel.meeting_date))}${meetingAway(sel)}</p>
        </div>
        ${stale ? `<p class="proj__word">Left open</p>
        <div class="proj__ctls">
          <button class="proj__ctl proj__ctl--go" type="button" data-bend="${id}" data-busy="Closing">Close check-in</button>
        </div>` : isOpen ? `<p class="proj__word">Open</p>
        <p class="proj__count" aria-live="polite" aria-atomic="true"><b id="attCount">${Number.isFinite(sel.attendance_count) ? sel.attendance_count : ''}</b><span>checked in</span></p>
        <div class="proj__ctls">
          <button class="proj__ctl proj__ctl--go" type="button" data-bfull>Full screen</button>
        </div>
        <div class="proj__side">
          <button class="link proj__end" type="button" data-bend="${id}">Close check-in</button>
          <button class="link proj__hand" type="button" data-bmeeting="${id}" data-bhandfocus>Add by hand</button>
        </div>
        <div class="proj__plate"><div class="qrpanel__code" id="qrBox"></div></div>` : `${held ? `
        <p class="proj__count proj__count--held"><b>${held}</b><span>checked in</span></p>` : ''}
        <div class="proj__ctls">
          <button class="proj__ctl${held ? '' : ' proj__ctl--go'}" type="button" data-bstart="${id}" data-busy="Opening">Open check-in</button>
        </div>
        <div class="proj__side">
          <button class="link proj__hand" type="button" data-bmeeting="${id}" data-bhandfocus>${held ? 'Attendees and add by hand' : 'Add by hand'}</button>
        </div>`}
      </section>
    </div>`;
  },
};
