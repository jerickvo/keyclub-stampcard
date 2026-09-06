"use strict";

const STEP = n => (typeof steps === 'function' ? steps(n) : undefined);

const EASE = {
  CUT:  cubicBezier(.03,.9,.1,1),
  CALM: cubicBezier(.22,.61,.36,1),
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

const lean = el => (getComputedStyle(el).getPropertyValue('--lean') || '0deg').trim();
const clear = els => (Array.isArray(els) ? els : [els]).forEach(el => {
  if (el && el.style){ el.style.transform = ''; el.style.opacity = ''; }
});

const FX = {
  enter(id){
    if (Motion.off) return;
    if (id === 'home')    return this.sealGrid($('#seals'));
    if (id === 'record')  return this.ledger($('.ledger'));
    if (id === 'rewards') return this.tierSnap($('.tier--ready, .tier--target'));
    if (id === 'scan')    return this.reticleClose();
    if (id === 'profile' || id === 'baccount') return this.stampIn($('.who__name'));
  },

  sealGrid(list){
    if (!list || Motion.off) return;
    const cells = [...list.querySelectorAll('.seal')];
    if (!cells.length) return;
    aset(cells, { opacity:0 });
    animate(cells, { opacity:[0, 1], duration:1, delay:stagger(26, { start:60 }) });
    animate(cells, { scale:[.9, 1], rotate:lean, duration:120,
            delay:stagger(26, { start:60 }), ease:STEP(3), onComplete:() => clear(cells) });
  },

  ledger(list){
    if (!list || Motion.off) return;
    const rows = [...list.querySelectorAll('.lrow')].slice(0, 16);
    if (!rows.length) return;
    aset(rows, { opacity:0 });
    animate(rows, { opacity:[0, 1], duration:1, delay:stagger(18, { start:40 }),
            onComplete:() => clear(rows) });
  },

  tierSnap(row){
    if (!row || Motion.off) return;
    aset(row, { scale:1.03 });
    animate(row, { scale:[1.03, 1], duration:120, delay:40, ease:STEP(3),
            onComplete:() => clear(row) });
  },

  reticleClose(){
    if (Motion.off) return;
    const dirs = [[-1,-1],[1,-1],[-1,1],[1,1]];
    const corners = $$('#reticle .reticle__c');
    corners.forEach((c, i) => {
      aset(c, { translateX:dirs[i][0] * 14, translateY:dirs[i][1] * 14 });
      animate(c, { translateX:0, translateY:0, duration:220, delay:60, ease:EASE.CUT });
    });
  },

  stampIn(el){
    if (!el || Motion.off) return;
    aset(el, { opacity:0 });
    animate(el, { opacity:[0, 1], duration:1, delay:40 });
    animate(el, { scale:[1.25, 1], duration:120, delay:40, ease:STEP(3),
            onComplete:() => clear(el) });
  },

  claimStamp(row){
    if (!row || Motion.off) return;
    aset(row, { scale:1.04 });
    animate(row, { scale:[1.04, 1], duration:120, ease:STEP(3), onComplete:() => clear(row) });
    Impact.flash(.22, { host:row, delay:40, dur:60 });
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

  scanStamp(ordinal, done){
    const viewer = $('#viewer'), ret = $('#reticle');
    if (!viewer || !ret){ done(); return; }
    const fit = STAMP_FIT, at = (32 - 32 * fit).toFixed(1);
    const el = document.createElement('div');
    el.className = 'viewer__stamp';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<svg viewBox="0 0 64 64">
      <path class="sf-face" d="${stampShape(ordinal + 1, 0)}"/>
      <g class="seal__mark" transform="translate(${at} ${at}) scale(${fit})">${stampMark(ordinal)}</g></svg>`;
    ret.appendChild(el);

    if (Motion.off){ setTimeout(done, 520); return; }

    aset(el, { opacity:0, scale:1.35, rotate:-3 });
    Impact.flash(.24, { host:viewer, delay:60, dur:50 });
    createTimeline({ onComplete:done })
      .add(el, { opacity:[0, 1], duration:1 }, 40)
      .add(el, { scale:[1.35, 1], rotate:[-3, -1.5], duration:140, ease:STEP(3) }, 40)
      .add({ hold:0 }, { hold:1, duration:560 });
  },

  stampLand(cell){
    if (!cell || Motion.off) return;
    aset(cell, { opacity:0 });
    const tl = createTimeline();
    tl.add(cell, { opacity:[0, 1], duration:1 }, 400)
      .add(cell, { scale:[1.45, 1], rotate:lean(cell), duration:130, ease:STEP(3) }, 400)
      .call(() => Impact.shake($('.card__face') || $('#shell'), 3, 80), 520)
      .call(() => clear(cell), 720);
  },

  cardFull(card){
    const punch = card && card.querySelector('.card__punch');
    if (!punch || Motion.off) return;
    aset(punch, { opacity:0, scale:1.3, rotate:-9 });
    animate(punch, { opacity:[0, 1], duration:1, delay:760 });
    animate(punch, { scale:[1.3, 1], rotate:-9, duration:120, delay:760, ease:STEP(3),
            onComplete:() => clear(punch) });
  },

  rewardUnlock(row){
    if (Motion.off || !row) return;
    const claim = row.querySelector('.tier__claim');
    Impact.flash(.18, { host:row, dur:60 });
    if (claim) animate(claim, { scale:[.9, 1.04, 1], duration:360, delay:100, ease:EASE.CALM,
                                onComplete:() => clear(claim) });
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
    animate(word, { opacity:[0, 1], duration:1, delay:60 });
    animate(word, { scale:[1.45, 1], rotate:deg, duration:120, delay:60, ease:STEP(3),
            onComplete:() => clear(word) });
  },
};
