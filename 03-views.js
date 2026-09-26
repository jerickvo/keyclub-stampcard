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
  tier(r, total, prev = 0, k = 0){
    /* one rule for a tier, read from the store (rewardState) */
    const at    = Store.tierState(r);
    const ready = at === 'unlocked';
    const state = at === 'claimed' ? 'claimed' : ready ? 'ready' : 'sealed';
    /* a claim is the member asking; the prize is theirs once an officer
       has handed it over. A club that does not record hand-overs sees
       only Claimed, as before */
    const took  = at === 'claimed' && r.handedAt;
    /* a claim is said once, as a line of type: collected (with its day),
       or claimed and waiting for an officer */
    const note  = at !== 'claimed' ? ''
      : took ? `Collected ${fmtClubDay(r.handedAt)}`
      : Store.handovers ? 'Claimed; collect it from an officer' : 'Claimed';
    const left  = r.required - total;
    const far   = state === 'sealed' && total < prev;
    const say   = state === 'sealed' && !far ? `${left} more ${left === 1 ? 'stamp' : 'stamps'}` : '';
    const busy  = ready && Store.claiming.has(`${Store.user && Store.user.id}:${r.id}`);
    /* the claim is a blank stamp waiting to be pressed, the word inside it */
    const claim = !ready ? '' : `<button class="tier__claim" type="button" data-claim="${r.id}"${busy ? ' aria-busy="true" aria-disabled="true"' : ''} aria-label="${esc(`${busy ? 'Claiming' : 'Claim'} ${r.name}`)}">
        <svg class="tier__shape" viewBox="0 0 64 64" aria-hidden="true"><path d="${stampShape(r.required * 3 + 1, 3.4)}"/></svg>
        <span class="tier__word">${busy ? 'Claiming' : 'Claim'}</span>
      </button>`;

    return `<div class="tier tier--${state}${took ? ' tier--took' : ''}${far ? ' tier--far' : ''}" data-reward="${r.id}" style="--k:${k}">
      <span class="tier__at"><b>${pad(r.required)}</b><span class="sr-only"> stamps</span></span>
      <span class="tier__body">
        <span class="tier__name">${esc(r.name)}</span>
        ${r.desc ? `<span class="tier__desc">${esc(r.desc)}</span>` : ''}
        ${say ? `<span class="tier__say">${say}</span>` : ''}
        ${note ? `<span class="tier__note">${esc(note)}</span>` : ''}
        ${claim}
      </span>
    </div>`;
  },

  /* The ten-stamp card. `form` is how it is printed: 'sheet' is the
     card as an object (Member: an ink head band, the paper field, the
     district's seal under the stamps), 'field' is the same seats set
     straight onto the page (Today). The seats, the route and the states
     are the same in both. */
  sealGrid(live = false, form = 'sheet'){
    const p = Rules.progress();
    const chrono = [...Store.scans]
      .sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);

    const goal = Store.rewards.find(r => r.required === p.floor + p.span) || null;
    const cardNo = p.card;
    const full = p.filled >= p.span;
    const liveNo = live ? (Store.openMeeting() || {}).no : null;

    const cells = Array.from({ length:p.span }, (_, i) => {
      /* the next seat is where the member stands on the route; while a
         check-in is open for it, the seat itself is the way in */
      const state = i < p.filled ? 'set' : i === p.filled ? 'next' : '';
      const hero = form === 'sheet' && state === 'set' && i === p.filled - 1 ? ' seal--hero' : '';
      const mile = i === p.span - 1 ? ' seal--mile' : '';
      const now  = state === 'next' && live ? ' seal--live' : '';

      const tilt = state === 'set'
        ? `--press-tilt:${[-2.1, 1.4, -1.2, 2.3, -1.7][i % 5]}deg` : '';

      const rec = state === 'set' ? chrono[p.floor + i] : null;
      const mtg = rec ? Store.meetings.find(m => m.id === rec.meetingId) : null;
      const docket = rec && mtg ? C.sealMeta(rec, mtg) : '';
      const control = docket
        ? ` tabindex="0" role="button" aria-expanded="false" aria-label="Stamp ${pad(p.floor + i + 1)}: general meeting ${
            mtg.no}, ${fmtDate(mtg.date)}, ${byHand(rec) ? 'added by an officer' : `checked in at ${fmtTime(rec.at)}`}"`
        : now ? ` tabindex="0" role="button" data-go="scan" aria-label="Check in${liveNo ? ` at general meeting ${liveNo}` : ''}"` : '';

      const seed = p.floor + i + 1;
      const fit  = STAMP_FIT;
      return `<li class="seal ${state ? 'seal--' + state : ''}${hero}${mile}${now}" data-seal="${state || 'empty'}" style="${tilt}"${control}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          ${mile ? `<path class="sf-back" d="${stampShape(seed, 3.4)}"/>` : ''}
          <g class="sf-press">
            <path class="sf-face" d="${stampShape(seed, 0)}"/>
            <g class="seal__mark" transform="translate(${(32 - 32 * fit).toFixed(1)} ${(32 - 32 * fit).toFixed(1)}) scale(${fit})">${stampMark(p.floor + i)}</g>
          </g>
        </svg>
        <span class="seal__no">${pad(p.floor + i + 1)}</span>
        ${now && form === 'sheet' ? `<span class="seal__go" aria-hidden="true">Check in · ${pad(p.floor + i + 1)}</span>` : ''}
        ${docket}
      </li>`;
    }).join('');

    /* the route is drawn seat to seat: solid where the member has been,
       solid up to the seat they stand on, dotted beyond */
    const L = [[9.5,12.3],[28.8,24],[48,12.3],[66.8,21.5],[86.5,34.3],[59.3,44.5],[38,47.3],[12.3,57],[34.5,72.3],[74.5,71.2]];
    const P = [[17,10.2],[46,13.3],[74,21.1],[81,40.6],[58,50],[31,54.7],[14,72.7],[37.5,81.3],[58,71.9],[83,83.6]];
    const segs = pts => pts.slice(1).map(([x2, y2], i) => {
      const [x1, y1] = pts[i];
      const on = full || i < p.filled - 1 ? ' card__seg--set' : i === p.filled - 1 ? ' card__seg--to' : '';
      return `<line class="card__seg${on}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }).join('');
    const route =
      `<svg class="card__route card__route--l" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${segs(L)}</svg>` +
      `<svg class="card__route card__route--p" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${segs(P)}</svg>`;

    const ready = full && goal && !goal.claimed;
    const say = full
      ? (ready ? `${goal.name} ready to claim`
         : goal ? `${goal.name} ${goal.handedAt ? 'collected' : 'claimed'}` : '')
      /* a prize already claimed (stamps taken away after the claim) is
         not held out as the thing to reach */
      : goal && !goal.claimed ? `${p.remaining} to ${goal.name}` : `${p.remaining} to a full card`;
    /* the prize that is ready is a printed instruction, the card's one action */
    const goalLine = ready
      ? `<button class="card__goal card__goal--go" type="button" data-go="rewards"><span class="card__goal__arrow" aria-hidden="true">→</span>${esc(goal.name)} · ready to claim</button>`
      : say ? `<p class="card__goal">${esc(say)}</p>` : '';

    const cls = `card card--${form}${full ? ' card--full' : ''}${live ? ' card--live' : ''}`;
    const field = `<div class="card__field">
        ${form === 'sheet' ? `<span class="card__wm" aria-hidden="true">${brandSeal('cnh')}</span>` : ''}
        ${route}
        <ol class="seals" id="seals" aria-label="${p.filled} of ${p.span} stamps on this card">${cells}</ol>
      </div>`;
    const punch = full ? '<span class="card__punch" aria-hidden="true">Card full</span>' : '';

    if (form === 'field') return `<section class="${cls}">
      <div class="card__line">
        <span class="card__num"><b>${p.filled}</b> <span>of ${p.span}</span></span>
        ${goalLine}
      </div>
      ${field}${punch}
    </section>`;

    /* the sheet: an ink head band, the field, and a foot band that
       carries the goal line (and, on a phone, a stamp's printed record) */
    return `<section class="${cls}">
      <div class="card__id">
        <span class="card__cardno">Card ${pad(cardNo)}</span>
        <p class="card__num"><b>${p.filled}</b><span>/ ${p.span}</span></p>
        <span class="card__kci" aria-hidden="true">${brandSeal('kci')}</span>
      </div>
      ${field}
      <div class="card__foot">${goalLine}</div>
    </section>`;
  },

  /* a state that asks nothing of the member is a line of type */
  line(lab, text){
    return `<p class="nowline"><b class="nowline__lab">${esc(lab)}</b><span>${text}</span></p>`;
  },

  sealMeta(rec, m){
    const hand = byHand(rec);
    return `<span class="sealmeta" data-layer aria-hidden="true">
      <b class="sealmeta__no">GM ${pad(m.no)}</b>
      <span class="sealmeta__day">${onClock(m.date, { month:'short', day:'numeric', year:'numeric' })}</span>
      <span class="sealmeta__row">${hand ? 'By an officer' : fmtTime(rec.at)}<i>${esc(m.place || Schedule.PLACE)}</i></span>
      <span class="sealmeta__how">${hand ? 'Added by hand' : 'QR verified'}</span>
    </span>`;
  },

  empty(title){
    return C.line(title, '');
  },

  ledgerRow(m, gap = 1){
    const state = Store.state(m);
    const scan  = Store.scanFor(m.id);

    const idx = state === 'set'
      ? [...Store.scans].sort((a,b)=>String(a.at)<String(b.at)?-1:1)
          .findIndex(x => x.meetingId === m.id)
      : -1;
    /* the stamp, pressed beside the line; a meeting missed leaves its
       place blank — the blank is the mark */
    const mark = idx >= 0
      ? `<svg class="lrow__mark" viewBox="0 0 64 64" aria-hidden="true"><path class="lrow__face" d="${stampShape(idx + 1, 0)}"/>
          <g transform="translate(${(32 - 32 * STAMP_FIT).toFixed(1)} ${(32 - 32 * STAMP_FIT).toFixed(1)}) scale(${STAMP_FIT})">${stampMark(idx)}</g></svg>`
      : '';

    /* the room is said only when it is not the usual one */
    const away = m.place && m.place !== Schedule.PLACE ? esc(m.place) : '';
    const detail = {
      set:  scan ? (byHand(scan) ? 'By an officer' : fmtTime(scan.at)) : '',
      open: '',
      /* today's is still the day's: an officer can add a stamp by hand */
      miss: m.today ? 'Not checked in' : '',
      upcoming: esc(m.time),
    }[state];
    const sr = { set:'Stamped', miss:m.today ? '' : 'Missed', open:'Check-in open', upcoming:'Ahead' }[state];

    const el   = state === 'open' ? 'button' : 'div';
    const attr = state === 'open' ? ' type="button" data-go="scan"' : '';

    return `<${el} class="lrow lrow--${state}${gap > 1 ? ` lrow--gap${gap}` : ''}"${attr}>
      <span class="lrow__no">${pad(m.no)}</span>
      <span class="lrow__stamp">${mark}</span>
      <span class="lrow__body">
        <span class="lrow__date">${m.today ? 'Today' : fmtDay(m.date)}</span>
        ${detail ? `<span class="lrow__when">${detail}</span>` : ''}
        ${away ? `<span class="lrow__at">${away}</span>` : ''}
      </span>
      ${state === 'open' ? '<span class="lrow__go">Check in</span>' : ''}
      ${sr ? `<span class="sr-only">${sr}</span>` : ''}
    </${el}>`;
  },
};

/* the record's colophon: who holds it, and the two settings a member has */
C.account = () => `<section class="acct" aria-label="Account">
  <p class="acct__who"><span class="acct__held">Record held by</span>
    <span class="acct__name">${esc(memberName())}</span>
    <span class="acct__role">${Store.isBoard ? 'Board' : 'Member'}${Store.user && Store.user.joined ? ` / since ${esc(onClock(Store.user.joined, { month:'short', year:'numeric' }))}` : ''}</span></p>
  <div class="acct__row">
    <button class="rail__motion" type="button" data-motion aria-pressed="false" aria-label="Reduce motion"></button>
    <button class="acct__out" data-signout type="button">Sign out</button>
  </div>
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
  const ready = prize && !prize.claimed && Store.tierState(prize) === 'unlocked';
  const lift  = (32 - 32 * STAMP_FIT).toFixed(1);
  const seats = SEATS.map(([x, y, s, lean], i) => {
    const n = k * Rules.CARD + i;
    const tilt = lean + [-2.1, 1.4, -1.2, 2.3, -1.7][i % 5];
    /* each seat names the meeting it was pressed at, so no two filed
       cards read alike */
    const rec = run[i];
    const mtg = rec ? Store.meetings.find(m => m.id === rec.meetingId) : null;
    return `<g transform="translate(${x} ${(y * .9).toFixed(2)}) scale(${(s / 64).toFixed(4)}) rotate(${tilt} 32 32)">
      ${i === 9 ? `<path class="fc-back" d="${stampShape((n + 1) * 3 + 1, 3.4)}"/>` : ''}
      <path class="fc-face" d="${stampShape(n + 1, 0)}"/>
      <g class="fc-mark" transform="translate(${lift} ${lift}) scale(${STAMP_FIT})">${stampMark(n)}</g>
      ${mtg ? `<text class="fc-no" x="32" y="78" text-anchor="middle" style="font-size:${(12 * 15 / s).toFixed(1)}px">GM ${pad(mtg.no)}</text>` : ''}
    </g>`;
  }).join('');
  const route = ROUTE.map(([x, y]) => `${x},${(y * .9).toFixed(2)}`).join(' ');
  const span = `${fmtDay(run[0].at)} — ${fmtDay(run[run.length - 1].at)}`;
  const id = `filed-${k + 1}`;
  /* a prize still to be claimed is the line's way on; any other line
     opens the card it names */
  const head = ready
    ? `<button class="filed__row filed__row--go" type="button" data-go="rewards" aria-label="${esc(`Card ${pad(k + 1)}, ${span}: ${prize.name} ready to claim`)}">
        <b class="filed__no">${pad(k + 1)}</b><span class="filed__when">${span}</span>
        <span class="filed__prize filed__prize--go">${esc(prize.name)} · ready to claim</span></button>`
    : `<button class="filed__row" type="button" aria-expanded="false" aria-controls="${id}">
        <b class="filed__no">${pad(k + 1)}</b><span class="filed__when">${span}</span>
        ${prize ? `<span class="filed__prize${prize.handedAt ? ' filed__prize--took' : ''}">${esc(prize.name)}${word ? ` · ${word.toLowerCase()}` : ''}</span>` : ''}</button>`;
  return `<li class="filed${prize && prize.handedAt ? ' filed--took' : ''}">
    ${head}
    <div class="filed__card" id="${id}" hidden aria-hidden="true">
      <svg class="filed__field" viewBox="0 0 100 90"><polyline class="fc-route" points="${route}"/>${seats}</svg>
      ${word ? `<span class="filed__punch">${word}</span>` : ''}
    </div>
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

/* the meeting a signed code names, read for display only */
function arrivalMeeting(bare){
  try {
    const part = String(bare).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    return atob(part + '==='.slice((part.length + 3) % 4)).split('.')[1] || null;
  } catch (_) { return null; }
}

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
    /* the masthead answers "what now": check in, checked in, today's
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
    const room = m => m.place || Schedule.PLACE;

    const p    = Rules.progress();
    const goal = Store.rewards.find(r => r.required === p.floor + p.span) || null;
    const full = p.filled >= p.span;
    const near = goal && !goal.claimed && !full && p.remaining <= 2;

    const chrono = [...Store.scans].sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);
    const lift = (32 - 32 * STAMP_FIT).toFixed(1);
    const glyph = (i, cls) => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true"><path class="${cls}__face" d="${stampShape(i + 1, 0)}"/>
      <g transform="translate(${lift} ${lift}) scale(${STAMP_FIT})">${stampMark(i)}</g></svg>`;

    const kick = parts => `<p class="mast__kick">${parts.filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('')}</p>`;
    const line = (gm, no, state, extra = '') =>
      `<span class="mast__line"><span class="mast__gm">${gm}</span><b class="mast__no">${no}${extra}</b>${state ? `<span class="mast__state">${state}</span>` : ''}</span>`;
    /* a prize within reach is said once, on the card's own line under the
       masthead, and by the ring on its seat */
    const more = '';

    let kind, mast;
    if (live){
      kind = 'open';
      mast = `<button class="mast mast--open" type="button" data-go="scan" aria-label="Check in at general meeting ${day.no}">
        ${kick([fmtDate(day.date), unusual(day).includes(day.place) ? day.place : ''])}
        ${line('GM', pad(day.no), '<span class="mast__cmd">Check in</span>')}${more}
      </button>`;
    } else if (scan){
      kind = 'set';
      const i = chrono.findIndex(x => x.meetingId === day.id);
      mast = `<div class="mast mast--set">
        ${kick([fmtDate(day.date), unusual(day).includes(day.place) ? day.place : ''])}
        ${line('GM', pad(day.no), byHand(scan) ? 'Checked in · by an officer' : `Checked in · ${fmtTime(scan.at)}`, i >= 0 ? glyph(i, 'mast__imp') : '')}${more}
      </div>`;
    } else if (day && day.ended && !day.open){
      /* over, and no stamp: said as today's fact, not yet a "missed" one,
         since an officer can still add a stamp by hand */
      kind = 'closed';
      mast = `<div class="mast mast--closed">
        ${kick([fmtDate(day.date), 'Meeting closed'])}
        ${line('GM', pad(day.no), 'Not checked in')}${more}
      </div>`;
    } else if (day){
      /* under way and not open: before opening or after an early close,
         which a member cannot tell apart, so only what is true now */
      kind = 'today';
      mast = `<div class="mast mast--today">
        ${kick([fmtDate(day.date)])}
        ${line('GM', pad(day.no), day.started && !day.open ? 'Check-in not open' : `${esc(day.time || '')} · ${esc(room(day))}`)}${more}
      </div>`;
    } else if (next){
      kind = 'next';
      mast = `<div class="mast mast--next">
        ${kick(['Next meeting', `GM ${pad(next.no)}`])}
        <span class="mast__line"><b class="mast__date">${fmtDate(next.date)}</b><span class="mast__state">${esc(next.time)}${unusual(next).includes(next.place) ? ` · ${esc(next.place)}` : ''}</span></span>${more}
      </div>`;
    } else {
      kind = 'none';
      const last = chrono[chrono.length - 1];
      const lastM = last && Store.meeting(last.meetingId);
      mast = `<div class="mast mast--none">
        ${kick(['Nothing scheduled'])}
        ${lastM ? `<span class="mast__line"><span class="mast__gm">Last stamp</span><b class="mast__date">GM ${pad(lastM.no)} · ${fmtDay(lastM.date)}</b></span>`
                : line('GM', '01', 'Not yet held')}${more}
      </div>`;
    }

    const showing = day ? day.id : next ? next.id : null;
    const ahead = Store.meetings
      .filter(m => m.upcoming && m.id !== showing)
      .sort(soonest)
      .slice(0, 3);

    const side = `<div class="deck__side">
        <section class="fol fol--ahead" aria-label="Meetings ahead">
          <h2 class="fol__lab">Ahead</h2>
          ${ahead.length ? `<ol class="fol__list">${ahead.map(m => `<li class="fol__row">
              <b class="fol__no">GM ${pad(m.no)}</b><span class="fol__day">${fmtDate(m.date)}</span>
              ${unusual(m).length ? `<span class="fol__at">${unusual(m).map(esc).join(' / ')}</span>` : ''}
            </li>`).join('')}</ol>`
          : `<p class="fol__line">${next && !day ? 'Nothing after it' : 'Nothing scheduled'}</p>`}
        </section>
      </div>`;

    return `<div class="view view--home">
      <header class="rechead folio">
        <h1 class="title rechead__title folio__word">Today</h1>
        <span class="folio__meta">01</span>
      </header>

      <div class="deck deck--${kind}${live ? ' deck--live' : ''}${near ? ' deck--near' : ''}">
        <div class="deck__act">${mast}</div>
        ${C.sealGrid(live, 'field')}
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
    const chrono = [...Store.scans].sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);
    const ahead = Store.meetings.filter(m => m.upcoming).sort((a, b) => -newest(a, b));
    const lift = (32 - 32 * STAMP_FIT).toFixed(1);
    const days = iso => Math.floor(Date.parse(iso + 'T12:00:00Z') / 864e5);

    /* the year line: every meeting since the member joined placed at its
       true date; the line runs past today, dotted, to the last meeting
       scheduled */
    const oldest = held[held.length - 1] || ahead[0] || null;
    const t0 = oldest ? days(oldest.date) : days(Schedule.today());
    const tN = Math.max(t0 + 1, ahead.length ? days(ahead[ahead.length - 1].date) : held.length ? days(held[0].date) : t0 + 1, days(Schedule.today()));
    const pos = iso => Math.min(98.5, Math.max(0, (days(iso) - t0) / (tN - t0) * 100)).toFixed(2);
    const ticks = [...held].reverse().map(m => {
      const s = Store.state(m);
      const i = s === 'set' ? chrono.findIndex(x => x.meetingId === m.id) : -1;
      const card = i >= 0 && (i + 1) % Rules.CARD === 0 ? `<i class="yt yt--card" style="left:${pos(m.date)}%"></i>` : '';
      return card + (i >= 0
        ? `<i class="yt yt--set" style="left:${pos(m.date)}%"><svg viewBox="0 0 64 64"><path d="${stampShape(i + 1, 0)}"/><g transform="translate(${lift} ${lift}) scale(${STAMP_FIT})">${stampMark(i)}</g></svg></i>`
        : `<i class="yt yt--${s}${m.today && s !== 'open' ? ' yt--today' : ''}" style="left:${pos(m.date)}%"></i>`);
    }).join('') + ahead.map(m => `<i class="yt yt--up" style="left:${pos(m.date)}%"></i>`).join('');
    const yearline = `<div class="yline" aria-hidden="true" style="--now:${pos(Schedule.today())}%">
        <i class="yline__rule"></i><i class="yline__ahead"></i>${ticks}
      </div>`;
    const tally = held.length
      ? `<p class="tally"><b>${kept}</b> stamped, <b>${gone}</b> missed</p>`
      : `<p class="tally">${ahead.length ? `First meeting: GM ${pad(ahead[0].no)}, ${fmtDate(ahead[0].date)}` : 'First meeting not yet held'}</p>`;

    /* the ledger is kept by the month, the way a club's minutes are; a
       card filled is a chapter closed, ruled across the page */
    const prize = k => Store.rewards.find(r => r.required === k * Rules.CARD) || null;
    const chapter = k => {
      const r = prize(k);
      const word = !r ? '' : r.handedAt ? `${esc(r.name)} collected` : r.claimed ? `${esc(r.name)} claimed`
        : Store.tierState(r) === 'unlocked' ? `${esc(r.name)} ready to claim` : '';
      return `<p class="ledger__chapter"><span>Card ${pad(k)} full</span>${word ? `<span>${word}</span>` : ''}</p>`;
    };
    const months = [];
    held.forEach((m, n) => {
      const key = String(m.date).slice(0, 7);
      const last = months[months.length - 1];
      /* the gap to the meeting before it: two weeks reads twice as deep, a month three times */
      const older = held[n + 1];
      const d = older ? days(m.date) - days(older.date) : 0;
      const gap = d >= 30 ? 3 : d >= 14 ? 2 : 1;
      const i = Store.attended(m.id) ? chrono.findIndex(x => x.meetingId === m.id) : -1;
      const rule = i >= 0 && (i + 1) % Rules.CARD === 0 ? chapter((i + 1) / Rules.CARD) : '';
      const row = rule + C.ledgerRow(m, gap);
      if (last && last.key === key) last.rows.push(row);
      else months.push({ key, rows:[row] });
    });
    const monthName = key => onClock(`${key}-01`, { month:'long' });

    return `<div class="view view--record">
      <header class="rechead folio">
        <h1 class="title rechead__title folio__word">Record</h1>
        <span class="folio__meta">02</span>
      </header>

      ${yearline}
      ${tally}

      ${held.length ? `<section class="ledger" aria-label="Meetings, newest first">
          ${months.map(g => `<div class="ledger__group">
              <h2 class="ledger__month"><span class="ledger__mname">${monthName(g.key)}</span></h2>
              ${g.rows.join('')}
            </div>`).join('')}
        </section>`
      : `<section class="ledger ledger--blank" aria-label="Meetings">
          <div class="lrow lrow--blank"><span class="lrow__no">01</span><span class="lrow__stamp"></span>
            <span class="lrow__body"><span class="lrow__date">${ahead.length ? `${fmtDate(ahead[0].date)} · ${esc(ahead[0].time)}` : 'First meeting not yet held'}</span></span></div>
          ${C.empty('No meetings held yet')}
        </section>`}
    </div>`;
  },

  rewards(){
    if (Store.failed) return this.loadFailure('Rewards');
    const total = Store.totalStamps();
    const tiers = [...Store.rewards].sort((a, b) => a.required - b.required);
    const next = tiers.find(t => total < t.required) || null;
    const top  = tiers.length ? tiers[tiers.length - 1].required : Rules.CARD * 3;
    const fill = Math.min(1, total / top);
    const lift = (32 - 32 * STAMP_FIT).toFixed(1);

    /* the member's count, once, as a line of type; the route says the rest */
    const fig = !tiers.length || total > top ? `<b>${total}</b> ${total === 1 ? 'stamp' : 'stamps'}${tiers.length && !next ? '<span>Every reward reached</span>' : ''}`
      : `<b>${total}</b> of ${top} stamps${!next && total ? '<span>Every reward reached</span>' : ''}`;
    /* where the member stands on the route: the last stamp earned, or the start */
    const me = total
      ? `<span class="route__me" aria-hidden="true" style="--at:${fill.toFixed(3)}"><svg viewBox="0 0 64 64"><path class="route__face" d="${stampShape(total, 0)}"/>
          <g transform="translate(${lift} ${lift}) scale(${STAMP_FIT})">${stampMark(total - 1)}</g></svg><b>${total}</b></span>`
      : `<span class="route__me route__me--start" aria-hidden="true" style="--at:0"></span>`;

    return `<div class="view view--rewards">
      <header class="rechead folio">
        <h1 class="title rechead__title folio__word">Rewards</h1>
        <span class="folio__meta">04</span>
      </header>

      <p class="prize__fig">${fig}</p>

      ${tiers.length ? `<section class="tiers" style="--fill:${fill.toFixed(3)};--n:${tiers.length}" aria-label="Rewards, by the stamps they take">
        <span class="route__line" aria-hidden="true"></span>
        ${me}
        ${tiers.map((t, i) => C.tier(t, total, i ? tiers[i - 1].required : 0, i)).join('')}
      </section>` : C.empty('No rewards set up yet')}
    </div>`;
  },

  scan(){
    /* already stamped for the open meeting: nothing to scan; the stamp
       it earned is printed large with its record beside it */
    const open = Store.openMeeting();
    const stamp = open && Store.scanFor(open.id);
    if (stamp){
      const chrono = [...Store.scans].sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);
      const i = chrono.findIndex(x => x.meetingId === open.id);
      const lift = (32 - 32 * STAMP_FIT).toFixed(1);
      return `<div class="view view--scan view--scan-done">
        <header class="rechead folio">
          <h1 class="title rechead__title folio__word">Scan</h1>
          <span class="folio__meta">03</span>
        </header>
        <div class="deck__act">
          <section class="stamped" aria-label="Checked in">
            ${i >= 0 ? `<svg class="stamped__imp" viewBox="0 0 64 64" aria-hidden="true"><path class="stamped__face" d="${stampShape(i + 1, 0)}"/>
              <g transform="translate(${lift} ${lift}) scale(${STAMP_FIT})">${stampMark(i)}</g></svg>` : ''}
            <p class="stamped__rec">
              <b class="stamped__no">GM ${pad(open.no)}</b>
              <span>Checked in</span>
              <span>${byHand(stamp) ? 'Added by an officer' : fmtTime(stamp.at)}</span>
              <span class="stamped__how">${byHand(stamp) ? 'By hand' : 'QR verified'}</span>
            </p>
          </section>
        </div>
      </div>`;
    }

    const standing = scanStanding();
    /* the reticle is the next empty seat of the card, floated over the camera */
    const p = Rules.progress();
    const n = p.floor + p.filled;
    const lift = (32 - 32 * STAMP_FIT).toFixed(1);

    return `<div class="view view--scan">
      <header class="rechead folio">
        <h1 class="title rechead__title folio__word">Scan</h1>
        <span class="folio__meta">03</span>
      </header>

      <div class="scanframe">
        <p class="standing">
          <span class="standing__lab">${standing.lab}</span>
          ${standingAt(standing)}
        </p>

        <div class="viewer" id="viewer">
          <video id="cam" playsinline muted autoplay></video>
          <div class="reticle" id="reticle" aria-hidden="true">
            <svg class="reticle__seat" viewBox="0 0 64 64">
              <path class="reticle__face" d="${stampShape(n + 1, 0)}"/>
              <g class="reticle__mark" transform="translate(${lift} ${lift}) scale(${STAMP_FIT})">${stampMark(n)}</g>
            </svg>
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
    BoardUI.clubStale = true;
    /* a fresh chapter opens on the wait panel, never on another
       chapter's data */
    BoardUI.loading = true;
    BoardUI.shown = null;
    const idx = { 'Club Tools':'01', 'Check-in':'02', 'Meetings':'03', 'Members':'04' }[title] || '';
    return `<div class="view view--board">
      <header class="rechead folio">
        <h1 class="title rechead__title folio__word">${title}</h1>
        ${idx ? `<span class="folio__meta">${idx}</span>` : ''}
      </header>
      <section class="rig">
        <div id="boardPane">${BoardUI.pane()}</div>
      </section>
      ${tail}
    </div>`;
  },

  /* Check-in ends with the account block on phones, the way Member
     does; from 1024px up the rail's foot carries it instead. */
  board(){     BoardUI.tab = 'tools';    return this.boardSpread('Club Tools', C.account()); },
  bcheckin(){  BoardUI.tab = 'session';  return this.boardSpread('Check-in', C.account()); },
  bmeet(){     BoardUI.tab = 'meetings'; return this.boardSpread('Meetings'); },
  bmembers(){  BoardUI.tab = 'progress'; return this.boardSpread('Members'); },

  profile(){
    if (Store.failed) return this.loadFailure('Member');
    const held     = Store.countedMeetings();
    const attended = held.filter(m => Store.attended(m.id)).length;
    const name     = memberName();
    const handle   = (Store.user && Store.user.username) || name;
    const joined   = Store.user && Store.user.joined;
    const chrono   = [...Store.scans].sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);
    const p        = Rules.progress();
    /* the cards filled before the one on the sheet, newest first */
    const filed    = Array.from({ length:p.card - 1 }, (_, k) =>
      C.filed(k, chrono.slice(k * Rules.CARD, (k + 1) * Rules.CARD))).reverse();
    const open     = Store.openMeeting();
    const live     = Boolean(open && !Store.scanFor(open.id));
    const since    = joined ? onClock(joined, { month:'short', year:'numeric' }) : '';

    return `<div class="view view--member">
      <header class="rechead folio">
        <h1 class="title rechead__title folio__word">Member record</h1>
        <span class="folio__meta">${handle.toLowerCase() !== name.toLowerCase() ? `${esc(handle)} · ` : ''}05</span>
      </header>

      <div class="mem${filed.length ? ' mem--filed' : ''}">
        <section class="who" aria-label="Member">
          <p class="who__name">${esc(name)}</p>
          <p class="who__line"><span>Cali-Nev-Ha</span>${since ? `<span>Since ${esc(since)}</span>` : ''}${Store.isBoard ? '<span>Board</span>' : ''}</p>
        </section>

        ${C.sealGrid(live, 'sheet')}

        <p class="standing-band">
          <span><b>${attended}</b> <i>of ${held.length} ${held.length === 1 ? 'meeting' : 'meetings'}</i></span>
          <span><b>${held.length ? Store.attendanceRate() : 0}%</b> <i>attendance</i></span>
        </p>

        ${filed.length ? `<section class="files" aria-label="Cards filed">
          <h2 class="files__mark">Filed</h2>
          <ol class="files__list">${filed.join('')}</ol>
        </section>` : ''}
      </div>

      ${C.account()}
    </div>`;
  },

  /* Arriving by the wall code's link. Signed out, the page says what
     the server says the code is for and offers a way in; signed in, it
     says it is checking in while the verifier answers. The code itself
     is never printed. */
  checkin(){
    const A = Arrival;
    const signed = Store.signedIn;
    const code = A.phase === 'refused' ? A.refusal : null;
    /* the meeting's number: as the server said it, or as the record has
       the meeting the code names (the code is read, not trusted: the
       verifier still decides) */
    const no = A.no || (signed && A.bare ? (Store.meeting(arrivalMeeting(A.bare)) || {}).no : null) || null;

    const acts = (...b) => `<div class="authp__act">${b.join('')}</div>`;
    const go = (attr, label) => `<button class="authp__go" type="button" ${attr}>${label}</button>`;
    const alt = (attr, label) => `<button class="authp__swap" type="button" ${attr}>${label}</button>`;
    const onward = signed ? go('data-go="home"', Store.isBoard ? 'Go to Check-in' : 'Go to Today')
      : alt('data-arrive="in"', 'Sign in');
    const say = (word, note = '', tail = '') => `<section class="authp arrive" aria-live="polite">
        <h2 class="arrive__word">${word}</h2>
        ${note ? `<p class="arrive__note">${note}</p>` : ''}
        ${tail}
      </section>`;

    let status = '', card;
    if (code === 'ALREADY_CHECKED_IN'){
      status = 'Checked in';
      card = say('Already checked in', '', acts(onward));
    } else if (code && SCAN_TRANSIENT.has(code)){
      card = say(scanMessage(code)[0], 'Try again in a moment.',
        acts(go('data-arrive="again"', 'Try again'), signed ? '' : onward));
    } else if (code === 'BOARD_ACCOUNT'){
      card = say('Board account', 'Another officer adds you to the meeting.', acts(onward));
    } else if (code === 'NOT_AUTHORIZED'){
      card = say('Not allowed', 'This account cannot check in.', acts(onward));
    } else if (code){
      const [what, todo] = scanMessage(code);
      card = say('Check-in unavailable', [what, todo].filter(Boolean).join('. ') + '.', acts(onward));
    } else if (signed){
      card = say('Checking in');
    } else if (!A.peek){
      card = say('Reading the code');
    } else {
      status = A.peek.ok ? 'Check-in open' : '';
      card = say('Collect your stamp', '',
        acts(go('data-arrive="in"', 'Sign in'), alt('data-arrive="up"', 'New account')));
    }
    /* a refusal that stands: the meeting's number is struck through */
    const struck = Boolean(no) && code && code !== 'ALREADY_CHECKED_IN' && !SCAN_TRANSIENT.has(code);

    return `<div class="view view--auth view--arrive${struck ? ' view--arrive-struck' : ''}">
      <div class="spread">
        <div class="spread__field crop" aria-hidden="true">
          <svg class="spread__seal crop__art" viewBox="0 0 100 100">${sealArt()}</svg>
          <span class="spread__kci">${brandSeal('kci')}</span>
        </div>

        <header class="spread__head">
          <p class="spread__sub"><span>Keystamp</span></p>
          <h1 class="spread__wm">${no ? `GM ${pad(no)}` : 'Check-in'}</h1>
          ${status ? `<p class="arrive__status">${status}</p>` : ''}
        </header>

        ${card}
      </div>
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
                      aria-controls="${id}">Show</button>
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

          <p class="authp__chapter">${up ? 'New account' : 'Sign in'}</p>
          ${Arrival.bare ? `<p class="authp__arrive">Then: ${Arrival.no ? `check in to GM ${pad(Arrival.no)}` : 'check in'}</p>` : ''}

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
            <!-- a refusal is printed under the button, so the button under
                 the finger never moves -->
            <p class="authp__err" id="authErr" role="alert" aria-live="assertive"></p>
            <button class="authp__swap" type="button" id="authSwap">${up ? 'Sign in' : 'New account'}</button>
          </div>

          ${AuthUI.setupNotice()}
        </form>

      </div>
    </div>`;
  },
};
