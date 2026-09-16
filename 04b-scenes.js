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
    home:    { in:170, hold:100, out:230, angle:9, par:26, tone:true },
    record:  { in:200, hold:120, out:280, angle:4, par:16 },
    scan:    { in:150, hold:80,  out:200, angle:0, par:10 },
    rewards: { in:180, hold:120, out:260, angle:7, par:22, layered:true, flash:true },
    profile: { in:220, hold:130, out:300, angle:6, par:14 },
    board:   { in:160, hold:90,  out:210, angle:0, par:12, crisp:true },
    auth:    { in:180, hold:90,  out:240, angle:3, par:0,  vertical:true },
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

  slab(f, dir, c){
    const box = document.createElement('div');
    box.className = 'cutbox';
    box.style.cssText = `left:${f.left}px;top:${f.top}px;width:${f.width}px;height:${f.height}px`;
    const W = f.width, H = f.height, rad = c.angle * Math.PI / 180;
    const vertical = Boolean(c.vertical) || dir === 0;
    const make = cls => {
      const el = document.createElement('div');
      el.className = 'slab' + (cls ? ' ' + cls : '');
      return el;
    };
    let off, enter, axis, shape;
    if (!vertical){
      off = Math.round(Math.tan(rad) * H);
      shape = el => {
        el.style.cssText += `;left:${-off}px;top:0;width:${W + 2 * off}px;height:${H}px`;
        el.style.clipPath = dir > 0
          ? `polygon(${off}px 0, 100% 0, calc(100% - ${off}px) 100%, 0 100%)`
          : `polygon(0 0, calc(100% - ${off}px) 0, 100% 100%, ${off}px 100%)`;
      };
      axis = 'translateX';
      enter = dir > 0 ? W + off : -(W + off);
    } else {
      off = Math.round(Math.tan(rad) * W);
      shape = el => {
        el.style.cssText += `;left:0;top:${-off}px;width:${W}px;height:${H + 2 * off}px`;
        el.style.clipPath = `polygon(0 ${off}px, 100% 0, 100% calc(100% - ${off}px), 0 100%)`;
      };
      axis = 'translateY';
      enter = -(H + off);
    }
    const under = c.layered ? make('slab--tone') : null;
    if (under){ shape(under); box.appendChild(under); }
    const el = make('');
    shape(el);
    if (c.tone && !vertical){
      const t = document.createElement('i');
      t.className = 'slab__tone';
      const S = Math.round(W * .12) + off;
      t.style.cssText = (dir > 0 ? 'left:0;' : 'right:0;') + `width:${S}px`;
      t.style.clipPath = dir > 0
        ? `polygon(${off}px 0, 100% 0, calc(100% - ${off}px) 100%, 0 100%)`
        : `polygon(0 0, calc(100% - ${off}px) 0, 100% 100%, ${off}px 100%)`;
      el.appendChild(t);
    }
    box.appendChild(el);
    document.body.appendChild(box);
    return { box, el, under, off, enter, exit:-enter, axis, vertical };
  },

  word(view, f, cut){
    const title = view.querySelector('.rechead__title');
    if (!title) return null;
    const r = title.getBoundingClientRect();
    if (r.width < 4 || r.top < f.top - 4 || r.bottom > f.top + f.height + 4) return null;
    const cs = getComputedStyle(title);
    const w = document.createElement('p');
    w.className = 'slab__word';
    w.textContent = title.textContent;
    const x = r.left - f.left + (cut.vertical ? 0 : cut.off);
    const y = r.top - f.top + (cut.vertical ? cut.off : 0);
    w.style.cssText = `left:${x}px;top:${y}px;width:${Math.ceil(r.width) + 6}px;` +
      `font-family:${cs.fontFamily};font-size:${cs.fontSize};font-weight:${cs.fontWeight};` +
      `font-style:${cs.fontStyle};letter-spacing:${cs.letterSpacing};text-transform:${cs.textTransform};` +
      `line-height:${cs.lineHeight};padding:${cs.padding}`;
    cut.el.appendChild(w);
    return w;
  },

  run(from, to, swap){
    const view = $('#view');
    const doSwap = typeof swap === 'function' ? swap : () => {};
    if (!window.animate || !view){ doSwap(); return Promise.resolve(); }

    const f = this.frame(view);
    const box = this.ghost(view, f);

    if (Motion.reduced){
      return new Promise(res => {
        let done = false;
        const finish = () => { if (done) return; done = true; try { box.remove(); } catch (_) {} Motion.settle(view); res(); };
        try { doSwap(); } catch (_) {}
        animate(box, { opacity:[1, 0], duration:140, ease:'linear', onComplete:finish });
        setTimeout(finish, 420);
      });
    }

    const c = this.profile(to);
    const dir = this.direction(from, to);
    const cut = this.slab(f, dir, c);
    const IN  = c.crisp ? cubicBezier(.85, 0, .1, 1) : cubicBezier(.7, 0, .2, 1);
    const OUT = c.crisp ? cubicBezier(.85, 0, .1, 1) : cubicBezier(.55, 0, .12, 1);
    const par = dir * c.par;
    const LAG = 50;

    return new Promise(res => {
      let settled = false;
      const finish = () => {
        if (settled) return; settled = true;
        try { cut.box.remove(); } catch (_) {}
        try { box.remove(); } catch (_) {}
        Motion.settle(view);
        res();
      };

      if (cut.under){
        aset(cut.under, { [cut.axis]:cut.enter });
        animate(cut.under, { [cut.axis]:[cut.enter, 0], duration:c.in, ease:IN });
      }
      aset(cut.el, { [cut.axis]:cut.enter });
      animate(cut.el, { [cut.axis]:[cut.enter, 0], duration:c.in, delay:cut.under ? LAG : 0, ease:IN });
      if (par) animate(box, { translateX:[0, -par], duration:c.in, ease:'outQuad' });

      const covered = c.in + (cut.under ? LAG : 0);
      setTimeout(() => {
        try { doSwap(); } catch (_) {}
        try { box.remove(); } catch (_) {}
        aset(view, { translateX:par * .6 });
        const w = this.word(view, f, cut);
        if (w){
          aset(w, { opacity:0, scale:1.18 });
          animate(w, { opacity:[0, 1], duration:1, delay:20 });
          animate(w, { scale:[1.18, 1], duration:90, delay:20, ease:STEP(2) });
        }
      }, covered);

      const leave = covered + c.hold;
      setTimeout(() => {
        animate(cut.el, { [cut.axis]:[0, cut.exit], duration:c.out, ease:OUT });
        if (cut.under) animate(cut.under, { [cut.axis]:[0, cut.exit], duration:c.out, delay:LAG, ease:OUT });
        if (c.flash) Impact.flash(.14, { dur:70, delay:30 });
        animate(view, { translateX:[par * .6, 0], duration:c.out, ease:'outCubic', onComplete:finish });
      }, leave);

      setTimeout(finish, leave + c.out + (cut.under ? LAG : 0) + 200);
    });
  },
};
