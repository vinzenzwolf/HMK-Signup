-- Helferanmeldung: Kontaktangaben auf Vorname, Name, Natel und E-Mail reduzieren.
-- Entfernt Strasse, Wohnort, Tel. P und Tel. G (inkl. bereits erfasster Werte).

drop function if exists public.create_helper_signup(uuid, text, text[], text, text, text, text, text, text, text, text);

alter table public.helper_signups
  drop column if exists street,
  drop column if exists city,
  drop column if exists phone_private,
  drop column if exists phone_business;

create or replace function public.create_helper_signup(
  p_season_id uuid,
  p_availability text,
  p_interests text[],
  p_first_name text,
  p_last_name text,
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

  if coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = ''
     or coalesce(trim(p_mobile), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'Bitte alle Pflichtfelder ausfüllen.';
  end if;

  insert into public.helper_signups (season_id, availability, interests, first_name, last_name, mobile, email)
  values (
    p_season_id, p_availability, coalesce(p_interests, '{}'),
    trim(p_first_name), trim(p_last_name), trim(p_mobile), trim(p_email)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_helper_signup(uuid, text, text[], text, text, text, text)
  to anon, authenticated;
