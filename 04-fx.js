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

  /* CUT · 20ms · CUT · 35ms · CROSS · 50ms · IMPACT */
  barrage(count = 5, { spread = 150, host = null, delay = 0 } = {}){
    for (let i = 0; i < count; i++){
      const r = roll(i);
      this.create({
        type: i % 3 === 0 ? 'B' : 'D',
        angle: -72 + r * 146,
        offset: (r - .5) * spread * 2,
        along: (((i * 1.618) % 1) - .5) * 130,
        host, delay: delay + i * (22 + (i % 3) * 16),
        afterimage: i % 2 === 0,
      });
    }
  },
};

/* ══ CUT GEOMETRY ════════════════════════════════════════════════════
   Every cut in the motion system is a real LINE in viewport space. The
   blade is drawn along that line, the fragments are computed by
   actually splitting polygons with that line, and the seam opens at
   the moment the blade crosses it — cause, then consequence, on the
   same geometry. */
const CutGeo = {
  /* a cut line through (x,y) at deg: unit direction d, unit normal n */
  line(x, y, deg){
    const r = deg * Math.PI / 180;
    return { x, y, dx:Math.cos(r), dy:Math.sin(r),
             nx:-Math.sin(r), ny:Math.cos(r), deg };
  },
  side(L, x, y){ return (x - L.x) * L.nx + (y - L.y) * L.ny; },

  /* split one convex polygon with a line → [negSide, posSide] */
  split(poly, L){
    const neg = [], pos = [];
    for (let i = 0; i < poly.length; i++){
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = this.side(L, a[0], a[1]), db = this.side(L, b[0], b[1]);
      if (da <= 0) neg.push(a);
      if (da >= 0) pos.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)){
        const t = da / (da - db);
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        neg.push(p); pos.push(p);
      }
    }
    return [neg.length > 2 ? neg : null, pos.length > 2 ? pos : null];
  },

  /* cut the viewport with a set of lines. Each fragment keeps which
     side of every line it landed on, so a seam can be opened for
     exactly the pieces that cut created, when that cut lands. */
  shatter(W, H, lines){
    let frags = [{ poly:[[0, 0], [W, 0], [W, H], [0, H]], sides:[] }];
    for (const L of lines){
      const out = [];
      for (const f of frags){
        const [neg, pos] = this.split(f.poly, L);
        if (neg && pos){
          out.push({ poly:neg, sides:f.sides.concat(-1) });
          out.push({ poly:pos, sides:f.sides.concat(1) });
        } else {
          out.push({ poly:f.poly, sides:f.sides.concat(neg ? -1 : 1) });
        }
      }
      frags = out;
    }
    const kept = [];
    for (const f of frags){
      let sx = 0, sy = 0, ar = 0;
      const P = f.poly;
      for (let i = 0; i < P.length; i++){
        const q = P[(i + 1) % P.length];
        sx += P[i][0]; sy += P[i][1];
        ar += P[i][0] * q[1] - q[0] * P[i][1];
      }
      f.area = Math.abs(ar) / 2;
      if (f.area < 40) continue;              /* degenerate sliver */
      f.cx = sx / P.length; f.cy = sy / P.length;
      let rad = 0;
      for (const p of P) rad = Math.max(rad, Math.hypot(p[0] - f.cx, p[1] - f.cy));
      f.rad = rad;
      kept.push(f);
    }
    return kept;
  },

  clip(f){ return 'polygon(' + f.poly.map(p =>
    p[0].toFixed(1) + 'px ' + p[1].toFixed(1) + 'px').join(',') + ')'; },
};

/* frozen clone of the live page, layout inlined so the auth screen
   rendering underneath cannot restyle it. Shared by the transition and
   the sign-out wall. */
function snapShell(shell){
  const cl = shell.cloneNode(true);
  const freeze = (sel, props) => {
    const src = sel ? shell.querySelector(sel) : shell;
    const dst = sel ? cl.querySelector(sel) : cl;
    if (!src || !dst) return;
    const cs = getComputedStyle(src);
    props.forEach(p => { dst.style[p] = cs[p]; });
  };
  freeze(null, ['gridTemplateColumns']);
  freeze('.rail', ['display']);
  freeze('.rail__nav', ['display']);
  freeze('.topbar', ['display']);
  freeze('main', ['padding']);
  return cl;
}

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
    /* half-thickness profile along 0..1000: 0 at the tips, full in the
       impact third, jittered so no two strokes are alike */
    const prof = [[0, 0], [90, 5 + j(1) * 4], [260, 14 + j(2) * 7],
                  [430, 22 + j(3) * 8], [600, 20 + j(4) * 8],
                  [800, 10 + j(5) * 5], [1000, 0]];
    const bow = (j(6) - .5) * 10;             /* slight curve of the stroke */
    const yAt = x => 30 + bow * Math.sin(Math.PI * x / 1000);
    const top = prof.map(([x, h]) => `${x},${(yAt(x) - h).toFixed(1)}`).join(' ');
    const bot = prof.slice().reverse().map(([x, h]) => `${x},${(yAt(x) + h).toFixed(1)}`).join(' ');
    const core = [[140, 1], [420, 2.6 + j(7) * 1.4], [700, 2 + j(8)], [900, .8]];
    const ctop = core.map(([x, h]) => `${x},${(yAt(x) - 1.6 - h).toFixed(1)}`).join(' ');
    const cbot = core.slice().reverse().map(([x, h]) => `${x},${(yAt(x) - 1.6 + h).toFixed(1)}`).join(' ');
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
/* THE FIELD BEHIND THE IMPACT.

   This drew seal(4) at the height of the screen, and back when the
   seal was a line drawing its 5.5-unit arms scaled to 46px each and
   the six of them fused into a soft grey disc covering half the
   frame. I worked around that by redrawing it at hairline weight.

   The seal is traced artwork now, so it scales the way a logo should:
   the mark behind the impact is simply the mark, enormous, at low
   value. The workaround is gone with the geometry that needed it. */
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

  /* the page is cut away — literally. The live page is frozen into
     four fragments along two real cut lines, the blades cross those
     exact lines, each seam opens at its blade's contact, and then the
     fragments slide out along the first cut's normal, revealing the
     next page already standing underneath. The outgoing page is the
     visual subject for the whole transition: there is no cover, no
     black frame, and nothing changes before its cut. ~560ms. */
  pageCut(swap){
    const doSwap = typeof swap === 'function' ? swap : () => {};
    const fx = $('#fx'), shell = $('#shell');
    if (Motion.off || !fx || !shell){ doSwap(); return Promise.resolve(); }

    return new Promise(res => {
      const W = innerWidth, H = innerHeight, sy = scrollY;
      const seq = ++cutSeq;
      /* two cut lines, varied a little per navigation */
      const L1 = CutGeo.line(W * (.44 + roll(seq) * .12), H * (.42 + roll(seq + 1) * .16),
                             -12 - roll(seq + 2) * 9);
      const L2 = CutGeo.line(W * (.38 + roll(seq + 3) * .2), H * (.4 + roll(seq + 4) * .2),
                             -55 - roll(seq + 5) * 16);
      const frags = CutGeo.shatter(W, H, [L1, L2]);

      const ov = document.createElement('div');
      ov.className = 'pcut';
      for (const f of frags){
        const piece = document.createElement('div');
        piece.className = 'pcut__piece';
        piece.style.clipPath = CutGeo.clip(f);
        piece.style.transformOrigin = `${f.cx.toFixed(1)}px ${f.cy.toFixed(1)}px`;
        const page = document.createElement('div');
        page.className = 'pcut__page';
        page.style.cssText = `width:${W}px;height:${H}px;left:0;top:${-sy}px`;
        page.appendChild(snapShell(shell));
        piece.appendChild(page);
        ov.appendChild(piece);
        f.el = piece; f.ox = 0; f.oy = 0;
      }
      fx.appendChild(ov);

      /* the freeze is pixel-identical to the live page; only once it is
         committed does the real page change underneath it */
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try { doSwap(); } catch (_) {}
      }));

      const seam = (L, k, px) => { for (const f of frags){
        f.ox += f.sides[k] * L.nx * px; f.oy += f.sides[k] * L.ny * px;
        f.el.style.transform = `translate(${f.ox}px,${f.oy}px)`;
      } };
      /* overlap the seams a hair until each blade lands */
      seam(L1, 0, -0.4); seam(L2, 1, -0.4);

      const c1 = Blade.strike({ line:L1, th:16, delay:20, sweep:70, hold:130 });
      setTimeout(() => { seam(L1, 0, 2.5); Impact.shake(ov, 3, 70); }, c1);
      const c2 = Blade.strike({ line:L2, th:11, delay:95, sweep:60, hold:110 });
      setTimeout(() => { seam(L2, 1, 2); Impact.pop(ov); }, c2);

      /* removal ALONG the cut geometry: each fragment leaves on the
         first cut's normal, nudged by the second, slightly staggered */
      const D = Math.hypot(W, H) * 1.15;
      const t2 = c2 + 66;
      frags.forEach((f, i) => {
        const tx = f.ox + f.sides[0] * L1.nx * D + f.sides[1] * L2.nx * D * .16;
        const ty = f.oy + f.sides[0] * L1.ny * D + f.sides[1] * L2.ny * D * .16;
        animate(f.el, { translateX:[f.ox, tx], translateY:[f.oy, ty],
          rotate:f.sides[0] * (1.2 + roll(i + seq) * 1.6),
          duration:240 + roll(i * 3 + seq) * 60,
          delay:t2 + i * 18, ease:'inQuad' });
      });
      setTimeout(() => { ov.remove(); res(); }, t2 + 410);
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

  /* sign-out: the wall comes down. The CURRENT page is frozen into
     fragments computed from REAL intersecting cut lines — two hero
     diagonals plus uneven vertical-ish and horizontal-ish cuts — so
     the pieces have varied sizes and angled edges, not grid tiles.
     Every blade is drawn along its own line, and each seam opens at
     that blade's contact moment: cut, then crack, in order. The wall
     holds visibly divided for a beat, then the pieces release under a
     small rAF physics model (gravity, drift, spin, mass) and fall out
     of the screen at full opacity. swap() runs once the wall has been
     committed to the screen; fail() reports a sign-out that could not
     happen. */
  waffleOut({ swap, fail } = {}){
    const doSwap = typeof swap === 'function' ? swap : () => {};
    const oops   = typeof fail === 'function' ? fail : () => {};
    const fx = $('#fx'), shell = $('#shell');
    if (Motion.off || !fx || !shell)
      return void Promise.resolve().then(doSwap).catch(oops);

    const W = innerWidth, H = innerHeight, sy = scrollY;
    const mob = W <= 700;
    const seq = ++cutSeq;

    /* ── the cut composition ── two hero diagonals, then uneven
       vertical-ish and horizontal-ish cuts. Positions and angles are
       jittered so no two sign-outs shatter the same way. */
    const lines = [];
    lines.push(CutGeo.line(W * .5,  H * .48, -19 + (roll(seq) - .5) * 6));
    if (!mob)
      lines.push(CutGeo.line(W * .58, H * .44, -64 + (roll(seq + 1) - .5) * 10));
    const nv = mob ? 2 : 3, nh = 2;
    for (let i = 1; i <= nv; i++)
      lines.push(CutGeo.line(W * (i / (nv + 1)) + (roll(seq + 2 + i) - .5) * W * .12,
                             H * .5, 90 + (roll(seq + 7 + i) - .5) * 15));
    for (let i = 1; i <= nh; i++)
      lines.push(CutGeo.line(W * .5,
                             H * (i / (nh + 1)) + (roll(seq + 12 + i) - .5) * H * .16,
                             (roll(seq + 17 + i) - .5) * 13));
    const frags = CutGeo.shatter(W, H, lines);

    /* ── the wall: every fragment is a clipped clone of the live page
       over an ink slab (the wall's thickness) ── */
    const grid = document.createElement('div');
    grid.className = 'waffle';
    const inkback = document.createElement('div');
    inkback.className = 'waffle__ink';
    grid.appendChild(inkback);
    for (const f of frags){
      const piece = document.createElement('div');
      piece.className = 'waffle__piece';
      piece.style.clipPath = CutGeo.clip(f);
      piece.style.transformOrigin = `${f.cx.toFixed(1)}px ${f.cy.toFixed(1)}px`;
      const back = document.createElement('div');
      back.className = 'waffle__slab';
      const page = document.createElement('div');
      page.className = 'waffle__page';
      page.style.cssText = `width:${W}px;height:${H}px;left:0;top:${-sy}px`;
      page.appendChild(snapShell(shell));
      piece.appendChild(back); piece.appendChild(page);
      grid.appendChild(piece);
      f.el = piece; f.ox = 0; f.oy = 0;
    }
    fx.appendChild(grid);

    /* the wall is pixel-identical to the page it froze. Two frames
       later — once it is committed — the real app signs out beneath
       it, invisibly. The ink (backdrop and slab edges) stays clear
       until the first crack, so a slow first rasterization of the
       clones can never flash black. */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      Promise.resolve().then(doSwap).catch(oops);
    }));

    /* ── cut → crack, per line, in order. Each blade is drawn along
       its own line; ITS seam opens at ITS contact moment. */
    const seam = (L, k, px) => { for (const f of frags){
      f.ox += f.sides[k] * L.nx * px; f.oy += f.sides[k] * L.ny * px;
      f.el.style.transform = `translate(${f.ox.toFixed(2)}px,${f.oy.toFixed(2)}px)`;
    } };
    /* pieces start overlapped a hair on every seam, so clip-edge
       anti-aliasing cannot draw a line before that seam's blade has
       actually landed */
    lines.forEach((L, k) => seam(L, k, -0.4));
    let lastContact = 0;
    lines.forEach((L, k) => {
      const hero = k < (mob ? 1 : 2);
      const delay = hero ? 40 + k * 95 : (mob ? 135 : 230) + (k - (mob ? 1 : 2)) * 34;
      const c = Blade.strike({ line:L, th:hero ? (k ? 15 : 21) : 5 + roll(seq + k) * 4,
                               delay, sweep:hero ? 80 : 55, hold:hero ? 260 : 120 });
      lastContact = Math.max(lastContact, c);
      setTimeout(() => {
        if (k === 0) grid.classList.add('is-cracked');
        seam(L, k, hero ? 1.7 : 1.1);
        if (k === 0) Impact.shake(grid, 8, 120);
        if (k === 1) Impact.pop();
      }, c);
    });

    /* ── HOLD: the wall stands visibly divided ── */
    const tHold = Math.ceil(lastContact) + 20;
    setTimeout(() => Impact.shake(grid, 2, 80), tHold + 40);

    /* ── release + fall: a real (small) physics model on rAF.
       Pieces nearest the first cut go first; mass = fragment size:
       light pieces accelerate and spin more, heavy slabs lag. */
    const t2 = tHold + 140;
    const avg = Math.sqrt(W * H / frags.length);
    let dmax = 1;
    for (const f of frags){
      f.d = Math.abs(CutGeo.side(lines[0], f.cx, f.cy));
      dmax = Math.max(dmax, f.d);
    }
    frags.forEach((f, i) => {
      const r1 = roll(i * 3 + seq), r2 = roll(i * 5 + seq + 1), r3 = roll(i * 7 + seq + 2);
      const mass = Math.max(.6, Math.sqrt(f.area) / avg);
      f.rel  = t2 + (f.d / dmax) * 150 + r1 * 110;
      f.vx   = ((f.cx - W * .5) / W) * 110 + (r2 - .5) * 70;
      f.vy   = 60 + r3 * 180;
      f.g    = (7400 + r1 * 2200) / mass;
      f.vr   = (r2 - .5) * 220 / mass;
      f.vt   = (r3 - .5) * 90 / mass;      /* rotateX tilt speed */
      f.x = f.ox; f.y = f.oy; f.rot = 0; f.tilt = 0; f.done = false;
    });
    setTimeout(() => { try { inkback.remove(); } catch (_) {} }, t2 + 100);

    const t0 = performance.now();
    let prev = t0, live = frags.length;
    const step = now => {
      const dt = Math.min(.034, (now - prev) / 1000); prev = now;
      const tms = now - t0;
      for (const f of frags){
        if (f.done || tms < f.rel) continue;
        f.vy  += f.g * dt;
        f.x   += f.vx * dt; f.y += f.vy * dt;
        f.rot += f.vr * dt; f.tilt += f.vt * dt;
        f.el.style.transform =
          `translate(${f.x.toFixed(1)}px,${f.y.toFixed(1)}px) ` +
          `rotate(${f.rot.toFixed(2)}deg) rotateX(${f.tilt.toFixed(2)}deg)`;
        if (f.cy + f.y - f.rad > H + 60){ f.done = true; live--; }
      }
      if (live > 0 && now - t0 < 3000) requestAnimationFrame(step);
      else grid.remove();
    };
    requestAnimationFrame(step);
    /* hard safety: the overlay can never outlive the sequence */
    setTimeout(() => { try { grid.remove(); } catch (_) {} }, 3200);
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

  /* The ten cells of the stamp card, rippling out across the grid rather
     than running left to right. stagger()'s grid mode measures each
     cell's distance from the origin cell and delays by that, so the wave
     travels diagonally the way a block of stamps would actually ink. The
     spring gives each cell its own settle instead of a shared curve, so
     they do not land in lockstep. */
  sealGrid(list){
    if (!list || Motion.off) return;
    const cells = list.querySelectorAll('.seal');
    if (!cells.length) return;
    const cols = 5, rows = Math.ceil(cells.length / cols);
    aset(cells, { opacity:0, scale:.86 });
    animate(cells, { opacity:[0, 1], scale:[.86, 1],
            delay:stagger(44, { grid:[cols, rows], from:'first', start:120 }),
            ease:spring({ mass:1, stiffness:94, damping:13, velocity:0 }),
            onComplete(){ cells.forEach(c => { c.style.opacity = '';
              /* keep --press-tilt custom prop; drop the spring's inline transform */
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
     Beats are deliberately uneven. The 120ms hole after the barrage
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
    P.meet.textContent = `GM ${pad(meeting.no)} · Wed ${fmtDay(meeting.date)} · MPR`;
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
