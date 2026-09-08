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
04-fx.js              FX layer: impacts, stamps, seals, reveals
04b-scenes.js         opening, sign-out exit and page transitions
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

Members get five; board accounts get five of their own and never see the
member set.

| Member | | Board | |
|---|---|---|---|
| Home | the stamp card | Club Tools | the meeting happening now + the year's standing |
| Record | every meeting, stamped or missed | Meetings | schedule and delete meetings |
| Scan | camera + manual code entry | Check-In | the projector QR and the live count |
| Rewards | 10 / 20 / 30 tiers | Members | roster, search, per-member detail |
| Member | identity plate + the card | Account | sign-out and the motion setting |

Navigation is an ink spine from 1024px up (`.rail`) and an ink tab bar
below that. The spine is the same black block the panel headers and the
card's left column are made of: the wordmark in paper over the page-title
rule, then the four working screens as paper labels in the heading face. The
current screen is a paper notch cut into the spine with a slanted leading
edge, its label in ink, reaching the page so the paper is continuous with
the content — that notch is the only active state. The self page (Member or
Account) is not a chapter: it is reached from the paper foot at the bottom,
where the member's name is an underlined link (burgundy when you are on
that page), the role sits under it as mono metadata, the motion toggle is a
filled or hollow square with its word, and Sign out is the small outlined
button the lists use for row actions. On phones the topbar and the tab bar
are ink with paper labels, and the current tab is the same paper notch.

Routing is hash-based (`#/record`). `gate()` in `06-app.js` is the enforcement
point: signed-out visitors land on the sign-in spread whatever the hash says, a
member cannot reach a board route, and a board account lands in Club Tools.

Credentials: usernames are case-insensitive (`Config.canonUsername` lowercases
them only to build the synthetic sign-in address; the typed form is kept as the
display name), passwords are case-sensitive and are passed to Supabase exactly
as typed. The sign-in inputs are set in the mono face on purpose: the body face
is unicase, so anything typed in it looks uppercase. Each password field has a
show/hide toggle that swaps the input type and never touches the value.

---

## Attendance and the QR code

The board opens check-in on the Check-In screen, which draws the meeting's QR.
A member scans it (or types the code under the seal).

The Scan screen shows a zoom slider inside the viewer only when the camera
track reports a `zoom` capability (`Scanner.mountZoom` in `05-scan.js`). Its
range and step come from the device, it starts at the track's current zoom,
and dragging it calls `applyConstraints` on the live track — the camera is
never restarted and the frame loop keeps decoding. Cameras and browsers that
expose no zoom capability get no control and no errors; a track that rejects
the constraint drops the control quietly. The decoder samples the feed at
480px wide so a small code at the back of the room still resolves.

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

`Schedule` in `01-core.js` only supplies the place (`PLACE: 'MPR'`). The
scheduling form's starting values live in `03b-board.js`:

- the meeting number is prefilled with the highest existing number plus one
  (`nextMeetingNumber`; `1` when there are no meetings, gaps allowed, rows
  with a missing or invalid number ignored), and the board can still type any
  other number — a duplicate is refused before it reaches the database, which
  also enforces it with a unique constraint;
- start and end default to `12:40 PM` and `1:30 PM` (`MEETING_DEFAULTS`,
  stored as 24-hour input values and converted to the 12-hour text the
  `meetings` table holds);
- edits are kept as a draft until the meeting is created or the form is
  reset, so re-rendering the page never overwrites what the board typed.

`node --test tools-test-meetings.mjs` covers these rules.

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

One scene module, `04b-scenes.js`, owns the three moments that cover the whole
screen, and one `Transit` object owns every page change.

- **Opening** (`Scenes.opening`) — a manga page: three outlined panels, ink
  wiped into each in hard steps, the seal and the wordmark stamped in, then the
  panels part and the paper sheet drops to reveal the app beneath. The cold
  load uses the static markup in `dev.html` and CSS keyframes for the intro
  beats, so the page composes itself from the first paint even before the
  scripts arrive; JS only holds the composed page until the first render is
  done and then opens it. Signing in builds the same scene and slides it over
  the form. ~1.3s from first paint, never less than 1s on a fast load.
- **Page transitions** (`Transit.run`) — the gutter cut. An ink panel with a
  tilted leading edge sweeps in from the direction of travel (forward along
  the tab strip from the right, back from the left) and pushes the leaving
  page out; under full cover the page swaps and the destination's title is
  stamped onto the panel at the exact position of the real title; the panel
  sweeps off and the new page settles with its title already in place. Each
  destination keeps the same cut with its own personality: Home quick with a
  halftone edge, Record slow and straight, Scan short, Rewards a layered
  halftone panel under the ink with a paper flash, Member slowest, board
  tools crisp. 430–650ms. Reduced motion crossfades the snapshot in 140ms.
- **Sign-out** (`Scenes.exit`) — the panels slam shut over the app, the paper
  fills the gutters, SIGNED OUT is stamped, and the whole page drops away to
  the sign-in spread. Distinct from both the opening and the transitions.
- **Stamp landing** (`Landing` in `05-scan.js`, `FX.stampAcquire` and
  `FX.stampLand` in `04-fx.js`) — one ordered sequence rather than parallel
  timers. The moment the server confirms a scan the black "+1" interstitial
  covers the screen; the store re-reads attendance underneath it (retrying a
  few times if the network is slow) and the cover holds until the data is in
  and at least 900ms have passed. Home is then rendered under the cover, the
  cell that belongs to the verified meeting is found by that meeting's id in
  the chronological record (so a stale count can never pick the wrong cell),
  hidden, and scrolled into view; the cover lifts, and only when it has left
  does the stamp slam onto the card. If the re-read never succeeds the cover
  lifts without a landing and the page shows its normal load-failure state.
  A second scan that starts mid-sequence supersedes the first cleanly.

Without anime.js the app still works: `Motion.off` turns every animation into an
instant state change, and `prefers-reduced-motion` (or the account setting)
shows the composed scenes as stills with a short fade and swaps pages with no
movement.

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
node --test tools-test-meetings.mjs   # meeting-number and form-default rules
```
