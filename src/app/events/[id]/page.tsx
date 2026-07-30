"use client";

import { use, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cancelEvent,
  registerToEvent,
  unregisterFromEvent,
  type ActionState,
} from "../actions";
import { useCurrentProfile, useEvent, useParticipants } from "@/lib/queries";
import { formatCents, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { EventParticipant } from "@/lib/database.types";

function ParticipantRow({
  participant,
  isMe,
}: {
  participant: EventParticipant;
  isMe: boolean;
}) {
  return (
    <li className="flex items-center gap-3 border-b py-2 last:border-b-0">
      <span className="w-6 text-right text-sm font-medium tabular-nums text-[var(--violet)] dark:text-[var(--violet-clair)]">
        {participant.position}.
      </span>
      <span className={isMe ? "font-medium" : ""}>
        {participant.display_name}
        {isMe && " (vous)"}
      </span>
    </li>
  );
}

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const { data: event, isPending, error } = useEvent(id);
  const { data: participants } = useParticipants(id);
  const { data: me } = useCurrentProfile();
  const [cancelOpen, setCancelOpen] = useState(false);
  // Figé au premier rendu : suffit pour masquer les actions d'un event passé.
  const [now] = useState(() => Date.now());

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["events"] });

  const onSettled = (state: ActionState) => {
    if (state?.ok) toast.success(state.message);
    else toast.error(state?.message ?? "Une erreur est survenue.");
    refresh();
  };

  const registerMutation = useMutation({
    mutationFn: () => registerToEvent(id),
    onSuccess: onSettled,
    onError: () => toast.error("Une erreur est survenue."),
  });
  const unregisterMutation = useMutation({
    mutationFn: () => unregisterFromEvent(id),
    onSuccess: onSettled,
    onError: () => toast.error("Une erreur est survenue."),
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelEvent(id),
    onSuccess: (state) => {
      if (state?.ok) toast.success(state.message);
      else toast.error(state?.message ?? "Une erreur est survenue.");
      setCancelOpen(false);
      refresh();
    },
  });

  if (isPending) {
    return <main className="p-4 text-muted-foreground">Chargement…</main>;
  }
  if (error || !event) {
    return <main className="p-4 text-destructive">Événement introuvable.</main>;
  }

  const cancelled = event.status === "cancelled";
  const past = new Date(event.starts_at).getTime() < now;
  const confirmed = (participants ?? []).filter((p) => p.is_confirmed);
  const waitlist = (participants ?? []).filter((p) => !p.is_confirmed);
  const mine = participants?.find((p) => p.user_id === me?.id);
  const canCancel =
    !cancelled && (me?.id === event.created_by || me?.role === "admin");
  const busy =
    registerMutation.isPending ||
    unregisterMutation.isPending ||
    cancelMutation.isPending;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle
              className={
                cancelled
                  ? "titre-page line-through opacity-60"
                  : "titre-page"
              }
            >
              {event.title}
            </CardTitle>
            <Badge variant="secondary">{event.sport}</Badge>
            {cancelled && <Badge variant="destructive">Annulé</Badge>}
            {!cancelled && event.spots_left === 0 && (
              <Badge variant="outline">Complet</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1 text-sm">
            <p>
              <span className="text-muted-foreground">Quand :</span>{" "}
              {formatDate(event.starts_at)}
              {event.ends_at ? ` → ${formatDate(event.ends_at)}` : ""}
            </p>
            {event.location && (
              <p>
                <span className="text-muted-foreground">Où :</span>{" "}
                {event.location}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Places :</span>{" "}
              {event.registered_count}/{event.capacity} prises
              {event.spots_left > 0 && ` · ${event.spots_left} restantes`}
            </p>
            <p>
              <span className="text-muted-foreground">Prix :</span>{" "}
              <span className="font-medium text-[var(--violet)] dark:text-[var(--violet-clair)]">
                {formatCents(event.price_per_person_cents)} / personne
              </span>{" "}
              (coût total {formatCents(event.total_cost_cents)})
            </p>
          </div>

          {mine && !cancelled && (
            <p className="text-sm">
              {mine.is_confirmed ? (
                <Badge>Vous êtes confirmé·e</Badge>
              ) : (
                <Badge variant="outline">
                  Liste d&apos;attente — position{" "}
                  {mine.position - event.capacity}
                </Badge>
              )}
            </p>
          )}

          {!cancelled && !past && (
            <div className="flex gap-2">
              {mine ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => unregisterMutation.mutate()}
                >
                  Se désinscrire
                </Button>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() => registerMutation.mutate()}
                >
                  {event.spots_left > 0
                    ? "S'inscrire"
                    : "Rejoindre la liste d'attente"}
                </Button>
              )}
              {canCancel && (
                <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                  <DialogTrigger
                    render={
                      <Button variant="destructive" disabled={busy}>
                        Annuler l&apos;événement
                      </Button>
                    }
                  />
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Annuler « {event.title} » ?</DialogTitle>
                      <DialogDescription>
                        Les {event.registered_count} personne(s) inscrite(s)
                        seront notifiées sur Teams. Cette action est
                        définitive.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setCancelOpen(false)}
                      >
                        Retour
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate()}
                      >
                        Confirmer l&apos;annulation
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[var(--violet-fonce)] dark:text-[var(--violet-clair)]">
            Participants confirmés ({confirmed.length}/{event.capacity})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {confirmed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Personne pour l&apos;instant.
            </p>
          ) : (
            <ul>
              {confirmed.map((p) => (
                <ParticipantRow
                  key={p.id}
                  participant={p}
                  isMe={p.user_id === me?.id}
                />
              ))}
            </ul>
          )}

          {waitlist.length > 0 && (
            <>
              <Separator className="my-3" />
              <p className="mb-1 text-sm font-medium">
                Liste d&apos;attente ({waitlist.length})
              </p>
              <ul>
                {waitlist.map((p) => (
                  <ParticipantRow
                    key={p.id}
                    participant={p}
                    isMe={p.user_id === me?.id}
                  />
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
