-- ============================================================
--  Durcissement suite à la revue de sécurité
--
--  Point commun des corrections : les règles métier vivaient dans des
--  RPC (cancel_registration, update_event), mais les tables restaient
--  modifiables directement par PostgREST avec la clé anon. Toute règle
--  portée par une RPC était donc contournable par un simple PATCH.
--
--  Désormais, les écritures qui portent une règle métier ne passent que
--  par des fonctions security definer, qui vérifient elles-mêmes
--  l'appelant (auth.uid()) ; les droits directs correspondants sont
--  révoqués.
-- ============================================================


-- ============================================================
--  REGISTRATIONS : plus d'UPDATE direct
--
--  Le grant update (cancelled_at) laissait remettre cancelled_at à null
--  sur une ancienne inscription : elle redevenait active avec son
--  registered_at d'origine et doublait toute la liste d'attente. Un
--  PATCH direct court-circuitait aussi la détection des promotions (pas
--  de notification Teams).
--
--  cancel_registration devient security definer : elle ne dépend plus
--  du grant, et ne touche que la ligne de auth.uid().
-- ============================================================

revoke update on registrations from authenticated;

create or replace function public.cancel_registration(p_event_id uuid)
returns table (user_id uuid, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_capacity int;
  v_status   text;
  v_before_waitlisted uuid[];
  v_updated  int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Sérialise désinscriptions et modifications de capacité d'un même
  -- event : deux transactions comparant le même « avant » détecteraient
  -- deux fois la même promotion.
  perform pg_advisory_xact_lock(hashtextextended('cancel_registration:' || p_event_id::text, 0));

  select e.capacity, e.status into v_capacity, v_status
  from public.events e
  where e.id = p_event_id;

  if not found then
    raise exception 'event_not_found';
  end if;

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

  update public.registrations r
     set cancelled_at = now()
   where r.event_id = p_event_id
     and r.user_id = v_uid
     and r.cancelled_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'not_registered';
  end if;

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
--  EVENTS : insert par colonne, plus d'UPDATE direct
--
--  Avec l'UPDATE ouvert, le créateur pouvait par PATCH direct baisser
--  la capacité sous le nombre de confirmés (des confirmés repassaient
--  en attente sans notification), rouvrir un événement annulé, ou
--  modifier created_by / cancel_deadline_at. L'INSERT acceptait aussi
--  status, created_at…
--
--  Modifier passe par update_event, annuler par cancel_event : toutes
--  deux security definer, avec contrôle créateur-ou-admin explicite.
-- ============================================================

revoke insert, update on events from authenticated;
grant  insert (title, sport, description, location, starts_at, ends_at,
               capacity, total_cost_cents, created_by)
  on events to authenticated;

-- La policy d'update n'a plus d'effet sans grant : on la retire pour ne
-- pas laisser croire que ce chemin existe.
drop policy if exists events_update_own_or_admin on events;

-- Créateur de l'événement ou admin.
create or replace function public.can_manage_event(p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and (
       p_created_by = (select auth.uid())
       or exists (
         select 1 from public.profiles p
         where p.id = (select auth.uid()) and p.role = 'admin'
       )
     );
$$;

revoke execute on function public.can_manage_event(uuid) from public, anon;
grant  execute on function public.can_manage_event(uuid) to authenticated;

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
security definer
set search_path = ''
as $$
declare
  v_old_capacity    int;
  v_status          text;
  v_created_by      uuid;
  v_active_count    int;
  v_confirmed_count int;
  v_before_waitlisted uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended('cancel_registration:' || p_event_id::text, 0));

  select e.capacity, e.status, e.created_by
    into v_old_capacity, v_status, v_created_by
  from public.events e
  where e.id = p_event_id;

  if not found then
    raise exception 'event_not_found';
  end if;
  if not public.can_manage_event(v_created_by) then
    raise exception 'not_allowed';
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

-- Annulation : seule transition de statut possible, open → cancelled.
create or replace function public.cancel_event(p_event_id uuid)
returns table (title text, starts_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status     text;
  v_created_by uuid;
  v_title      text;
  v_starts_at  timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('cancel_registration:' || p_event_id::text, 0));

  select e.status, e.created_by into v_status, v_created_by
  from public.events e
  where e.id = p_event_id;

  if not found then
    raise exception 'event_not_found';
  end if;
  if not public.can_manage_event(v_created_by) then
    raise exception 'not_allowed';
  end if;
  if v_status <> 'open' then
    raise exception 'event_not_open';
  end if;

  update public.events e
     set status = 'cancelled'
   where e.id = p_event_id
  returning e.title, e.starts_at into v_title, v_starts_at;

  return query select v_title, v_starts_at;
end;
$$;

revoke execute on function public.cancel_event(uuid) from public, anon;
grant  execute on function public.cancel_event(uuid) to authenticated;


-- ============================================================
--  AUTH.USERS : domaine vérifié aussi au changement d'adresse
--
--  Le trigger ne portait que sur l'INSERT : un updateUser({ email })
--  vers une adresse externe y échappait. Une adresse nulle (téléphone,
--  anonyme) passait aussi, `null not like …` valant null.
--
--  L'update ne se déclenche que si l'adresse change réellement : GoTrue
--  réécrit des lignes complètes, les comptes antérieurs à la règle ne
--  doivent pas être bloqués à la connexion.
-- ============================================================

create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) not like '%@scalian.com' then
    raise exception 'domaine_non_autorise'
      using hint = 'Seules les adresses @scalian.com peuvent créer un compte.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_domain_update on auth.users;

create trigger on_auth_user_email_domain_update
  before update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.enforce_email_domain();


-- ============================================================
--  PROFILES : nom affiché borné
--
--  La limite de 60 caractères n'existait que dans le formulaire : les
--  métadonnées d'inscription et l'UPDATE de display_name passent par
--  l'API sans elle. `not valid` : la contrainte s'applique aux
--  écritures futures sans bloquer la migration sur une ligne ancienne.
-- ============================================================

alter table profiles
  add constraint profiles_display_name_length
  check (length(display_name) <= 60) not valid;

-- Le trigger d'inscription tronque plutôt que de faire échouer la
-- création du compte sur un nom trop long.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        split_part(new.email, '@', 1)
      ),
      60
    )
  );
  return new;
end;
$$;


-- ============================================================
--  EVENT_MESSAGES : limite de débit
--
--  Chaque message est relayé sur le canal Teams : sans limite, un
--  script peut inonder le canal de l'entreprise. 10 messages par minute
--  et par personne laisse une conversation vive sans gêne.
-- ============================================================

create index if not exists event_messages_user_recent_idx
  on event_messages (user_id, created_at);

create or replace function public.limit_message_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*) from public.event_messages m
    where m.user_id = new.user_id
      and m.created_at > now() - interval '1 minute'
  ) >= 10 then
    raise exception 'rate_limited';
  end if;
  return new;
end;
$$;

drop trigger if exists event_messages_rate_limit on event_messages;

create trigger event_messages_rate_limit
  before insert on event_messages
  for each row execute function public.limit_message_rate();
