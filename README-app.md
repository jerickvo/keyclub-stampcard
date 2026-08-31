# Keystamp — app notes

Key Club MPR attendance and rewards. No npm install, no bundler.

**Open `index.html`. That is the whole site — one self-contained file.**

(Backend setup, security model and deployment: see `README.md`.)

---

## Layout

```
index.html            GENERATED, self-contained — open this
dev.html              multi-file source page (needs a local server)
build.py              rebuilds index.html from dev.html + the sources

--- sources, in load order ---
fonts.css             the four faces, embedded as data URIs
keystamp.css          layout, shell, motion primitives, sign-out scene
artdirection.css      screentone, panels, buttons, board furniture
identity.css          design tokens, card face, stamps, spreads
00-guard.js           error handling + boot watchdog (loads first)
jsQR.js               vendored — reads QR codes from the camera
qrcode.js             vendored — draws the code on the board screen
anime.umd.min.js      vendored — animation engine
anime-bridge.js       exposes the anime v4 namespace, degrades if absent
01a-backend.js        Supabase adapters, config validation, reward tiers
01-core.js            Store, Rules, Schedule, seal + icon artwork
02-motion.js          Motion base layer, Reveal, formatting helpers
03-views.js           member screens and the stamp-card component
03b-board.js          board screens
04-fx.js              FX layer and the named sequences
05-scan.js            camera scanner, board projector, attendance count
06-app.js             router, interactions, boot

assets/brand/         KCI seal + CNH district logos (traced sources)
assets/fonts/         the .ttf sources fonts.css is built from
assets/seal/          swirl artwork + its trace
assets/stamp/         the ten stamp symbols, traced into 03-views.js
mock-supabase.js      in-browser Supabase stand-in, for testing only
```

`dev.html` writes `css/`, `js/` and `vendor/` prefixes because that is what a
served layout needs. This repository keeps the same files flat at the root, so
`build.py` tries the written path first and falls back to the bare filename —
one `dev.html` serves both layouts.

The script tags have no `defer` and no `async` **on purpose**. The files share
one global scope and each uses things defined above it, so they must run in
order. A new file goes at the bottom of the list.

To change anything: edit `dev.html`, the CSS or the JS, then run:

```bash
python3 build.py
```

`index.html` is generated. Never edit it by hand.

---

## Why index.html is one file

Split across a dozen subresources, one failed fetch took the whole app down —
and subdirectory reads are unreliable from an archive mount (a `.zip` browsed in
place). `build.py` inlines the stylesheets, every script and the three libraries,
so the built `index.html` issues **zero same-origin requests**. Nothing left to
404 — from a server, a folder, or a zip mount.

---

## Screens

Members get five; board accounts get four and never see the member set.

| Member | | Board | |
|---|---|---|---|
| Home | the stamp card | Club Tools | the meeting happening now + the year's standing |
| Record | every meeting, stamped or missed | Meetings | schedule and delete meetings |
| Scan | camera + manual code entry | Check-In | the projector QR and the live count |
| Rewards | 10 / 20 / 30 tiers | Members | roster, search, per-member detail |
| Member | identity plate + the card | | |

Routing is hash-based (`#/record`). `gate()` in `06-app.js` is the enforcement
point: signed-out visitors land on the sign-in spread whatever the hash says, a
member cannot reach a board route, and a board account lands in Club Tools.

---

## Attendance and the QR code

The board opens check-in on the Check-In screen, which draws the meeting's QR.
A member scans it (or types the code under the seal).

**The server is the only authority.** The scanned payload goes to the
`verify-attendance` Edge Function, which decides whether a stamp is awarded;
the client only submits and re-reads the result. There is deliberately no local
fallback — a configured build that cannot reach verification **fails closed**,
because refusing a real member is recoverable and awarding a forged code is not.

`schema.sql` and the RLS policies are what stop a member editing their own
attendance. See `README.md` for the full model.

---

## Meeting dates

**A general meeting may fall on any day of the week.** The board picks the date
when it schedules the meeting, and the stored `meeting_date` is the only
authority — no weekday is assumed, derived or enforced anywhere.

`Schedule` in `01-core.js` only supplies the meeting form's starting values:

```js
TIME:  '3:15 PM',
PLACE: 'MPR',
```

Whether a meeting is ahead, happening or past is decided by comparing its date
against the **club's calendar day** — `clubDay()` in `01a-backend.js`, which
formats `America/Los_Angeles` as `YYYY-MM-DD` using the same rule the Edge
Functions use, so the client and the server never disagree about the date.
Deriving "today" from `toISOString()` would report tomorrow all evening for
anyone west of Greenwich and slide meetings a day out of place.

A meeting still on today's date counts as ahead, not missed, until check-in
opens or the day turns over.

---

## Motion

All animation runs through anime.js; no CSS keyframe animation is used for app
motion. Two systems, deliberately distinct:

- **Normal navigation** (`FX.pageFlow`) — the view leaves with a short fade and
  drift, the paper holds a beat, the next page eases in. ~480ms, page-level
  only, no overlays.
- **Sign-out** (`FX.waffleOut`) — a dedicated full-screen manga scene built as a
  waffle grid of panels. It covers the app, which never participates. ~950ms.

Without anime.js the app still works: `Motion.off` turns every animation into an
instant state change, and `prefers-reduced-motion` takes the same path.

---

## Third-party code

All three are vendored, so nothing is fetched at runtime.

| Library | Why |
|---|---|
| [anime.js](https://animejs.com) 4.5.0 | every animation in the app |
| [jsQR](https://github.com/cozmo/jsQR) 1.4.0 | reads QR codes from the camera |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 | draws the code on the board screen — jsQR only reads |

anime.js is loaded as an ordinary script, **not** as an ES module. Module
scripts are fetched with CORS semantics, and a `file://` page has an opaque
origin, so the browser refuses every module request before it reaches the disk.
An importmap into `node_modules/` is worse: that folder is gitignored, so those
paths 404 once the site is pushed. The UMD build has neither problem.

To update it:

```bash
npm i animejs@latest
cp node_modules/animejs/dist/bundles/anime.umd.min.js ./
python3 build.py
```

The UMD bundle publishes one global, `anime`, holding the v4 namespace.

---

## Tools

```bash
python3 tools-build-fonts.py     # assets/fonts/*.ttf  ->  fonts.css
python3 tools-trace-stamps.py    # stamp artwork -> traced vector paths
python3 tools-overlap-check.py   # renders index.html, reports collisions
```
