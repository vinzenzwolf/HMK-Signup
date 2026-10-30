-- Vorlagen für Broadcasts: gespeicherte Inhalte, die sich im Editor laden und anpassen lassen.

create table public.broadcast_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name = trim(name) and name <> ''),
  subject text not null default '',
  content jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.broadcast_templates enable row level security;

create policy "Broadcastadmins verwalten Vorlagen"
  on public.broadcast_templates for all
  to authenticated
  using ((select public.has_admin_role('broadcast')))
  with check ((select public.has_admin_role('broadcast')));
