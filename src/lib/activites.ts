/*
 * Liste des activités proposées et leur mode de score : le seul endroit à
 * modifier pour ajouter une activité, la rendre classée ou changer le
 * barème.
 *
 * La base ne stocke que le nom du sport (texte libre, « Autre… » reste
 * possible) : le mode se retrouve ici par nom, sans tenir compte de la
 * casse ni des accents. Un sport absent de la liste n'est pas classé.
 */

export type ModeScore = "raquette_sets" | "peche_prises";

export type Activite = {
  nom: string;
  /** Rubrique du menu déroulant de création. */
  groupe: "raquette" | "autre";
  /** Classée : saisie des résultats, points et classement. */
  ranked: boolean;
  mode: ModeScore | null;
};

export const ACTIVITES: Activite[] = [
  { nom: "Padel", groupe: "raquette", ranked: true, mode: "raquette_sets" },
  { nom: "Tennis", groupe: "raquette", ranked: true, mode: "raquette_sets" },
  { nom: "Badminton", groupe: "raquette", ranked: true, mode: "raquette_sets" },
  { nom: "Squash", groupe: "raquette", ranked: true, mode: "raquette_sets" },
  { nom: "Ping-pong", groupe: "raquette", ranked: true, mode: "raquette_sets" },
  { nom: "Pêche", groupe: "autre", ranked: true, mode: "peche_prises" },
  { nom: "Running", groupe: "autre", ranked: false, mode: null },
  { nom: "Afterwork", groupe: "autre", ranked: false, mode: null },
];

/**
 * Barème. Les points ne sont jamais stockés : ils se recalculent à partir
 * des résultats, et restent donc justes après une modification — ou un
 * changement de barème ici.
 */
export const POINTS = {
  raquette_sets: { victoire: 3, nul: 1, defaite: 0 },
  /** Index 0 = 1er. Au-delà de la liste : 0 point. */
  peche_prises: [3, 2, 1],
} as const;

/** "Pêche", "peche", " PÊCHE " → "peche". */
export function normaliserNom(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function activite(sport: string): Activite | null {
  const cle = normaliserNom(sport);
  return ACTIVITES.find((a) => normaliserNom(a.nom) === cle) ?? null;
}

/** Mode de score d'un sport, ou null s'il n'est pas classé. */
export function modeScore(sport: string): ModeScore | null {
  const a = activite(sport);
  return a?.ranked ? a.mode : null;
}
