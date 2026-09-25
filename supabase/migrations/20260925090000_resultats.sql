-- ============================================================
--  Résultats des activités classées, classement et historique
--
--  Un événement terminé d'une activité classée reçoit un résultat,
--  saisi ou modifié par n'importe lequel de ses participants confirmés
--  (pas de validation par l'adversaire). Deux modes, décidés côté
--  application par src/lib/activites.ts :
--
--   - raquette_sets : équipe A contre équipe B (1v1 ou 2v2), score en
--     sets, nombre de sets libre ;
--   - peche_prises  : nombre de poissons par participant.
--
--  Rien de dérivé n'est stocké : ni le statut « terminé » (il se déduit
--  de l'heure), ni le vainqueur, ni les points (recalculés à chaque
--  affichage). Modifier un résultat corrige donc tout le classement.
--
--  Dépend de 20260924100000_participants_invites (registrations.guest_name,
--  event_participants avec les invités) : un invité peut jouer, et
--  apparaît au classement sous son nom.
-- ============================================================

-- ============================================================
--  Règle de fin, et droit de saisie
--
--  Terminé : date de fin passée, ou début + 2 h sans date de fin
--  (même règle que src/lib/cycle.ts). Seul un participant confirmé
--  d'un événement ouvert (non annulé) et terminé peut écrire.
--  security invoker : les tables lues sont lisibles par tout membre.
-- ============================================================

create or replace function public.can_record_result(p_event_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.status = 'open'
      and coalesce(e.ends_at, e.starts_at + interval '2 hours') <= now()
  )
  and exists (
    select 1 from public.event_participants ep
    where ep.event_id = p_event_id
      and ep.user_id = (select auth.uid())
      and ep.is_confirmed
  );
$$;

revoke execute on function public.can_record_result(uuid) from public, anon;
grant  execute on function public.can_record_result(uuid) to authenticated;

-- ============================================================
--  EVENT_RESULTS
--  sets : [{ "a": 6, "b": 4, "tb": [7, 5] | null, "interrompu": bool }]
--  Vide pour la pêche.
-- ============================================================

create table event_results (
  event_id    uuid primary key references events(id) on delete cascade,
  mode        text not null check (mode in ('raquette_sets', 'peche_prises')),
  sets        jsonb not null default '[]'::jsonb,
  -- Nullables : supprimer un compte ne doit pas être bloqué par les
  -- résultats qu'il a saisis (on perd alors seulement le nom de l'auteur).
  recorded_by uuid references profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  updated_by  uuid references profiles(id) on delete set null,
  updated_at  timestamptz
);

-- ============================================================
--  EVENT_RESULT_PLAYERS
--  Même principe que registrations : un membre (user_id) ou un invité
--  (guest_name), jamais les deux. team pour la raquette, catches pour
--  la pêche.
-- ============================================================

create table event_result_players (
  id         bigserial primary key,
  event_id   uuid not null references event_results(event_id) on delete cascade,
  user_id    uuid references profiles(id) on delete cascade,
  guest_name text,
  team       text check (team in ('A', 'B')),
  catches    int check (catches >= 0 and catches <= 999),

  constraint event_result_players_membre_ou_invite check (
    (user_id is not null and guest_name is null)
    or (user_id is null and guest_name is not null and length(trim(guest_name)) > 0)
  )
);

-- Une personne n'apparaît qu'une fois par résultat : c'est aussi ce qui
-- l'empêche d'être dans les deux équipes.
create unique index event_result_players_membre_uniq
  on event_result_players (event_id, user_id)
  where user_id is not null;
create unique index event_result_players_invite_uniq
  on event_result_players (event_id, lower(trim(guest_name)))
  where guest_name is not null;

create index event_result_players_user_idx
  on event_result_players (user_id)
  where user_id is not null;

-- ============================================================
--  Validation du score (trigger)
--
--  L'API PostgREST est joignable sans passer par l'application : les
--  règles de src/lib/resultats.ts sont donc revérifiées ici.
--   - set terminé : 6 jeux avec 2 d'écart, 7-5 ou 7-6 ;
--   - set interrompu : aucune règle, dernier set uniquement ;
--   - tie-break facultatif, sur un 7-6, gagné par le vainqueur du set.
--
--  Le même trigger pose la traçabilité : qui a saisi, qui a modifié,
--  quand. Ces colonnes ne sont pas modifiables par le client (grants par
--  colonne). Sans utilisateur (SQL Editor, données de démo), les
--  valeurs fournies sont conservées.
-- ============================================================

create or replace function public.validate_event_result()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_set  jsonb;
  v_i    int := 0;
  v_n    int;
  v_a    int;
  v_b    int;
  v_haut int;
  v_bas  int;
  v_int  boolean;
  v_tb   jsonb;
  v_uid  uuid := (select auth.uid());
begin
  if jsonb_typeof(new.sets) <> 'array' then
    raise exception 'sets_invalides';
  end if;
  v_n := jsonb_array_length(new.sets);

  if new.mode = 'peche_prises' then
    if v_n <> 0 then
      raise exception 'sets_invalides';
    end if;
  else
    if v_n = 0 then
      raise exception 'aucun_set';
    end if;

    for v_set in select value from jsonb_array_elements(new.sets) loop
      v_i := v_i + 1;
      if jsonb_typeof(v_set -> 'a') <> 'number'
         or jsonb_typeof(v_set -> 'b') <> 'number' then
        raise exception 'set_invalide';
      end if;
      -- Un décimal (6.5) échoue au cast : c'est voulu.
      v_a := (v_set ->> 'a')::int;
      v_b := (v_set ->> 'b')::int;
      if v_a < 0 or v_b < 0 or v_a > 99 or v_b > 99 then
        raise exception 'set_invalide';
      end if;

      v_int  := coalesce((v_set ->> 'interrompu')::boolean, false);
      v_haut := greatest(v_a, v_b);
      v_bas  := least(v_a, v_b);
      v_tb   := v_set -> 'tb';

      if v_int then
        if v_i < v_n then
          raise exception 'interruption_hors_dernier_set';
        end if;
      elsif not ((v_haut = 6 and v_bas <= 4) or (v_haut = 7 and v_bas in (5, 6))) then
        raise exception 'set_invalide';
      end if;

      if v_tb is not null and v_tb <> 'null'::jsonb then
        if v_int or v_haut <> 7 or v_bas <> 6
           or jsonb_typeof(v_tb) <> 'array' or jsonb_array_length(v_tb) <> 2
           or (v_tb ->> 0)::int < 0 or (v_tb ->> 1)::int < 0
           or (v_tb ->> 0)::int = (v_tb ->> 1)::int
           or ((v_tb ->> 0)::int > (v_tb ->> 1)::int) <> (v_a > v_b) then
          raise exception 'tie_break_invalide';
        end if;
      end if;
    end loop;
  end if;

  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.recorded_by := v_uid;
      new.recorded_at := now();
    end if;
    new.updated_by := null;
    new.updated_at := null;
  else
    new.recorded_by := old.recorded_by;
    new.recorded_at := old.recorded_at;
    if v_uid is not null then
      new.updated_by := v_uid;
      new.updated_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger event_results_validate
  before insert or update on event_results
  for each row execute function public.validate_event_result();

-- ============================================================
--  Validation des joueurs (trigger)
--  Le joueur doit être un participant confirmé de l'événement, et sa
--  ligne cohérente avec le mode (une équipe OU un nombre de prises).
-- ============================================================

create or replace function public.validate_event_result_player()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mode text;
begin
  select r.mode into v_mode
  from public.event_results r
  where r.event_id = new.event_id;

  if v_mode = 'raquette_sets' then
    if new.team is null or new.catches is not null then
      raise exception 'joueur_invalide';
    end if;
  else
    if new.catches is null or new.team is not null then
      raise exception 'joueur_invalide';
    end if;
  end if;

  if not exists (
    select 1 from public.event_participants ep
    where ep.event_id = new.event_id
      and ep.is_confirmed
      and (
        ep.user_id = new.user_id
        or (
          new.user_id is null
          and ep.user_id is null
          and lower(trim(ep.display_name)) = lower(trim(new.guest_name))
        )
      )
  ) then
    raise exception 'joueur_non_inscrit';
  end if;

  return new;
end;
$$;

create trigger event_result_players_validate
  before insert or update on event_result_players
  for each row execute function public.validate_event_result_player();

-- ============================================================
--  Composition des équipes (contrainte différée)
--
--  1v1 ou 2v2 : une règle qui porte sur plusieurs lignes, vérifiable
--  seulement une fois toutes les lignes écrites. D'où un constraint
--  trigger différé à la fin de la transaction — la RPC supprime puis
--  réinsère les joueurs, l'état intermédiaire n'a pas à être valide.
-- ============================================================

create or replace function public.check_event_result_teams()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
  v_mode  text;
  v_a     int;
  v_b     int;
  v_total int;
begin
  select r.mode into v_mode
  from public.event_results r
  where r.event_id = v_event;

  -- Résultat supprimé (cascade depuis l'événement) : rien à vérifier.
  if not found then
    return null;
  end if;

  select count(*) filter (where p.team = 'A'),
         count(*) filter (where p.team = 'B'),
         count(*)
  into v_a, v_b, v_total
  from public.event_result_players p
  where p.event_id = v_event;

  if v_mode = 'raquette_sets' then
    if v_a <> v_b or v_a not in (1, 2) then
      raise exception 'equipes_invalides';
    end if;
  elsif v_total = 0 then
    raise exception 'aucun_pecheur';
  end if;

  return null;
end;
$$;

create constraint trigger event_result_players_teams
  after insert or update or delete on event_result_players
  deferrable initially deferred
  for each row execute function public.check_event_result_teams();

create constraint trigger event_results_teams
  after insert or update on event_results
  deferrable initially deferred
  for each row execute function public.check_event_result_teams();

-- ============================================================
--  RLS
--  Lecture ouverte à tout membre (classement, historique). Écriture
--  réservée aux participants confirmés d'un événement terminé.
--  Pas de suppression d'un résultat : on le corrige.
-- ============================================================

alter table event_results        enable row level security;
alter table event_result_players enable row level security;

create policy event_results_select_all on event_results
  for select to authenticated
  using (true);

create policy event_results_insert_participant on event_results
  for insert to authenticated
  with check (public.can_record_result(event_id));

create policy event_results_update_participant on event_results
  for update to authenticated
  using      (public.can_record_result(event_id))
  with check (public.can_record_result(event_id));

create policy event_result_players_select_all on event_result_players
  for select to authenticated
  using (true);

create policy event_result_players_insert_participant on event_result_players
  for insert to authenticated
  with check (public.can_record_result(event_id));

create policy event_result_players_delete_participant on event_result_players
  for delete to authenticated
  using (public.can_record_result(event_id));

-- La RLS ne filtre pas les colonnes : sans grants par colonne, un
-- participant pourrait écrire recorded_by au nom d'un autre.
revoke insert, update, delete on event_results from authenticated;
grant  select on event_results to authenticated;
grant  insert (event_id, mode, sets) on event_results to authenticated;
grant  update (mode, sets) on event_results to authenticated;

revoke insert, update, delete on event_result_players from authenticated;
grant  select, delete on event_result_players to authenticated;
grant  insert (event_id, user_id, guest_name, team, catches)
  on event_result_players to authenticated;
grant  usage, select on sequence event_result_players_id_seq to authenticated;

-- ============================================================
--  save_event_result : saisie ou modification, en une transaction
--
--  security invoker : la RLS et les grants ci-dessus s'appliquent. La
--  fonction ne fait que regrouper l'upsert du résultat et le
--  remplacement des joueurs, pour qu'un résultat ne soit jamais visible
--  à moitié écrit.
-- ============================================================

create or replace function public.save_event_result(
  p_event_id uuid,
  p_mode     text,
  p_sets     jsonb,
  p_players  jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.can_record_result(p_event_id) then
    raise exception 'not_allowed';
  end if;

  -- Deux saisies simultanées du même événement se sérialisent.
  perform pg_advisory_xact_lock(hashtextextended('event_result:' || p_event_id::text, 0));

  insert into public.event_results (event_id, mode, sets)
  values (p_event_id, p_mode, coalesce(p_sets, '[]'::jsonb))
  on conflict (event_id) do update
    set mode = excluded.mode,
        sets = excluded.sets;

  delete from public.event_result_players p
  where p.event_id = p_event_id;

  insert into public.event_result_players (event_id, user_id, guest_name, team, catches)
  select p_event_id,
         nullif(x ->> 'user_id', '')::uuid,
         nullif(trim(x ->> 'guest_name'), ''),
         nullif(x ->> 'team', ''),
         (x ->> 'catches')::int
  from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) x;
end;
$$;

revoke execute on function public.save_event_result(uuid, text, jsonb, jsonb) from public, anon;
grant  execute on function public.save_event_result(uuid, text, jsonb, jsonb) to authenticated;

-- ============================================================
--  Vue de lecture : une ligne par joueur, avec l'événement et les noms
--  de qui a saisi / modifié. Les événements annulés en sont exclus.
-- ============================================================

create view event_result_details
with (security_invoker = on) as
select
  r.event_id,
  e.title,
  e.sport,
  e.location,
  e.starts_at,
  e.ends_at,
  r.mode,
  r.sets,
  r.recorded_by,
  rb.display_name as recorded_by_name,
  r.recorded_at,
  r.updated_by,
  ub.display_name as updated_by_name,
  r.updated_at,
  p.id as player_id,
  p.user_id,
  p.guest_name,
  coalesce(pp.display_name, p.guest_name) as display_name,
  p.team,
  p.catches
from event_results r
join events e on e.id = r.event_id
left join event_result_players p on p.event_id = r.event_id
left join profiles pp on pp.id = p.user_id
left join profiles rb on rb.id = r.recorded_by
left join profiles ub on ub.id = r.updated_by
where e.status = 'open';

grant select on event_result_details to authenticated;
