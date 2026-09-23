/**
 * Saisie du coût : total à partager ou prix par personne. Tests purs
 * (pas de base) — seule `total_cost_cents` est stockée, donc toute la
 * correction du prix affiché dépend de cette conversion à l'entrée.
 */
import { describe, expect, it } from "vitest";
import { createEventSchema } from "../src/lib/schemas";

/** Champs valides, hors coût : chaque test ne fait varier que le montant. */
function champs(extra: Record<string, unknown>) {
  return {
    title: "Padel du jeudi",
    sport: "Padel",
    description: "",
    location: "",
    startsAt: "2027-01-14T19:00",
    endsAt: "",
    capacity: "4",
    ...extra,
  };
}

describe("saisie du coût", () => {
  it("prend le montant tel quel en mode coût total", () => {
    const parsed = createEventSchema.safeParse(
      champs({ costMode: "total", cost: "48" }),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data!.totalCost).toBe(4800);
  });

  it("multiplie par le nombre de places en mode prix par personne", () => {
    const parsed = createEventSchema.safeParse(
      champs({ costMode: "per_person", cost: "12", capacity: "4" }),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data!.totalCost).toBe(4800);
  });

  it("conserve les centimes sans passer par un flottant", () => {
    // 12,35 € × 7 = 86,45 €. En flottant, 12.35 * 7 vaut 86.44999…
    const parsed = createEventSchema.safeParse(
      champs({ costMode: "per_person", cost: "12,35", capacity: "7" }),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data!.totalCost).toBe(8645);
  });

  it("retombe sur le coût total quand le mode est absent", () => {
    // Un formulaire encore en cache n'envoie pas costMode : le
    // comportement historique doit rester celui-là.
    const parsed = createEventSchema.safeParse(champs({ cost: "48" }));
    expect(parsed.success).toBe(true);
    expect(parsed.data!.totalCost).toBe(4800);
  });

  it("refuse un total qui déborderait l'entier de la colonne", () => {
    // total_cost_cents est un int4 : 999 999,99 € × 100 places le
    // dépasserait, et Postgres rejetterait la ligne.
    const parsed = createEventSchema.safeParse(
      champs({ costMode: "per_person", cost: "999999,99", capacity: "100" }),
    );
    expect(parsed.success).toBe(false);
    expect(parsed.error!.issues[0].message).toMatch(/trop élevé/);
  });

  it("accepte le même montant élevé en coût total", () => {
    const parsed = createEventSchema.safeParse(
      champs({ costMode: "total", cost: "999999,99", capacity: "100" }),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data!.totalCost).toBe(99999999);
  });

  it("refuse un montant mal écrit", () => {
    const parsed = createEventSchema.safeParse(
      champs({ costMode: "per_person", cost: "12 €" }),
    );
    expect(parsed.success).toBe(false);
  });
});
