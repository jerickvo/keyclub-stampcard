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
fonts.css             the five faces, embedded as data URIs
keystamp.css          tokens, ground, the folio line, type roles, buttons,
                      inputs, rows, toasts, the boot scene
identity.css          the stamp card, the live strip, each screen's composition
00-guard.js           error handling + boot watchdog (loads first)
jsQR.js               vendored — reads QR codes from the camera
qrcode.js             vendored — draws the code on the board screen
anime.umd.min.js      vendored — animation engine
anime-bridge.js       exposes the anime v4 namespace, degrades if absent
01a-backend.js        Supabase adapters, config validation, reward tiers
01-core.js            Store, Rules, Schedule, seal + icon artwork
02-motion.js          Motion base layer, toasts, formatting helpers
03-views.js           member screens and the stamp-card component
03b-board.js          board screens
04-fx.js              FX layer: the title slam, presses, the stamp landing
04b-scenes.js         the opening, the sign-out drain, page cuts
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
| Card | the stamp card, the open meeting, the next dates | Club | the meeting happening now + the year's standing |
| Record | every meeting, stamped or missed | Meetings | schedule and delete meetings |
| Scan | camera + manual code entry | Check-In | the projector QR and the live count |
| Rewards | 10 / 20 / 30 tiers | Members | roster, search, per-member detail |
| *your name* | standing, attendance, rewards; the account | *your name* | sign-out and the motion setting |

The fifth screen is titled with the signed-in person's first name; its folio
entry reads the same.

Navigation is a folio line: one running head that lists the five screens in
a fixed order, in small type, a mono number beside each word. The current
screen shows only its number, in burgundy (`--seal`, the one accent in the
palette), with a small burgundy square notching the hairline; its word has
been promoted into the page title, where it sits beside a hollow chapter
numeral. On phones the line is the foot of the page: paper, one hairline,
flush left. From 768px it is the sticky head, with the signed-in name (a
button to the fifth screen), the role and the wordmark at the right.
`paintNav()` in `06-app.js` draws it and `measureFolio()` writes its height
into `--folio-h` so the page and the scanner can make room. No rail, no tab
bar, no icons.

The rest of the visual system is small on purpose. One object casts a shadow
(the card). One drawn line (the torn rule under a chapter title). Black fill
means the live thing: the open meeting's strip, the card's ID plate, the
projector while check-in is open. Burgundy means here and now: the folio
mark, the strip's dab, the rail beside a rung that is ready to claim. Four
edge weights, five gaps and six type steps are defined once as tokens in
`keystamp.css`; page rules read the tokens and never call `clamp()`.

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

## Deleting a meeting

The board can delete a meeting from **Meetings**, and there are two different
deletes behind that one button.

A meeting **nobody has checked in to** goes through the ordinary table delete.
RLS allows it (`meetings_board_delete`), the row disappears, nothing else is
touched.

A meeting that is **over and carries stamps** goes through
`delete_meeting_and_stamps()` in `schema.sql`. Attendance has no delete policy
and the foreign key is `ON DELETE RESTRICT`, so this SECURITY DEFINER function
is the only way through — and it enforces its own rules in the database, not in
the button: board accounts only, and only a meeting whose date has passed with
check-in closed. A meeting that is running can never be deleted out from under
the members checking in to it.

Because the second kind takes stamps off members' cards, the confirmation names
the cost — how many stamps go, how many members lose one — and there is no
undo, no archive and no audit trail. The UI only offers the button where the
database will accept it, so the two rules stay in step.

A project created before this function existed still has the old
`tmp_test_purge_meeting`. `migrations/2026-09-10-delete-meeting.sql` moves it
over; until it is run, the client falls back to the old name.

---

## Motion

Three ideas, and nothing else moves.

- **Arrival** (`Scenes.opening` in `04b-scenes.js`) — the boot scene, and
  only the boot scene. Three outlined panels fill in hard steps, the seal and
  the wordmark land, the panels part and the paper drops to reveal the first
  render. The cold load uses the static markup in `dev.html` and CSS
  keyframes, so the page composes itself before the scripts arrive; JS holds
  it until the first render is done. Never shorter than 700ms. Signing in
  does not replay it: Card is rendered and its title struck in.
- **The cut** (`Transit.run`) — every page change. The new page is swapped in
  at once; the rule under its chapter title sweeps in over five frames (from
  the left going forward, from the right coming back) and the numeral and
  the title are struck into place (`FX.slamType`). Body copy is always simply
  present. Sign-out (`Scenes.exit`) is the same idea inverted: the page
  drains downward in six steps and the sign-in spread is underneath.
- **Impact** (`Landing` in `05-scan.js`, `FX.stampLand` in `04-fx.js`) — the
  stamp lands on its own cell. When the server confirms a scan the viewer
  holds for half a second while the store re-reads attendance; Card is then
  rendered with the verified meeting's cell hidden (found by that meeting's
  id in the chronological record, never by count) and the stamp comes down in
  four cuts while the card takes one frame of tint. A rejected scan shakes
  the reticle. A claimed rung, the projector's OPEN and its live count press
  once.

Messages are flat ink strips that cut in and out, one at a time. They wait
while hovered or focused; a tap or Escape dismisses them.

Without anime.js the app still works: `Motion.off` turns every animation into
an instant state change. `prefers-reduced-motion` and the account setting
(`data-motion-pref` on the root) do the same, and the boot scene is shown
composed and removed at once.

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
