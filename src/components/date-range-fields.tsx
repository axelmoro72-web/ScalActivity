"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** "2026-09-25T12:30" + 60 min → "2026-09-25T13:30" (heure murale, sans fuseau). */
function addMinutes(local: string, minutes: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5] + minutes));
  return d.toISOString().slice(0, 16);
}

/**
 * Début et fin d'un événement. La fin ne peut pas précéder le début :
 * le champ fin refuse toute date antérieure (min), et si l'on avance le
 * début au-delà de la fin, la fin est repoussée d'une heure après le
 * nouveau début. Le serveur revérifie de toute façon (updateEventSchema).
 *
 * Les valeurs datetime-local ont un format fixe : la comparaison de
 * chaînes suffit.
 */
export function DateRangeFields({
  defaultStart = "",
  defaultEnd = "",
  onStartChange,
}: {
  defaultStart?: string;
  defaultEnd?: string;
  onStartChange?: (start: string) => void;
}) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const invalid = start !== "" && end !== "" && end <= start;

  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label>Début</Label>
        <Input
          name="startsAt"
          type="datetime-local"
          value={start}
          onChange={(e) => {
            const v = e.target.value;
            setStart(v);
            onStartChange?.(v);
            if (v && end && end <= v) setEnd(addMinutes(v, 60));
          }}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Fin (facultatif)</Label>
        <Input
          name="endsAt"
          type="datetime-local"
          value={end}
          min={start || undefined}
          onChange={(e) => setEnd(e.target.value)}
          aria-invalid={invalid || undefined}
        />
        {invalid && (
          <p className="text-xs text-destructive">
            La fin doit être après le début.
          </p>
        )}
      </div>
    </div>
  );
}
