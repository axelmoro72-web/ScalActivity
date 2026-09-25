/**
 * Événement passé, ajouté depuis l'onglet « Terminés » pour en saisir le
 * résultat. Tests purs du schéma : il doit être terminé dès sa création,
 * sans quoi le score ne pourrait pas être saisi.
 */
import { describe, expect, it } from "vitest";
import { createEventSchema, createPastEventSchema } from "../src/lib/schemas";
import { dateToParisInput } from "../src/lib/format";
import { phase } from "../src/lib/cycle";

const ilYa = (heures: number) =>
  dateToParisInput(new Date(Date.now() - heures * 3600 * 1000).toISOString());

function champs(extra: Record<string, unknown>) {
  return {
    title: "Padel de lundi",
    sport: "Padel",
    description: "",
    location: "",
    endsAt: "",
    capacity: "4",
    costMode: "total",
    cost: "0",
    ...extra,
  };
}

describe("événement passé", () => {
  it("accepte une date passée, que la création normale refuse", () => {
    const valeurs = champs({ startsAt: ilYa(48) });
    expect(createPastEventSchema.safeParse(valeurs).success).toBe(true);
    expect(createEventSchema.safeParse(valeurs).success).toBe(false);
  });

  it("refuse un début dans le futur", () => {
    expect(createPastEventSchema.safeParse(champs({ startsAt: ilYa(-2) })).success).toBe(false);
  });

  it("refuse une fin dans le futur", () => {
    const parsed = createPastEventSchema.safeParse(
      champs({ startsAt: ilYa(1), endsAt: ilYa(-1) }),
    );
    expect(parsed.success).toBe(false);
  });

  it("sans fin, se termine au plus tard maintenant : il est terminé dès sa création", () => {
    // Commencé il y a 30 min : début + 2 h serait dans le futur.
    const recent = createPastEventSchema.parse(champs({ startsAt: ilYa(0.5) }));
    expect(recent.endsAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(
      phase(
        { starts_at: recent.startsAt.toISOString(), ends_at: recent.endsAt.toISOString() },
        new Date(),
      ),
    ).toBe("termine");

    // Commencé il y a 2 jours : fin à début + 2 h.
    const ancien = createPastEventSchema.parse(champs({ startsAt: ilYa(48) }));
    expect(ancien.endsAt.getTime() - ancien.startsAt.getTime()).toBe(2 * 3600 * 1000);
  });
});
