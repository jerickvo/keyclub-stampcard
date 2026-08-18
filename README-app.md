# Keystamp

Key Club MPR attendance and rewards. No build step, no server, no npm install.

**Open `index.html`. That is the whole site — one self-contained file.**

```
index.html               GENERATED, self-contained — open this
dev.html                 multi-file source page (needs a local server)
build.py                 rebuilds index.html from dev.html + css/ + js/

--- sources below ---
css/keystamp.css         all styling
js/00-guard.js           error handling + boot watchdog (loads first)
   01-core.js            assets, the seal, meetings, schedule, QR rules
   02-motion.js          Motion base layer, Reveal, utilities, ambient
   03-views.js           components and the five screens
   04-fx.js              the FX layer and the named sequences
   05-scan.js            QR encoding and the camera scanner
   06-app.js             router, interactions, boot
assets/
  logo/                  club logo + school seal
  headers/               banner image for Home
  backgrounds/           tiled artwork
  icons/                 browser tab icon
vendor/                  optional local copies of the three libraries
```

The script tags in `index.html` have no `defer` and no `async` **on purpose**.
The files share one global scope and each one uses things defined above it, so
they have to run in order. If you add a file, add it to the bottom of the list.

---

## Why index.html is one file

The reported error was `could not load .../keystamp.zip/keystamp/js/anime-bridge.js`.
No such path is written anywhere in this project — `/media/archive/keystamp.zip/`
is an **archive mount**, the .zip browsed in place without being extracted, and
the browser was resolving the relative path `js/anime-bridge.js` against the
page's own location inside that mount. Subdirectory reads through an archive
mount are not reliable, the fetch failed, and because the app was split across
nine files, one failed fetch took the whole application down.

Chasing the path was the wrong fix, which is why earlier attempts did not hold.
The defect was depending on subresource fetches at all. `build.py` inlines the
stylesheet, all nine scripts, anime.js, jsQR and the QR encoder, so the built
`index.html` issues **zero same-origin requests**. There is nothing left to
404 — from a server, a folder, or a zip mount.

To change anything: edit `dev.html`, `css/`, or `js/`, then run `python3 build.py`.

## What was wrong

**The black screen.** `.boot` is a fixed, full-screen, pure black layer at
`z-index: 200`, and the only thing that ever removed it was the `complete`
callback of the anime.js boot timeline. Everything behind it is empty until JS
fills it in. So any failure at all — a script that didn't load, a throw halfway
down, a clock that stopped — left a perfectly black rectangle with nothing on it
to say why.

Worth being straight about: this build could not be made to reproduce the black
screen in headless Chrome under a local server, `file://`, mobile width, reduced
motion, every route, or with each library deliberately removed. So the exact
trigger on your machine is unconfirmed. What is confirmed is that the design
guaranteed *something* would eventually do it, silently. Three changes so the
same class of failure can't hide again:

- `js/00-guard.js` loads before everything else. If anything throws or one of
  the app's own files fails to load, it lifts the curtain and prints the error
  across the bottom of the screen. A four-second watchdog lifts the curtain even
  if nothing throws. Neither should ever fire. If one does, you get a sentence
  instead of a void.
- The boot sequence used to be an anime.js timeline **plus eight loose
  `setTimeout`s** running on a second clock. Two clocks means two ways to drift —
  minimise the tab and `requestAnimationFrame` stops while `setTimeout` keeps
  going, so the cuts fire against a frozen seal, and a stalled timeline meant the
  curtain never came up. Every beat is now on the one timeline.
- `done` and `onReveal` are idempotent and called from three places: the
  timeline's `complete`, its `.finished` promise, and a 2.6s backstop.

**The board QR screen never worked.** The CDN link pointed at
`qrcode-generator@1.4.4/qrcode.min.js`. That file does not exist — 1.4.4 ships
`qrcode.js` only, so the URL was a 404 and `qrcode()` was undefined. Fixed.

**No doctype.** The old file started at `<meta charset>` — no `<!DOCTYPE html>`,
no `<html>`, `<head>` or `<body>`. That's quirks mode, where percentage heights
and a pile of other CSS behave differently than they were written for. Chrome
tolerated it. Not every browser will.

---

## The animation pass

All anime.js, no CSS animation added.

**Panels below the fold wait for you.** Record is about twice the height of a
phone screen, and animating the bottom of it while you're looking at the top
spent the entrance on nothing — and by the time you scrolled down it had already
happened, so everything past the fold always looked static. `FX.pageEntrance`
now animates only what's on screen and hands the rest to `Reveal`
(`js/02-motion.js`), which uses IntersectionObserver to decide *when* while
anime.js still does the move, so both paths land identically. Anything parked
sits at opacity 0, so there's a six-second fuse that shows it regardless if it
somehow never intersects.

**The stagger is eased.** anime.js can ease the *delay* as well as the property,
so `anime.stagger(52, { easing: 'easeOutQuad' })` makes the first panels land in
quick succession and the tail slow down. A flat gap reads mechanical.

**The stamp grid ripples diagonally.** `anime.stagger(44, { grid: [5, 2],
from: 'first' })` delays each cell by its distance from the origin cell, so the
wave travels across the block the way a stamp would actually ink, rather than
running left to right. Each cell settles on `spring(1, 94, 13, 0)`, so they
don't land in lockstep.

**A landing stamp is fastest when it hits.** It used to be one overshoot curve,
which meant it decelerated on the way in — backwards for a stamp. Now it's a
hard 250ms flight to slightly past the mark, then a spring settle. The spring
works out its own duration from mass and stiffness, so the recoil is physical
instead of a number picked to look about right.

Without anime.js the app still works: `Motion.off` turns every animation into an
instant state change.

---

## Putting it on GitHub

You already have the private repo `keyclub-stampcard`. Either route works.

### Drag and drop (no git install)

1. Open the repo on github.com
2. **Add file → Upload files**
3. Drag the **contents** of the `keystamp` folder in — `index.html`, plus the
   `css`, `js` and `assets` folders. Drag the folders themselves; GitHub keeps
   the structure. Don't drag the outer `keystamp` folder or everything ends up
   one level too deep and `css/keystamp.css` won't resolve.
4. Write a commit message, **Commit changes**

`index.html` has to sit at the top level of the repo, next to `css/` and `js/`.

### Command line

```bash
cd path/to/keystamp
git init
git add .
git commit -m "Split into modules, fix boot black screen and QR CDN link"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/keyclub-stampcard.git
git push -u origin main
```

If the repo already has commits, replace the last three lines with
`git pull origin main --rebase` then `git push`.

### Getting it live (you need HTTPS for the camera)

Browsers only allow camera access on `https://` or `localhost`, so the Scan
screen won't work from a file you double-clicked.

**GitHub Pages** — repo **Settings → Pages → Source: Deploy from a branch →
main / (root) → Save**. Live at
`https://YOUR-USERNAME.github.io/keyclub-stampcard/` in a minute or two.

One catch worth knowing before you try: **Pages on a private repo requires a
paid plan.** On a free account the repo has to be public. Two ways around it —
apply for the GitHub Student Developer Pack, which gives you Pro free and unlocks
private Pages, or deploy to Vercel instead, which serves private repos free and
is what you'd picked anyway. On Vercel: **Add New → Project**, import the repo,
leave every build setting blank (there's nothing to build), deploy.

### Testing locally

```bash
cd keystamp
python3 -m http.server 8000
# open http://localhost:8000
```

Use this rather than double-clicking `index.html`. `localhost` counts as a
secure origin, so the camera works.

---

## How to replace images

Open `js/01-core.js` and find `const ASSETS` at the top:

```js
const ASSETS = {
  logo:       null,   // e.g. 'assets/logo/keystamp-logo.png'
  schoolSeal: null,   // e.g. 'assets/logo/school-seal.png'
  homeHeader: null,   // e.g. 'assets/headers/home-header.jpg'
  background: null,   // e.g. 'assets/backgrounds/paper.png'
};
```

`null` means "use the built-in drawing". Put a path in quotes instead and your
image is used. Nothing else changes.

| Slot | Where it shows | Best format |
|---|---|---|
| `logo` | header, sidebar, loading screen | PNG or SVG, transparent, square, 128px+ |
| `schoolSeal` | faint, corner of Member | PNG, transparent, square, 300px+ |
| `homeHeader` | banner across Home, cropped ~16:6 | JPG, ~1600×600, under 400KB |
| `background` | tiles behind everything at low opacity | PNG, 340×340, seamless |

The favicon is the exception — it's in `<head>` in `index.html`, because the
browser reads it before any JS runs. The app ships with the icon drawn inline.
To swap it: save yours as `assets/icons/favicon.png`, comment out the long
`data:image/svg+xml,...` line, uncomment the line below it. Browsers cache
favicons hard, so hard-refresh (Ctrl/Cmd + Shift + R) if it doesn't change.

---

## The QR system

### Where codes come from

Keystamp generates them, on the board-only screen at `#/board` (**Board tools**,
linked from Member and the desktop sidebar). Pick the MPR and it draws a QR
encoding:

```
keystamp://attendance/m09/4F2A9C
```

### How the scanner knows a code is real

Three checks, all in `Rules.validateQRCode()` in `js/01-core.js`:

1. **Scheme** — must start with `keystamp://attendance/`, so a random poster QR fails here
2. **Meeting** — the id must match a meeting Keystamp knows about
3. **Token** — must equal `fnv1a(SECRET | meeting-id | 5-minute-bucket)`

The token rolls over every five minutes, so a photo of the projected code stops
working almost immediately. The previous window is still accepted, so a scan
starting at 3:14:59 doesn't fail at 3:15:01. It also refuses codes for meetings
that aren't open, and codes for a meeting you already have a stamp for.

Leave the board screen up for the whole meeting; it refreshes its own code.

### The limitation that matters

**There is no backend.** `SECRET` sits in `js/01-core.js`, so anyone who opens
dev tools can work out a valid token — and attendance only lives in memory for
that tab, so a refresh resets it. Fine for a demo, not fine for real attendance.

To make it real, move `Rules.segment()`, `Rules.codeFor()` and
`Rules.validateQRCode()` onto a server and have the scanner POST the scanned URI
to it. Every read and write already goes through `Store` and `Rules`, so nothing
else has to change.

---

## Meeting schedule

Dates are never typed by hand. `Schedule` in `js/01-core.js` generates them:

```js
ANCHOR: '2026-04-22',   // first MPR — a Wednesday
EVERY_DAYS: 14,         // every other week
```

`wednesdayOf()` snaps any date to the Wednesday of that week, so a meeting can't
land on a Tuesday even if the anchor or interval gets changed by mistake.

---

## Third-party code

All three load from a CDN; none needs installing.

| Library | Why |
|---|---|
| [anime.js](https://animejs.com) 4.5.0 | every animation in the app — vendored, see below |
| [jsQR](https://github.com/cozmo/jsQR) 1.4.0 | reads QR codes from the camera |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 | draws the code on the board screen — jsQR only reads |

anime.js is vendored at `vendor/anime.umd.min.js` and loaded as an ordinary
script — **not** as an ES module.

That is deliberate. Module scripts are fetched with CORS semantics, and a
`file://` page has an opaque origin, so the browser refuses every module
request before it reaches the disk. An importmap into `node_modules/` is worse
still: that folder is gitignored, so those paths also 404 once the site is
pushed. The UMD build has neither problem — it loads by double-click, from a
subfolder, and from a server.

To update it:

```bash
npm i animejs@latest
cp node_modules/animejs/dist/bundles/anime.umd.min.js vendor/
```

The UMD bundle publishes one global, `anime`, holding the v4 namespace.
`js/anime-bridge.js` unpacks it into the names the app uses. Note it is a
namespace, not the v3 callable: `anime(...)` is not a function, `anime.animate(...)`
is.

If your school network blocks CDNs, `vendor/` also has local copies of jsQR and
qrcode-generator — point those two `<script src>` tags at them.

### Easing in v4 — the string form is gone

v4 removed `ease: 'cubicBezier(...)'` from core. The curve must be built by
the factory and passed as a function:

```js
ease: cubicBezier(.22, .61, .36, 1)     // not 'cubicBezier(.22,.61,.36,1)'
ease: spring({ mass:1, stiffness:90, damping:12, velocity:0 })
```

`createSpring()` was the name in earlier 4.x and is deprecated as of 4.5 — use
`spring()`. Named curves (`'outQuart'`, `'outQuad'`) are still fine as strings.

`anime-bridge.js` publishes `cubicBezier` and `spring` as globals, and defines
them as stubs when anime.js is absent. That matters: `EASE` in `04-fx.js` is
built at the top level of the file, so if those names were undefined the file
would throw on load and take the whole app down with it.

### v3 to v4

The animation layer was migrated. If you are reading older code or examples,
the API changed shape: `anime({targets:x, ...})` is now `animate(x, {...})`,
`anime.timeline()` is `createTimeline()`, `easing` is `ease`, `complete`/`begin`/
`update` are `onComplete`/`onBegin`/`onUpdate`, curve names lost their `ease`
prefix (`easeOutQuart` is `outQuart`), and `anime.setDashoffset` is gone —
stroke drawing now goes through `createDrawable(el)` with `draw: ['0 0','0 1']`.

Because a classic script cannot `import`, `js/anime-bridge.js` is the one module:
it imports v4 and publishes what the app uses. It also owns boot ordering —
module scripts run after every classic script, so `06-app.js` defines
`__keystampBoot` and the bridge calls it. If the bridge never runs, `06-app.js`
starts itself after 1.2s with animation off rather than showing an empty page.

Fonts come from Google Fonts. `CC Wild Words Roman` is commercial and is listed
first in `--f-accent`; `Comic Neue` is the open fallback if it isn't installed.
