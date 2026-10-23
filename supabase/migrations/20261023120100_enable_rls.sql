-- Schritt 2 des RLS-Updates: erst ausführen, wenn das Frontend die RPCs aus
-- 20261023120000_admin_users_and_registration_rpcs.sql verwendet.
--
-- Ergebnis:
--   seasons        → öffentlich lesbar, schreiben nur Admins
--   registrations  → nur Admins (Öffentlichkeit nur über RPCs mit Bearbeitungstoken)
--   athletes       → nur Admins (dito)

alter table public.seasons enable row level security;
alter table public.registrations enable row level security;
alter table public.athletes enable row level security;

-- seasons
drop policy if exists "Saisons sind öffentlich lesbar" on public.seasons;
create policy "Saisons sind öffentlich lesbar"
  on public.seasons for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins verwalten Saisons" on public.seasons;
create policy "Admins verwalten Saisons"
  on public.seasons for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- registrations
drop policy if exists "Admins verwalten Anmeldungen" on public.registrations;
create policy "Admins verwalten Anmeldungen"
  on public.registrations for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- athletes
drop policy if exists "Admins verwalten Athleten" on public.athletes;
create policy "Admins verwalten Athleten"
  on public.athletes for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
