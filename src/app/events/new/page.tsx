"use client";

import { useActionState, useState } from "react";
import { createEvent, type ActionState } from "../actions";
import { euroAmountToCents } from "@/lib/schemas";
import { dayName, formatCents } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { SportField } from "@/components/sport-field";
import { LocationField } from "@/components/location-field";
import { DateRangeFields } from "@/components/date-range-fields";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export default function NewEventPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createEvent,
    null,
  );
  const [sport, setSport] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [capacity, setCapacity] = useState("4");

  // Titre proposé : "Padel du vendredi". La saisie manuelle reprend la main.
  const jour = dayName(startsAt);
  const suggestedTitle = sport && jour ? `${sport} du ${jour}` : "";
  const [totalCost, setTotalCost] = useState("0");

  // Aperçu du prix par personne, même arrondi que la vue SQL (ceil).
  const parsedCost = euroAmountToCents.safeParse(totalCost);
  const parsedCapacity = parseInt(capacity, 10);
  const preview =
    parsedCost.success && parsedCapacity >= 1 && parsedCapacity <= 100
      ? formatCents(Math.ceil(parsedCost.data / parsedCapacity))
      : null;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-7">
      <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-card">
        <div className="bg-[var(--vert)] px-6 py-5">
          <h1 className="grotesk text-[22px] font-bold text-[var(--header-texte)]">
            Nouvel événement
          </h1>
          <p className="mt-1 text-[13px] text-[var(--header-nav)]">
            Le coût total est réparti entre les places. Heures de Paris.
          </p>
        </div>
        <form action={formAction} className="flex flex-col gap-4 px-6 py-5">
          {state && !state.ok && (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}
          <Field label="Titre">
            <Input
              name="title"
              value={titleTouched ? title : suggestedTitle}
              onChange={(e) => {
                setTitleTouched(true);
                setTitle(e.target.value);
              }}
              placeholder="Padel du jeudi"
              maxLength={200}
              required
            />
          </Field>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Activité">
              <SportField onSportChange={setSport} />
            </Field>
            <Field label="Lieu">
              <LocationField sport={sport} />
            </Field>
          </div>
          <Field label="Description (facultatif)">
            <Textarea
              name="description"
              rows={3}
              maxLength={2000}
              placeholder="Matériel à prévoir, niveau, point de rendez-vous…"
            />
          </Field>
          <DateRangeFields onStartChange={setStartsAt} />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Places">
              <Input
                name="capacity"
                type="number"
                min={1}
                max={100}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                required
              />
            </Field>
            <Field label="Coût total (€)">
              <Input
                name="totalCost"
                inputMode="decimal"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                required
              />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-[var(--lime-bord)] bg-[var(--lime-fond)] px-4 py-3">
            <span className="grotesk text-xs font-semibold tracking-[0.06em] uppercase text-[var(--lime-texte)]">
              Prix par personne
            </span>
            <span className="grotesk text-xl font-bold">
              {preview ?? "—"}
            </span>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="grotesk h-11 w-full cursor-pointer rounded-full bg-[var(--vert)] text-[15px] font-bold text-[var(--header-texte)] transition-colors hover:bg-[var(--vert-hover)] disabled:opacity-60"
          >
            {pending ? "Création…" : "Créer l'événement"}
          </button>
        </form>
      </div>
    </main>
  );
}
