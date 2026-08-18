"use strict";
/* keystamp — ink.

   The critique that mattered most: every line on this page was
   `border: 3px solid`. Machine-straight, uniform weight end to end,
   mathematically square corners. Manga's defining quality is not black
   and white or panels or screentone — it is that a person drew it.

   So panel edges are no longer borders. Each one is a filled SVG band:
   an outer contour and an inner contour, each wobbling on its own seed.
   Where the two diverge the edge swells; where they converge it thins.
   That is what a loaded brush does, and it is why a single stroked path
   cannot fake it — stroke-width is constant by definition, so the ink
   has to be a filled shape with two independent edges.

   Layout is untouched. The CSS border stays exactly where it was and
   simply turns transparent, so every box keeps its geometry and only
   its appearance changes. */

const Ink = {
  on: true,
  ro: null,

  /* deterministic per element, so a panel redraws identically on resize
     instead of shimmering into a new shape every time the window moves */
  rng(seed){
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = s * 16807 % 2147483647) / 2147483647;
  },

  /* One contour, returned as four SEPARATE sides.

     The first version returned a single ring of points and smoothed a
     quadratic through all of them, corners included — which rounded the
     corners off and made every panel render as a rounded rectangle.
     That is the one shape a manga panel never is. Sides are kept apart
     so the wobble can be smoothed along each edge while the four
     corners stay hard. */
  contour(w, h, inset, jit, rnd, per){
    const W = w - inset * 2, H = h - inset * 2;
    const j = () => (rnd() - .5) * jit;
    const n = s => Math.max(2, Math.round(s / per));
    const side = (ax, ay, bx, by, steps) => {
      const out = [[ax, ay]];                       /* exact corner */
      for (let i = 1; i < steps; i++){
        const t = i / steps;
        out.push([ax + (bx - ax) * t + j(), ay + (by - ay) * t + j()]);
      }
      return out;
    };
    const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
    return [
      side(x0, y0, x1, y0, n(W)),
      side(x1, y0, x1, y1, n(H)),
      side(x1, y1, x0, y1, n(W)),
      side(x0, y1, x0, y0, n(H)),
    ];
  },

  /* Smooth along each side, hard corner between sides. */
  d(sides){
    const f = v => v.toFixed(1);
    const first = sides[0][0];
    let out = `M${f(first[0])} ${f(first[1])}`;
    sides.forEach(pts => {
      out += `L${f(pts[0][0])} ${f(pts[0][1])}`;    /* land the corner */
      for (let i = 1; i < pts.length; i++){
        const p = pts[i];
        const nx = pts[i + 1] || p;
        const q = [(p[0] + nx[0]) / 2, (p[1] + nx[1]) / 2];
        out += `Q${f(p[0])} ${f(p[1])} ${f(q[0])} ${f(q[1])}`;
      }
    });
    return out + 'Z';
  },

  draw(el){
    if (!this.on) return;
    /* offsetWidth/Height, not getBoundingClientRect: several panels carry
       a fraction of a degree of rotation, and a transformed element's
       client rect is its *bounding* box, which is larger than the box the
       SVG actually overlays. Measuring the rect drew every rotated panel's
       ink at the wrong size. */
    const w = el.offsetWidth, h = el.offsetHeight;
    if (w < 8 || h < 8) return;
    /* drawing inside an observed element can retrigger the observer, so
       bail when nothing actually changed — otherwise the loop warns */
    if (el._inkW === w && el._inkH === h) return;
    el._inkW = w; el._inkH = h;

    const mode   = el.dataset.ink || 'frame';
    /* --ink-w lets the art-direction layer set weight by a panel's rank
       on the page (lead / mid / quiet) rather than per element. A panel
       that matters is inked heavier, which is how a page tells you where
       to look before you have read a word. The data attribute still wins
       where a specific panel was tuned by hand. */
    const rankW  = parseFloat(getComputedStyle(el).getPropertyValue('--ink-w'));
    /* a pinned weight of 0 is meaningful — it is how 'fill' mode asks for
       a solid panel — so test for presence, not truthiness */
    const pinned = el.dataset.inkWeight;
    const weight = (pinned !== undefined && pinned !== '')
      ? parseFloat(pinned)
      : (rankW > 0 ? rankW : 3);
    const jit    = parseFloat(el.dataset.inkJit) || 1.15;
    const per    = w > 700 ? 34 : 22;          /* sample density */
    const seed   = (w * 31 + h * 17 + (el.dataset.inkSeed | 0) * 7) || 1;

    let svg = el.querySelector(':scope > .inkframe');
    if (!svg){
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'inkframe');
      svg.setAttribute('aria-hidden', 'true');
      el.insertBefore(svg, el.firstChild);
    }
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    const rnd = this.rng(seed);
    const outer = this.contour(w, h, weight / 2, jit, rnd, per);

    let d;
    if (mode === 'fill'){
      /* a solid panel: the wobble is the silhouette, not a band */
      d = this.d(outer);
    } else {
      const inner = this.contour(w, h, weight * 1.5, jit * .85, this.rng(seed + 991), per);
      d = this.d(outer) + this.d(inner.map(side => [...side].reverse()).reverse());
    }
    svg.innerHTML = `<path d="${d}" fill="currentColor" fill-rule="evenodd"/>`;
  },

  drawAll(root){
    (root || document).querySelectorAll('[data-ink]').forEach(el => this.draw(el));
  },

  /* elements the app generates get their ink assigned here rather than in
     every view function, so the views stay markup and this stays drawing */
  apply(root){
    const scope = root || document;
    /* weight === null means "let the panel's rank decide" — the art
       direction layer sets --ink-w per rank, and draw() reads it. Passing
       a number still pins a specific element, and any previously pinned
       value is cleared so rank can take over. */
    const set = (sel, mode, weight, jit) =>
      scope.querySelectorAll(sel).forEach((el, i) => {
        el.dataset.ink = mode;
        if (weight === null) delete el.dataset.inkWeight;
        else el.dataset.inkWeight = weight;
        el.dataset.inkJit = jit;
        el.dataset.inkSeed = i + 1;
      });

    set('.panel:not(.p-deep):not(.p-shout)', 'frame', null, 1.25);
    set('.panel.p-deep, .panel.p-shout, .strike:not(.strike--calm)', 'fill', 0, 1.9);
    set('.strike--calm', 'frame', 3.4, 1.3);
    set('.head', 'frame', null, 1.2);
    set('.seal--set', 'fill', 0, 1.5);
    set('.seal:not(.seal--set)', 'frame', 2.4, 1.1);
    set('.narr', 'frame', 2.2, .9);
    set('.qrpanel, .manual, .viewer, .stat', 'frame', null, 1.2);
    set('.rec--open', 'frame', null, 1.5);
    set('.rec--set, .rec--upcoming, .rec--miss', 'frame', null, 1.1);
    this.drawAll(scope);

    if (!this.ro && 'ResizeObserver' in window){
      /* Draws are deferred out of the observer callback. Writing SVG
         inside the callback can resize the observed element, which
         retriggers the observer in the same frame — that is the
         "loop completed with undelivered notifications" warning. One
         rAF puts the write in the next frame and the loop closes. */
      this.ro = new ResizeObserver(entries => {
        const targets = entries.map(e => e.target);
        requestAnimationFrame(() => targets.forEach(t => this.draw(t)));
      });
    }
    if (this.ro) scope.querySelectorAll('[data-ink]').forEach(el => this.ro.observe(el));

    /* Grid children are measured before the grid has resolved, so the
       first pass can size a cell from a stale box. Clear the cache and
       redraw once layout has actually settled. */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scope.querySelectorAll('[data-ink]').forEach(el => { el._inkW = 0; el._inkH = 0; });
      this.drawAll(scope);
    }));
  },

  clear(){
    if (this.ro) this.ro.disconnect();
  },
};
