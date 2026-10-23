-- Kontakt-E-Mail pro Helferformular (erscheint in der Bestätigungsmail und auf der Danke-Seite)
alter table public.helper_forms
  add column if not exists contact_email text
  check (contact_email is null or contact_email ~* '^[^@]+@[^@]+\.[^@]+$');
