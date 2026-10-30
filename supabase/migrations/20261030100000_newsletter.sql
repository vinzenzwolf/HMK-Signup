-- Broadcast: Empfängerdatenbank, versendete Broadcasts, Haken bei der Anmeldung.
--   newsletter_contacts → lokale Empfängerliste, Resend bekommt die Änderungen beim Versand
--   broadcasts          → Entwürfe und Verlauf

alter table public.admin_users drop constraint if exists admin_users_roles_check;
alter table public.admin_users
  add constraint admin_users_roles_check
  check (roles <@ array['system', 'registrations', 'helpers', 'broadcast']::text[]);

create table public.newsletter_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (email = lower(trim(email)) and email ~* '^[^@]+@[^@]+\.[^@]+$'),
  name text,
  club text,
  source text not null
    check (source in ('legacy_registration', 'registration_optin', 'csv_import', 'manual')),
  consent_at timestamptz,
  consent_note text,
  status text not null default 'subscribed'
    check (status in ('subscribed', 'unsubscribed', 'bounced', 'complained')),
  unsubscribed_at timestamptz,
  -- true, solange Resend den aktuellen Stand noch nicht kennt
  needs_sync boolean not null default true,
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  content jsonb not null default '{}'::jsonb,
  html text not null,
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'failed')),
  resend_broadcast_id text,
  recipient_count integer,
  error text,
  sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.newsletter_contacts enable row level security;
alter table public.broadcasts enable row level security;

create policy "Broadcastadmins verwalten Empfänger"
  on public.newsletter_contacts for all
  to authenticated
  using ((select public.has_admin_role('broadcast')))
  with check ((select public.has_admin_role('broadcast')));

create policy "Broadcastadmins verwalten Broadcasts"
  on public.broadcasts for all
  to authenticated
  using ((select public.has_admin_role('broadcast')))
  with check ((select public.has_admin_role('broadcast')));

-- Anhänge werden als Download-Link verschickt, weil Broadcasts keine Dateianhänge kennen
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('broadcast-attachments', 'broadcast-attachments', true, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "Broadcastadmins lesen Anhänge"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'broadcast-attachments' and (select public.has_admin_role('broadcast')));

create policy "Broadcastadmins laden Anhänge hoch"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'broadcast-attachments' and (select public.has_admin_role('broadcast')));

create policy "Broadcastadmins löschen Anhänge"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'broadcast-attachments' and (select public.has_admin_role('broadcast')));

-- Einmalige Übernahme der bisherigen Anmeldungen. Die laufende Saison bleibt aussen vor:
-- ab jetzt kommt nur noch rein, wer bei der Anmeldung den Haken setzt.
insert into public.newsletter_contacts (email, name, club, source, consent_note, needs_sync)
select distinct on (lower(trim(r.email)))
  lower(trim(r.email)),
  r.guardian_name,
  r.club,
  'legacy_registration',
  'Übernommen aus der Anmeldung ' || s.year,
  true
from public.registrations r
join public.seasons s on s.id = r.season_id
where not s.is_active
order by lower(trim(r.email)), r.created_at desc
on conflict (email) do nothing;

-- Nur aus den Anmelde-Funktionen aufrufbar, nicht direkt von aussen
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
  where public.newsletter_contacts.status in ('subscribed', 'unsubscribed');
$$;

revoke all on function public.newsletter_opt_in(text, text, text) from public, anon, authenticated;

drop function public.create_registration(uuid, text, text, text, text, jsonb);
drop function public.update_registration_by_token(text, text, text, text, text, jsonb);

create function public.create_registration(
  p_season_id uuid,
  p_guardian_name text,
  p_club text,
  p_email text,
  p_phone text,
  p_athletes jsonb,
  p_newsletter_opt_in boolean default false
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

  if p_newsletter_opt_in then
    perform public.newsletter_opt_in(p_email, p_guardian_name, p_club);
  end if;

  return jsonb_build_object('id', v_id, 'edit_token', v_token, 'season_id', p_season_id);
end;
$$;

create function public.update_registration_by_token(
  p_edit_token text,
  p_guardian_name text,
  p_club text,
  p_email text,
  p_phone text,
  p_athletes jsonb,
  p_newsletter_opt_in boolean default false
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

  -- Ohne Haken bleibt die Empfängerliste unverändert
  if p_newsletter_opt_in then
    perform public.newsletter_opt_in(p_email, p_guardian_name, p_club);
  end if;

  return jsonb_build_object(
    'id', v_registration.id,
    'edit_token', v_registration.edit_token,
    'season_id', v_registration.season_id
  );
end;
$$;

revoke all on function public.create_registration(uuid, text, text, text, text, jsonb, boolean) from public;
revoke all on function public.update_registration_by_token(text, text, text, text, text, jsonb, boolean) from public;
grant execute on function public.create_registration(uuid, text, text, text, text, jsonb, boolean) to anon, authenticated;
grant execute on function public.update_registration_by_token(text, text, text, text, text, jsonb, boolean) to anon, authenticated;
