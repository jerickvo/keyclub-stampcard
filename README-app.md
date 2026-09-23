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
fonts.css             the faces (Keystamp Mono among them), embedded as data URIs
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
02-motion.js          Motion base layer, Reveal, toasts, formatting helpers
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
so the built `index.html` makes **no same-origin request the page depends on**:
only the web manifest and the touch icon, both harmless if missing. Nothing left
to 404 that matters, from a server, a folder, or a zip mount.

---

## Screens

Members get five; board accounts get three of their own and never see the
member set.

| Member | | Board | |
|---|---|---|---|
| Home | today's meeting line + the stamp card | Check-in | today's meeting: open, the projector QR and live count, close; add someone by hand (on a phone, or from Meetings on a laptop, so the projected stage never shows names) |
| Record | every meeting since the account was made, stamped or missed | Meetings | schedule, open and delete meetings; attendees |
| Scan | the camera | Members | prizes to hand over, the roster, per-member detail |
| Rewards | 10 / 20 / 30 tiers, claimed and collected | | |
| Member | identity plate + completed cards; sign-out and the motion setting | | |

Navigation is the page's left margin from 1024px up (`.rail`) and a tab bar
below that. Sign-out and the motion setting live in the rail's foot; below
1024px they sit at the foot of Member and of Check-in, so neither role has
a page that exists only to hold them.

The rail reuses what the other screens already do: the wordmark
over the same hand-cut rule the page titles use, then the screens as a mono
number column beside heading-face labels, the way the Meetings lists set
"GM 07" beside a date. The current screen is marked by a small burgundy ink
dab in the gutter and its number in the same colour (`--seal`, the one accent
in the palette). The account block sits on a straight 2px rule like a panel
header: the signed-in name in the mono face with the role beside it, the
motion toggle as a filled or hollow square with its word, and Sign out as
the same small outlined button the lists use for row actions.
No icons, no boxes, no decoration.

One rule decides what a reward tier is to a member, and it reads two
facts: the stamp count and whether a claim row is on file. A tier is
*claimed* when the claim exists, else *unlocked* when the stamps reach its
threshold, else *locked*; "rewards unlocked" anywhere is the number of tiers
that are not locked. A claim is the member asking for the prize on the
record, so it stays counted even if a deleted meeting later takes stamps
back. The rule is `rewardState` in `01a-backend.js`, and the board function
and the test double carry the same three lines, so the Rewards page, the
member's standing, the roster and the board's member detail can never
disagree.

### Prizes: claimed, then handed over

A claim is written from the member's own phone, so on its own it says the
member asked, not that they were given anything. The hand-over is a second
fact, kept apart from the rule above (`reward_handovers`, written only by
`hand_over_reward()`; see `README.md`, "Prizes and stamps by hand"):

| Member sees | when |
|---|---|
| ticks and "N more stamps" | not reached |
| **Claim** | reached, not claimed |
| **Claimed**, "Collect it from an officer at a meeting" | claimed, not handed over |
| **Collected**, "On Sep 23" | an officer recorded the hand-over |

The board's **Members** page opens on *To hand over*: every member owed a
prize, the ones who have claimed first, with how many of each prize that
is and how many more members are one stamp short, so officers bring enough
to the table. **Hand over** takes two taps, the second naming who and what.
The officer who recorded it can **Undo** for fifteen minutes (a wrong name
at a busy table), from the list or the member's page, and after a refresh
too; after that it is part of the record. Undo takes back a claim the
hand-over wrote for a member who never pressed Claim; a claim the member
made stays. Two officers tapping
the same prize get one hand-over and one "Already handed over". A member who
never pressed Claim can still be handed their prize (the claim is written
with it); an officer cannot hand themselves one. Member detail carries the
same action per prize.

A project that has not run the migration shows exactly what it did before:
**Claimed**, with no promise of a hand-over, and no list on Members.

Numbers: a meeting identifier is a label and keeps its leading zero
(`GM 04`); a count is a plain integer (`3 / 10`). Every screen writes a
meeting as `GM 04`, and a clock reading is one word: the space before AM or
PM never breaks (`knit` in `02-motion.js`).

Routing is hash-based (`#/record`). `gate()` in `06-app.js` is the enforcement
point: signed-out visitors land on the sign-in spread whatever the hash says, a
member cannot reach a board route, and a board account lands in Check-in.

Credentials: usernames are case-insensitive (`Config.canonUsername` lowercases
them only to build the synthetic sign-in address; the typed form is kept as the
display name), passwords are case-sensitive and are passed to Supabase exactly
as typed. Anything a person types, and any name that is theirs, is set in the
mono face on purpose: the body face is unicase, so `aBcD` set in it reads
`ABCD`. That covers the sign-in fields, every `.input` (the roster search, the
schedule form), roster and attendee names, the member detail's name and the
rail's name line. Each password field has a show/hide toggle that swaps the
input type and never touches the value. A refused sign-in prints its message
under the buttons, so nothing above it moves, and focus lands on the first
field at fault in form order.

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

Reading a frame is the most expensive thing the app does on a phone. Done
on the main thread it costs tens of milliseconds and it is spent where the
animations live, which is what used to make Scan stutter: the page ran at
about 22 frames a second with the camera up, and suspending the decoder
alone took the same page to a flat 60.

So the decode does not run there. `Decoder` in `05-scan.js` builds a Web
Worker and hands it each frame. A worker normally wants its own URL, which
the single-file build has nothing to serve, so this one is built from a
Blob URL -- still nothing fetched, and a Blob worker constructs from
`file://` too, where it simply inherits the page's opaque origin, so a copy
opened off a zip mount keeps its fast decode. The worker gets the decoder
by reading the text of the `<script>` the build inlined jsQR into, which is
why `build.py` tags each inlined block with `data-file`. Frames are
*transferred*, not copied: a `VideoFrame` where WebCodecs exists (a handle
on the frame the video already holds, costing nothing to make), otherwise
an `ImageBitmap`. Only one frame is in flight at a time, so a slow phone
decodes less often instead of stacking frames up.

Every piece of that is checked before it is used, and anything missing or
misbehaving latches `Decoder.off` for good and falls back to the inline
decode the page always did -- a browser without `Worker`, without either
handoff, or the multi-file dev layout where that `<script>` has a src and
no text to read. Two rules keep that fallback out of the way, and they are
worth understanding because they are what the slow path relies on: a read
never starts while the page is moving (`Transit.running`, `Scenes.busy`,
`Landing.active`), and between reads the loop rests for as long as the last
read took, so the decoder cannot take much more than half the main thread
and tunes itself to the device. The camera itself is opened once the page
cut has finished (`Scanner.armStart`), never under it, and leaving Scan
before it opens cancels the opening rather than turning the camera on
behind the reader.

Measured at 6x CPU throttle and a phone's pixel ratio, against a real code
through the camera: the Scan page goes from 22 to 60 frames a second with
no long tasks at all, the cut into Scan from 29 to 59, and the stamp
landing from 27 to 59. A code is read *faster* than before, not slower --
about 64ms against 111ms -- because the main thread is now free to come
round to the next frame. The fallback paths still read a real code in
88-111ms.

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

A meeting on today's date is still ahead of a member until check-in opens,
they are stamped, or its end time passes on the club's clock (a meeting with
no end time is not over until the day is). `Store.settle()` in `01-core.js`
decides this after every read, and Home's top line follows it:

- **Check in / GM 19**: check-in is open and they have no stamp;
- **Checked in / GM 19 / 12:43 PM**: stamped, for the rest of the day, open or
  closed; "added by an officer" in place of the time for a stamp added by hand;
- **Today / GM 19 / 12:40 PM**: today's meeting, before its start time;
- **Today / GM 19 / check-in not open**: under way and not open. Members
  cannot see attendance sessions, so "not opened yet" and "closed early" look
  the same; the line claims neither, and never says when check-in will open.
  Record keeps the row, as "Not checked in";
- **Not checked in / GM 19**: over, no stamp (an officer can still add one
  today); Record says the same for today's row and "Missed" after;
- **Next / GM 20 / Wed, Sep 30**: no meeting today.

While Home or Scan is showing, the tab is in view, and today still has a
meeting the member has no stamp for (until an hour after it ends: a board
may run over, or add a stamp by hand afterwards), `TodayWatch` in
`06-app.js` asks two tiny questions every 15 seconds, with jitter: which
meeting is open today, and how many stamps do I have. Anything changed
re-reads the record, so the Check in line appears when an officer opens
check-in (either of two meetings that day), and a stamp added by hand
arrives, without a reload. A start or end time passing only re-sorts what
is already known. It asks nothing while a code is being checked or a stamp
is landing. A failed background read leaves the page as it was; it never
turns a loaded page into "Could not load", and a read that finishes after
a newer one is dropped, so a stamp that just landed is never painted over.

A meeting held before the member's account existed, or on the day they
joined but over before the account was made, and not attended, is not on
their Record and not in their attendance rate.



---

## Not built yet: service hours

Keystamp records attendance, not service. There is no service data
anywhere in the schema, and what counts as an hour, who signs it off and
how it is reported are the club's rules to set, not the app's to guess.
When the club has them, the shape that fits what is already here:

- **One table, `service_entries`**: `user_id`, `event_date` (a club day),
  `hours` (`numeric(4,2)`, above 0 and at most 12), `activity` (short
  text), `status` (`pending` | `approved` | `rejected`), `reviewed_by`,
  `reviewed_at`, `note`, `created_at`. No stored totals: a member's hours
  are the sum of their approved rows at read time, as stamps are a count.
- **RLS as for claims and hand-overs**: a member inserts their own rows,
  only as `pending` with no reviewer; reads their own; may withdraw their
  own pending row. The board reads all. Nobody updates a row from a
  browser: approving or rejecting goes through one security-definer
  function (`review_service(id, status, note)`), board-only and never on
  your own entry, the way `hand_over_reward` works.
- **Where it shows**: a *Service* section on the member's Member page (the
  log, newest first, each line with its status, and the approved total), a
  *Log hours* form beside it, and on the board's Members page a *To
  review* list above the roster, like *To hand over*, approved or
  rejected in two taps. No new tab for either role.
- **Questions for the club first**: which activities count; whether
  entries are free-form or tied to events the board creates (then an
  `events` table and sign-ups come before hours); who may approve; and
  what the district report needs, so an export matches it.

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

Messages are toasts that cut in and out, one at a time. They wait while
hovered or focused; a tap or Escape dismisses them. A refusal is the same
strip marked `.toast--bad`, so a check-in that did not open never reads like
one that did.

A refusal on the sign-in spread or the schedule form is withdrawn on the
first keystroke that follows it; on the sign-in spread it sits under the
buttons, so the button under the finger never moves.

A button that is working keeps its box: `hold` swaps its label for the
progress word and fixes its width, `release` gives the label back
(`06-app.js`). A held button is faded and does not answer to the pointer. A
board pane that is re-read keeps what it shows (`aria-busy` on `#boardPane`)
until the new data is painted; only a chapter with nothing loaded yet shows
the loading panel (`BoardUI.skeleton`).

The page is re-read when the tab comes back into view: the record for a
member, the chapter's own data for a board pane (kept in place while it
loads; the projector keeps its code up). A re-read that finds nothing new
repaints nothing (`Store.stamp` against the last paint), so returning to the
app does not reset the page under the reader; Scan only refreshes its
meeting line, and nothing is re-read under a working button.

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
node --test tools-test-meetings.mjs   # meeting-number, form-default and board-pane rules
node --test tools-test-rewards.mjs    # the reward-tier rule
node --test tools-test-scan.mjs       # the Scan meeting line, the store fingerprint, the Card's action
```
