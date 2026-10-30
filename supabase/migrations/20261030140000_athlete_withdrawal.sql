-- Abmeldung einzelner Athleten nach dem Anmeldeschluss bis am Wettkampftag um 09:00 Uhr (Schweizer Zeit).

alter table public.athletes add column if not exists withdrawn_at timestamptz;

-- ---------------------------------------------------------------------------
-- Hilfsfunktion (nicht öffentlich aufrufbar)
-- ---------------------------------------------------------------------------
create or replace function public.withdrawal_is_open(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (now() at time zone 'Europe/Zurich')::date > s.signup_deadline
        and (now() at time zone 'Europe/Zurich') < s.event_date + time '09:00'
     from public.seasons s where s.id = p_season_id),
    false
  );
$$;

revoke execute on function public.withdrawal_is_open(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Öffentliche RPCs
-- ---------------------------------------------------------------------------
create or replace function public.set_athlete_withdrawn(
  p_edit_token text,
  p_athlete_id uuid,
  p_withdrawn boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations;
  v_withdrawn_at timestamptz;
begin
  select * into v_registration
  from public.registrations
  where p_edit_token is not null and edit_token = p_edit_token;

  if not found then
    raise exception 'Anmeldung nicht gefunden.';
  end if;

  if not public.withdrawal_is_open(v_registration.season_id) then
    raise exception 'Abmeldungen sind nur nach dem Anmeldeschluss bis am Wettkampftag um 09:00 Uhr möglich.';
  end if;

  update public.athletes
  set withdrawn_at = case when p_withdrawn then coalesce(withdrawn_at, now()) end
  where id = p_athlete_id and registration_id = v_registration.id
  returning withdrawn_at into v_withdrawn_at;

  if not found then
    raise exception 'Athlet nicht gefunden.';
  end if;

  return v_withdrawn_at;
end;
$$;

grant execute on function public.set_athlete_withdrawn(text, uuid, boolean) to anon, authenticated;

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
           'gender', a.gender,
           'withdrawn_at', a.withdrawn_at
         ) order by a.created_at)
       from public.athletes a where a.registration_id = r.id),
      '[]'::jsonb
    )
  )
  from public.registrations r
  where p_edit_token is not null and r.edit_token = p_edit_token;
$$;

-- Athleten werden beim Speichern neu erstellt. Abmeldungen bleiben über den Namen und Jahrgang erhalten,
-- falls der Anmeldeschluss nachträglich verschoben wird.
create or replace function public.update_registration_by_token(
  p_edit_token text,
  p_guardian_name text,
  p_club text,
  p_email text,
  p_phone text,
  p_athletes jsonb,
  p_newsletter_opt_in boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations;
  v_withdrawn jsonb;
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

  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_withdrawn
  from public.athletes a
  where a.registration_id = v_registration.id and a.withdrawn_at is not null;

  delete from public.athletes where registration_id = v_registration.id;
  perform public.insert_athletes(v_registration.id, p_athletes);

  update public.athletes a
  set withdrawn_at = (w->>'withdrawn_at')::timestamptz
  from jsonb_array_elements(v_withdrawn) as w
  where a.registration_id = v_registration.id
    and a.first_name = w->>'first_name'
    and a.last_name = w->>'last_name'
    and a.birth_year = (w->>'birth_year')::integer;

  perform public.apply_newsletter_choice(p_newsletter_opt_in, p_email, p_guardian_name, p_club);

  return jsonb_build_object(
    'id', v_registration.id,
    'edit_token', v_registration.edit_token,
    'season_id', v_registration.season_id
  );
end;
$$;
