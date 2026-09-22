"use strict";

const SCENE_MARKUP = tail => `
  <div class="scene__base"></div>
  <div class="scene__grid">
    <div class="scene__panel scene__panel--a"><i class="scene__ink"></i><p class="scene__word">Keystamp</p></div>
    <div class="scene__panel scene__panel--b"><i class="scene__ink"></i>
      <p class="scene__kick">Key Club attendance</p><p class="scene__tail">${esc(tail || '')}</p></div>
    <div class="scene__panel scene__panel--c"><i class="scene__ink scene__ink--tone"></i>
      <span class="scene__seal"><svg class="brandseal" viewBox="0 0 840 875" aria-hidden="true"><use href="#bootseal"/></svg></span></div>
  </div>`;

const fadeAway = (el, dur, cb) => {
  if (window.animate){ animate(el, { opacity:[1, 0], duration:dur, ease:'linear', onComplete:cb }); return; }
  el.style.transition = `opacity ${dur}ms linear`;
  el.style.opacity = '0';
  setTimeout(cb, dur + 20);
};

const Scenes = {
  busy: false,

  parts(root){
    const q = s => root.querySelector(s);
    const panel = k => { const el = q('.scene__panel--' + k); return { el, ink:el.querySelector('.scene__ink') }; };
    return { root, base:q('.scene__base'), grid:q('.scene__grid'),
             a:panel('a'), b:panel('b'), c:panel('c'),
             word:q('.scene__word'), kick:q('.scene__kick'), tail:q('.scene__tail'), seal:q('.scene__seal') };
  },

  exitVector(p, W, H){
    const g = p.grid.getBoundingClientRect();
    const mid = g.left + g.width / 2;
    return panel => {
      const r = panel.el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      if (r.width > g.width * .8 || Math.abs(cx - mid) < g.width * .1) return { translateY:-(r.bottom + 12) };
      return cx < mid ? { translateX:-(r.right + 12) } : { translateX:(W - r.left + 12) };
    };
  },

  opening({ root = null, tail = '', reveal = () => {} } = {}){
    const boot = Boolean(root);
    let el = root;
    if (!el){
      el = document.createElement('div');
      el.className = 'scene scene--welcome';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = SCENE_MARKUP(tail);
      document.body.appendChild(el);
    } else {
      const t = el.querySelector('.scene__tail');
      if (t) t.textContent = tail;
    }
    const p = this.parts(el);
    /* the scene is opaque on its first frame, so the page renders under
       cover; it holds only until it has finished building */
    const t0 = boot ? 0 : performance.now();
    let done = false, released = false, revealed = false;

    const revealOnce = () => { if (revealed) return; revealed = true; try { reveal(); } catch (_) {} };
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(fuse);
      try { el.remove(); } catch (_) {}
    };
    const fuse = setTimeout(() => { revealOnce(); finish(); }, 7000);

    if (Motion.off){
      el.classList.remove('scene--play');
      el.classList.add('scene--set');
      return { release(){
        if (released) return; released = true;
        revealOnce(); fadeAway(el, 150, finish);
      } };
    }

    if (!boot) el.classList.add('scene--play');

    const MIN = 600;
    const open = () => {
      if (done) return;
      el.classList.add('scene--set');
      const W = innerWidth;
      const vec = this.exitVector(p, W, innerHeight);
      const EXIT = cubicBezier(.7, 0, .18, 1);
      animate(p.a.el, Object.assign({ duration:380, ease:EXIT }, vec(p.a)));
      animate(p.b.el, Object.assign({ duration:360, delay:40, ease:EXIT }, vec(p.b)));
      animate(p.c.el, Object.assign({ duration:360, delay:70, ease:EXIT }, vec(p.c)));
      animate(p.base, { translateY:[0, innerHeight + 24], duration:380, delay:60, ease:EXIT });
      setTimeout(revealOnce, 100);
      setTimeout(finish, 480);
    };

    return { release(){
      if (released) return; released = true;
      setTimeout(open, Math.max(0, MIN - (performance.now() - t0)));
    } };
  },

  exit({ swap, fail, btn = null } = {}){
    const doSwap = typeof swap === 'function' ? swap : () => Promise.resolve();
    const oops = typeof fail === 'function' ? fail : () => {};
    if (this.busy) return;
    this.busy = true;

    const el = document.createElement('div');
    el.className = 'scene scene--exit scene--set';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = SCENE_MARKUP('');
    document.body.appendChild(el);
    const p = this.parts(el);
    p.word.textContent = 'Signing out';
    p.kick.textContent = 'Keystamp / Key Club attendance';
    [p.word, p.kick, p.tail, p.seal].forEach(x => { x.style.opacity = '0'; });

    let done = false;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(fuse);
      try { el.remove(); } catch (_) {}
      this.busy = false;
    };
    const fuse = setTimeout(finish, 4000);
    const swapNow = () => Promise.resolve().then(doSwap).catch(err => { oops(err); return 'failed'; })
      .then(res => { p.word.textContent = res === 'failed' ? 'Still signed in' : 'Signed out';
                     if (res === 'failed') p.tail.textContent = ''; return res; });

    if (Motion.off){
      [p.word, p.kick, p.tail, p.seal].forEach(x => { x.style.opacity = '1'; });
      setTimeout(async () => {
        await swapNow();
        setTimeout(() => fadeAway(el, 150, finish), 300);
      }, 120);
      return;
    }

    if (btn){
      aset(btn, { scale:.94 });
      setTimeout(() => animate(btn, { scale:1, duration:110, ease:'outQuad',
        onComplete(){ btn.style.transform = ''; } }), 90);
    }

    const W = innerWidth, H = innerHeight;
    const vec = this.exitVector(p, W, H);
    const IN = cubicBezier(.5, 0, .12, 1);
    const from = panel => { const v = vec(panel); const k = Object.keys(v)[0]; return [k, v[k]]; };
    [[p.a, 0, 250], [p.b, 30, 230], [p.c, 60, 230]].forEach(([panel, delay, dur]) => {
      const [k, v] = from(panel);
      aset(panel.el, { [k]:v });
      animate(panel.el, { [k]:[v, 0], duration:dur, delay, ease:IN });
    });
    aset(p.base, { opacity:0 });
    animate(p.base, { opacity:[0, 1], duration:200, delay:110, ease:'linear' });

    let swapped = null;
    setTimeout(() => { swapped = swapNow(); }, 340);

    createTimeline({ autoplay:true })
      .add(p.seal, { opacity:[0, 1], duration:1 }, 360)
      .add(p.word, { opacity:[0, 1], duration:1 }, 400)
      .add(p.word, { scale:[1.3, 1], duration:110, ease:STEP(3) }, 400)
      .add(p.kick, { opacity:[0, 1], duration:1 }, 470)
      .add(p.tail, { opacity:[0, 1], duration:1 }, 530);

    const drop = async () => {
      if (done) return;
      const res = swapped ? await swapped : null;
      const FALL = cubicBezier(.55, 0, 1, .45);
      const dist = panel => H - panel.el.getBoundingClientRect().top + 16;
      [[p.b, 0], [p.c, 50], [p.a, 100]].forEach(([panel, delay]) => {
        animate(panel.el, { translateY:[0, dist(panel)], duration:420, delay, ease:FALL });
      });
      animate(p.base, { translateY:[0, H + 24], duration:420, delay:130, ease:FALL });
      if (res !== 'failed'){
        setTimeout(() => {
          const panel = $('.authp');
          if (panel) animate(panel, { translateY:[6, 0], duration:160, ease:'outQuad',
            onComplete(){ panel.style.transform = ''; } });
        }, 200);
      }
      setTimeout(finish, 560);
    };
    setTimeout(drop, 640);
  },
};

const Transit = {
  running: false,

  /* Work that would be seen as a stutter waits for the cut to finish.
     Under the slab there is nothing to see anyway, and the deadline means
     a cut that never reports done cannot strand the work. */
  after(fn, wait = 1200){
    const deadline = performance.now() + wait;
    const tick = () => {
      if (this.running && performance.now() < deadline) return setTimeout(tick, 50);
      fn();
    };
    return setTimeout(tick, 0);
  },

  ORDER: { home:0, record:1, scan:2, rewards:3, profile:4,
           bcheckin:0, bmeet:1, bmembers:2 },

  /* one cut for every page turn: an ink slab crosses the column in tab
     order; only its direction says anything, so nothing rides on it */
  CUT: { in:90, out:120, angle:6 },

  direction(from, to){
    const a = this.ORDER[from], b = this.ORDER[to];
    if (a === undefined || b === undefined || a === b) return 0;
    return b > a ? 1 : -1;
  },

  frame(view){
    const r = view.getBoundingClientRect();
    const shown = el => el && getComputedStyle(el).display !== 'none';
    const tabs = $('.tabs');
    const top = 0;
    const floor = shown(tabs) ? tabs.getBoundingClientRect().top : innerHeight;
    return { left:r.left, width:r.width, top, height:Math.max(0, floor - top) };
  },

  slab(f, dir){
    const box = document.createElement('div');
    box.className = 'cutbox';
    box.style.cssText = `left:${f.left}px;top:${f.top}px;width:${f.width}px;height:${f.height}px`;
    const W = f.width, H = f.height;
    const off = Math.round(Math.tan(this.CUT.angle * Math.PI / 180) * H);
    const el = document.createElement('div');
    el.className = 'slab';
    el.style.cssText = `left:${-off}px;top:0;width:${W + 2 * off}px;height:${H}px`;
    el.style.clipPath = dir > 0
      ? `polygon(${off}px 0, 100% 0, calc(100% - ${off}px) 100%, 0 100%)`
      : `polygon(0 0, calc(100% - ${off}px) 0, 100% 100%, ${off}px 100%)`;
    box.appendChild(el);
    document.body.appendChild(box);
    const enter = dir > 0 ? W + off : -(W + off);
    return { box, el, enter, exit:-enter };
  },

  run(from, to, swap){
    const view = $('#view');
    const doSwap = typeof swap === 'function' ? swap : () => {};
    const dir = this.direction(from, to);
    if (!window.animate || !view || Motion.reduced || !dir){
      /* no cut and no crossfade: the page changes, and that is the cue */
      try { doSwap(); } catch (_) {}
      if (view) Motion.settle(view);
      return Promise.resolve();
    }

    this.running = true;
    const c = this.CUT;
    const cut = this.slab(this.frame(view), dir);
    const IN = cubicBezier(.7, 0, .2, 1), OUT = cubicBezier(.55, 0, .12, 1);

    return new Promise(res => {
      let settled = false;
      const finish = () => {
        if (settled) return; settled = true;
        Transit.running = false;
        try { cut.box.remove(); } catch (_) {}
        Motion.settle(view);
        res();
      };
      aset(cut.el, { translateX:cut.enter });
      animate(cut.el, { translateX:[cut.enter, 0], duration:c.in, ease:IN });
      setTimeout(() => {
        try { doSwap(); } catch (_) {}
        animate(cut.el, { translateX:[0, cut.exit], duration:c.out, ease:OUT, onComplete:finish });
      }, c.in);
      setTimeout(finish, c.in + c.out + 200);
    });
  },
};
