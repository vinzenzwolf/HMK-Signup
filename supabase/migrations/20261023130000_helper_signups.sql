-- Helferanmeldung: pro Wettkampf (Saison) ein Formular, das Admins öffnen und schliessen.

-- ---------------------------------------------------------------------------
-- Formular-Einstellungen pro Saison
-- ---------------------------------------------------------------------------
create table if not exists public.helper_forms (
  season_id uuid primary key references public.seasons (id) on delete cascade,
  is_open boolean not null default false,
  morning_label text not null default 'Vormittag (08.30 Uhr – 13.00/13.30 Uhr)',
  afternoon_label text not null default 'Nachmittag (10.30 Uhr – 16.00/16.30 Uhr)',
  note text not null default 'Für Eltern von Kindern, die im SC Liestal sind, sind pro Jahr zwei Helfereinsätze obligatorisch.',
  created_at timestamptz not null default now()
);

alter table public.helper_forms enable row level security;

drop policy if exists "Helferformulare sind öffentlich lesbar" on public.helper_forms;
create policy "Helferformulare sind öffentlich lesbar"
  on public.helper_forms for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins verwalten Helferformulare" on public.helper_forms;
create policy "Admins verwalten Helferformulare"
  on public.helper_forms for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Helferanmeldungen
-- ---------------------------------------------------------------------------
create table if not exists public.helper_signups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  availability text not null check (availability in ('ganzer_tag', 'vormittag', 'nachmittag')),
  interests text[] not null default '{}' check (interests <@ array['wirtschaft', 'anlagen']::text[]),
  last_name text not null,
  first_name text not null,
  street text not null,
  city text not null,
  phone_private text,
  phone_business text,
  mobile text not null,
  email text not null check (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  created_at timestamptz not null default now()
);

create index if not exists helper_signups_season_id_idx on public.helper_signups (season_id);

alter table public.helper_signups enable row level security;

drop policy if exists "Admins verwalten Helferanmeldungen" on public.helper_signups;
create policy "Admins verwalten Helferanmeldungen"
  on public.helper_signups for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Öffentliche RPC für das Helferformular
-- ---------------------------------------------------------------------------
create or replace function public.create_helper_signup(
  p_season_id uuid,
  p_availability text,
  p_interests text[],
  p_last_name text,
  p_first_name text,
  p_street text,
  p_city text,
  p_phone_private text,
  p_phone_business text,
  p_mobile text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.helper_forms where season_id = p_season_id and is_open) then
    raise exception 'Die Helferanmeldung ist für diesen Wettkampf nicht geöffnet.';
  end if;

  if coalesce(trim(p_last_name), '') = '' or coalesce(trim(p_first_name), '') = ''
     or coalesce(trim(p_street), '') = '' or coalesce(trim(p_city), '') = ''
     or coalesce(trim(p_mobile), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'Bitte alle Pflichtfelder ausfüllen.';
  end if;

  insert into public.helper_signups (
    season_id, availability, interests, last_name, first_name, street, city,
    phone_private, phone_business, mobile, email
  )
  values (
    p_season_id, p_availability, coalesce(p_interests, '{}'), trim(p_last_name), trim(p_first_name),
    trim(p_street), trim(p_city), nullif(trim(p_phone_private), ''), nullif(trim(p_phone_business), ''),
    trim(p_mobile), trim(p_email)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_helper_signup(uuid, text, text[], text, text, text, text, text, text, text, text)
  to anon, authenticated;
