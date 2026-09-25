"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteEvent, registerToEvent } from "./actions";
import {
  useCurrentProfile,
  useFinishedEvents,
  useManyParticipants,
  useResultats,
  useUpcomingEvents,
} from "@/lib/queries";
import {
  dayOfMonth,
  formatCents,
  jourMois,
  monthShort,
  timeRange,
} from "@/lib/format";
import { modeScore } from "@/lib/activites";
import { resumeResultat, type Resultat } from "@/lib/classement";
import { AvatarInitials } from "@/components/avatar-initials";
import { ScoreDialog } from "@/components/score-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type {
  EventParticipant,
  EventSummary,
  Profile,
} from "@/lib/database.types";

function DateBlock({ event, muted }: { event: EventSummary; muted?: boolean }) {
  return (
    <div
      className={`w-[58px] flex-none rounded-xl py-2 text-center ${
        muted ? "bg-[var(--jauge)]" : "bg-[var(--vert)]"
      }`}
    >
      <div
        className={`grotesk text-xl leading-none font-bold ${
          muted ? "text-[var(--texte-3)]" : "text-[var(--lime)]"
        }`}
      >
        {dayOfMonth(event.starts_at)}
      </div>
      <div
        className={`grotesk mt-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase ${
          muted ? "text-[var(--texte-3)]" : "text-[var(--header-nav)]"
        }`}
      >
        {monthShort(event.starts_at)}
      </div>
    </div>
  );
}

function Gauge({ filled, total }: { filled: number; total: number }) {
  const ratio = Math.min(filled / total, 1);
  return (
    <div className="mt-1 h-[5px] w-16 rounded-full bg-[var(--jauge)]">
      <div
        style={{ width: `${ratio * 100}%` }}
        className={`h-[5px] rounded-full ${
          ratio >= 1 ? "bg-[var(--vert)]" : "bg-[var(--lime)]"
        }`}
      />
    </div>
  );
}

function EventCard({
  event,
  participants,
  me,
}: {
  event: EventSummary;
  participants: EventParticipant[];
  me: Profile | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const cancelled = event.status === "cancelled";
  const full = event.spots_left === 0;
  const myUserId = me?.id;
  const mine = participants.find((p) => p.user_id === myUserId);
  // Une activité commencée reste dans « À venir » jusqu'à sa fin, mais on
  // ne peut plus s'y inscrire (la RLS le refuse).
  const [started] = useState(
    () => new Date(event.starts_at).getTime() <= Date.now(),
  );

  const registerMutation = useMutation({
    mutationFn: () => registerToEvent(event.id),
    onSuccess: (state) => {
      if (state?.ok) toast.success(state.message);
      else toast.error(state?.message ?? "Une erreur est survenue.");
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteEvent(event.id),
    onSuccess: (state) => {
      setDeleteOpen(false);
      if (state?.ok) toast.success(state.message);
      else toast.error(state?.message ?? "Une erreur est survenue.");
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  if (cancelled) {
    // Un événement annulé n'est supprimable que par son créateur ou un
    // admin — la RLS applique la même règle côté base.
    const canDelete = me?.id === event.created_by || me?.role === "admin";
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-[var(--input)] p-4 opacity-75 sm:gap-5 sm:px-5">
        <DateBlock event={event} muted />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grotesk font-semibold text-[var(--texte-3)] line-through">
              {event.title}
            </span>
            <span className="grotesk rounded-full bg-[var(--rouge-pale)] px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--rouge)]">
              Annulé
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-[var(--texte-3)]">
            {timeRange(event.starts_at, event.ends_at)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </div>
        {canDelete && (
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger
              render={
                <button
                  disabled={deleteMutation.isPending}
                  className="grotesk ml-auto h-9 flex-none cursor-pointer rounded-full bg-[var(--rouge-pale)] px-4 text-[13px] font-semibold text-[var(--rouge)] transition-colors hover:bg-[var(--rouge-pale-hover)] disabled:opacity-60"
                >
                  Supprimer
                </button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="grotesk">
                  Supprimer « {event.title} » ?
                </DialogTitle>
                <DialogDescription>
                  L&apos;événement et ses {event.registered_count} inscription(s)
                  seront effacés définitivement. Cette action est irréversible.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  Retour
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                >
                  Supprimer définitivement
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <Link
      href={`/events/${event.id}`}
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border)] bg-card p-4 transition-colors hover:border-[var(--vert)] sm:gap-5 sm:px-5"
    >
      <DateBlock event={event} />
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grotesk text-[17px] font-semibold">
            {event.title}
          </span>
          <span className="grotesk rounded-full bg-[var(--lime-pale)] px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--lime-texte)]">
            {event.sport}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] text-[var(--texte-2)]">
          {timeRange(event.starts_at, event.ends_at)}
          {event.location ? ` · ${event.location}` : ""} ·{" "}
          {formatCents(event.price_per_person_cents)} / pers.
        </p>
      </div>
      <div className="ml-auto flex flex-none items-center gap-4">
        {participants.length > 0 && (
          <div className="hidden sm:flex">
            {participants.slice(0, 2).map((p) => (
              <AvatarInitials
                key={p.id}
                name={p.display_name}
                highlight={p.user_id === myUserId}
                size={28}
                className="-ml-2 border-2 border-card first:ml-0"
              />
            ))}
            {participants.length > 2 && (
              <span className="grotesk -ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-[var(--vert)] text-[10px] font-semibold text-[var(--header-texte)]">
                +{participants.length - 2}
              </span>
            )}
          </div>
        )}
        <div className="text-right">
          <div className="grotesk text-sm font-bold">
            {Math.min(event.registered_count, event.capacity)} /{" "}
            {event.capacity}
          </div>
          <Gauge filled={event.registered_count} total={event.capacity} />
        </div>
        {mine ? (
          <span className="grotesk rounded-full bg-[var(--lime-pale)] px-4 py-1.5 text-[13px] font-bold text-[var(--lime-texte)]">
            {mine.is_confirmed ? "✓ Inscrit·e" : "En attente"}
          </span>
        ) : started ? (
          <span className="grotesk rounded-full bg-[var(--vert)] px-4 py-1.5 text-[13px] font-bold text-[var(--lime)]">
            En cours
          </span>
        ) : (
          <button
            disabled={registerMutation.isPending}
            onClick={(e) => {
              e.preventDefault();
              registerMutation.mutate();
            }}
            className={`grotesk h-[34px] cursor-pointer rounded-full px-4 text-[13px] font-bold transition-colors disabled:opacity-60 ${
              full
                ? "border-[1.5px] border-[var(--vert)] bg-transparent text-[var(--vert)] hover:bg-[var(--accent)]"
                : "bg-[var(--lime)] text-[var(--vert)] hover:bg-[var(--lime-hover)]"
            }`}
          >
            {full ? "Liste d'attente" : "S'inscrire"}
          </button>
        )}
      </div>
    </Link>
  );
}

/**
 * Carte d'un événement terminé : son résultat s'il est saisi, et le
 * bouton de saisie pour ses participants confirmés si l'activité est
 * classée. Pas de lien sur toute la carte, contrairement aux cartes à
 * venir : la modale de saisie s'ouvre depuis la carte, et un clic dans
 * la modale remonterait jusqu'au lien (les portails React propagent les
 * événements à leurs ancêtres).
 */
function FinishedCard({
  event,
  participants,
  resultat,
  me,
}: {
  event: EventSummary;
  participants: EventParticipant[];
  resultat: Resultat | undefined;
  me: Profile | null | undefined;
}) {
  const mode = modeScore(event.sport);
  const confirmes = participants.filter((p) => p.is_confirmed);
  const participe = confirmes.some((p) => p.user_id === me?.id);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border)] bg-card p-4 sm:gap-5 sm:px-5">
      <DateBlock event={event} muted={!mode} />
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/events/${event.id}`}
            className="grotesk text-[17px] font-semibold hover:underline"
          >
            {event.title}
          </Link>
          <span className="grotesk rounded-full bg-[var(--lime-pale)] px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--lime-texte)]">
            {event.sport}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] text-[var(--texte-2)]">
          {timeRange(event.starts_at, event.ends_at)}
          {event.location ? ` · ${event.location}` : ""} · {confirmes.length}{" "}
          participant{confirmes.length > 1 ? "s" : ""}
        </p>
        {resultat ? (
          <>
            <p className="grotesk mt-1.5 text-sm font-semibold">
              {resumeResultat(resultat)}
            </p>
            <p className="mt-0.5 text-xs text-[var(--texte-3)]">
              Saisi par {resultat.saisi_par ?? "?"} le {jourMois(resultat.saisi_le)}
              {resultat.modifie_le &&
                ` · modifié par ${resultat.modifie_par ?? "?"} le ${jourMois(resultat.modifie_le)}`}
            </p>
          </>
        ) : mode ? (
          <p className="mt-1.5 text-xs text-[var(--texte-3)]">
            Score pas encore saisi
          </p>
        ) : null}
      </div>
      <div className="ml-auto flex flex-none items-center gap-3">
        {mode && participe ? (
          <ScoreDialog
            eventId={event.id}
            titre={event.title}
            mode={mode}
            participants={confirmes}
            existant={resultat}
          />
        ) : (
          <span className="grotesk rounded-full border border-[var(--input)] px-3 py-1 text-[11px] font-semibold tracking-[0.04em] uppercase text-[var(--texte-3)]">
            {resultat ? "Résultat saisi" : "Terminé"}
          </span>
        )}
      </div>
    </div>
  );
}

type Onglet = "a_venir" | "termines";

function Onglets({ actif }: { actif: Onglet }) {
  const onglet = (cle: Onglet, libelle: string, href: string) => (
    <Link
      href={href}
      aria-current={actif === cle ? "page" : undefined}
      className={`grotesk h-9 rounded-full px-4 text-sm leading-9 font-semibold transition-colors ${
        actif === cle
          ? "bg-[var(--vert)] text-[var(--lime)]"
          : "text-[var(--texte-2)] hover:text-[var(--vert)]"
      }`}
    >
      {libelle}
    </Link>
  );
  return (
    <nav className="mt-4 flex w-fit gap-1 rounded-full border border-[var(--border)] bg-card p-1">
      {onglet("a_venir", "À venir", "/events")}
      {onglet("termines", "Terminés", "/events?onglet=termines")}
    </nav>
  );
}

function Upcoming({ me }: { me: Profile | null | undefined }) {
  const { data: events, isPending, error } = useUpcomingEvents();
  const eventIds = useMemo(() => (events ?? []).map((e) => e.id), [events]);
  const { data: allParticipants } = useManyParticipants(eventIds);

  return (
    <div className="mt-5 flex flex-col gap-3">
      {isPending && <p className="text-[var(--texte-2)]">Chargement…</p>}
      {error && (
        <p className="text-destructive">Impossible de charger les événements.</p>
      )}
      {events && events.length === 0 && (
        <p className="text-[var(--texte-2)]">
          Aucun événement à venir. Lancez le premier !
        </p>
      )}
      {events?.map((e) => (
        <EventCard
          key={e.id}
          event={e}
          participants={(allParticipants ?? []).filter(
            (p) => p.event_id === e.id,
          )}
          me={me}
        />
      ))}
    </div>
  );
}

function Finished({ me }: { me: Profile | null | undefined }) {
  const { data: events, isPending, error } = useFinishedEvents();
  const eventIds = useMemo(() => (events ?? []).map((e) => e.id), [events]);
  const { data: allParticipants } = useManyParticipants(eventIds);
  const { data: resultats } = useResultats(eventIds);

  return (
    <div className="mt-5 flex flex-col gap-3">
      {isPending && <p className="text-[var(--texte-2)]">Chargement…</p>}
      {error && (
        <p className="text-destructive">Impossible de charger les événements.</p>
      )}
      {events && events.length === 0 && (
        <p className="text-[var(--texte-2)]">Aucun événement terminé.</p>
      )}
      {events?.map((e) => (
        <FinishedCard
          key={e.id}
          event={e}
          participants={(allParticipants ?? []).filter(
            (p) => p.event_id === e.id,
          )}
          resultat={resultats?.find((r) => r.event_id === e.id)}
          me={me}
        />
      ))}
    </div>
  );
}

export default function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const { onglet } = use(searchParams);
  const actif: Onglet = onglet === "termines" ? "termines" : "a_venir";
  const { data: events } = useUpcomingEvents();
  const { data: me } = useCurrentProfile();

  const open = (events ?? []).filter((e) => e.status === "open");
  const withSpots = open.filter((e) => e.spots_left > 0).length;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="grotesk text-3xl leading-tight font-bold tracking-[-0.03em]">
            {actif === "termines" ? "Terminés" : "À venir"}
          </h1>
          {actif === "a_venir" && events && (
            <p className="mt-1 text-[13px] text-[var(--texte-2)]">
              {open.length} événement{open.length > 1 ? "s" : ""} · {withSpots}{" "}
              où il reste de la place
            </p>
          )}
          {actif === "termines" && (
            <p className="mt-1 text-[13px] text-[var(--texte-2)]">
              Résultats des activités passées
            </p>
          )}
        </div>
        <Link
          href="/events/new"
          className="grotesk h-10 rounded-full bg-[var(--vert)] px-5 text-sm leading-10 font-semibold text-[var(--header-texte)] transition-colors hover:bg-[var(--vert-hover)]"
        >
          + Créer un événement
        </Link>
      </div>

      <Onglets actif={actif} />
      {actif === "termines" ? <Finished me={me} /> : <Upcoming me={me} />}
    </main>
  );
}
