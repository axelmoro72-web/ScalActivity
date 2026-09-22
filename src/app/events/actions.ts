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
import { sendTeamsNotification, siteUrl } from "@/lib/teams";

export type ActionState = { ok: boolean; message: string } | null;

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
    totalCost: formData.get("totalCost"),
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
  const e = parsed.data;
  const base = siteUrl();
  await sendTeamsNotification(
    `Nouvelle activité : ${e.title} 🏃`,
    [
      `**${e.sport}** · ${formatDate(e.startsAt.toISOString())}${e.location ? ` · ${e.location}` : ""}`,
      `${e.capacity} place${e.capacity > 1 ? "s" : ""}${e.totalCost > 0 ? ` · coût total ${formatCents(e.totalCost)}` : ""}`,
      ...(profile ? [`Proposée par ${profile.display_name}.`] : []),
    ],
    base
      ? { title: "Voir et s'inscrire", url: `${base}/events/${data.id}` }
      : undefined,
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
    totalCost: formData.get("totalCost"),
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
      await sendTeamsNotification("Une place s'est libérée 🎉", [
        `**${p.display_name}** passe de la liste d'attente à confirmé pour « ${parsed.data.title} » (${formatDate(parsed.data.startsAt.toISOString())}) : le nombre de places a été augmenté.`,
      ]);
    }
  }

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

  if (promoted && promoted.length > 0) {
    const { data: event } = await supabase
      .from("events")
      .select("title, starts_at")
      .eq("id", parsedId.data)
      .single();

    for (const p of promoted) {
      await sendTeamsNotification("Une place s'est libérée 🎉", [
        event
          ? `**${p.display_name}** passe de la liste d'attente à confirmé pour « ${event.title} » (${formatDate(event.starts_at)}).`
          : `**${p.display_name}** passe de la liste d'attente à confirmé.`,
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

  // La RLS n'autorise l'update qu'au créateur ou à un admin : si la ligne
  // n'est pas visée, data revient vide et on refuse.
  const { data, error } = await supabase
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", parsedId.data)
    .eq("status", "open")
    .select("title, starts_at")
    .single();

  if (error || !data) {
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

  const names = (participants ?? []).map((p) => p.display_name);
  await sendTeamsNotification("Événement annulé ❌", [
    `« ${data.title} » prévu le ${formatDate(data.starts_at)} est annulé.`,
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
    console.error("postMessage :", error);
    return { ok: false, message: "L'envoi a échoué. Réessayez." };
  }

  const [{ data: event }, { data: profile }] = await Promise.all([
    supabase.from("events").select("title").eq("id", parsedId.data).single(),
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
  ]);
  const base = siteUrl();
  await sendTeamsNotification(
    `💬 ${profile?.display_name ?? "Quelqu'un"} sur « ${event?.title ?? "une activité"} »`,
    [parsedBody.data],
    base
      ? { title: "Répondre", url: `${base}/events/${parsedId.data}` }
      : undefined,
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
