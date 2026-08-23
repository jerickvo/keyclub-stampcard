"use strict";
/* keystamp — the FX choreography layer and the named sequences
   Loaded in order by index.html. Order matters. */

/* ══════════════════════════════════════════════════════════════════
   9. FX — the choreography layer.

   Everything is built from five primitives, and every named sequence
   below is a timeline over those primitives rather than a one-off
   animation. That is the difference between choreography and effects:
   a cut in the loading screen and a cut on the scanner are the same
   object with different parameters.

     Slash    the cut — anticipation, instantaneous travel, aftermath
     Impact   scrim, flash, shards, sparks, rings, frame shake
     Lines    speed lines racing out from a focal point
     Field    the ritual structure that forms behind big moments
     Ambient  pulls the background down so an impact lands in silence

   Shape of a cut: the body is charcoal, there is exactly one
   bone-white razor edge, the tail runs a shade lighter, and a single
   short mid-grey tick sits near the end — about 6% of the shape.
   (The palette was crimson/burgundy in an earlier revision; the app is
   strictly monochrome now, so the accent is a value, not a hue.) It overshoots its own length
   during travel, which is the motion blur. It is never a glowing line
   left sitting on screen.

   Sound hooks: each sequence below is written as discrete beats with
   gaps between them (cut · silence · impact), so an audio cue can be
   dropped on any beat later without re-timing anything.
   ══════════════════════════════════════════════════════════════════ */
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

/* The type heavy enough to be driven rather than revealed. Everything
   else on a panel is structure and arrives with the frame. */
const SLAM_SEL = '.title,.hero__num,.strike__verb,.tech__name,.who__name,'
               + '.stat b,.qrpanel__no,.entry__gain';

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

  /* a few px perpendicular to the blade, then settle */
  push(el, px, angle){
    if (!el || Motion.off) return;
    const rad = (angle + 90) * Math.PI / 180;
    animate(el, { translateX:[0, Math.cos(rad) * px, 0], translateY:[0, Math.sin(rad) * px, 0],
      duration:140, ease:EASE.CUT, complete(){ el.style.transform = ''; } });
  },

  /* the frame itself takes the hit */
  shake(el, px = 5, dur = 110){
    if (!el || Motion.off) return;
    animate(el, { translateX:[0, -px, px * .7, -px * .35, 0],
      translateY:[0, px * .5, -px * .4, px * .2, 0],
      duration:dur, ease:'linear', complete(){ el.style.transform = ''; } });
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

  /* ── primitives, exposed by name ───────────────────────────── */
  slash(o){ Slash.create(o); },
  slashBarrage(n, o){ Slash.barrage(n, o); },
  speedLines(o){ Lines.burst(o); },

  /* one frame of violence: dark · blown contrast · a word · a cut · shake */
  impactFrame({ word = '', jp = '', angle = -20, host = null, hot = true } = {}){
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

      if (jp){
        const g = document.createElement('div');
        g.className = 'frameword frameword--jp';
        g.textContent = jp;
        parent.appendChild(g);
        animate(g, { opacity:[0, .9, 0], duration:250, delay:60,
                ease:'linear', onComplete:() => g.remove() });
      }
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
            delay, ease:EASE.ENERGY });
  },

  /* ── navigation: the old view is cut away ── */
  pageCutTransition(){
    if (Motion.off) return;
    Slash.create({ type:'A', angle:-17, afterimage:false });
  },

  /* Panels arrive in reading order, but only the ones you can actually
     see. A screen like Record is three times the height of the window,
     and animating the bottom of it while you are looking at the top
     spends the entrance on nothing — worse, by the time you scroll down
     it has already happened, so the page below the fold always looks
     static. Everything past the fold gets parked and handed to Reveal.

     TWO PHASES (§16). The old entrance was one gesture: every panel
     drifted in from 12px right with a 1.4deg skew on an eased curve,
     which is a card sliding onto a screen — the vocabulary of an app,
     and the one soft motion left in a system that otherwise cuts.

     Structure lands first: the panel CUTS in, one step, no travel and
     no fade, the way a plate drops into register. Its heavy type is
     held back and slams down a beat later in three hard steps. What
     you read is the frame arriving and then the word hitting it.

     The stagger is flat for the same reason. An eased one was chosen
     to read "like a hand turning pages"; a hand is exactly what this
     system is not. */
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
            ease:spring({ mass:1, stiffness:94, damping:13, velocity:0 }) });
  },

  /* The dossier's cells land one after another, each an instant cut —
     a sheet being stamped, not a bar filling. */
  slotStrike(list, at){
    if (!list || Motion.off) return;
    const lit = list.querySelectorAll('.dslot--set');
    if (!lit.length) return;
    aset(lit, { opacity:0 });
    animate(lit, { opacity:[0, 1], duration:1,
            delay:stagger(34, { start:at }), ease:STEP(1) });
  },

  hoverCut(btn){
    if (Motion.off || btn.dataset.cutting) return;
    btn.dataset.cutting = '1';
    Slash.create({ type:'A', angle:-11, host:btn, afterimage:false, hot:false });
    setTimeout(() => delete btn.dataset.cutting, 380);
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
    const P = { seal:$('#vSeal'), state:$('#vState'), jp:$('#vJp'), title:$('#vTitle'),
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
      [P.state, P.jp, P.title, P.delta, P.meet].forEach(el => el.style.opacity = 1);
      field?.remove();
      return void setTimeout(finish, 900);
    }

    Ambient.hush(1300);

    const sealStrokes  = P.seal.querySelectorAll('path,circle,polygon,line');
    const fieldStrokes = field.querySelectorAll('path,circle,polygon,line');
    aset(sealStrokes, { opacity:1 });
    aset([P.state, P.jp, P.title, P.delta, P.meet], { opacity:0 });
    aset(box, { opacity:0 });

    /* THE STAMP LANDS.

       This used to be a 900ms build: the structure eased up over
       740ms, the word faded in with a translate, the title arrived on
       an overshoot curve. Read as a sequence of animations rather than
       as an event — and a stamp is not a sequence. It is one impact
       with consequences.

       Now: the structure draws (that part is a press being aligned),
       then at 300ms everything stops for one frame, and SEALED is
       simply THERE — no fade, no travel, full size, off square. The
       marks around it snap in after, in steps, like the register
       settling. Nothing in the impact eases. */
    createTimeline({ onComplete:() => setTimeout(finish, 200) })
      .add(box, { opacity:[0, 1], duration:1, ease:STEP(1) }, 0)
      /* alignment: the press coming down. This is the only part of the
         sequence allowed a curve, and it is under the word, not on it */
      .add(field, { opacity:[0, .5], scale:[.42, 1], rotate:[-22, 0],
             duration:300, ease:EASE.ENERGY }, 40)
      .add(createDrawable(fieldStrokes), { draw:['0 0', '0 1'],
             duration:260, delay:stagger(3), ease:'linear' }, 60)
      .add(createDrawable(sealStrokes), { draw:['0 0', '0 1'],
             duration:200, delay:stagger(7), ease:'linear' }, 90)
      .add(P.seal, { rotate:[-10, 0], scale:[.86, 1], duration:240, ease:EASE.ENERGY }, 90)

      /* 300ms: THE PRESS. Full size, instantly, nothing to watch. */
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
      .add(P.jp,    { opacity:[0, .85], duration:1, ease:STEP(1) }, 380)
      .add(P.title, { opacity:[0, 1], duration:1, ease:STEP(1) }, 430)
      .add(P.delta, { opacity:[0, 1], duration:1, ease:STEP(1) }, 480)
      .add(P.meet,  { opacity:[0, 1], duration:1, ease:STEP(1) }, 530)
      .add(P.seal,  { opacity:[1, .16], duration:160, ease:STEP(3) }, 560)
      .add(field,   { opacity:[.16, 0], duration:160, ease:STEP(3) }, 560);

    /* the cuts run on their own clocks so the timeline can't smooth
       them out, and all of them land ON the press rather than around it */
    setTimeout(() => Impact.flash(.3, { dur:44 }), 298);
    setTimeout(() => Slash.create({ type:'B', angle:-24 }), 300);
    setTimeout(() => Slash.cross({ angle:-58 }), 336);
    setTimeout(() => Lines.burst({ count:26, reach:400, hot:true, dur:260 }), 304);
    setTimeout(() => Impact.shake($('.verdict__inner'), 7, 90), 300);
  },

  /* the stamp landing on the grid, once the dashboard is back */
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

  /* ── the seal on a milestone breaks ── */
  rewardUnlock(rig){
    if (Motion.off || !rig) return;
    const crack = rig.querySelector('.tech__crack');
    const glyph = rig.querySelector('.tech__glyph');
    const panel = rig.querySelector('.panel');
    if (!crack) return;

    const paths = crack.querySelectorAll('path');
    aset(crack, { opacity:1 });

    createTimeline()
      /* the seal fractures */
      .add(createDrawable(paths), { draw:['0 0', '0 1'],
             duration:260, delay:stagger(50), ease:EASE.CUT }, 0)
      /* then it gives way */
      .add(crack, { opacity:[1, 0], scale:[1, 1.06], duration:200, ease:EASE.OUT }, 380);

    setTimeout(() => {
      Slash.cross({ angle:-16, host:panel });
      Impact.shards(panel, 10, -16);
      this.energyBurst(glyph || panel, { count:10, spread:56 });
      animate(glyph, { scale:[.72, 1.12, 1], rotate:[-16, 0], duration:560, ease:EASE.IMPACT });
      this.sealReveal(glyph, { dur:420 });
      Impact.shake(panel, 5, 110);
    }, 400);
  },
};

/* ── loading: the app is cut into existence ─────────────────────────
   Ten beats in about 1.7 seconds. It is a title card, not a spinner,
   so it never loops and never waits on anything — the interface is
   already rendered behind the curtain while this plays.

     1  a small seal surfaces out of black
     2  one instant cut
     3  a single frame of blown-out contrast
     4  three diagonal cuts in quick succession
     5  speed lines explode outward
     6  the mark resolves
     7  the title lands
     8  a last cut goes through the title
     9  the halves shear apart and everything collapses
    10  the interface arrives
   ─────────────────────────────────────────────────────────────────── */
Object.assign(FX, {
  loadingSequence(onReveal){
    const boot = $('#boot'), sealEl = $('#bootSeal'), mark = $('#bootMark');
    const title = $('#bootTitle'), jp = $('#bootJp');
    const halves = $$('.boot__half');

    /* both of these are idempotent on purpose. The curtain is a solid
       black layer over the whole app, so "lift it exactly once, from
       exactly one callback" is a bad bet — anything that stops the
       clock strands the page. Make them safe to call twice and then
       call them from more than one place. */
    let lifted = false, revealed = false;
    const done = () => { if (lifted) return; lifted = true; boot.classList.add('is-done'); };
    const reveal = () => { if (revealed) return; revealed = true; onReveal(); };

    sealEl.innerHTML = seal(4);
    mark.innerHTML = logoMark('boot__logo');

    if (Motion.off){ reveal(); return void done(); }

    const markStrokes = mark.querySelectorAll('path');
    const sealStrokes = sealEl.querySelectorAll('circle,polygon,path,line');
    aset(markStrokes, { opacity:1 });
    aset(title, { opacity:0 });

    /* one clock for the whole title card.

       These beats used to be a timeline plus eight loose setTimeouts.
       Two clocks means two ways to drift: minimise the tab and rAF
       stops while setTimeout keeps going, so the cuts fire against a
       frozen seal. anime.js can hold a target-less step purely as a
       timer, so every beat now hangs off the same timeline and they
       pause and resume together. */
    const tl = createTimeline({ onComplete:done });
    const beat = (at, fn) => tl.add({ duration:1, onBegin:fn }, at);

    tl
      /* 1 · a seal surfaces */
      .add(sealEl, { opacity:[0, .78], scale:[.86, 1], duration:200, ease:EASE.CALM }, 50)
      .add(createDrawable(sealStrokes), { draw:['0 0', '0 1'],
             duration:560, delay:stagger(4), ease:EASE.OUT }, 70)
      .add(sealEl, { opacity:[.78, .16], scale:[1, 1.07], duration:320, ease:EASE.OUT }, 320)
      /* 6 · the mark resolves */
      .add(mark, { opacity:[0, 1], scale:[.84, 1], duration:260, ease:EASE.IMPACT }, 580)
      .add(createDrawable(markStrokes), { draw:['0 0', '0 1'],
             duration:400, delay:stagger(48), ease:EASE.OUT }, 600)
      .add(mark, { opacity:[1, 0], translateY:[0, -26], duration:200, ease:EASE.CUT }, 830)
      /* 7 · the title lands */
      .add(title, { opacity:[0, 1], scale:[1.14, 1], duration:170, ease:EASE.CUT }, 860)
      .add(jp, { opacity:[0, .8], letterSpacing:['1.1em', '.66em'], duration:420, ease:EASE.CALM }, 900)
      /* 9 · collapse */
      .add([jp, sealEl], { opacity:0, duration:180, ease:EASE.CALM }, 1250)
      .add(boot, { opacity:[1, 0], duration:280, ease:EASE.CALM, onBegin:reveal }, 1420)
      /* 8 · the halves shear apart along the last cut */
      .add(halves[0], { translateX:-9, translateY:-27, rotate:-1.4,
             opacity:[1, 0], duration:300, ease:EASE.OUT }, 1215)
      .add(halves[1], { translateX:9, translateY:27, rotate:1.4,
             opacity:[1, 0], duration:300, ease:EASE.OUT }, 1215);

    /* the cuts, now on the same clock as everything else */
    const cut = o => Slash.create({ ...o, host:boot });
    beat(200, () => cut({ type:'B', angle:-27 }));                                    /* 2 */
    beat(240, () => Impact.flash(.34, { host:boot, dur:52 }));                        /* 3 */
    beat(310, () => cut({ type:'D', angle:52, offset:-96 }));                         /* 4 */
    beat(352, () => cut({ type:'D', angle:-64, offset:70 }));
    beat(430, () => Lines.burst({ host:boot, count:30, reach:480, dur:340, hot:true }));  /* 5 */
    beat(442, () => Impact.ring(boot, { size:120, scale:4.4, dur:700 }));
    beat(1160, () => {                                                               /* 8 */
      cut({ type:'B', angle:-18 });
      Impact.flash(.3, { host:boot, delay:26, dur:48 });
      Impact.shards(boot, 14, -18);
    });

    /* three ways out, all idempotent. The timeline's own complete is the
       one that should fire; tl itself (not a `.finished` property —
       anime.js v4 timelines have no such thing, and reading it threw
       synchronously, which skipped straight to the outer catch and
       dropped the boot curtain before the title card had even started)
       covers a rejected or replaced instance, and the timer covers the
       case where the clock stops altogether. The curtain comes up
       either way. */
    tl.then(done, done);
    setTimeout(() => { reveal(); done(); }, 2600);
  },
});
