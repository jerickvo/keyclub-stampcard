"use strict";

const SCENE_MARKUP = tail => `
  <div class="scene__base"></div>
  <div class="scene__grid">
    <div class="scene__panel scene__panel--a"><i class="scene__ink"></i><i class="scene__edge"></i><p class="scene__word">Keystamp</p></div>
    <div class="scene__panel scene__panel--b"><i class="scene__ink"></i><i class="scene__edge"></i>
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
      /* taps are swallowed until the cover is gone, not while it fades */
      return { release(){
        if (released) return; released = true;
        revealOnce(); fadeAway(el, 150, finish);
      } };
    }

    if (!boot) el.classList.add('scene--play');

    /* held until the title is stamped (the printing runs in CSS, from
       the cover's first frame), a short pause, and never less than MIN */
    const MIN = 520, PAUSE = 150;
    const printed = () => {
      const word = el.querySelector('.scene__word');
      const run = word && word.getAnimations ? word.getAnimations() : [];
      return Promise.race([Promise.all(run.map(a => a.finished)).catch(() => {}),
                           new Promise(r => setTimeout(r, 900))]);
    };
    /* then one cut takes the cover away, the way a page is turned in the
       book; the page under it takes taps from the moment the blade moves */
    const open = () => {
      if (done) return;
      el.classList.add('scene--set');
      el.style.pointerEvents = 'none';
      const vw = document.documentElement.clientWidth;
      const f = { left:0, top:0, width:vw, height:innerHeight };
      setTimeout(revealOnce, 60);
      Ink.cut(el, f, 1, vw < 600 ? { dur:280, angle:8, body:16, trail:90, z:201 } : { dur:340, angle:11, body:24, trail:160, z:201 })
        .then(finish);
    };

    return { release(){
      if (released) return; released = true;
      printed().then(() => setTimeout(open, Math.max(PAUSE, MIN - (performance.now() - t0))));
    } };
  },

  /* the page as it is printed this moment: the shell and its tab bar
     copied onto one sheet of the paper (no ids, no focus, no pointer),
     at the scroll it is read at, clipped to `clip` */
  snapshot(W, H, clip){
    const wrap = document.createElement('div');
    wrap.className = 'cutsheet outpiece';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.inert = true;
    wrap.style.cssText = `left:0;top:0;width:${W}px;height:${H}px;clip-path:${clip}`;
    const y = scrollY;
    const copy = src => {
      const c = src.cloneNode(true);
      c.removeAttribute('id');
      c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
      const from = src.querySelectorAll('canvas'), to = c.querySelectorAll('canvas');
      from.forEach((cv, i) => { try { to[i].getContext('2d').drawImage(cv, 0, 0); } catch (_) {} });
      return c;
    };
    const shell = $('#shell');
    if (shell){
      const c = copy(shell);
      c.style.cssText = `position:absolute;left:0;top:${-y}px;width:${shell.offsetWidth}px;margin:0;` +
        `grid-template-columns:${getComputedStyle(shell).gridTemplateColumns}`;
      /* the page column's own measure is set on its id, which a copy has not */
      const view = $('#view'), cv = c.querySelector('main');
      if (view && cv){
        const cs = getComputedStyle(view);
        cv.style.cssText = `width:100%;max-width:${cs.maxWidth};margin-inline:auto;padding:${cs.padding};` +
          `--safe-x:${cs.getPropertyValue('--safe-x') || '0px'}`;
      }
      /* the rail is held at the top of the window by sticking; on the
         copy, which does not scroll, it is put there */
      const rail = c.querySelector('.rail');
      if (rail && getComputedStyle($('.rail')).display !== 'none') rail.style.cssText = `position:relative;top:${y}px`;
      wrap.appendChild(c);
    }
    const tabs = $('#tabs');
    if (tabs && getComputedStyle(tabs).display !== 'none') wrap.appendChild(copy(tabs));
    return wrap;
  },

  exit({ swap, fail, btn = null } = {}){
    const doSwap = typeof swap === 'function' ? swap : () => Promise.resolve();
    const oops = typeof fail === 'function' ? fail : () => {};
    if (this.busy) return;
    this.busy = true;
    if (!Motion.off) return this.cutApart({ btn, doSwap, oops });

    /* with motion reduced nothing is cut and nothing covers the page:
       a still tag says it while the sign-out is made, taps are held,
       and the sign-in page is the change */
    const base = document.createElement('div');
    base.className = 'outbase';
    base.setAttribute('aria-hidden', 'true');
    const tag = document.createElement('p');
    tag.className = 'outtag';
    tag.textContent = 'Signing out';
    document.body.append(base, tag);
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(fuse);
      [base, tag].forEach(x => { try { x.remove(); } catch (_) {} });
      this.busy = false;
    };
    /* held as long as a sign-out can take (its start delay, the 5 s wait
       for the server, the re-read), so it never lifts onto a page that
       is still signed in */
    const fuse = setTimeout(finish, 8000);
    Promise.resolve().then(doSwap).catch(err => { oops(err); }).then(finish);
  },

  cutApart({ btn, doSwap, oops }){
    /* The page is cut apart and dismissed. A crimson hairline is drawn
       across it on one diagonal, faster and faster; on the hit the two
       halves part around a slit of ink, and hold a moment while the
       sign-out is made under them; then the lower half drops away and
       the upper is thrown off up the cut, and the sign-in page is what
       was under them. No cover, no wait for an animation: the session
       was let go at the tap. */
    Ink.press(btn, 2);
    const W = document.documentElement.clientWidth, H = innerHeight;
    const lean = Math.tan(17 * Math.PI / 180) * H;
    const P1 = [W / 2 + lean / 2, 0], P2 = [W / 2 - lean / 2, H];
    const len = Math.hypot(P2[0] - P1[0], H);
    const n = [H / len, lean / len];          /* across the cut, toward the lower-right half */
    const base = document.createElement('div');
    base.className = 'outbase';
    base.setAttribute('aria-hidden', 'true');
    const A = this.snapshot(W, H, `polygon(0 0, ${P1[0]}px 0, ${P2[0]}px ${H}px, 0 ${H}px)`);
    const B = this.snapshot(W, H, `polygon(${P1[0]}px 0, ${W}px 0, ${W}px ${H}px, ${P2[0]}px ${H}px)`);
    const slash = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    slash.setAttribute('class', 'outslash');
    slash.setAttribute('viewBox', `0 0 ${W} ${H}`);
    slash.setAttribute('aria-hidden', 'true');
    const ext = 40 / len;                      /* past both edges, so its ends are never seen */
    slash.innerHTML = `<line x1="${P1[0] - (P2[0] - P1[0]) * ext}" y1="${-H * ext}" x2="${P2[0] + (P2[0] - P1[0]) * ext}" y2="${H + H * ext}"/>`;
    document.body.append(base, A, B, slash);
    const line = slash.querySelector('line');

    let done = false, tag = null;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(fuse);
      [base, A, B, slash, tag].forEach(x => { try { if (x) x.remove(); } catch (_) {} });
      this.busy = false;
    };
    const fuse = setTimeout(finish, 8000);
    const t0 = performance.now();
    const swapped = Promise.resolve().then(doSwap).then(() => 'ok', err => { oops(err); return 'failed'; });

    /* the stroke: held a breath, then drawn across faster and faster */
    Ink.draw(line, { dur:130, delay:40, ease:EASE.STRIKE });
    let slow = null;
    setTimeout(() => {
      if (done) return;
      /* the hit: the halves part around the slit */
      const gap = 3;
      base.classList.add('outbase--slit');
      animate(A, { translateX:-n[0] * gap, translateY:-n[1] * gap, duration:140, ease:EASE.SNAP });
      animate(B, { translateX:n[0] * gap, translateY:n[1] * gap, duration:140, ease:EASE.SNAP });
      /* a sign-out that takes a while says so, on the slit */
      slow = setTimeout(() => {
        if (done) return;
        tag = document.createElement('p');
        tag.className = 'outtag';
        tag.textContent = 'Signing out';
        document.body.appendChild(tag);
      }, 700);
    }, 170);

    swapped.then(res => {
      const wait = Math.max(0, 330 - (performance.now() - t0));
      setTimeout(() => {
        if (done) return;
        clearTimeout(slow);
        if (tag){ tag.remove(); tag = null; }
        if (res === 'failed'){
          /* still signed in: the halves close back over the page it is */
          [A, B].forEach(x => animate(x, { translateX:0, translateY:0, duration:140, ease:EASE.SNAP }));
          animate(slash, { opacity:0, duration:120, ease:'linear' });
          setTimeout(finish, 180);
          return;
        }
        /* dismissed: the slit goes, the halves go, the page under is the
           sign-in page */
        base.remove();
        animate(slash, { opacity:0, duration:90, ease:'linear' });
        animate(B, { translateX:n[0] * 3 + W * .06, translateY:H * 1.08, rotate:5, duration:430, ease:EASE.FALL });
        animate(A, { translateX:-W * .32, translateY:-H * .9, rotate:-3, duration:430, delay:40, ease:EASE.FALL });
        setTimeout(() => {
          const panel = $('.authp');
          if (panel) Ink.settle(panel);
        }, 220);
        setTimeout(finish, 500);
      }, wait);
    });
  },
};

const Transit = {
  running: false,

  /* Work that would be seen as a stutter waits for the cut to finish.
     Under the blade there is little to see anyway, and the deadline means
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
           board:0, bcheckin:1, bmeet:2, bmembers:3 },

  /* one cut for every page turn: a blade crosses the column in tab order,
     the page being left ahead of its cutting edge and the new page behind
     it, a screentone trail fading over the new page as it goes. The page
     itself never moves; the blade does. A held start and then all at
     once, the way a slash is. */
  CUT: { dur:300, narrowDur:240, angle:11, narrowAngle:8 },

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

  /* the page being left, as it was printed: a copy laid over the column
     (no ids, no focus, no pointer), on the same paper, at the same scroll */
  sheet(view, f){
    const r = view.getBoundingClientRect();
    const cs = getComputedStyle(view);
    const wrap = document.createElement('div');
    wrap.className = 'cutsheet';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.inert = true;
    wrap.style.cssText = `left:${f.left}px;top:${f.top}px;width:${f.width}px;height:${f.height}px`;
    const page = view.cloneNode(true);
    page.removeAttribute('id');
    page.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    page.style.cssText = `position:absolute;left:${r.left - f.left}px;top:${r.top - f.top}px;width:${r.width}px;` +
      `max-width:none;margin:0;padding:${cs.padding};--safe-x:${cs.getPropertyValue('--safe-x') || '0px'}`;
    /* a drawn canvas (the wall code) is copied as drawn */
    const from = view.querySelectorAll('canvas'), to = page.querySelectorAll('canvas');
    from.forEach((c, i) => { try { to[i].getContext('2d').drawImage(c, 0, 0); } catch (_) {} });
    wrap.appendChild(page);
    document.body.appendChild(wrap);
    return wrap;
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
    const f = this.frame(view);
    const narrow = f.width < 600;
    const old = this.sheet(view, f);
    /* the new page is set under the copy at once; the blade uncovers it */
    try { doSwap(); } catch (_) {}
    const cut = Ink.cut(old, f, dir, narrow
      ? { dur:this.CUT.narrowDur, angle:this.CUT.narrowAngle, body:14, trail:80 }
      : { dur:this.CUT.dur, angle:this.CUT.angle, body:22, trail:150 });
    return cut.then(() => {
      Transit.running = false;
      try { old.remove(); } catch (_) {}
      Motion.settle(view);
    });
  },
};
