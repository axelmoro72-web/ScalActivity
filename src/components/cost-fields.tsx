"use client";

import { useState } from "react";
import { euroAmountToCents, type CostMode } from "@/lib/schemas";
import { formatCents } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Saisie des places et du coût, ce dernier au choix en **coût total à
 * partager** ou en **prix par personne** : selon l'activité, c'est l'un ou
 * l'autre qui est connu d'avance — une location de terrain a un prix fixe,
 * un cours se facture par participant.
 *
 * Les deux formes sont converties à la saisie : seule `total_cost_cents`
 * est stockée, le prix par personne restant dérivé par la vue SQL. Le mode
 * est donc une commodité de saisie, pas une donnée de l'événement — il
 * n'est pas mémorisé, et le formulaire de modification rouvre sur le coût
 * total. Conséquence à connaître : ajouter des places baisse le prix par
 * personne sans toucher au total, quel que soit le mode utilisé à la
 * création.
 *
 * L'encadré affiche toujours le montant *complémentaire* de celui saisi,
 * avec le même arrondi que la vue (`ceil`), pour qu'aucun des deux
 * chiffres ne soit une surprise après création.
 */
export function CostFields({
  capacity,
  onCapacityChange,
  capacityMin = 1,
  defaultAmount = "0",
  note,
}: {
  capacity: string;
  onCapacityChange: (value: string) => void;
  capacityMin?: number;
  defaultAmount?: string;
  note?: React.ReactNode;
}) {
  const [mode, setMode] = useState<CostMode>("total");
  const [amount, setAmount] = useState(defaultAmount);

  const montant = euroAmountToCents.safeParse(amount);
  const places = parseInt(capacity, 10);
  const placesValides = places >= 1 && places <= 100;

  const apercu =
    montant.success && placesValides
      ? mode === "total"
        ? formatCents(Math.ceil(montant.data / places))
        : formatCents(montant.data * places)
      : null;

  return (
    <>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="capacity">Places</Label>
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={capacityMin}
            max={100}
            value={capacity}
            onChange={(e) => onCapacityChange(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <Label htmlFor="cost">
              {mode === "total" ? "Coût total (€)" : "Prix / pers. (€)"}
            </Label>
            {/* Libellé abrégé pour que la bascule tienne sur la même ligne
                dans la colonne de droite — sinon elle passe dessous et
                décale le champ par rapport à « Places ». ml-auto la garde
                à droite quand l'écran est malgré tout trop étroit,
                justify-between seul la renverrait à gauche. */}
            <div
              role="group"
              aria-label="Forme du montant saisi"
              className="ml-auto flex rounded-full border border-[var(--input)] p-0.5"
            >
              <ModeButton
                actif={mode === "total"}
                onClick={() => setMode("total")}
              >
                Total
              </ModeButton>
              <ModeButton
                actif={mode === "per_person"}
                onClick={() => setMode("per_person")}
              >
                / pers.
              </ModeButton>
            </div>
          </div>
          <Input
            id="cost"
            name="cost"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <input type="hidden" name="costMode" value={mode} />
        </div>
      </div>

      {note}

      <div className="flex items-center justify-between rounded-xl border border-[var(--lime-bord)] bg-[var(--lime-fond)] px-4 py-3">
        <span className="grotesk text-xs font-semibold tracking-[0.06em] uppercase text-[var(--lime-texte)]">
          {mode === "total" ? "Prix par personne" : "Coût total"}
        </span>
        <span className="grotesk text-xl font-bold">{apercu ?? "—"}</span>
      </div>
    </>
  );
}

function ModeButton({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`grotesk cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        actif
          ? "bg-[var(--vert)] text-[var(--header-texte)]"
          : "text-[var(--texte-2)] hover:text-[var(--vert)]"
      }`}
    >
      {children}
    </button>
  );
}
