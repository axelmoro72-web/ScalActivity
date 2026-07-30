-- ============================================================
--  Modification d'un événement par son créateur ou un admin
--
--  Changer la capacité rejoue la file d'attente : une hausse promeut
--  des personnes en liste d'attente, et ces promotions doivent être
--  détectées dans la même transaction que la modification (même
--  principe que cancel_registration, même verrou advisory pour que
--  les deux opérations se sérialisent entre elles).
--
--  Règle métier validée : la capacité ne peut jamais descendre sous
--  le nombre de participants déjà confirmés — personne ne redescend
--  en liste d'attente.
-- ============================================================

create or replace function public.update_event(
  p_event_id         uuid,
  p_title            text,
  p_sport            text,
  p_location         text,
  p_starts_at        timestamptz,
  p_ends_at          timestamptz,
  p_capacity         int,
  p_total_cost_cents int
)
returns table (user_id uuid, display_name text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_capacity    int;
  v_status          text;
  v_active_count    int;
  v_confirmed_count int;
  v_before_waitlisted uuid[];
  v_updated         int;
begin
  -- Même clé de verrou que cancel_registration : les modifications de
  -- capacité et les désinscriptions d'un même event se sérialisent.
  perform pg_advisory_xact_lock(hashtextextended('cancel_registration:' || p_event_id::text, 0));

  select e.capacity, e.status into v_old_capacity, v_status
  from public.events e
  where e.id = p_event_id;

  if not found then
    raise exception 'event_not_found';
  end if;
  if v_status <> 'open' then
    raise exception 'event_not_open';
  end if;

  select count(*) into v_active_count
  from public.registrations r
  where r.event_id = p_event_id and r.cancelled_at is null;

  v_confirmed_count := least(v_active_count, v_old_capacity);
  if p_capacity < v_confirmed_count then
    raise exception 'capacity_below_confirmed';
  end if;

  -- Qui est en liste d'attente avant modification.
  select array_agg(t.user_id)
  into v_before_waitlisted
  from (
    select r.user_id,
           row_number() over (order by r.registered_at, r.id) as pos
    from public.registrations r
    where r.event_id = p_event_id
      and r.cancelled_at is null
  ) t
  where t.pos > v_old_capacity;

  -- security invoker : la RLS ne laisse passer que le créateur ou un
  -- admin. 0 ligne modifiée = pas le droit.
  update public.events e
     set title            = p_title,
         sport            = p_sport,
         location         = p_location,
         starts_at        = p_starts_at,
         ends_at          = p_ends_at,
         capacity         = p_capacity,
         total_cost_cents = p_total_cost_cents
   where e.id = p_event_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'not_allowed';
  end if;

  -- Promus : confirmés avec la nouvelle capacité ET en attente avant.
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
  where t.pos <= p_capacity
    and t.user_id = any (coalesce(v_before_waitlisted, '{}'));
end;
$$;

revoke execute on function public.update_event(uuid, text, text, text, timestamptz, timestamptz, int, int) from public, anon;
grant  execute on function public.update_event(uuid, text, text, text, timestamptz, timestamptz, int, int) to authenticated;
