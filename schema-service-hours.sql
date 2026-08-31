-- ═══════════════════════════════════════════════════════════════════
-- keystamp — service hours
--
-- Additive. schema.sql stays the authority for accounts, meetings and
-- stamps; this file adds the service-hour half and nothing else. Run
-- schema.sql first, then this. Both are idempotent.
--
-- The source is a public Google Sheet that the club edits by hand and
-- starts fresh every school year:
--
--   A  row number        B  member name ("Last, First", mostly)
--   C  events attended   D  dues paid          E  total hours
--   F+ hours per event, event names in row 1, dates in row 2
--
-- Two facts about that sheet drive every decision below.
--
-- FIRST: there is no graduation year, and names are not unique.
-- "Patel, Maya" occupies two rows with different totals and nothing
-- tells them apart. So the database NEVER decides who a member is. A
-- member is shown the rows that plausibly match and picks one; the
-- database's job is to make that pick exclusive and permanent, not to
-- guess it. Every "match" below feeds a candidate LIST, never an
-- automatic assignment.
--
-- SECOND: the sheet is hand-maintained, so it is messy — trailing
-- whitespace, "First Last" among "Last, First", and near-typos like
-- "Aluarez, Zackary" beside "Alvarez, Zachary". Matching therefore
-- normalises hard and still only ever proposes.
--
-- Deliberately NOT stored: column D (dues) and columns F+ (per-event
-- hours). Nothing in this feature reads either, and a column nobody
-- needs is a column that leaks. Column C is taken as the event count
-- rather than counting non-empty event cells, because C is what the
-- club maintains and what the leaderboard ranks on.
-- ═══════════════════════════════════════════════════════════════════

-- Trigram similarity powers the candidate list. Supabase keeps
-- extensions in their own schema; a plain database may not have it, so
-- create it there and fall back to the default location.
create schema if not exists extensions;
do $$
begin
  create extension if not exists pg_trgm with schema extensions;
exception when others then
  begin
    create extension if not exists pg_trgm;
  exception when others then
    raise notice 'pg_trgm unavailable — candidate matching will be exact-only';
  end;
end $$;

-- ── name normalisation ─────────────────────────────────────────────
-- Both functions are IMMUTABLE so a generated column can call them.
-- They fold the mess the sheet actually contains: casing, leading and
-- trailing whitespace, doubled spaces, and punctuation (the comma in
-- "Last, First", the full stop in "Jr.", the apostrophe in "O'Brien").
--
-- Apostrophes are DELETED rather than turned into a space, so O'Brien
-- normalises to "obrien" and matches someone who typed OBrien. Every
-- other separator becomes a space, so "An-Thu" and "An Thu" agree.
-- Turning the apostrophe into a space instead would leave a stray "o"
-- token that drags the similarity score down for no reason.
create or replace function public.normalize_name(raw text)
returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(
           regexp_replace(
             replace(replace(lower(coalesce(raw, '')), '''', ''), '\u2019', ''),
             '[^a-z0-9 ]+', ' ', 'g'),
           '\s+', ' ', 'g')), '');
$$;

-- The same name with its words sorted, so "Alvarez, Zachary" and
-- "Zachary Alvarez" collapse to one key. This is what makes the sheet's
-- inconsistent name order survivable without guessing which half is the
-- surname — a guess that gets Chinese and Korean names wrong.
create or replace function public.name_sort_key(raw text)
returns text language sql immutable as $$
  select nullif(array_to_string(ARRAY(
    select w from unnest(string_to_array(public.normalize_name(raw), ' ')) as w
    where w <> '' order by w
  ), ' '), '');
$$;

-- ── profiles.real_name ─────────────────────────────────────────────
-- The name the member types at sign-up, used to build their candidate
-- list. Nullable because every account created before this feature
-- existed has none, and those members are asked for it on their next
-- visit rather than being locked out.
alter table public.profiles add column if not exists real_name text;
alter table public.profiles drop constraint if exists real_name_sane;
alter table public.profiles add constraint real_name_sane
  check (real_name is null
         or (length(btrim(real_name)) between 2 and 80
             and real_name ~ '[A-Za-z]'));

-- ── sheet_members ──────────────────────────────────────────────────
-- One row per member row in the spreadsheet.
--
-- THE IDENTITY KEY is (source_sheet_id, sort_name, name_occurrence):
-- "the Nth person called X in this sheet". NOT the row number.
--
-- Row numbers were the obvious choice and they are wrong. Insert one
-- member at row 4 and every row below shifts down; a sync that upserts
-- on (sheet_id, row_index) then rewrites row 4 in place, and the account
-- linked to it starts showing a different person's hours. No error, no
-- flag — the worst failure this feature can have.
--
-- name_occurrence is what makes duplicates addressable: the sheet has
-- two rows reading "Patel, Maya" with 15 and 1 events, so they are
-- occurrence 1 and 2 of the same key. Under a mid-sheet insertion or a
-- re-sort, that pairing is unchanged for everyone — which matters,
-- because a scheme that only DETECTED the shift would flag every member
-- below row 4 and bury the officer queue over a single edit.
--
-- Two people genuinely swapping places among identical names is not
-- distinguishable by any key, here or anywhere, because the sheet
-- records nothing that separates them.
--
-- row_index survives as an attribute, not an identity: officers need it
-- to find the row, and a re-sort simply rewrites it. Its unique
-- constraint is DEFERRABLE so a whole re-sort commits as one
-- transaction instead of colliding halfway through.
--
-- Pinning source_sheet_id means next year's sheet is a clean set of new
-- rows rather than a silent renumbering of this year's — last year's
-- links keep pointing at last year's rows, which is what happened.
create table if not exists public.sheet_members (
  id                   uuid primary key default gen_random_uuid(),
  source_sheet_id      text not null,
  row_index            integer not null check (row_index > 0),
  -- exactly as the sheet spells it, trailing spaces removed; this is
  -- what the confirmation card shows, so it must stay recognisable
  sheet_name           text not null check (length(btrim(sheet_name)) > 0),
  norm_name            text generated always as (public.normalize_name(sheet_name)) stored,
  sort_name            text generated always as (public.name_sort_key(sheet_name)) stored,
  -- 1 for the first row bearing this name, 2 for the next, and so on.
  -- Maintained by the sync in sheet order.
  name_occurrence      integer not null default 1 check (name_occurrence > 0),
  events_attended      integer not null default 0 check (events_attended >= 0),
  total_hours          numeric(8,2) not null default 0 check (total_hours >= 0),
  -- what the previous sync saw, so the member page can say what changed.
  -- NULL means "no sync has ever replaced this value", which is not the
  -- same as zero and must not render as "+0".
  prev_events_attended integer check (prev_events_attended >= 0),
  prev_total_hours     numeric(8,2) check (prev_total_hours >= 0),
  last_synced_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- position, not identity: deferrable so a re-sort can renumber every
  -- row inside one transaction without tripping over itself midway
  constraint sheet_row_position unique (source_sheet_id, row_index)
    deferrable initially immediate
);

-- The real identity. A generated column may be indexed, so this is
-- enforced by the database rather than by the sync remembering to.
create unique index if not exists sheet_member_identity
  on public.sheet_members (source_sheet_id, sort_name, name_occurrence);

create index if not exists sheet_members_sort_name
  on public.sheet_members (sort_name);
create index if not exists sheet_members_rank
  on public.sheet_members (events_attended desc, sort_name);

drop trigger if exists sheet_members_touch on public.sheet_members;
create trigger sheet_members_touch before update on public.sheet_members
  for each row execute function public.touch_updated_at();

-- ── member_sheet_links ─────────────────────────────────────────────
-- The whole point of this table is its two UNIQUE constraints.
--
--   user_id unique         one account claims at most one sheet row
--   sheet_member_id unique one sheet row belongs to at most one account
--
-- The second is the answer to "two members click Confirm at the same
-- instant". Both INSERTs race to the same unique index; exactly one
-- commits and the other gets 23505. There is no read-then-write window
-- to lose, and no amount of editing the JavaScript changes it.
--
-- ON DELETE CASCADE from profiles is the account-deletion story: delete
-- the account, the link goes with it, and the sheet row is immediately
-- claimable again with no orphan left behind.
create table if not exists public.member_sheet_links (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references public.profiles(id) on delete cascade,
  -- RESTRICT, not CASCADE. A sheet row vanishing must not quietly take a
  -- member's confirmed identity with it and drop them back on the
  -- confirmation card as though they had never confirmed. The sync marks
  -- rows it can no longer find; it does not delete them.
  sheet_member_id uuid not null unique references public.sheet_members(id) on delete restrict,
  link_method     text not null default 'self' check (link_method in ('self','officer')),
  -- null when the member claimed it themselves; the officer's id when
  -- a board member resolved it by hand
  linked_by       uuid references public.profiles(id) on delete set null,
  linked_at       timestamptz not null default now(),

  -- What the member actually agreed to. They confirmed "I am the person
  -- called X on this sheet" — a name, not a row number — so the name is
  -- what gets recorded, and it is what drift is measured against.
  -- Written by a trigger from the sheet row itself, never accepted from
  -- the client, and frozen afterwards.
  confirmed_sheet_name text,
  confirmed_sort_name  text,

  -- Set when the row this link points at stops being the person who was
  -- confirmed. The member page must fail closed on this: showing someone
  -- else's hours is the exact outcome being guarded against.
  needs_reconfirm    boolean not null default false,
  reconfirm_reason   text check (reconfirm_reason in ('name_changed','row_missing')),
  drift_detected_at  timestamptz,
  drift_observed_name text
);

-- Added to a table that may already hold rows, so: add, backfill, then
-- constrain. `alter ... add column if not exists` is a no-op the second
-- time, which keeps the whole file re-runnable.
alter table public.member_sheet_links add column if not exists confirmed_sheet_name text;
alter table public.member_sheet_links add column if not exists confirmed_sort_name  text;
alter table public.member_sheet_links add column if not exists needs_reconfirm boolean not null default false;
alter table public.member_sheet_links add column if not exists reconfirm_reason text;
alter table public.member_sheet_links add column if not exists drift_detected_at timestamptz;
alter table public.member_sheet_links add column if not exists drift_observed_name text;
update public.member_sheet_links l
   set confirmed_sheet_name = sm.sheet_name,
       confirmed_sort_name  = sm.sort_name
  from public.sheet_members sm
 where sm.id = l.sheet_member_id and l.confirmed_sheet_name is null;

-- An older run of this file may have created the FK as ON DELETE CASCADE.
do $$
begin
  if exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
              where t.relname = 'member_sheet_links'
                and c.conname = 'member_sheet_links_sheet_member_id_fkey'
                and c.confdeltype = 'c') then
    alter table public.member_sheet_links drop constraint member_sheet_links_sheet_member_id_fkey;
    alter table public.member_sheet_links add constraint member_sheet_links_sheet_member_id_fkey
      foreign key (sheet_member_id) references public.sheet_members(id) on delete restrict;
  end if;
end $$;

-- ── the confirmed name is recorded by the server, not the client ───
-- A member POSTing confirmed_sheet_name:'Someone Else' would otherwise
-- decide what their own link means. The trigger overwrites whatever
-- arrived with the sheet row's actual name, and refuses to let either
-- snapshot change afterwards except through the board's re-confirm.
create or replace function public.snapshot_confirmed_name()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare sm record;
begin
  select sheet_name, sort_name into sm
    from public.sheet_members where id = new.sheet_member_id;
  if not found then
    raise exception 'sheet row does not exist';
  end if;

  if tg_op = 'INSERT' then
    new.confirmed_sheet_name := sm.sheet_name;
    new.confirmed_sort_name  := sm.sort_name;
    new.needs_reconfirm      := false;
    new.reconfirm_reason     := null;
    new.drift_detected_at    := null;
    new.drift_observed_name  := null;
    return new;
  end if;

  -- UPDATE. A link is never re-pointed at a different row or a different
  -- account; that is a delete and a fresh claim.
  if new.user_id is distinct from old.user_id
     or new.sheet_member_id is distinct from old.sheet_member_id then
    raise exception 'a link cannot be re-pointed; delete it and claim again';
  end if;

  -- Clearing the flag IS the board saying "yes, this is still them" —
  -- usually after a spelling correction — so the snapshot adopts the
  -- current name. Without this the same drift is re-detected forever.
  if old.needs_reconfirm and not new.needs_reconfirm then
    new.confirmed_sheet_name := sm.sheet_name;
    new.confirmed_sort_name  := sm.sort_name;
    new.reconfirm_reason     := null;
    new.drift_detected_at    := null;
    new.drift_observed_name  := null;
  else
    new.confirmed_sheet_name := old.confirmed_sheet_name;
    new.confirmed_sort_name  := old.confirmed_sort_name;
  end if;
  return new;
end $$;

drop trigger if exists links_snapshot_name on public.member_sheet_links;
create trigger links_snapshot_name before insert or update on public.member_sheet_links
  for each row execute function public.snapshot_confirmed_name();

-- ── drift detection ────────────────────────────────────────────────
-- Fires on the sheet row, so it catches the sync, a board edit and a
-- service-role script alike — every writer, not just the one we expect.
--
-- Self-healing in both directions: a row whose name is corrected back to
-- what was confirmed clears its own flag, so fixing a typo in the sheet
-- resolves the review without anyone touching the database.
create or replace function public.detect_link_identity_drift()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if new.sort_name is not distinct from old.sort_name then
    return new;
  end if;
  update public.member_sheet_links
     set needs_reconfirm     = true,
         reconfirm_reason    = 'name_changed',
         drift_detected_at   = now(),
         drift_observed_name = new.sheet_name
   where sheet_member_id = new.id
     and confirmed_sort_name is distinct from new.sort_name
     and not needs_reconfirm;
  update public.member_sheet_links
     set needs_reconfirm     = false,
         reconfirm_reason    = null,
         drift_detected_at   = null,
         drift_observed_name = null
   where sheet_member_id = new.id
     and confirmed_sort_name is not distinct from new.sort_name
     and needs_reconfirm;
  return new;
end $$;

drop trigger if exists sheet_members_drift on public.sheet_members;
create trigger sheet_members_drift after update on public.sheet_members
  for each row execute function public.detect_link_identity_drift();

-- ── identity_review_flags ──────────────────────────────────────────
-- Written when a member picks "None of these are me". A member must not
-- be able to resolve their own flag, so there is no member UPDATE policy
-- on this table at all.
create table if not exists public.identity_review_flags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  note        text check (note is null or length(note) <= 280),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

-- One OPEN flag per member. Resolved flags accumulate as history, so
-- the partial index is on the unresolved ones only.
create unique index if not exists one_open_flag_per_member
  on public.identity_review_flags (user_id) where resolved_at is null;

-- ── service_sync_state ─────────────────────────────────────────────
-- Singleton. The member page and the leaderboard must show the SAME
-- "last updated", so it is stored once rather than derived per row.
create table if not exists public.service_sync_state (
  id              boolean primary key default true check (id),
  source_sheet_id text,
  last_synced_at  timestamptz,
  last_status     text check (last_status in ('ok','failed')),
  last_error      text,
  rows_seen       integer check (rows_seen >= 0),
  updated_at      timestamptz not null default now()
);
insert into public.service_sync_state (id) values (true) on conflict (id) do nothing;

drop trigger if exists sync_state_touch on public.service_sync_state;
create trigger sync_state_touch before update on public.service_sync_state
  for each row execute function public.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- MATCHING — proposes, never assigns
-- ═══════════════════════════════════════════════════════════════════

-- Does this sheet row plausibly belong to the signed-in caller?
--
-- SECURITY DEFINER because it reads the caller's own real_name and the
-- whole sheet, and takes NO name argument: it answers only about
-- auth.uid(). A version that accepted a name would let any member walk
-- the sheet by trying names until something matched.
--
-- This is the function the INSERT policy calls, which is what stops a
-- member from claiming an arbitrary row id by hand.
create or replace function public.sheet_row_matches_caller(p_sheet_member_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, extensions as $$
  select exists (
    select 1
    from public.sheet_members sm
    join public.profiles p on p.id = auth.uid()
    where sm.id = p_sheet_member_id
      and p.real_name is not null
      and sm.sort_name is not null
      and (
        sm.sort_name = public.name_sort_key(p.real_name)
        or sm.norm_name = public.normalize_name(p.real_name)
        -- a typo away: "aluarez zackary" vs "alvarez zachary"
        or similarity(sm.sort_name, public.name_sort_key(p.real_name)) >= 0.45
      )
  );
$$;
revoke all on function public.sheet_row_matches_caller(uuid) from public;
grant execute on function public.sheet_row_matches_caller(uuid) to authenticated;

-- The candidate list itself. Ordered exact-first, then by similarity.
-- `is_claimed` is included so the card can say "ask a board member"
-- instead of letting the member press Confirm into a 23505 — but WHICH
-- account holds it is never returned.
create or replace function public.service_identity_candidates(p_limit integer default 5)
returns table (
  sheet_member_id uuid,
  sheet_name      text,
  events_attended integer,
  total_hours     numeric,
  is_claimed      boolean,
  is_exact        boolean
) language sql stable security definer
set search_path = pg_catalog, public, extensions as $$
  select sm.id, sm.sheet_name, sm.events_attended, sm.total_hours,
         exists (select 1 from public.member_sheet_links l
                  where l.sheet_member_id = sm.id),
         sm.sort_name = public.name_sort_key(p.real_name)
  from public.sheet_members sm
  join public.profiles p on p.id = auth.uid()
  where p.real_name is not null
    and sm.sort_name is not null
    and (
      sm.sort_name = public.name_sort_key(p.real_name)
      or sm.norm_name = public.normalize_name(p.real_name)
      or similarity(sm.sort_name, public.name_sort_key(p.real_name)) >= 0.45
    )
  order by (sm.sort_name = public.name_sort_key(p.real_name)) desc,
           similarity(sm.sort_name, public.name_sort_key(p.real_name)) desc,
           sm.events_attended desc
  limit greatest(1, least(coalesce(p_limit, 5), 10));
$$;
revoke all on function public.service_identity_candidates(integer) from public;
grant execute on function public.service_identity_candidates(integer) to authenticated;

-- Officer view: the rows a flagged member might be, ignoring the
-- caller's own identity. Board-gated inside the function body, because
-- SECURITY DEFINER means RLS will not do it for us.
create or replace function public.service_candidates_for(p_user_id uuid, p_limit integer default 10)
returns table (
  sheet_member_id uuid,
  sheet_name      text,
  events_attended integer,
  total_hours     numeric,
  is_claimed      boolean
) language plpgsql stable security definer
set search_path = pg_catalog, public, extensions as $$
begin
  if not public.is_board() then
    raise exception 'board only';
  end if;
  return query
    select sm.id, sm.sheet_name, sm.events_attended, sm.total_hours,
           exists (select 1 from public.member_sheet_links l
                    where l.sheet_member_id = sm.id)
    from public.sheet_members sm
    join public.profiles p on p.id = p_user_id
    where p.real_name is not null
      and sm.sort_name is not null
    order by similarity(sm.sort_name, public.name_sort_key(p.real_name)) desc,
             sm.events_attended desc
    limit greatest(1, least(coalesce(p_limit, 10), 25));
end $$;
revoke all on function public.service_candidates_for(uuid, integer) from public;
grant execute on function public.service_candidates_for(uuid, integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════
alter table public.sheet_members         enable row level security;
alter table public.member_sheet_links    enable row level security;
alter table public.identity_review_flags enable row level security;
alter table public.service_sync_state    enable row level security;

-- sheet_members: readable by any signed-in member. The spreadsheet is
-- public and the leaderboard ranks everyone in it, so there is nothing
-- here to hide — but dues and per-event hours were never imported, so
-- "everything" is only the name and the two totals.
--
-- No member write policy of any kind. Totals come from the sync (service
-- role) or the board. A member who could edit this table could award
-- themselves the leaderboard.
drop policy if exists sheet_members_read on public.sheet_members;
create policy sheet_members_read on public.sheet_members
  for select to authenticated using (true);

drop policy if exists sheet_members_board_insert on public.sheet_members;
create policy sheet_members_board_insert on public.sheet_members
  for insert to authenticated with check (public.is_board());
drop policy if exists sheet_members_board_update on public.sheet_members;
create policy sheet_members_board_update on public.sheet_members
  for update to authenticated using (public.is_board()) with check (public.is_board());
revoke delete, truncate on public.sheet_members from anon, authenticated;

-- links: a member sees their own and nothing else. Board sees all,
-- because the admin list has to show who is already linked.
drop policy if exists links_self_read on public.member_sheet_links;
create policy links_self_read on public.member_sheet_links
  for select to authenticated using (user_id = auth.uid() or public.is_board());

-- The claim. Four conditions, all enforced here rather than in the UI:
--   · you may only link YOURSELF
--   · to a row that plausibly matches your real name — this is what
--     stops "POST /member_sheet_links with any uuid I like"
--   · labelled as a self-claim
--   · with no officer attributed to it
-- Exclusivity is the unique index on sheet_member_id, not this policy.
drop policy if exists links_self_claim on public.member_sheet_links;
create policy links_self_claim on public.member_sheet_links
  for insert to authenticated with check (
    user_id = auth.uid()
    and link_method = 'self'
    and linked_by is null
    and public.sheet_row_matches_caller(sheet_member_id)
  );

-- The officer route bypasses the name test on purpose: it exists
-- precisely for the members the matcher could not place.
drop policy if exists links_board_insert on public.member_sheet_links;
create policy links_board_insert on public.member_sheet_links
  for insert to authenticated with check (
    public.is_board() and link_method = 'officer' and linked_by = auth.uid()
  );

-- A wrong link has to be undoable by a board member, or the only fix is
-- deleting the member's account. Members cannot delete their own link —
-- that would make "permanent" a lie and let someone shop for rows.
drop policy if exists links_board_delete on public.member_sheet_links;
create policy links_board_delete on public.member_sheet_links
  for delete to authenticated using (public.is_board());
grant delete on public.member_sheet_links to authenticated;
revoke delete on public.member_sheet_links from anon;
revoke truncate on public.member_sheet_links from anon, authenticated;

-- The board may clear a drift flag — "yes, this is still them, the sheet
-- just spells it differently now" — and nothing else. Re-pointing a link
-- at another row or another account is refused by the trigger, so this
-- policy cannot be widened by accident into a way to reassign identities.
-- Members get no UPDATE policy at all: clearing your own drift flag would
-- be the whole guard undone from a browser console.
drop policy if exists links_board_reconfirm on public.member_sheet_links;
create policy links_board_reconfirm on public.member_sheet_links
  for update to authenticated using (public.is_board()) with check (public.is_board());

-- flags: raise your own, read your own. Only the board resolves one —
-- there is no member UPDATE policy, so "mark my own review done" is not
-- an operation that exists.
drop policy if exists flags_self_read on public.identity_review_flags;
create policy flags_self_read on public.identity_review_flags
  for select to authenticated using (user_id = auth.uid() or public.is_board());

drop policy if exists flags_self_insert on public.identity_review_flags;
create policy flags_self_insert on public.identity_review_flags
  for insert to authenticated with check (
    user_id = auth.uid()
    and resolved_at is null
    and resolved_by is null
    -- a member who is already linked has nothing to review
    and not exists (select 1 from public.member_sheet_links l
                     where l.user_id = auth.uid())
  );

drop policy if exists flags_board_resolve on public.identity_review_flags;
create policy flags_board_resolve on public.identity_review_flags
  for update to authenticated using (public.is_board()) with check (public.is_board());
revoke delete, truncate on public.identity_review_flags from anon, authenticated;

-- sync state: everyone signed in reads the timestamp, nobody in a
-- browser writes it. The sync runs with the service role.
drop policy if exists sync_state_read on public.service_sync_state;
create policy sync_state_read on public.service_sync_state
  for select to authenticated using (true);
drop policy if exists sync_state_board_update on public.service_sync_state;
create policy sync_state_board_update on public.service_sync_state
  for update to authenticated using (public.is_board()) with check (public.is_board());
revoke insert, delete, truncate on public.service_sync_state from anon, authenticated;
