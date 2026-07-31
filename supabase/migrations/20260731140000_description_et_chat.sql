-- ============================================================
--  Description libre sur les événements + fil de discussion
--
--  Deux besoins liés : donner du contexte à une activité (matériel à
--  prévoir, adresse précise, niveau attendu) et pouvoir en discuter
--  sans quitter l'app.
--
--  Le fil est lisible et ouvert à tout membre authentifié, comme le
--  reste de l'application (events et profiles sont déjà visibles par
--  tous) : quelqu'un qui hésite à s'inscrire doit pouvoir lire la
--  discussion avant de se décider.
-- ============================================================

alter table events add column description text;

-- ============================================================
--  EVENT_MESSAGES
--  Un message ne se modifie pas : il se supprime, par son auteur ou
--  par un admin. Aucune policy d'update, et l'update est révoqué.
-- ============================================================

create table event_messages (
  id         bigserial primary key,
  event_id   uuid not null references events(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  body       text not null
    check (length(trim(body)) > 0 and length(body) <= 2000),
  created_at timestamptz not null default now()
);

-- Lecture du fil : tous les messages d'un event, dans l'ordre.
create index event_messages_thread_idx
  on event_messages (event_id, created_at, id);

-- Vue de lecture avec le nom de l'auteur, comme event_participants.
-- security_invoker = on : la vue applique la RLS de l'appelant.
create view event_message_list
with (security_invoker = on) as
select
  m.id,
  m.event_id,
  m.user_id,
  m.body,
  m.created_at,
  p.display_name
from event_messages m
join profiles p on p.id = m.user_id;

alter table event_messages enable row level security;

create policy event_messages_select_all on event_messages
  for select to authenticated
  using (true);

-- On ne poste qu'en son propre nom.
create policy event_messages_insert_self on event_messages
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy event_messages_delete_own_or_admin on event_messages
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

-- Même précaution que sur registrations : la RLS ne filtre pas les
-- colonnes. Sans grant par colonne, un membre pourrait antidater son
-- message via created_at et l'épingler en tête du fil.
revoke insert, update on event_messages from authenticated;
grant  insert (event_id, user_id, body) on event_messages to authenticated;
grant  select, delete on event_messages to authenticated;
grant  select on event_message_list to authenticated;
grant  usage, select on sequence event_messages_id_seq to authenticated;

-- Diffusion temps réel du fil. La RLS s'applique aussi aux événements
-- Realtime : seuls les membres authentifiés les reçoivent.
alter publication supabase_realtime add table event_messages;

-- ============================================================
--  update_event : nouvel argument p_description
--
--  Postgres surchargerait la fonction au lieu de la remplacer si on
--  se contentait d'un create or replace avec une signature différente.
--  On supprime donc explicitement l'ancienne. Le corps est inchangé,
--  hormis la colonne description dans l'UPDATE.
-- ============================================================

drop function if exists public.update_event(
  uuid, text, text, text, timestamptz, timestamptz, int, int
);

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

revoke execute on function public.update_event(uuid, text, text, text, text, timestamptz, timestamptz, int, int) from public, anon;
grant  execute on function public.update_event(uuid, text, text, text, text, timestamptz, timestamptz, int, int) to authenticated;
