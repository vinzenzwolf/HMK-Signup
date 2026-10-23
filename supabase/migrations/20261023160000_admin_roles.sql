-- Admin-Rollen:
--   system         → alles, inkl. Benutzerverwaltung (nur vinzenzwolf1@gmail.com)
--   registrations  → Saisons, Anmeldungen, Athleten
--   helpers        → Helferformulare, Helferanmeldungen

alter table public.admin_users
  add column if not exists roles text[] not null default '{}'
  check (roles <@ array['system', 'registrations', 'helpers']::text[]);

update public.admin_users
set roles = '{system}'
where user_id = (select id from auth.users where email = 'vinzenzwolf1@gmail.com');

update public.admin_users
set roles = '{registrations,helpers}'
where roles = '{}';

-- Systemadmins haben jede Rolle
create or replace function public.has_admin_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
      and ('system' = any (roles) or p_role = any (roles))
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid()) and cardinality(roles) > 0
  );
$$;

-- Rollen des angemeldeten Benutzers fürs Frontend
create or replace function public.my_admin_roles()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select roles from public.admin_users where user_id = (select auth.uid())),
    '{}'::text[]
  );
$$;

grant execute on function public.has_admin_role(text) to authenticated;
grant execute on function public.my_admin_roles() to authenticated;

-- ---------------------------------------------------------------------------
-- Policies nach Rolle
-- ---------------------------------------------------------------------------
drop policy if exists "Admins verwalten Saisons" on public.seasons;
create policy "Anmeldungsadmins verwalten Saisons"
  on public.seasons for all
  to authenticated
  using ((select public.has_admin_role('registrations')))
  with check ((select public.has_admin_role('registrations')));

drop policy if exists "Admins verwalten Anmeldungen" on public.registrations;
create policy "Anmeldungsadmins verwalten Anmeldungen"
  on public.registrations for all
  to authenticated
  using ((select public.has_admin_role('registrations')))
  with check ((select public.has_admin_role('registrations')));

drop policy if exists "Admins verwalten Athleten" on public.athletes;
create policy "Anmeldungsadmins verwalten Athleten"
  on public.athletes for all
  to authenticated
  using ((select public.has_admin_role('registrations')))
  with check ((select public.has_admin_role('registrations')));

drop policy if exists "Admins verwalten Helferformulare" on public.helper_forms;
create policy "Helferadmins verwalten Helferformulare"
  on public.helper_forms for all
  to authenticated
  using ((select public.has_admin_role('helpers')))
  with check ((select public.has_admin_role('helpers')));

drop policy if exists "Admins verwalten Helferanmeldungen" on public.helper_signups;
create policy "Helferadmins verwalten Helferanmeldungen"
  on public.helper_signups for all
  to authenticated
  using ((select public.has_admin_role('helpers')))
  with check ((select public.has_admin_role('helpers')));
