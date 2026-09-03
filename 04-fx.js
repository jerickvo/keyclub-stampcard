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
  IMPACT: cubicBezier(.34,1.56,.5,1),
  CALM:   cubicBezier(.22,.61,.36,1),
};

const Impact = {
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

  shake(el, px = 5, dur = 110){
    if (!el || Motion.off) return;
    animate(el, { translateX:[0, -px, px * .7, -px * .35, 0],
      translateY:[0, px * .5, -px * .4, px * .2, 0],
      duration:dur, ease:'linear', onComplete(){ Motion.settle(el); } });
  },
};

const FX = {
  claimStamp(row){
    if (!row || Motion.off) return;
    aset(row, { scale:1.04 });
    animate(row, { scale:[1.04, 1], duration:120, ease:STEP(3),
                   onComplete(){ Motion.settle(row); } });
    Impact.flash(.22, { host:row, delay:40, dur:60 });
    setTimeout(() => Impact.shake(row, 3, 90), 100);
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
        <p class="acq__meet">GM ${pad(meeting.no)} / ${fmtDate(meeting.date)} / MPR</p>
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
    setTimeout(() => animate(scene, { translateY:[0, -(innerHeight + 24)], duration:300,
      ease:cubicBezier(.7, 0, .18, 1), onComplete:clear }), 760);
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
