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
  el.innerHTML = `<span class="toast__dot"></span><div>
      <p class="toast__t">${esc(title)}</p>
      ${detail ? `<p class="toast__d">${esc(detail)}</p>` : ''}</div>`;

  const timer = setTimeout(() => dropToast(k), TOAST_LIFE);
  liveToasts.set(k, { el, timer });
}
