"use strict";

const systemReducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
};

const MOTION_KEY = 'keystamp:motion';
const Motion = {
  forced: (() => { try { return localStorage.getItem(MOTION_KEY) === 'off'; } catch (_) { return false; } })(),
  setForced(v){
    this.forced = Boolean(v);
    try { localStorage.setItem(MOTION_KEY, v ? 'off' : 'on'); } catch (_) {}
    this.mark();
  },
  /* the in-app setting reaches the CSS too, so a spinner stops for it
     the way it does for the system setting */
  mark(){ try { document.documentElement.toggleAttribute('data-still', this.forced); } catch (_) {} },
  get off(){ return this.forced || !window.animate || systemReducedMotion(); },
  get reduced(){ return this.forced || systemReducedMotion(); },

  settle(el){
    if (!el || !el.style) return;
    /* nothing written, nothing to take back: reading the two styles is
       cheaper than building the reset, and a first paint does it a lot */
    if (!el.style.transform && !el.style.opacity) return;
    try { aset(el, { translateX:0, translateY:0, skewX:0, skewY:0, rotate:0, scale:1, opacity:1 }); }
    catch (_) {}
    el.style.transform = '';
    el.style.opacity = '';
  },
};

Motion.mark();

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const fmtDate = iso => new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
  .toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
const fmtDay = iso => new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
  .toLocaleDateString('en-US', { month:'short', day:'numeric' });
/* A clock reading is one word: the space before AM/PM never breaks. */
const knit = s => String(s).replace(/ (AM|PM)\b/gi, '\u00a0$1');
const fmtTime = iso => knit(new Date(iso)
  .toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }));

const TOAST_LIMIT = 3;
const TOAST_LIFE = 2600;
const liveToasts = new Map();

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

  const k = key || `once:${Date.now()}:${Math.random()}`;

  const prev = liveToasts.get(k);
  let el;
  if (prev){
    clearTimeout(prev.timer);
    el = prev.el;
  } else {
    while (liveToasts.size >= TOAST_LIMIT) dropToast(liveToasts.keys().next().value, true);
    el = document.createElement('div');
    host.appendChild(el);
    if (!Motion.off) animate(el, { opacity:[0,1], translateY:[14,0], duration:240, ease:'outQuad' });
  }

  el.className = 'toast' + (bad ? ' toast--bad' : '');
  el.tabIndex = 0;
  el.innerHTML = `<span class="toast__dot"></span><div>
      <p class="toast__t">${esc(title)}</p>
      ${detail ? `<p class="toast__d">${esc(detail)}</p>` : ''}</div>`;

  /* A message waits while it is hovered or focused, and a tap, Enter or
     Escape dismisses it, so a reader is never racing the timer. */
  const rec = { el, timer:null, held:prev ? prev.held : false };
  const cur = () => liveToasts.get(k);
  const arm = r => { clearTimeout(r.timer); r.timer = setTimeout(() => dropToast(k), TOAST_LIFE); };
  if (!prev){
    const hold = () => { const r = cur(); if (r){ r.held = true; clearTimeout(r.timer); } };
    const free = () => { const r = cur(); if (r){ r.held = false; if (!bad) arm(r); } };
    el.addEventListener('mouseenter', hold);
    el.addEventListener('focus', hold);
    el.addEventListener('mouseleave', free);
    el.addEventListener('blur', free);
    el.addEventListener('click', () => dropToast(k));
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape' || e.key === 'Enter'){ e.preventDefault(); dropToast(k); }
    });
  }
  liveToasts.set(k, rec);
  /* a failure stays until it is read and dismissed, or replaced */
  if (!rec.held && !bad) arm(rec);
}
