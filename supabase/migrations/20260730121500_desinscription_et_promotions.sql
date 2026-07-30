-- ============================================================
--  Désinscription transactionnelle + détection des promotions
--
--  Le statut confirmé / liste d'attente n'étant pas stocké, une
--  promotion n'émet aucun événement observable. Cette fonction est
--  LE SEUL endroit du code qui identifie les promus : dans une même
--  transaction, elle lit l'ordre des participants avant modification,
--  applique la désinscription, relit l'ordre, et retourne les
--  personnes ayant basculé en confirmé.
-- ============================================================

create or replace function public.cancel_registration(p_event_id uuid)
returns table (user_id uuid, display_name text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capacity int;
  v_status   text;
  v_before_waitlisted uuid[];
  v_updated  int;
begin
  -- Sérialise les désinscriptions concurrentes sur un même event :
  -- deux transactions qui compareraient le même "avant" détecteraient
  -- deux fois la même promotion.
  perform pg_advisory_xact_lock(hashtextextended('cancel_registration:' || p_event_id::text, 0));

  select e.capacity, e.status into v_capacity, v_status
  from public.events e
  where e.id = p_event_id;

  if not found then
    raise exception 'event_not_found';
  end if;

  -- 1. Ordre avant modification : qui est en liste d'attente.
  select array_agg(t.user_id)
  into v_before_waitlisted
  from (
    select r.user_id,
           row_number() over (order by r.registered_at, r.id) as pos
    from public.registrations r
    where r.event_id = p_event_id
      and r.cancelled_at is null
  ) t
  where t.pos > v_capacity;

  -- 2. Désinscription. security invoker : la RLS garantit qu'on ne
  --    modifie que sa propre ligne, le grant par colonne que seul
  --    cancelled_at est modifiable.
  update public.registrations r
     set cancelled_at = now()
   where r.event_id = p_event_id
     and r.user_id = (select auth.uid())
     and r.cancelled_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'not_registered';
  end if;

  -- 3. Ordre après modification : les promus sont confirmés maintenant
  --    ET étaient en liste d'attente avant. La seconde condition écarte
  --    une inscription arrivée entre les deux lectures, qui serait
  --    confirmée d'emblée sans avoir jamais attendu.
  --    Aucune promotion à notifier sur un event annulé.
  if v_status <> 'open' then
    return;
  end if;

  return query
  select t.user_id, p.display_name
  from (
    select r.user_id,
           row_number() over (order by r.registered_at, r.id) as pos
    from public.registrations r
    where r.event_id = p_event_id
      and r.cancelled_at is null
  ) t
  join public.profiles p on p.id = t.user_id
  where t.pos <= v_capacity
    and t.user_id = any (coalesce(v_before_waitlisted, '{}'));
end;
$$;

revoke execute on function public.cancel_registration(uuid) from public, anon;
grant  execute on function public.cancel_registration(uuid) to authenticated;

-- ============================================================
--  Verrouillage de l'insert sur registrations
--
--  La migration initiale verrouille registered_at contre l'UPDATE
--  (grant update (cancelled_at) uniquement) mais l'INSERT restait
--  ouvert sur toutes les colonnes : un membre pouvait s'inscrire avec
--  un registered_at antidaté et doubler toute la file. Même schéma de
--  protection : seules les colonnes légitimes sont insérables, le
--  reste vient des defaults.
-- ============================================================

revoke insert on registrations from authenticated;
grant  insert (event_id, user_id) on registrations to authenticated;
