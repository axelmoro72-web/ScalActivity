"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createEventSchema,
  eventIdSchema,
  messageBodySchema,
  messageIdSchema,
  updateEventSchema,
} from "@/lib/schemas";
import { formatCents, formatDate } from "@/lib/format";
import { md, sendTeamsNotification, siteUrl } from "@/lib/teams";

export type ActionState = { ok: boolean; message: string } | null;

/** Résumé d'une activité pour les cartes Teams (création, modification). */
function eventSummaryLines(e: {
  sport: string;
  startsAt: Date;
  location: string | null;
  capacity: number;
  totalCost: number;
}): string[] {
  return [
    `**${md(e.sport)}** · ${formatDate(e.startsAt.toISOString())}${e.location ? ` · ${md(e.location)}` : ""}`,
    `${e.capacity} place${e.capacity > 1 ? "s" : ""}${e.totalCost > 0 ? ` · coût total ${formatCents(e.totalCost)}` : ""}`,
  ];
}

/** Remplissage pour les cartes d'inscription : "👥 5/8 confirmés · 3 places restantes". */
function fillLine(s: {
  capacity: number;
  registered_count: number;
  spots_left: number;
}): string {
  const confirmed = Math.min(s.registered_count, s.capacity);
  const waiting = s.registered_count - confirmed;
  return [
    `👥 ${confirmed}/${s.capacity} confirmé${confirmed > 1 ? "s" : ""}`,
    waiting > 0 ? `${waiting} en liste d'attente` : null,
    s.spots_left > 0
      ? `${s.spots_left} place${s.spots_left > 1 ? "s" : ""} restante${s.spots_left > 1 ? "s" : ""}`
      : "complet",
  ]
    .filter(Boolean)
    .join(" · ");
}

function eventLink(eventId: string, title: string) {
  const base = siteUrl();
  return base ? { title, url: `${base}/events/${eventId}` } : undefined;
}

export async function createEvent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Vous devez être connecté." };

  const parsed = createEventSchema.safeParse({
    title: formData.get("title"),
    sport: formData.get("sport"),
    description: formData.get("description") ?? "",
    location: formData.get("location") ?? "",
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") ?? "",
    capacity: formData.get("capacity"),
    costMode: formData.get("costMode"),
    cost: formData.get("cost"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("events")
    .insert({
      title: parsed.data.title,
      sport: parsed.data.sport,
      description: parsed.data.description,
      location: parsed.data.location,
      starts_at: parsed.data.startsAt.toISOString(),
      ends_at: parsed.data.endsAt?.toISOString() ?? null,
      capacity: parsed.data.capacity,
      total_cost_cents: parsed.data.totalCost,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createEvent :", error);
    return { ok: false, message: "La création a échoué. Réessayez." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();
  await sendTeamsNotification(
    data.id,
    `Nouvelle activité : ${md(parsed.data.title)} 🏃`,
    [
      ...eventSummaryLines(parsed.data),
      ...(profile ? [`Proposée par ${md(profile.display_name)}.`] : []),
    ],
    eventLink(data.id, "Voir et s'inscrire"),
  );

  redirect(`/events/${data.id}`);
}

/**
 * Modification d'un événement par son créateur ou un admin (RPC
 * update_event). Augmenter la capacité promeut des personnes depuis la
 * liste d'attente : la fonction SQL les détecte dans la même transaction,
 * on les notifie ici — comme à la désinscription.
 */
export async function updateEvent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsedId = eventIdSchema.safeParse(formData.get("eventId"));
  if (!parsedId.success) {
    return { ok: false, message: "Événement invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Vous devez être connecté." };

  const parsed = updateEventSchema.safeParse({
    title: formData.get("title"),
    sport: formData.get("sport"),
    description: formData.get("description") ?? "",
    location: formData.get("location") ?? "",
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") ?? "",
    capacity: formData.get("capacity"),
    costMode: formData.get("costMode"),
    cost: formData.get("cost"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const { data: promoted, error } = await supabase.rpc("update_event", {
    p_event_id: parsedId.data,
    p_title: parsed.data.title,
    p_sport: parsed.data.sport,
    p_description: parsed.data.description,
    p_location: parsed.data.location,
    p_starts_at: parsed.data.startsAt.toISOString(),
    p_ends_at: parsed.data.endsAt?.toISOString() ?? null,
    p_capacity: parsed.data.capacity,
    p_total_cost_cents: parsed.data.totalCost,
  });

  if (error) {
    if (error.message.includes("capacity_below_confirmed")) {
      return {
        ok: false,
        message:
          "Le nombre de places ne peut pas être inférieur au nombre de personnes déjà confirmées.",
      };
    }
    if (error.message.includes("event_not_open")) {
      return { ok: false, message: "Cet événement est annulé." };
    }
    if (error.message.includes("not_allowed")) {
      return {
        ok: false,
        message: "Seul le créateur ou un admin peut modifier cet événement.",
      };
    }
    console.error("update_event :", error);
    return { ok: false, message: "La modification a échoué. Réessayez." };
  }

  if (promoted && promoted.length > 0) {
    for (const p of promoted) {
      await sendTeamsNotification(parsedId.data, "Une place s'est libérée 🎉", [
        `**${md(p.display_name)}** passe de la liste d'attente à confirmé pour « ${md(parsed.data.title)} » (${formatDate(parsed.data.startsAt.toISOString())}) : le nombre de places a été augmenté.`,
      ]);
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();
  await sendTeamsNotification(
    parsedId.data,
    `Activité modifiée : ${md(parsed.data.title)} ✏️`,
    [
      ...eventSummaryLines(parsed.data),
      ...(profile ? [`Modifiée par ${md(profile.display_name)}.`] : []),
    ],
    eventLink(parsedId.data, "Voir l'activité"),
  );

  redirect(`/events/${parsedId.data}`);
}

export async function registerToEvent(eventId: string): Promise<ActionState> {
  const parsedId = eventIdSchema.safeParse(eventId);
  if (!parsedId.success) {
    return { ok: false, message: "Événement invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Vous devez être connecté." };

  const { error } = await supabase
    .from("registrations")
    .insert({ event_id: parsedId.data, user_id: user.id });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Vous êtes déjà inscrit·e." };
    }
    // 42501 : RLS — événement annulé ou déjà passé.
    return {
      ok: false,
      message: "Inscription impossible (événement fermé ou passé).",
    };
  }

  const [{ data: summary }, { data: me }] = await Promise.all([
    supabase
      .from("event_summary")
      .select("title, capacity, registered_count, spots_left")
      .eq("id", parsedId.data)
      .single(),
    supabase
      .from("event_participants")
      .select("display_name, is_confirmed")
      .eq("event_id", parsedId.data)
      .eq("user_id", user.id)
      .single(),
  ]);
  if (summary && me) {
    await sendTeamsNotification(
      parsedId.data,
      me.is_confirmed
        ? `✅ ${md(me.display_name)} s'inscrit à « ${md(summary.title)} »`
        : `⏳ ${md(me.display_name)} rejoint la liste d'attente de « ${md(summary.title)} »`,
      [fillLine(summary)],
      eventLink(parsedId.data, "Voir l'activité"),
    );
  }

  return { ok: true, message: "Inscription enregistrée." };
}

/**
 * Désinscription via la RPC cancel_registration : la fonction applique la
 * désinscription et retourne, dans la même transaction, les personnes
 * promues depuis la liste d'attente. C'est ici — et seulement ici — que
 * partent les notifications de promotion.
 */
export async function unregisterFromEvent(
  eventId: string,
): Promise<ActionState> {
  const parsedId = eventIdSchema.safeParse(eventId);
  if (!parsedId.success) {
    return { ok: false, message: "Événement invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Vous devez être connecté." };

  const { data: promoted, error } = await supabase.rpc("cancel_registration", {
    p_event_id: parsedId.data,
  });

  if (error) {
    if (error.message.includes("not_registered")) {
      return { ok: false, message: "Vous n'êtes pas inscrit·e à cet événement." };
    }
    console.error("cancel_registration :", error);
    return { ok: false, message: "La désinscription a échoué. Réessayez." };
  }

  const [{ data: event }, { data: profile }] = await Promise.all([
    supabase
      .from("event_summary")
      .select("title, starts_at, capacity, registered_count, spots_left")
      .eq("id", parsedId.data)
      .single(),
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
  ]);

  if (event && profile) {
    await sendTeamsNotification(
      parsedId.data,
      `🚪 ${md(profile.display_name)} se désinscrit de « ${md(event.title)} »`,
      [fillLine(event)],
      eventLink(parsedId.data, "Voir l'activité"),
    );
  }

  if (promoted && promoted.length > 0) {
    for (const p of promoted) {
      await sendTeamsNotification(parsedId.data, "Une place s'est libérée 🎉", [
        event
          ? `**${md(p.display_name)}** passe de la liste d'attente à confirmé pour « ${md(event.title)} » (${formatDate(event.starts_at)}).`
          : `**${md(p.display_name)}** passe de la liste d'attente à confirmé.`,
      ]);
    }
  }

  return { ok: true, message: "Désinscription enregistrée." };
}

export async function cancelEvent(eventId: string): Promise<ActionState> {
  const parsedId = eventIdSchema.safeParse(eventId);
  if (!parsedId.success) {
    return { ok: false, message: "Événement invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Vous devez être connecté." };

  // RPC cancel_event : la table n'est plus modifiable directement, la
  // fonction vérifie créateur-ou-admin et la transition open → cancelled.
  const { data: rows, error } = await supabase.rpc("cancel_event", {
    p_event_id: parsedId.data,
  });
  const data = rows?.[0];

  if (error || !data) {
    if (error && !/not_allowed|event_not_open/.test(error.message)) {
      console.error("cancel_event :", error);
    }
    return {
      ok: false,
      message:
        "Annulation impossible : événement déjà annulé, ou vous n'en êtes pas le créateur.",
    };
  }

  const { data: participants } = await supabase
    .from("event_participants")
    .select("display_name")
    .eq("event_id", parsedId.data)
    .order("position");

  const names = (participants ?? []).map((p) => md(p.display_name));
  await sendTeamsNotification(parsedId.data, "Événement annulé ❌", [
    `« ${md(data.title)} » prévu le ${formatDate(data.starts_at)} est annulé.`,
    names.length > 0
      ? `Personnes concernées : ${names.join(", ")}.`
      : "Personne n'était inscrit.",
  ]);

  return { ok: true, message: "Événement annulé." };
}

/**
 * Suppression définitive, réservée aux événements déjà annulés : la RLS
 * n'autorise le delete que sur status = 'cancelled' et pour le créateur
 * ou un admin. Les inscriptions partent en cascade. Pas de notification
 * Teams : elle a déjà été envoyée à l'annulation, et l'événement n'existe
 * plus pour personne.
 */
export async function deleteEvent(eventId: string): Promise<ActionState> {
  const parsedId = eventIdSchema.safeParse(eventId);
  if (!parsedId.success) {
    return { ok: false, message: "Événement invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Vous devez être connecté." };

  // Aucune ligne renvoyée = la policy a filtré : event encore ouvert, ou
  // appelant ni créateur ni admin.
  const { data, error } = await supabase
    .from("events")
    .delete()
    .eq("id", parsedId.data)
    .select("id");

  if (error) {
    console.error("deleteEvent :", error);
    return { ok: false, message: "La suppression a échoué. Réessayez." };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      message:
        "Suppression impossible : seul un événement annulé peut être supprimé, par son créateur ou un admin.",
    };
  }

  return { ok: true, message: "Événement supprimé." };
}

/**
 * Publication d'un message dans le fil d'un événement. created_at n'est
 * pas transmis : la colonne n'est pas insérable (grant par colonne) et
 * c'est la base qui l'horodate.
 */
export async function postMessage(
  eventId: string,
  body: string,
): Promise<ActionState> {
  const parsedId = eventIdSchema.safeParse(eventId);
  if (!parsedId.success) {
    return { ok: false, message: "Événement invalide." };
  }
  const parsedBody = messageBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return { ok: false, message: parsedBody.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Vous devez être connecté." };

  const { error } = await supabase.from("event_messages").insert({
    event_id: parsedId.data,
    user_id: user.id,
    body: parsedBody.data,
  });

  if (error) {
    if (error.message.includes("rate_limited")) {
      return {
        ok: false,
        message: "Trop de messages d'affilée. Patientez une minute.",
      };
    }
    console.error("postMessage :", error);
    return { ok: false, message: "L'envoi a échoué. Réessayez." };
  }

  const [{ data: event }, { data: profile }] = await Promise.all([
    supabase.from("events").select("title").eq("id", parsedId.data).single(),
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
  ]);
  await sendTeamsNotification(
    parsedId.data,
    `💬 ${md(profile?.display_name ?? "Quelqu'un")} sur « ${md(event?.title ?? "une activité")} »`,
    [md(parsedBody.data)],
    eventLink(parsedId.data, "Répondre"),
  );

  return { ok: true, message: "Message envoyé." };
}

/** Suppression d'un message par son auteur ou un admin (règle appliquée par la RLS). */
export async function deleteMessage(messageId: number): Promise<ActionState> {
  const parsedId = messageIdSchema.safeParse(messageId);
  if (!parsedId.success) {
    return { ok: false, message: "Message invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Vous devez être connecté." };

  const { data, error } = await supabase
    .from("event_messages")
    .delete()
    .eq("id", parsedId.data)
    .select("id");

  if (error) {
    console.error("deleteMessage :", error);
    return { ok: false, message: "La suppression a échoué. Réessayez." };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "Seul l'auteur du message ou un admin peut le supprimer.",
    };
  }
  return { ok: true, message: "Message supprimé." };
}
