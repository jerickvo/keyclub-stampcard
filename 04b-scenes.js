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
      el.style.setProperty('--lead', '170ms');
      el.innerHTML = SCENE_MARKUP(tail);
      document.body.appendChild(el);
    } else {
      const t = el.querySelector('.scene__tail');
      if (t) t.textContent = tail;
    }
    const p = this.parts(el);
    const lead = boot ? 0 : 170;
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
        setTimeout(() => { revealOnce(); fadeAway(el, 150, finish); }, 450);
      } };
    }

    if (!boot) el.classList.add('scene--play');
    const hit = lead + 500 - (performance.now() - t0);
    if (hit > -80) setTimeout(() => Impact.shake(p.grid, 4, 90), Math.max(0, hit));

    const MIN = lead + 1000;
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
    el.innerHTML = SCENE_MARKUP('Until next meeting');
    document.body.appendChild(el);
    const p = this.parts(el);
    p.word.textContent = 'Signed out';
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
    const swapNow = () => Promise.resolve().then(doSwap).catch(err => { oops(err); return 'failed'; });

    if (Motion.off){
      [p.word, p.kick, p.tail, p.seal].forEach(x => { x.style.opacity = '1'; });
      setTimeout(async () => {
        await swapNow();
        setTimeout(() => fadeAway(el, 150, finish), 520);
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
    setTimeout(() => Impact.shake(p.grid, 3, 80), 300);

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
    setTimeout(drop, 940);
  },
};

const Transit = {
  ORDER: { home:0, record:1, scan:2, rewards:3, profile:4,
           board:0, bmeet:1, bcheckin:2, bmembers:3, baccount:4 },

  CHAR: {
    home:    { dist:22, out:110, in:230, bar:true,  ease:() => EASE.CUT },
    record:  { dist:10, out:120, in:260, bar:false, ease:() => 'outCubic' },
    scan:    { dist:8,  out:80,  in:170, bar:false, ease:() => STEP(2), snap:true },
    rewards: { dist:16, out:110, in:280, bar:true,  ease:() => cubicBezier(.2, .9, .3, 1.04), flash:true },
    profile: { dist:8,  out:140, in:320, bar:false, ease:() => 'outQuad' },
    board:   { dist:14, out:90,  in:170, bar:true,  ease:() => STEP(3) },
    auth:    { dist:0,  out:110, in:200, bar:false, ease:() => 'outQuad' },
  },

  profile(to){
    if (this.CHAR[to]) return this.CHAR[to];
    return to && to[0] === 'b' ? this.CHAR.board : this.CHAR.home;
  },

  direction(from, to){
    const a = this.ORDER[from], b = this.ORDER[to];
    if (a === undefined || b === undefined || a === b) return 0;
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

  ghost(view, f){
    const box = document.createElement('div');
    box.className = 'ghost';
    box.style.cssText = `left:${f.left}px;top:${f.top}px;width:${f.width}px;height:${f.height}px`;
    const clone = view.cloneNode(true);
    clone.removeAttribute('id');
    clone.removeAttribute('tabindex');
    clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    const cs = getComputedStyle(view);
    clone.style.cssText = `position:absolute;left:0;top:${f.viewTop - f.top}px;width:${f.width}px;` +
      `box-sizing:${cs.boxSizing};padding:${cs.padding};margin:0;max-width:none`;
    const src = view.querySelectorAll('canvas'), dst = clone.querySelectorAll('canvas');
    src.forEach((cv, i) => { try { dst[i].getContext('2d').drawImage(cv, 0, 0); } catch (_) {} });
    box.appendChild(clone);
    document.body.appendChild(box);
    return box;
  },

  run(from, to, swap){
    const view = $('#view');
    const doSwap = typeof swap === 'function' ? swap : () => {};
    if (Motion.off || !view){ doSwap(); return Promise.resolve(); }

    const c = this.profile(to);
    const dir = this.direction(from, to);
    const dx = dir * c.dist;
    const scale = c.snap ? 1.025 : 1;
    const f = this.frame(view);
    const box = this.ghost(view, f);

    return new Promise(res => {
      let settled = false;
      const finish = () => {
        if (settled) return; settled = true;
        try { box.remove(); } catch (_) {}
        Motion.settle(view);
        res();
      };

      try { doSwap(); } catch (_) {}
      aset(view, { opacity:0, translateX:dx, scale });

      animate(box, { opacity:[1, 0], translateX:[0, -dx * 1.4], duration:c.out, ease:'inQuad' });
      if (c.bar && dir) this.bar(f, dir, c.out + c.in * .4);
      if (c.flash) Impact.flash(.14, { dur:70, delay:c.out * .5 });
      animate(view, { opacity:[0, 1], translateX:[dx, 0], scale:[scale, 1],
                      duration:c.in, delay:Math.round(c.out * .35), ease:c.ease(),
                      onComplete:finish });

      setTimeout(finish, c.out + c.in + 200);
    });
  },

  bar(f, dir, dur){
    const el = document.createElement('i');
    el.className = 'gutterbar';
    el.style.cssText = `left:${f.left}px;top:${f.top}px;height:${f.height}px`;
    const from = dir > 0 ? f.width + 12 : -20;
    const to   = dir > 0 ? -20 : f.width + 12;
    aset(el, { translateX:from, opacity:1 });
    document.body.appendChild(el);
    animate(el, { translateX:[from, to], duration:dur, ease:'inOutQuad',
                  onComplete:() => el.remove() });
  },
};
