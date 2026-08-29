"use strict";
/* keystamp — the FX choreography layer and the named sequences
   Loaded in order by index.html. Order matters. */

/* The entrance's whole timing vocabulary, in one place and in
   milliseconds, because every value in it is a cut rather than a curve
   and the only thing left to tune is when each cut happens. */
const MECH = {
  CUT:  1,     /* a panel does not fade in; it is there            */
  LEAD: 40,    /* before the first panel lands                     */
  GAP:  46,    /* between panels — flat, not eased                 */
  BEAT: 90,    /* frame lands, then the type follows               */
  SLAM: 130,   /* the drive itself                                 */
};

/* anime v4 dropped the STRING form of ease. A quoted steps() is not an
   error — it warns and falls back to linear, which is what a frame
   trace of the entrance caught it doing: the type glided down
   -14 to -11.9 to -8.3 to -4.7 to 0 instead of dropping in three cuts.
   The factory is the only form that binds — and it is a TOP-LEVEL
   export, not a member of the eases table, which is the second way to
   write this and get the same silent fallback. Guarded because these
   tables are evaluated at load and anime may not be there at all. */
const STEP = n => (typeof steps === 'function' ? steps(n) : undefined);

const SLAM_SEL = '.title,.spread__wm,.count__num b,.tally__fig,'
               + '.ladder__fig,.standing-band__fig,.who__name,'
               + '.proj__no,.bnow__no';

const EASE = {
  CUT:    cubicBezier(.03,.9,.1,1),      /* near-instant travel */
  ENERGY: cubicBezier(.4,0,.2,1),
  IMPACT: cubicBezier(.34,1.56,.5,1),
  CALM:   cubicBezier(.22,.61,.36,1),
  OUT:    'outQuart',
};

/* irregular razor tears — uneven thickness, no two alike */
const TEARS = [
  'M0 20C150 12 330 7 520 15 720 23 880 15 1000 20 880 25 720 32 520 25 330 33 150 28 0 20Z',
  'M0 20C190 17 330 9 570 12 780 14 910 18 1000 20 910 23 780 29 570 28 330 31 190 24 0 20Z',
  'M0 20C120 10 300 25 480 10 690 3 870 17 1000 20 870 26 690 13 480 28 300 37 120 30 0 20Z',
  'M0 20C160 15 280 5 460 14 660 24 850 11 1000 20 850 28 660 20 460 27 280 34 160 25 0 20Z',
];

let cutSeq = 0;
const roll = i => (i * 2.399) % 1;            /* deterministic scatter */

const Slash = {
  TYPE: {
    A: { th:7,  op:.6,  grad:'cutThin',  travel:60, fade:110, shards:0,  scrim:0,   push:0 },
    B: { th:30, op:1,   grad:'cutHeavy', travel:82, fade:160, shards:11, scrim:.38, push:4 },
    C: { th:22, op:.95, grad:'cutHeavy', travel:74, fade:150, shards:8,  scrim:.3,  push:3 },
    D: { th:13, op:.75, grad:'cutThin',  travel:54, fade:105, shards:4,  scrim:.14, push:1.4 },
    E: { th:18, op:.4,  grad:'cutGhost', travel:110,fade:200, shards:0,  scrim:0,   push:0 },
  },

  create({ type = 'B', angle = -22, offset = 0, along = 0, length = null, host = null,
           delay = 0, afterimage = true, hot = true } = {}){
    if (Motion.off) return;
    const parent = host || $('#fx');
    if (!parent) return;
    if (!host && $$('#fx .slash').length > 8) return;     /* hard cap */

    const P = this.TYPE[type] || this.TYPE.B;
    const seq = ++cutSeq;
    const len = length || (host ? Math.max(host.offsetWidth, host.offsetHeight) * 2.2 : null);
    const w = len ? len + 'px' : '180vmax';
    const h = P.th;

    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('class', 'slash');
    el.setAttribute('viewBox', '0 0 1000 40');
    el.setAttribute('preserveAspectRatio', 'none');
    el.style.cssText = `width:${w};height:${h}px;margin-left:calc(${w} / -2);margin-top:${-h/2}px`;

    const tear = TEARS[seq % TEARS.length];
    el.innerHTML =
      `<path d="${tear}" fill="url(#${P.grad})"/>` +
      /* the lit side, offset a hair so the blade has an edge and a body */
      `<path d="${tear}" fill="url(#cutGhost)" opacity=".55" transform="translate(0,-3)"/>` +
      /* Fragments riding the cut. These were black-on-black inside the
         blade and invisible; on an ink cut over paper the fragments
         that read are the ones the blade MISSES — bare paper punched
         out of the stroke, which is how a break is drawn. */
      (type !== 'E' && type !== 'A'
        ? `<rect x="${180 + (seq % 4) * 90}" y="15" width="${18 + (seq % 3) * 9}" height="11" fill="var(--paper, #F7F7F5)"/>
           <rect x="${430 + (seq % 5) * 70}" y="14" width="${11 + (seq % 2) * 8}" height="13" fill="var(--paper, #F7F7F5)"/>` : '') +
      (hot && type !== 'E'
        ? `<rect x="${640 + (seq % 5) * 20}" y="15" width="${30 + (seq % 3) * 14}" height="11"
                 fill="var(--paper, #F7F7F5)"/>` : '');

    parent.appendChild(el);

    /* load · travel past full length · snap back · gone */
    aset(el, { rotate:angle, translateY:offset, translateX:along, scaleX:.012, scaleY:1, opacity:P.op });
    createTimeline({ onComplete:() => el.remove() })
      .add(el, { scaleX:[.012, .05], duration:26, delay, ease:'linear' })
      .add(el, { scaleX:[.05, 1.14], duration:P.travel, ease:EASE.CUT })
      .add(el, { scaleX:[1.14, 1], duration:38, ease:EASE.OUT })
      .add(el, { scaleY:[1, .08], opacity:[P.op, 0], duration:P.fade, ease:EASE.OUT });

    const lands = delay + 26 + P.travel;
    if (P.scrim) Impact.scrim(P.scrim, { delay, host });
    if (P.push)   setTimeout(() => Impact.push(host || $('#view'), P.push, angle), lands);
    if (P.shards) setTimeout(() => Impact.shards(host || $('#fx'), P.shards, angle), lands);
    if (afterimage && type !== 'E')
      setTimeout(() => this.create({ type:'E', angle:angle + (seq % 2 ? 1.8 : -1.8),
                                     offset:offset + 4, host, afterimage:false, hot:false }), lands + 22);
  },

  /* two cuts crossing inside 50ms */
  cross({ angle = -26, host = null, delay = 0 } = {}){
    this.create({ type:'C', angle, host, delay });
    this.create({ type:'C', angle:angle + 76, host, delay:delay + 50, offset:-16 });
  },

};

/* ══ CUT GEOMETRY ════════════════════════════════════════════════════
   The two ceremony cuts (welcome, boot) are real LINES in viewport
   space: the blade is drawn along the line and the seam opens where
   it crosses — cause, then consequence, on the same geometry. */
const CutGeo = {
  /* a cut line through (x,y) at deg: unit direction d, unit normal n */
  line(x, y, deg){
    const r = deg * Math.PI / 180;
    return { x, y, dx:Math.cos(r), dy:Math.sin(r),
             nx:-Math.sin(r), ny:Math.cos(r), deg };
  },
};

/* ══ THE BLADE ═══════════════════════════════════════════════════════
   Not a bar and not a capsule: a tapered, slightly irregular sliver —
   pointed ends, widest at the impact region, with a razor core of the
   opposite value — drawn ALONG a cut line and swept from one end so it
   visibly crosses the geometry it is about to divide. strike() returns
   the ms (from call time) at which the tip crosses the line's anchor,
   so the consequence of the cut can be scheduled at contact. */
let bladeSeq = 0;
const Blade = {
  svg(seed){
    const j = k => (Math.sin(seed * 12.9898 + k * 78.233) * .5 + .5);
    const X = [0, 90, 260, 430, 600, 800, 1000];
    /* half-thickness envelope: nothing at the tips, widest past the
       middle — the leading tip stays needle-thin far longer */
    const env = x => x <= 0 || x >= 1000 ? 0
      : Math.pow(Math.sin(Math.PI * Math.pow(x / 1000, .72)), 1.25) * 28;
    const bow = (j(6) - .5) * 10;
    const yAt = x => 30 + bow * Math.sin(Math.PI * x / 1000);
    const h = (x, k) => Math.max(0, env(x) * (1 + (j(k) - .5) * .6));
    const top = X.map((x, i) => `${x},${(yAt(x) - h(x, i + 1)).toFixed(1)}`).join(' ');
    const bot = X.slice().reverse().map((x, i) => `${x},${(yAt(x) + h(x, i + 40)).toFixed(1)}`).join(' ');
    const core = [[140, 1], [420, 2.6 + j(7) * 1.4], [700, 2 + j(8)], [900, .8]];
    const ctop = core.map(([x, ch]) => `${x},${(yAt(x) - 1.6 - ch).toFixed(1)}`).join(' ');
    const cbot = core.slice().reverse().map(([x, ch]) => `${x},${(yAt(x) - 1.6 + ch).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true">
      <polygon class="b-body" points="${top} ${bot}"/>
      <polygon class="b-core" points="${ctop} ${cbot}"/></svg>`;
  },

  strike({ line, th = 18, paper = false, host = null,
           delay = 0, sweep = 75, hold = 130, len = null } = {}){
    if (Motion.off) return delay;
    const parent = host || $('#fx');
    if (!parent) return delay;
    const seq = ++bladeSeq;
    const L = len || Math.hypot(innerWidth, innerHeight) * 1.6;
    /* wrapper rotates about its centre so the stroke lies exactly on
       the cut line; the inner layer sweeps from the entry tip */
    const el = document.createElement('i');
    el.className = 'blade2' + (paper ? ' blade2--paper' : '');
    el.style.cssText = `left:${line.x}px;top:${line.y}px;width:${L}px;height:${th * 2}px;` +
      `margin:${-th}px 0 0 ${-L / 2}px`;
    el.innerHTML = `<span class="blade2__s">${this.svg(seq)}</span>`;
    parent.appendChild(el);
    const s = el.firstChild;
    aset(el, { rotate:line.deg });
    /* the stroke does not exist visually until its sweep begins — a
       parked pre-sweep sliver is a slash with no cause */
    aset(s, { scaleX:.05, opacity:0 });
    setTimeout(() => aset(s, { opacity:1 }), delay);
    createTimeline({ onComplete:() => el.remove() })
      .add(s, { scaleX:[.05, 1], duration:sweep, delay, ease:'inQuad' })
      .add(s, { scaleX:1, duration:hold })
      .add(s, { scaleY:[1, .05], opacity:[1, 0], duration:70, ease:'inQuad' });
    /* tip position under inQuad: f = (t/T)^2 → anchor (f=.5) at .71 T */
    return delay + sweep * .71;
  },
};

const Impact = {
  /* the anticipation beat: everything dips before the cut lands */
  scrim(peak, { delay = 0, host = null, dur = 180 } = {}){
    if (Motion.off) return;
    const el = host ? this.plate(host, 'scrim') : $('#scrim');
    if (!el) return;
    animate(el, { opacity:[0, peak, 0], duration:dur, delay, ease:'outQuad',
            onComplete:() => { if (host) el.remove(); } });
  },

  /* one frame of blown-out contrast. Capped well below white and never
     repeated at a rate that could read as a strobe. */
  flash(peak = .3, { delay = 0, host = null, dur = 52 } = {}){
    if (Motion.off) return;
    const el = host ? this.plate(host, 'flash') : $('#flash');
    if (!el) return;
    animate(el, { opacity:[0, peak, 0], duration:dur, delay, ease:'linear',
            onComplete:() => { if (host) el.remove(); } });
  },

  plate(host, cls){
    const el = document.createElement('span');
    el.className = cls;
    host.appendChild(el);
    return el;
  },

  /* the impact blink: paper at FULL value for a couple of frames, then
     gone. Binary on purpose — a ramped flash spends most of its frames
     as gray, which is the one value this system does not have. */
  pop(host, dur = 45){
    if (Motion.off) return;
    const el = host ? this.plate(host, 'flash') : $('#flash');
    if (!el) return;
    aset(el, { opacity:.92 });
    setTimeout(() => { aset(el, { opacity:0 }); if (host) el.remove(); }, dur);
  },

  /* a few px perpendicular to the blade, then settle */
  push(el, px, angle){
    if (!el || Motion.off) return;
    const rad = (angle + 90) * Math.PI / 180;
    animate(el, { translateX:[0, Math.cos(rad) * px, 0], translateY:[0, Math.sin(rad) * px, 0],
      duration:140, ease:EASE.CUT, onComplete(){ Motion.settle(el); } });
  },

  /* the frame itself takes the hit */
  shake(el, px = 5, dur = 110){
    if (!el || Motion.off) return;
    animate(el, { translateX:[0, -px, px * .7, -px * .35, 0],
      translateY:[0, px * .5, -px * .4, px * .2, 0],
      duration:dur, ease:'linear', onComplete(){ Motion.settle(el); } });
  },

  shards(host, count, angle){
    if (!host || Motion.off) return;
    const rad = angle * Math.PI / 180;
    for (let i = 0; i < count; i++){
      const el = document.createElement('span');
      const r = roll(i);
      el.className = 'shard' + (r > .8 ? ' shard--hot' : r > .3 ? ' shard--dark' : '');
      host.appendChild(el);
      const side = i % 2 ? 1 : -1;
      const perp = rad + Math.PI / 2 + (r - .5) * 1.2;
      const dist = 30 + r * 86;
      animate(el, { translateX:[Math.cos(rad) * (r - .5) * 220, Math.cos(perp) * dist * side],
        translateY:[Math.sin(rad) * (r - .5) * 220, Math.sin(perp) * dist * side],
        rotate:[angle, angle + side * (50 + r * 130)],
        scaleX:[1.3, .25],
        opacity:[{ value:.95, duration:34 }, { value:0, duration:300 }],
        duration:340, delay:i * 9, ease:EASE.OUT, onComplete:() => el.remove() });
    }
  },

  sparks(host, { count = 9, spread = 56, delay = 0 } = {}){
    if (Motion.off || !host) return;
    for (let i = 0; i < count; i++){
      const el = document.createElement('span');
      const r = roll(i);
      el.className = 'spark' + (r > .82 ? ' spark--hot' : '');
      host.appendChild(el);
      const a = r * Math.PI * 2, d = spread * (.45 + r * .85);
      animate(el, { translateX:[0, Math.cos(a) * d], translateY:[0, Math.sin(a) * d],
        scale:[{ value:1.5, duration:60 }, { value:0, duration:280 }],
        opacity:[{ value:1, duration:40 }, { value:0, duration:300 }],
        duration:350, delay:delay + i * 8, ease:EASE.OUT, onComplete:() => el.remove() });
    }
  },

  ring(host, { size = 150, scale = 3.2, delay = 0, dur = 700 } = {}){
    if (Motion.off) return;
    const parent = host || $('#fx');
    if (!parent) return;
    const el = document.createElement('span');
    el.className = 'shockring';
    el.style.cssText = `width:${size}px;height:${size}px;margin:${-size/2}px 0 0 ${-size/2}px`;
    parent.appendChild(el);
    animate(el, { scale:[.25, scale], opacity:[.6, 0], duration:dur, delay,
            ease:EASE.OUT, onComplete:() => el.remove() });
  },
};

/* ── speed lines: thin strokes racing out of a focal point ── */
const Lines = {
  burst({ x = null, y = null, count = 30, host = null,
          reach = 340, delay = 0, hot = false, dur = 300 } = {}){
    if (Motion.off) return;
    const parent = host || $('#fx');
    if (!parent) return;
    const box = document.createElement('div');
    box.className = 'lines';
    const b = parent.getBoundingClientRect();
    const fx = x == null ? b.left + b.width / 2 : x;
    const fy = y == null ? b.top + b.height / 2 : y;
    box.style.transform = `translate(${fx - b.left}px,${fy - b.top}px)`;
    parent.appendChild(box);

    const frag = document.createDocumentFragment();
    const els = [];
    for (let i = 0; i < count; i++){
      const r = roll(i);
      const el = document.createElement('i');
      /* mostly grey and bone; the lightest value only when the moment earns it */
      el.className = hot && r > .88 ? 'r' : r > .55 ? 'd' : '';
      const a = (i / count) * 360 + r * 14;
      const start = 26 + r * 70;
      el.style.width = (40 + r * 190) + 'px';
      el.style.height = (r > .7 ? 2 : 1) + 'px';
      el.dataset.a = a; el.dataset.s = start;
      frag.appendChild(el); els.push(el);
    }
    box.appendChild(frag);

    els.forEach((el, i) => {
      const r = roll(i);
      aset(el, { rotate:+el.dataset.a, translateX:+el.dataset.s, scaleX:.2 });
      animate(el, { translateX:+el.dataset.s + reach * (.55 + r * .75),
        scaleX:[.2, 1, .5],
        opacity:[{ value:.9, duration:dur * .22 }, { value:0, duration:dur * .78 }],
        duration:dur, delay:delay + i * 3, ease:EASE.CUT });
    });

    setTimeout(() => box.remove(), delay + dur + count * 3 + 60);
  },
};

/* ── the structure that forms behind the biggest moments ── */
/* THE FIELD BEHIND THE IMPACT: the traced seal at screen height and
   low value. Traced artwork scales the way a logo should, so the mark
   behind the impact is simply the mark, enormous and quiet. */
const fieldSVG = () =>
  `<svg class="verdict__field" id="verdictField" viewBox="0 0 100 100" aria-hidden="true">${seal(4)}</svg>`;

const Ambient = {
  /* silence: pull the environment down so the impact lands in a quiet room */
  hush(ms = 900){
    if (Motion.off) return;
    const layers = [$('.ground'), $('#arena')].filter(Boolean);
    animate(layers, { opacity:[1, .08], duration:150, ease:'outQuad' });
    setTimeout(() => animate(layers, { opacity:[.08, 1], duration:600, ease:EASE.CALM }), ms);
  },
  /* the environment leans in during an important interaction */
  surge(ms = 700){
    if (Motion.off) return;
    const a = $('#arena svg');
    if (!a) return;
    animate(a, { opacity:[.34, .74, .34], scale:[1, 1.04, 1], duration:ms, ease:EASE.ENERGY });
  },
};

/* ══════════════════════════════════════════════════════════════════
   10. THE NAMED SEQUENCES
   These are the only things the app calls. Each one is a timeline over
   the primitives above, with the beats spaced so a sound cue could sit
   on any of them: load · cut · silence · impact · settle.
   ══════════════════════════════════════════════════════════════════ */
const FX = {

  /* one frame of violence: dark · blown contrast · a word · a cut · shake */
  impactFrame({ word = '', angle = -20, host = null, hot = true } = {}){
    if (Motion.off) return;
    const parent = host || $('#fx');
    if (!parent) return;

    Impact.scrim(.78, { host, dur:230 });
    Impact.flash(.3, { delay:30, host, dur:50 });

    if (word){
      const el = document.createElement('div');
      el.className = 'frameword' + (hot ? '' : ' frameword--k');
      el.textContent = word;
      parent.appendChild(el);
      createTimeline({ onComplete:() => el.remove() })
        .add(el, { opacity:[0, 1], scale:[1.34, 1], skewX:[-9, 0],
               duration:110, ease:EASE.CUT }, 44)
        .add(el, { scale:[1, 1.05], opacity:[1, 0], duration:80, ease:'inQuad' }, 210);

    }

    Slash.create({ type:'B', angle, host, delay:52 });
    Lines.burst({ count:26, reach:300, delay:70, host, hot });
    setTimeout(() => Impact.shake($('#shell'), 6, 120), 78);
  },

  /* dark energy leaving a surface — smoke first, one bright tick last */
  energyBurst(host, { count = 8, spread = 44, delay = 0 } = {}){
    if (Motion.off || !host) return;
    const flare = document.createElement('span');
    flare.className = 'wellflare';
    host.appendChild(flare);
    animate(flare, { scale:[.35, 2.1], opacity:[0, .7, 0], duration:620,
            delay, ease:EASE.OUT, onComplete:() => flare.remove() });
    Impact.sparks(host, { count, spread, delay:delay + 40 });
    Impact.ring(host, { size:46, scale:2.6, delay:delay + 50, dur:620 });
  },

  /* strokes draw themselves in, then the mark locks into place */
  sealReveal(svg, { delay = 0, dur = 420, spin = -14 } = {}){
    if (!svg) return;
    const strokes = svg.querySelectorAll('path,circle,polygon,line');
    if (Motion.off || !strokes.length) return;
    aset(strokes, { opacity:1 });
    animate(createDrawable(strokes), { draw:['0 0', '0 1'],
            duration:dur, delay:stagger(9, { start:delay }), ease:EASE.OUT });
    animate(svg, { rotate:[spin, 0], scale:[.82, 1], duration:dur + 140,
            delay, ease:EASE.ENERGY, onComplete(){ releaseTransform(svg); } });
  },

  /* NORMAL NAVIGATION — a quiet page turn, nothing else. The whole
     view leaves as ONE composition (a short upward drift while it
     fades), the paper ground holds for a breath, and the next page
     eases up into place. No overlays, no snapshots, no per-element
     motion: the view container is the only thing that moves, so a
     navigation can never strand a layer. ~470ms end to end. */
  pageFlow(swap){
    const doSwap = typeof swap === 'function' ? swap : () => {};
    const view = $('#view');
    if (Motion.off || !view){ doSwap(); return Promise.resolve(); }

    const OUT = 170, BREATH = 50, IN = 250;
    return new Promise(res => {
      let settled = false;
      const finish = () => {
        if (settled) return; settled = true;
        Motion.settle(view);
        aset(view, { opacity:1, translateY:0 });
        res();
      };
      animate(view, { opacity:[1, 0], translateY:[0, -8],
                      duration:OUT, ease:'outQuad' });
      setTimeout(() => {
        try { doSwap(); } catch (_) {}
        aset(view, { opacity:0, translateY:10 });
        animate(view, { opacity:[0, 1], translateY:[10, 0],
                        duration:IN, ease:'outCubic',
                        onComplete:finish });
      }, OUT + BREATH);
      /* hard safety: the view can never be left faded out */
      setTimeout(finish, OUT + BREATH + IN + 160);
    });
  },

  /* the welcome. The word exists as ONE piece — one element, one
     paint — until the blade's tip reaches it. The split halves are in
     the DOM but display:none; at the blade's contact moment the whole
     is swapped for the halves in a single tick (pixel-identical at
     that instant), and only THEN do they shear apart. The viewer sees:
     word lands intact → settles → blade crosses it → it divides along
     the cut → background cuts → the halves fall away. ~1.45s. */
  welcomeCut(word = 'Welcome'){
    if (Motion.off) return;
    const fx = $('#fx'); if (!fx) return;

    const panel = `<div class="wcut__panel"><span class="wcut__word">${esc(word)}</span></div>`;
    const el = document.createElement('div');
    el.className = 'wcut';
    el.innerHTML =
      `<div class="wcut__whole">${panel}</div>` +
      `<div class="wcut__h wcut__h--a" style="display:none">${panel}</div>` +
      `<div class="wcut__h wcut__h--b" style="display:none">${panel}</div>`;
    fx.appendChild(el);
    const whole = el.querySelector('.wcut__whole');
    const a = el.querySelector('.wcut__h--a'), b = el.querySelector('.wcut__h--b');
    const wordEl = whole.querySelector('.wcut__word');   /* the ONLY animated copy */

    const W = innerWidth, H = innerHeight;
    /* the cut line the half clip-paths draw: 62% → 38% of the height */
    const seamDeg = -Math.atan2(H * .24, W) * 180 / Math.PI;
    const seamL = CutGeo.line(W * .5, H * .5, seamDeg);
    const pxv = seamL.nx, pyv = seamL.ny;
    const D = Math.hypot(W, H);

    /* 1 · the card slams on and the word lands INTACT. Opacity is
       binary — the word is either not there or fully there — so no
       frame of it ever reads gray. */
    animate(whole, { scale:[1.04, 1], duration:70, ease:STEP(2) });
    aset(wordEl, { scale:1.4, opacity:0 });
    setTimeout(() => {
      aset(wordEl, { opacity:1 });
      animate(wordEl, { scale:[1.4, 1], duration:120, ease:STEP(3) });
    }, 70);
    setTimeout(() => Impact.shake(el, 6, 100), 180);
    /* 2 · settle: the word breathes, whole and readable */
    animate(wordEl, { scale:[1, 1.01], duration:330, delay:320, ease:'inOutSine' });

    /* 3 · the blade crosses the word; the cut happens AT contact */
    const contact = Blade.strike({ line:seamL, paper:true, th:14, host:el,
                                   delay:650, sweep:70, hold:180 });
    setTimeout(() => {
      /* one tick: whole out, halves in — identical pixels — then shear */
      whole.style.display = 'none';
      a.style.display = ''; b.style.display = '';
      animate(a, { translateX:[0, -pxv * 4.5], translateY:[0, -pyv * 4.5],
                   duration:60, ease:STEP(2) });
      animate(b, { translateX:[0,  pxv * 4.5], translateY:[0,  pyv * 4.5],
                   duration:60, ease:STEP(2) });
      Impact.pop(el);
      Impact.shake(el, 6, 90);
    }, contact);

    /* 4 · the scene itself is being cut: varied background strokes */
    Blade.strike({ line:CutGeo.line(W * .3, H * .3, seamDeg - 42), paper:true,
                   th:7, host:el, delay:790, sweep:60, hold:90, len:D * .9 });
    Blade.strike({ line:CutGeo.line(W * .72, H * .68, seamDeg + 34), paper:true,
                   th:9, host:el, delay:860, sweep:65, hold:100, len:D * 1.3 });
    Blade.strike({ line:CutGeo.line(W * .82, H * .35, 78), paper:true,
                   th:5, host:el, delay:930, sweep:55, hold:80, len:D * .6 });

    /* 5 · the halves fall away along the cut and reveal the page */
    animate(a, { translateX:[-pxv * 4.5, -pxv * D * .85],
                 translateY:[-pyv * 4.5, -pyv * D * .85],
                 rotate:-1.4, duration:350, delay:1040, ease:'inQuad' });
    animate(b, { translateX:[ pxv * 4.5,  pxv * D * .85],
                 translateY:[ pyv * 4.5,  pyv * D * .85],
                 rotate:1.4, duration:350, delay:1040, ease:'inQuad' });
    setTimeout(() => el.remove(), 1450);
  },
  /* SIGN-OUT SCENE — a manga page built as a WAFFLE GRID, not a page
     transition. The application is simply COVERED by a dedicated
     full-viewport scene that owns the story:

       the scene stands on clean paper — a grid of manga panels stamps
       onto it in one diagonal wave (varied panel widths, a few ink
       panels, a few screentone panels, two wide spans) — the page
       stands for a beat — the same wave dismantles it: paper panels
       snap shut toward their frame edge, ink panels slide off toward
       their side — clean light space — the sign-in page is there.

     No slash, no words: the grid IS the composition. The app under
     the scene never moves; the real sign-out runs invisibly behind
     it. ~0.9s. A repeat press during the scene is ignored. */
  waffleOut({ swap, fail, btn = null } = {}){
    const doSwap = typeof swap === 'function' ? swap : () => {};
    const oops   = typeof fail === 'function' ? fail : () => {};
    if (FX._out) return;                     /* one scene at a time */
    FX._out = true;
    let ended = false;
    const unlock = () => { FX._out = false; };

    if (btn && !Motion.off){
      aset(btn, { scale:.94 });
      setTimeout(() => { animate(btn, { scale:1, duration:110,
        ease:'outQuad', onComplete(){ btn.style.transform = ''; } }); }, 90);
    }

    /* ── the grid, from the live viewport: fewer, larger panels on a
       phone; a richer page on a desktop ── */
    const W = innerWidth, H = innerHeight;
    const cols = W < 600 ? 3 : W < 1024 ? 4 : 5;
    const rows = H < 460 ? 2 : H < 700 ? 3 : W < 600 ? 4 : 3;
    const frs = n => Array.from({ length:n },
      (_, i) => [1.12, .88, 1.06, .92, 1.02][i % 5].toFixed(2) + 'fr').join(' ');

    /* two wide panels give the grid a manga layout's rhythm; every
       other slot is a single cell. Variants are a fixed, balanced
       pattern — ink, screentone, paper — never random noise. */
    const spans = rows > 1
      ? [[0, Math.min(1, cols - 2)], [rows - 1, Math.max(0, cols - 3)]] : [];
    const spanAt = (r, c) => spans.find(s => s[0] === r && s[1] === c);
    const covered = (r, c) => spans.some(s => s[0] === r && c === s[1] + 1);

    const scene = document.createElement('div');
    scene.className = 'soscene';
    scene.style.gridTemplateColumns = frs(cols);
    scene.style.gridTemplateRows = frs(rows);
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++){
      if (covered(r, c)) continue;
      const span = spanAt(r, c) ? 2 : 1;
      const v = span === 2 ? (r === 0 ? 'ink' : 'tone')
        : (r * 3 + c * 2) % 7 === 1 ? 'ink'
        : (r * 3 + c * 2) % 7 === 4 ? 'tone' : '';
      const el = document.createElement('div');
      /* the variant class is withheld here and applied by the ink wave
         below — a cell is born as an empty pencilled frame */
      el.className = 'soscene__cell';
      el.style.gridRow = String(r + 1);
      el.style.gridColumn = `${c + 1}${span === 2 ? ' / span 2' : ''}`;
      scene.appendChild(el);
      cells.push({ el, d:r + c, v,
                   dx:(c + span / 2 < cols / 2 ? -1 : 1) * 10,
                   dy:r % 2 ? 8 : -8 });
    }
    document.body.appendChild(scene);

    /* the app is covered; the real sign-out happens under the scene */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      Promise.resolve().then(doSwap).catch(oops);
    }));

    const gone = () => { if (ended) return; ended = true;
      try { scene.remove(); } catch (_) {} unlock(); };

    /* reduced motion: the scene still owns the moment, but the page
       simply appears, holds, and clears — no panel movement at all */
    if (Motion.off){
      scene.style.opacity = '0';
      scene.style.transition = 'opacity 180ms ease';
      requestAnimationFrame(() => { scene.style.opacity = '1'; });
      setTimeout(() => { scene.style.opacity = '0'; }, 620);
      setTimeout(gone, 900);
      return;
    }

    /* ── ACT I · PENCILS — the empty frames cut onto the page in one
       diagonal wave, each arriving from its own edge. No fills yet:
       a page is ruled before it is drawn. ── */
    cells.forEach(cell => {
      aset(cell.el, { opacity:0, translateX:cell.dx, translateY:cell.dy });
      animate(cell.el, { opacity:[0, 1],
        translateX:[cell.dx, 0], translateY:[cell.dy, 0],
        duration:120, delay:30 + cell.d * 20, ease:'outQuad' });
    });

    /* ── ACT II · INKS — a second, faster wave races the same
       diagonal and fills every frame in a hard cut: the blacks land,
       the screentone lands, and the ruled page is suddenly a finished
       spread. The kick when the wave completes is the press meeting
       the paper. ── */
    const maxD = Math.max(...cells.map(c => c.d));
    const INK = 90 + maxD * 20 + 140;       /* just after the last frame */
    cells.forEach(cell => {
      if (!cell.v) return;                  /* paper panels stay paper */
      setTimeout(() => cell.el.classList.add(`soscene__cell--${cell.v}`),
        INK + cell.d * 14);
    });
    setTimeout(() => Impact.shake(scene, 3, 90), INK + maxD * 14);

    /* ── ACT III · THE PAGE TURNS — the finished sheet is swept off
       right-to-left, the way a manga page actually turns. One motion,
       one reveal: the sign-in page is already standing beneath it and
       nothing is left floating over it. ── */
    const TURN = INK + maxD * 14 + 220;
    scene.style.transformOrigin = '0% 100%';
    /* pixels, not '-118%': anime measures a percent transform by
       cloning the element into the body for a frame, and this element
       is the full-screen scene. The scene is inset:0, so the viewport
       width already IS its width. */
    animate(scene, { translateX:[0, -(W * 1.18)], rotate:[0, -6],
      duration:300, delay:TURN, ease:'inCubic', onComplete: gone });
    setTimeout(() => {
      const panel = $('.authp');
      if (panel) animate(panel, { translateY:[6, 0], duration:150,
        ease:'outQuad', onComplete(){ panel.style.transform = ''; } });
    }, TURN + 180);

    /* hard safety: the scene can never outlive its story */
    setTimeout(gone, 2000);
  },




  pageEntrance(scope){
    const els = [...scope.querySelectorAll('[data-enter]')];
    if (Motion.off || !els.length) return;

    const fold = innerHeight + 40;
    const near = els.filter(el => el.getBoundingClientRect().top < fold);
    const far  = els.filter(el => !near.includes(el));

    aset(els, { opacity:0 });
    animate(near, { opacity:[0, 1], duration:MECH.CUT,
            delay:stagger(MECH.GAP, { start:MECH.LEAD }), ease:STEP(1) });
    near.forEach((el, i) => FX.slamType(el, MECH.LEAD + i * MECH.GAP + MECH.BEAT));
    far.forEach(el => Reveal.watch(el));
  },

  /* THE SLAM. The display type inside a panel starts a short way above
     where it belongs and arrives in three cuts. Three, not one: a
     single jump is a swap, and three is a thing being driven down.

     Held to the panel's own heavy type — the sizes that carry the
     page. Body copy and labels are structure and come in with the
     frame. */
  slamType(panel, at){
    if (!panel || Motion.off) return;
    const marks = [...panel.querySelectorAll(SLAM_SEL)];
    if (!marks.length) return;
    aset(marks, { opacity:0, translateY:-14 });
    animate(marks, { opacity:[0, 1], translateY:[-14, 0],
            duration:MECH.SLAM, delay:stagger(MECH.BEAT / 3, { start:at }),
            ease:STEP(3), onComplete:() => releaseTransform(marks) });
  },

  /* The ten slots of the card face, landing along the collection route
     in order. Each slot springs in carrying its own lean (the
     stylesheet transform would otherwise be masked by the inline
     animation values), so nothing straightens and snaps at the end. */
  sealGrid(list){
    if (!list || Motion.off) return;
    const cells = list.querySelectorAll('.seal');
    if (!cells.length) return;
    aset(cells, { opacity:0 });
    animate(cells, { opacity:[0, 1], scale:[.86, 1],
            rotate: el => (getComputedStyle(el).getPropertyValue('--lean') || '0deg').trim(),
            delay:stagger(46, { start:120 }),
            ease:spring({ mass:1, stiffness:94, damping:13, velocity:0 }),
            onComplete(){ cells.forEach(c => { c.style.opacity = '';
              /* keep --press-tilt / --lean custom props; drop the
                 spring's inline transform */
              c.style.transform = ''; }); } });
  },

  /* ── scanner: the frame snaps shut on the code ── */
  scanLock(){
    if (Motion.off) return;
    const dirs = [[1,1],[-1,1],[1,-1],[-1,-1]];
    $$('#reticle .reticle__c').forEach((c, i) => animate(c, { translateX:dirs[i][0] * 11, translateY:dirs[i][1] * 11,
      duration:180, ease:EASE.CUT }));
    Slash.create({ type:'D', angle:-30, host:$('#viewer'), delay:90 });
    Impact.flash(.24, { host:$('#viewer'), delay:110, dur:50 });
  },

  scanReject(){
    if (Motion.off) return;
    Slash.create({ type:'A', angle:24, host:$('#viewer'), afterimage:false, hot:false });
    Impact.shake($('#viewer'), 4, 100);
    $$('#reticle .reticle__c').forEach(c =>
      animate(c, { translateX:0, translateY:0, duration:220, ease:EASE.CALM }));
  },

  /* ── the signature sequence ────────────────────────────────────
     LOCKED · silence · cut cut cross-cut · VERIFIED · +1 · settle
     Beats are deliberately uneven. The 120ms hole after the cuts
     is the impact frame: nothing new lands, which is what makes the
     verdict read as a consequence rather than the next animation.
     ────────────────────────────────────────────────────────────── */
  stampAcquire(meeting, done){
    const box = $('#verdict');
    const P = { seal:$('#vSeal'), state:$('#vState'), title:$('#vTitle'),
                delta:$('#vDelta'), meet:$('#vMeet'), flare:$('#vFlare'),
                ring:$('#vRing'), ring2:$('#vRing2') };

    P.seal.innerHTML = seal(3);
    /* SEALED, not "Verified": the product's own word for what just
       happened. A stamp was pressed and it is permanent. */
    P.state.textContent = 'Sealed';
    P.meet.textContent = `GM ${pad(meeting.no)} · ${fmtDate(meeting.date)} · MPR`;
    $('#verdictField')?.remove();
    box.insertAdjacentHTML('afterbegin', fieldSVG());
    const field = $('#verdictField');
    box.classList.add('is-on');

    const finish = () => {
      const close = () => { box.classList.remove('is-on'); box.style.opacity = ''; field?.remove(); done(); };
      if (Motion.off) return close();
      animate(box, { opacity:[1, 0], duration:200, ease:'inQuad', onComplete:close });
    };

    if (Motion.off){
      [P.state, P.title, P.delta, P.meet].forEach(el => el.style.opacity = 1);
      field?.remove();
      return void setTimeout(finish, 900);
    }

    Ambient.hush(1300);

    const sealStrokes  = P.seal.querySelectorAll('path,circle,polygon,line');
    const fieldStrokes = field.querySelectorAll('path,circle,polygon,line');
    aset(sealStrokes, { opacity:1 });
    aset([P.state, P.title, P.delta, P.meet], { opacity:0 });
    aset(box, { opacity:0 });

    createTimeline({ onComplete:() => setTimeout(finish, 200) })
      .add(box, { opacity:[0, 1], duration:1, ease:STEP(1) }, 0)

      .add(field, { opacity:[0, .5], scale:[.42, 1], rotate:[-22, 0],
             duration:300, ease:EASE.ENERGY }, 40)
      .add(createDrawable(fieldStrokes), { draw:['0 0', '0 1'],
             duration:260, delay:stagger(3), ease:'linear' }, 60)
      .add(createDrawable(sealStrokes), { draw:['0 0', '0 1'],
             duration:200, delay:stagger(7), ease:'linear' }, 90)
      .add(P.seal, { rotate:[-10, 0], scale:[.86, 1], duration:240, ease:EASE.ENERGY }, 90)

      /* opacity ONLY. Animating scale here writes an inline transform,
         and that silently overrode the -3.2deg the stamp is struck at
         — the mark landed square, which is the one thing a hand-
         pressed seal never does. */
      .add(P.state, { opacity:[0, 1], duration:1, ease:STEP(1) }, 300)
      .add(P.flare, { scale:[.4, 1.6], opacity:[.8, 0], duration:150, ease:STEP(3) }, 300)
      .add(P.ring, { scale:[.4, 3.2], opacity:[.7, 0], duration:210, ease:STEP(4) }, 302)
      .add(P.ring2, { scale:[.4, 2.2], opacity:[.5, 0], duration:250, ease:STEP(4) }, 316)
      .add(field, { scale:[1, 1.08], opacity:[.5, .16], duration:120, ease:STEP(2) }, 306)

      /* the register settling — each mark a cut, not a fade */
      .add(P.title, { opacity:[0, 1], duration:1, ease:STEP(1) }, 430)
      .add(P.delta, { opacity:[0, 1], duration:1, ease:STEP(1) }, 480)
      .add(P.meet,  { opacity:[0, 1], duration:1, ease:STEP(1) }, 530)
      .add(P.seal,  { opacity:[1, .16], duration:160, ease:STEP(3) }, 560)
      .add(field,   { opacity:[.16, 0], duration:160, ease:STEP(3) }, 560);

    setTimeout(() => Impact.flash(.3, { dur:44 }), 298);
    setTimeout(() => Slash.create({ type:'B', angle:-24 }), 300);
    setTimeout(() => Slash.cross({ angle:-58 }), 336);
    setTimeout(() => Lines.burst({ count:26, reach:400, hot:true, dur:260 }), 304);
    setTimeout(() => Impact.shake($('.verdict__inner'), 7, 90), 300);
  },

  stampLand(cell){
    if (!cell || Motion.off) return;
    const svg = cell.querySelector('svg');
    Slash.cross({ angle:-34, host:cell });
    Ambient.surge(760);

    /* two moves, not one. A single overshoot curve makes the stamp
       decelerate on the way in, which is backwards — a stamp is fastest
       at the moment it hits. So: a hard fast flight to slightly past
       the mark, then a spring settle. The spring works out its own
       duration from the mass and stiffness, so the recoil is physical
       rather than a number picked to look about right. */
    animate(cell, { scale:[0, 1.24], rotate:[-42, 6],
            duration:250, delay:240, ease:'outQuart' });
    animate(cell, { scale:1, rotate:0,
            delay:490, ease:spring({ mass:1, stiffness:90, damping:12, velocity:0 }) });
    this.energyBurst(cell, { count:9, spread:50, delay:250 });
    Impact.shards(cell, 10, -34);
    setTimeout(() => this.sealReveal(svg, { dur:380, spin:-24 }), 300);
    setTimeout(() => Impact.shake($('#shell'), 4, 90), 300);
  },

  rewardUnlock(row){
    if (Motion.off || !row) return;
    const claim = row.querySelector('.tier__claim');
    Slash.create({ type:'A', angle:-9, host:row });
    Impact.shake(row, 3, 90);
    if (claim){
      animate(claim, { scale:[.86, 1.06, 1], duration:420, delay:120,
                       ease:EASE.IMPACT });
      this.energyBurst(claim, { count:8, spread:44, delay:150 });
    }
  }
};

/* ── loading: one ink poster, then the blade takes it apart ─────────
   A title card, not a spinner — it never loops and never waits on
   anything; the interface is already rendered behind the curtain.

   The first painted frame is already the poster: solid ink, the KCI
   seal knocked out in paper and cropped by the left edge. The type
   slams in, holds, a paper blade goes through the whole card, the two
   halves shear and fly apart, and the app is standing underneath.
   Every state is ink or paper at full strength — no gray.
   ─────────────────────────────────────────────────────────────────── */
Object.assign(FX, {
  loadingSequence(onReveal){
    const boot = $('#boot');
    const whole = $('.boot__whole');
    const halves = $$('.boot__half');
    const seals = $$('.boot__seal');

    /* both of these are idempotent on purpose. The curtain is a solid
       layer over the whole app, so "lift it exactly once, from exactly
       one callback" is a bad bet — anything that stops the clock
       strands the page. Safe to call twice, called from two places. */
    let lifted = false, revealed = false;
    const done = () => { if (lifted) return; lifted = true; boot.classList.add('is-done'); };
    const reveal = () => { if (revealed) return; revealed = true; onReveal(); };

    seals.forEach(s => { s.innerHTML = brandSeal('kci'); });

    if (Motion.off){ reveal(); return void done(); }

    /* the poster plays as ONE piece; only ITS type animates. The
       halves are static copies of the final poster state, invisible
       until the blade's contact swaps them in pixel-for-pixel. */
    const seal = whole.querySelector('.boot__seal');
    const word = whole.querySelector('.boot__word');
    const kicker = whole.querySelector('.boot__kicker');

    const W = innerWidth, H = innerHeight;
    /* the same seam the half clip-paths draw: 60% → 40% of the height */
    const seamDeg = -Math.atan2(H * .20, W) * 180 / Math.PI;
    const seamL = CutGeo.line(W * .5, H * .5, seamDeg);
    const pxv = seamL.nx, pyv = seamL.ny;
    const D = Math.hypot(W, H);

    /* 0 the poster stands · 260 the kicker · 330 the title slams
       INTACT · hold · 860 the blade crosses · contact: the poster
       divides · the halves fall · app revealed. The seal is never
       animated: an inline transform would clobber its stylesheet
       position and the halves would no longer match the whole at the
       flip. */
    void seal;
    aset(kicker, { opacity:0 });
    aset(word, { scale:1.4, opacity:0 });
    setTimeout(() => aset(kicker, { opacity:1 }), 260);
    setTimeout(() => {
      aset(word, { opacity:1 });
      animate(word, { scale:[1.4, 1], duration:130, ease:STEP(3) });
    }, 330);
    setTimeout(() => Impact.shake(boot, 7, 110), 440);

    const contact = Blade.strike({ line:seamL, paper:true, th:15, host:boot,
                                   delay:860, sweep:75, hold:170 });
    setTimeout(() => {
      whole.style.display = 'none';
      halves[0].style.display = ''; halves[1].style.display = '';
      animate(halves[0], { translateX:[0, -pxv * 5], translateY:[0, -pyv * 5],
                           duration:60, ease:STEP(2) });
      animate(halves[1], { translateX:[0,  pxv * 5], translateY:[0,  pyv * 5],
                           duration:60, ease:STEP(2) });
      Impact.pop(boot);
      Impact.shake(boot, 6, 100);
    }, contact);

    const tFly = Math.ceil(contact) + 150;
    setTimeout(reveal, tFly - 10);
    animate(halves[0], { translateX:[-pxv * 5, -pxv * D * .85],
                         translateY:[-pyv * 5, -pyv * D * .85],
                         rotate:-1.2, duration:400, delay:tFly, ease:'inQuad' });
    animate(halves[1], { translateX:[ pxv * 5,  pxv * D * .85],
                         translateY:[ pyv * 5,  pyv * D * .85],
                         rotate:1.2, duration:400, delay:tFly, ease:'inQuad',
                         onComplete:done });

    setTimeout(() => { reveal(); done(); }, 3000);
  },
});
