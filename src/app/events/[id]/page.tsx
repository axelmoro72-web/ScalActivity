"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cancelEvent,
  deleteEvent,
  deleteMessage,
  postMessage,
  registerToEvent,
  unregisterFromEvent,
  type ActionState,
} from "../actions";
import {
  useCurrentProfile,
  useEvent,
  useMessages,
  useParticipants,
  useProfile,
} from "@/lib/queries";
import {
  dayOfMonth,
  formatCents,
  formatDate,
  messageStamp,
  monthShort,
  registeredOn,
  timeRange,
} from "@/lib/format";
import { AvatarInitials } from "@/components/avatar-initials";
import { LienLieu } from "@/components/lien-lieu";
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
import { Textarea } from "@/components/ui/textarea";
import type { EventParticipant, Profile } from "@/lib/database.types";

function StatCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-card px-4 py-3.5">
      <div className="grotesk text-[10.5px] font-semibold tracking-[0.08em] uppercase text-[var(--texte-3)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function ParticipantRow({
  participant,
  isMe,
}: {
  participant: EventParticipant;
  isMe: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[10px] px-2.5 py-2 ${
        isMe ? "bg-[var(--lime-fond)]" : "hover:bg-background"
      }`}
    >
      <AvatarInitials name={participant.display_name} highlight={isMe} />
      <span className={`text-sm ${isMe ? "grotesk font-semibold" : ""}`}>
        {participant.display_name}
        {isMe && (
          <span className="grotesk ml-1 text-xs font-medium text-[var(--lime-texte)]">
            (vous)
          </span>
        )}
      </span>
      <span className="ml-auto text-xs text-[var(--texte-3)]">
        inscrit·e {registeredOn(participant.registered_at)}
      </span>
    </div>
  );
}

/**
 * Fil de discussion de l'événement. Ouvert à tout membre authentifié,
 * même non inscrit : on peut vouloir poser une question avant de
 * s'engager. Un message se supprime (par son auteur ou un admin) mais
 * ne se modifie pas.
 */
function Chat({
  eventId,
  me,
}: {
  eventId: string;
  me: Profile | null | undefined;
}) {
  const queryClient = useQueryClient();
  const { data: messages, isPending } = useMessages(eventId);
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = messages?.length ?? 0;

  // On suit le bas du fil à l'arrivée d'un message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  const refreshThread = () =>
    queryClient.invalidateQueries({
      queryKey: ["events", eventId, "messages"],
    });

  const postMutation = useMutation({
    mutationFn: (text: string) => postMessage(eventId, text),
    onSuccess: (state) => {
      if (state?.ok) setBody("");
      else toast.error(state?.message ?? "Une erreur est survenue.");
      refreshThread();
    },
  });
  const removeMutation = useMutation({
    mutationFn: (messageId: number) => deleteMessage(messageId),
    onSuccess: (state) => {
      if (!state?.ok) toast.error(state?.message ?? "Une erreur est survenue.");
      refreshThread();
    },
  });

  const send = () => {
    const text = body.trim();
    if (text.length === 0 || postMutation.isPending) return;
    postMutation.mutate(text);
  };

  return (
    <div className="mt-3.5 rounded-2xl border border-[var(--border)] bg-card px-5 py-4.5">
      <div className="mb-3 flex items-center justify-between">
        <span className="grotesk text-[15px] font-semibold">Discussion</span>
        {count > 0 && (
          <span className="grotesk rounded-full bg-[var(--lime-pale)] px-2.5 py-0.5 text-[13px] font-bold text-[var(--lime-texte)]">
            {count}
          </span>
        )}
      </div>

      {isPending ? (
        <p className="text-sm text-[var(--texte-2)]">Chargement…</p>
      ) : count === 0 ? (
        <p className="text-sm text-[var(--texte-2)]">
          Aucun message. Lancez la discussion !
        </p>
      ) : (
        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
          {messages?.map((m) => {
            const isMe = m.user_id === me?.id;
            const canRemove = isMe || me?.role === "admin";
            return (
              <div key={m.id} className="group flex gap-3">
                <AvatarInitials name={m.display_name} highlight={isMe} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`grotesk text-sm ${isMe ? "font-semibold" : "font-medium"}`}
                    >
                      {m.display_name}
                    </span>
                    <span className="text-xs text-[var(--texte-3)]">
                      {messageStamp(m.created_at)}
                    </span>
                    {canRemove && (
                      <button
                        disabled={removeMutation.isPending}
                        onClick={() => removeMutation.mutate(m.id)}
                        aria-label="Supprimer le message"
                        className="ml-auto cursor-pointer text-xs text-[var(--texte-3)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--rouge)] focus-visible:opacity-100 disabled:opacity-40"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">
                    {m.body}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-3.5 flex items-end gap-2.5 border-t border-[var(--border)] pt-3.5"
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Entrée envoie, Maj+Entrée passe à la ligne.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Écrire un message…"
          className="min-h-10 flex-1 rounded-xl"
        />
        <button
          type="submit"
          disabled={body.trim().length === 0 || postMutation.isPending}
          className="grotesk h-10 flex-none cursor-pointer rounded-full bg-[var(--vert)] px-5 text-[13px] font-bold text-[var(--header-texte)] transition-colors hover:bg-[var(--vert-hover)] disabled:opacity-50"
        >
          {postMutation.isPending ? "Envoi…" : "Envoyer"}
        </button>
      </form>
    </div>
  );
}

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: event, isPending, error } = useEvent(id);
  const { data: participants } = useParticipants(id);
  const { data: me } = useCurrentProfile();
  const { data: organizer } = useProfile(event?.created_by);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [now] = useState(() => Date.now());

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["events"] });
  const onSettled = (state: ActionState) => {
    if (state?.ok) toast.success(state.message);
    else toast.error(state?.message ?? "Une erreur est survenue.");
    refresh();
  };

  const registerMutation = useMutation({
    mutationFn: () => registerToEvent(id),
    onSuccess: onSettled,
  });
  const unregisterMutation = useMutation({
    mutationFn: () => unregisterFromEvent(id),
    onSuccess: onSettled,
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelEvent(id),
    onSuccess: (state) => {
      setCancelOpen(false);
      onSettled(state);
    },
  });
  // La page n'a plus rien à afficher une fois l'événement supprimé : on
  // repart sur la liste.
  const deleteMutation = useMutation({
    mutationFn: () => deleteEvent(id),
    onSuccess: (state) => {
      setDeleteOpen(false);
      onSettled(state);
      if (state?.ok) router.push("/events");
    },
  });

  if (isPending) {
    return (
      <main className="flex-1 p-6 text-[var(--texte-2)]">Chargement…</main>
    );
  }
  if (error || !event) {
    return (
      <main className="flex-1 p-6 text-destructive">
        Événement introuvable.
      </main>
    );
  }

  const cancelled = event.status === "cancelled";
  const past = new Date(event.starts_at).getTime() < now;
  const confirmed = (participants ?? []).filter((p) => p.is_confirmed);
  const waitlist = (participants ?? []).filter((p) => !p.is_confirmed);
  const mine = participants?.find((p) => p.user_id === me?.id);
  const owner = me?.id === event.created_by || me?.role === "admin";
  const canManage = !cancelled && owner;
  const busy =
    registerMutation.isPending ||
    unregisterMutation.isPending ||
    cancelMutation.isPending ||
    deleteMutation.isPending;
  const gaugeRatio = Math.min(event.registered_count / event.capacity, 1);

  return (
    <div className="flex flex-1 flex-col">
      {/* Héro vert dans la continuité du header */}
      <div className="bg-[var(--vert)] px-6 pt-1 pb-6">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/events"
            className="grotesk text-xs font-medium text-[#8fae94] transition-colors hover:text-[var(--header-texte)]"
          >
            ← Retour aux événements
          </Link>
          <div className="mt-2 flex flex-wrap items-start gap-4">
            <div className="w-16 flex-none rounded-[14px] border border-[color-mix(in_srgb,var(--lime)_30%,transparent)] bg-[color-mix(in_srgb,var(--lime)_14%,transparent)] py-2.5 text-center">
              <div className="grotesk text-2xl leading-none font-bold text-[var(--lime)]">
                {dayOfMonth(event.starts_at)}
              </div>
              <div className="grotesk mt-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-[var(--header-nav)]">
                {monthShort(event.starts_at)}
              </div>
            </div>
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1
                  className={`grotesk text-[26px] leading-tight font-bold text-[var(--header-texte)] ${cancelled ? "line-through opacity-70" : ""}`}
                >
                  {event.title}
                </h1>
                <span className="grotesk rounded-full bg-[var(--lime)] px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--vert)]">
                  {event.sport}
                </span>
                {cancelled && (
                  <span className="grotesk rounded-full bg-[var(--rouge-pale)] px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--rouge)]">
                    Annulé
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-[var(--header-nav)]">
                {formatDate(event.starts_at)}
                {event.ends_at
                  ? ` (${timeRange(event.starts_at, event.ends_at)})`
                  : ""}
                {event.location ? ` · ${event.location}` : ""}
              </p>
              {event.location && <LienLieu lieu={event.location} />}
            </div>
            {!cancelled && !past && mine && (
              <span className="grotesk flex h-[42px] flex-none items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--lime)_40%,transparent)] bg-[color-mix(in_srgb,var(--lime)_14%,transparent)] px-5 text-[13px] font-bold text-[var(--lime)]">
                {mine.is_confirmed
                  ? "✓ Vous êtes confirmé·e"
                  : `Liste d'attente — position ${mine.position - event.capacity}`}
              </span>
            )}
            {!cancelled && !past && !mine && (
              <button
                disabled={busy}
                onClick={() => registerMutation.mutate()}
                className="grotesk h-[42px] flex-none cursor-pointer rounded-full bg-[var(--lime)] px-6 text-sm font-bold text-[var(--vert)] transition-colors hover:bg-[var(--lime-hover)] disabled:opacity-60"
              >
                {event.spots_left > 0 ? "S'inscrire" : "Rejoindre la liste d'attente"}
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Places">
            <div className="grotesk mt-0.5 text-xl font-bold">
              {Math.min(event.registered_count, event.capacity)} /{" "}
              {event.capacity}
            </div>
            <div className="mt-2 h-[5px] w-full rounded-full bg-[var(--jauge)]">
              <div
                style={{ width: `${gaugeRatio * 100}%` }}
                className={`h-[5px] rounded-full ${gaugeRatio >= 1 ? "bg-[var(--vert)]" : "bg-[var(--lime)]"}`}
              />
            </div>
          </StatCard>
          <StatCard label="Prix / personne">
            <div className="grotesk mt-0.5 text-xl font-bold">
              {formatCents(event.price_per_person_cents)}
            </div>
            <div className="mt-2 text-xs text-[var(--texte-2)]">
              coût total {formatCents(event.total_cost_cents)}
            </div>
          </StatCard>
          <StatCard label="Organisé par">
            <div className="mt-1.5 flex items-center gap-2">
              <AvatarInitials name={organizer?.display_name ?? "?"} size={26} />
              <span className="grotesk text-sm font-semibold">
                {organizer?.display_name ?? "…"}
              </span>
            </div>
          </StatCard>
        </div>

        {event.description && (
          <div className="mt-3.5 rounded-2xl border border-[var(--border)] bg-card px-5 py-4.5">
            <div className="grotesk mb-2 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-[var(--texte-3)]">
              Description
            </div>
            <p className="text-sm break-words whitespace-pre-wrap text-[var(--texte-2)]">
              {event.description}
            </p>
          </div>
        )}

        <div className="mt-3.5 rounded-2xl border border-[var(--border)] bg-card px-5 py-4.5">
          <div className="mb-3 flex items-center justify-between">
            <span className="grotesk text-[15px] font-semibold">
              Participants confirmés
            </span>
            <span className="grotesk rounded-full bg-[var(--lime-pale)] px-2.5 py-0.5 text-[13px] font-bold text-[var(--lime-texte)]">
              {confirmed.length} / {event.capacity}
            </span>
          </div>
          {confirmed.length === 0 ? (
            <p className="text-sm text-[var(--texte-2)]">
              Personne pour l&apos;instant.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {confirmed.map((p) => (
                <ParticipantRow
                  key={p.id}
                  participant={p}
                  isMe={p.user_id === me?.id}
                />
              ))}
            </div>
          )}

          {waitlist.length > 0 && (
            <>
              <div className="my-3.5 h-px bg-[var(--border)]" />
              <div className="mb-2 flex items-center justify-between">
                <span className="grotesk text-[13px] font-semibold text-[var(--texte-2)]">
                  Liste d&apos;attente
                </span>
                <span className="grotesk text-xs font-semibold text-[var(--texte-3)]">
                  {waitlist.length}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {waitlist.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-[10px] px-2.5 py-2 opacity-80"
                  >
                    <AvatarInitials
                      name={p.display_name}
                      highlight={p.user_id === me?.id}
                    />
                    <span className="text-sm text-[var(--texte-2)]">
                      {p.display_name}
                      {p.user_id === me?.id && (
                        <span className="grotesk ml-1 text-xs font-medium text-[var(--lime-texte)]">
                          (vous)
                        </span>
                      )}
                    </span>
                    <span className="grotesk ml-auto rounded-full border border-[var(--input)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--texte-2)]">
                      position {p.position - event.capacity}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {!cancelled && (mine || canManage) && (
          <div className="mt-3.5 flex flex-wrap gap-2.5">
            {mine && !past && (
              <button
                disabled={busy}
                onClick={() => unregisterMutation.mutate()}
                className="grotesk h-9 cursor-pointer rounded-full border-[1.5px] border-[var(--vert)] px-4 text-[13px] font-semibold text-[var(--vert)] transition-colors hover:bg-[var(--accent)] disabled:opacity-60"
              >
                Se désinscrire
              </button>
            )}
            {canManage && (
              <Link
                href={`/events/${event.id}/edit`}
                className="grotesk flex h-9 items-center rounded-full border-[1.5px] border-[var(--vert)] px-4 text-[13px] font-semibold text-[var(--vert)] transition-colors hover:bg-[var(--accent)]"
              >
                Modifier
              </Link>
            )}
            {canManage && !past && (
              <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogTrigger
                  render={
                    <button
                      disabled={busy}
                      className="grotesk h-9 cursor-pointer rounded-full bg-[var(--rouge-pale)] px-4 text-[13px] font-semibold text-[var(--rouge)] transition-colors hover:bg-[var(--rouge-pale-hover)] disabled:opacity-60"
                    >
                      Annuler l&apos;événement
                    </button>
                  }
                />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="grotesk">
                      Annuler « {event.title} » ?
                    </DialogTitle>
                    <DialogDescription>
                      Les {event.registered_count} personne(s) inscrite(s)
                      seront notifiées sur Teams. Cette action est définitive.
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

        {cancelled && owner && (
          <div className="mt-3.5">
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger
                render={
                  <button
                    disabled={busy}
                    className="grotesk h-9 cursor-pointer rounded-full bg-[var(--rouge-pale)] px-4 text-[13px] font-semibold text-[var(--rouge)] transition-colors hover:bg-[var(--rouge-pale-hover)] disabled:opacity-60"
                  >
                    Supprimer définitivement
                  </button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="grotesk">
                    Supprimer « {event.title} » ?
                  </DialogTitle>
                  <DialogDescription>
                    L&apos;événement et ses {event.registered_count}{" "}
                    inscription(s) seront effacés définitivement. Cette action
                    est irréversible.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setDeleteOpen(false)}
                  >
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
          </div>
        )}

        <Chat eventId={id} me={me} />
      </main>
    </div>
  );
}
