"use strict";
/* ══════════════════════════════════════════════════════════════════
   BOARD UI — the club information hub

   The board account is not an administrator looking at tables. It is an
   officer looking at their own club: what Keystamp is, when the next
   General Meeting is, how many people are coming, how far the club has
   got toward the milestones, and the one operational thing they still
   need — opening check-in.

   State and rendering for the board spread. Kept in its own file so
   the shared view/router files stay small and targeted — the last
   phase lost a whole block of delegated handlers to a careless splice
   in 06-app.js, and this is the change that would have been most
   tempting to make there.

   Nothing here talks to Supabase. Every read goes through
   Backend.board(), which is the board-only Edge Function, so a member
   who calls the same code gets a 403 rather than data. Nothing here
   writes a stamp: there is deliberately no control anywhere in this
   file that adds, edits or removes attendance. Stamps are evidence of
   having been in the MPR, and a button that grants one would make the
   whole scanner theatre.
   ══════════════════════════════════════════════════════════════════ */

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
  confirmDelete: null,      /* meeting id awaiting confirmation */
  deleteNote: null,         /* why the last delete did not happen */

  /* one message per failure code — never a database string */
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

  /* every pane renders through here, so loading and failure look the
     same everywhere instead of each section inventing its own */
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

  /* an empty state is still a printed panel: a placard, not a bare
     sentence on blank paper */
  empty(text){
    return `<div class="bempty" role="note"><p>${esc(text)}</p></div>`;
  },

  /* ── CLUB ─────────────────────────────────────────────────────
     The landing view. First thing an officer sees is what the club is
     and when it next meets — not a row of database totals. */
  clubPane(){
    const o = this.overview || {};
    const active = o.active_meeting;
    const next = o.next_meeting;
    // the meeting worth showing is the one taking check-ins, else the
    // next one on the calendar
    const focus = active || next;
    const isLive = Boolean(active);

    return `<div class="bover">
      <!-- the board's identity: the district seal as a plate of its own -->
      <aside class="bident" data-enter>
        <span class="bident__seal" aria-hidden="true">${brandSeal('cnh')}</span>
        <p class="bident__line">Cali-Nev-Ha District</p>
      </aside>
      <!-- THE MEETING. One ink mass carrying the only thing on this
           page a board member acts on, and the count of who has come
           in so far. Everything under it is the year's standing. -->
      ${focus ? `
        <div class="bnow ${isLive ? 'bnow--live' : ''}">
          <p class="bnow__lab">${isLive ? 'Happening now' : 'Next general meeting'}</p>
          <p class="bnow__no">GM ${pad(focus.meeting_number)}</p>
          <p class="bnow__at">${esc(fmtDay(focus.meeting_date))} / ${esc(focus.start_time)}${
            focus.end_time ? '-' + esc(focus.end_time) : ''} / MPR</p>
          <p class="bnow__state">${isLive
            ? `Check-in open / ${o.today_attendance} checked in so far`
            : 'Check-in closed'}</p>
          <button class="bnow__go" type="button" data-btab="session">${
            isLive ? 'Show the code' : 'Open check-in'}</button>
        </div>`
        : `<div class="bnow bnow--none">
             <p class="bnow__lab">Next general meeting</p>
             <p class="bnow__no">None</p>
             <p class="bnow__at">No general meeting is on the calendar yet.</p>
             <button class="bnow__go" type="button" data-btab="meetings">Add one</button>
           </div>`}

      <!-- THE YEAR. Same band the member pages use for a standing: one
           figure that leads, the rest supporting it. -->
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

  /* ── PROGRESS ─────────────────────────────────────────────────
     How far the club has got toward the three milestones, then the
     roster. Read-only throughout: there is no control here that grants,
     edits or removes a stamp. */
  progressPane(){
    const o = this.overview || {};
    const ms = o.milestones || {};
    const reached = [
      { n:10, key:'m10', name:'Club Merch' },
      { n:20, key:'m20', name:'Free Blindbox' },
      { n:30, key:'m30', name:'???' },
    ];
    const participating = o.participating_members;

    const total = (this.members && this.members.total);
    return `<div class="bpanel memgrid">
      <!-- the club, in one figure; the three milestones hang beside it -->
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

  /* ── MEETINGS ─────────────────────────────────────────────────── */
  meetingsPane(){
    const list = (this.meetings && this.meetings.meetings) || [];
    /* by date, never by meeting number: coming up reads soonest first,
       already held reads newest first */
    const by = dir => (a, b) =>
      String(a.meeting_date) < String(b.meeting_date) ? -dir : dir;
    const upcoming = list.filter(m => m.state === 'UPCOMING').sort(by(1));
    const past = list.filter(m => m.state !== 'UPCOMING').sort(by(-1));

    return `<div class="bpanel meetgrid">
      ${this.deleteNote ? `<p class="authp__err meetgrid__err" role="alert">${esc(this.message(this.deleteNote))}</p>` : ''}

      <section class="meetgrid__form" data-enter>${this.createForm()}</section>

      <section class="meetgrid__up" data-enter>
        <h2 class="meetband">Coming up</h2>
        ${upcoming.length
          ? `<ul class="blist">${upcoming.map(m => this.meetingRow(m)).join('')}</ul>`
          : this.empty('No upcoming meetings.')}
      </section>

      <section class="meetgrid__held" data-enter>
        <h2 class="meetband meetband--held">Already held</h2>
        ${past.length
          ? `<ul class="blist blist--held">${past.map(m => this.meetingRow(m)).join('')}</ul>`
          : this.empty('No meetings yet.')}
      </section>
    </div>`;
  },

  /* state is carried by weight and rule, not by a coloured pill */
  meetingRow(m){
    if (this.confirmDelete === m.id) return `<li class="brow brow--confirm">
      <span class="brow__mid">
        <b>Delete GM ${pad(m.meeting_number)}?</b>
        <span class="muted">This permanently removes this meeting.</span>
      </span>
      <span class="bconfirm">
        <button class="btn" data-bcancel>Cancel</button>
        <button class="btn btn--go" data-bdelete="${esc(m.id)}">Delete</button>
      </span>
    </li>`;

    return `<li class="brow">
      <span class="brow__no" data-bmeeting="${esc(m.id)}" role="button" tabindex="0">GM ${pad(m.meeting_number)}</span>
      <span class="brow__mid" data-bmeeting="${esc(m.id)}" role="button" tabindex="0">
        <b>${esc(fmtDay(m.meeting_date))}</b>
        <span class="muted">${esc(m.start_time)}${m.end_time ? '-' + esc(m.end_time) : ''} / ${esc(m.location || 'MPR')}</span>
      </span>
      <span class="bstate bstate--${m.state.toLowerCase()}">${m.state}</span>
      <span class="brow__n"><b>${m.attendance_count}</b><span class="brow__nlab">checked in</span></span>
      ${m.attendance_count === 0
        ? `<button class="brow__del" data-bconfirm="${esc(m.id)}"
             aria-label="Delete GM ${pad(m.meeting_number)}">Delete</button>`
        : '<span class="brow__del brow__del--off" aria-hidden="true"></span>'}
      ${/* TEMP-TEST-TOOLING — purge a past meeting AND its stamps, for
           clearing test data before launch. Remove this whole
           expression with the rest of the tooling. */
        m.state !== 'UPCOMING' && m.attendance_count > 0
        ? `<button class="brow__del" data-bpurgetemp="${esc(m.id)}"
             data-bpurgeno="${pad(m.meeting_number)}"
             data-bpurgen="${m.attendance_count}"
             aria-label="Purge test meeting GM ${pad(m.meeting_number)} and its stamps"
             >Purge (test)</button>`
        : ''}
    </li>`;
  },

  createForm(){
    const f = this.form || {};
    return `<form class="bform" id="meetingForm">
      <h2 class="h2 bsec bform__head" style="margin-top:0">Schedule a General Meeting
        <span class="bform__seal" aria-hidden="true">${brandSeal('cnh')}</span></h2>

      <div class="bform__grid">
        <label class="field"><span class="kicker">Meeting number</span>
          <input class="input" id="mNo" type="number" min="1" inputmode="numeric"
                 value="${esc(f.no || '')}" placeholder="12"></label>
        <label class="field"><span class="kicker">Date</span>
          <input class="input" id="mDate" type="date" value="${esc(f.date || Schedule.today())}"></label>
        <label class="field"><span class="kicker">Start</span>
          <input class="input" id="mStart" type="time" value="${esc(f.start || '15:15')}"></label>
        <label class="field"><span class="kicker">End</span>
          <input class="input" id="mEnd" type="time" value="${esc(f.end || '16:15')}"></label>
      </div>

      <p class="authp__err" id="mErr" role="alert" aria-live="assertive" hidden></p>
      <button class="btn btn--go" type="submit" id="mGo">Schedule meeting</button>
    </form>`;
  },

  /* ── ROSTER ───────────────────────────────────────────────────
     Lives inside Progress rather than as its own tab. Same board-only
     authorisation as before: this widens nothing. */
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

  /* ── ONE MEETING ──────────────────────────────────────────────── */
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

  /* A percentage needs a denominator that means something. The club
     overview may not be loaded when a meeting is opened directly, and
     dividing by a number we do not have would invent a statistic — so
     this returns a dash instead of guessing. */
  shareOfClub(n){
    const base = this.overview && this.overview.participating_members;
    if (typeof base !== 'number' || base <= 0) return '—';
    return Math.round((n / base) * 100) + '%';
  },

  /* ── ATTENDANCE SESSION + QR ──────────────────────────────────── */
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
      <!-- the meeting picker is a row of tabs cut into the projector
           panel's top edge, not a floating chip row -->
      <div class="gmtabs" role="tablist">
        ${options.map(o => `<button class="gmtab ${o.id === sel.id ? 'gmtab--on' : ''}"
          role="tab" aria-selected="${o.id === sel.id}"
          data-bpick="${o.id}">GM ${pad(o.meeting_number)}</button>`).join('')}
      </div>

      <!-- THE PROJECTOR. This screen is read from across a room, so it
           is composed for that distance: an ink field carrying the
           meeting and the live count, and the code as the one bright
           plate on it. -->
      <section class="proj ${isOpen ? 'proj--live' : ''}">
        <div class="proj__side">
          <p class="proj__lab">${isOpen ? 'Scan this' : 'Not open yet'}</p>
          <p class="proj__no">GM ${pad(sel.meeting_number)}</p>
          <p class="proj__when">${esc(fmtDay(sel.meeting_date))} / ${esc(sel.start_time)} / MPR</p>
          ${isOpen ? `
            <p class="proj__count"><b id="attCount">-</b><span>checked in</span></p>
            <button class="proj__ctl" type="button" data-bend="${esc(sel.id)}">Close check-in</button>
          ` : `
            <p class="proj__shut">Nobody can check in until this is open.</p>
            <button class="proj__ctl proj__ctl--go" type="button" data-bstart="${esc(sel.id)}">Open check-in</button>
          `}
          <span class="proj__kci" aria-hidden="true">${brandSeal('kci')}</span>
        </div>

        ${isOpen ? `
          <!-- nothing is drawn over the code itself: a screentone or an
               ink border across a QR is a scan failure, not a flourish -->
          <div class="proj__plate">
            <div class="qrpanel__code" id="qrBox"></div>
            <p class="proj__cap">GM ${pad(sel.meeting_number)} / scan to check in</p>
          </div>
        ` : `
          <div class="proj__plate proj__plate--empty" aria-hidden="true">
            <svg class="proj__seal" viewBox="0 0 100 100">${sealArt()}</svg>
          </div>
        `}
      </section>
    </div>`;
  },
};
