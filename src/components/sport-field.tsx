"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const SPORTS = [
  "Padel",
  "Tennis",
  "Badminton",
  "Squash",
  "Ping-pong",
  "Foot à 5",
  "Football",
  "Basket",
  "Volley",
  "Running",
  "Vélo",
  "Randonnée",
  "Escalade",
  "Natation",
  "Yoga",
  "Fitness",
  "Pétanque",
  "Bowling",
  "Golf",
  "Ski",
];

const OTHER = "__autre__";

/**
 * Choix du sport : liste déroulante, plus « Autre… » qui ouvre une saisie
 * libre. Le formulaire reçoit toujours un champ `sport` en texte, comme
 * avant : la base ne restreint pas les valeurs, un sport hors liste
 * (ancien événement, « Autre ») reste possible et se préremplit en saisie
 * libre.
 */
export function SportField({ defaultValue = "" }: { defaultValue?: string }) {
  const inList = SPORTS.includes(defaultValue);
  const [choice, setChoice] = useState<string | null>(
    inList ? defaultValue : defaultValue ? OTHER : null,
  );
  const [custom, setCustom] = useState(inList ? "" : defaultValue);

  return (
    <div className="flex flex-col gap-2">
      <Select value={choice} onValueChange={(v) => setChoice(v as string)}>
        <SelectTrigger className="h-10 w-full rounded-[12px] border-[1.5px] bg-[var(--fond-input)] px-3.5 text-base md:text-sm">
          <SelectValue>
            {(v: string | null) =>
              v === OTHER ? "Autre…" : (v ?? "Choisir un sport")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SPORTS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={OTHER}>Autre…</SelectItem>
        </SelectContent>
      </Select>
      {choice === OTHER ? (
        <Input
          name="sport"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Quel sport ?"
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
