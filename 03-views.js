"use strict";
/* The signed-in member's name, or a neutral stand-in when there is no
   session — with real auth the signed-out state is a normal state, so
   no view may assume Store.user exists. */
const memberName = () => (Store.user && Store.user.name) || 'Member';
/* keystamp — components and the five screens
   Loaded in order by index.html. Order matters. */

/* ══════════════════════════════════════════════════════════════════
   7. COMPONENTS
   Every surface is a panel with a registration ghost behind it. There
   are no rounded cards anywhere in this file.
   ══════════════════════════════════════════════════════════════════ */
/* ── STAMP SILHOUETTES ────────────────────────────────────────────────
   A collected stamp is not a square with a circle in it. Each slot is
   drawn as a rough SILHOUETTE — a hand-pressed seal, a pasted label, a
   tilted lozenge, a cut plate, and one rosette for the milestone —
   with a paper backing piece slightly larger than the ink face, so a
   stamp reads as an object pasted onto the card and two overlapping
   stamps never merge into one black mass. The jitter is seeded per
   slot: every stamp is slightly its own, inside one system. */
const stampJit = (seed, k) => Math.sin(seed * 127.1 + k * 311.7) * .5 + .5;

/* THE SEAL BLOCK — one primitive for every slot: a squared octagon
   with uneven bevels, the silhouette of a carved chop seal.

   This replaced five different archetypes (near-circle, rectangle,
   diamond, octagon, starburst) rotated by slot. Five silhouettes plus
   heavy edge jitter made a row of stamps read as five unrelated
   objects rather than one collection, and the wobble turned to mush
   at phone size. One primitive, bevels that vary per seed, and about
   half the jitter: every stamp is still its own, inside one system.

   Flat top, bottom and sides are what keep it stable small and keep
   neighbouring stamps visibly separate when the card fills up. */
function stampShape(seed, grow = 0){
  const J = k => (stampJit(seed, k) - .5) * 2.2;
  const g = grow, L = 4 - g, R = 60 + g, T = 4 - g, B = 60 + g;
  /* four different corner bevels, floored so a stamp can never lose a
     corner entirely and collapse toward a rectangle */
  const b = [10, 13, 10.5, 14].map((v, i) => Math.max(6, v + J(i)));
  const corners = [[L + b[0], T], [R - b[1], T], [R, T + b[1]], [R, B - b[2]],
                   [R - b[2], B], [L + b[3], B], [L, B - b[3]], [L, T + b[0]]];
  return 'M' + corners.map(([x, y], i) =>
    (x + J(i + 11) * .5).toFixed(1) + ' ' + (y + J(i + 19) * .5).toFixed(1)).join('L') + 'Z';
}
/* One shape means one symbol scale. This was a per-archetype table
   (.56-.66) that existed only because the five silhouettes enclosed
   different amounts of room. */
const STAMP_FIT = .62;

const C = {
  /* the giant cropped word behind a view */

  tier(r, total){
    const open  = total >= r.required;
    const ready = open && !r.claimed;
    const state = r.claimed ? 'claimed' : ready ? 'ready' : 'sealed';
    const say   = r.claimed ? 'Claimed'
                : ready     ? 'Ready to claim'
                : `${r.required - total} more ${r.required - total === 1 ? 'stamp' : 'stamps'}`;

    return `<div class="tier tier--${state}" data-reward="${r.id}">
      <span class="tier__at">${pad(r.required)}</span>
      <span class="tier__body">
        <span class="tier__name">${esc(r.name)}</span>
        <span class="tier__desc">${esc(r.desc || '')}</span>
      </span>
      ${r.claimed ? `<span class="tier__punch" aria-hidden="true">Claimed</span>` : ''}
      ${ready
        ? `<button class="tier__claim" type="button" data-claim="${r.id}">Claim</button>`
        : `<span class="tier__say">${say}</span>`}
    </div>`;
  },

  /* ── THE CARD FACE. One printed collectible object: an ink identity
     panel (card number, the count, what the card leads to) and a paper
     field where the ten slots are HAND-PLACED — different sizes,
     slight leans, a dotted collection route running slot to slot, and
     the tenth slot largest because it IS the reward. The slot
     coordinates live in the stylesheet with a separate portrait
     composition for narrow cards.

     Sorted chronologically here rather than trusted from the backend,
     which returns newest first: slot N of the card is the Nth stamp
     ever earned, so the field reads along the route as history. */
  sealGrid(){
    const p = Rules.progress();
    const chrono = [...Store.scans]
      .sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);
    /* the reward this card ends on, if the card reaches one at all */
    const goal = Store.rewards.find(r => r.required === p.floor + p.span) || null;
    const cardNo = p.card;
    const full = p.filled >= p.span;

    const cells = Array.from({ length:p.span }, (_, i) => {
      const state = i < p.filled ? 'set' : i === p.filled ? 'next' : '';
      const hero = state === 'set' && i === p.filled - 1 ? ' seal--hero' : '';
      const mile = i === p.span - 1 ? ' seal--mile' : '';
      /* a stamp is pressed by hand and lands a degree or two off; the
         mark's own tilt rides a custom prop so the slot frame and the
         impression can lean by different amounts */
      const tilt = state === 'set'
        ? `--press-tilt:${[-2.1, 1.4, -1.2, 2.3, -1.7][i % 5]}deg` : '';

      const rec = state === 'set' ? chrono[p.floor + i] : null;
      const mtg = rec ? Store.meetings.find(m => m.id === rec.meetingId) : null;
      const docket = rec && mtg ? C.sealMeta(rec, mtg) : '';

      const seed = p.floor + i + 1;
      const fit  = STAMP_FIT;
      return `<li class="seal ${state ? 'seal--' + state : ''}${hero}${mile}" data-seal="${state || 'empty'}" style="${tilt}"${
        docket ? ` tabindex="0" aria-label="Stamp ${pad(p.floor + i + 1)}: general meeting ${
          mtg.no}, ${fmtDate(mtg.date)}, checked in at ${fmtTime(rec.at)}"` : ''}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path class="sf-back" d="${stampShape(seed * 3 + 1, 3.4)}"/>
          <g class="sf-press">
            <path class="sf-face" d="${stampShape(seed, 0)}"/>
            <g class="seal__mark" transform="translate(${(32 - 32 * fit).toFixed(1)} ${(32 - 32 * fit).toFixed(1)}) scale(${fit})">${stampMark(p.floor + i)}</g>
          </g>
        </svg>
        <span class="seal__no">${pad(p.floor + i + 1)}</span>
        ${mile && goal ? `<span class="seal__tag">${esc(goal.name)}</span>` : ''}
        ${docket}
      </li>`;
    }).join('');

    /* the collection route: a dotted path joining the slot centres in
       order, one polyline per composition (y in straight percent) */
    const route =
      `<svg class="card__route card__route--l" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="10.5,13 29,20.5 47.5,12 66,19.5 85,33.5 60,42.5 36.5,39 12,54.5 38.5,69 73,68.5"/></svg>` +
      `<svg class="card__route card__route--p" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="16,14.1 45,14.9 76,14.2 84,32.4 54,31.5 22,32.9 16.5,51.4 46,52.7 77,50.9 42,76.3"/></svg>`;

    const say = full
      ? (goal ? 'Card complete — claim it in Rewards' : 'Card complete')
      : goal ? `${p.remaining} more until ${goal.name.toLowerCase()}`
             : `${p.remaining} more to finish this card`;

    return `<section class="card${full ? ' card--full' : ''}" data-enter>
      <div class="card__face">
        <div class="card__id">
          <span class="card__cardno">Card ${pad(cardNo)}</span>
          <p class="card__num"><b>${pad(p.filled)}</b><span>/ ${p.span}</span></p>
          <span class="card__idrule" aria-hidden="true"></span>
          <p class="card__goal">${esc(say)}</p>
          <span class="card__kci" aria-hidden="true">${brandSeal('kci')}</span>
        </div>
        <div class="card__field">
          ${route}
          <ol class="seals" id="seals" aria-label="${p.filled} of ${p.span} stamps in this tier">${cells}</ol>
          <span class="card__edge" aria-hidden="true">Keystamp · Key Club attendance · Cali-Nev-Ha</span>
        </div>
      </div>
      ${full ? '<span class="card__punch" aria-hidden="true">Card full</span>' : ''}
    </section>`;
  },

  strike({ verb, sub, go, live = false, calm = false }){

    return `<div class="act ${live ? 'act--live' : ''}" data-enter>
      <button class="act__btn" data-go="${go}">
        <span class="act__verb">${esc(verb)}</span>
        <span class="act__sub">${esc(sub)}</span>
      </button>
    </div>`;
  },

  /* ── a reward: sealed until the count reaches it ── */
  /* Structured, monospaced, in the page's own technical voice: a
     docket, not a tooltip. aria-hidden because the slot already carries
     the same facts as a label — this is the sighted view of them. */
  sealMeta(rec, m){
    return `<span class="sealmeta" data-layer aria-hidden="true">
      <b class="sealmeta__no">GM ${pad(m.no)}</b>
      <span>${fmtDate(m.date)}</span>
      <span>${fmtTime(rec.at)} / ${esc((rec.method || 'qr').toUpperCase())}</span>
      <span>${esc(m.place)}</span>
    </span>`;
  },

  /* ── THE UNSTRUCK SEAL ───────────────────────────────────────────
     An empty state was a grey box with an icon and a centred
     paragraph in it, which is the placeholder every framework ships
     with. This one is drawn: the seal that has NOT been pressed, at
     real size, with the record it would carry stated as technical
     metadata beside it. Nothing is centred and nothing is boxed. */
  empty(icon, title, body){
    return `<section class="rig empty-reg" data-enter>
      <div class="empty">
        <span class="tone tone--coarse tone--fade-b empty__tone" aria-hidden="true"></span>
        <div class="empty__seal" aria-hidden="true">
          <svg viewBox="0 0 100 100">${seal(2)}</svg>
          <span class="empty__void"></span>
        </div>
        <div class="empty__body">
          <h3 class="empty__title">${esc(title)}</h3>
          ${body ? `<p class="empty__note">${esc(body)}</p>` : ''}
        </div>
      </div>
    </section>`;
  },
  /* ── ONE ROW OF THE LEDGER ────────────────────────────────────────
     A printed attendance record: the meeting number in the margin, the
     stamp it earned struck beside it, the reading, and the date. The
     row IS the rule — a hairline under each one and nothing else. No
     card, no box, no fill.

     An attended row carries its actual stamp symbol, which is the one
     place outside the card where the ten marks appear. That is what
     makes this a record of stamps rather than a list of dates. */
  /* ONE LINE OF THE REGISTER.

     The mark carries the verdict, so the verdict is not also spelled out
     six times down the page: a stamped line shows its stamp, a missed
     line shows the empty slot the stamp would have filled. The only rows
     that say anything in words are the ones where a word is news — the
     open meeting, and a miss. */
  ledgerRow(m){
    const state = Store.state(m);
    const scan  = Store.scanFor(m.id);

    /* the mark is the stamp this meeting earned, by its ordinal in the
       member's history — the same artwork the card shows. */
    const idx = state === 'set'
      ? [...Store.scans].sort((a,b)=>String(a.at)<String(b.at)?-1:1)
          .findIndex(x => x.meetingId === m.id)
      : -1;
    const mark = idx >= 0
      ? `<svg class="lrow__mark" viewBox="0 0 64 64" aria-hidden="true">${stampMark(idx)}</svg>`
      : `<span class="lrow__slot" aria-hidden="true"></span>`;

    const detail = {
      set:  scan ? `Stamped ${fmtTime(scan.at)} / ${esc(m.place)}`
                 : `Stamped / ${esc(m.place)}`,
      open: `Open now / ${esc(m.place)}`,
      miss: `Not stamped / ${esc(m.place)}`,
      upcoming: `${esc(m.time)} / ${esc(m.place)}`,
    }[state];

    const el   = state === 'open' ? 'button' : 'div';
    const attr = state === 'open' ? ' type="button" data-go="scan"' : '';
    const sr   = { set:'Attended', open:'Check in open', miss:'Missed',
                   upcoming:'Scheduled' }[state];

    return `<${el} class="lrow lrow--${state}"${attr}>
      <span class="lrow__no">${pad(m.no)}</span>
      <span class="lrow__stamp">${mark}</span>
      <span class="lrow__body">
        <span class="lrow__date">${m.today ? 'Today' : fmtDay(m.date)}</span>
        <span class="lrow__when">${detail}</span>
      </span>
      ${state === 'open' ? '<span class="lrow__go">Scan</span>' : ''}
      <span class="sr-only">${sr}</span>
    </${el}>`;
  },
};

const Views = {
  /* Shown instead of any figure derived from attendance when the
     snapshot could not be loaded. Rendering 0 stamps here would tell a
     member their record is empty when the truth is that we do not
     know — the one failure mode most likely to make someone think
     their attendance was lost. */
  loadFailure(title){
    return `<div class="view">
      <header class="rechead" data-enter>
        <h1 class="title rechead__title">${title}</h1>
      </header>
      <section class="rig" data-enter>
        <div class="panel bpanel">
          <p class="kicker">Could not load</p>
          <p style="margin-top:8px">Keystamp could not reach the club records, so your
            attendance cannot be shown right now. Nothing has been lost.</p>
          <p class="muted" style="margin-top:8px;font-size:12.5px">Check your connection
            and try again.</p>
          <button class="btn btn--go" data-reload style="margin-top:var(--s4)">Try again</button>
        </div>
      </section>
    </div>`;
  },

  home(){
    if (Store.failed) return this.loadFailure('Home');
    const open = Store.openMeeting();
    const next = Store.nextMeeting();
    const done = open && Store.attended(open.id);

    let action;
    if (open && !done)
      action = C.strike({ verb:'Check in',
                          sub:`GM ${pad(open.no)} / ${fmtDay(open.date)} / ${esc(open.time)} / ${esc(open.place)}`,
                          go:'scan', live:true });
    else if (open && done)
      action = C.strike({ verb:'Your record',
                          sub:`GM ${pad(open.no)} is stamped`, go:'record' });
    else if (next)
      action = C.strike({ verb:'Scan a code',
                          sub:`Check-in opens at GM ${pad(next.no)} / ${fmtDay(next.date)}`,
                          go:'scan' });
    else
      action = C.strike({ verb:'Scan a code',
                          sub:'No meeting is taking check-ins right now', go:'scan' });

    const showing = open ? open.id : next ? next.id : null;
    const ahead = Store.meetings
      .filter(m => m.upcoming && m.id !== showing)
      .sort((a, b) => String(a.date) < String(b.date) ? -1 : 1)
      .slice(0, 3);

    return `<div class="view view--home">
      <!-- Home was the one screen that opened straight into a panel.
           Every other page leads with its name in the display face over
           a rule, and without one here the app's first screen had no
           quiet beat before the card. -->
      <header class="rechead rechead--tight" data-enter>
        <h1 class="title rechead__title">Your card</h1>
      </header>

      <!-- The card is the object; the side column carries the action
           and the calendar so neither is a stretched void. -->
      <div class="deck" data-enter>
        ${C.sealGrid()}
        <div class="deck__side">
          ${action}
          ${ahead.length ? `<section class="ahead" data-enter>
            <h2 class="ahead__mark">Ahead</h2>
            <ul class="ahead__list">
              ${ahead.map(m => `<li class="ahead__row">
                <span class="ahead__no">${pad(m.no)}</span>
                <span class="ahead__day">${fmtDate(m.date)}</span>
                <span class="ahead__at">${esc(m.time)} / ${esc(m.place)}</span>
              </li>`).join('')}
            </ul>
          </section>` : ''}
        </div>
      </div>
    </div>`;
  },

  /* the attendance record: every general meeting, in order, with what happened */
  record(){
    if (Store.failed) return this.loadFailure('Record');
    /* Ordered by DATE, never by meeting number: the number is a label
       the board chooses, the date is when the meeting actually is.
       Held runs newest first, so the meeting you can still walk into
       leads the page instead of sitting fourteen rows down; scheduled
       runs soonest first, so the next one to attend is at the top. */
    const newest = (a, b) => String(a.date) < String(b.date) ? 1 : -1;
    const soonest = (a, b) => String(a.date) < String(b.date) ? -1 : 1;
    const held = [...Store.heldMeetings()].sort(newest);
    const upcoming = Store.meetings.filter(m => m.upcoming).sort(soonest);
    const kept = held.filter(m => Store.attended(m.id)).length;
    const gone = held.length - kept;
    const frac = held.length ? kept / held.length : 0;

    return `<div class="view view--record">
      <header class="rechead" data-enter>
        <h1 class="title rechead__title">Record</h1>
      </header>

      ${held.length ? `<div class="recbody">
        <aside class="tally" data-enter>
          <p class="tally__fig">${pad(kept)}</p>
          <p class="tally__of">stamped of ${pad(held.length)} held</p>
          <p class="tally__bar" style="--fill:${(frac*100).toFixed(1)}%" aria-hidden="true"></p>
          <p class="tally__gone">${gone
            ? `${gone} missed` : 'None missed'}</p>
        </aside>

        <section class="ledger" data-enter>
          ${held.map(m => C.ledgerRow(m)).join('')}
        </section>
      </div>`
      : C.empty(ICON.blank, 'No general meetings yet',
                'Your first stamp will land here.')}

      ${upcoming.length ? `<section class="ledger ledger--ahead" data-enter>
        <h2 class="ledger__mark">Scheduled</h2>
        ${upcoming.map(m => C.ledgerRow(m)).join('')}
      </section>` : ''}
    </div>`;
  },

  rewards(){
    if (Store.failed) return this.loadFailure('Rewards');
    const total = Store.totalStamps();
    const tiers = [...Store.rewards].sort((a, b) => a.required - b.required);
    const top   = tiers[tiers.length - 1]?.required || 10;
    /* the scale runs a little past the last rung so the mark for it is
       not jammed against the right edge of the track */
    const scale = Math.max(top * 1.06, total * 1.06, 1);
    const next  = tiers.find(t => total < t.required) || null;

    return `<div class="view view--rewards">
      <header class="rechead" data-enter>
        <h1 class="title rechead__title">Rewards</h1>
      </header>

      <section class="ladder" data-enter>
        <p class="ladder__fig">${pad(total)}</p>
        <p class="ladder__of">${total === 1 ? 'stamp' : 'stamps'} so far${
          next ? ` / ${next.required - total} to the next rung` : ' / every rung passed'}</p>
      </section>

      <!-- THE CLIMB. One vertical track with the three plates hung on
           it; the ink in the rail is the same count the figure above
           states. A plate's size and weight is its state: sealed sits
           back, ready takes the row and bleeds, claimed is punched. -->
      <section class="climb" data-enter>
        <div class="climb__rail" role="img"
             aria-label="${total} stamps against rungs at ${tiers.map(t => t.required).join(', ')}">
          <span class="climb__fill" style="--h:${Math.min(total / scale * 100, 100).toFixed(1)}%"></span>
        </div>
        <div class="climb__plates">
          ${tiers.map(t => C.tier(t, total)).join('')}
        </div>
      </section>
    </div>`;
  },

  scan(){

    const open = Store.openMeeting();
    const done = open && Store.attended(open.id);
    const standing = !open
      ? { lab:'Nothing open', at:'No check-in right now' }
      : done
        ? { lab:'Already stamped', at:`GM ${pad(open.no)}` }
        : { lab:'Checking in to', at:`GM ${pad(open.no)} / ${fmtDay(open.date)} / ${esc(open.place)}` };

    return `<div class="view view--scan">
      <header class="rechead" data-enter>
        <h1 class="title rechead__title">Scan</h1>
      </header>

      <p class="standing" data-enter>
        <span class="standing__lab">${standing.lab}</span>
        <span class="standing__at">${standing.at}</span>
      </p>

      <!-- THE FRAME. Four corner marks and a status line, nothing
           mounted over the image: any scanner decoration would sit
           exactly where the code being read has to go. -->
      <div class="viewer" id="viewer" data-enter>
        <video id="cam" playsinline muted autoplay></video>
        <div class="viewer__scrim" aria-hidden="true"></div>
        <div class="viewer__grain" aria-hidden="true"></div>
        <div class="reticle" id="reticle" aria-hidden="true">
          <span class="reticle__c reticle__c--tl"></span>
          <span class="reticle__c reticle__c--tr"></span>
          <span class="reticle__c reticle__c--bl"></span>
          <span class="reticle__c reticle__c--br"></span>
        </div>
        <div class="viewer__status"><span class="viewer__msg" id="scanMsg">Starting camera</span></div>
      </div>

      <div class="manual" data-enter>
        <label class="manual__lab" for="manualInput">Type the code under the seal</label>
        <div class="manual__f">
          <input class="manual__in" id="manualInput" placeholder="Seal code"
                 aria-label="Seal code" autocomplete="off" spellcheck="false" enterkeyhint="go">
          <button class="manual__go" id="manualGo" type="button">Verify</button>
        </div>
        <div class="bubble" id="demoHint"></div>
      </div>
    </div>`;
  },

  /* ────────────────────────────────────────────────────────────────
     CLUB INFORMATION — not on the tab bar. Reachable at #/board.

     This is the other half of the QR system: the screen a board member
     puts on the projector in the MPR. It encodes exactly the string
     `Rules.codeFor()` produces, and it redraws itself every time the
     five-minute token rolls over, so the projected image is always the
     one the scanner will accept.
     ──────────────────────────────────────────────────────────────── */
  /* ── BOARD ────────────────────────────────────────────────────────
     One spread with four sections, switched by BoardUI.tab rather than
     by new routes, so the existing router, gate and page-cut animation
     all keep working unchanged. Every number below is rendered from
     data the board-data function returned; nothing is computed or
     stored locally. */

  boardSpread(title){
    return `<div class="view view--board">
      <header class="rechead" data-enter>
        <h1 class="title rechead__title">${title}</h1>
      </header>
      <section class="rig" data-enter style="margin-top:var(--gut)">
        <div id="boardPane">${BoardUI.pane()}</div>
      </section>
    </div>`;
  },

  board(){     BoardUI.tab = 'club';     return this.boardSpread('Club Tools'); },
  bmeet(){     BoardUI.tab = 'meetings'; return this.boardSpread('Meetings'); },
  bcheckin(){  BoardUI.tab = 'session';  return this.boardSpread('Check-In'); },
  bmembers(){  BoardUI.tab = 'progress'; return this.boardSpread('Members'); },

  profile(){
    if (Store.failed) return this.loadFailure('Member');
    const held     = Store.heldMeetings();
    const attended = held.filter(m => Store.attended(m.id)).length;
    const total    = Store.totalStamps();
    const name     = memberName();
    const handle   = (Store.user && Store.user.username) || name;
    const role     = Store.isBoard ? 'Board' : 'Member';

    /* THE ACCOUNT PAGE SAYS EACH THING ONCE: who is signed in, what
       their standing is, and how to sign out — nothing another page
       already answers. */
    return `<div class="view view--member">
      <header class="rechead rechead--tight" data-enter>
        <h1 class="title rechead__title">Member</h1>
      </header>

      <!-- A CHARACTER SHEET. The identity is an ink plate carrying the
           name, and the member's own card sits beside it — the object
           the whole product is about, on the page that is about them. -->
      <div class="sheet" data-enter>
        <section class="who">
          <!-- the district's plate: ONE giant gray CNH emblem is the
               panel's architecture, deliberately cropped by the frame
               like a watermark leaving the sheet. The district is
               named in small type at the head; the member's name is
               the dominant line in front. No second logo competes. -->
          <div class="who__mark" aria-hidden="true">
            <span class="who__org">Cali-Nev-Ha District</span>
          </div>
          <span class="who__emblem" aria-hidden="true">${brandSeal('cnh')}</span>
          <div class="who__id">
            <p class="who__hand">Signed in${Store.isBoard ? ' / Board' : ''}${
              handle !== name ? ` / ${esc(handle)}` : ''}</p>
            <p class="who__name">${esc(name)}</p>
          </div>
        </section>
        ${C.sealGrid()}
      </div>

      <section class="standing-band" data-enter>
        <p class="standing-band__fig">${pad(total)}</p>
        <p class="standing-band__of">${total === 1 ? 'stamp' : 'stamps'} collected</p>
        <dl class="standing-band__rest">
          <div><dt>Meetings attended</dt><dd>${pad(attended)} of ${pad(held.length)}</dd></div>
          <div><dt>Attendance rate</dt><dd>${Store.attendanceRate()}%</dd></div>
          <div><dt>Rewards unlocked</dt><dd>${pad(Store.rewardsUnlocked())} of ${pad(Store.rewards.length)}</dd></div>
        </dl>
      </section>

      <!-- THE ACCOUNT BLOCK.

           Sign out lived only in the desktop rail, and the rail is
           gone below 1024 — so on every phone and every tablet there
           was no way to sign out at all. Member is the account screen
           and it is on the tab bar at every width, so the control
           belongs here rather than behind a drawer or under an icon.
           It hides itself once the rail is back and carrying it. -->
      <section class="acct" data-enter>
        <button class="acct__out" data-signout type="button">Sign out</button>
      </section>
    </div>`;
  },

  auth(){
    const mode = AuthUI.mode;                 /* 'in' | 'up' */
    const up = mode === 'up';

    return `<div class="view view--auth">

      <div class="spread" data-enter>

        <!-- THE INK FIELD. The swirl is knocked out of it at full
             strength and cropped by two edges — a printed panel, not a
             watermark. -->
        <div class="spread__field crop" aria-hidden="true">
          <svg class="spread__seal crop__art" viewBox="0 0 100 100">${sealArt()}</svg>
          <!-- the International seal is knocked out of the ink field
               itself — no disc, no surround: it is printed IN the
               field, balancing the wordmark across the fold -->
          <span class="spread__kci">${brandSeal('kci')}</span>
        </div>

        <header class="spread__head">
          <p class="spread__sub"><span>Key Club attendance</span></p>
          <h1 class="spread__wm">Keystamp</h1>
        </header>

        <form class="authp" id="authForm" novalidate>
          <p class="authp__title">${up ? 'Create account' : 'Sign in'}</p>

          <div class="authp__f">
            <label class="authp__lab" for="authUser">Username</label>
            <input class="authp__in" id="authUser" name="username" type="text"
                   autocomplete="username" autocapitalize="none" spellcheck="false"
                   inputmode="latin" maxlength="${Config.USERNAME_MAX}"
                   placeholder="${up ? 'letters, numbers, _ and .' : 'your username'}">
          </div>

          <div class="authp__f">
            <label class="authp__lab" for="authPass">Password</label>
            <input class="authp__in" id="authPass" name="password" type="password"
                   autocomplete="${up ? 'new-password' : 'current-password'}"
                   placeholder="${up ? 'at least 8 characters' : ''}">
          </div>

          ${up ? `<div class="authp__f">
            <label class="authp__lab" for="authPass2">Confirm password</label>
            <input class="authp__in" id="authPass2" name="confirm" type="password"
                   autocomplete="new-password">
          </div>` : ''}

          <p class="authp__err" id="authErr" role="alert" aria-live="assertive" hidden></p>

          <div class="authp__act">
            <button class="authp__go" type="submit" id="authGo">
              ${up ? 'Create account' : 'Sign in'}
            </button>
            <button class="authp__swap" type="button" id="authSwap">
              ${up ? 'I already have an account' : 'Create an account'}
            </button>
          </div>

          ${AuthUI.setupNotice()}
        </form>

        <!-- the organization's imprint line: set in flow under the
             panel it belongs to, centred in that panel's measure -->
        <span class="spread__side" aria-hidden="true">Key Club International · Cali-Nev-Ha District</span>
      </div>
    </div>`;
  },
};