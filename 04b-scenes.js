"use strict";

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
             a:panel('a'), b:panel('b'), c:panel('c') };
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

  opening({ root, reveal = () => {} }){
    const el = root;
    if (!el){ reveal(); return { release(){} }; }
    const p = this.parts(el);
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
        setTimeout(() => { revealOnce(); fadeAway(el, 150, finish); }, 450);
      } };
    }

    const MIN = 1000;
    const open = () => {
      if (done) return;
      el.classList.add('scene--set');
      const vec = this.exitVector(p, innerWidth);
      const EXIT = cubicBezier(.7, 0, .18, 1);
      createTimeline()
        .add(p.a.el, Object.assign({ duration:380, ease:EXIT }, vec(p.a)), 0)
        .add(p.b.el, Object.assign({ duration:360, ease:EXIT }, vec(p.b)), 40)
        .add(p.c.el, Object.assign({ duration:360, ease:EXIT }, vec(p.c)), 70)
        .add(p.base, { translateY:[0, innerHeight + 24], duration:380, ease:EXIT }, 60)
        .call(revealOnce, 100)
        .call(finish, 480);
    };

    return { release(){
      if (released) return; released = true;
      setTimeout(open, Math.max(0, MIN - performance.now()));
    } };
  },

  veil(word, kick){
    const el = document.createElement('div');
    el.className = 'veil';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<p class="veil__kick">${esc(kick || '')}</p><p class="veil__word">${esc(word || '')}</p>`;
    document.body.appendChild(el);
    return { el, word:el.querySelector('.veil__word'), kick:el.querySelector('.veil__kick') };
  },

  enter({ swap, reveal = () => {} }){
    if (this.busy) return;
    this.busy = true;
    const v = this.veil('', '');
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(fuse);
      try { v.el.remove(); } catch (_) {}
      this.busy = false;
    };
    const fuse = setTimeout(() => { try { swap(); } catch (_) {} finish(); }, 3000);
    const doSwap = () => { try { swap(); } catch (_) {} };

    if (Motion.off){
      doSwap();
      setTimeout(() => { reveal(); fadeAway(v.el, 150, finish); }, 120);
      return;
    }

    aset(v.el, { translateY:'-100%' });
    createTimeline({ onComplete:finish })
      .add(v.el, { translateY:['-100%', '0%'], duration:300, ease:cubicBezier(.6, 0, .2, 1) }, 0)
      .call(doSwap, 320)
      .add(v.el, { translateY:['0%', '-100%'], duration:360, ease:cubicBezier(.7, 0, .2, 1) }, 380)
      .call(reveal, 480);
  },

  exit({ swap, fail, btn = null } = {}){
    const doSwap = typeof swap === 'function' ? swap : () => Promise.resolve();
    const oops = typeof fail === 'function' ? fail : () => {};
    if (this.busy) return;
    this.busy = true;

    const v = this.veil('Signed out', 'Keystamp / Key Club attendance');
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(fuse);
      try { v.el.remove(); } catch (_) {}
      this.busy = false;
    };
    const fuse = setTimeout(finish, 4000);
    const swapNow = () => Promise.resolve().then(doSwap).catch(err => { oops(err); return 'failed'; });

    if (Motion.off){
      setTimeout(async () => {
        await swapNow();
        setTimeout(() => fadeAway(v.el, 150, finish), 520);
      }, 120);
      return;
    }

    if (btn){
      aset(btn, { scale:.94 });
      animate(btn, { scale:1, duration:110, delay:90, ease:'outQuad', onComplete(){ btn.style.transform = ''; } });
    }

    aset(v.el, { translateY:'-100%' });
    aset([v.word, v.kick], { opacity:0 });
    let swapped = null;
    createTimeline()
      .add(v.el, { translateY:['-100%', '0%'], duration:320, ease:cubicBezier(.5, 0, .12, 1) }, 0)
      .add(v.word, { opacity:[0, 1], duration:1 }, 300)
      .add(v.word, { scale:[1.2, 1], duration:110, ease:STEP(3) }, 300)
      .add(v.kick, { opacity:[0, 1], duration:1 }, 380)
      .call(() => { swapped = swapNow(); }, 340)
      .call(async () => {
        if (done) return;
        const res = swapped ? await swapped : null;
        if (res === 'failed'){
          animate(v.el, { translateY:['0%', '-100%'], duration:300, ease:cubicBezier(.7, 0, .2, 1), onComplete:finish });
          return;
        }
        animate(v.el, { translateY:['0%', '100%'], duration:380, ease:cubicBezier(.55, 0, 1, .45), onComplete:finish });
        const panel = $('.authp');
        if (panel) animate(panel, { translateY:[6, 0], duration:160, delay:220, ease:'outQuad',
          onComplete(){ panel.style.transform = ''; } });
      }, 900);
  },
};

const Transit = {
  ORDER: { home:0, record:1, scan:2, rewards:3, profile:4,
           board:0, bmeet:1, bcheckin:2, bmembers:3, baccount:4 },

  CHAR: {
    home:    { dur:260, angle:9, tone:true },
    record:  { dur:280, angle:4 },
    scan:    { dur:220, angle:0 },
    rewards: { dur:280, angle:7 },
    profile: { dur:300, angle:6 },
    board:   { dur:240, angle:0, crisp:true },
    auth:    { dur:240, angle:3 },
  },

  profile(to){
    if (this.CHAR[to]) return this.CHAR[to];
    return to && to[0] === 'b' ? this.CHAR.board : this.CHAR.home;
  },

  direction(from, to){
    const a = this.ORDER[from], b = this.ORDER[to];
    if (a === undefined || b === undefined || a === b) return 1;
    return b > a ? 1 : -1;
  },

  frame(view){
    const r = view.getBoundingClientRect();
    const shown = el => el && getComputedStyle(el).display !== 'none';
    const bar = $('.topbar'), tabs = $('.tabs');
    const top = shown(bar) ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
    const floor = shown(tabs) ? tabs.getBoundingClientRect().top : innerHeight;
    return { left:r.left, width:r.width, top, height:Math.max(0, floor - top), viewTop:r.top };
  },

  clone(view, f){
    const clone = view.cloneNode(true);
    clone.removeAttribute('id');
    clone.removeAttribute('tabindex');
    clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    const cs = getComputedStyle(view);
    clone.style.cssText = `position:absolute;left:0;top:${f.viewTop - f.top}px;width:${f.width}px;` +
      `box-sizing:${cs.boxSizing};padding:${cs.padding};margin:0;max-width:none`;
    const src = view.querySelectorAll('canvas'), dst = clone.querySelectorAll('canvas');
    src.forEach((cv, i) => { try { dst[i].getContext('2d').drawImage(cv, 0, 0); } catch (_) {} });
    return clone;
  },

  run(from, to, swap, reveal){
    const view = $('#view');
    const doSwap = typeof swap === 'function' ? swap : () => {};
    const doReveal = typeof reveal === 'function' ? reveal : () => {};
    if (!window.animate || !view){ doSwap(); doReveal(); return Promise.resolve(); }

    const f = this.frame(view);
    const box = document.createElement('div');
    box.className = 'wipe';
    const page = document.createElement('div');
    page.className = 'wipe__page';
    page.appendChild(this.clone(view, f));
    box.appendChild(page);
    box.style.cssText = `left:${f.left}px;top:${f.top}px;width:${f.width}px;height:${f.height}px`;
    document.body.appendChild(box);

    return new Promise(res => {
      let settled = false;
      const finish = () => {
        if (settled) return; settled = true;
        try { box.remove(); } catch (_) {}
        Motion.settle(view);
        res();
      };

      if (Motion.reduced){
        doSwap(); doReveal();
        animate(box, { opacity:[1, 0], duration:140, ease:'linear', onComplete:finish });
        setTimeout(finish, 420);
        return;
      }

      const c = this.profile(to);
      const dir = this.direction(from, to);
      const W = f.width, H = f.height;
      const off = Math.round(Math.tan(c.angle * Math.PI / 180) * H);
      const D = W + off;

      box.style.left = (dir > 0 ? f.left : f.left - off) + 'px';
      box.style.width = D + 'px';
      box.style.clipPath = dir > 0
        ? `polygon(0 0, ${W}px 0, 100% 100%, 0 100%)`
        : `polygon(${off}px 0, 100% 0, 100% 100%, 0 100%)`;
      page.style.left = (dir > 0 ? 0 : off) + 'px';

      const strip = (cls, T) => {
        const el = document.createElement('i');
        el.className = cls;
        el.style.width = (T + off) + 'px';
        if (dir > 0){
          el.style.right = '0';
          el.style.clipPath = `polygon(0 0, ${T}px 0, 100% 100%, ${off}px 100%)`;
        } else {
          el.style.left = '0';
          el.style.clipPath = `polygon(${off}px 0, 100% 0, ${T}px 100%, 0 100%)`;
        }
        box.appendChild(el);
      };
      if (c.tone) strip('wipe__tone', Math.round(W * .1));
      strip('wipe__edge', 6);

      const E = c.crisp ? cubicBezier(.85, 0, .1, 1) : cubicBezier(.7, 0, .2, 1);
      doSwap();
      aset(view, { translateX:dir * 10 });
      animate(view, { translateX:0, duration:c.dur, ease:'outCubic' });
      animate(box,  { translateX:[0, -dir * D], duration:c.dur, ease:E });
      animate(page, { translateX:[0,  dir * D], duration:c.dur, ease:E, onComplete:finish });
      setTimeout(doReveal, Math.round(c.dur * .45));
      setTimeout(finish, c.dur + 300);
    });
  },
};
