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
`attendance`, `reward_claims`.

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
signed with `ATTENDANCE_TOKEN_SECRET`, valid for **20 seconds**. The
board fetches a replacement at T-5s, so the projected QR rotates on its
own and is never briefly invalid. The token text is never displayed —
printing it would hand every member in the room something to forward.

The browser cannot forge a token: the secret exists only in the
functions' environment. There is no client-side verifier. The prototype
FNV/secret code was **deleted**, not disabled, and the test suite
asserts those strings are absent from the built bundle.

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
attendance sessions, or claim a tier they have not earned (the claim
policy counts real attendance rows in a subquery).

`profiles` select is now **own-row only** — board administration does
not rely on a board branch in that policy, so a member cannot
enumerate accounts even if a role claim were ever mislabelled
somewhere. All board reads go through `board-data`.

### Stamps are not editable

There is no board control that adds, edits or removes a stamp, and no
stored `total_stamps` column. Every total is `COUNT(attendance)`
computed at read time. Attendance is evidence of having been in the
MPR; a button that granted one would make the scanner pointless.

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
