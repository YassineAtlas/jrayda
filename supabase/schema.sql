create extension if not exists pgcrypto;

create table if not exists public.family_emails (
  email text primary key check (email = lower(email)),
  display_name text,
  added_at timestamptz not null default now()
);

create table if not exists public.semis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null check (owner_email = lower(owner_email)),
  owner_name text,
  plant_id integer,
  plant_name text,
  sowing_date date not null constraint semis_sowing_date_not_future check (sowing_date <= current_date),
  current_week integer not null default 1 check (current_week >= 1),
  location text not null,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.semis add column if not exists plant_id integer;
alter table public.semis add column if not exists plant_name text;
alter table public.semis add column if not exists current_week integer;
alter table public.family_emails add column if not exists display_name text;
alter table public.semis add column if not exists owner_name text;
update public.semis set current_week = 1 where current_week is null;
update public.semis set sowing_date = current_date where sowing_date > current_date;
alter table public.semis alter column current_week set default 1;
update public.family_emails
set display_name = split_part(email, '@', 1)
where nullif(btrim(coalesce(display_name, '')), '') is null;
update public.semis s
set owner_name = coalesce(
  nullif(btrim(fe.display_name), ''),
  split_part(s.owner_email, '@', 1)
)
from public.family_emails fe
where fe.email = s.owner_email
  and nullif(btrim(coalesce(s.owner_name, '')), '') is null;
update public.semis
set owner_name = split_part(owner_email, '@', 1)
where nullif(btrim(coalesce(owner_name, '')), '') is null;

create table if not exists public.semis_updates (
  id uuid primary key default gen_random_uuid(),
  semis_id uuid not null references public.semis(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number integer not null check (week_number >= 1),
  event_date date constraint semis_updates_event_date_not_future check (
    event_date is null or event_date <= current_date
  ),
  note text,
  photo_path text,
  created_at timestamptz not null default now()
);

alter table public.semis_updates add column if not exists event_date date;
update public.semis_updates set event_date = current_date where event_date > current_date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'semis_sowing_date_not_future'
      and conrelid = 'public.semis'::regclass
  ) then
    alter table public.semis
      add constraint semis_sowing_date_not_future
      check (sowing_date <= current_date);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'semis_updates_event_date_not_future'
      and conrelid = 'public.semis_updates'::regclass
  ) then
    alter table public.semis_updates
      add constraint semis_updates_event_date_not_future
      check (event_date is null or event_date <= current_date);
  end if;
end;
$$;

create index if not exists semis_plant_id_idx on public.semis(plant_id);
create index if not exists semis_updates_semis_id_idx on public.semis_updates(semis_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists semis_set_updated_at on public.semis;
create trigger semis_set_updated_at
before update on public.semis
for each row execute function public.set_updated_at();

create or replace function public.is_family_member()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.family_emails fe
    where fe.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.family_emails enable row level security;
alter table public.semis enable row level security;
alter table public.semis_updates enable row level security;

drop policy if exists family_emails_select_own on public.family_emails;
create policy family_emails_select_own
on public.family_emails
for select
to authenticated
using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists family_emails_update_own on public.family_emails;
create policy family_emails_update_own
on public.family_emails
for update
to authenticated
using (email = lower(coalesce(auth.jwt() ->> 'email', '')))
with check (email = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists semis_select_family on public.semis;
create policy semis_select_family
on public.semis
for select
to authenticated
using (public.is_family_member());

drop policy if exists semis_insert_own on public.semis;
create policy semis_insert_own
on public.semis
for insert
to authenticated
with check (
  public.is_family_member()
  and user_id = auth.uid()
  and owner_email = lower(coalesce(auth.jwt() ->> 'email', ''))
  and current_week >= 1
  and plant_id is not null
  and plant_name is not null
);

drop policy if exists semis_update_own on public.semis;
create policy semis_update_own
on public.semis
for update
to authenticated
using (
  public.is_family_member()
  and user_id = auth.uid()
)
with check (
  public.is_family_member()
  and user_id = auth.uid()
  and owner_email = lower(coalesce(auth.jwt() ->> 'email', ''))
  and current_week >= 1
  and plant_id is not null
  and plant_name is not null
);

drop policy if exists semis_delete_own on public.semis;
create policy semis_delete_own
on public.semis
for delete
to authenticated
using (
  public.is_family_member()
  and user_id = auth.uid()
);

drop policy if exists semis_updates_select_family on public.semis_updates;
create policy semis_updates_select_family
on public.semis_updates
for select
to authenticated
using (
  public.is_family_member()
  and exists (
    select 1
    from public.semis s
    where s.id = semis_id
  )
);

drop policy if exists semis_updates_insert_owner on public.semis_updates;
create policy semis_updates_insert_owner
on public.semis_updates
for insert
to authenticated
with check (
  public.is_family_member()
  and user_id = auth.uid()
  and exists (
    select 1
    from public.semis s
    where s.id = semis_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists semis_updates_update_owner on public.semis_updates;
create policy semis_updates_update_owner
on public.semis_updates
for update
to authenticated
using (
  public.is_family_member()
  and user_id = auth.uid()
  and exists (
    select 1
    from public.semis s
    where s.id = semis_id
      and s.user_id = auth.uid()
  )
)
with check (
  public.is_family_member()
  and user_id = auth.uid()
  and exists (
    select 1
    from public.semis s
    where s.id = semis_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists semis_updates_delete_owner on public.semis_updates;
create policy semis_updates_delete_owner
on public.semis_updates
for delete
to authenticated
using (
  public.is_family_member()
  and user_id = auth.uid()
  and exists (
    select 1
    from public.semis s
    where s.id = semis_id
      and s.user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'semis-photos',
  'semis-photos',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists semis_photos_select_family on storage.objects;
create policy semis_photos_select_family
on storage.objects
for select
to authenticated
using (
  bucket_id = 'semis-photos'
  and public.is_family_member()
);

drop policy if exists semis_photos_insert_own_folder on storage.objects;
create policy semis_photos_insert_own_folder
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'semis-photos'
  and public.is_family_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists semis_photos_update_own_folder on storage.objects;
create policy semis_photos_update_own_folder
on storage.objects
for update
to authenticated
using (
  bucket_id = 'semis-photos'
  and public.is_family_member()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'semis-photos'
  and public.is_family_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists semis_photos_delete_own_folder on storage.objects;
create policy semis_photos_delete_own_folder
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'semis-photos'
  and public.is_family_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);
