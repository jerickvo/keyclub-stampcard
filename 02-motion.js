"use strict";
/* keystamp — Motion base layer, utilities, ambient background
   Loaded in order by index.html. Order matters. */

/* ══════════════════════════════════════════════════════════════════
   4. MOTION — the base layer every triggered animation goes through.
   Division of labour: anime.js owns everything discrete and triggered.
   CSS keyframes own only the endless ambient loops (the turning
   structure, the scan line, the waiting slot), because an anime
   instance looping forever burns a phone battery for no gain.
   ══════════════════════════════════════════════════════════════════ */
const systemReducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
};

const Motion = {
  forced: false,
  E: cubicBezier(.22,.61,.36,1),
  get off(){ return this.forced || !window.animate || systemReducedMotion(); },

  exit(scope){
    if (this.off) return Promise.resolve();
    /* anime.js v4's animate() return value is itself thenable — it
       resolves when the animation completes. There is no `.finished`
       property on it (that was a v3/WAAPI habit); reading it just
       gives `undefined`, and `await undefined` resolves on the next
       microtask instead of waiting ~130ms for the real exit to play
       out. That let the caller reset the view's inline style while
       this animation was still running, and the animation then kept
       writing opacity/transform over the reset for its full duration
       — landing the freshly-rendered next page at opacity:0. */
    return animate(scope, { opacity:[1,0], translateX:[0,-14], skewX:[0,-2.5],
                   duration:130, ease:'inQuad' });
  },

  /* THE STRIKE. This was a Material ripple — a circle expanding from
     the pointer over 560ms on an outQuad. That gesture belongs to a
     different design language entirely: it is soft, it is round, and
     it is the single most recognisable "generic app" motion there is.

     A control in this system is struck, not rippled. The whole face
     inverts for two frames and cuts back. No travel, no curve, no
     radius, nothing to follow with the eye — you register that it
     happened rather than watching it happen. */
  ripple(btn){
    if (this.off) return;
    const s = document.createElement('span');
    s.className = 'btn__strike';
    btn.appendChild(s);
    animate(s, { opacity:[1, 1, 0], duration:110,
            ease: (typeof steps === 'function' ? steps(2) : undefined),
            onComplete:() => s.remove() });
  },

  /* energy accumulating: overshoots, then settles. scaleX not width —
     animating width relayouts the page every frame. */
  meter(el, pct, delay = 220){
    if (!el) return;
    const to = pct / 100;
    if (this.off){ el.style.transform = `scaleX(${to})`; return; }
    animate(el, { scaleX:[0, Math.min(1, to + .03), to],
            duration:1050, delay, ease:cubicBezier(.16,.84,.36,1) });
  },

  countUp(el, to, delay = 140){
    if (!el) return;
    if (this.off){ el.textContent = pad(to); return; }
    const o = { v:0 };
    animate(o, { v:to, modifier:around(0), duration:760, delay,
            ease:'outExpo', onUpdate:() => { el.textContent = pad(o.v); } });
  },

  indicator(ind, target, axis){
    if (!ind || !target || !ind.parentElement) return;
    const p = ind.parentElement.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    if (!t.width) return;                       /* the other nav is display:none */
    const to = axis === 'x'
      ? { translateX: t.left - p.left + t.width * .26, width: t.width * .48, opacity:1 }
      : { translateY: t.top - p.top + (t.height - 18) / 2, opacity:1 };
    if (this.off){
      ind.style.opacity = 1;
      ind.style.transform = axis === 'x'
        ? `translateX(${to.translateX}px)` : `translateY(${to.translateY}px)`;
      if (axis === 'x') ind.style.width = to.width + 'px';
      return;
    }
    animate(ind, { ...to, duration:300, ease:cubicBezier(.03,.88,.12,1) });
  },
};

/* ══════════════════════════════════════════════════════════════════
   4b. REVEAL — panels below the fold wait until you reach them.

   IntersectionObserver only decides *when*; anime.js still does the
   move, so a panel revealed by scrolling and a panel revealed by the
   page entrance are the same animation and land the same way.

   The timeout is not decoration. Anything parked here is sitting at
   opacity 0, and an element that never intersects — inside something
   that turns out not to scroll, or on a screen shorter than the
   observer expected — would stay invisible forever. Six seconds and
   it shows itself regardless.
   ══════════════════════════════════════════════════════════════════ */
/* The entrance used to offset a panel 12px right with a 1.4deg skew and
   slide it home, and the X component had to be zeroed below the tab-bar
   breakpoint because it parked every unrevealed panel past the right
   edge of a 390px screen. Nothing travels now — a panel cuts into place
   and its type is driven down after it — so the offset that needed
   guarding no longer exists to guard. */

/* anime.js leaves its final values inline. A residual
   `transform:translate(0px,0px)` outranks every stylesheet :hover
   transform, so hover states were permanently dead on anything that had
   been revealed. Handing the property back to CSS on completion fixes
   that and leaves no stale offset behind if a later reflow moves things. */
const releaseTransform = els => {
  (Array.isArray(els) ? els : [els]).forEach(el => {
    if (el && el.style) el.style.transform = '';
  });
};

const Reveal = {
  io: null,

  /* Below the fold and above it are the same event, so they are the
     same motion: the panel cuts in, then its heavy type is driven down
     after it. This used to drift and skew on an eased curve while the
     top of the page cut — two different entrances for one page. */
  enter(el){
    clearTimeout(el._revealFuse);
    if (el.dataset.revealed) return;
    el.dataset.revealed = '1';
    animate(el, { opacity:[0, 1], duration:MECH.CUT, ease:STEP(1) });
    FX.slamType(el, MECH.BEAT);
  },

  watch(el){
    if (Motion.off || !('IntersectionObserver' in window)){
      el.style.opacity = '';
      return;
    }
    if (!this.io){
      this.io = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          this.io.unobserve(en.target);
          this.enter(en.target);
        });
      }, { rootMargin:'0px 0px -6% 0px', threshold:.04 });
    }
    this.io.observe(el);
    el._revealFuse = setTimeout(() => {
      this.io?.unobserve(el);
      this.enter(el);
    }, 6000);
  },

  /* the old view's nodes are gone; drop the observer with them */
  clear(){ this.io?.disconnect(); this.io = null; },
};

/* ══════════════════════════════════════════════════════════════════
   5. UTILITIES
   ══════════════════════════════════════════════════════════════════ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const fmtDate = iso => new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
  .toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
const fmtDay = iso => new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
  .toLocaleDateString('en-US', { month:'short', day:'numeric' });
const fmtTime = iso => new Date(iso)
  .toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });

/* NOTIFICATIONS — a keyed, capped register, not an append-only list.

   This used to create an element per call and remove it 4.2s later, with
   no cap, no identity and no replacement. Toggling reduced motion eight
   times therefore mounted eight live toasts; at 390x844 that is 736px of
   an 844px screen, painted over the tab bar. The listeners were never the
   problem (they are delegated on document and bound once) — the queue was.

   Three rules now:
     key      a caller that speaks about one thing passes a key, and its
              new message REPLACES its old one in place instead of queuing
     LIMIT    at most 3 live at once; the oldest is evicted first
     cleanup  every element owns its timer, and the timer is cleared
              whenever that element is replaced or evicted, so no timer
              outlives the node it refers to */
const TOAST_LIMIT = 3;
const TOAST_LIFE = 2600;
const liveToasts = new Map();   // key -> {el, timer}

function dropToast(key, immediate){
  const rec = liveToasts.get(key);
  if (!rec) return;
  clearTimeout(rec.timer);
  liveToasts.delete(key);
  const el = rec.el;
  if (immediate || Motion.off) return el.remove();
  animate(el, { opacity:0, translateY:8, duration:200, ease:'inQuad',
                onComplete:() => el.remove() });
}

function toast({ title, detail, bad = false, key }){
  const host = $('#toasts');
  if (!host) return;
  /* Un-keyed callers get a unique key so they still queue normally; keyed
     callers (a toggle, a scan verdict) collapse onto their own slot. */
  const k = key || `once:${Date.now()}:${Math.random()}`;

  const prev = liveToasts.get(k);
  let el;
  if (prev){
    /* same source speaking again — reuse the node so it does not move,
       and restart its life. No second element is ever mounted. */
    clearTimeout(prev.timer);
    el = prev.el;
  } else {
    while (liveToasts.size >= TOAST_LIMIT) dropToast(liveToasts.keys().next().value, true);
    el = document.createElement('div');
    host.appendChild(el);
    if (!Motion.off) animate(el, { opacity:[0,1], translateY:[14,0], duration:240, ease:'outQuad' });
  }

  el.className = 'toast' + (bad ? ' toast--bad' : '');
  el.innerHTML = `<span class="toast__dot"></span><div>
      <p class="toast__t">${esc(title)}</p>
      ${detail ? `<p class="toast__d">${esc(detail)}</p>` : ''}</div>`;

  const timer = setTimeout(() => dropToast(k), TOAST_LIFE);
  liveToasts.set(k, { el, timer });
}

/* ══════════════════════════════════════════════════════════════════
   6. AMBIENT — the environment the interface sits inside.

   Two layers. The arena is the slow geometric structure: the same seal
   at maximum detail, enormous, turning at two speeds. The energy
   canvas is the unstable part — dark smoke that drifts on three
   incommensurate sine terms so it never repeats, occasionally surging
   and briefly taking colour. It is not a pulsing glow: nothing here
   moves on a single period.
   ══════════════════════════════════════════════════════════════════ */
/* paints ASSETS.background behind the whole app, if one is supplied */
function applyBackdrop(){
  if (!ASSETS.background) return;
  const el = document.createElement('div');
  el.className = 'backdrop';
  el.style.backgroundImage = `url("${ASSETS.background}")`;
  $('.ground')?.prepend(el);
}

function buildArena(){
  const host = $('#arena');
  if (!host) return;
  host.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">
    <g class="arena__spin sp">${seal(4)}</g>
    <g class="arena__anti"><polygon points="50,22 78,50 50,78 22,50"/>
      <circle cx="50" cy="50" r="30" stroke-dasharray="3 9"/></g>
  </svg>`;
}
