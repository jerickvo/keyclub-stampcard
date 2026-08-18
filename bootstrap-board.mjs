#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   keystamp — board account bootstrap

   Run from a trusted machine or CI, never from the browser:

       SUPABASE_URL=... \
       SUPABASE_SERVICE_ROLE_KEY=... \
       BOARD_USERNAME=... \
       BOARD_PASSWORD=... \
       node supabase/bootstrap-board.mjs

   Why this is a script and not a page:
   promoting an account to board requires the service role key, which
   bypasses row level security. That key must never reach a browser, so
   the one operation that needs it lives here, outside the shipped app.

   Idempotent by design. Running it twice does not create a second
   board account: it looks the account up first, and if it exists it
   verifies and repairs the role instead of inserting. Re-running after
   a password change also resets the password to the current env value,
   so this doubles as the recovery path.
   ══════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  BOARD_USERNAME,
  BOARD_PASSWORD,
} = process.env;

const AUTH_DOMAIN = 'keystamp.invalid';
const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;

function die(msg){ console.error('✗ ' + msg); process.exit(1); }

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
  die('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
if (!BOARD_USERNAME || !BOARD_PASSWORD)
  die('BOARD_USERNAME and BOARD_PASSWORD are required.');

const username = String(BOARD_USERNAME).trim().toLowerCase();
if (!USERNAME_RE.test(username))
  die('BOARD_USERNAME must be 3-24 chars: letters, numbers, underscore, full stop.');
if (String(BOARD_PASSWORD).length < 12)
  die('BOARD_PASSWORD must be at least 12 characters. This account can see every member.');

const email = `${username}@${AUTH_DOMAIN}`;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken:false, persistSession:false },
});

/* auth.admin has no getUserByEmail, so page the user list */
async function findAuthUser(addr){
  let page = 1;
  for (;;){
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage:200 });
    if (error) die('could not list users: ' + error.message);
    const hit = (data.users || []).find(u => (u.email || '').toLowerCase() === addr);
    if (hit) return hit;
    if (!data.users || data.users.length < 200) return null;
    page++;
  }
}

const existing = await findAuthUser(email);
let userId;

if (existing){
  userId = existing.id;
  /* reuse, do not duplicate — and reset the password so this script is
     also the recovery path if the board forgets it */
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: BOARD_PASSWORD,
    user_metadata:{ username, display_name: BOARD_USERNAME.trim() },
  });
  if (error) die('could not update the existing board account: ' + error.message);
  console.log(`• board auth account already existed (${username}) — reused and password reset`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: BOARD_PASSWORD,
    email_confirm: true,                     /* synthetic address, nothing to confirm */
    user_metadata:{ username, display_name: BOARD_USERNAME.trim() },
  });
  if (error) die('could not create the board account: ' + error.message);
  userId = data.user.id;
  console.log(`• created board auth account (${username})`);
}

/* The on_auth_user_created trigger writes a 'member' profile. Promotion
   happens here, with the service role, which is the only place in the
   system permitted to set role='board'. */
const { error: upErr } = await admin.from('profiles').upsert({
  id: userId,
  username,
  display_name: BOARD_USERNAME.trim(),
  role: 'board',
}, { onConflict:'id' });
if (upErr) die('could not set the board role: ' + upErr.message);

const { data: check, error: checkErr } = await admin
  .from('profiles').select('username, role').eq('id', userId).single();
if (checkErr) die('could not verify the board profile: ' + checkErr.message);
if (check.role !== 'board') die('role did not stick — check the profiles policies.');

console.log(`✓ board account ready: ${check.username} (role=${check.role})`);
console.log('  Sign in through the normal Keystamp screen with this username and password.');
