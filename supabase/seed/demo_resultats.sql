-- ============================================================
--  Données de démo : 3 activités terminées avec résultat, plus une
--  sans résultat (pour essayer « Saisir le score »).
--
--  À coller dans le SQL Editor du dashboard APRÈS les migrations
--  20260924100000_participants_invites et 20260925090000_resultats.
--  Exécuté en postgres : la RLS ne s'applique pas, mais les triggers de
--  validation (score, équipes, joueurs inscrits) si.
--
--  Joueurs : les 4 premiers profils créés ; s'il en manque, des invités
--  (« Julie Martin », « Karim Benali »…) complètent. Il faut au moins un
--  profil (organisateur et auteur de la saisie).
--
--  Pour tout retirer (les inscriptions et résultats partent en cascade) :
--    delete from events where title like '[Démo]%';
-- ============================================================

do $$
declare
  v_profils uuid[];
  v_invites text[] := array['Julie Martin', 'Karim Benali', 'Sofia Rossi', 'Hugo Lambert'];
  v_users   uuid[] := array[]::uuid[];   -- user_id du joueur i (ou null)
  v_guests  text[] := array[]::text[];   -- guest_name du joueur i (ou null)
  v_auteur  uuid;
  v_second  uuid;
  v_e1 uuid; v_e2 uuid; v_e3 uuid; v_e4 uuid;
  v_i int;
  v_ev uuid;
begin
  select array_agg(id order by created_at) into v_profils
  from (select id, created_at from profiles order by created_at limit 4) p;

  if v_profils is null then
    raise exception 'Aucun profil : créez au moins un compte avant la démo.';
  end if;

  for v_i in 1..4 loop
    if v_i <= array_length(v_profils, 1) then
      v_users  := v_users  || v_profils[v_i];
      v_guests := v_guests || null::text;
    else
      v_users  := v_users  || null::uuid;
      v_guests := v_guests || v_invites[v_i];
    end if;
  end loop;

  v_auteur := v_profils[1];
  v_second := coalesce(v_profils[2], v_profils[1]);

  -- Activités (heures en UTC ; 17:00Z = 19:00 à Paris en septembre).
  insert into events (title, sport, location, starts_at, ends_at, capacity, total_cost_cents, created_by)
  values ('[Démo] Padel du jeudi', 'Padel', 'Urban Padel Carquefou',
          '2026-09-10 17:00+00', '2026-09-10 18:30+00', 4, 4800, v_auteur)
  returning id into v_e1;

  insert into events (title, sport, location, starts_at, ends_at, capacity, total_cost_cents, created_by)
  values ('[Démo] Padel du mardi', 'Padel', 'Le Smile, Saint-Herblain',
          '2026-09-15 17:30+00', '2026-09-15 19:00+00', 4, 5200, v_auteur)
  returning id into v_e2;

  insert into events (title, sport, location, starts_at, ends_at, capacity, total_cost_cents, created_by)
  values ('[Démo] Sortie pêche', 'Pêche', 'Lac de Grand-Lieu',
          '2026-09-19 05:00+00', '2026-09-19 10:00+00', 6, 0, v_auteur)
  returning id into v_e3;

  insert into events (title, sport, location, starts_at, ends_at, capacity, total_cost_cents, created_by)
  values ('[Démo] Padel sans score', 'Padel', 'Urban Padel Carquefou',
          '2026-09-22 17:00+00', null, 4, 4800, v_auteur)
  returning id into v_e4;

  -- Les 4 joueurs inscrits partout.
  foreach v_ev in array array[v_e1, v_e2, v_e3, v_e4] loop
    for v_i in 1..4 loop
      insert into registrations (event_id, user_id, guest_name)
      values (v_ev, v_users[v_i], v_guests[v_i]);
    end loop;
  end loop;

  -- 1. Match nul : 6-4 / 3-6 / 4-3* (le set interrompu ne compte pas).
  --    Saisi par le 1er joueur, corrigé par le 2e.
  insert into event_results (event_id, mode, sets, recorded_by, recorded_at)
  values (v_e1, 'raquette_sets',
          '[{"a":6,"b":4},{"a":3,"b":6},{"a":4,"b":3,"interrompu":true}]',
          v_auteur, '2026-09-10 19:00+00');
  -- Le trigger vide updated_* à l'insertion : la correction se simule
  -- par un UPDATE (sans utilisateur connecté, les valeurs sont gardées).
  update event_results
     set updated_by = v_second, updated_at = '2026-09-11 08:15+00'
   where event_id = v_e1;
  insert into event_result_players (event_id, user_id, guest_name, team)
  values (v_e1, v_users[1], v_guests[1], 'A'),
         (v_e1, v_users[2], v_guests[2], 'A'),
         (v_e1, v_users[3], v_guests[3], 'B'),
         (v_e1, v_users[4], v_guests[4], 'B');

  -- 2. Victoire de l'équipe A : 6-3 / 7-6 (tie-break 7-5).
  insert into event_results (event_id, mode, sets, recorded_by, recorded_at)
  values (v_e2, 'raquette_sets',
          '[{"a":6,"b":3},{"a":7,"b":6,"tb":[7,5]}]',
          v_auteur, '2026-09-15 19:30+00');
  insert into event_result_players (event_id, user_id, guest_name, team)
  values (v_e2, v_users[1], v_guests[1], 'A'),
         (v_e2, v_users[3], v_guests[3], 'A'),
         (v_e2, v_users[2], v_guests[2], 'B'),
         (v_e2, v_users[4], v_guests[4], 'B');

  -- 3. Pêche : deux ex æquo à 5 prises (1ers), puis 3 et 1.
  insert into event_results (event_id, mode, sets, recorded_by, recorded_at)
  values (v_e3, 'peche_prises', '[]', v_second, '2026-09-19 11:00+00');
  insert into event_result_players (event_id, user_id, guest_name, catches)
  values (v_e3, v_users[1], v_guests[1], 5),
         (v_e3, v_users[2], v_guests[2], 3),
         (v_e3, v_users[3], v_guests[3], 5),
         (v_e3, v_users[4], v_guests[4], 1);
end;
$$;
