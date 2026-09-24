"use strict";

const memberName = () => (Store.user && Store.user.name) || 'Member';

function stampShape(seed, grow = 0){
  const pts = [];
  const a1 = 1.4, a2 = .8, p1 = seed * 1.7, p2 = seed * 2.9;
  for (let i = 0; i < 36; i++){
    const a = i / 36 * 2 * Math.PI - Math.PI / 2;
    const r = 28 + grow + Math.sin(a * 3 + p1) * a1 + Math.sin(a * 5 + p2) * a2;
    pts.push((32 + Math.cos(a) * r).toFixed(2) + ' ' + (32 + Math.sin(a) * r).toFixed(2));
  }
  return 'M' + pts.join('L') + 'Z';
}

const STAMP_FIT = .62;

/* A stamp an officer added by hand was recorded when they added it,
   which is not when the member walked in; it says so instead of
   printing that time as a check-in. */
const byHand = scan => Boolean(scan) && (scan.method === 'board' || scan.method === 'manual');
const stampWhen = scan => byHand(scan) ? 'added by an officer' : fmtTime(scan.at);

/* the usual time and room are not repeated; a meeting that differs
   says how (the same rule the ledger and the board lists follow) */
const unusual = m => (m.time && m.time !== '12:40 PM') || (m.place && m.place !== Schedule.PLACE)
  ? [m.time, m.place].filter(Boolean) : [];

const C = {
  tier(r, total, prev = 0){
    /* one rule for a tier, read from the store (rewardState); the ticks
       count only the stamps between the rung below and this one, so a
       rung reads as reached exactly when it is */
    const at    = Store.tierState(r);
    const ready = at === 'unlocked';
    const state = at === 'claimed' ? 'claimed' : ready ? 'ready' : 'sealed';
    /* a claim is the member asking; the prize is theirs once an officer
       has handed it over. A club that does not record hand-overs sees
       only Claimed, as before */
    const took  = at === 'claimed' && r.handedAt;
    const note  = at !== 'claimed' || !Store.handovers ? ''
      : took ? `On ${fmtClubDay(r.handedAt)}` : 'Collect it from an officer at a meeting';
    const span  = Math.max(1, r.required - prev);
    const got   = Math.max(0, Math.min(span, total - prev));
    const left  = r.required - total;
    const far   = state === 'sealed' && total < prev;
    const say   = state === 'sealed' ? `${left} more ${left === 1 ? 'stamp' : 'stamps'}` : '';
    const ticks = Array.from({ length:span }, (_, i) =>
      `<i class="${i < got ? 'is-on' : ''}"></i>`).join('');

    return `<div class="tier tier--${state}${took ? ' tier--took' : ''}${far ? ' tier--far' : ''}" data-reward="${r.id}" style="--got:${(got / span).toFixed(3)}">
      <span class="tier__at"><b>${pad(r.required)}</b><span>stamps</span></span>
      <span class="tier__body">
        <span class="tier__name">${esc(r.name)}</span>
        ${r.desc ? `<span class="tier__desc">${esc(r.desc)}</span>` : ''}
        ${state === 'sealed' && !far ? `<span class="tier__ticks" aria-hidden="true">${ticks}</span>` : ''}
        ${ready && Store.claiming.has(`${Store.user && Store.user.id}:${r.id}`)
          ? `<button class="tier__claim" type="button" data-claim="${r.id}" aria-busy="true" aria-disabled="true" aria-label="${esc(`Claiming ${r.name}`)}">Claiming</button>`
          : ready
          ? `<button class="tier__claim" type="button" data-claim="${r.id}" aria-label="${esc(`Claim ${r.name}`)}">Claim</button>`
          : say ? `<span class="tier__say">${say}</span>` : ''}
        ${note ? `<span class="tier__note">${esc(note)}</span>` : ''}
      </span>
      ${at === 'claimed' ? `<span class="tier__punch">${took ? 'Collected' : 'Claimed'}</span>` : ''}
    </div>`;
  },

  sealGrid(live = false){
    const p = Rules.progress();
    const chrono = [...Store.scans]
      .sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);

    const goal = Store.rewards.find(r => r.required === p.floor + p.span) || null;
    const cardNo = p.card;
    const full = p.filled >= p.span;

    const cells = Array.from({ length:p.span }, (_, i) => {
      /* the next slot is where the member stands on the route: ringed in
         ink, and in the club's red while a check-in is open for it */
      const state = i < p.filled ? 'set' : i === p.filled ? 'next' : '';
      const hero = state === 'set' && i === p.filled - 1 ? ' seal--hero' : '';
      const mile = i === p.span - 1 ? ' seal--mile' : '';
      const now  = state === 'next' && live ? ' seal--live' : '';

      const tilt = state === 'set'
        ? `--press-tilt:${[-2.1, 1.4, -1.2, 2.3, -1.7][i % 5]}deg` : '';

      const rec = state === 'set' ? chrono[p.floor + i] : null;
      const mtg = rec ? Store.meetings.find(m => m.id === rec.meetingId) : null;
      const docket = rec && mtg ? C.sealMeta(rec, mtg) : '';

      const seed = p.floor + i + 1;
      const fit  = STAMP_FIT;
      return `<li class="seal ${state ? 'seal--' + state : ''}${hero}${mile}${now}" data-seal="${state || 'empty'}" style="${tilt}"${
        docket ? ` tabindex="0" aria-label="Stamp ${pad(p.floor + i + 1)}: general meeting ${
          mtg.no}, ${fmtDate(mtg.date)}, ${byHand(rec) ? 'added by an officer' : `checked in at ${fmtTime(rec.at)}`}"` : ''}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          ${mile ? `<path class="sf-back" d="${stampShape(seed * 3 + 1, 3.4)}"/>` : ''}
          <g class="sf-press">
            <path class="sf-face" d="${stampShape(seed, 0)}"/>
            <g class="seal__mark" transform="translate(${(32 - 32 * fit).toFixed(1)} ${(32 - 32 * fit).toFixed(1)}) scale(${fit})">${stampMark(p.floor + i)}</g>
          </g>
        </svg>
        <span class="seal__no">${pad(p.floor + i + 1)}</span>
        ${docket}
      </li>`;
    }).join('');

    const route =
      `<svg class="card__route card__route--l" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="9.5,12.3 28.8,24 48,12.3 66.8,21.5 86.5,34.3 59.3,44.5 38,47.3 12.3,57 34.5,72.3 74.5,71.2"/></svg>` +
      `<svg class="card__route card__route--p" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="16.0,8.6 46.0,13.3 74.0,21.1 81.0,40.6 58.0,50.0 31.0,54.7 11.0,72.7 34.0,81.3 58.0,71.9 83.0,83.6"/></svg>`;

    const say = full
      ? (goal && !goal.claimed ? `${goal.name} ready to claim`
         : goal ? `${goal.name} ${goal.handedAt ? 'collected' : 'claimed'}` : '')
      /* a prize already claimed (stamps taken away after the claim) is
         not held out as the thing to reach */
      : goal && !goal.claimed ? `${pad(p.remaining)} to ${goal.name}` : `${pad(p.remaining)} to a full card`;

    return `<section class="card${full ? ' card--full' : ''}${live ? ' card--live' : ''}">
      <div class="card__face">
        <div class="card__id">
          <span class="card__cardno">Card ${pad(cardNo)}</span>
          <p class="card__num"><b>${p.filled}</b><span>/ ${p.span}</span></p>
          <span class="card__idrule" aria-hidden="true"></span>
          ${full && goal && !goal.claimed
            ? `<button class="card__goal card__goal--go link" type="button" data-go="rewards">${esc(say)}</button>`
            : say ? `<p class="card__goal">${esc(say)}</p>` : ''}
          <span class="card__kci" aria-hidden="true">${brandSeal('kci')}</span>
        </div>
        <div class="card__field">
          ${route}
          <ol class="seals" id="seals" aria-label="${p.filled} of ${p.span} stamps on this card">${cells}</ol>
        </div>
      </div>
      ${full ? '<span class="card__punch" aria-hidden="true">Card full</span>' : ''}
    </section>`;
  },

  /* a state that asks nothing of the member is a line of type */
  line(lab, text){
    return `<p class="nowline"><b class="nowline__lab">${esc(lab)}</b><span>${text}</span></p>`;
  },

  sealMeta(rec, m){
    const away = m.place && m.place !== Schedule.PLACE ? ` / ${esc(m.place)}` : '';
    return `<span class="sealmeta" data-layer aria-hidden="true">
      <b class="sealmeta__no">GM ${pad(m.no)}</b>
      <span>${fmtDate(m.date)} / ${stampWhen(rec)}${away}</span>
    </span>`;
  },

  empty(title){
    return C.line(title, '');
  },

  ledgerRow(m){
    const state = Store.state(m);
    const scan  = Store.scanFor(m.id);

    const idx = state === 'set'
      ? [...Store.scans].sort((a,b)=>String(a.at)<String(b.at)?-1:1)
          .findIndex(x => x.meetingId === m.id)
      : -1;
    const mark = idx >= 0
      ? `<svg class="lrow__mark" viewBox="0 0 64 64" aria-hidden="true">${stampMark(idx)}</svg>`
      : `<span class="lrow__slot" aria-hidden="true"></span>`;

    /* the glyph already says stamped; the place is said only when it is
       not the usual room */
    const away = m.place && m.place !== Schedule.PLACE ? ` / ${esc(m.place)}` : '';
    const detail = {
      set:  (scan ? (byHand(scan) ? 'Added by an officer' : fmtTime(scan.at)) : 'Stamped') + away,
      open: 'Check-in open' + away,
      /* today's is still the day's: an officer can add a stamp by hand */
      miss: (m.today ? 'Not checked in' : 'Missed') + away,
      upcoming: esc(m.time) + away,
    }[state];

    const el   = state === 'open' ? 'button' : 'div';
    const attr = state === 'open' ? ' type="button" data-go="scan"' : '';
    /* read aloud only what the visible row does not already say */
    const sr   = state === 'set' ? 'Stamped' : '';

    return `<${el} class="lrow lrow--${state}"${attr}>
      <span class="lrow__no">${pad(m.no)}</span>
      <span class="lrow__stamp">${mark}</span>
      <span class="lrow__body">
        <span class="lrow__date">${m.today ? 'Today' : fmtDay(m.date)}</span>
        <span class="lrow__when">${detail}</span>
      </span>
      ${state === 'open' ? '<span class="lrow__go">Scan</span>' : ''}
      ${sr ? `<span class="sr-only">${sr}</span>` : ''}
    </${el}>`;
  },
};

C.account = () => `<section class="acct">
  <h2 class="acct__mark">Account</h2>
  <div class="acct__row">
    <button class="rail__motion" type="button" data-motion aria-pressed="false"></button>
  </div>
  <button class="acct__out" data-signout type="button">Sign out</button>
</section>`;

/* A card already filled, filed under the one in progress: the same seat
   map and route in miniature, every seat pressed, the prize it earned
   punched across it. */
const SEATS = [[2,4,15,-2.5],[21.5,16,14.5,1.5],[40.5,4,15,-1],[59.5,13.5,14.5,2],[79,26,15,-2],
               [52,36.5,14.5,1],[30.5,39,15,-1.5],[5,49,14.5,2.2],[27,64,15,-2],[63,58.5,23,-3]];
const ROUTE = [[9.5,12.3],[28.8,24],[48,12.3],[66.8,21.5],[86.5,34.3],[59.3,44.5],[38,47.3],[12.3,57],[34.5,72.3],[74.5,71.2]];

/* where a prize stands, in the one word the member reads for it */
const prizeWord = r => !r ? '' : r.handedAt ? 'Collected' : r.claimed ? 'Claimed'
  : Store.tierState(r) === 'unlocked' ? 'Ready to claim' : '';

C.filed = (k, run) => {
  const prize = Store.rewards.find(r => r.required === (k + 1) * Rules.CARD) || null;
  const word  = prizeWord(prize);
  const lift  = (32 - 32 * STAMP_FIT).toFixed(1);
  const seats = SEATS.map(([x, y, s, lean], i) => {
    const n = k * Rules.CARD + i;
    const tilt = lean + [-2.1, 1.4, -1.2, 2.3, -1.7][i % 5];
    return `<g transform="translate(${x} ${(y * .9).toFixed(2)}) scale(${(s / 64).toFixed(4)}) rotate(${tilt} 32 32)">
      ${i === 9 ? `<path class="fc-back" d="${stampShape((n + 1) * 3 + 1, 3.4)}"/>` : ''}
      <path class="fc-face" d="${stampShape(n + 1, 0)}"/>
      <g class="fc-mark" transform="translate(${lift} ${lift}) scale(${STAMP_FIT})">${stampMark(n)}</g>
    </g>`;
  }).join('');
  const route = ROUTE.map(([x, y]) => `${x},${(y * .9).toFixed(2)}`).join(' ');
  return `<li class="filed${prize && prize.handedAt ? ' filed--took' : ''}">
    <div class="filed__card" aria-hidden="true">
      <span class="filed__id"><b>${pad(k + 1)}</b></span>
      <svg class="filed__field" viewBox="0 0 100 90"><polyline class="fc-route" points="${route}"/>${seats}</svg>
      ${word ? `<span class="filed__punch">${word}</span>` : ''}
    </div>
    <p class="filed__no">Card ${pad(k + 1)}</p>
    <p class="filed__when">${fmtDay(run[0].at)} – ${fmtDay(run[run.length - 1].at)}</p>
    ${prize ? `<p class="filed__prize">${esc(prize.name)}${word ? ` / ${word.toLowerCase()}` : ''}</p>` : ''}
  </li>`;
};

/* The meeting a day is about, as a ticket: its number on the stub, the
   day and what stands on the body. Open, the whole ticket is the way in;
   stamped, it carries the impression it earned. */
C.ticket = ({ m, kick, day = '', meta = '', go = false, scan = null, quiet = false }) => {
  const idx = scan ? [...Store.scans].sort((a, b) => String(a.at) < String(b.at) ? -1 : 1)
    .findIndex(x => x.meetingId === m.id) : -1;
  const lift = (32 - 32 * STAMP_FIT).toFixed(1);
  const inner = `
    <span class="tkt__stub"><span class="tkt__gm">GM</span> <b class="tkt__no">${pad(m.no)}</b></span>
    <span class="tkt__body">
      <span class="tkt__kick">${esc(kick)}</span>
      <span class="tkt__day">${day || (m.today ? 'Today' : fmtDate(m.date))}</span>
      ${meta ? `<span class="tkt__meta">${meta}</span>` : ''}
      ${go ? '<span class="tkt__verb">Check in</span>' : ''}
    </span>
    ${idx >= 0 ? `<svg class="tkt__imp" viewBox="0 0 64 64" aria-hidden="true">
      <path class="tkt__face" d="${stampShape(idx + 1, 0)}"/>
      <g transform="translate(${lift} ${lift}) scale(${STAMP_FIT})">${stampMark(idx)}</g></svg>` : ''}`;
  const cls = `tkt${go ? ' tkt--live' : scan ? ' tkt--set' : quiet ? ' tkt--quiet' : ''}`;
  return go
    ? `<button class="${cls}" type="button" data-go="scan">${inner}</button>`
    : `<div class="${cls}">${inner}</div>`;
};

const Views = {
  loadFailure(title){
    return `<div class="view">
      <header class="rechead">
        <h1 class="title rechead__title">${title}</h1>
      </header>
      <section class="rig">
        <div class="panel bpanel fail">
          <p class="kicker">Could not load</p>
          <p>Check your connection.</p>
          <button class="btn btn--go" type="button" data-reload data-busy="Retrying">Try again</button>
        </div>
      </section>
    </div>`;
  },

  home(){
    if (Store.failed) return this.loadFailure('Today');
    /* the ticket answers "what now": check in, checked in, today's
       meeting still to come, or the next one. Only what the record
       says is printed; a member cannot see when check-in will open, so
       the page never guesses */
    const day  = Store.todayMeeting();
    const scan = day && Store.scanFor(day.id);
    const live = Boolean(day && day.open && !scan);
    /* soonest first, within a day by start time, then number */
    const at = m => { const v = clockMinutes(m.time); return Number.isNaN(v) ? 0 : v; };
    const soonest = (a, b) => String(a.date).localeCompare(String(b.date)) || at(a) - at(b) || a.no - b.no;
    const next = Store.meetings.filter(m => m.upcoming && (!day || m.id !== day.id)).sort(soonest)[0] || null;
    const where = m => unusual(m).map(esc).join(' / ');

    let act = '';
    if (live)
      act = C.ticket({ m:day, kick:'Check-in open', meta:where(day), go:true });
    else if (scan)
      act = C.ticket({ m:day, kick:'Checked in', meta:stampWhen(scan), scan });
    /* over, and no stamp: said as today's fact, not yet a "missed" one,
       since an officer can still add a stamp by hand */
    else if (day && day.ended && !day.open)
      act = C.ticket({ m:day, kick:'Not checked in', quiet:true });
    /* under way and not open: before opening or after an early close,
       which a member cannot tell apart, so only what is true now */
    else if (day && day.started && !day.open)
      act = C.ticket({ m:day, kick:'Check-in not open', quiet:true });
    /* the day's own meeting gives its time even when it is the usual
       one: today, that is the thing to know */
    else if (day)
      act = C.ticket({ m:day, kick:'Today', day:esc(day.time || 'Today'),
        meta:unusual(day).includes(day.place) ? esc(day.place) : '', quiet:true });
    else if (next)
      act = C.ticket({ m:next, kick:'Next', meta:where(next), quiet:true });

    const showing = day ? day.id : next ? next.id : null;
    const ahead = Store.meetings
      .filter(m => m.upcoming && m.id !== showing)
      .sort(soonest)
      .slice(0, 3);

    /* the last stamp, unless the ticket is already about it */
    const chrono = [...Store.scans].sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);
    const last = chrono[chrono.length - 1];
    const lastM = last && Store.meeting(last.meetingId);
    const showLast = lastM && !(scan && lastM.id === day.id);

    const side = showLast || ahead.length ? `<div class="deck__side">
        ${showLast ? `<p class="deck__last">
          <span class="deck__lab">Last stamp</span>
          <span class="deck__val">GM ${pad(lastM.no)} / ${fmtDay(lastM.date)}</span>
        </p>` : ''}
        ${ahead.length ? `<section class="ahead">
          <h2 class="ahead__mark">Ahead</h2>
          <ul class="ahead__list">
            ${ahead.map(m => `<li class="ahead__row">
              <span class="ahead__no">GM ${pad(m.no)}</span>
              <span class="ahead__day">${fmtDate(m.date)}</span>
              ${unusual(m).length ? `<span class="ahead__at">${unusual(m).map(esc).join(' / ')}</span>` : ''}
            </li>`).join('')}
          </ul>
        </section>` : ''}
      </div>` : '';

    return `<div class="view view--home">
      <header class="rechead">
        <h1 class="title rechead__title">Today</h1>
      </header>

      <div class="deck${live ? ' deck--live' : ''}">
        ${act ? `<div class="deck__act">${act}</div>` : ''}
        ${C.sealGrid(live)}
        ${side}
      </div>
    </div>`;
  },

  record(){
    if (Store.failed) return this.loadFailure('Record');

    /* newest first, within a day too: by start time, then number */
    const at = m => { const v = clockMinutes(m.time); return Number.isNaN(v) ? 0 : v; };
    const newest = (a, b) => String(b.date).localeCompare(String(a.date)) || at(b) - at(a) || b.no - a.no;
    const held = [...Store.heldMeetings()].sort(newest);
    const counted = Store.countedMeetings();
    const kept = counted.filter(m => Store.attended(m.id)).length;
    const gone = counted.length - kept;

    /* the ledger is kept by the month, the way a club's minutes are */
    const months = [];
    held.forEach(m => {
      const key = String(m.date).slice(0, 7);
      const last = months[months.length - 1];
      if (last && last.key === key) last.rows.push(m);
      else months.push({ key, rows:[m] });
    });
    const monthName = key => onClock(`${key}-01`, { month:'long' });

    /* every meeting held since the member joined, oldest first, as one
       line of marks: pressed where they were stamped */
    const line = [...held].reverse().map(m => {
      const s = Store.state(m);
      return `<i class="strip__m strip__m--${s}${m.today && s === 'miss' ? ' strip__m--today' : ''}"></i>`;
    }).join('');

    return `<div class="view view--record">
      <header class="rechead">
        <h1 class="title rechead__title">Record</h1>
      </header>

      ${held.length ? `<div class="recbody">
        <aside class="tally">
          <p class="tally__kept"><b>${kept}</b> <span>stamped</span></p>
          <p class="tally__gone"><b>${gone}</b> <span>missed</span></p>
          <p class="tally__held">${held.length} ${held.length === 1 ? 'meeting' : 'meetings'} held since
            ${fmtDay(held[held.length - 1].date)}</p>
          <span class="strip" aria-hidden="true">${line}</span>
        </aside>

        <section class="ledger" aria-label="Meetings, newest first">
          ${months.map(g => {
            const got = g.rows.filter(m => Store.attended(m.id)).length;
            return `<h2 class="ledger__month">
                <span class="ledger__mname">${monthName(g.key)}</span>
                <span class="ledger__mcount">${got} of ${g.rows.length}</span>
              </h2>
              ${g.rows.map(m => C.ledgerRow(m)).join('')}`;
          }).join('')}
        </section>
      </div>`
      : C.empty('No meetings held yet')}

    </div>`;
  },

  rewards(){
    if (Store.failed) return this.loadFailure('Rewards');
    const total = Store.totalStamps();
    const tiers = [...Store.rewards].sort((a, b) => a.required - b.required);
    const next = tiers.find(t => total < t.required) || null;
    const left = next ? next.required - total : 0;

    return `<div class="view view--rewards">
      <header class="rechead">
        <h1 class="title rechead__title">Rewards</h1>
      </header>

      <div class="prize">
        <div class="prize__fig">
          ${next ? `<p class="prize__n">${pad(left)}</p>
          <p class="prize__to">more ${left === 1 ? 'stamp' : 'stamps'} to <b>${esc(next.name)}</b></p>`
          : `<p class="prize__n">${total}</p>
          <p class="prize__to">Every reward reached</p>`}
          <p class="prize__of">${total} ${total === 1 ? 'stamp' : 'stamps'} so far</p>
        </div>

        <section class="tiers" aria-label="Rewards, by the stamps they take">
          ${tiers.map((t, i) => C.tier(t, total, i ? tiers[i - 1].required : 0)).join('')}
        </section>
      </div>
    </div>`;
  },

  scan(){
    /* already stamped for the open meeting: nothing to scan, and the page
       says so the way Today does */
    const open = Store.openMeeting();
    const stamp = open && Store.scanFor(open.id);
    if (stamp) return `<div class="view view--scan">
      <header class="rechead">
        <h1 class="title rechead__title">Scan</h1>
      </header>
      <div class="deck__act">${C.ticket({ m:open, kick:'Checked in', meta:stampWhen(stamp), scan:stamp })}</div>
    </div>`;

    const standing = scanStanding();

    return `<div class="view view--scan">
      <header class="rechead">
        <h1 class="title rechead__title">Scan</h1>
      </header>

      <div class="scanframe">
        <p class="standing">
          <span class="standing__lab">${standing.lab}</span>
          <span class="standing__at">${standing.at}</span>
        </p>

        <div class="viewer" id="viewer">
          <video id="cam" playsinline muted autoplay></video>
          <div class="reticle" id="reticle" aria-hidden="true">
            <span class="reticle__c reticle__c--tl"></span>
            <span class="reticle__c reticle__c--tr"></span>
            <span class="reticle__c reticle__c--bl"></span>
            <span class="reticle__c reticle__c--br"></span>
          </div>
        </div>

        <p class="scanline scanline--boot" id="scanLine" aria-live="polite">
          <i class="scanline__dot" aria-hidden="true"></i>
          <span class="scanline__msg" id="scanMsg">Starting camera</span>
        </p>
      </div>
    </div>`;
  },

  boardSpread(title, tail = ''){
    /* A chapter is always its own list. An open member or meeting belongs
       to the chapter it was opened from and does not follow the reader
       out of it. */
    BoardUI.memberDetail = null;
    BoardUI.meetingDetail = null;
    BoardUI.confirmDelete = null;
    BoardUI.deleteNote = null;
    /* a chapter opened afresh reads its prize list afresh */
    BoardUI.prizesStale = true;
    /* a fresh chapter opens on the wait panel, never on another
       chapter's data */
    BoardUI.loading = true;
    BoardUI.shown = null;
    return `<div class="view view--board">
      <header class="rechead">
        <h1 class="title rechead__title">${title}</h1>
      </header>
      <section class="rig">
        <div id="boardPane">${BoardUI.pane()}</div>
      </section>
      ${tail}
    </div>`;
  },

  /* Check-in ends with the account block on phones, the way Member
     does; from 1024px up the rail's foot carries it instead. */
  bcheckin(){  BoardUI.tab = 'session';  return this.boardSpread('Check-in', C.account()); },
  bmeet(){     BoardUI.tab = 'meetings'; return this.boardSpread('Meetings'); },
  bmembers(){  BoardUI.tab = 'progress'; return this.boardSpread('Members'); },

  profile(){
    if (Store.failed) return this.loadFailure('Member');
    const held     = Store.countedMeetings();
    const attended = held.filter(m => Store.attended(m.id)).length;
    const total    = Store.totalStamps();
    const name     = memberName();
    const handle   = (Store.user && Store.user.username) || name;
    const joined   = Store.user && Store.user.joined;
    const chrono   = [...Store.scans].sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);
    const p        = Rules.progress();
    /* the cards filled before the one on the sheet */
    const filed    = Array.from({ length:p.card - 1 }, (_, k) =>
      C.filed(k, chrono.slice(k * Rules.CARD, (k + 1) * Rules.CARD))).reverse();
    const open     = Store.openMeeting();
    const live     = Boolean(open && !Store.scanFor(open.id));
    /* the name is printed once; the username only where it differs */
    const tag = [Store.isBoard ? 'Board' : '',
                 handle.toLowerCase() !== name.toLowerCase() ? esc(handle) : ''].filter(Boolean);

    return `<div class="view view--member">
      <header class="rechead">
        <h1 class="title rechead__title">Member</h1>
      </header>

      <div class="mem${filed.length ? ' mem--filed' : ''}">
        <section class="who" aria-label="Member">
          <p class="who__org">Cali-Nev-Ha District<br>Key Club</p>
          <span class="who__emblem" aria-hidden="true">${brandSeal('cnh')}</span>
          <div class="who__id">
            ${tag.length ? `<p class="who__tag">${tag.join(' / ')}</p>` : ''}
            <p class="who__name">${esc(name)}</p>
            ${joined ? `<p class="who__since">Member since ${onClock(joined, { month:'long', year:'numeric' })}</p>` : ''}
          </div>
        </section>

        ${C.sealGrid(live)}

        <section class="standing-band">
          <p class="standing-band__fig">${total}</p>
          <p class="standing-band__of">${total === 1 ? 'stamp' : 'stamps'} collected</p>
          <dl class="standing-band__rest">
            <div><dt>Meetings attended</dt><dd>${attended} of ${held.length}</dd></div>
            <div><dt>Attendance</dt><dd>${held.length ? `${Store.attendanceRate()}%` : '–'}</dd></div>
            <div><dt>Rewards</dt><dd>${Store.rewardsUnlocked()} of ${Store.rewards.length}</dd></div>
          </dl>
        </section>

        ${filed.length ? `<section class="files">
          <h2 class="files__mark">Completed cards</h2>
          <ol class="files__list">${filed.join('')}</ol>
        </section>` : ''}
      </div>

      ${C.account()}
    </div>`;
  },

  auth(){
    /* a session is stored but could not be read (offline at load): the
       member is asked to retry, not to type the password again */
    if (Store.loadError === 'SESSION') return this.loadFailure('Keystamp');
    const mode = AuthUI.mode;
    const passwordField = ({ id, name, label, autocomplete, rule = '' }) => `
          <div class="authp__f">
            <label class="authp__lab" for="${id}">${label}</label>
            <div class="authp__pw">
              <input class="authp__in" id="${id}" name="${name}" type="password"
                     autocomplete="${autocomplete}" autocapitalize="none"
                     autocorrect="off" spellcheck="false"${rule ? ` aria-describedby="${id}Rule"` : ''}>
              <button class="authp__eye" type="button" data-eye="${id}"
                      aria-label="Show password" aria-pressed="false"
                      aria-controls="${id}">${ICON.eye}</button>
            </div>
            ${rule ? `<span class="authp__rule" id="${id}Rule">${rule}</span>` : ''}
          </div>`;
    const up = mode === 'up';

    return `<div class="view view--auth">

      <div class="spread">

        <div class="spread__field crop" aria-hidden="true">
          <svg class="spread__seal crop__art" viewBox="0 0 100 100">${sealArt()}</svg>
          <span class="spread__kci">${brandSeal('kci')}</span>
        </div>

        <header class="spread__head">
          <p class="spread__sub"><span>Key Club attendance</span></p>
          <h1 class="spread__wm">Keystamp</h1>
        </header>

        <form class="authp" id="authForm" novalidate>

          <div class="authp__f">
            <label class="authp__lab" for="authUser">Username</label>
            <input class="authp__in" id="authUser" name="username" type="text"
                   autocomplete="username" autocapitalize="none" spellcheck="false"
                   inputmode="latin" maxlength="${Config.USERNAME_MAX}"${up ? ' aria-describedby="userRule"' : ''}>
            ${up ? '<span class="authp__rule" id="userRule">Letters, numbers, _ and .</span>' : ''}
          </div>

          ${passwordField({ id:'authPass', name:'password', label:'Password',
                            autocomplete: up ? 'new-password' : 'current-password',
                            rule: up ? '8 characters or more' : '' })}

          ${up ? passwordField({ id:'authPass2', name:'confirm', label:'Confirm password',
                                 autocomplete:'new-password' }) : ''}

          <div class="authp__act">
            <button class="authp__go" type="submit" id="authGo" data-busy="${up ? 'Creating' : 'Signing in'}">
              ${up ? 'Create account' : 'Sign in'}
            </button>
            <button class="authp__swap" type="button" id="authSwap">
              ${up ? 'Sign in' : 'Create account'}
            </button>
          </div>

          <!-- a refusal is printed under the actions, so the button under
               the finger never moves -->
          <p class="authp__err" id="authErr" role="alert" aria-live="assertive"></p>

          ${AuthUI.setupNotice()}
        </form>

      </div>
    </div>`;
  },
};
