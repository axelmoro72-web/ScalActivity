-- ============================================================
--  event_summary : exposer la colonne description
--
--  La vue avait été écrite avec « select e.* ». Postgres fige la liste
--  des colonnes à la création : ajouter une colonne à events ne
--  l'ajoute pas à la vue. La description n'était donc jamais lue par
--  l'application — et le formulaire de modification, prérempli à vide,
--  l'aurait effacée à chaque enregistrement.
--
--  create or replace ne suffit pas ici : description s'intercale au
--  milieu de la liste des colonnes, alors qu'on ne peut qu'en ajouter
--  à la fin. D'où le drop, et des colonnes désormais énumérées
--  explicitement pour que le prochain ajout se voie.
-- ============================================================

drop view if exists event_summary;

create view event_summary
with (security_invoker = on) as
select
  e.id,
  e.title,
  e.sport,
  e.description,
  e.location,
  e.starts_at,
  e.ends_at,
  e.capacity,
  e.total_cost_cents,
  e.cancel_deadline_at,
  e.status,
  e.created_by,
  e.created_at,
  ceil(e.total_cost_cents::numeric / e.capacity)::int as price_per_person_cents,
  count(r.id) filter (where r.cancelled_at is null)    as registered_count,
  greatest(
    e.capacity - count(r.id) filter (where r.cancelled_at is null),
    0
  )::int                                               as spots_left
from events e
left join registrations r on r.event_id = e.id
group by e.id;

grant select on event_summary to authenticated;
