#!/usr/bin/env python3
"""
Overlap / touching-border detector.

Two separate checks, because they are two different defects:

  TEXT COLLISION  two elements that each paint their own visible text
                  and whose boxes intersect. Decorative layers (the
                  giant ghost numerals, the SFX lettering, the bleed
                  word) are excluded by class — they are *designed* to
                  sit under content.

  BORDER PROXIMITY  two sibling boxes that each draw an edge and whose
                  edges come within GAP px of each other without
                  actually being intentionally flush.
"""
from playwright.sync_api import sync_playwright
import os, sys, json

WIDTHS = [320,360,375,390,393,402,414,430,768,820,1024,1280,1440,1920]
PAGES = ['home', 'record', 'scan', 'rewards', 'profile', 'board']

JS = r"""
() => {
  const DECOR = ['bleed','sfx','entry__ghost','rig__ghost','ground','arena',
                 'inkframe','tick','panel__rule','seal__mark','boot',
                 'verdict','fx','scrim','flash','pageno','hero__ghost',
                 'tech__ghost','who__ghost','viewer__grain','viewer__scrim'];

  const isDecor = el => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const c = (n.getAttribute && n.getAttribute('class')) || '';
      if (typeof c === 'string' && DECOR.some(d => c.split(/\s+/).includes(d))) return true;
      if (getComputedStyle(n).pointerEvents === 'none') return true;
    }
    return false;
  };

  // an element that paints its own text (not just via children)
  const textEls = [];
  const walk = document.querySelectorAll('main#view *, .tabs *, .rail *, .topbar *');
  for (const el of walk) {
    if (isDecor(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (parseFloat(cs.opacity) < 0.15) continue;
    let own = '';
    for (const n of el.childNodes)
      if (n.nodeType === 3) own += n.textContent.trim();
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    textEls.push({el, r, text: own.slice(0, 42)});
  }

  const sel = el => {
    const c = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).join('.');
    return el.tagName.toLowerCase() + (c ? '.' + c : '');
  };

  // Is the element painted in the fixed layer (the bottom tab bar, the
  // top bar)? Content scrolling beneath an opaque fixed bar is correct
  // behaviour, not a collision — comparing the two only ever measures
  // scroll position, so those pairs are skipped.
  const isFixed = el => {
    for (let n = el; n && n !== document.body; n = n.parentElement)
      if (getComputedStyle(n).position === 'fixed') return true;
    return false;
  };
  for (const t of textEls) t.fixed = isFixed(t.el);

  const overlaps = [];
  for (let i = 0; i < textEls.length; i++) {
    for (let j = i + 1; j < textEls.length; j++) {
      const a = textEls[i], b = textEls[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.fixed !== b.fixed) continue;
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ix > 0.5 && iy > 0.5) {
        overlaps.push({
          a: sel(a.el), aText: a.text,
          b: sel(b.el), bText: b.text,
          ix: +ix.toFixed(1), iy: +iy.toFixed(1)
        });
      }
    }
  }

  // borders that nearly touch: siblings that each draw an edge
  const GAP = 1.0;
  const boxes = [];
  for (const el of document.querySelectorAll('main#view .panel, main#view .rec, main#view .head, main#view .strike, main#view .stat, main#view .seal, main#view .narr, main#view .viewer, main#view .manual, main#view .qrpanel')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    boxes.push({el, r});
  }
  const touching = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      // vertical neighbours: overlap horizontally, gap vertically
      if (ix > 4) {
        const gap = Math.max(a.r.top, b.r.top) - Math.min(a.r.bottom, b.r.bottom);
        if (gap > -0.5 && gap < GAP)
          touching.push({a: sel(a.el), b: sel(b.el), axis: 'vertical', gap: +gap.toFixed(2)});
      }
      if (iy > 4) {
        const gap = Math.max(a.r.left, b.r.left) - Math.min(a.r.right, b.r.right);
        if (gap > -0.5 && gap < GAP)
          touching.push({a: sel(a.el), b: sel(b.el), axis: 'horizontal', gap: +gap.toFixed(2)});
      }
    }
  }
  // TEXT-ON-EDGE: the ink frame is painted at its host's box edge, so any
  // text whose box crosses that edge is struck through by a drawn line.
  // Element boxes alone can't reveal this (the frame is an SVG sibling,
  // not a border), which is how "Club Merch" ended up ruled in half.
  const onEdge = [];
  for (const host of document.querySelectorAll('[data-ink]')) {
    const hr = host.getBoundingClientRect();
    if (hr.width < 4 || hr.height < 4) continue;
    const wgt = parseFloat(host.dataset.inkWeight) || 3;
    const band = Math.max(wgt, 3) / 2 + 1.5;   // half the stroke + wobble
    for (const t of textEls) {
      if (!host.contains(t.el) || t.el === host) continue;
      const r = t.r;
      const cross =
        (r.top < hr.top + band && r.bottom > hr.top - band) ||
        (r.bottom > hr.bottom - band && r.top < hr.bottom + band) ||
        (r.left < hr.left + band && r.right > hr.left - band) ||
        (r.right > hr.right - band && r.left < hr.right + band);
      if (cross)
        onEdge.push({host: sel(host), el: sel(t.el), text: t.text});
    }
  }

  // INK OVERFLOW: text wider than the box that holds it. Element rects
  // do not reveal this — the box keeps its width while the glyphs spill
  // out of it — which is how "ATTENDANCE" escaped its own header panel
  // at 320px while every box-based check passed.
  // Only elements that PAINT their own text: a container's scrollWidth
  // also counts absolutely-positioned decorative children (the bleed
  // words), which are supposed to overflow.
  const spill = [];
  for (const t of textEls) {
    const el = t.el;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'visible') continue;
    if (!el.clientWidth) continue;
    // ignore descendants that are themselves positioned outside
    const hasAbsKid = [...el.children].some(c => getComputedStyle(c).position === 'absolute');
    if (hasAbsKid) continue;
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1) spill.push({ el: sel(el), over, text: t.text });
  }

  return {overlaps, touching, onEdge, spill};
}
"""


def main():
    path = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'index.html')
    total = 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w in WIDTHS:
            page = b.new_page(viewport={'width': w, 'height': 900})
            page.goto('file://' + path)
            page.wait_for_timeout(2200)
            for pid in PAGES:
                page.evaluate(f'go("{pid}")')
                page.wait_for_timeout(450)
                res = page.evaluate(JS)
                for o in res['overlaps']:
                    total += 1
                    print(f"[{w}px {pid}] TEXT OVERLAP {o['ix']}x{o['iy']}px")
                    print(f"        {o['a']}  \"{o['aText']}\"")
                    print(f"        {o['b']}  \"{o['bText']}\"")
                for t in res['touching']:
                    total += 1
                    print(f"[{w}px {pid}] BORDERS {t['axis']} gap={t['gap']}px")
                    print(f"        {t['a']}")
                    print(f"        {t['b']}")
                for sp in res.get('spill', []):
                    total += 1
                    print(f"[{w}px {pid}] TEXT WIDER THAN ITS BOX by {sp['over']}px")
                    print(f"        {sp['el']}  \"{sp['text']}\"")
                for e in res['onEdge']:
                    total += 1
                    print(f"[{w}px {pid}] TEXT ON DRAWN EDGE")
                    print(f"        {e['el']}  \"{e['text']}\"  inside {e['host']}")
            page.close()
        b.close()
    print(f"\n=== {total} issue(s) ===")


if __name__ == '__main__':
    main()
