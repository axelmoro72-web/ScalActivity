"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACTIVITES } from "@/lib/activites";

// La liste vit dans src/lib/activites.ts, avec le mode de score de chacune.
export const RACKET_SPORTS = ACTIVITES.filter((a) => a.groupe === "raquette").map(
  (a) => a.nom,
);
export const OTHER_ACTIVITIES = ACTIVITES.filter((a) => a.groupe === "autre").map(
  (a) => a.nom,
);
const SPORTS = [...RACKET_SPORTS, ...OTHER_ACTIVITIES];

const OTHER = "__autre__";

/**
 * Choix du sport : liste déroulante, plus « Autre… » qui ouvre une saisie
 * libre. Le formulaire reçoit toujours un champ `sport` en texte, comme
 * avant : la base ne restreint pas les valeurs, un sport hors liste
 * (ancien événement, « Autre ») reste possible et se préremplit en saisie
 * libre.
 */
export function SportField({
  defaultValue = "",
  onSportChange,
}: {
  defaultValue?: string;
  onSportChange?: (sport: string) => void;
}) {
  const inList = SPORTS.includes(defaultValue);
  const [choice, setChoice] = useState<string | null>(
    inList ? defaultValue : defaultValue ? OTHER : null,
  );
  const [custom, setCustom] = useState(inList ? "" : defaultValue);

  function announce(sport: string) {
    onSportChange?.(sport);
  }

  return (
    <div className="flex flex-col gap-2">
      <Select value={choice} onValueChange={(v) => {
          setChoice(v as string);
          announce(v === OTHER ? custom : (v as string));
        }}>
        <SelectTrigger className="h-10 w-full rounded-[12px] border-[1.5px] bg-[var(--fond-input)] px-3.5 text-base md:text-sm">
          <SelectValue>
            {(v: string | null) =>
              v === OTHER ? "Autre…" : (v ?? "Choisir une activité")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            <SelectLabel>Sports de raquette</SelectLabel>
            {RACKET_SPORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Autres activités</SelectLabel>
            {OTHER_ACTIVITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectItem value={OTHER}>Autre… (à écrire)</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {choice === OTHER ? (
        <Input
          name="sport"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            announce(e.target.value);
          }}
          placeholder="Foot, bowling, escalade…"
          maxLength={100}
          required
          autoFocus={!defaultValue}
        />
      ) : (
        <input type="hidden" name="sport" value={choice ?? ""} />
      )}
    </div>
  );
}
