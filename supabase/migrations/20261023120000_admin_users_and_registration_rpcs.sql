-- Schritt 1 des RLS-Updates (nicht-brechend):
-- Admin-Liste und sichere RPC-Funktionen für das öffentliche Anmeldeformular.
-- Erst wenn das Frontend diese Funktionen nutzt, wird RLS aktiviert (siehe nächste Migration).

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Nur über is_admin() lesbar, keine Policies = kein direkter Zugriff über die API
alter table public.admin_users enable row level security;

insert into public.admin_users (user_id)
select id from auth.users
where email in ('vinzenzwolf1@gmail.com', 'lucas@bader-zignoli.ch')
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen (nicht öffentlich aufrufbar)
-- ---------------------------------------------------------------------------

-- Anmeldungen sind bis Ende des Anmeldeschluss-Tages (Schweizer Zeit) möglich
create or replace function public.signup_is_open(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (now() at time zone 'Europe/Zurich')::date <= s.signup_deadline
     from public.seasons s where s.id = p_season_id),
    false
  );
$$;

create or replace function public.insert_athletes(p_registration_id uuid, p_athletes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_athletes is null or jsonb_typeof(p_athletes) <> 'array' or jsonb_array_length(p_athletes) = 0 then
    raise exception 'Mindestens ein Athlet ist erforderlich.';
  end if;
  if jsonb_array_length(p_athletes) > 200 then
    raise exception 'Zu viele Athleten in einer Anmeldung.';
  end if;

  insert into public.athletes (registration_id, first_name, last_name, birth_year, gender)
  select
    p_registration_id,
    trim(a->>'first_name'),
    trim(a->>'last_name'),
    (a->>'birth_year')::integer,
    a->>'gender'
  from jsonb_array_elements(p_athletes) as a;
end;
$$;

revoke execute on function public.signup_is_open(uuid) from public, anon, authenticated;
revoke execute on function public.insert_athletes(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Öffentliche RPCs für das Anmeldeformular
-- ---------------------------------------------------------------------------

create or replace function public.create_registration(
  p_season_id uuid,
  p_guardian_name text,
  p_club text,
  p_email text,
  p_phone text,
  p_athletes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_token text;
begin
  if not public.signup_is_open(p_season_id) then
    raise exception 'Anmeldung ist nach dem Anmeldeschluss nicht mehr möglich.';
  end if;

  -- Zufälliger, nicht erratbarer Bearbeitungstoken (URL-sicheres Base64)
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');

  insert into public.registrations (season_id, guardian_name, club, email, phone, edit_token)
  values (p_season_id, trim(p_guardian_name), nullif(trim(p_club), ''), trim(p_email), trim(p_phone), v_token)
  returning id into v_id;

  perform public.insert_athletes(v_id, p_athletes);

  return jsonb_build_object('id', v_id, 'edit_token', v_token, 'season_id', p_season_id);
end;
$$;

create or replace function public.get_registration_by_token(p_edit_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'guardian_name', r.guardian_name,
    'club', r.club,
    'email', r.email,
    'phone', r.phone,
    'created_at', r.created_at,
    'season_id', r.season_id,
    'athletes', coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'id', a.id,
           'first_name', a.first_name,
           'last_name', a.last_name,
           'birth_year', a.birth_year,
           'gender', a.gender
         ) order by a.created_at)
       from public.athletes a where a.registration_id = r.id),
      '[]'::jsonb
    )
  )
  from public.registrations r
  where p_edit_token is not null and r.edit_token = p_edit_token;
$$;

create or replace function public.update_registration_by_token(
  p_edit_token text,
  p_guardian_name text,
  p_club text,
  p_email text,
  p_phone text,
  p_athletes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations;
begin
  select * into v_registration
  from public.registrations
  where p_edit_token is not null and edit_token = p_edit_token;

  if not found then
    raise exception 'Anmeldung nicht gefunden.';
  end if;

  if v_registration.season_id is not null and not public.signup_is_open(v_registration.season_id) then
    raise exception 'Änderungen sind nach dem Anmeldeschluss nicht mehr möglich.';
  end if;

  update public.registrations
  set guardian_name = trim(p_guardian_name),
      club = nullif(trim(p_club), ''),
      email = trim(p_email),
      phone = trim(p_phone)
  where id = v_registration.id;

  delete from public.athletes where registration_id = v_registration.id;
  perform public.insert_athletes(v_registration.id, p_athletes);

  return jsonb_build_object(
    'id', v_registration.id,
    'edit_token', v_registration.edit_token,
    'season_id', v_registration.season_id
  );
end;
$$;

grant execute on function public.create_registration(uuid, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.get_registration_by_token(text) to anon, authenticated;
grant execute on function public.update_registration_by_token(text, text, text, text, text, jsonb) to anon, authenticated;
