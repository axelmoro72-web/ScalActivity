-- ============================================================
--  App events sportifs — schéma initial
--  À placer dans supabase/migrations/
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
--  PROFILES
--  Miroir public de auth.users. auth.users ne doit jamais être
--  exposé au client ; on joint sur profiles à la place.
-- ============================================================

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  role         text not null default 'member' check (role in ('member', 'admin')),
  created_at   timestamptz not null default now()
);

-- Création automatique du profil à l'inscription.
-- security definer : la fonction doit écrire dans profiles alors que
-- l'utilisateur n'existe pas encore côté RLS.
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
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
--  EVENTS
-- ============================================================

create table events (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (length(trim(title)) > 0),
  sport              text not null,
  location           text,
  starts_at          timestamptz not null,
  ends_at            timestamptz,
  capacity           int not null check (capacity > 0 and capacity <= 100),
  total_cost_cents   int not null default 0 check (total_cost_cents >= 0),
  -- Prévu pour plus tard : deadline de désistement. Non utilisé au MVP,
  -- mais présent pour éviter une migration sur une table en production.
  cancel_deadline_at timestamptz,
  status             text not null default 'open' check (status in ('open', 'cancelled')),
  created_by         uuid not null references profiles(id),
  created_at         timestamptz not null default now(),

  constraint events_ends_after_starts
    check (ends_at is null or ends_at > starts_at)
);

create index events_starts_at_idx on events (starts_at desc);

-- ============================================================
--  REGISTRATIONS
--  Pas de colonne "status" : confirmé vs liste d'attente se déduit
--  de l'ordre d'inscription (cf. vue event_participants).
--  Se désinscrire = renseigner cancelled_at. On ne supprime jamais.
-- ============================================================

create table registrations (
  id            bigserial primary key,
  event_id      uuid not null references events(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  registered_at timestamptz not null default now(),
  cancelled_at  timestamptz
);

-- Une seule inscription active par personne et par event.
-- Index partiel : une personne désinscrite peut se réinscrire
-- (elle repart en fin de file, ce qui est le comportement voulu).
create unique index registrations_active_uniq
  on registrations (event_id, user_id)
  where cancelled_at is null;

-- Index de l'ordre de file d'attente.
create index registrations_queue_idx
  on registrations (event_id, registered_at, id)
  where cancelled_at is null;

-- ============================================================
--  VUES
--  security_invoker = on : la vue applique les RLS de l'appelant.
--  Sans ça, une vue contourne les policies des tables sous-jacentes.
-- ============================================================

-- Participants avec position dans la file et statut calculé.
create view event_participants
with (security_invoker = on) as
select
  r.id,
  r.event_id,
  r.user_id,
  r.registered_at,
  p.display_name,
  pos.position,
  (pos.position <= e.capacity) as is_confirmed
from registrations r
join events   e on e.id = r.event_id
join profiles p on p.id = r.user_id
cross join lateral (
  select row_number() over (
    partition by r.event_id
    order by r.registered_at, r.id
  ) as position
) pos
where r.cancelled_at is null;

-- Vue de liste : prix par personne et compteurs.
-- Le prix n'est jamais stocké, toujours dérivé de total_cost / capacity.
create view event_summary
with (security_invoker = on) as
select
  e.*,
  ceil(e.total_cost_cents::numeric / e.capacity)::int as price_per_person_cents,
  count(r.id) filter (where r.cancelled_at is null)    as registered_count,
  greatest(
    e.capacity - count(r.id) filter (where r.cancelled_at is null),
    0
  )::int                                               as spots_left
from events e
left join registrations r on r.event_id = e.id
group by e.id;

-- ============================================================
--  RLS
--  Activée dès la création. Une table sans RLS + clé anon publique
--  = base ouverte à qui trouve l'URL.
--  (select auth.uid()) plutôt que auth.uid() : Postgres met le
--  résultat en cache pour toute la requête au lieu de le réévaluer
--  ligne par ligne.
-- ============================================================

alter table profiles      enable row level security;
alter table events        enable row level security;
alter table registrations enable row level security;

-- ---------- profiles ----------

create policy profiles_select_all on profiles
  for select to authenticated
  using (true);

create policy profiles_update_own on profiles
  for update to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Un membre ne doit pas pouvoir se promouvoir admin.
revoke update on profiles from authenticated;
grant  update (display_name) on profiles to authenticated;

-- ---------- events ----------

create policy events_select_all on events
  for select to authenticated
  using (true);

-- created_by forcé à l'appelant : impossible de créer un event
-- au nom de quelqu'un d'autre.
create policy events_insert on events
  for insert to authenticated
  with check (created_by = (select auth.uid()));

-- Modification / annulation : le créateur, ou un admin.
create policy events_update_own_or_admin on events
  for update to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  )
  with check (
    created_by = (select auth.uid())
    or exists (
      select 1 from profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

-- Aucune policy for delete : un event s'annule, ne se supprime pas.

-- ---------- registrations ----------

create policy registrations_select_all on registrations
  for select to authenticated
  using (true);

-- On ne s'inscrit que soi-même, et seulement à un event ouvert et à venir.
create policy registrations_insert_self on registrations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from events e
      where e.id = event_id
        and e.status = 'open'
        and e.starts_at > now()
    )
  );

create policy registrations_update_own on registrations
  for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- CRITIQUE : les RLS ne filtrent pas les colonnes. Sans cette
-- restriction, un membre pourrait modifier son propre registered_at
-- et remonter en tête de la liste d'attente.
-- Seul cancelled_at est modifiable ; le reste est verrouillé.
revoke update on registrations from authenticated;
grant  update (cancelled_at) on registrations to authenticated;