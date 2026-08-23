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
  bleed(word, style, mod = ''){
    return `<span class="bleed ${mod}" style="${style}" aria-hidden="true">${word}</span>`;
  },

  /* Every chapter carries the same three marks: the kicker as an
     annotation, the title as the masthead, and an edge rune stating
     which chapter of the volume this is. The rune is what makes five
     differently-composed screens read as one document. */
  head(kicker, title, jp, note){
    const ch = (typeof chapterOf === 'function' && typeof current === 'string')
      ? chapterOf(current) : null;
    return `<header class="head" data-enter>
      <span class="head__rake" data-layer aria-hidden="true"></span>
      <div class="head__stack">
        <p class="kicker">${esc(kicker)}</p>
        <h1 class="title">${title}</h1>
        ${note ? `<p class="muted">${esc(note)}</p>` : ''}
      </div>
      ${ch && ch.ch !== '—'
        ? `<span class="rune" data-layer aria-hidden="true">VOL.01 // CH.${ch.ch}</span>` : ''}
      <span class="jp" aria-hidden="true">${jp}</span>
    </header>`;
  },

  /* ── the stat plate: a character status readout, not a summary card ── */
  hero(){
    const p = Rules.progress();
    const open = Store.openMeeting();
    const live = open && !Store.attended(open.id);
    const next = Store.rewards.find(r => r.required === p.next);
    const line = !p.next ? 'Every reward unlocked'
      : p.remaining === 0 ? `${next.name} is ready to claim`
      : `${p.remaining} more until ${next.name.toLowerCase()}`;

    return `<section class="rig ${live ? '' : 'rig--br'}" data-enter aria-labelledby="heroLbl">
      <span class="rig__ghost" data-layer aria-hidden="true"></span>
      <div class="panel ${live ? 'panel--live' : ''} hero p-quiet ink-load">
        <span class="sfx sfx--a" data-layer aria-hidden="true">${live ? 'OPEN' : 'HOLD'}</span>
        <span class="panel__rule" data-layer aria-hidden="true"></span>
        <span class="tick tick--tl" data-layer aria-hidden="true"></span>
        <span class="tick tick--br" data-layer aria-hidden="true"></span>

        <div class="hero__top">
          ${live
            ? `<span class="emph emph--hot" id="heroLbl"><b>Check-in open</b></span>`
            : `<p class="kicker" id="heroLbl">Current record</p>`}
          <span class="hero__state ${p.remaining === 0 ? 'hero__state--ready' : ''}">${
            !p.next ? 'Complete' : p.remaining === 0 ? 'Reward ready' : 'Reward at ' + p.next}</span>
        </div>

        <div class="hero__core">
          <svg class="hero__ring" viewBox="0 0 100 100" aria-hidden="true">
            <g class="sp">${seal(3)}</g>
            <g class="sp-r"><polygon points="50,26 74,50 50,74 26,50"/></g>
          </svg>
          <span class="hero__num" id="heroNum">${pad(p.total)}</span>
          <span class="hero__of">/ ${p.next || 30}</span>
        </div>
        <p class="hero__label">Stamps acquired</p>

        <!-- The bar is gone. The stamp array immediately below IS the
             progress — ten slots, filling — so a horizontal fill bar
             restated it in the one visual form this system has no use
             for. What remains is the reading: how far to the next
             seal, set as an annotation rather than a caption. -->
        <div class="hero__foot">
          <span class="anno">${esc(line)}</span>
        </div>
      </div>
    </section>`;
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
      const tilt = state === 'set' ? '' :
        `transform:rotate(${[-1.7, 1.2, .6, -1.1, 1.6][i % 5]}deg)`;

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
        <svg viewBox="0 0 100 100" aria-hidden="true"><g class="seal__mark">${seal(state === 'set' ? 2 : 1)}</g></svg>
        <span class="seal__no">${pad(p.floor + i + 1)}</span>
        ${dossier}
      </li>`;
    }).join('');

    return `<section class="rig rig--bl ink-a" data-enter>
      <span class="rig__ghost rig__ghost--l" data-layer aria-hidden="true"></span>
      <div class="panel panel--flat">
        <ul class="seals" id="seals" aria-label="${p.filled} of ${p.span} stamps in this tier">${cells}</ul>
      </div>
    </section>`;
  },

  /* THE ACTION CHAMBER.

     The primary action is not a card — it is a marked-off area of the
     page with the target inside it. The four corner marks are the
     signature device of this system (a barrier, a viewfinder, a seal's
     registration marks) and they are what makes this read as somewhere
     to aim rather than as another panel. They are decorative spans,
     not borders, so they can move independently on hover: the chamber
     locks onto the target when you reach for it. */
  strike({ verb, sub, go, live = false, calm = false }){
    const corners = ['tl','tr','bl','br']
      .map(c => `<span class="chamber__c chamber__c--${c}" data-layer aria-hidden="true"></span>`).join('');
    /* The chamber was a hatched rectangle with a title in one corner
       and a small arrow in the other — 370px of texture with nothing
       in the middle of it, which is the emptiest element in the app on
       the screen where the user is standing in a room trying to check
       in. It is a target now: speed lines running toward a crosshair
       at the centre, the verb underneath, and the commit set as
       [ SCAN ] because that is the vocabulary the rest of the page
       already speaks. */
    return `<button class="strike ${live ? 'strike--live' : ''} ${calm ? 'strike--calm' : ''}"
      data-enter data-go="${go}">
      ${corners}
      <span class="strike__head" data-layer aria-hidden="true">
        <span class="anno">${live ? 'TARGET LIVE' : 'TARGET IDLE'}</span></span>
      <span class="strike__core" aria-hidden="true">
        <span class="xhair"></span>
      </span>
      <span class="strike__body"><span class="strike__verb">${esc(verb)}</span>
        <span class="strike__sub">${esc(sub)}</span></span>
      <span class="strike__go" aria-hidden="true">[ SCAN ]</span>
    </button>`;
  },

  /* ── one entry in the meeting log ── */
  entry(m, { link = true } = {}){
    const state = Store.state(m);
    const scan = Store.scanFor(m.id);
    const verdict = {
      set:      'Attendance confirmed',
      open:     '<span class="pip"></span>Check in now',
      miss:     'No record',
      upcoming: 'Scheduled',
    }[state];
    const meta = scan
      ? `Wed ${fmtDay(m.date)} · stamped ${fmtTime(scan.at)} · ${esc(m.place)}`
      : `Wed ${fmtDay(m.date)} · ${esc(m.time)} · ${esc(m.place)}`;
    const el = (state === 'open' && link) ? 'button' : 'div';
    const attr = el === 'button' ? ' data-go="scan"' : '';

    return `<div class="rec rec--${state}">
      <span class="rec__node" aria-hidden="true"></span>
      <${el} class="entry entry--${state}"${attr}>
      <span class="entry__ghost" data-layer aria-hidden="true">${pad(m.no)}</span>
      <span class="entry__no">GM ${pad(m.no)}</span>
      <span class="entry__verdict">${verdict}</span>
      <span class="entry__meta">${meta}</span>
      ${state === 'set' ? '<span class="entry__gain">+1 stamp</span>' : ''}
      </${el}>
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
    const state = r.claimed ? 'claimed' : open ? 'ready' : 'sealed';
    const done = Math.min(total, r.required);

    /* the array is capped so a 30-stamp tier does not draw 30 cells on
       a phone; past the cap it steps in fives and says so */
    const step = r.required > 12 ? Math.ceil(r.required / 12) : 1;
    const cells = Math.ceil(r.required / step);
    const litCells = Math.floor(done / step);
    const slots = Array.from({ length:cells }, (_, i) =>
      `<span class="dslot${i < litCells ? ' dslot--set' : ''}"></span>`).join('');

    return `<section class="rig dossier dossier--${state}" data-enter data-reward="${r.id}">
      <span class="rig__ghost" data-layer aria-hidden="true"></span>
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
  loadFailure(title, jp){
    return `<div class="view">
      ${C.head('Keystamp', title, jp)}
      <section class="rig" data-enter>
        <span class="rig__ghost" data-layer aria-hidden="true"></span>
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
    if (Store.failed) return this.loadFailure('Home', '記録');
    const open = Store.openMeeting();
    const next = Store.nextMeeting();
    const done = open && Store.attended(open.id);
    const recent = Store.scans.length ? Store.meeting(Store.scans[0].meetingId) : null;

    let action;
    if (open && !done)
      action = C.strike({ verb:'Scan code', sub:`GM ${pad(open.no)} · Wed ${fmtDay(open.date)} · MPR`, go:'scan', live:true });
    else if (open && done)
      action = C.strike({ verb:'Stamped', sub:`GM ${pad(open.no)} confirmed`, go:'record', calm:true });
    else if (next)
      action = C.strike({ verb:'Scan code', sub:`Opens at GM ${pad(next.no)} · ${fmtDate(next.date)}`,
                          go:'scan', calm:true });
    else
      action = C.strike({ verb:'Scan code', sub:'No general meeting is taking check-ins', go:'scan', calm:true });

    return `<div class="view">
      ${C.bleed('STAMP', '', 'sfxw sfxw--r')}
      ${ASSETS.homeHeader ? `<div class="banner" data-enter>
        <img src="${ASSETS.homeHeader}" alt="">
      </div>` : ''}
      <!-- THE NAMEPLATE. No frame. The name is bled off the left edge
           of the canvas and sits ON the register rule rather than
           inside a box, so it interrupts the sheet instead of being
           placed on it. The state line and the two metadata marks are
           set in the margin the name leaves. -->
      <header class="head head--bare nameplate" data-enter>
        <span class="nameplate__rule" data-layer aria-hidden="true"></span>
        <div class="head__stack">
          <h1 class="title title--name">${esc(memberName())}<em>.</em></h1>
        </div>
        <div class="nameplate__meta">
          <span class="anno${open && !done ? ' anno--seal' : ''}">SYS.${
            open && !done ? 'ACTIVE' : 'STANDBY'}</span>
          ${(() => { const p = Rules.progress(); const o = Store.openMeeting();
       const line = o && !Store.attended(o.id) ? 'The room is already filling up.'
         : p.remaining === 0 ? 'That was the last one.'
         : p.remaining === 1 ? 'One more. Just one.'
         : `${p.remaining} more before it means anything.`;
       return `<p class="nameplate__line">${line}</p>`; })()}
        </div>
        <span class="rune" data-layer aria-hidden="true">VOL.01 // CH.01</span>
        <span class="jp" aria-hidden="true">出席</span>
      </header>

      ${C.hero()}
      ${C.sealGrid()}
      ${action}

      <div class="duo">
      <section class="rig rig--tr" data-enter>
        <span class="rig__ghost" data-layer aria-hidden="true"></span>
        <div class="panel">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:var(--s3)">
            <h2 class="h2">${open ? 'Happening now' : 'Next meeting'}</h2>
            <button class="section-link" data-go="record">Full record</button>
          </div>
          <div class="log" style="margin-top:var(--s4)">
            ${open ? C.entry(open) : next ? C.entry(next)
              : `<p class="muted" style="font-size:13.5px">Nothing scheduled yet.</p>`}
          </div>
        </div>
      </section>

      ${recent ? `<section class="rig rig--bl" data-enter>
        <span class="rig__ghost rig__ghost--l" data-layer aria-hidden="true"></span>
        <div class="panel panel--flat">
          <h2 class="h2">Last stamped</h2>
          <div class="log" style="margin-top:var(--s4)">${C.entry(recent, { link:false })}</div>
        </div>
      </section>` : ''}
      </div>
    </div>`;
  },

  /* the attendance record: every general meeting, in order, with what happened */
  record(){
    if (Store.failed) return this.loadFailure('Record', '記録');
    const held = Store.heldMeetings();
    const upcoming = Store.meetings.filter(m => m.upcoming).reverse();

    return `<div class="view">
      ${C.bleed('LOG', '', 'sfxw sfxw--l')}
      ${C.head('Attendance', 'Record', '記録')}

      ${held.length ? `<section data-enter class="stack-lg">
        <div class="log">${held.map(m => C.entry(m)).join('')}</div>
      </section>`
      : C.empty(ICON.blank, 'No general meetings yet',
                'Your record fills itself: every meeting you scan into is '
                + 'written here automatically. Nothing to do until the first one.')}

      ${upcoming.length ? `<section data-enter class="stack-xl">
        <h2 class="h2" style="color:var(--faint)">Scheduled</h2>
        <div class="log" style="margin-top:var(--s4)">${upcoming.map(m => C.entry(m)).join('')}</div>
      </section>` : ''}
    </div>`;
  },

  rewards(){
    if (Store.failed) return this.loadFailure('Rewards', '解放');
    return `<div class="view">
      ${C.bleed('UNSEAL', '', 'sfxw sfxw--r')}
      ${C.head('Milestones', 'Rewards', '解放')}
      <div class="stack-panels">
        ${Store.rewards.map(C.tech).join('')}
      </div>
    </div>`;
  },

  scan(){
    return `<div class="view">
      ${C.bleed('LOCK', '', 'sfxw sfxw--l sfxw--tilt')}
      ${C.head('Check in', 'Scan code', '読取')}

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
  boardSpread(bleed, kicker, title, jp){
    return `<div class="view">
      ${C.bleed(bleed.toUpperCase(), '', 'sfxw sfxw--r')}
      ${C.head(kicker, title, jp)}
      <section class="rig" data-enter style="margin-top:var(--gut)">
        <span class="rig__ghost" data-layer aria-hidden="true"></span>
        <div id="boardPane">${BoardUI.pane()}</div>
      </section>
    </div>`;
  },

  board(){     BoardUI.tab = 'club';     return this.boardSpread('Tools',  'Key Club', 'Club Tools', '部活'); },
  bmeet(){     BoardUI.tab = 'meetings'; return this.boardSpread('Meets',  'Key Club', 'Meetings',   '例会'); },
  bcheckin(){  BoardUI.tab = 'session';  return this.boardSpread('Code',   'Key Club', 'Check-In',   '受付'); },
  bmembers(){  BoardUI.tab = 'progress'; return this.boardSpread('Roster', 'Key Club', 'Members',    '会員'); },

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
    if (Store.failed) return this.loadFailure('Member', '会員');
    const held = Store.heldMeetings();
    const attended = held.filter(m => Store.attended(m.id)).length;
    const p = Rules.progress();
    const total = Store.totalStamps();

    return `<div class="view">
      ${C.bleed('IDENT', '', 'sfxw sfxw--r')}
      ${C.head(Store.isBoard ? 'Board' : 'Member', esc(memberName()), '会員')}

      <section class="rig stack-lg" data-enter>
        <span class="rig__ghost" data-layer aria-hidden="true"></span>
        <div class="panel who" data-rank="quiet">
          <span class="panel__rule" data-layer aria-hidden="true"></span>
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
        <span class="rig__ghost rig__ghost--l" data-layer aria-hidden="true"></span>
        <div class="panel panel--flat" data-rank="quiet">
          <h2 class="h2">Milestones</h2>
          <ol class="ledger">
            ${Store.rewards.map(r => {
              const open = total >= r.required;
              const state = r.claimed ? 'Claimed' : open ? 'Ready' : 'Sealed';
              return `<li class="ledger__row ledger__row--${state.toLowerCase()}">
                <span class="ledger__at">${pad(r.required)}</span>
                <span class="ledger__name">${esc(r.name)}</span>
                <span class="ledger__state">${state}</span>
                <span class="ledger__gap">${open ? '—' : (r.required - total) + ' to go'}</span>
              </li>`;
            }).join('')}
          </ol>
          <p class="muted ledger__foot">
            ${p.next ? `${p.remaining} more ${p.remaining === 1 ? 'stamp' : 'stamps'} until the next one unlocks.`
                     : 'Every milestone is unlocked.'}</p>
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
    return `<div class="view view--auth">
      <span class="rake" aria-hidden="true"></span>
      ${C.bleed(up ? 'JOIN' : 'ENTER', '', 'sfxw sfxw--r')}

      <div class="authmark" data-enter>
        <span class="chop chop--filled" aria-hidden="true">
          <svg viewBox="0 0 100 100" class="chop__key">${KEY}</svg>
        </span>
        <span class="authmark__wm">
          <b>KEY</b>STAMP
          <em>Key Club attendance</em>
        </span>
      </div>

      ${C.head(up ? 'New member' : 'Key Club',
               up ? 'Join' : 'Sign in',
               up ? '登録' : '入場')}

      <section class="rig" data-enter>
        <span class="rig__ghost" data-layer aria-hidden="true"></span>
        <form class="panel authp" id="authForm" novalidate>
          <span class="panel__rule" data-layer aria-hidden="true"></span>

          <div class="field authp__f">
            <label class="kicker" for="authUser">Username</label>
            <input class="input" id="authUser" name="username" type="text"
                   autocomplete="username" autocapitalize="none" spellcheck="false"
                   inputmode="latin" maxlength="${Config.USERNAME_MAX}"
                   placeholder="${up ? 'letters, numbers, _ and .' : 'your username'}">
          </div>

          <div class="field authp__f">
            <label class="kicker" for="authPass">Password</label>
            <input class="input" id="authPass" name="password" type="password"
                   autocomplete="${up ? 'new-password' : 'current-password'}"
                   placeholder="${up ? 'at least 8 characters' : ''}">
          </div>

          ${up ? `<div class="field authp__f">
            <label class="kicker" for="authPass2">Confirm password</label>
            <input class="input" id="authPass2" name="confirm" type="password"
                   autocomplete="new-password">
          </div>` : ''}

          <p class="authp__err" id="authErr" role="alert" aria-live="assertive" hidden></p>

          <div class="authp__act">
            <button class="btn btn--go" type="submit" id="authGo">
              ${up ? 'Create account' : 'Sign in'}
            </button>
            <button class="link" type="button" id="authSwap">
              ${up ? 'I already have an account' : 'Create an account'}
            </button>
          </div>

          ${AuthUI.setupNotice()}
        </form>
      </section>
    </div>`;
  },
};