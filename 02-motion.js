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
  mark(){
    try { document.documentElement.dataset.motionPref = this.forced ? 'off' : 'on'; } catch (_) {}
  },
  get off(){ return this.forced || !window.animate || systemReducedMotion(); },
  get reduced(){ return this.forced || systemReducedMotion(); },

  settle(el){
    if (!el || !el.style) return;
    try { aset(el, { translateX:0, translateY:0, skewX:0, skewY:0, rotate:0, scale:1, opacity:1 }); }
    catch (_) {}
    el.style.transform = '';
    el.style.opacity = '';
  },
};

const releaseTransform = els => {
  (Array.isArray(els) ? els : [els]).forEach(el => {
    if (el && el.style) el.style.transform = '';
  });
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

const TOAST_LIMIT = 1;
const TOAST_LIFE = 5000;
const liveToasts = new Map();

function dropToast(key){
  const rec = liveToasts.get(key);
  if (!rec) return;
  clearTimeout(rec.timer);
  liveToasts.delete(key);
  rec.el.remove();
}

/* A message is a cut: it is there, then it is not. It waits while the
   pointer or focus is on it, and a tap or Escape dismisses it. */
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
    while (liveToasts.size >= TOAST_LIMIT) dropToast(liveToasts.keys().next().value);
    el = document.createElement('div');
    el.tabIndex = 0;
    el.setAttribute('role', 'status');
    host.appendChild(el);
  }

  el.className = 'toast' + (bad ? ' toast--bad' : '');
  el.innerHTML = `<p class="toast__t">${esc(title)}</p>
      ${detail ? `<p class="toast__d">${esc(detail)}</p>` : ''}`;

  const arm = () => setTimeout(() => dropToast(k), TOAST_LIFE);
  const rec = { el, timer:arm() };
  liveToasts.set(k, rec);
  const hold = () => { clearTimeout(rec.timer); };
  const release = () => { clearTimeout(rec.timer); rec.timer = arm(); };
  el.onmouseenter = hold; el.onfocus = hold;
  el.onmouseleave = release; el.onblur = release;
  el.onclick = () => dropToast(k);
  el.onkeydown = e => { if (e.key === 'Escape' || e.key === 'Enter') dropToast(k); };
}
