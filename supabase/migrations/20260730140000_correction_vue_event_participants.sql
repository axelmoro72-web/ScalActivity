-- ============================================================
--  Correction de la vue event_participants
--
--  Dans la migration initiale, position était calculée par un
--  row_number() placé dans un cross join lateral sans FROM : la
--  fenêtre ne voyait qu'une seule ligne et position valait toujours 1
--  (donc is_confirmed toujours vrai). Mis en évidence par les tests
--  de file d'attente.
--
--  La fenêtre doit porter sur l'ensemble des inscriptions actives de
--  l'événement, conformément à l'invariant : confirmé ⇔ position ≤
--  capacity, position = ordre (registered_at, id).
-- ============================================================

create or replace view event_participants
with (security_invoker = on) as
select
  r.id,
  r.event_id,
  r.user_id,
  r.registered_at,
  p.display_name,
  row_number() over (
    partition by r.event_id
    order by r.registered_at, r.id
  ) as position,
  (
    row_number() over (
      partition by r.event_id
      order by r.registered_at, r.id
    ) <= e.capacity
  ) as is_confirmed
from registrations r
join events   e on e.id = r.event_id
join profiles p on p.id = r.user_id
where r.cancelled_at is null;
