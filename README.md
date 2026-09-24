# Keystamp — setup

Attendance stamps for Key Club General Meetings. Meetings are held in
the MPR and may fall on any day of the week — the board sets each
meeting's date. 10 stamps → Club Merch, 20 → Free Blindbox, 30 → ???

(Design and UI notes: see `README-app.md`.)

---

## ⚠️ This SQL must be applied to the real Supabase project before production use.

`schema.sql` has **not** been executed against a live database
in this build — the development environment had no network route to
Supabase (`supabase.co` returned 403 through the egress proxy; no
Supabase CLI, `psql` or Deno runtime was available). It is written to
run as-is, but *written to run* and *verified running* are different
things. Apply it and check the result yourself.

---

## 1. Apply the schema

Dashboard → **SQL Editor** → paste all of `schema.sql` → Run.
It is idempotent (`if not exists`, `drop policy if exists`), so
re-running is safe.

Confirm in Table Editor: `profiles`, `meetings`, `attendance_sessions`,
`attendance`, `reward_claims`, `reward_handovers`.

A project set up before 2026-09-23: see "Prizes and stamps by hand" below.

## 2. Turn OFF email confirmation

**Authentication → Providers → Email → disable "Confirm email".**

Required, and a direct consequence of the product rule that members
sign in with a username and never see an email field. Supabase Auth
identities are email-based underneath, so Keystamp maps
`username → <username>@keystamp.invalid` internally. That address is
synthetic and unroutable: nobody can receive a confirmation at it, so
leaving confirmation on means every new account is created and then
immediately unable to sign in.

Nobody is ever asked to verify a synthetic address, and there is no
fake inbox. If the setting is wrong, sign-up fails with a message that
names the configuration problem instead of a generic error.

## 3. Deploy the Edge Functions

The signing secret lives only here. Generate it once; both functions
need the **same** value.

```bash
supabase functions deploy attendance-session
supabase functions deploy verify-attendance
supabase functions deploy board-data
supabase secrets set ATTENDANCE_TOKEN_SECRET="$(openssl rand -hex 32)"
```

Each function is one file in this repository, deployed as that
function's `index.ts`: `attendance-session.ts`, `verify-attendance.ts`,
and `index.ts` (board-data). `attendance-session` needs
`migrations/2026-09-24-check-in-transitions.sql` on the database first.

`board-data` is the only privileged read path for club administration.
It re-reads the caller's role from `profiles` on every call, so a
member hitting the same endpoint gets 403 rather than data.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into
functions automatically.

## 4. Create the board account

Never from the browser — this needs the service role key.

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
BOARD_USERNAME=keyclubboard \
BOARD_PASSWORD='a long passphrase' \
node bootstrap-board.mjs
```

Idempotent: re-running reuses the existing account and resets its
password, so it doubles as the recovery path.

## 5. Point the app at the project

In `dev.html`, fill the two meta tags, then rebuild:

```html
<meta name="keystamp:supabase-url"      content="https://xxx.supabase.co">
<meta name="keystamp:supabase-anon-key" content="eyJ...">
```

```bash
python3 build.py
```

The anon key is public by design and safe in the page **only because
RLS is on every table**. The service role key must never appear in
`dev.html`, `index.html`, any source file, or git history.

---

## How attendance security works

```
board  → attendance-session (Edge Function) → signed token → QR on projector
member → verify-attendance  (Edge Function) → attendance row in Postgres
```

A token is `keystamp://a/<base64url(session.meeting.expiry)>.<HMAC-SHA256>`,
signed with `ATTENDANCE_TOKEN_SECRET`. `attendance-session` issues one
code per check-in session: the projected QR stays the same for as long
as check-in is open, and asking again gives the same code. Closing
check-in is what ends it (below); opening again starts a new session
with a new code. Its expiry is the end of the meeting's day, and the
verifier takes it only for an open meeting dated today. A photo of the
wall therefore works while that check-in stays open. The token text is
never displayed on the page.

Opening and closing check-in are one database function each
(`start_check_in`, `end_check_in`), called only by `attendance-session`
under one lock: opening a meeting while another is taking check-ins is
refused (`ATTENDANCE_ALREADY_OPEN`) instead of closing the other one; two
officers opening the same meeting at once both succeed with one session;
a meeting's `check_in_open` and its session always change together. A
board account cannot change check-in state around the function (its
direct write policies are removed).

The browser cannot forge a token: the secret exists only in the
functions' environment. There is no client-side verifier.

`verify-attendance` checks, in order: caller's JWT → HMAC signature
(constant-time compare) → expiry **on the server clock** → session
still open → meeting exists, is open, and is dated today → insert.

The insert is a bare `INSERT`, so the `unique (user_id, meeting_id)`
constraint resolves races: two simultaneous scans produce one row and
one `ALREADY_CHECKED_IN`. There is no read-then-write window.

Ending a session invalidates every token already printed or
photographed, without waiting for expiry.

**If verification is unreachable, check-in fails closed.** No stamp is
awarded. Refusing a real member is recoverable; accepting a forged code
is not.

### What members cannot do

Enforced by RLS and triggers, not JavaScript: change their own role,
insert/update/delete attendance, create or modify meetings, read
attendance sessions, claim a tier they have not earned (the claim
policy counts real attendance rows in a subquery), or record a prize as
handed over (nobody writes `reward_handovers` from a browser).

`profiles` select is now **own-row only** — board administration does
not rely on a board branch in that policy, so a member cannot
enumerate accounts even if a role claim were ever mislabelled
somewhere. All board reads go through `board-data`.

### Stamps are not editable

There is no control that edits or removes a stamp, and no stored
`total_stamps` column. Every total is `COUNT(attendance)` computed at
read time. Attendance is evidence of having been in the MPR.

There is one way to add a stamp other than scanning, for a member who is
in the room with a phone that cannot scan (dead battery, no camera):
`stamp_by_hand()`. It is board-only, for **today's** meeting only (the
club's calendar day, the same rule a scan meets), never for the officer
themselves, writes `verification_method = 'board'` with the server's
clock, and refuses a second stamp for the same meeting. Nothing else can
insert attendance from a browser: the older `attendance_board_write`
policy, which let a board account write any row labelled 'manual' or
'board' (itself, next month, any time), is dropped. Every screen that
shows such a stamp says "added by an officer" instead of printing the
time it was recorded as a check-in time.

---

## Prizes and stamps by hand

`migrations/2026-09-23-prizes-and-hand-stamps.sql` (already folded into
`schema.sql` for a new project) adds:

- `reward_handovers`: one row per prize physically handed over, when and
  by which officer. Members read their own; the board reads all; nobody
  writes it from a browser.
- `hand_over_reward(user, reward)`: board-only, never to yourself; the
  tier must be earned (or already claimed); writes the claim too if the
  member never pressed Claim; refuses a second hand-over of the same
  prize (two officers at once get one row and one `ALREADY_HANDED_OVER`).
- `undo_hand_over(user, reward)`: the officer who recorded it, within 15
  minutes.
- `stamp_by_hand(user, meeting)`, replacing `attendance_board_write` (see
  above).

To upgrade a live project, in this order:

1. `select count(*) from public.reward_claims;` Every claim on file shows
   up as a prize still owed. If any of those prizes were already handed
   out, reconcile them by hand first; do not run `hand_over_reward` for
   them (it would date the hand-over today).
2. Run the migration in the SQL Editor. It is idempotent.
3. `supabase functions deploy board-data` (the `prizes` and `find`
   actions, hand-over dates on `member`, how each stamp was made on
   `meeting`).
4. Publish the client.

The client works at every step of that order: without the table it shows
**Claimed** as before and no prize list; without the new function it hides
the prize list and searches names through the roster; without
`stamp_by_hand` it writes the stamp directly, which the old policy still
allows.

`02-rls_test.sql`, `03-handover_test.sql` and `04-hardening_test.sql`
(43 + 51 + 60 checks) run against local Postgres 16 with
`00-supabase.sql`, both for a fresh `schema.sql` and for the previous
`schema.sql` plus the migrations run twice.

## Check-in, claims and the advisors (2026-09-24)

- `migrations/2026-09-24-check-in-transitions.sql`: `start_check_in` and
  `end_check_in` (above), callable by the service role only; drops the
  board's direct write policies on `attendance_sessions` and its update
  policy on `meetings`.
- `migrations/2026-09-24-claim-ownership.sql`: `reward_claims.claimed_by`
  records who made a claim (the member, or the officer whose hand-over
  wrote it). The member's Claim is `claim_reward()`, which also makes a
  claim a hand-over wrote the member's own (it names the account the
  page shows, and is refused if another account is signed in), and
  `undo_hand_over` removes
  a claim only while it is still the one the hand-over wrote: an
  officer's Undo never takes back a claim the member made, before or
  after, or at the same moment (both take the same lock).
- `migrations/2026-09-24-advisor-fixes.sql`: `touch_updated_at` gets a
  fixed `search_path`; the trigger functions are no longer callable as
  RPCs; indexes on `attendance.meeting_id` and two small foreign keys.
  Leaked-password protection is a dashboard setting (Authentication →
  password security), not SQL.

A project on the schema before 2026-09-10 runs, in this order, each in
the SQL Editor (each is idempotent): `2026-09-10-delete-meeting`,
`2026-09-23-prizes-and-hand-stamps`, `2026-09-24-profile-names`,
`2026-09-24-meeting-guards`, `2026-09-24-check-in-transitions`,
`2026-09-24-claim-ownership`, `2026-09-24-advisor-fixes`,
`2026-09-24-claim-indexes`. Every step
works with the page and the functions already live. Then deploy
`board-data`, `attendance-session` and `verify-attendance`, and publish
the client.

The client works with the previous functions too: it claims through the
older insert when `claim_reward` is absent. That older insert, from a page published
before `claim_reward`, still makes a hand-over's claim the member's (a
trigger on `reward_claims`), so Undo cannot take it back either.

---

## Testing status — read before trusting

**Verified against the mock harness (`mock-supabase.js`):** client
wiring, error mapping, fail-closed behaviour, auth flows, board
authorization, duplicate and concurrency handling *as the client sees
them*, plus routing, empty/error states and the responsive matrix.
These run as ad-hoc Playwright scripts driving the built `index.html`
with `mock-supabase.js` injected; the harness ships in the repo, the
scripts do not.

**NOT verified — needs your live project:**

- that `schema.sql` applies without error
- that the RLS policies and triggers actually refuse what they should
- that the deployed Deno functions behave as written
- that `bootstrap-board.mjs` provisions a real board account
- the end-to-end flow on real hardware with a real camera

The mock mirrors the *decision order* of the real functions, which makes
it useful for catching client bugs. It is not evidence that production
security works.

---

## Development

```bash
python3 build.py    # regenerate index.html from dev.html + the sources
```

`index.html` is generated — edit the sources, never the bundle.
`mock-supabase.js` is a test-only harness: never shipped, never
referenced by `dev.html`. Layout and file map: see `README-app.md`.
