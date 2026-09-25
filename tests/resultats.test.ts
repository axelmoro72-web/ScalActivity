/**
 * Règles de score, points et classement. Tests purs (pas de base) : la
 * modale, l'action serveur et le classement partagent ces fonctions, le
 * trigger SQL en est la transcription.
 */
import { describe, expect, it } from "vitest";
import {
  ajouterSet,
  bilanSets,
  erreurEquipes,
  erreurResultat,
  erreurSet,
  erreursSets,
  formatSets,
  issueMatch,
  pointsPeche,
  rangsPeche,
  supprimerSet,
  type SetScore,
} from "../src/lib/resultats";
import {
  classementPeche,
  classementRaquette,
  debutPeriode,
  filtrerResultats,
  historique,
  resumeResultat,
  statsJoueur,
  type Resultat,
} from "../src/lib/classement";
import { activite, modeScore } from "../src/lib/activites";
import { phase } from "../src/lib/cycle";

const s = (a: number, b: number, extra: Partial<SetScore> = {}): SetScore => ({
  a,
  b,
  ...extra,
});

describe("validation d'un set", () => {
  it.each([
    [6, 0],
    [6, 4],
    [4, 6],
    [7, 5],
    [7, 6],
    [6, 7],
  ])("accepte %i-%i", (a, b) => {
    expect(erreurSet(s(a, b))).toBeNull();
  });

  it.each([
    [6, 5],
    [8, 6],
    [7, 4],
    [6, 6],
    [5, 3],
    [7, 7],
    [0, 0],
  ])("refuse %i-%i", (a, b) => {
    expect(erreurSet(s(a, b))).not.toBeNull();
  });

  it("refuse un score négatif ou décimal", () => {
    expect(erreurSet(s(-1, 6))).not.toBeNull();
    expect(erreurSet(s(6.5, 2))).not.toBeNull();
    expect(erreurSet(s(NaN, 2))).not.toBeNull();
  });

  it("n'impose aucune règle à un set interrompu", () => {
    expect(erreurSet(s(4, 3, { interrompu: true }))).toBeNull();
    expect(erreurSet(s(2, 2, { interrompu: true }))).toBeNull();
    expect(erreurSet(s(0, 0, { interrompu: true }))).toBeNull();
  });

  it("accepte un tie-break cohérent sur un 7-6, le refuse ailleurs", () => {
    expect(erreurSet(s(7, 6, { tb: [7, 5] }))).toBeNull();
    expect(erreurSet(s(6, 7, { tb: [8, 10] }))).toBeNull();
    // Vainqueur du tie-break ≠ vainqueur du set.
    expect(erreurSet(s(7, 6, { tb: [5, 7] }))).not.toBeNull();
    expect(erreurSet(s(7, 6, { tb: [6, 6] }))).not.toBeNull();
    expect(erreurSet(s(7, 5, { tb: [7, 5] }))).not.toBeNull();
    expect(erreurSet(s(3, 3, { interrompu: true, tb: [7, 5] }))).not.toBeNull();
  });

  it("n'accepte l'interruption que sur le dernier set", () => {
    const { parSet } = erreursSets([s(3, 2, { interrompu: true }), s(6, 4)]);
    expect(parSet[0]).toMatch(/dernier set/);
    expect(erreursSets([s(6, 4), s(3, 2, { interrompu: true })]).parSet).toEqual({});
  });

  it("exige au moins un set", () => {
    expect(erreursSets([]).globales).toHaveLength(1);
  });
});

describe("vainqueur d'un match", () => {
  it.each<[string, SetScore[], "A" | "B"]>([
    ["1 set", [s(6, 3)], "A"],
    ["2 sets", [s(3, 6), s(4, 6)], "B"],
    ["3 sets", [s(6, 4), s(3, 6), s(7, 5)], "A"],
    ["4 sets", [s(6, 4), s(3, 6), s(6, 7), s(2, 6)], "B"],
    ["5 sets", [s(6, 4), s(3, 6), s(6, 2), s(4, 6), s(7, 6)], "A"],
  ])("sur %s", (_, sets, gagnant) => {
    expect(issueMatch(sets)).toBe(gagnant);
  });

  it("déclare un match nul à égalité de sets", () => {
    expect(issueMatch([s(6, 4), s(3, 6)])).toBe("nul");
    expect(issueMatch([s(6, 4), s(3, 6), s(6, 1), s(0, 6)])).toBe("nul");
  });

  it("ne compte pas un set interrompu comme gagné, mais compte ses jeux", () => {
    const sets = [s(6, 4), s(3, 6), s(4, 3, { interrompu: true })];
    expect(issueMatch(sets)).toBe("nul");
    expect(bilanSets(sets)).toEqual({ setsA: 1, setsB: 1, jeuxA: 13, jeuxB: 13 });
  });

  it("formate le score avec tie-break et set interrompu", () => {
    expect(
      formatSets([s(6, 4), s(3, 6), s(7, 6, { tb: [7, 5] }), s(4, 3, { interrompu: true })]),
    ).toBe("6-4 / 3-6 / 7-6(5) / 4-3*");
  });
});

describe("équipes", () => {
  it("accepte 1v1 et 2v2", () => {
    expect(erreurEquipes(["a"], ["b"])).toBeNull();
    expect(erreurEquipes(["a", "b"], ["c", "d"])).toBeNull();
  });

  it("refuse les équipes déséquilibrées, vides ou trop grandes", () => {
    expect(erreurEquipes(["a", "b"], ["c"])).not.toBeNull();
    expect(erreurEquipes([], ["c"])).not.toBeNull();
    expect(erreurEquipes(["a", "b", "c"], ["d", "e", "f"])).not.toBeNull();
  });

  it("refuse un joueur dans les deux équipes", () => {
    expect(erreurEquipes(["a", "b"], ["b", "c"])).toMatch(/deux équipes/);
    expect(
      erreurResultat("raquette_sets", [s(6, 4)], [
        { cle: "a", team: "A", prises: null },
        { cle: "a", team: "B", prises: null },
      ]),
    ).not.toBeNull();
  });
});

describe("ajout et suppression de sets", () => {
  it("ajoute un set en fin de feuille et retire l'interruption du précédent", () => {
    const sets = ajouterSet([s(6, 4), s(2, 1, { interrompu: true })], s(0, 0));
    expect(sets).toHaveLength(3);
    expect(sets[1].interrompu).toBe(false);
  });

  it("supprime un set, sauf le premier", () => {
    const sets = [s(6, 4), s(3, 6), s(6, 2)];
    expect(supprimerSet(sets, 1)).toEqual([s(6, 4), s(6, 2)]);
    expect(supprimerSet(sets, 0)).toBe(sets);
    expect(supprimerSet(sets, 5)).toBe(sets);
  });
});

describe("pêche", () => {
  it("classe par prises décroissantes avec ex æquo au même rang", () => {
    const rangs = rangsPeche([
      { cle: "a", prises: 3 },
      { cle: "b", prises: 5 },
      { cle: "c", prises: 5 },
      { cle: "d", prises: 1 },
    ]);
    expect(rangs.map((r) => [r.cle, r.rang])).toEqual([
      ["b", 1],
      ["c", 1],
      ["a", 3],
      ["d", 4],
    ]);
  });

  it("donne les mêmes points aux ex æquo", () => {
    expect(pointsPeche(1)).toBe(3);
    expect(pointsPeche(2)).toBe(2);
    expect(pointsPeche(3)).toBe(1);
    expect(pointsPeche(4)).toBe(0);
  });

  it("refuse un nombre de poissons négatif ou décimal", () => {
    expect(erreurResultat("peche_prises", [], [{ cle: "a", team: null, prises: -1 }])).not.toBeNull();
    expect(erreurResultat("peche_prises", [], [{ cle: "a", team: null, prises: 1.5 }])).not.toBeNull();
    expect(erreurResultat("peche_prises", [], [{ cle: "a", team: null, prises: 0 }])).toBeNull();
  });
});

// ---------- classement ----------

function match(
  id: string,
  date: string,
  sets: SetScore[],
  a: string[],
  b: string[],
  sport = "Padel",
): Resultat {
  return {
    event_id: id,
    titre: `${sport} ${id}`,
    sport,
    lieu: null,
    starts_at: date,
    mode: "raquette_sets",
    sets,
    saisi_par: "Axel",
    saisi_le: date,
    modifie_par: null,
    modifie_le: null,
    joueurs: [
      ...a.map((n) => ({ cle: n, user_id: n, guest_name: null, nom: n, team: "A" as const, prises: null })),
      ...b.map((n) => ({ cle: n, user_id: n, guest_name: null, nom: n, team: "B" as const, prises: null })),
    ],
  };
}

function sortie(id: string, date: string, prises: Record<string, number>): Resultat {
  return {
    event_id: id,
    titre: `Pêche ${id}`,
    sport: "Pêche",
    lieu: "Lac de Grand-Lieu",
    starts_at: date,
    mode: "peche_prises",
    sets: [],
    saisi_par: "Axel",
    saisi_le: date,
    modifie_par: null,
    modifie_le: null,
    joueurs: Object.entries(prises).map(([n, p]) => ({
      cle: n,
      user_id: n,
      guest_name: null,
      nom: n,
      team: null,
      prises: p,
    })),
  };
}

describe("classement raquette", () => {
  const resultats = [
    match("1", "2026-09-10T17:00:00Z", [s(6, 4), s(6, 3)], ["Axel", "Paul"], ["Léa", "Tom"]),
    match("2", "2026-09-17T17:00:00Z", [s(6, 4), s(4, 6)], ["Axel", "Léa"], ["Paul", "Tom"]),
  ];

  it("attribue 3 / 1 / 0 point par joueur et trie par points", () => {
    const c = classementRaquette(resultats);
    const axel = c.find((l) => l.nom === "Axel")!;
    expect(axel).toMatchObject({ points: 4, joues: 2, v: 1, n: 1, d: 0, pct: 50, setsGagnes: 3, setsPerdus: 1 });
    expect(c[0].nom).toBe("Axel");
    // Axel et Paul : 4 pts, 50 %, 2 matchs → même rang.
    expect(c.find((l) => l.nom === "Paul")!.rang).toBe(1);
    expect(c.find((l) => l.nom === "Tom")!).toMatchObject({ points: 1, rang: 3 });
    expect(c.find((l) => l.nom === "Léa")!.rang).toBe(3);
  });

  it("recalcule tout quand un résultat est modifié", () => {
    const corrige = [
      resultats[0],
      // Le deuxième match avait été mal saisi : Axel et Léa l'ont perdu.
      { ...resultats[1], sets: [s(4, 6), s(4, 6)] },
    ];
    const c = classementRaquette(corrige);
    expect(c.find((l) => l.nom === "Axel")!).toMatchObject({ points: 3, v: 1, n: 0, d: 1 });
    expect(c.find((l) => l.nom === "Paul")!).toMatchObject({ points: 6, rang: 1 });
  });

  it("filtre par activité et par période", () => {
    const tennis = match("3", "2026-06-01T17:00:00Z", [s(6, 0)], ["Axel"], ["Tom"], "Tennis");
    const tous = [...resultats, tennis];
    const now = new Date("2026-09-25T10:00:00Z");
    expect(filtrerResultats(tous, { sport: "tennis", periode: "tout", now })).toEqual([tennis]);
    expect(filtrerResultats(tous, { sport: null, periode: "saison", now })).toHaveLength(2);
    expect(filtrerResultats(tous, { sport: null, periode: "mois", now })).toHaveLength(2);
  });
});

describe("classement pêche", () => {
  it("cumule points, prises, moyenne et podiums", () => {
    const c = classementPeche([
      sortie("p1", "2026-09-05T06:00:00Z", { Axel: 5, Léa: 5, Tom: 2, Paul: 0 }),
      sortie("p2", "2026-09-12T06:00:00Z", { Axel: 1, Léa: 4 }),
    ]);
    expect(c.map((l) => [l.nom, l.points, l.rang])).toEqual([
      ["Léa", 6, 1],
      ["Axel", 5, 2],
      ["Tom", 1, 3],
      ["Paul", 0, 4],
    ]);
    expect(c.find((l) => l.nom === "Axel")!).toMatchObject({ prises: 6, moyenne: 3, podiums: 2, sorties: 2 });
  });
});

describe("profil", () => {
  it("calcule la série en cours et l'historique du plus récent au plus ancien", () => {
    const resultats = [
      match("1", "2026-09-01T17:00:00Z", [s(0, 6)], ["Axel"], ["Tom"]),
      match("2", "2026-09-08T17:00:00Z", [s(6, 1)], ["Axel"], ["Tom"]),
      match("3", "2026-09-15T17:00:00Z", [s(6, 2)], ["Axel"], ["Tom"]),
    ];
    const parts = historique(resultats, "Axel");
    expect(parts.map((p) => p.resultat.event_id)).toEqual(["3", "2", "1"]);
    expect(parts[0].adversaires.map((j) => j.nom)).toEqual(["Tom"]);
    expect(statsJoueur(parts)).toMatchObject({ points: 6, v: 2, d: 1, serie: { issue: "V", longueur: 2 } });
  });

  it("résume un résultat pour les cartes", () => {
    expect(
      resumeResultat(match("1", "2026-09-01T17:00:00Z", [s(6, 4), s(3, 6), s(4, 3, { interrompu: true })], ["Axel"], ["Tom"])),
    ).toBe("6-4 / 3-6 / 4-3* · 🤝 Match nul");
    expect(resumeResultat(sortie("p", "2026-09-01T06:00:00Z", { Axel: 5, Tom: 2 }))).toBe(
      "🐟 Axel 5 prises · 1er",
    );
  });
});

describe("activités et cycle de vie", () => {
  it("retrouve le mode d'une activité sans tenir compte de la casse ni des accents", () => {
    expect(modeScore("PECHE")).toBe("peche_prises");
    expect(modeScore("padel")).toBe("raquette_sets");
    expect(modeScore("Afterwork")).toBeNull();
    expect(modeScore("Bowling")).toBeNull();
    expect(activite("ping-pong")?.nom).toBe("Ping-pong");
  });

  it("passe à terminé à la fin, ou 2 h après le début sans fin", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    expect(phase({ starts_at: "2026-09-25T13:00:00Z", ends_at: null }, now)).toBe("a_venir");
    expect(phase({ starts_at: "2026-09-25T10:30:00Z", ends_at: null }, now)).toBe("en_cours");
    expect(phase({ starts_at: "2026-09-25T09:59:00Z", ends_at: null }, now)).toBe("termine");
    expect(phase({ starts_at: "2026-09-25T08:00:00Z", ends_at: "2026-09-25T13:00:00Z" }, now)).toBe("en_cours");
    expect(phase({ starts_at: "2026-09-25T08:00:00Z", ends_at: "2026-09-25T09:00:00Z" }, now, true)).toBe("resultat_saisi");
  });

  it("fait commencer la saison au 1er septembre, heure de Paris", () => {
    expect(debutPeriode("saison", new Date("2026-09-25T10:00:00Z"))?.toISOString()).toBe(
      "2026-08-31T22:00:00.000Z",
    );
    expect(debutPeriode("saison", new Date("2027-03-10T10:00:00Z"))?.toISOString()).toBe(
      "2026-08-31T22:00:00.000Z",
    );
    expect(debutPeriode("mois", new Date("2027-03-10T10:00:00Z"))?.toISOString()).toBe(
      "2027-02-28T23:00:00.000Z",
    );
    expect(debutPeriode("tout", new Date())).toBeNull();
  });
});
