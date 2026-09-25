/*
 * Règles de score, en fonctions pures : partagées par la modale de saisie
 * (retour en direct), l'action serveur (validation avant écriture) et les
 * tests. La base revérifie les mêmes règles dans un trigger — l'API reste
 * joignable sans passer par l'application.
 */
import { POINTS } from "./activites";

export type Equipe = "A" | "B";
/** Victoire, nul, défaite — du point de vue d'un joueur. */
export type Issue = "V" | "N" | "D";

export type SetScore = {
  a: number;
  b: number;
  /** Points du tie-break [A, B], facultatif, sur un set à 7-6 seulement. */
  tb?: [number, number] | null;
  /** Set arrêté en fin de créneau : aucune règle de score, jamais gagné. */
  interrompu?: boolean;
};

/** Au-delà, c'est une faute de frappe (et la colonne jsonb resterait lisible). */
export const JEUX_MAX = 99;

function entierPositif(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

/**
 * Erreur de saisie d'un set, ou null s'il est valide.
 *
 * Set terminé : 6 jeux avec au moins 2 d'écart, ou 7-5, ou 7-6. Un set
 * interrompu accepte n'importe quel score (4-3, 2-2…).
 */
export function erreurSet(set: SetScore): string | null {
  const { a, b } = set;
  if (!entierPositif(a) || !entierPositif(b)) {
    return "Scores attendus : nombres entiers positifs.";
  }
  if (a > JEUX_MAX || b > JEUX_MAX) return "Score trop élevé.";

  if (set.interrompu) {
    return set.tb ? "Pas de tie-break sur un set interrompu." : null;
  }

  const haut = Math.max(a, b);
  const bas = Math.min(a, b);
  const termine = (haut === 6 && bas <= 4) || (haut === 7 && (bas === 5 || bas === 6));
  if (!termine) {
    return "Set terminé : 6 jeux avec 2 d'écart, 7-5 ou 7-6.";
  }

  if (set.tb) {
    if (bas !== 6) return "Tie-break seulement sur un set à 7-6.";
    const [x, y] = set.tb;
    if (!entierPositif(x) || !entierPositif(y)) {
      return "Tie-break : nombres entiers positifs.";
    }
    if (x === y || x > y !== a > b) {
      return "Le tie-break doit être gagné par le vainqueur du set.";
    }
  }
  return null;
}

/** Équipe qui remporte le set ; null si interrompu (jamais gagné) ou invalide. */
export function vainqueurSet(set: SetScore): Equipe | null {
  if (set.interrompu || erreurSet(set)) return null;
  return set.a > set.b ? "A" : "B";
}

/**
 * Erreurs d'une feuille de match, par set (index → message) plus les
 * erreurs globales. Vide si tout est valide.
 */
export function erreursSets(sets: SetScore[]): {
  parSet: Record<number, string>;
  globales: string[];
} {
  const parSet: Record<number, string> = {};
  const globales: string[] = [];
  if (sets.length === 0) globales.push("Au moins un set est requis.");
  sets.forEach((s, i) => {
    const e = erreurSet(s);
    if (e) parSet[i] = e;
    else if (s.interrompu && i !== sets.length - 1) {
      parSet[i] = "Seul le dernier set peut être interrompu.";
    }
  });
  return { parSet, globales };
}

/** Sets gagnés et jeux marqués par chaque équipe (les jeux d'un set interrompu comptent). */
export function bilanSets(sets: SetScore[]) {
  let setsA = 0;
  let setsB = 0;
  let jeuxA = 0;
  let jeuxB = 0;
  for (const s of sets) {
    jeuxA += s.a;
    jeuxB += s.b;
    const v = vainqueurSet(s);
    if (v === "A") setsA++;
    if (v === "B") setsB++;
  }
  return { setsA, setsB, jeuxA, jeuxB };
}

/** L'équipe qui a gagné le plus de sets ; à égalité de sets, match nul. */
export function issueMatch(sets: SetScore[]): Equipe | "nul" {
  const { setsA, setsB } = bilanSets(sets);
  if (setsA === setsB) return "nul";
  return setsA > setsB ? "A" : "B";
}

export function issuePour(equipe: Equipe, issue: Equipe | "nul"): Issue {
  if (issue === "nul") return "N";
  return issue === equipe ? "V" : "D";
}

export function pointsRaquette(issue: Issue): number {
  const p = POINTS.raquette_sets;
  return issue === "V" ? p.victoire : issue === "N" ? p.nul : p.defaite;
}

/** "6-4 / 7-6(5) / 4-3*" : tie-break noté par les points du perdant, * = interrompu. */
export function formatSets(sets: SetScore[]): string {
  return sets
    .map((s) => {
      const tb = s.tb ? `(${Math.min(s.tb[0], s.tb[1])})` : "";
      return `${s.a}-${s.b}${tb}${s.interrompu ? "*" : ""}`;
    })
    .join(" / ");
}

/**
 * Équipes d'un match : 1v1 ou 2v2, personne dans les deux. Les clés sont
 * des identifiants de joueur (cf. cleJoueur).
 */
export function erreurEquipes(a: string[], b: string[]): string | null {
  if (a.length === 0 || b.length === 0) {
    return "Chaque équipe doit compter au moins un joueur.";
  }
  if (a.length !== b.length || a.length > 2) {
    return "Format attendu : 1 contre 1 ou 2 contre 2.";
  }
  if (new Set([...a, ...b]).size !== a.length + b.length) {
    return "Un joueur ne peut pas être dans les deux équipes.";
  }
  return null;
}

/**
 * Validation complète d'un résultat avant écriture : première erreur
 * rencontrée, ou null. `cle` identifie le joueur (cf. cleJoueur).
 */
export function erreurResultat(
  mode: "raquette_sets" | "peche_prises",
  sets: SetScore[],
  joueurs: { cle: string; team: Equipe | null; prises: number | null }[],
): string | null {
  if (new Set(joueurs.map((j) => j.cle)).size !== joueurs.length) {
    return "Un joueur ne peut apparaître qu'une fois.";
  }
  if (mode === "raquette_sets") {
    const { parSet, globales } = erreursSets(sets);
    if (globales.length) return globales[0];
    const i = Object.keys(parSet).map(Number)[0];
    if (i !== undefined) return `Set ${i + 1} : ${parSet[i]}`;
    if (joueurs.some((j) => j.team === null || j.prises !== null)) {
      return "Chaque joueur doit être dans une équipe.";
    }
    return erreurEquipes(
      joueurs.filter((j) => j.team === "A").map((j) => j.cle),
      joueurs.filter((j) => j.team === "B").map((j) => j.cle),
    );
  }
  if (sets.length > 0) return "Pas de sets pour la pêche.";
  if (joueurs.length === 0) return "Saisissez les prises d'au moins un participant.";
  if (joueurs.some((j) => j.team !== null || !entierPositif(j.prises))) {
    return "Nombre de poissons attendu : entier positif ou nul.";
  }
  return null;
}

// ---------- édition de la feuille de sets (modale) ----------

/**
 * Ajoute un set en fin de feuille. Seul le dernier set peut être
 * interrompu : l'ancien dernier perd donc ce statut.
 */
export function ajouterSet<T extends { interrompu?: boolean }>(
  sets: T[],
  nouveau: T,
): T[] {
  return [...sets.map((s) => ({ ...s, interrompu: false })), nouveau];
}

/** Supprime le set d'index i. Le premier set n'est pas supprimable. */
export function supprimerSet<T>(sets: T[], i: number): T[] {
  if (i <= 0 || i >= sets.length) return sets;
  return sets.filter((_, j) => j !== i);
}

// ---------- pêche ----------

/**
 * Classement par prises décroissantes, ex æquo au même rang (classement
 * « sportif » : 5, 5, 3 → 1er, 1er, 3e).
 */
export function rangsPeche<T extends { prises: number }>(
  entrees: T[],
): (T & { rang: number })[] {
  const tries = [...entrees].sort((x, y) => y.prises - x.prises);
  return tries.map((e) => ({
    ...e,
    rang: 1 + tries.filter((autre) => autre.prises > e.prises).length,
  }));
}

export function pointsPeche(rang: number): number {
  return POINTS.peche_prises[rang - 1] ?? 0;
}

/** "1er", "2e", "3e"… */
export function formatRang(rang: number): string {
  return rang === 1 ? "1er" : `${rang}e`;
}
