/**
 * Conversion heure murale parisienne ⇄ instant UTC. Tests purs (pas de
 * base) : c'est aux bascules d'heure d'été que ce code casse.
 */
import { describe, expect, it } from "vitest";
import {
  dateToParisInput,
  formatDate,
  parisInputToDate,
  timeRange,
} from "../src/lib/format";

describe("heures de Paris", () => {
  it("interprète la saisie en heure d'été (UTC+2)", () => {
    // 6 août 2026, 19:00 à Paris = 17:00 UTC.
    expect(parisInputToDate("2026-08-06T19:00")?.toISOString()).toBe(
      "2026-08-06T17:00:00.000Z",
    );
  });

  it("interprète la saisie en heure d'hiver (UTC+1)", () => {
    // 15 janvier 2026, 19:00 à Paris = 18:00 UTC.
    expect(parisInputToDate("2026-01-15T19:00")?.toISOString()).toBe(
      "2026-01-15T18:00:00.000Z",
    );
  });

  it("gère la bascule vers l'heure d'été", () => {
    // Dimanche 29 mars 2026 : 2h00 → 3h00. 03:30 est déjà en UTC+2.
    expect(parisInputToDate("2026-03-29T03:30")?.toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    // 01:30 précède la bascule : encore UTC+1.
    expect(parisInputToDate("2026-03-29T01:30")?.toISOString()).toBe(
      "2026-03-29T00:30:00.000Z",
    );
  });

  it("gère la bascule vers l'heure d'hiver", () => {
    // Dimanche 25 octobre 2026 : 3h00 → 2h00.
    expect(parisInputToDate("2026-10-25T04:30")?.toISOString()).toBe(
      "2026-10-25T03:30:00.000Z",
    );
  });

  it("refuse une saisie mal formée", () => {
    expect(parisInputToDate("")).toBeNull();
    expect(parisInputToDate("pas une date")).toBeNull();
  });

  it("fait l'aller-retour saisie → instant → saisie", () => {
    for (const wall of [
      "2026-08-06T19:00",
      "2026-01-15T08:15",
      "2026-12-31T23:59",
    ]) {
      const instant = parisInputToDate(wall)!;
      expect(dateToParisInput(instant.toISOString())).toBe(wall);
    }
  });

  it("affiche en heure de Paris quel que soit le fuseau du lecteur", () => {
    const iso = "2026-08-06T17:00:00.000Z"; // 19:00 à Paris
    expect(timeRange(iso, "2026-08-06T18:30:00.000Z")).toBe("19:00 – 20:30");
    expect(formatDate(iso)).toContain("19:00");
  });
});
