-- ============================================================
--  Participants ajoutés à la main, y compris sans compte
--
--  Un organisateur doit pouvoir inscrire quelqu'un lui-même : un
--  collègue qui a répondu de vive voix, un invité extérieur, un « +1 ».
--  Ces personnes n'ont pas forcément de compte — le domaine @scalian.com
--  étant exigé à l'inscription, un invité extérieur ne peut pas en avoir.
--
--  Une inscription porte donc soit un user_id (membre), soit un
--  guest_name (invité), jamais les deux ni aucun des deux.
--
--  Rien ici ne change de signature : les vues et les fonctions sont
--  remplacées à l'identique côté appelant. La migration peut donc être
--  appliquée sans fenêtre de casse, avant comme après le déploiement.
-- ============================================================

alter table registrations alter column user_id drop not null;
alter table registrations add column guest_name text;

alter table registrations add constraint registrations_membre_ou_invite
  check (
    (user_id is not null and guest_name is null)
    or (
      user_id is null
      and guest_name is not null
      and length(trim(guest_name)) > 0
      and length(guest_name) <= 60
    )
  );

-- L'index d'unicité (event_id, user_id) where cancelled_at is null
-- reste valable : Postgres considère deux NULL comme distincts, donc
-- plusieurs invités cohabitent sans se gêner. Deux homonymes sont
-- autorisés — c'est à l'organisateur de les distinguer.

-- ============================================================
--  VUE event_participants
--  Le nom vient du profil pour un membre, du champ libre pour un
--  invité : la jointure sur profiles doit donc devenir externe, sans
--  quoi tous les invités disparaîtraient de la liste.
-- ============================================================

drop view if exists event_participants;

create view event_participants
with (security_invoker = on) as
select
  r.id,
  r.event_id,
  r.user_id,
  r.registered_at,
  coalesce(p.display_name, r.guest_name) as display_name,
  (r.user_id is null) as is_guest,
  row_number() over (
    partition by r.event_id order by r.registered_at, r.id
  ) as position,
  row_number() over (
    partition by r.event_id order by r.registered_at, r.id
  ) <= e.capacity as is_confirmed
from registrations r
join events e on e.id = r.event_id
left join profiles p on p.id = r.user_id
where r.cancelled_at is null;

grant select on event_participants to authenticated;

-- ============================================================
--  Détection des promotions : suivre l'inscription, pas la personne
--
--  Les deux fonctions repéraient la liste d'attente par un tableau de
--  user_id. Un invité en a un nul : il n'aurait jamais été reconnu
--  comme promu, et personne n'aurait été prévenu de son passage en
--  confirmé. On suit désormais registrations.id, qui existe toujours.
--
--  Signatures inchangées : create or replace suffit, les appels en
--  cours continuent de fonctionner.
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
  v_before_waitlisted bigint[];
  v_updated  int;
begin
  perform pg_advisory_xact_lock(hashtextextended('cancel_registration:' || p_event_id::text, 0));

  select e.capacity, e.status into v_capacity, v_status
  from public.events e
  where e.id = p_event_id;

  if not found then
    raise exception 'event_not_found';
  end if;

  select array_agg(t.id)
  into v_before_waitlisted
  from (
    select r.id,
           row_number() over (order by r.registered_at, r.id) as pos
    from public.registrations r
    where r.event_id = p_event_id
      and r.cancelled_at is null
  ) t
  where t.pos > v_capacity;

  update public.registrations r
     set cancelled_at = now()
   where r.event_id = p_event_id
     and r.user_id = (select auth.uid())
     and r.cancelled_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'not_registered';
  end if;

  if v_status <> 'open' then
    return;
  end if;

  return query
  select t.user_id, coalesce(p.display_name, t.guest_name)
  from (
    select r.id, r.user_id, r.guest_name,
           row_number() over (order by r.registered_at, r.id) as pos
    from public.registrations r
    where r.event_id = p_event_id
      and r.cancelled_at is null
  ) t
  left join public.profiles p on p.id = t.user_id
  where t.pos <= v_capacity
    and t.id = any (coalesce(v_before_waitlisted, '{}'));
end;
$$;

revoke execute on function public.cancel_registration(uuid) from public, anon;
grant  execute on function public.cancel_registration(uuid) to authenticated;

create or replace function public.update_event(
  p_event_id         uuid,
  p_title            text,
  p_sport            text,
  p_description      text,
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
  v_before_waitlisted bigint[];
  v_updated         int;
begin
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

  select array_agg(t.id)
  into v_before_waitlisted
  from (
    select r.id,
           row_number() over (order by r.registered_at, r.id) as pos
    from public.registrations r
    where r.event_id = p_event_id
      and r.cancelled_at is null
  ) t
  where t.pos > v_old_capacity;

  update public.events e
     set title            = p_title,
         sport            = p_sport,
         description      = p_description,
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

  return query
  select t.user_id, coalesce(p.display_name, t.guest_name)
  from (
    select r.id, r.user_id, r.guest_name,
           row_number() over (order by r.registered_at, r.id) as pos
    from public.registrations r
    where r.event_id = p_event_id
      and r.cancelled_at is null
  ) t
  left join public.profiles p on p.id = t.user_id
  where t.pos <= p_capacity
    and t.id = any (coalesce(v_before_waitlisted, '{}'));
end;
$$;

revoke execute on function public.update_event(uuid, text, text, text, text, timestamptz, timestamptz, int, int) from public, anon;
grant  execute on function public.update_event(uuid, text, text, text, text, timestamptz, timestamptz, int, int) to authenticated;

-- ============================================================
--  remove_participant : retirer quelqu'un de la liste
--
--  Un invité ne peut pas se désinscrire lui-même — il n'a pas de
--  compte. Et une erreur de saisie doit pouvoir se corriger. Retirer
--  un participant libère une place, donc promeut le suivant : même
--  dispositif transactionnel que cancel_registration, même verrou.
--
--  Fonction distincte plutôt qu'un argument ajouté à
--  cancel_registration : un paramètre par défaut aurait rendu l'appel
--  à un seul argument ambigu et imposé de supprimer l'existante.
--
--  security definer : l'autorisation est vérifiée ici (créateur de
--  l'activité ou admin), pas par la RLS, qui n'autorise chacun qu'à
--  modifier sa propre inscription.
-- ============================================================

create or replace function public.remove_participant(
  p_event_id       uuid,
  p_registration_id bigint
)
returns table (user_id uuid, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity int;
  v_status   text;
  v_created_by uuid;
  v_before_waitlisted bigint[];
  v_updated  int;
begin
  perform pg_advisory_xact_lock(hashtextextended('cancel_registration:' || p_event_id::text, 0));

  select e.capacity, e.status, e.created_by
  into v_capacity, v_status, v_created_by
  from public.events e
  where e.id = p_event_id;

  if not found then
    raise exception 'event_not_found';
  end if;

  if v_created_by <> (select auth.uid())
     and not exists (
       select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.role = 'admin'
     )
  then
    raise exception 'not_allowed';
  end if;

  select array_agg(t.id)
  into v_before_waitlisted
  from (
    select r.id,
           row_number() over (order by r.registered_at, r.id) as pos
    from public.registrations r
    where r.event_id = p_event_id
      and r.cancelled_at is null
  ) t
  where t.pos > v_capacity;

  update public.registrations r
     set cancelled_at = now()
   where r.id = p_registration_id
     and r.event_id = p_event_id
     and r.cancelled_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'not_registered';
  end if;

  if v_status <> 'open' then
    return;
  end if;

  return query
  select t.user_id, coalesce(p.display_name, t.guest_name)
  from (
    select r.id, r.user_id, r.guest_name,
           row_number() over (order by r.registered_at, r.id) as pos
    from public.registrations r
    where r.event_id = p_event_id
      and r.cancelled_at is null
  ) t
  left join public.profiles p on p.id = t.user_id
  where t.pos <= v_capacity
    and t.id = any (coalesce(v_before_waitlisted, '{}'));
end;
$$;

revoke execute on function public.remove_participant(uuid, bigint) from public, anon;
grant  execute on function public.remove_participant(uuid, bigint) to authenticated;
