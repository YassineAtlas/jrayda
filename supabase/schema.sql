create extension if not exists pgcrypto;

create table if not exists public.family_emails (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);

create table if not exists public.semis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null check (owner_email = lower(owner_email)),
  plant_name text not null,
  sowing_date date not null,
  location text not null,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

drop policy if exists family_emails_select_own on public.family_emails;
create policy family_emails_select_own
on public.family_emails
for select
to authenticated
using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

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
