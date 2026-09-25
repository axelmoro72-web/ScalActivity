/*
 * Cycle de vie d'un événement : à venir → en cours → terminé → résultat
 * saisi. Rien de tout cela n'est stocké : « terminé » se déduit de
 * l'heure, « résultat saisi » de l'existence d'une ligne event_results.
 * La fonction SQL can_record_result applique la même règle de fin.
 */

/** Sans heure de fin, une activité est réputée durer deux heures. */
export const DUREE_PAR_DEFAUT_MS = 2 * 60 * 60 * 1000;

export type Phase = "a_venir" | "en_cours" | "termine" | "resultat_saisi";

export function finEffective(e: { starts_at: string; ends_at: string | null }): Date {
  return e.ends_at
    ? new Date(e.ends_at)
    : new Date(new Date(e.starts_at).getTime() + DUREE_PAR_DEFAUT_MS);
}

export function phase(
  e: { starts_at: string; ends_at: string | null },
  now: Date,
  aUnResultat = false,
): Phase {
  if (new Date(e.starts_at) > now) return "a_venir";
  if (finEffective(e) > now) return "en_cours";
  return aUnResultat ? "resultat_saisi" : "termine";
}
