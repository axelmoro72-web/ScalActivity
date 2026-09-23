"use client";

import Link from "next/link";
import { use, useActionState, useState } from "react";
import { updateEvent, type ActionState } from "../../actions";
import { useCurrentProfile, useEvent, useParticipants } from "@/lib/queries";
import { dateToParisInput } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { SportField } from "@/components/sport-field";
import { LocationField } from "@/components/location-field";
import { DateRangeFields } from "@/components/date-range-fields";
import { CostFields } from "@/components/cost-fields";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Centimes → saisie en euros ("1250" → "12,50"). */
function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)},${(cents % 100).toString().padStart(2, "0")}`;
}

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

export default function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: event, isPending } = useEvent(id);
  const { data: me } = useCurrentProfile();
  const { data: participants } = useParticipants(id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateEvent,
    null,
  );
  const [sport, setSport] = useState("");
  const [capacity, setCapacity] = useState<string | null>(null);

  if (isPending) {
    return (
      <main className="flex-1 p-6 text-[var(--texte-2)]">Chargement…</main>
    );
  }
  if (!event) {
    return (
      <main className="flex-1 p-6 text-destructive">
        Événement introuvable.
      </main>
    );
  }

  const allowed = me?.id === event.created_by || me?.role === "admin";
  if (!allowed) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-7">
        <Alert variant="destructive">
          <AlertDescription>
            Seul le créateur de l&apos;événement ou un admin peut le modifier.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  // Plancher de capacité : on ne descend pas sous les personnes déjà
  // confirmées (règle appliquée aussi côté base).
  const confirmedCount = (participants ?? []).filter(
    (p) => p.is_confirmed,
  ).length;

  const capacityValue = capacity ?? String(event.capacity);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-7">
      <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-card">
        <div className="bg-[var(--vert)] px-6 py-5">
          <h1 className="grotesk text-[22px] font-bold text-[var(--header-texte)]">
            Modifier l&apos;événement
          </h1>
          <p className="mt-1 text-[13px] text-[var(--header-nav)]">
            Ajouter des places promeut automatiquement la liste d&apos;attente.
            Heures de Paris.
          </p>
        </div>
        <form action={formAction} className="flex flex-col gap-4 px-6 py-5">
          <input type="hidden" name="eventId" value={event.id} />
          {state && !state.ok && (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}
          <Field label="Titre">
            <Input name="title" defaultValue={event.title} required />
          </Field>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Activité">
              <SportField defaultValue={event.sport} onSportChange={setSport} />
            </Field>
            <Field label="Lieu">
              <LocationField defaultValue={event.location ?? ""} sport={sport} />
            </Field>
          </div>
          <Field label="Description (facultatif)">
            <Textarea
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={event.description ?? ""}
              placeholder="Matériel à prévoir, niveau, point de rendez-vous…"
            />
          </Field>
          <DateRangeFields
            defaultStart={dateToParisInput(event.starts_at)}
            defaultEnd={dateToParisInput(event.ends_at)}
          />
          <CostFields
            capacity={capacityValue}
            onCapacityChange={setCapacity}
            capacityMin={Math.max(confirmedCount, 1)}
            defaultAmount={centsToInput(event.total_cost_cents)}
            note={
              confirmedCount > 0 ? (
                <p className="-mt-1 text-xs text-[var(--texte-2)]">
                  {confirmedCount} personne{confirmedCount > 1 ? "s" : ""} déjà
                  confirmée{confirmedCount > 1 ? "s" : ""} : le nombre de places
                  ne peut pas descendre en dessous.
                </p>
              ) : null
            }
          />
          <div className="flex flex-wrap gap-2.5">
            <button
              type="submit"
              disabled={pending}
              className="grotesk h-11 flex-1 cursor-pointer rounded-full bg-[var(--vert)] text-[15px] font-bold text-[var(--header-texte)] transition-colors hover:bg-[var(--vert-hover)] disabled:opacity-60"
            >
              {pending ? "Enregistrement…" : "Enregistrer les modifications"}
            </button>
            <Link
              href={`/events/${event.id}`}
              className="grotesk flex h-11 cursor-pointer items-center rounded-full border-[1.5px] border-[var(--vert)] px-5 text-sm font-semibold text-[var(--vert)] transition-colors hover:bg-[var(--accent)]"
            >
              Annuler
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
