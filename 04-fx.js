"use strict";

const STEP = n => (typeof steps === 'function' ? steps(n) : undefined);

const EASE = {
  CUT:    cubicBezier(.03,.9,.1,1),
  CALM:   cubicBezier(.22,.61,.36,1),
};

/* one shake, and it means no: a refused code */
const Impact = {
  shake(el, px = 5, dur = 110){
    if (!el || Motion.off) return;
    animate(el, { translateX:[0, -px, px * .7, -px * .35, 0],
      translateY:[0, px * .5, -px * .4, px * .2, 0],
      duration:dur, ease:'linear', onComplete(){ Motion.settle(el); } });
  },
};

const FX = {
  /* the CLAIMED punch is pressed onto the rung, the way a stamp lands */
  claimStamp(row){
    const p = row && row.querySelector('.tier__punch');
    if (!p || Motion.off) return;
    animate(p, { scale:[1.3, 1], duration:120, ease:STEP(3),
                 onComplete(){ Motion.settle(p); } });
  },

  scanLock(){
    if (Motion.off) return;
    const dirs = [[1,1],[-1,1],[1,-1],[-1,-1]];
    $$('#reticle .reticle__c').forEach((c, i) => animate(c, { translateX:dirs[i][0] * 11, translateY:dirs[i][1] * 11,
      duration:180, ease:EASE.CUT }));
  },

  scanReject(){
    if (Motion.off) return;
    Impact.shake($('#viewer'), 4, 100);
    $$('#reticle .reticle__c').forEach(c =>
      animate(c, { translateX:0, translateY:0, duration:220, ease:EASE.CALM }));
  },

  stampAcquire(meeting){
    /* the seal just earned, with the glyph it will carry on the card;
       read before the record refreshes, so the count is its ordinal */
    const n = Store.totalStamps();
    const lift = (32 - 32 * STAMP_FIT).toFixed(1);
    const scene = document.createElement('div');
    scene.className = 'acq';
    scene.innerHTML = `
      <div class="acq__stack">
        <p class="acq__kick">Stamp acquired</p>
        <div class="acq__seal" aria-hidden="true">
          <svg viewBox="0 0 64 64"><path class="acq__face" d="${stampShape(n + 1, 0)}"/>
            <g class="acq__mark" transform="translate(${lift} ${lift}) scale(${STAMP_FIT})">${stampMark(n)}</g></svg>
        </div>
        <p class="acq__meet">GM ${pad(meeting.no)} / ${fmtDate(meeting.date || Schedule.today())}</p>
      </div>`;
    document.body.appendChild(scene);

    let gone = false;
    const clear = () => { if (gone) return; gone = true; try { scene.remove(); } catch (_) {} };
    const fuse = setTimeout(clear, 8000);

    if (!Motion.off){
      const sealEl = scene.querySelector('.acq__seal');
      aset(sealEl, { scale:1.16, rotate:-4 });
      animate(sealEl, { scale:[1.16, 1], rotate:[-4, -1.5],
        duration:110, delay:80, ease:STEP(2) });
    }

    return {
      clear(){ clearTimeout(fuse); clear(); },
      lift(then){
        clearTimeout(fuse);
        let fired = false;
        const done = () => {
          if (fired) return; fired = true;
          clear();
          if (typeof then === 'function') then();
        };
        if (Motion.off || gone){ done(); return; }
        animate(scene, { translateY:[0, -(innerHeight + 24)], duration:300,
          ease:cubicBezier(.7, 0, .18, 1), onComplete:done });
        setTimeout(done, 600);
      },
    };
  },

  stampLand(cell){
    if (!cell) return;
    if (Motion.off){ cell.style.opacity = ''; return; }

    const lean = getComputedStyle(cell).getPropertyValue('--lean').trim() || '0deg';
    const deg = parseFloat(lean) || 0;

    aset(cell, { opacity:1, scale:1.55, rotate:`${deg - 9}deg` });
    animate(cell, { scale:[1.55, 1], rotate:[`${deg - 9}deg`, `${deg}deg`],
      duration:180, delay:70, ease:STEP(4),
      onComplete(){ Motion.settle(cell); } });
  },

  boardSeal(){
    const word = $('.proj__word');
    if (!word || Motion.off) return;
    let deg = 0;
    try {
      const m = new DOMMatrixReadOnly(getComputedStyle(word).transform);
      deg = Math.atan2(m.b, m.a) * 180 / Math.PI;
    } catch (_) {}
    aset(word, { scale:1.2, rotate:deg, opacity:0 });
    animate(word, { opacity:[0, 1], duration:1, delay:60, ease:STEP(1) });
    animate(word, { scale:[1.2, 1], rotate:deg, duration:120, delay:60, ease:STEP(3) });
    setTimeout(() => Motion.settle(word), 300);
  }
};
