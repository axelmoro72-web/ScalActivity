/*
 * Classement et historique, recalculés à chaque affichage à partir des
 * résultats bruts : aucun compteur n'est stocké, un résultat modifié se
 * répercute donc partout. Fonctions pures, testées sans base.
 */
import { normaliserNom, type ModeScore } from "./activites";
import { dateToParisInput, parisInputToDate } from "./format";
import {
  bilanSets,
  formatRang,
  formatSets,
  issueMatch,
  issuePour,
  pointsPeche,
  pointsRaquette,
  rangsPeche,
  type Equipe,
  type Issue,
  type SetScore,
} from "./resultats";
import type { EventResultDetail } from "./database.types";

/**
 * Identifiant stable d'un joueur : l'id du profil pour un membre, le nom
 * normalisé pour un invité (qui n'a pas de compte). Deux invités saisis
 * sous le même « Prénom Nom » sont donc la même personne.
 */
export function cleJoueur(p: {
  user_id: string | null;
  guest_name: string | null;
}): string {
  return p.user_id ?? `invite:${normaliserNom(p.guest_name ?? "")}`;
}

/** Lien vers le profil d'un joueur, membre ou invité. */
export function lienJoueur(p: {
  user_id: string | null;
  guest_name?: string | null;
  nom?: string;
}): string {
  if (p.user_id) return `/joueurs/${p.user_id}`;
  const nom = p.guest_name ?? p.nom ?? "";
  return `/joueurs/invite?nom=${encodeURIComponent(nom)}`;
}

export type JoueurResultat = {
  cle: string;
  user_id: string | null;
  guest_name: string | null;
  nom: string;
  team: Equipe | null;
  prises: number | null;
};

export type Resultat = {
  event_id: string;
  titre: string;
  sport: string;
  lieu: string | null;
  starts_at: string;
  mode: ModeScore;
  sets: SetScore[];
  saisi_par: string | null;
  saisi_le: string;
  modifie_par: string | null;
  modifie_le: string | null;
  joueurs: JoueurResultat[];
};

/** Lignes de la vue event_result_details (une par joueur) → un résultat par événement. */
export function grouperResultats(rows: EventResultDetail[]): Resultat[] {
  const parEvent = new Map<string, Resultat>();
  for (const r of rows) {
    let res = parEvent.get(r.event_id);
    if (!res) {
      res = {
        event_id: r.event_id,
        titre: r.title,
        sport: r.sport,
        lieu: r.location,
        starts_at: r.starts_at,
        mode: r.mode,
        sets: r.sets ?? [],
        saisi_par: r.recorded_by_name,
        saisi_le: r.recorded_at,
        modifie_par: r.updated_by_name,
        modifie_le: r.updated_at,
        joueurs: [],
      };
      parEvent.set(r.event_id, res);
    }
    if (r.player_id !== null) {
      res.joueurs.push({
        cle: cleJoueur(r),
        user_id: r.user_id,
        guest_name: r.guest_name,
        nom: r.display_name ?? r.guest_name ?? "?",
        team: r.team,
        prises: r.catches,
      });
    }
  }
  return [...parEvent.values()].sort((x, y) =>
    y.starts_at.localeCompare(x.starts_at),
  );
}

/** Ce qu'une personne a vécu dans un événement : la ligne d'historique. */
export type Participation = {
  cle: string;
  user_id: string | null;
  nom: string;
  resultat: Resultat;
  points: number;
  // Raquette
  issue: Issue | null;
  setsGagnes: number;
  setsPerdus: number;
  coequipiers: string[];
  adversaires: string[];
  // Pêche
  prises: number | null;
  rang: number | null;
  nbPecheurs: number;
};

export function participations(r: Resultat): Participation[] {
  if (r.mode === "raquette_sets") {
    const issue = issueMatch(r.sets);
    const bilan = bilanSets(r.sets);
    return r.joueurs
      .filter((j) => j.team !== null)
      .map((j) => {
        const equipe = j.team as Equipe;
        const monIssue = issuePour(equipe, issue);
        return {
          cle: j.cle,
          user_id: j.user_id,
          nom: j.nom,
          resultat: r,
          points: pointsRaquette(monIssue),
          issue: monIssue,
          setsGagnes: equipe === "A" ? bilan.setsA : bilan.setsB,
          setsPerdus: equipe === "A" ? bilan.setsB : bilan.setsA,
          coequipiers: r.joueurs
            .filter((o) => o.team === equipe && o.cle !== j.cle)
            .map((o) => o.nom),
          adversaires: r.joueurs
            .filter((o) => o.team !== null && o.team !== equipe)
            .map((o) => o.nom),
          prises: null,
          rang: null,
          nbPecheurs: 0,
        };
      });
  }

  const pecheurs = r.joueurs.filter((j) => j.prises !== null);
  return rangsPeche(
    pecheurs.map((j) => ({ ...j, prises: j.prises as number })),
  ).map((j) => ({
    cle: j.cle,
    user_id: j.user_id,
    nom: j.nom,
    resultat: r,
    points: pointsPeche(j.rang),
    issue: null,
    setsGagnes: 0,
    setsPerdus: 0,
    coequipiers: [],
    adversaires: [],
    prises: j.prises,
    rang: j.rang,
    nbPecheurs: pecheurs.length,
  }));
}

// ---------- filtres ----------

export type Periode = "saison" | "mois" | "tout";

/** La saison commence en septembre, avec l'année scolaire. */
export const MOIS_DEBUT_SAISON = 9;

/** Début de la période en heure de Paris ; null pour « tout ». */
export function debutPeriode(periode: Periode, now: Date): Date | null {
  if (periode === "tout") return null;
  const [y, m] = dateToParisInput(now.toISOString()).split("-").map(Number);
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (periode === "mois") return parisInputToDate(`${y}-${pad(m)}-01T00:00`);
  const annee = m >= MOIS_DEBUT_SAISON ? y : y - 1;
  return parisInputToDate(`${annee}-${pad(MOIS_DEBUT_SAISON)}-01T00:00`);
}

export function filtrerResultats(
  resultats: Resultat[],
  filtre: { sport: string | null; periode: Periode; now: Date },
): Resultat[] {
  const debut = debutPeriode(filtre.periode, filtre.now);
  const sport = filtre.sport ? normaliserNom(filtre.sport) : null;
  return resultats.filter(
    (r) =>
      (!sport || normaliserNom(r.sport) === sport) &&
      (!debut || new Date(r.starts_at) >= debut),
  );
}

// ---------- classements ----------

export type LigneRaquette = {
  cle: string;
  user_id: string | null;
  nom: string;
  rang: number;
  points: number;
  joues: number;
  v: number;
  n: number;
  d: number;
  /** Pourcentage de victoires, 0 à 100. */
  pct: number;
  setsGagnes: number;
  setsPerdus: number;
};

export type LignePeche = {
  cle: string;
  user_id: string | null;
  nom: string;
  rang: number;
  points: number;
  sorties: number;
  prises: number;
  moyenne: number;
  podiums: number;
};

function parJoueur(parts: Participation[]): Map<string, Participation[]> {
  const m = new Map<string, Participation[]>();
  for (const p of parts) m.set(p.cle, [...(m.get(p.cle) ?? []), p]);
  return m;
}

/**
 * Tri par clés décroissantes et rang partagé quand toutes les clés sont
 * égales (1, 1, 3).
 */
function classer<T extends { nom: string }>(
  lignes: T[],
  cles: (l: T) => number[],
): (T & { rang: number })[] {
  const cmp = (x: T, y: T) => {
    const [a, b] = [cles(x), cles(y)];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
    return 0;
  };
  const tries = [...lignes].sort(
    (x, y) => cmp(x, y) || x.nom.localeCompare(y.nom, "fr"),
  );
  return tries.map((l) => ({
    ...l,
    rang: 1 + tries.filter((o) => cmp(o, l) < 0).length,
  }));
}

export function classementRaquette(resultats: Resultat[]): LigneRaquette[] {
  const parts = resultats
    .filter((r) => r.mode === "raquette_sets")
    .flatMap(participations);
  const lignes = [...parJoueur(parts).values()].map((ps) => {
    const v = ps.filter((p) => p.issue === "V").length;
    const n = ps.filter((p) => p.issue === "N").length;
    const d = ps.filter((p) => p.issue === "D").length;
    return {
      cle: ps[0].cle,
      user_id: ps[0].user_id,
      nom: ps[0].nom,
      points: ps.reduce((s, p) => s + p.points, 0),
      joues: ps.length,
      v,
      n,
      d,
      pct: Math.round((v / ps.length) * 100),
      setsGagnes: ps.reduce((s, p) => s + p.setsGagnes, 0),
      setsPerdus: ps.reduce((s, p) => s + p.setsPerdus, 0),
    };
  });
  return classer(lignes, (l) => [l.points, l.pct, l.joues]);
}

export function classementPeche(resultats: Resultat[]): LignePeche[] {
  const parts = resultats
    .filter((r) => r.mode === "peche_prises")
    .flatMap(participations);
  const lignes = [...parJoueur(parts).values()].map((ps) => {
    const prises = ps.reduce((s, p) => s + (p.prises ?? 0), 0);
    return {
      cle: ps[0].cle,
      user_id: ps[0].user_id,
      nom: ps[0].nom,
      points: ps.reduce((s, p) => s + p.points, 0),
      sorties: ps.length,
      prises,
      moyenne: Math.round((prises / ps.length) * 10) / 10,
      podiums: ps.filter((p) => p.rang !== null && p.rang <= 3).length,
    };
  });
  return classer(lignes, (l) => [l.points, l.prises, l.sorties]);
}

// ---------- profil ----------

export type StatsJoueur = {
  points: number;
  joues: number;
  v: number;
  n: number;
  d: number;
  prises: number;
  sorties: number;
  /** Meilleur rang obtenu à la pêche. */
  meilleurRang: number | null;
  /** Série en cours sur les matchs de raquette : « 3 V », « 1 D »… */
  serie: { issue: Issue; longueur: number } | null;
};

/** Stats d'une personne à partir de ses participations. */
export function statsJoueur(parts: Participation[]): StatsJoueur {
  const matchs = parts
    .filter((p) => p.issue !== null)
    .sort((x, y) => y.resultat.starts_at.localeCompare(x.resultat.starts_at));
  const sorties = parts.filter((p) => p.rang !== null);

  let serie: StatsJoueur["serie"] = null;
  if (matchs.length > 0) {
    const issue = matchs[0].issue as Issue;
    let longueur = 0;
    while (longueur < matchs.length && matchs[longueur].issue === issue) {
      longueur++;
    }
    serie = { issue, longueur };
  }

  return {
    points: parts.reduce((s, p) => s + p.points, 0),
    joues: matchs.length,
    v: matchs.filter((p) => p.issue === "V").length,
    n: matchs.filter((p) => p.issue === "N").length,
    d: matchs.filter((p) => p.issue === "D").length,
    prises: sorties.reduce((s, p) => s + (p.prises ?? 0), 0),
    sorties: sorties.length,
    meilleurRang: sorties.length
      ? Math.min(...sorties.map((p) => p.rang as number))
      : null,
    serie,
  };
}

/** Toutes les participations d'une personne, de la plus récente à la plus ancienne. */
export function historique(resultats: Resultat[], cle: string): Participation[] {
  return resultats
    .flatMap(participations)
    .filter((p) => p.cle === cle)
    .sort((x, y) => y.resultat.starts_at.localeCompare(x.resultat.starts_at));
}

// ---------- affichage ----------

function listeNoms(noms: string[]): string {
  return noms.length <= 1
    ? (noms[0] ?? "")
    : `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
}

/**
 * Résumé d'un résultat sur une ligne, pour les cartes :
 * "6-4 / 3-6 / 4-3* · 🤝 Match nul", "6-3 / 6-4 · 🏆 Axel et Paul gagnent",
 * "🐟 Axel 5 prises · 1er".
 */
export function resumeResultat(r: Resultat): string {
  if (r.mode === "raquette_sets") {
    const issue = issueMatch(r.sets);
    if (issue === "nul") return `${formatSets(r.sets)} · 🤝 Match nul`;
    const gagnants = r.joueurs.filter((j) => j.team === issue).map((j) => j.nom);
    const verbe = gagnants.length > 1 ? "gagnent" : "gagne";
    return `${formatSets(r.sets)} · 🏆 ${listeNoms(gagnants) || `Équipe ${issue}`} ${verbe}`;
  }
  const premiers = participations(r).filter((p) => p.rang === 1);
  if (premiers.length === 0) return "🐟 Aucune prise saisie";
  const prises = premiers[0].prises ?? 0;
  return `🐟 ${listeNoms(premiers.map((p) => p.nom))} ${prises} prise${prises > 1 ? "s" : ""} · ${formatRang(1)}${premiers.length > 1 ? " ex æquo" : ""}`;
}
