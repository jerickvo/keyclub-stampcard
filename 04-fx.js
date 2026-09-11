"use strict";

const MECH = {
  BEAT: 90,
  SLAM: 130,
};

const STEP = n => (typeof steps === 'function' ? steps(n) : undefined);

/* The marks that are struck into place when a page arrives: the chapter
   numeral and word, and the wordmark on the sign-in spread. One slam
   per screen; body copy is always simply present. */
const SLAM_SEL = '.rechead__no,.rechead__title,.spread__wm';

const Impact = {
  /* A lateral "no". Used for one thing: a rejected scan. */
  shake(el, px = 7, dur = 140){
    if (!el || Motion.off) return;
    animate(el, { translateX:[0, -px, px * .7, -px * .35, 0],
      duration:dur, ease:'linear', onComplete(){ Motion.settle(el); } });
  },
};

const FX = {
  enter(scope){
    if (!scope || Motion.off) return;
    FX.slamType(scope, 40);
  },

  slamType(panel, at){
    if (!panel || Motion.off) return;
    const marks = [...panel.querySelectorAll(SLAM_SEL)];
    if (!marks.length) return;
    aset(marks, { opacity:0, translateY:-10 });
    animate(marks, { opacity:[0, 1], translateY:[-10, 0],
            duration:MECH.SLAM, delay:stagger(MECH.BEAT / 3, { start:at }),
            ease:STEP(3), onComplete:() => releaseTransform(marks) });
  },

  /* A stepped press onto the element itself: for a claimed rung, a
     freshly claimable button, the projector's OPEN and its live count. */
  press(el, from = 1.18, dur = 140){
    if (!el || Motion.off) return;
    aset(el, { scale:from });
    animate(el, { scale:[from, 1], duration:dur, ease:STEP(3),
                  onComplete(){ Motion.settle(el); } });
  },

  claimed(row){ FX.press(row, 1.04, 120); },

  rewardUnlock(row){
    if (!row || Motion.off) return;
    FX.press(row.querySelector('.rung__claim') || row, 1.14, 140);
  },

  scanReject(){ Impact.shake($('#reticle')); },

  /* The stamp lands on its own cell: oversized and off its lean, then
     down in four cuts. The card registers the hit as one frame of tint. */
  stampLand(cell){
    if (!cell) return;
    if (Motion.off){ cell.style.opacity = ''; return; }

    const lean = getComputedStyle(cell).getPropertyValue('--lean').trim() || '0deg';
    const deg = parseFloat(lean) || 0;
    const card = cell.closest('.card');

    aset(cell, { opacity:1, scale:1.55, rotate:`${deg - 9}deg` });
    animate(cell, { scale:[1.55, 1], rotate:[`${deg - 9}deg`, `${deg}deg`],
      duration:180, delay:60, ease:STEP(4),
      onComplete(){ Motion.settle(cell); } });
    if (card){
      setTimeout(() => {
        card.classList.add('card--hit');
        setTimeout(() => card.classList.remove('card--hit'), 90);
      }, 200);
    }
  },

  boardSeal(){
    const word = $('.proj__word');
    if (!word || Motion.off) return;
    aset(word, { opacity:0 });
    animate(word, { opacity:[0, 1], duration:1, delay:60 });
    FX.press(word, 1.35, 140);
  },

  countUp(node){ FX.press(node, 1.3, 120); },
};
