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
  rung(r, total, prev){
    const open  = total >= r.required;
    const ready = open && !r.claimed;
    const state = r.claimed ? 'claimed' : ready ? 'ready' : 'sealed';
    const left  = r.required - total;
    const fill  = Math.max(0, Math.min(1, (total - prev) / (r.required - prev)));
    const say   = r.claimed ? 'Claimed'
                : ready     ? 'Ready'
                : left === 1 ? '1 more' : `${left} more`;

    return `<li class="rung rung--${state}" data-reward="${r.id}" style="--fill:${(fill * 100).toFixed(1)}%">
      <span class="rung__at">${r.required}</span>
      <span class="rung__body">
        <span class="rung__name">${esc(r.name)}</span>
        ${r.desc ? `<span class="rung__desc">${esc(r.desc)}</span>` : ''}
      </span>
      ${ready
        ? `<button class="btn rung__claim" type="button" data-claim="${r.id}">Claim</button>`
        : `<span class="rung__say meta">${say}</span>`}
    </li>`;
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
      const docket = rec && mtg
        ? `GM ${pad(mtg.no)} · ${fmtDate(mtg.date)} · ${fmtTime(rec.at)}` : '';

      const seed = p.floor + i + 1;
      const fit  = STAMP_FIT;
      return `<li class="seal ${state ? 'seal--' + state : ''}${hero}${mile}" data-seal="${state || 'empty'}" style="${tilt}"${
        docket ? ` role="img" tabindex="0" data-docket="${esc(docket)}" aria-label="Stamp ${pad(p.floor + i + 1)}: general meeting ${
          mtg.no}, ${fmtDate(mtg.date)}, checked in at ${fmtTime(rec.at)}"` : ' aria-hidden="true"'}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path class="sf-back" d="${stampShape(seed * 3 + 1, 3.4)}"/>
          <g class="sf-press">
            <path class="sf-face" d="${stampShape(seed, 0)}"/>
            <g class="seal__mark" transform="translate(${(32 - 32 * fit).toFixed(1)} ${(32 - 32 * fit).toFixed(1)}) scale(${fit})">${stampMark(p.floor + i)}</g>
          </g>
        </svg>
        <span class="seal__no">${pad(p.floor + i + 1)}</span>
        ${mile && goal ? `<span class="seal__tag">${esc(goal.name)}</span>` : ''}
      </li>`;
    }).join('');

    const route =
      `<svg class="card__route card__route--l" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="9.5,12.3 28.8,24 48,12.3 66.8,21.5 86.5,34.3 59.3,44.5 38,47.3 12.3,57 34.5,72.3 74.5,71.2"/></svg>` +
      `<svg class="card__route card__route--p" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="16.0,8.6 46.0,13.3 74.0,21.1 81.0,40.6 58.0,50.0 31.0,54.7 11.0,72.7 34.0,81.3 58.0,71.9 83.0,83.6"/></svg>`;

    const say = full
      ? 'Card full'
      : p.total === 0 ? 'Your first stamp lands here'
      : goal ? `${p.remaining} more for ${goal.name}`
             : `${p.remaining} more to fill this card`;

    return `<section class="card${full ? ' card--full' : ''}" data-enter>
      <div class="card__face">
        <div class="card__id">
          <span class="card__cardno">Card ${pad(cardNo)}</span>
          <p class="card__num"><b>${pad(p.filled)}</b><span>/ ${p.span}</span></p>
          <span class="card__idrule" aria-hidden="true"></span>
          <p class="card__goal">${esc(say)}</p>
          <p class="card__docket" id="cardDocket" aria-hidden="true"></p>
          <span class="card__kci" aria-hidden="true">${brandSeal('kci')}</span>
        </div>
        <div class="card__field">
          ${route}
          <ol class="seals" id="seals" aria-label="${p.filled} of ${p.span} stamps in this tier">${cells}</ol>
        </div>
      </div>
    </section>`;
  },

  /* The one live object a page may carry: ink when a meeting is open,
     paper when nothing is. Shared by Home and Record. */
  strip({ verb, meta, go, live = false, quiet = false }){
    return `<button class="strip${live ? ' strip--live' : ''}${quiet ? ' strip--quiet' : ''}"
      type="button" data-go="${go}" data-enter>
      <span class="strip__verb">${esc(verb)}</span>
      <span class="strip__meta">${esc(meta)}</span>
    </button>`;
  },

  empty(title, body){
    return `<section class="empty" data-enter>
      <h2 class="empty__title">${esc(title)}</h2>
      ${body ? `<p class="empty__note">${esc(body)}</p>` : ''}
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

    const room = m.place && m.place !== Schedule.PLACE ? ` · ${esc(m.place)}` : '';
    const detail = {
      set:  (scan ? fmtTime(scan.at) : 'Stamped') + room,
      open: 'Open now' + room,
      miss: 'Missed' + room,
      upcoming: esc(m.time) + room,
    }[state];
    const sr = { set:'Attended', open:'Check-in open', miss:'Missed',
                 upcoming:'Scheduled' }[state];

    return `<li class="row lrow lrow--${state}">
      <span class="row__no">${pad(m.no)}</span>
      <span class="lrow__stamp">${mark}</span>
      <span class="lrow__date">${m.today ? 'Today' : fmtDate(m.date)}</span>
      <span class="lrow__when meta">${detail}</span>
      <span class="sr-only">${sr}</span>
    </li>`;
  },
};

C.account = () => `<section class="acct" data-enter>
  <h2 class="sec">Account</h2>
  <div class="acct__row">
    <span class="acct__lab">Animations</span>
    <button class="link" type="button" data-motion></button>
  </div>
  <div class="acct__row">
    <span class="acct__lab">Signed in as ${esc((Store.user && Store.user.username) || memberName())}</span>
    <button class="btn btn--quiet" data-signout type="button">Sign out</button>
  </div>
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
    if (Store.failed) return this.loadFailure('Card');
    const open = Store.openMeeting();
    const next = Store.nextMeeting();
    const done = open && Store.attended(open.id);
    const live = Boolean(open && !done);
    const p = Rules.progress();
    const ready = Store.rewards.find(r => p.total >= r.required && !r.claimed) || null;

    let action;
    if (live)
      action = C.strip({ verb:'Check in', go:'scan', live:true,
                         meta:`GM ${pad(open.no)} · today · ${open.time}` });
    else if (open && done)
      action = C.strip({ verb:'Stamped', go:'record',
                         meta:`GM ${pad(open.no)} · today` });
    else if (p.filled >= p.span && ready)
      action = C.strip({ verb:`Claim ${ready.name}`, go:'rewards',
                         meta:`Card ${pad(p.card)} filled` });
    else if (next)
      action = C.strip({ verb:'Nothing open', go:'scan', quiet:true,
                         meta:`Next GM ${pad(next.no)} · ${fmtDate(next.date)}` });
    else
      action = C.strip({ verb:'Nothing open', go:'scan', quiet:true,
                         meta:'No meetings scheduled yet' });

    const showing = open ? open.id : next ? next.id : null;
    const ahead = Store.meetings
      .filter(m => m.upcoming && m.id !== showing)
      .sort((a, b) => String(a.date) < String(b.date) ? -1 : 1)
      .slice(0, 3);

    return `<div class="view view--home">
      <header class="rechead" data-enter>
        <h1 class="title rechead__title">Card</h1>
      </header>

      <div class="deck${live ? ' deck--live' : ''}">
        ${C.sealGrid()}
        <div class="deck__side">
          ${action}
          ${ahead.length ? `<section class="next" data-enter>
              <h2 class="sec">Next<span class="sec__n">${ahead.length === 1 ? '1 meeting' : `${ahead.length} meetings`}</span></h2>
              <ol class="rows next__rows">
                ${ahead.map(m => `<li class="row next__row">
                  <span class="row__no">GM ${pad(m.no)}</span>
                  <span class="next__day">${fmtDate(m.date)}</span>
                  <span class="next__at meta">${esc(m.time)}</span>
                </li>`).join('')}
              </ol>
            </section>` : ''}
        </div>
      </div>
    </div>`;
  },

  record(){
    if (Store.failed) return this.loadFailure('Record');

    const newest = (a, b) => String(a.date) < String(b.date) ? 1 : -1;
    const soonest = (a, b) => String(a.date) < String(b.date) ? -1 : 1;
    const open = Store.openMeeting();
    const held = [...Store.heldMeetings()].filter(m => !(open && m.id === open.id)).sort(newest);
    const upcoming = Store.meetings.filter(m => m.upcoming).sort(soonest);
    const counted = Store.countedMeetings();
    const kept = counted.filter(m => Store.attended(m.id)).length;
    const gone = counted.length - kept;

    const strip = open
      ? (Store.attended(open.id)
          ? C.strip({ verb:'Stamped', go:'home', meta:`GM ${pad(open.no)} · today` })
          : C.strip({ verb:'Check in', go:'scan', live:true,
                      meta:`GM ${pad(open.no)} · today · ${open.time}` }))
      : '';

    return `<div class="view view--record">
      <header class="rechead" data-enter>
        <h1 class="title rechead__title">Record</h1>
      </header>

      ${strip}

      <div class="recbody">
        ${held.length ? `<section class="ledger" data-enter>
          <h2 class="sec">Held<span class="sec__n">${held.length === 1 ? '1 meeting' : `${held.length} meetings`}</span></h2>
          <ol class="rows ledger__rows">
            ${held.map(m => C.ledgerRow(m)).join('')}
          </ol>
        </section>`
        : C.empty('No general meetings yet', 'Your first stamp lands here.')}

        <aside class="recside">
          ${counted.length ? `<p class="tally fig" data-enter>
            <span class="fig__n tally__fig">${pad(kept)}</span>
            <span class="fig__of">stamped of ${pad(counted.length)} held${gone
              ? ` / ${gone} missed` : ''}</span>
          </p>` : ''}

          ${upcoming.length ? `<section class="ledger ledger--ahead" data-enter>
            <h2 class="sec">Next<span class="sec__n">${upcoming.length === 1 ? '1 meeting' : `${upcoming.length} meetings`}</span></h2>
            <ol class="rows ledger__rows">
              ${upcoming.map(m => C.ledgerRow(m)).join('')}
            </ol>
          </section>` : ''}
        </aside>
      </div>
    </div>`;
  },

  rewards(){
    if (Store.failed) return this.loadFailure('Rewards');
    const total = Store.totalStamps();
    const tiers = [...Store.rewards].sort((a, b) => a.required - b.required);
    const next  = tiers.find(t => total < t.required) || null;
    const of = next
      ? `${total === 1 ? 'stamp' : 'stamps'} · ${next.required - total} to ${next.name}`
      : `${total === 1 ? 'stamp' : 'stamps'} · every reward unlocked`;

    return `<div class="view view--rewards">
      <header class="rechead" data-enter>
        <h1 class="title rechead__title">Rewards</h1>
      </header>

      <p class="fig climb__fig" data-enter>
        <span class="fig__n">${pad(total)}</span>
        <span class="fig__of">${esc(of)}</span>
      </p>

      <ol class="rungs" data-enter aria-label="${total} stamps against rewards at ${tiers.map(t => t.required).join(', ')}">
        ${tiers.map((t, i) => C.rung(t, total, i ? tiers[i - 1].required : 0)).join('')}
      </ol>
    </div>`;
  },

  scan(){
    const open = Store.openMeeting();
    const done = open && Store.attended(open.id);
    const standing = !open ? 'Nothing open'
      : done ? `Already stamped · GM ${pad(open.no)}`
      : `GM ${pad(open.no)} · today · ${open.time}`;

    return `<div class="view view--scan">
      <header class="rechead" data-enter>
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
        <p class="viewer__standing">${standing}</p>
      </div>

      <p class="scanline scanline--boot" id="scanLine" data-enter aria-live="polite">
        <i class="scanline__dot" aria-hidden="true"></i>
        <span class="scanline__msg" id="scanMsg">Starting camera</span>
      </p>
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
    if (Store.failed) return this.loadFailure(memberName());
    const held     = Store.countedMeetings();
    const attended = held.filter(m => Store.attended(m.id)).length;
    const total    = Store.totalStamps();
    const p        = Rules.progress();
    const name     = memberName();

    return `<div class="view view--member">
      <header class="rechead" data-enter>
        <h1 class="title rechead__title">${esc(name)}</h1>
      </header>

      <section class="standing" data-enter>
        <p class="fig standing__fig">
          <span class="fig__n">${pad(total)}</span>
          <span class="fig__of">${total === 1 ? 'stamp' : 'stamps'} collected</span>
        </p>
        <ul class="standing__rest">
          <li class="standing__row"><span class="standing__lab">This card</span>
            <span class="standing__val">${pad(p.filled)} of ${pad(p.span)}</span></li>
          <li class="standing__row"><span class="standing__lab">Meetings attended</span>
            <span class="standing__val">${pad(attended)} of ${pad(held.length)}</span></li>
          <li class="standing__row"><span class="standing__lab">Attendance</span>
            <span class="standing__val">${Store.attendanceRate()}%</span></li>
          <li class="standing__row"><span class="standing__lab">Rewards unlocked</span>
            <span class="standing__val">${Store.rewardsUnlocked()} of ${Store.rewards.length}</span></li>
        </ul>
      </section>

      ${C.account()}
    </div>`;
  },

  baccount(){
    const name = memberName();
    return `<div class="view view--member view--account">
      <header class="rechead" data-enter>
        <h1 class="title rechead__title">${esc(name)}</h1>
      </header>
      <p class="who__line meta" data-enter>Board account</p>
      ${C.account()}
    </div>`;
  },

  auth(){
    const mode = AuthUI.mode;
    const passwordField = ({ id, name, label, autocomplete, placeholder = '' }) => `
          <div class="authp__f">
            <label class="authp__lab" for="${id}">${label}</label>
            <div class="authp__pw">
              <input class="authp__in" id="${id}" name="${name}" type="password"
                     autocomplete="${autocomplete}" autocapitalize="none"
                     autocorrect="off" spellcheck="false"
                     placeholder="${placeholder}">
              <button class="authp__eye" type="button" data-eye="${id}"
                      aria-label="Show password" aria-pressed="false"
                      aria-controls="${id}">${ICON.eye}</button>
            </div>
          </div>`;
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

          ${passwordField({ id:'authPass', name:'password', label:'Password',
                            autocomplete: up ? 'new-password' : 'current-password',
                            placeholder: up ? 'at least 8 characters' : '' })}

          ${up ? passwordField({ id:'authPass2', name:'confirm', label:'Confirm password',
                                 autocomplete:'new-password' }) : ''}

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
