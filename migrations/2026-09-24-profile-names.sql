-- Run once against a Supabase project created before this change.
-- A member could rewrite their own profiles.display_name to anything
-- (another member's name, or thousands of characters) and the board's
-- roster and attendee lists showed it in place of the username. The
-- display name may now only change case, and a sign-up that asks for
-- another name gets its username. Existing rows are untouched
-- (production had none that differ from their username in more than
-- case).
--
-- Usernames also get the sign-up form's shape rule in the database: a
-- letter or digit, and no leading, trailing or doubled period (production
-- had none that break it; NOT VALID leaves earlier rows unchecked).
-- Safe to run twice.

alter table public.profiles drop constraint if exists username_shape;
alter table public.profiles add constraint username_shape
  check (username ~ '[a-z0-9]' and username !~ '^\.|\.$|\.\.') not valid;

create or replace function public.freeze_identity_fields()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  -- id and created_at are frozen for EVERYONE, board included. The RLS
  -- WITH CHECK already pins id to auth.uid(), but a policy is one edit
  -- away from being loosened and a row that can change its primary key
  -- can move a member's whole attendance history onto another account.
  if new.id is distinct from old.id then
    raise exception 'account id cannot be changed';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;
  -- A trusted server context — the service role, or psql — carries no
  -- auth.uid(). WITHOUT this branch, supabase/bootstrap-board.mjs cannot
  -- work at all: it upserts role='board' with the service role, the
  -- trigger fires, is_board() is false (there is no signed-in user to
  -- read a role for), and the promotion is refused with
  --   'role is assigned by the club, not by the account'
  -- leaving the club with no way to create its first board account.
  --
  -- It is not reachable from a browser. profiles_self_update requires
  -- id = auth.uid(), and `id = null` matches no row, so anon and
  -- authenticated callers are filtered out by RLS before the trigger
  -- ever runs. Only a connection that already bypasses RLS gets here.
  if auth.uid() is null then return new; end if;

  if public.is_board() then return new; end if;   -- board tooling may reassign
  if new.role is distinct from old.role then
    raise exception 'role is assigned by the club, not by the account';
  end if;
  if new.username is distinct from old.username then
    raise exception 'username cannot be changed';
  end if;
  -- The display name is the username as it was typed at sign-up; only
  -- its case may change. Anything else would let a member rename
  -- themselves as another member on the board's roster and lists.
  if new.display_name is distinct from old.display_name
     and lower(coalesce(new.display_name, '')) <> lower(new.username) then
    raise exception 'display name is the username';
  end if;
  return new;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  uname text := case
    when lower(coalesce(new.raw_user_meta_data->>'username',''))
         = lower(split_part(new.email, '@', 1))
    then lower(new.raw_user_meta_data->>'username')
    else lower(split_part(new.email, '@', 1))
  end;
  typed text := new.raw_user_meta_data->>'display_name';
begin
  -- role is deliberately NOT read from raw_user_meta_data. Anything the
  -- browser sends at sign-up is ignored; every new account is a member.
  -- Keystamp derives the login address FROM the username, so the two
  -- must agree. Taking the metadata name on trust let a hostile client
  -- call auth.signUp directly with email x@... and username 'y': an
  -- account the board roster shows as "y" but which actually signs in
  -- as x. On any mismatch the address wins, because the address is what
  -- authenticates. display_name is the one member-controlled string
  -- other members see: it is the username as it was typed (its case
  -- kept), and one that says anything else (another member's name) is
  -- not taken; the username stands in.
  insert into public.profiles (id, username, display_name, role)
  values (new.id, uname,
          case when lower(coalesce(typed, '')) = uname then typed else uname end,
          'member');
  return new;
end $$;
