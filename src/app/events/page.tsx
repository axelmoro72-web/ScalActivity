"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { registerToEvent } from "./actions";
import {
  useCurrentProfile,
  useManyParticipants,
  useUpcomingEvents,
} from "@/lib/queries";
import { dayOfMonth, formatCents, monthShort, timeRange } from "@/lib/format";
import { AvatarInitials } from "@/components/avatar-initials";
import type { EventParticipant, EventSummary } from "@/lib/database.types";

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
  myUserId,
}: {
  event: EventSummary;
  participants: EventParticipant[];
  myUserId: string | undefined;
}) {
  const queryClient = useQueryClient();
  const cancelled = event.status === "cancelled";
  const full = event.spots_left === 0;
  const mine = participants.find((p) => p.user_id === myUserId);

  const registerMutation = useMutation({
    mutationFn: () => registerToEvent(event.id),
    onSuccess: (state) => {
      if (state?.ok) toast.success(state.message);
      else toast.error(state?.message ?? "Une erreur est survenue.");
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  if (cancelled) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-dashed border-[var(--input)] p-4 opacity-75 sm:gap-5 sm:px-5">
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

export default function EventsPage() {
  const { data: events, isPending, error } = useUpcomingEvents();
  const { data: me } = useCurrentProfile();
  const eventIds = useMemo(() => (events ?? []).map((e) => e.id), [events]);
  const { data: allParticipants } = useManyParticipants(eventIds);

  const open = (events ?? []).filter((e) => e.status === "open");
  const withSpots = open.filter((e) => e.spots_left > 0).length;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="grotesk text-3xl leading-tight font-bold tracking-[-0.03em]">
            À venir
          </h1>
          {events && (
            <p className="mt-1 text-[13px] text-[var(--texte-2)]">
              {open.length} événement{open.length > 1 ? "s" : ""} · {withSpots}{" "}
              où il reste de la place
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

      <div className="mt-5 flex flex-col gap-3">
        {isPending && (
          <p className="text-[var(--texte-2)]">Chargement…</p>
        )}
        {error && (
          <p className="text-destructive">
            Impossible de charger les événements.
          </p>
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
            myUserId={me?.id}
          />
        ))}
      </div>
    </main>
  );
}
