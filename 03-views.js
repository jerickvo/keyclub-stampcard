"use strict";
/* The signed-in member's name, or a neutral stand-in when there is no
   session. Views used to read Store.user.name directly, which assumed
   a user always existed — true only because the prototype hardcoded
   one. With real auth the signed-out state is a normal state. */
const memberName = () => (Store.user && Store.user.name) || 'Member';
/* keystamp — components and the five screens
   Loaded in order by index.html. Order matters. */

/* ══════════════════════════════════════════════════════════════════
   7. COMPONENTS
   Every surface is a panel with a registration ghost behind it. There
   are no rounded cards anywhere in this file.
   ══════════════════════════════════════════════════════════════════ */
const C = {
  /* the giant cropped word behind a view */
  /* Every chapter carries the same three marks: the kicker as an
     annotation, the title as the masthead, and an edge rune stating
     which chapter of the volume this is. The rune is what makes five
     differently-composed screens read as one document. */
  /* THE MASTHEAD. A title and, when there is one, a line of plain
     reading under it. The kicker is gone: it named the same thing the
     title names one line lower, which is a label explaining a label.
     So are the diagonal rake, the volume rune and the edge kanji —
     three marks that reported nothing about the page they sat on. */
  head(title, note){
    return `<header class="head" data-enter>
      <div class="head__stack">
        <h1 class="title">${title}</h1>
        ${note ? `<p class="muted">${esc(note)}</p>` : ''}
      </div>
    </header>`;
  },

  /* ── the stat plate: a character status readout, not a summary card ── */
  /* THE COUNT. It is the card's masthead and it is set ON the card,
     not in a panel beside it: a printed stamp card carries its own
     title row, and putting the number anywhere else made two objects
     compete to say one thing. No ring, no ticks, no frame — the
     numeral at display size against paper is the whole device. */
  count(){
    const p = Rules.progress();
    const next = Store.rewards.find(r => r.required === p.next);
    const line = !p.next ? 'Every reward unlocked'
      : p.remaining === 0 ? `${next.name} is ready to claim`
      : `${p.remaining} more until ${next.name.toLowerCase()}`;
    return `<div class="count">
      <p class="count__num"><b>${pad(p.filled)}</b><span>/ ${p.span}</span></p>
      <div class="count__foot">
        <span class="count__label">stamps on this card</span>
        <span class="count__line">${esc(line)}</span>
      </div>
    </div>`;
  },

  /* ── ten struck marks. Empty slots sit at slight angles; a landed
     stamp snaps flat, which is what makes the grid feel struck by hand ── */
  sealGrid(){
    const p = Rules.progress();
    /* THE SLOT DOSSIER (§26).

       A landed stamp was a black square and nothing else: the record of
       WHICH meeting it came from lived only on another screen. Every
       filled slot now carries the docket for the check-in it represents,
       revealed on hover or focus.

       Sorted chronologically here rather than trusted from the backend,
       which returns newest first: slot N of the card is the Nth stamp
       ever earned, so the grid reads left-to-right as history. */
    const chrono = [...Store.scans]
      .sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);

    const cells = Array.from({ length:p.span }, (_, i) => {
      const state = i < p.filled ? 'set' : i === p.filled ? 'next' : '';
      const last = state === 'set' && i === p.filled - 1 ? ' seal--last seal--hero' : '';
      /* The stamped tilt moved onto the EARNED slots. A slot you have
         not filled is a blank space on a printed card and sits square;
         a stamp is pressed by hand and lands a degree or two off. The
         rotation is carried on the mark rather than on the cell so the
         card's ruling stays straight. */
      const tilt = state === 'set'
        ? `--press-tilt:${[-2.1, 1.4, -1.2, 2.3, -1.7][i % 5]}deg` : '';

      const rec = state === 'set' ? chrono[p.floor + i] : null;
      const mtg = rec ? Store.meetings.find(m => m.id === rec.meetingId) : null;
      /* The dossier is only offered when there is something in it. A
         stamp whose meeting has since been deleted still counts — it
         just has no docket to show, so it does not become a tab stop
         that opens an empty card. */
      const dossier = rec && mtg ? C.sealMeta(rec, mtg) : '';

      return `<li class="seal ${state ? 'seal--' + state : ''}${last}" data-seal="${state || 'empty'}" style="${tilt}"${
        dossier ? ` tabindex="0" aria-label="Stamp ${pad(p.floor + i + 1)}: general meeting ${
          mtg.no}, ${fmtDate(mtg.date)}, checked in at ${fmtTime(rec.at)}"` : ''}>
        <svg viewBox="0 0 64 64" aria-hidden="true"><g class="seal__mark">${stampMark(p.floor + i)}</g></svg>
        <span class="seal__no">${pad(p.floor + i + 1)}</span>
        ${dossier}
      </li>`;
    }).join('');

    return `<section class="card" data-enter>
      ${C.count()}
      <ul class="seals" id="seals" aria-label="${p.filled} of ${p.span} stamps in this tier">${cells}</ul>
    </section>`;
  },

  /* THE ACTION. One button, ink, with the meeting it acts on set
     underneath it in plain reading. The chamber it replaces was four
     corner marks, a crosshair, a speed-line field and a TARGET LIVE
     readout wrapped around a verb — five graphics saying "press me"
     where ink on paper already says it. */
  strike({ verb, sub, go, live = false, calm = false }){
    /* The one place the swirl appears on this screen, and it is the
       right one: the mark you are pressing for, on the thing you press.
       It is cropped by the panel rather than centred in it — a mark
       that runs off the edge reads as printed on the page instead of
       placed on it, and it keeps the verb's corner clear. */
    return `<div class="act ${live ? 'act--live' : ''}" data-enter>
      <button class="act__btn" data-go="${go}">
        <svg class="act__seal" viewBox="0 0 100 100" aria-hidden="true">${sealArt()}</svg>
        <span class="act__verb">${esc(verb)}</span>
        <span class="act__sub">${esc(sub)}</span>
      </button>
    </div>`;
  },

  /* ── a reward: sealed until the count reaches it ── */
  /* ── THE DOSSIER ─────────────────────────────────────────────────
     Three identical cards with three identical progress bars, which
     is the single most generic arrangement an interface can arrive
     at — and it said nothing about the difference between a reward
     one stamp away and one twenty-one away.

     A dossier now, and its STATE is its design:

       sealed   quiet, unframed, the tier numeral in tone, the array
                barely struck — a document you have not earned
       ready    full ink frame, cinnabar mark, CLAIM across the
                measure — the one thing on the page to act on
       claimed  flooded ink — the concentrated black mass, and it
                means something: this one is taken

     The bar is gone. Progress is the same slot array the card on
     Home uses, so the two screens are reading the same instrument. */
  tech(r){
    const total = Store.totalStamps();
    const open = total >= r.required;
    const ready = open && !r.claimed;
    /* PANEL ROLE. Three sealed tiers rendered identically is three of
       the same object again — the thing this dossier was built to
       stop. The nearest one you have not reached is the hero of the
       page whether or not it is claimable, because it is the only one
       that is about to happen; the rest are micro. */
    const near = Store.rewards.filter(x => total < x.required)
                   .sort((a, b) => a.required - b.required)[0];
    const rank = r.claimed ? 'past' : ready ? 'hero'
               : (near && near.id === r.id) ? 'hero' : 'far';
    const state = r.claimed ? 'claimed' : open ? 'ready' : 'sealed';
    const done = Math.min(total, r.required);

    /* the array is capped so a 30-stamp tier does not draw 30 cells on
       a phone; past the cap it steps in fives and says so */
    const step = r.required > 12 ? Math.ceil(r.required / 12) : 1;
    const cells = Math.ceil(r.required / step);
    const litCells = Math.floor(done / step);
    const slots = Array.from({ length:cells }, (_, i) =>
      `<span class="dslot${i < litCells ? ' dslot--set' : ''}"></span>`).join('');

    return `<section class="rig dossier dossier--${state}" data-rank="${rank}" data-enter data-reward="${r.id}">
      <div class="panel tech tech--${state}">
        <span class="dossier__idx idx${open ? ' idx--on' : ''}" aria-hidden="true">${pad(r.required)}</span>
        <div class="dossier__head">
          <h3 class="tech__name">${esc(r.name)}</h3>
          <span class="anno${ready ? ' anno--seal' : ''}">${
            r.claimed ? 'CLAIMED' : open ? 'READY' : 'SEALED'}</span>
        </div>
        <p class="dossier__at">Unlocks at ${r.required} stamps</p>

        <div class="dslots" style="--dcells:${cells}" role="img"
             aria-label="${done} of ${r.required} stamps">${slots}</div>
        <div class="dossier__legend">
          <span class="kicker">${done} / ${r.required} stamps</span>
          <span class="kicker">${open ? 'Unlocked' : (r.required - total) + ' to go'}</span>
        </div>

        ${ready
          ? `<button class="btn btn--hot btn--wide dossier__claim" data-claim="${r.id}">Claim reward</button>`
          : ''}

        ${ready ? `<svg class="tech__crack" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M-2 44 22 40 38 52 61 43 79 55 102 47"/>
            <path d="M30 -2 34 26 26 44 40 68 33 102"/>
            <path d="M70 -2 64 30 76 52 62 74 71 102"/></svg>` : ''}
      </div>
    </section>`;
  },

  /* Four figures at identical weight is four figures nobody reads
     first. A plate can now be ranked, and exactly one per page is. */
  stat(value, label, sub, rank){
    return `<div class="stat"${rank ? ` data-rank="${rank}"` : ''}>
      <b>${esc(value)}${sub ? `<i> / ${esc(sub)}</i>` : ''}</b><span>${esc(label)}</span></div>`;
  },

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
  empty(icon, title, body, code = 'NIL'){
    return `<section class="rig empty-reg" data-enter>
      <div class="empty">
        <div class="empty__seal" aria-hidden="true">
          <svg viewBox="0 0 100 100">${seal(2)}</svg>
          <span class="empty__void"></span>
        </div>
        <div class="empty__body">
          <span class="anno">REC.${esc(code)} // NOT PRESSED</span>
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
        <span class="lrow__date">${state === 'open' ? 'Today' : fmtDay(m.date)}</span>
        <span class="lrow__when">${detail}</span>
      </span>
      ${state === 'open' ? '<span class="lrow__go">Scan</span>' : ''}
      <span class="sr-only">${sr}</span>
    </${el}>`;
  },
};

/* ══════════════════════════════════════════════════════════════════
   8. VIEWS
   Five destinations. The dashboard leads with the count because that
   is the thing a member opens the app to see; everything else on it
   answers "what do I do next".
   ══════════════════════════════════════════════════════════════════ */
const Views = {
  /* Shown instead of any figure derived from attendance when the
     snapshot could not be loaded. Rendering 0 stamps here would tell a
     member their record is empty when the truth is that we do not
     know — the one failure mode most likely to make someone think
     their attendance was lost. */
  loadFailure(title){
    return `<div class="view">
      ${C.head(title)}
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

    /* ONE ACTION. The verb is a verb and nothing else; which meeting it
       acts on, and when, is the reading under it. The two used to be
       welded into one long display line that broke after "GM" and left
       the number orphaned on the next row. */
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

    /* THE CARD IS THE PAGE. Home is one object — the count set on the
       card that carries it — one action, and the meetings still ahead.

       It used to also carry two meeting entries under the action, and
       the first of them was the same meeting the action panel was
       already showing: the same number, the same date, the same room,
       restated two hundred pixels lower. Both are gone. What is left
       below the deck is the only thing Home did not already say. */
    const showing = open ? open.id : next ? next.id : null;
    const ahead = Store.meetings
      .filter(m => m.upcoming && m.id !== showing)
      .sort((a, b) => String(a.date) < String(b.date) ? -1 : 1)
      .slice(0, 3);

    return `<div class="view view--home">
      <div class="deck" data-enter>
        ${C.sealGrid()}
        ${action}
      </div>

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
    </div>`;
  },

  /* the attendance record: every general meeting, in order, with what happened */
  record(){
    if (Store.failed) return this.loadFailure('Record');
    /* newest first, so the meeting you can still walk into leads the
       page instead of sitting fourteen rows down. */
    const byNo = (a,b) => b.no - a.no;
    const held = [...Store.heldMeetings()].sort(byNo);
    const upcoming = Store.meetings.filter(m => m.upcoming).sort(byNo);
    const kept = held.filter(m => Store.attended(m.id)).length;
    const gone = held.length - kept;
    const frac = held.length ? kept / held.length : 0;

    return `<div class="view view--record">
      <header class="rechead" data-enter>
        <h1 class="title rechead__title">Record</h1>
        <p class="rechead__note">Every general meeting, in order. A line is written
          the moment the server accepts a scan — nothing here is entered by hand.</p>
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
                'Your record fills itself: every meeting you scan into is '
                + 'written here automatically. Nothing to do until the first one.')}

      ${upcoming.length ? `<section class="ledger ledger--ahead" data-enter>
        <h2 class="ledger__mark">Scheduled</h2>
        ${upcoming.map(m => C.ledgerRow(m)).join('')}
      </section>` : ''}
    </div>`;
  },

  rewards(){
    if (Store.failed) return this.loadFailure('Rewards');
    return `<div class="view">
      ${C.head('Rewards')}
      <div class="stack-panels">
        ${Store.rewards.map(C.tech).join('')}
      </div>
    </div>`;
  },

  scan(){
    return `<div class="view">
      ${C.head('Scan code')}

      <!-- THE RIG. The viewfinder is not a component sitting on a
           page; it is an instrument mounted in a frame, and the frame
           states what it is doing. Technical readings run along the
           top edge and a rune runs down the side — real state, not
           decoration: the optics label, the code format the reader
           accepts, and the live status. -->
      <div class="rig-scan" data-enter>
        <div class="rig-scan__bar" aria-hidden="true">
          <span class="anno">OPT.CAM // 1280</span>
          <span class="anno">FMT.M##/XXXXXX</span>
          <span class="anno anno--seal" id="rigState">SYS.ARMED</span>
        </div>
        <span class="rig-scan__rune" aria-hidden="true">読取 // TARGETING</span>
        <span class="rig-scan__cut" aria-hidden="true"></span>
      <div class="viewer" id="viewer" data-enter>
        <video id="cam" playsinline muted autoplay></video>
        <div class="viewer__scrim" aria-hidden="true"></div>
        <div class="viewer__grain" aria-hidden="true"></div>
        <div class="reticle" id="reticle" aria-hidden="true">
          <svg class="reticle__geo" viewBox="0 0 100 100">
            <g class="sp"><circle cx="50" cy="50" r="48"/>
              <circle cx="50" cy="50" r="43" stroke-dasharray="2 7"/>${ticks(24, 43, 47, 6)}</g>
            <g class="sp-r"><circle cx="50" cy="50" r="34" stroke-dasharray="14 9"/>
              <polygon points="50,20 80,50 50,80 20,50"/></g>
          </svg>
          <svg class="reticle__mark" viewBox="0 0 100 100">${seal(1)}</svg>
          <span class="reticle__c reticle__c--tl"></span>
          <span class="reticle__c reticle__c--tr"></span>
          <span class="reticle__c reticle__c--bl"></span>
          <span class="reticle__c reticle__c--br"></span>
          <span class="reticle__line"></span>
        </div>
        <div class="viewer__status"><span class="viewer__msg" id="scanMsg">Starting camera</span></div>
      </div>
      </div>

      <div class="manual" data-enter>
        <p class="kicker">Camera not working? Type the code under the seal</p>
        <div class="field">
          <input class="input" id="manualInput" placeholder="m09/XXXXXX"
                 aria-label="Seal code" autocomplete="off" spellcheck="false" enterkeyhint="go">
          <button class="btn btn--ghost" id="manualGo">Verify</button>
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
  /* Each board route is a chapter of the same spread. The internal chip
     row is gone: the nav rail already says where you are, and two levels
     of tabs for four screens was one level too many. */
  boardSpread(title){
    return `<div class="view">
      ${C.head(title)}
      <section class="rig" data-enter style="margin-top:var(--gut)">
        <div id="boardPane">${BoardUI.pane()}</div>
      </section>
    </div>`;
  },

  board(){     BoardUI.tab = 'club';     return this.boardSpread('Club Tools'); },
  bmeet(){     BoardUI.tab = 'meetings'; return this.boardSpread('Meetings'); },
  bcheckin(){  BoardUI.tab = 'session';  return this.boardSpread('Check-In'); },
  bmembers(){  BoardUI.tab = 'progress'; return this.boardSpread('Members'); },

  /* ── MEMBER — the credential page (§38) ───────────────────────────
     This was the one spread that did not belong to the system. It
     opened with the member's name at 20px inside a mostly empty panel
     while every other chapter opened with a display-size nameplate; its
     four figures were rendered at identical weight, so the page had no
     headline; and its Milestones list was a THIRD card design for
     content the Rewards chapter already owns.

     It is a chapter now. Same nameplate as Record, Rewards and Club
     Tools; one figure carrying the page and three supporting it; and
     the milestones reduced to a register — the Rewards chapter holds
     the full treatment, this one holds the ledger of it. */
  profile(){
    if (Store.failed) return this.loadFailure('Member');
    const held = Store.heldMeetings();
    const attended = held.filter(m => Store.attended(m.id)).length;
    const p = Rules.progress();
    const total = Store.totalStamps();

    return `<div class="view">
      ${C.head(esc(memberName()))}

      <section class="rig stack-lg" data-enter>
        <div class="panel who" data-rank="quiet">
          ${ASSETS.schoolSeal
            ? `<img class="who__seal who__seal--img" src="${ASSETS.schoolSeal}" alt="" aria-hidden="true">`
            : `<svg class="who__seal" viewBox="0 0 100 100" aria-hidden="true">${seal(4)}</svg>`}
          <div class="who__id">
            <p class="who__role">${Store.isBoard ? 'Board' : 'Member'} / ${
              esc(Store.user && Store.user.username ? Store.user.username : memberName())}</p>
            <p class="who__line">${
              total === 0 ? 'No stamps on this card yet.'
              : `${pad(total)} stamps struck across ${attended} of ${held.length} meetings held.`}</p>
          </div>
          <span class="rune" data-layer aria-hidden="true">CARD ${
            p.next ? 'TIER ' + p.next : 'COMPLETE'}</span>
        </div>
      </section>

      <div class="stats stack-lg">
        ${C.stat(pad(total), 'Total stamps', null, 'lead')}
        ${C.stat(pad(attended), 'Meetings attended', pad(held.length))}
        ${C.stat(pad(Store.rewardsUnlocked()), 'Rewards unlocked', pad(Store.rewards.length))}
        ${C.stat(Store.attendanceRate() + '%', 'Attendance rate')}
      </div>

      <section class="rig rig--bl stack-xl" data-enter>
        <div class="panel panel--flat" data-rank="quiet">
          <h2 class="h2">Milestones</h2>
          <ol class="mstone">
            ${Store.rewards.map(r => {
              const open = total >= r.required;
              const state = r.claimed ? 'Claimed' : open ? 'Ready' : 'Sealed';
              return `<li class="mstone__row mstone__row--${state.toLowerCase()}">
                <span class="mstone__at">${pad(r.required)}</span>
                <span class="mstone__name">${esc(r.name)}</span>
                <span class="mstone__state">${state}</span>
                <span class="mstone__gap">${open ? '—' : (r.required - total) + ' to go'}</span>
              </li>`;
            }).join('')}
          </ol>
          <p class="muted mstone__foot">
            ${p.next ? `${p.remaining} more ${p.remaining === 1 ? 'stamp' : 'stamps'} until the next one unlocks.`
                     : 'Every milestone is unlocked.'}</p>
        </div>
      </section>
      <!-- THE ACCOUNT BLOCK.

           Sign out lived only in the desktop rail, and the rail is
           gone below 1024 — so on every phone and every tablet there
           was no way to sign out at all. Member is chapter 05, the
           account chapter, and it is on the tab bar at every width, so
           the control belongs here rather than behind a drawer or
           hidden under an icon. It hides itself once the rail is back
           and carrying the same control. -->
      <section class="acct" data-enter>
        <span class="acct__rule" data-layer aria-hidden="true"></span>
        <div class="acct__row">
          <div class="acct__who">
            <p class="kicker">Signed in / ${Store.isBoard ? 'Board' : 'Member'}</p>
            <p class="acct__name">${esc(memberName())}</p>
          </div>
          <button class="btn btn--out" data-signout type="button">Sign out</button>
        </div>
      </section>
    </div>`;
  },

  /* ── AUTH ────────────────────────────────────────────────────────
     Composed from the same parts as every other spread: a chapter
     nameplate, one lead panel, screentone behind the figure. It is a
     manga page that happens to contain two fields, not a login box
     dropped into a manga site. */
  auth(){
    const mode = AuthUI.mode;                 /* 'in' | 'up' */
    const up = mode === 'up';
    /* THE OPENING SPREAD.

       A sign-in screen is the one page every member sees before they
       have anything to look at, so it is the page that has to say what
       this product is. It was a grey card floating in the middle of a
       blank sheet — competent and completely anonymous.

       It is a manga opening panel now: the seal at enormous size,
       cropped hard by the left edge of the sheet so it reads as printed
       rather than placed; the wordmark set in the display face across
       it; and the form dropped into the lower-right quarter as a small
       dense block of ink. The composition is deliberately unbalanced —
       the weight sits low and right, the mark sits high and left — and
       that diagonal is the whole of the drama. No frame around it, no
       decoration in it, and nothing between the member and the two
       fields they came here to fill in. */
    return `<div class="view view--auth">

      <div class="spread" data-enter>

        <div class="spread__art" aria-hidden="true">
          <svg class="spread__seal" viewBox="0 0 100 100">${sealArt()}</svg>
        </div>

        <header class="spread__head">
          <p class="spread__sub">Key Club attendance</p>
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
      </div>
    </div>`;
  },
};