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

const C = {
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

  sealGrid(){
    const p = Rules.progress();
    const chrono = [...Store.scans]
      .sort((a, b) => String(a.at) < String(b.at) ? -1 : 1);

    const goal = Store.rewards.find(r => r.required === p.floor + p.span) || null;
    const cardNo = p.card;
    const full = p.filled >= p.span;

    const cells = Array.from({ length:p.span }, (_, i) => {
      const state = i < p.filled ? 'set' : i === p.filled ? 'next' : '';
      const hero = state === 'set' && i === p.filled - 1 ? ' seal--hero' : '';
      const mile = i === p.span - 1 ? ' seal--mile' : '';

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

    const route =
      `<svg class="card__route card__route--l" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="9.5,12.3 28.8,24 48,12.3 66.8,21.5 86.5,34.3 59.3,44.5 38,47.3 12.3,57 34.5,72.3 74.5,71.2"/></svg>` +
      `<svg class="card__route card__route--p" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="16.0,8.6 46.0,13.3 74.0,21.1 81.0,40.6 58.0,50.0 31.0,54.7 11.0,72.7 34.0,81.3 58.0,71.9 83.0,83.6"/></svg>`;

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
          <span class="card__edge" aria-hidden="true">Keystamp · Key Club attendance<span class="card__edge-tail"> · Cali-Nev-Ha</span></span>
        </div>
      </div>
      ${full ? '<span class="card__punch" aria-hidden="true">Card full</span>' : ''}
    </section>`;
  },

  strike({ verb, sub, go, live = false }){
    return `<div class="act ${live ? 'act--live' : ''}" data-enter>
      <button class="act__btn" data-go="${go}">
        <span class="act__verb">${esc(verb)}</span>
        <span class="act__sub">${esc(sub)}</span>
      </button>
    </div>`;
  },

  sealMeta(rec, m){
    return `<span class="sealmeta" data-layer aria-hidden="true">
      <b class="sealmeta__no">GM ${pad(m.no)}</b>
      <span>${fmtDate(m.date)}</span>
      <span>${fmtTime(rec.at)} / ${esc((rec.method || 'qr').toUpperCase())}</span>
      <span>${esc(m.place)}</span>
    </span>`;
  },

  empty(title, body){
    return `<section class="rig empty-reg" data-enter>
      <div class="empty">
        <span class="tone tone--coarse tone--fade-b empty__tone" aria-hidden="true"></span>
        <div class="empty__seal" aria-hidden="true">
          <svg viewBox="0 0 100 100">${sealArt()}</svg>
          <span class="empty__void"></span>
        </div>
        <div class="empty__body">
          <h3 class="empty__title">${esc(title)}</h3>
          ${body ? `<p class="empty__note">${esc(body)}</p>` : ''}
        </div>
      </div>
    </section>`;
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

    const detail = {
      set:  scan ? `Stamped ${fmtTime(scan.at)} / ${esc(m.place)}`
                 : `Stamped / ${esc(m.place)}`,
      open: `Open now / ${esc(m.place)}`,
      miss: `Not stamped / ${esc(m.place)}`,
      upcoming: `${esc(m.time)} / ${esc(m.place)}`,
    }[state];

    const el   = state === 'open' ? 'button' : 'div';
    const attr = state === 'open' ? ' type="button" data-go="scan"' : '';
    const sr   = { set:'Attended', open:'Check-in open', miss:'Missed',
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

C.account = () => `<section class="acct" data-enter>
  <h2 class="acct__mark">Account</h2>
  <div class="acct__row">
    <span class="acct__lab">Reduced motion</span>
    <button class="motion-btn" type="button" data-motion></button>
  </div>
  <button class="acct__out" data-signout type="button">Sign out</button>
</section>`;

const MANUAL_ENTRY = false;

const Views = {
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
    const live = Boolean(open && !done);

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
      <header class="rechead rechead--tight" data-enter>
        <h1 class="title rechead__title">Your card</h1>
      </header>

      <div class="deck${live ? ' deck--live' : ''}" data-enter>
        ${C.sealGrid()}
        <div class="deck__act">${action}</div>
        ${ahead.length ? `<section class="ahead deck__ahead" data-enter>
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
    </div>`;
  },

  record(){
    if (Store.failed) return this.loadFailure('Record');

    const newest = (a, b) => String(a.date) < String(b.date) ? 1 : -1;
    const soonest = (a, b) => String(a.date) < String(b.date) ? -1 : 1;
    const held = [...Store.heldMeetings()].sort(newest);
    const upcoming = Store.meetings.filter(m => m.upcoming).sort(soonest);
    const counted = Store.countedMeetings();
    const kept = counted.filter(m => Store.attended(m.id)).length;
    const gone = counted.length - kept;
    const frac = counted.length ? kept / counted.length : 0;

    return `<div class="view view--record">
      <header class="rechead" data-enter>
        <h1 class="title rechead__title">Record</h1>
      </header>

      ${held.length ? `<div class="recbody">
        <aside class="tally" data-enter>
          <p class="tally__fig">${pad(kept)}</p>
          <p class="tally__of">stamped of ${pad(counted.length)} held</p>
          <p class="tally__bar" style="--fill:${(frac*100).toFixed(1)}%" aria-hidden="true"></p>
          <p class="tally__gone">${gone
            ? `${gone} missed` : 'None missed'}</p>
        </aside>

        <section class="ledger" data-enter>
          ${held.map(m => C.ledgerRow(m)).join('')}
        </section>
      </div>`
      : C.empty('No general meetings yet',
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
      <header class="rechead rechead--tight" data-enter>
        <h1 class="title rechead__title">Scan</h1>
      </header>

      <div class="viewer" id="viewer" data-enter>
        <video id="cam" playsinline muted autoplay></video>
        <div class="viewer__scrim" aria-hidden="true"></div>
        <div class="reticle" id="reticle" aria-hidden="true">
          <span class="reticle__c reticle__c--tl"></span>
          <span class="reticle__c reticle__c--tr"></span>
          <span class="reticle__c reticle__c--bl"></span>
          <span class="reticle__c reticle__c--br"></span>
        </div>
      </div>

      <p class="scanline scanline--boot" id="scanLine" data-enter aria-live="polite">
        <i class="scanline__dot" aria-hidden="true"></i>
        <span class="scanline__msg" id="scanMsg">Starting camera</span>
      </p>

      <p class="standing" data-enter>
        <span class="standing__lab">${standing.lab}</span>
        <span class="standing__at">${standing.at}</span>
      </p>

      ${MANUAL_ENTRY ? `<div class="manual" data-enter>
        <label class="manual__lab" for="manualInput">Or enter the check-in code</label>
        <div class="manual__f">
          <input class="manual__in" id="manualInput" placeholder="Check-in code"
                 autocomplete="off" spellcheck="false" enterkeyhint="go">
          <button class="manual__go" id="manualGo" type="button">Verify</button>
        </div>
      </div>` : ''}
    </div>`;
  },

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
    const held     = Store.countedMeetings();
    const attended = held.filter(m => Store.attended(m.id)).length;
    const total    = Store.totalStamps();
    const name     = memberName();
    const handle   = (Store.user && Store.user.username) || name;
    const role     = Store.isBoard ? 'Board' : 'Member';

    return `<div class="view view--member">
      <header class="rechead rechead--tight" data-enter>
        <h1 class="title rechead__title">Member</h1>
      </header>

      <div class="sheet" data-enter>
        <section class="who">
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

      ${C.account()}
    </div>`;
  },

  baccount(){
    const name   = memberName();
    const handle = (Store.user && Store.user.username) || name;
    return `<div class="view view--member view--account">
      <header class="rechead rechead--tight" data-enter>
        <h1 class="title rechead__title">Account</h1>
      </header>

      <section class="who" data-enter>
        <div class="who__mark" aria-hidden="true">
          <span class="who__org">Cali-Nev-Ha District</span>
        </div>
        <span class="who__emblem" aria-hidden="true">${brandSeal('cnh')}</span>
        <div class="who__id">
          <p class="who__hand">Signed in / Board${handle !== name ? ` / ${esc(handle)}` : ''}</p>
          <p class="who__name">${esc(name)}</p>
        </div>
      </section>

      ${C.account()}
    </div>`;
  },

  auth(){
    const mode = AuthUI.mode;
    const up = mode === 'up';

    return `<div class="view view--auth">

      <div class="spread" data-enter>

        <div class="spread__field crop" aria-hidden="true">
          <svg class="spread__seal crop__art" viewBox="0 0 100 100">${sealArt()}</svg>
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

        <span class="spread__side" aria-hidden="true">Key Club International · Cali-Nev-Ha District</span>
      </div>
    </div>`;
  },
};
