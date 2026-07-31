-- ============================================================
--  Suppression définitive d'un événement annulé
--
--  Le schéma initial n'avait aucune policy de delete : « un event
--  s'annule, ne se supprime pas ». On garde ce principe pour les
--  events ouverts, mais un event annulé reste affiché dans la liste
--  et l'encombre — son créateur (ou un admin) doit pouvoir le retirer.
--
--  La policy ne vise QUE les lignes déjà annulées : un event ouvert
--  reste indestructible, il faut passer par l'annulation (qui notifie
--  les inscrits sur Teams) avant de pouvoir supprimer.
--
--  Les registrations partent en cascade (FK on delete cascade) : les
--  actions de RI ne sont pas soumises à la RLS, aucune policy delete
--  n'est donc nécessaire sur registrations.
-- ============================================================

create policy events_delete_cancelled_own_or_admin on events
  for delete to authenticated
  using (
    status = 'cancelled'
    and (
      created_by = (select auth.uid())
      or exists (
        select 1 from profiles p
        where p.id = (select auth.uid()) and p.role = 'admin'
      )
    )
  );

grant delete on public.events to authenticated;
