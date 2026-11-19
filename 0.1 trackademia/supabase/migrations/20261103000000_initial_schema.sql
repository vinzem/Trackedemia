-- Trackademia initial schema: profiles, notes, reminders, Google connections,
-- OAuth state, attachments storage, RLS policies, indexes and triggers.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  default_calendar_id text check (char_length(default_calendar_id) <= 255),
  default_calendar_name text check (char_length(default_calendar_name) <= 255),
  ai_detection_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Create a profile row automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  content text not null default '' check (char_length(content) <= 50000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Generated full-text vector for search.
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'B')
  ) stored
);

create index if not exists notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index if not exists notes_search_idx on public.notes using gin (search_vector);

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id uuid references public.notes (id) on delete set null,
  event_title text not null check (char_length(event_title) between 1 and 200),
  event_description text check (char_length(event_description) <= 5000),
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  all_day boolean not null default false,
  timezone text not null check (char_length(timezone) between 1 and 64),
  calendar_id text check (char_length(calendar_id) <= 255),
  calendar_name text check (char_length(calendar_name) <= 255),
  google_event_id text check (char_length(google_event_id) <= 1024),
  google_event_link text check (char_length(google_event_link) <= 2048),
  status text not null default 'pending'
    check (status in ('pending', 'syncing', 'synced', 'failed')),
  sync_error text check (char_length(sync_error) <= 500),
  last_synced_at timestamptz,
  source_text text check (char_length(source_text) <= 500),
  dedupe_key text not null check (char_length(dedupe_key) <= 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminders_end_after_start check (end_datetime > start_datetime),
  constraint reminders_synced_has_event check (status <> 'synced' or google_event_id is not null)
);

-- Duplicate prevention: one reminder per (user, note, title, start).
create unique index if not exists reminders_user_dedupe_uidx on public.reminders (user_id, dedupe_key);
-- One reminder row per Google event.
create unique index if not exists reminders_user_google_event_uidx
  on public.reminders (user_id, calendar_id, google_event_id) where google_event_id is not null;
create index if not exists reminders_user_start_idx on public.reminders (user_id, start_datetime);
create index if not exists reminders_note_idx on public.reminders (note_id);
create index if not exists reminders_user_status_idx on public.reminders (user_id, status);

create trigger reminders_set_updated_at
before update on public.reminders
for each row execute function public.set_updated_at();

-- A reminder may only reference a note owned by the same user.
create or replace function public.reminders_check_note_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.note_id is not null and not exists (
    select 1 from public.notes n where n.id = new.note_id and n.user_id = new.user_id
  ) then
    raise exception 'note_id does not belong to this user' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reminders_note_owner
before insert or update of note_id, user_id on public.reminders
for each row execute function public.reminders_check_note_owner();

-- ---------------------------------------------------------------------------
-- Google connections (server-only; tokens are AES-256-GCM encrypted by the API)
-- ---------------------------------------------------------------------------
create table if not exists public.google_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  google_account_email text check (char_length(google_account_email) <= 320),
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger google_connections_set_updated_at
before update on public.google_connections
for each row execute function public.set_updated_at();

-- Single-use OAuth state nonces (CSRF protection for the callback).
create table if not exists public.oauth_states (
  nonce text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  redirect_path text not null default '/settings',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists oauth_states_expires_idx on public.oauth_states (expires_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.reminders enable row level security;
alter table public.google_connections enable row level security;
alter table public.oauth_states enable row level security;

-- Profiles: owner can read/update their own row.
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Notes: full CRUD on own rows only.
create policy "notes_select_own" on public.notes
  for select to authenticated using (user_id = auth.uid());
create policy "notes_insert_own" on public.notes
  for insert to authenticated with check (user_id = auth.uid());
create policy "notes_update_own" on public.notes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notes_delete_own" on public.notes
  for delete to authenticated using (user_id = auth.uid());

-- Reminders: full CRUD on own rows only.
create policy "reminders_select_own" on public.reminders
  for select to authenticated using (user_id = auth.uid());
create policy "reminders_insert_own" on public.reminders
  for insert to authenticated with check (user_id = auth.uid());
create policy "reminders_update_own" on public.reminders
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reminders_delete_own" on public.reminders
  for delete to authenticated using (user_id = auth.uid());

-- google_connections and oauth_states: RLS enabled with NO policies for anon or
-- authenticated, so only the service role (backend) can read or write them.
-- Tokens are never reachable through browser queries.
revoke all on public.google_connections from anon, authenticated;
revoke all on public.oauth_states from anon, authenticated;

-- Safe, token-free view of connection status for the owner.
create or replace view public.google_connection_status
with (security_invoker = false) as
  select user_id, google_account_email, status, connected_at, updated_at
  from public.google_connections
  where user_id = auth.uid();

revoke all on public.google_connection_status from anon;
grant select on public.google_connection_status to authenticated;

-- ---------------------------------------------------------------------------
-- Attachments: private storage bucket, one folder per user (<uid>/<note_id>/file)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do nothing;

create policy "attachments_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
