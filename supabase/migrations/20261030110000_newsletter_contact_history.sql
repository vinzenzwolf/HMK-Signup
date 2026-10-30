-- Anmeldeverlauf pro E-Mail-Adresse für den Broadcast-Tab.
-- Broadcast-Admins haben keinen Zugriff auf registrations, deshalb nur diese Zusammenfassung.
create function public.newsletter_contact_history()
returns table (email text, year integer, athlete_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select lower(trim(r.email)), s.year, count(a.id)
  from public.registrations r
  join public.seasons s on s.id = r.season_id
  left join public.athletes a on a.registration_id = r.id
  where public.has_admin_role('broadcast')
  group by lower(trim(r.email)), s.year
  order by s.year;
$$;

revoke all on function public.newsletter_contact_history() from public, anon;
grant execute on function public.newsletter_contact_history() to authenticated;
