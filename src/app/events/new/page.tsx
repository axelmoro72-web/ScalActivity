"use client";

import { use, useActionState, useState } from "react";
import { createEvent, type ActionState } from "../actions";
import { dayName } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { SportField } from "@/components/sport-field";
import { LocationField } from "@/components/location-field";
import { DateRangeFields } from "@/components/date-range-fields";
import { CostFields } from "@/components/cost-fields";
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

export default function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ passe?: string }>;
}) {
  // ?passe=1 (bouton de l'onglet « Terminés ») : activité déjà jouée,
  // créée pour en saisir le résultat.
  const passe = use(searchParams).passe === "1";
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

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-7">
      <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-card">
        <div className="bg-[var(--vert)] px-6 py-5">
          <h1 className="grotesk text-[22px] font-bold text-[var(--header-texte)]">
            {passe ? "Événement passé" : "Nouvel événement"}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--header-nav)]">
            {passe
              ? "Une activité déjà jouée, pour en garder le résultat. Vous y serez inscrit·e ; ajoutez ensuite les autres joueurs puis saisissez le score. Heures de Paris."
              : "Coût total à partager ou prix par personne, au choix. Heures de Paris."}
          </p>
        </div>
        <form action={formAction} className="flex flex-col gap-4 px-6 py-5">
          {passe && <input type="hidden" name="passe" value="1" />}
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
          <CostFields capacity={capacity} onCapacityChange={setCapacity} />
          <button
            type="submit"
            disabled={pending}
            className="grotesk h-11 w-full cursor-pointer rounded-full bg-[var(--vert)] text-[15px] font-bold text-[var(--header-texte)] transition-colors hover:bg-[var(--vert-hover)] disabled:opacity-60"
          >
            {pending
              ? "Création…"
              : passe
                ? "Ajouter l'événement passé"
                : "Créer l'événement"}
          </button>
        </form>
      </div>
    </main>
  );
}
