"use client";

import Link from "next/link";
import { useUpcomingEvents } from "@/lib/queries";
import { formatCents, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { EventSummary } from "@/lib/database.types";

function EventCard({ event }: { event: EventSummary }) {
  const cancelled = event.status === "cancelled";
  const full = event.spots_left === 0;

  return (
    <Link href={`/events/${event.id}`} className="block">
      <Card className="shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-[var(--violet-clair)] hover:shadow-md">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={
                  cancelled ? "font-medium line-through text-muted-foreground" : "font-medium"
                }
              >
                {event.title}
              </span>
              <Badge variant="secondary">{event.sport}</Badge>
              {cancelled && <Badge variant="destructive">Annulé</Badge>}
              {!cancelled && full && <Badge variant="outline">Complet</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(event.starts_at)}
              {event.location ? ` · ${event.location}` : ""}
            </p>
          </div>
          <div className="text-right text-sm">
            <p>
              {cancelled
                ? `${event.registered_count} inscrit·es`
                : full
                  ? `Complet · ${event.registered_count - event.capacity} en attente`
                  : `${event.spots_left} place${event.spots_left > 1 ? "s" : ""} restante${event.spots_left > 1 ? "s" : ""}`}
            </p>
            <p className="font-medium text-[var(--violet)] dark:text-[var(--violet-clair)]">
              {formatCents(event.price_per_person_cents)} / pers.
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function EventsPage() {
  const { data: events, isPending, error } = useUpcomingEvents();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="titre-page">Événements à venir</h1>
        <Button render={<Link href="/events/new">Créer un événement</Link>} />
      </div>

      {isPending && <p className="text-muted-foreground">Chargement…</p>}
      {error && (
        <p className="text-destructive">Impossible de charger les événements.</p>
      )}
      {events && events.length === 0 && (
        <p className="text-muted-foreground">
          Aucun événement à venir. Lancez le premier !
        </p>
      )}
      <div className="space-y-3">
        {events?.map((e) => <EventCard key={e.id} event={e} />)}
      </div>
    </main>
  );
}
