-- Wer den Haken abwählt, bleibt als deaktivierter Kontakt sichtbar.
-- p_newsletter_opt_in: true = Haken gesetzt, false = abgewählt, null = keine Angabe (Bearbeitungslink)

alter table public.newsletter_contacts drop constraint newsletter_contacts_status_check;
alter table public.newsletter_contacts
  add constraint newsletter_contacts_status_check
  check (status in ('subscribed', 'unsubscribed', 'declined', 'bounced', 'complained'));

alter table public.newsletter_contacts drop constraint newsletter_contacts_source_check;
alter table public.newsletter_contacts
  add constraint newsletter_contacts_source_check
  check (source in ('legacy_registration', 'registration_optin', 'registration_declined', 'csv_import', 'manual'));

create or replace function public.newsletter_opt_in(p_email text, p_name text, p_club text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.newsletter_contacts (email, name, club, source, consent_at, consent_note)
  values (
    lower(trim(p_email)),
    trim(p_name),
    nullif(trim(p_club), ''),
    'registration_optin',
    now(),
    'Haken bei der Anmeldung'
  )
  on conflict (email) do update
  set source = 'registration_optin',
      name = excluded.name,
      club = excluded.club,
      consent_at = excluded.consent_at,
      consent_note = excluded.consent_note,
      status = 'subscribed',
      unsubscribed_at = null,
      needs_sync = true
  where public.newsletter_contacts.status in ('subscribed', 'unsubscribed', 'declined');
$$;

-- Neue Kontakte kennt Resend nicht, bestehende müssen dort abgemeldet werden
create function public.newsletter_opt_out(p_email text, p_name text, p_club text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.newsletter_contacts (email, name, club, source, consent_note, status, unsubscribed_at, needs_sync)
  values (
    lower(trim(p_email)),
    trim(p_name),
    nullif(trim(p_club), ''),
    'registration_declined',
    'Haken bei der Anmeldung abgewählt',
    'declined',
    now(),
    false
  )
  on conflict (email) do update
  set consent_note = excluded.consent_note,
      status = 'declined',
      unsubscribed_at = excluded.unsubscribed_at,
      needs_sync = true
  where public.newsletter_contacts.status = 'subscribed';
$$;

revoke all on function public.newsletter_opt_out(text, text, text) from public, anon, authenticated;

create or replace function public.apply_newsletter_choice(p_choice boolean, p_email text, p_name text, p_club text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_choice then
    perform public.newsletter_opt_in(p_email, p_name, p_club);
  elsif p_choice is not null then
    perform public.newsletter_opt_out(p_email, p_name, p_club);
  end if;
end;
$$;

revoke all on function public.apply_newsletter_choice(boolean, text, text, text) from public, anon, authenticated;

create or replace function public.create_registration(
  p_season_id uuid,
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
  perform public.apply_newsletter_choice(p_newsletter_opt_in, p_email, p_guardian_name, p_club);

  return jsonb_build_object('id', v_id, 'edit_token', v_token, 'season_id', p_season_id);
end;
$$;

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
  perform public.apply_newsletter_choice(p_newsletter_opt_in, p_email, p_guardian_name, p_club);

  return jsonb_build_object(
    'id', v_registration.id,
    'edit_token', v_registration.edit_token,
    'season_id', v_registration.season_id
  );
end;
$$;
