-- Text des Bestätigungsmails, gilt für alle Saisons. Keine Zeile oder leere Spalten bedeuten: Standardtext verwenden.

create table public.confirmation_email (
  id boolean primary key default true check (id),
  subject text,
  -- Ohne Link kämen Trainer nicht mehr auf ihre Bearbeitungsseite
  body text check (body is null or body like '%{{bearbeitungslink}}%'),
  updated_at timestamptz not null default now()
);

alter table public.confirmation_email enable row level security;

create policy "Anmeldungsadmins verwalten das Bestätigungsmail"
  on public.confirmation_email for all
  to authenticated
  using ((select public.has_admin_role('registrations')))
  with check ((select public.has_admin_role('registrations')));
