"use strict";

const MECH = {
  CUT:  1,
  LEAD: 40,
  GAP:  46,
  BEAT: 90,
  SLAM: 130,
};

const STEP = n => (typeof steps === 'function' ? steps(n) : undefined);

const SLAM_SEL = '.title,.spread__wm,.count__num b,.tally__fig,'
               + '.ladder__fig,.standing-band__fig,.who__name,'
               + '.proj__no,.bnow__no';

const EASE = {
  CUT:    cubicBezier(.03,.9,.1,1),
  ENERGY: cubicBezier(.4,0,.2,1),
  IMPACT: cubicBezier(.34,1.56,.5,1),
  CALM:   cubicBezier(.22,.61,.36,1),
  OUT:    'outQuart',
};

const roll = i => (i * 2.399) % 1;

const CutGeo = {
  line(x, y, deg){
    const r = deg * Math.PI / 180;
    return { x, y, dx:Math.cos(r), dy:Math.sin(r),
             nx:-Math.sin(r), ny:Math.cos(r), deg };
  },
};

let bladeSeq = 0;
const Blade = {
  svg(seed){
    const j = k => (Math.sin(seed * 12.9898 + k * 78.233) * .5 + .5);
    const X = [0, 90, 260, 430, 600, 800, 1000];

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

    const el = document.createElement('i');
    el.className = 'blade2' + (paper ? ' blade2--paper' : '');
    el.style.cssText = `left:${line.x}px;top:${line.y}px;width:${L}px;height:${th * 2}px;` +
      `margin:${-th}px 0 0 ${-L / 2}px`;
    el.innerHTML = `<span class="blade2__s">${this.svg(seq)}</span>`;
    parent.appendChild(el);
    const s = el.firstChild;
    aset(el, { rotate:line.deg });

    aset(s, { scaleX:.05, opacity:0 });
    setTimeout(() => aset(s, { opacity:1 }), delay);
    createTimeline({ onComplete:() => el.remove() })
      .add(s, { scaleX:[.05, 1], duration:sweep, delay, ease:'inQuad' })
      .add(s, { scaleX:1, duration:hold })
      .add(s, { scaleY:[1, .05], opacity:[1, 0], duration:70, ease:'inQuad' });

    return delay + sweep * .71;
  },
};

const Impact = {
  scrim(peak, { delay = 0, host = null, dur = 180 } = {}){
    if (Motion.off) return;
    const el = host ? this.plate(host, 'scrim') : $('#scrim');
    if (!el) return;
    animate(el, { opacity:[0, peak, 0], duration:dur, delay, ease:'outQuad',
            onComplete:() => { if (host) el.remove(); } });
  },

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

  pop(host, dur = 45){
    if (Motion.off) return;
    const el = host ? this.plate(host, 'flash') : $('#flash');
    if (!el) return;
    aset(el, { opacity:.92 });
    setTimeout(() => { aset(el, { opacity:0 }); if (host) el.remove(); }, dur);
  },

  shake(el, px = 5, dur = 110){
    if (!el || Motion.off) return;
    animate(el, { translateX:[0, -px, px * .7, -px * .35, 0],
      translateY:[0, px * .5, -px * .4, px * .2, 0],
      duration:dur, ease:'linear', onComplete(){ Motion.settle(el); } });
  },
};

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

const FX = {
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

    Lines.burst({ count:26, reach:300, delay:70, host, hot });
    setTimeout(() => Impact.shake($('#shell'), 6, 120), 78);
  },

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

      setTimeout(finish, OUT + BREATH + IN + 160);
    });
  },

  welcomeCut(word = 'Welcome'){
    const tail = word === 'Joined' ? 'Member joined' : 'Welcome back';
    const el = document.createElement('div');
    el.className = 'wcover';
    el.innerHTML =
      `<div class="wcover__page">
         <svg class="brandseal wcover__seal" viewBox="0 0 840 875" aria-hidden="true">
           <use href="#bootseal"/></svg>
       </div>
       <p class="wcover__kick">Key Club attendance</p>
       <div class="wcover__tier"><p class="wcover__word">Keystamp</p></div>
       <p class="wcover__tail">${tail}</p>
       <div class="wcover__foot"><p>Keystamp · Key Club attendance</p></div>`;
    document.body.appendChild(el);
    if (Motion.off){
      setTimeout(() => { try { el.remove(); } catch (_) {} }, 700);
      return;
    }
    const page  = el.querySelector('.wcover__page');
    const tier  = el.querySelector('.wcover__tier');
    const wordEl= el.querySelector('.wcover__word');
    const kick  = el.querySelector('.wcover__kick');
    const tailP = el.querySelector('.wcover__tail');
    const foot  = el.querySelector('.wcover__foot');
    aset(tier,  { translateY:'-320%' });
    aset(foot,  { translateY:'120%' });
    aset(wordEl,{ translateX:'105%' });
    aset(kick,  { opacity:0 });
    aset(tailP, { opacity:0 });

    setTimeout(() => animate(tier, { translateY:['-320%','0%'],
      duration:140, ease:STEP(2) }), 110);

    setTimeout(() => animate(wordEl, { translateX:['105%','0%'],
      duration:180, ease:STEP(3) }), 290);
    setTimeout(() => aset(kick, { opacity:1 }), 310);
    setTimeout(() => {
      aset(tailP, { opacity:1 });
      animate(foot, { translateY:['120%','0%'], duration:90, ease:STEP(2) });
    }, 520);

    setTimeout(() => aset(el, { scale:1.022 }), 660);
    setTimeout(() => aset(el, { scale:1 }), 726);

    setTimeout(() => {
      aset(kick,  { opacity:0 });
      aset(tailP, { opacity:0 });
      animate(tier, { translateY:['0%','-320%'], duration:260, ease:'outCubic' });
      animate(foot, { translateY:['0%','120%'],  duration:260, ease:'outCubic' });
      animate(page, { translateX:['0%','-104%'], duration:300, ease:'outCubic',
        onComplete(){ try { el.remove(); } catch (_) {} } });
    }, 920);

    setTimeout(() => { try { el.remove(); } catch (_) {} }, 2600);
  },

  waffleOut({ swap, fail, btn = null } = {}){
    const doSwap = typeof swap === 'function' ? swap : () => {};
    const oops   = typeof fail === 'function' ? fail : () => {};
    if (FX._out) return;
    FX._out = true;
    let ended = false;
    const unlock = () => { FX._out = false; };

    if (btn && !Motion.off){
      aset(btn, { scale:.94 });
      setTimeout(() => { animate(btn, { scale:1, duration:110,
        ease:'outQuad', onComplete(){ btn.style.transform = ''; } }); }, 90);
    }

    const W = innerWidth, H = innerHeight;
    const cols = W < 600 ? 3 : W < 1024 ? 4 : 5;
    const rows = H < 460 ? 2 : H < 700 ? 3 : W < 600 ? 4 : 3;
    const frs = n => Array.from({ length:n },
      (_, i) => [1.12, .88, 1.06, .92, 1.02][i % 5].toFixed(2) + 'fr').join(' ');

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
      el.className = 'soscene__cell' + (v ? ` soscene__cell--${v}` : '');
      el.style.gridRow = String(r + 1);
      el.style.gridColumn = `${c + 1}${span === 2 ? ' / span 2' : ''}`;
      el.style.transformOrigin = r % 2 ? '50% 100%' : '50% 0%';
      scene.appendChild(el);
      cells.push({ el, d:r + c, ink:v === 'ink',
                   dir:c + span / 2 < cols / 2 ? -1 : 1, row:r });
    }
    document.body.appendChild(scene);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      Promise.resolve().then(doSwap).catch(oops);
    }));

    const gone = () => { if (ended) return; ended = true;
      try { scene.remove(); } catch (_) {} unlock(); };

    if (Motion.off){
      scene.style.opacity = '0';
      scene.style.transition = 'opacity 180ms ease';
      requestAnimationFrame(() => { scene.style.opacity = '1'; });
      setTimeout(() => { scene.style.opacity = '0'; }, 620);
      setTimeout(gone, 900);
      return;
    }

    cells.forEach(cell => {
      aset(cell.el, { opacity:0, scaleY:.9 });
      animate(cell.el, { opacity:[0, 1], scaleY:[.9, 1],
        duration:130, delay:40 + cell.d * 26, ease:'outQuad' });
    });

    const BREAK = 430;
    const maxD = Math.max(...cells.map(c => c.d));
    cells.forEach(cell => {
      const delay = BREAK + cell.d * 26;
      if (cell.ink){
        animate(cell.el, {
          translateX:[0, cell.dir * Math.max(220, W * .34)],
          opacity:[1, 0],
          duration:200, delay, ease:'inQuad' });
      } else {
        animate(cell.el, { scaleY:[1, 0],
          duration:200, delay, ease:'inQuad' });
      }
    });

    const tClear = BREAK + maxD * 26 + 200;
    animate(scene, { opacity:[1, 0], duration:160, delay:tClear, ease:'linear' });
    setTimeout(() => {
      const panel = $('.authp');
      if (panel) animate(panel, { translateY:[6, 0], duration:150,
        ease:'outQuad', onComplete(){ panel.style.transform = ''; } });
    }, tClear + 30);

    setTimeout(gone, tClear + 220);

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

  slamType(panel, at){
    if (!panel || Motion.off) return;
    const marks = [...panel.querySelectorAll(SLAM_SEL)];
    if (!marks.length) return;
    aset(marks, { opacity:0, translateY:-14 });
    animate(marks, { opacity:[0, 1], translateY:[-14, 0],
            duration:MECH.SLAM, delay:stagger(MECH.BEAT / 3, { start:at }),
            ease:STEP(3), onComplete:() => releaseTransform(marks) });
  },

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

              c.style.transform = ''; }); } });
  },

  scanLock(){
    if (Motion.off) return;
    const dirs = [[1,1],[-1,1],[1,-1],[-1,-1]];
    $$('#reticle .reticle__c').forEach((c, i) => animate(c, { translateX:dirs[i][0] * 11, translateY:dirs[i][1] * 11,
      duration:180, ease:EASE.CUT }));
    Impact.flash(.24, { host:$('#viewer'), delay:110, dur:50 });
  },

  scanReject(){
    if (Motion.off) return;
    Impact.shake($('#viewer'), 4, 100);
    $$('#reticle .reticle__c').forEach(c =>
      animate(c, { translateX:0, translateY:0, duration:220, ease:EASE.CALM }));
  },

  stampAcquire(meeting, done){
    const scene = document.createElement('div');
    scene.className = 'acq';
    scene.innerHTML = `
      <div class="acq__stack">
        <p class="acq__kick">Stamp acquired</p>
        <div class="acq__seal" aria-hidden="true">
          <svg viewBox="0 0 64 64"><path d="${stampShape(7, 0)}"/></svg>
          <b class="acq__plus">+1</b>
        </div>
        <p class="acq__meet">GM ${pad(meeting.no)} · ${fmtDate(meeting.date)} · MPR</p>
      </div>`;
    document.body.appendChild(scene);
    const clear = () => { try { scene.remove(); } catch (_) {} };

    if (Motion.off){
      setTimeout(() => { done(); clear(); }, 750);
      return;
    }

    const sealEl = scene.querySelector('.acq__seal');

    aset(sealEl, { scale:1.16, rotate:-4 });
    animate(sealEl, { scale:[1.16, 1], rotate:[-4, -1.5],
      duration:110, delay:80, ease:STEP(2) });
    setTimeout(() => Impact.shake(scene, 3, 80), 170);

    setTimeout(done, 540);
    setTimeout(() => animate(scene, { opacity:[1, 0], duration:140,
      ease:'inQuad', onComplete:clear }), 760);
    setTimeout(clear, 2000);
  },

  stampLand(cell){
    if (!cell || Motion.off) return;

    const lean = getComputedStyle(cell).getPropertyValue('--lean').trim() || '0deg';
    aset(cell, { opacity:0 });
    animate(cell, { opacity:[0, 1], duration:1, delay:420, ease:STEP(1) });
    animate(cell, { scale:[1.45, 1], rotate:lean, duration:130, delay:420, ease:STEP(3) });
    setTimeout(() => { Impact.shake($('.card__face') || $('#shell'), 3, 80); }, 540);
    setTimeout(() => { Motion.settle(cell); }, 720);
  },

  rewardUnlock(row){
    if (Motion.off || !row) return;
    const claim = row.querySelector('.tier__claim');
    Impact.flash(.18, { host:row, dur:60 });
    Impact.shake(row, 3, 90);
    if (claim){
      animate(claim, { scale:[.86, 1.06, 1], duration:420, delay:120,
                       ease:EASE.IMPACT });
    }
  },

  boardSeal(){
    const word = $('.proj__word');
    if (!word || Motion.off) return;
    let deg = 0;
    try {
      const m = new DOMMatrixReadOnly(getComputedStyle(word).transform);
      deg = Math.atan2(m.b, m.a) * 180 / Math.PI;
    } catch (_) {}
    aset(word, { scale:1.45, rotate:deg, opacity:0 });
    animate(word, { opacity:[0, 1], duration:1, delay:60, ease:STEP(1) });
    animate(word, { scale:[1.45, 1], rotate:deg, duration:120, delay:60, ease:STEP(3) });
    setTimeout(() => Impact.shake($('.proj__facts') || word, 3, 80), 190);
    setTimeout(() => Motion.settle(word), 420);
  }
};

Object.assign(FX, {
  loadingSequence(onReveal){
    const boot = $('#boot');
    const whole = $('.boot__whole');
    const halves = $$('.boot__half');

    let lifted = false, revealed = false;
    const done = () => { if (lifted) return; lifted = true; boot.classList.add('is-done'); };
    const reveal = () => { if (revealed) return; revealed = true; onReveal(); };

    if (Motion.off){ reveal(); return void done(); }

    const seal = whole.querySelector('.boot__seal');
    const word = whole.querySelector('.boot__word');
    const kicker = whole.querySelector('.boot__kicker');

    const W = innerWidth, H = innerHeight;

    const seamDeg = -Math.atan2(H * .20, W) * 180 / Math.PI;
    const seamL = CutGeo.line(W * .5, H * .5, seamDeg);
    const pxv = seamL.nx, pyv = seamL.ny;
    const D = Math.hypot(W, H);

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
