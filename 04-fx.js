"use strict";

/* ══ THE MOTION VOCABULARY. Few things move in Keystamp, and they move the
   way paper and ink do. Most of the page is still; when something moves
   it is because something just happened.

     CUT     a blade crosses: a page turned, a sheet cut away, a sign-out
     STAMP   an object brought down onto paper: held, struck, pressed, set
     PRESS   a control under a finger: down a little and back
     PRINT   a line or a mark coming off the press
     SNAP    a figure replaced: the new one set down hard
     SETTLE  back to rest, and staying there

   Every one of them does nothing with motion reduced (the state it
   announces is already on the page), and every one cleans up after
   itself. The curves are named for what they do, not how they look. ══ */
const EASE = {
  SNAP:   cubicBezier(.2, .9, .25, 1),    // away at once, a controlled stop
  STRIKE: cubicBezier(.6, 0, .92, .4),    // faster and faster into a hit
  SETTLE: cubicBezier(.18, 1.6, .4, 1),   // out of a hit: a hair past rest, then still
  INK:    cubicBezier(.3, .75, .3, 1),    // a mark spreading into the stock
  CUT:    cubicBezier(.45, 0, .1, 1),     // a blade: a short held start, then all at once
  FALL:   cubicBezier(.5, 0, .95, .5),    // weight let go
  CALM:   cubicBezier(.22, .61, .36, 1),
};

const Ink = {
  /* a control under a finger: down a little, a hair smaller, back */
  press(el, depth = 2){
    if (!el || Motion.off) return;
    animate(el, { translateY:[0, depth, 0], scale:[1, .97, 1], duration:160, ease:EASE.SNAP,
      onComplete(){ Motion.settle(el); } });
  },

  /* An object brought down onto paper. It is held over its place a moment
     (larger, turned, rising a hair: the hand lifting before it strikes),
     then struck down faster and faster, pressed a little below its size
     at the hit, and set. `hit` runs on the frame it lands. */
  stamp(el, { lift = 1.5, turn = -9, hold = 70, strike = 100, settle = 160, hit = null, done = null } = {}){
    if (!el) return;
    let landed = false, ended = false;
    const land = () => { if (landed) return; landed = true; if (hit) try { hit(); } catch (_) {} };
    const end = () => { if (ended) return; ended = true; land(); Motion.settle(el); if (done) try { done(); } catch (_) {} };
    if (Motion.off){ el.style.opacity = ''; end(); return; }
    aset(el, { opacity:1, scale:lift, rotate:turn });
    createTimeline({ onComplete:end })
      .add(el, { scale:lift * 1.07, rotate:turn - 2, duration:hold, ease:EASE.SNAP })
      .add(el, { scale:.92, rotate:0, duration:strike, ease:EASE.STRIKE, onComplete:land })
      .add(el, { scale:1, duration:settle, ease:EASE.SETTLE });
    /* whatever a dropped frame does, the hit is never lost and the
       object never stays in the air */
    setTimeout(land, hold + strike + 40);
    setTimeout(end, hold + strike + settle + 300);
  },

  /* The ink a hit squeezes out: the mark's own shape (`shape`, a path
     in the seal's 64-unit box) or its box, a little wider than the mark,
     there on the hit and gone into the stock at once. Under the mark. */
  bleed(host, { color = 'var(--ink)', grow = 1.14, dur = 220, from = .45, box = false, shape = null } = {}){
    if (!host || Motion.off) return;
    const s = document.createElement('i');
    s.className = 'inkbleed' + (box ? ' inkbleed--box' : '') + (shape ? ' inkbleed--shape' : '');
    s.setAttribute('aria-hidden', 'true');
    s.style.color = color;
    if (shape) s.innerHTML = `<svg viewBox="0 0 64 64"><path d="${shape}"/></svg>`;
    host.appendChild(s);
    const gone = () => { try { s.remove(); } catch (_) {} };
    animate(s, { scale:[1, grow], opacity:[from, 0], duration:dur, ease:EASE.INK, onComplete:gone });
    setTimeout(gone, dur + 250);
  },

  /* what was struck answers it: pressed toward its own shadow, and back */
  jolt(el, px = 2){
    if (!el || Motion.off) return;
    animate(el, { translateX:[0, px, 0], translateY:[0, px, 0], '--press':['0px', `${px}px`, '0px'],
      duration:200, ease:EASE.SNAP, onComplete(){ Motion.settle(el); el.style.removeProperty('--press'); } });
  },

  /* a line or a mark coming off the press: uncovered from where it
     starts, the way a roller passes over it */
  print(el, { from = 'left', dur = 220, delay = 0 } = {}){
    if (!el || Motion.off) return;
    /* every side in the same unit, so each one is carried across */
    const shut = { left:'inset(0% 100% 0% 0%)', right:'inset(0% 0% 0% 100%)', top:'inset(0% 0% 100% 0%)', bottom:'inset(100% 0% 0% 0%)' }[from];
    el.style.opacity = '';
    el.style.clipPath = shut;
    const open = () => { el.style.clipPath = ''; };
    animate(el, { clipPath:[shut, 'inset(0% 0% 0% 0%)'], duration:dur, delay, ease:EASE.INK, onComplete:open });
    setTimeout(open, dur + delay + 300);
  },

  /* an SVG line drawn by the pen, start to end, and left as it was */
  draw(line, { dur = 180, delay = 0, ease = EASE.INK } = {}){
    if (!line || Motion.off || typeof createDrawable !== 'function') return;
    const clean = () => { ['pathLength', 'draw', 'stroke-dasharray', 'stroke-dashoffset'].forEach(a => line.removeAttribute(a));
      line.style.strokeDasharray = line.style.strokeDashoffset = line.style.strokeLinecap = ''; };
    /* the line's own stylesheet dashes win over the attributes anime
       writes, so the pen's dashes are carried into its style */
    const mirror = () => { line.style.strokeDasharray = line.getAttribute('stroke-dasharray') || '';
      line.style.strokeDashoffset = line.getAttribute('stroke-dashoffset') || ''; };
    try {
      const [d] = createDrawable(line);
      aset(d, { draw:'0 0' }); mirror();
      animate(d, { draw:['0 0', '0 1'], duration:dur, delay, ease, onUpdate:mirror,
        onComplete:clean });
      setTimeout(clean, dur + delay + 300);
    } catch (_) { clean(); }
  },

  /* a figure replaced: the new one set down hard, as type is */
  snap(el){
    if (!el || Motion.off) return;
    animate(el, { translateY:[-7, 0], scale:[1.1, 1], duration:150, ease:EASE.STRIKE,
      onComplete(){ Motion.settle(el); } });
  },

  /* A blade the height `H`, leaning `angle` degrees: a crimson hairline
     on its cutting edge, the ink body behind it, a screentone trail
     behind that, fading out. `dir` > 0 cuts leftward (its edge on its
     left), < 0 rightward. Its cutting edge runs from `foot` (at the
     bottom) to `foot + lean` (at the top), measured from its left. */
  blade(H, dir, { angle = 10, body = 22, trail = 140, edge = 2 } = {}){
    const off = Math.round(Math.tan(angle * Math.PI / 180) * H);
    const W = edge + body + trail + off;
    const el = document.createElement('div');
    el.className = 'blade';
    el.setAttribute('aria-hidden', 'true');
    el.style.width = W + 'px';
    const fx = x => dir > 0 ? x : W - x;
    const strip = (cls, x0, x1) => {
      const i = document.createElement('i');
      i.className = cls;
      i.style.cssText = `left:0;width:${W}px;clip-path:polygon(${fx(x0 + off)}px 0, ${fx(x1 + off)}px 0, ${fx(x1)}px 100%, ${fx(x0)}px 100%)`;
      el.appendChild(i);
      return i;
    };
    const t = strip('blade__trail', edge + body, edge + body + trail);
    const fade = `linear-gradient(${dir > 0 ? 90 : 270}deg, #000 ${edge + body}px, transparent ${W}px)`;
    t.style.webkitMaskImage = t.style.maskImage = fade;
    strip('blade__body', edge, edge + body);
    strip('blade__edge', 0, edge);
    return { el, W, off, foot: dir > 0 ? 0 : W, lean: dir > 0 ? off : -off };
  },

  /* THE CUT. A blade crosses the rectangle `f` (fixed coordinates) in
     direction `dir` and takes `sheet` away behind its edge: what is ahead
     of the edge is still the sheet, what is behind it is whatever lies
     under the sheet. The sheet must lie exactly over `f`. A short held
     start and then all at once. Resolves when the blade is through; the
     caller removes the sheet. */
  cut(sheet, f, dir, { dur = 300, angle = 11, body = 22, trail = 150, z = null } = {}){
    const box = document.createElement('div');
    box.className = 'cutbox';
    box.style.cssText = `left:${f.left}px;top:${f.top}px;width:${f.width}px;height:${f.height}px` + (z ? `;z-index:${z}` : '');
    const b = Ink.blade(f.height, dir, { angle, body, trail });
    box.appendChild(b.el);
    document.body.appendChild(box);
    const FW = f.width, BW = b.W;
    const x0 = dir > 0 ? FW : -BW, x1 = dir > 0 ? -BW : FW;
    /* the sheet (laid exactly over `f`) keeps only what is ahead of the
       cutting edge, which runs from (x + foot, bottom) to (x + foot + lean, top) */
    const place = x => {
      b.el.style.transform = `translateX(${x}px)`;
      const top = x + b.foot + b.lean, bottom = x + b.foot;
      sheet.style.clipPath = dir > 0
        ? `polygon(0 0, ${top}px 0, ${bottom}px 100%, 0 100%)`
        : `polygon(${top}px 0, 100% 0, 100% 100%, ${bottom}px 100%)`;
    };
    place(x0);
    return new Promise(res => {
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        try { box.remove(); } catch (_) {}
        sheet.style.clipPath = dir > 0 ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
        res();
      };
      const pos = { x:x0 };
      animate(pos, { x:[x0, x1], duration:dur, ease:EASE.CUT, onUpdate(){ place(pos.x); }, onComplete:finish });
      setTimeout(finish, dur + 250);
    });
  },

  /* a thing set down where it belongs: from a little above, a hair
     past rest, still */
  settle(el, { y = 6, dur = 220 } = {}){
    if (!el || Motion.off) return;
    animate(el, { translateY:[y, 0], duration:dur, ease:EASE.SETTLE, onComplete(){ Motion.settle(el); } });
  },

  /* a word that means no: knocked once, sideways */
  knock(el, px = 5){
    if (!el || Motion.off) return;
    animate(el, { translateX:[0, -px, px * .6, -px * .25, 0], duration:170, ease:'linear',
      onComplete(){ Motion.settle(el); } });
  },
};

const FX = {
  /* a claim strikes the prize's medal the way a stamp strikes the card:
     held over it, brought down, pressed; the burgundy is the ink it
     leaves. The note under it is printed after. */
  claimStamp(row){
    const medal = row && row.querySelector('.tier__medal');
    if (!medal || Motion.off) return;
    const face = medal.querySelector('.tier__face');
    Ink.stamp(medal, { lift:1.22, turn:-8, hold:50, strike:100, settle:190,
      hit(){ Ink.bleed(medal, { color:'var(--seal)', shape: face && face.getAttribute('d'), grow:1.15, dur:280, from:.55 }); } });
    const note = row.querySelector('.tier__note');
    if (note) Ink.print(note, { from:'left', dur:200, delay:240 });
  },

  /* a code read: the seat over the camera swells, the way a stamp is
     brought down; refused, it settles back */
  scanLock(){
    if (Motion.off) return;
    const seat = $('#reticle .reticle__seat');
    if (seat) animate(seat, { scale:[1, 1.12], duration:160, ease:EASE.SNAP });
  },

  scanReject(){
    if (Motion.off) return;
    Ink.knock($('#viewer'), 4);
    const seat = $('#reticle .reticle__seat');
    if (seat) animate(seat, { scale:1, duration:220, ease:EASE.CALM });
  },

  /* The stamp acquired: a sheet over everything, the seal just earned
     struck onto it (the first stamp an account ever earns is held a
     little longer, and leaves crimson), impact lines rushing in to it
     on the hit, its tag stamped, the meeting printed under it. Then
     `lift`: a blade cuts the sheet away over the page under it while
     the seal is carried, on a slight arc, to hang over its seat. */
  stampAcquire(meeting){
    /* the seal just earned, with the glyph it will carry on the card;
       read before the record refreshes, so the count is its ordinal */
    const n = Store.totalStamps();
    const first = n === 0;
    const lift = (32 - 32 * STAMP_FIT).toFixed(1);
    const scene = document.createElement('div');
    scene.className = 'acq' + (first ? ' acq--first' : '');
    /* a paper sheet: the seal just pressed, the record line under it */
    scene.innerHTML = `
      <span class="acq__lines" aria-hidden="true"></span>
      <div class="acq__stack">
        <p class="acq__kick"><span>Stamp acquired</span><span>Nº ${pad(n + 1)}</span></p>
        <div class="acq__seal" aria-hidden="true">
          <svg viewBox="0 0 64 64"><path class="acq__face" d="${stampShape(n + 1, 0)}"/>
            <g class="acq__mark" transform="translate(${lift} ${lift}) scale(${STAMP_FIT})">${stampMark(n)}</g></svg>
        </div>
        <p class="acq__meet"><b>GM ${pad(meeting.no)}</b><span>${fmtDate(meeting.date || Schedule.today())}</span></p>
      </div>`;
    document.body.appendChild(scene);
    const sealEl = scene.querySelector('.acq__seal');
    let fly = null;

    let gone = false;
    const clear = () => {
      if (gone) return; gone = true;
      try { scene.remove(); } catch (_) {}
      try { if (fly) fly.remove(); } catch (_) {}
    };
    const fuse = setTimeout(clear, 8000);

    if (!Motion.off){
      const lines = scene.querySelector('.acq__lines');
      const kick = scene.querySelector('.acq__kick');
      const meet = scene.querySelector('.acq__meet');
      aset(lines, { opacity:0, scale:1.2 });
      aset(kick, { opacity:0 });
      aset(meet, { opacity:0 });
      Ink.stamp(sealEl, { lift: first ? 1.7 : 1.55, turn:-12, hold: first ? 90 : 50, strike:120, settle:220,
        hit(){
          if (gone) return;
          /* the impact: lines rush in to the seal and stop */
          animate(lines, { opacity:[0, .9], scale:[1.2, 1], duration:190, ease:EASE.SNAP });
          Ink.bleed(sealEl, { color: first ? 'var(--crimson)' : 'var(--ink)', shape: stampShape(n + 1, 0),
            grow: first ? 1.16 : 1.1, dur: first ? 340 : 240, from: first ? .7 : .45 });
          setTimeout(() => { if (!gone) Ink.stamp(kick, { lift:1.3, turn:-5, hold:20, strike:80, settle:140 }); }, 50);
          Ink.print(meet, { from:'left', dur:220, delay:110 });
        } });
    }

    return {
      first,
      clear(){ clearTimeout(fuse); clear(); },
      /* the sheet is cut away; the seal is carried to hang over its seat,
         held a little above the card (larger) and turned, so the press
         that follows continues the same movement. Without a seat in view
         the seal goes with the sheet. */
      lift(then, cell = null){
        clearTimeout(fuse);
        let fired = false;
        const done = () => {
          if (fired) return; fired = true;
          clear();
          if (typeof then === 'function') then();
        };
        if (Motion.off || gone){ done(); return; }
        scene.classList.add('acq--lift');
        const svg = cell && cell.querySelector('svg');
        const to = svg ? svg.getBoundingClientRect() : null;
        const vw = document.documentElement.clientWidth, vh = innerHeight;
        const frame = { left:0, top:0, width:vw, height:vh };
        const blade = vw < 600 ? { dur:260, angle:8, body:16, trail:90 } : { dur:320, angle:11, body:24, trail:160 };
        if (sealEl && to && to.width > 8 && to.top > -to.height && to.bottom < vh + to.height){
          /* the seal is taken off the sheet, so the blade does not cut it */
          const from = sealEl.getBoundingClientRect();
          fly = sealEl;
          fly.classList.add('acq__seal--fly');
          fly.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`;
          document.body.appendChild(fly);
          const size = cell.offsetWidth || to.width;
          const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
          const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
          const lean = parseFloat(getComputedStyle(cell).getPropertyValue('--lean')) || 0;
          Ink.cut(scene, frame, 1, { ...blade, z:161 }).then(() => { try { scene.remove(); } catch (_) {} });
          /* carried, not slid: away quickly, the vertical lagging the
             horizontal so the path bows, slowing over the seat */
          animate(fly, {
            translateX:{ to:dx, ease:cubicBezier(.45, 0, .55, 1) },
            translateY:{ to:dy, ease:cubicBezier(.62, 0, .5, 1) },
            scale:{ to:1.5 * size / from.width, ease:cubicBezier(.4, 0, .5, 1) },
            rotate:{ from:0, to:lean - 9, ease:cubicBezier(.4, 0, .5, 1) },
            duration: vw < 600 ? 300 : 340, delay:50, onComplete:done });
          setTimeout(done, 900);
        } else {
          Ink.cut(scene, frame, 1, { ...blade, z:161 }).then(done);
          setTimeout(done, 900);
        }
      },
    };
  },

  /* The Record's year line, the first time it is read: the rule printed
     from the first meeting to today at one pen speed, each meeting's mark
     set down as the line reaches it (a stamp pressed, a missed meeting's
     blank printed), the months and the dotted time ahead after. Half a
     second; once a visit; not at all with motion reduced. */
  yearDrawn: false,
  /* set out as blank paper at once (so the finished line is never seen
     first), then drawn when `go` is called */
  drawYear(){
    const line = $('.view--record .yline');
    if (!line || this.yearDrawn) return () => {};
    this.yearDrawn = true;
    if (Motion.off) return () => {};
    const D = 480;
    const now = (parseFloat(line.style.getPropertyValue('--now')) || 100) / 100;
    const rule = line.querySelector('.yline__rule');
    const late = [...line.querySelectorAll('.yline__ahead, .yline__now')];
    const marks = [...line.querySelectorAll('.yt, .yline__m')];
    if (rule){ rule.style.transformOrigin = '0 50%'; aset(rule, { scaleX:0 }); }
    marks.forEach(el => aset(el, el.classList.contains('yt--set') ? { opacity:0, scale:1.5 } : { opacity:0 }));
    late.forEach(el => aset(el, { opacity:0 }));
    const show = () => [rule, ...marks, ...late].forEach(el => { if (el){ Motion.settle(el); el.style.transformOrigin = ''; } });
    return () => {
      if (!line.isConnected) return;
      if (Motion.off || !rule) return show();
      /* the marks are set down by the pen itself: as the rule passes a
         meeting's date its mark appears, a stamp struck down */
      const todo = marks.map(el => ({ el, x:(parseFloat(el.style.left) || 0) / 100 }))
        .sort((p, q) => p.x - q.x);
      let k = 0;
      const reach = f => {
        while (k < todo.length && todo[k].x <= f * now + .0001){
          const { el } = todo[k++];
          Motion.settle(el);
          if (el.classList.contains('yt--set')) animate(el, { scale:[1.5, 1], duration:90, ease:EASE.STRIKE,
            onComplete(){ Motion.settle(el); } });
        }
      };
      animate(rule, { scaleX:[0, 1], duration:D, ease:'linear',
        onUpdate(a){ reach(a.progress); },
        onComplete(){ reach(1); Motion.settle(rule); rule.style.transformOrigin = '';
          setTimeout(() => { todo.forEach(t => Motion.settle(t.el)); late.forEach(el => Motion.settle(el)); }, 60); } });
      /* whatever a busy frame dropped, the line ends finished */
      setTimeout(show, D + 400);
    };
  },

  /* A stamp into its seat. The seat is already printed on the card; the
     impression comes down onto it: held over the seat a moment, struck
     faster and faster, pressed a hair below its size, set. On the hit
     the ink spreads a little into the stock, the card gives under it,
     the route has just reached the seat, and the newest-stamp ring is
     wet (crimson) for a moment and dries to ink. A stamp that fills the
     card is followed by the card's own rubber stamp. */
  stampLand(cell, { lift = 1.5, first = false, hold = 50 } = {}){
    if (!cell) return;
    const press = cell.querySelector('.sf-press');
    const card = cell.closest('.card');
    const end = () => { cell.classList.remove('seal--landing', 'seal--wet'); cell.style.opacity = '';
      if (card) card.classList.remove('card--landing'); };
    if (Motion.off || !press){ end(); return; }
    const mile = cell.classList.contains('seal--mile');
    const i = [...cell.parentElement.children].indexOf(cell);
    const route = card && [...card.querySelectorAll('.card__route')].find(r => getComputedStyle(r).display !== 'none');
    const seg = route && i > 0 ? route.querySelectorAll('.card__seg')[i - 1] : null;
    cell.style.opacity = '';
    cell.classList.add('seal--landing');
    /* the route arrives as the stamp does */
    Ink.draw(seg, { dur:first ? 190 : 150, ease:'outQuad' });
    Ink.stamp(press, { lift, turn:-9, hold: first ? hold + 50 : hold, strike:100, settle:170,
      hit(){
        /* the impression now covers its seat, and the ring is wet */
        cell.classList.remove('seal--landing');
        cell.classList.add('seal--wet');
        const face = cell.querySelector('.sf-face');
        Ink.bleed(cell, { color: mile ? 'var(--seal)' : 'var(--ink)', shape: face && face.getAttribute('d'),
          grow: first ? 1.2 : 1.13, dur: first ? 300 : 220 });
        Ink.jolt(card, 2);
        Ink.snap(card && card.querySelector('.card__num b'));
        /* the wet ring dries */
        setTimeout(() => cell.classList.remove('seal--wet'), 90);
        const done = card && card.querySelector('.card__done');
        if (done) setTimeout(() => FX.cardStruck(card), 150);
        else if (card) card.classList.remove('card--landing');
      },
      done(){ cell.classList.remove('seal--landing'); } });
    setTimeout(end, 1400);
  },

  /* the card's rubber stamp, struck across a card the last stamp filled:
     the prize it unlocks is then printed into the stub */
  cardStruck(card){
    const done = card && card.querySelector('.card__done');
    if (!done || Motion.off){ if (card) card.classList.remove('card--landing'); return; }
    aset(done, { opacity:0 });
    const go = card.querySelector('.card__goal--go, .card__goal--done');
    if (go) go.style.clipPath = 'inset(0% 100% 0% 0%)';
    card.classList.remove('card--landing');
    Ink.stamp(done, { lift:1.3, turn:-5, hold:60, strike:110, settle:190,
      hit(){ Ink.bleed(done, { color:'currentColor', grow:1.06, dur:260, from:.25, box:true }); Ink.jolt(card, 3); } });
    if (go) Ink.print(go, { from:'left', dur:240, delay:300 });
  },

  /* the meeting's state on the desk, struck like a rubber stamp when
     it changes (the code, when check-in opens, is printed as it is
     drawn: paintBoard) */
  boardSeal(){
    const word = $('.proj__word');
    if (!word || Motion.off) return;
    aset(word, { opacity:0 });
    Ink.stamp(word, { lift:1.22, turn:-5, hold:40, strike:90, settle:170,
      hit(){ Ink.bleed(word, { color:'currentColor', grow:1.06, dur:240, from:.22, box:true }); } });
  }
};
