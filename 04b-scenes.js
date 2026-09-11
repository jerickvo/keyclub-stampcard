"use strict";

/* Two whole-screen moments and one page change.

   Arrival — the boot page: three outlined panels, ink wiped into each in
   hard steps, the seal and the wordmark stamped in, then the panels part
   and the paper sheet drops. Plays once, on a cold load, and never again.

   Departure — signing out drains the page: paper reclaims the ink from
   the top down in six cuts, and the sign-in spread is what is left.

   Page change — nothing is covered. The page swaps in one frame and the
   chapter numeral and title are struck into place; the torn rule under
   them sweeps in the direction of travel. */

const SCENE_MARKUP = tail => `
  <div class="scene__base"></div>
  <div class="scene__grid">
    <div class="scene__panel scene__panel--a"><i class="scene__ink"></i><p class="scene__word">Keystamp</p></div>
    <div class="scene__panel scene__panel--b"><i class="scene__ink"></i>
      <p class="scene__kick">Key Club attendance</p><p class="scene__tail">${esc(tail || '')}</p></div>
    <div class="scene__panel scene__panel--c"><i class="scene__ink scene__ink--tone"></i>
      <span class="scene__seal"><svg class="brandseal" viewBox="0 0 840 875" aria-hidden="true"><use href="#bootseal"/></svg></span></div>
  </div>`;

const Scenes = {
  busy: false,

  parts(root){
    const q = s => root.querySelector(s);
    const panel = k => { const el = q('.scene__panel--' + k); return { el, ink:el.querySelector('.scene__ink') }; };
    return { root, base:q('.scene__base'), grid:q('.scene__grid'),
             a:panel('a'), b:panel('b'), c:panel('c'),
             word:q('.scene__word'), kick:q('.scene__kick'), tail:q('.scene__tail'), seal:q('.scene__seal') };
  },

  exitVector(p, W){
    const g = p.grid.getBoundingClientRect();
    const mid = g.left + g.width / 2;
    return panel => {
      const r = panel.el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      if (r.width > g.width * .8 || Math.abs(cx - mid) < g.width * .1) return { translateY:-(r.bottom + 12) };
      return cx < mid ? { translateX:-(r.right + 12) } : { translateX:(W - r.left + 12) };
    };
  },

  /* The boot page. `root` is the static markup in dev.html, already
     animating from first paint; release() opens it once the app is
     ready, never sooner than MIN after the page composed itself. */
  opening({ root = null, tail = '', reveal = () => {} } = {}){
    let el = root;
    if (!el){
      el = document.createElement('div');
      el.className = 'scene scene--open scene--play';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = SCENE_MARKUP(tail);
      document.body.appendChild(el);
    }
    const p = this.parts(el);
    const t0 = performance.now();
    let done = false, released = false, revealed = false;

    const revealOnce = () => { if (revealed) return; revealed = true; try { reveal(); } catch (_) {} };
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(fuse);
      try { el.remove(); } catch (_) {}
    };
    const fuse = setTimeout(() => { revealOnce(); finish(); }, 7000);

    if (Motion.off){
      return { release(){
        if (released) return; released = true;
        revealOnce(); finish();
      } };
    }

    const MIN = 700;
    const open = () => {
      if (done) return;
      el.classList.add('scene--set');
      const W = innerWidth;
      const vec = this.exitVector(p, W);
      const EXIT = cubicBezier(.7, 0, .18, 1);
      animate(p.a.el, Object.assign({ duration:340, ease:EXIT }, vec(p.a)));
      animate(p.b.el, Object.assign({ duration:320, delay:40, ease:EXIT }, vec(p.b)));
      animate(p.c.el, Object.assign({ duration:320, delay:70, ease:EXIT }, vec(p.c)));
      animate(p.base, { translateY:[0, innerHeight + 24], duration:340, delay:60, ease:EXIT });
      setTimeout(revealOnce, 90);
      setTimeout(finish, 440);
    };

    return { release(){
      if (released) return; released = true;
      setTimeout(open, Math.max(0, MIN - (performance.now() - t0)));
    } };
  },

  /* Signing out: the page drains to paper from the top in hard steps
     while the sign-out request runs; the sign-in spread is what remains. */
  exit({ swap, fail } = {}){
    const doSwap = typeof swap === 'function' ? swap : () => Promise.resolve();
    const oops = typeof fail === 'function' ? fail : () => {};
    if (this.busy) return;
    this.busy = true;
    const view = $('#view');
    const settle = () => { this.busy = false; view?.classList.remove('is-draining'); };

    const request = () => Promise.resolve().then(doSwap).then(() => 'ok', err => { oops(err); return 'failed'; });

    if (Motion.off || !view){
      request().finally(settle);
      return;
    }

    /* Drain first, holding the page fully clipped; the sign-in spread
       then appears in one cut, or the page comes back if the request
       failed. */
    view.classList.add('is-draining');
    setTimeout(() => {
      request().then(res => {
        settle();
        if (res === 'ok') FX.enter($('#view'));
      });
    }, 320);
  },
};

const Transit = {
  ORDER: { home:0, record:1, scan:2, rewards:3, profile:4,
           board:0, bmeet:1, bcheckin:2, bmembers:3, baccount:4 },

  direction(from, to){
    const a = this.ORDER[from], b = this.ORDER[to];
    if (a === undefined || b === undefined || a === b) return 0;
    return b > a ? 1 : -1;
  },

  /* The page swaps in one frame; only the chapter opener moves. */
  run(from, to, swap){
    const doSwap = typeof swap === 'function' ? swap : () => {};
    const dir = this.direction(from, to);
    try { doSwap(); } catch (_) {}
    if (Motion.reduced || !window.animate) return Promise.resolve();
    const view = $('#view');
    const head = view && view.querySelector('.rechead');
    if (head){
      head.classList.remove('is-cut', 'is-cut--back');
      void head.offsetWidth;
      head.classList.add('is-cut');
      if (dir < 0) head.classList.add('is-cut--back');
      FX.slamType(head, 30);
    }
    return new Promise(res => setTimeout(res, 170));
  },
};
