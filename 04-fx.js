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
