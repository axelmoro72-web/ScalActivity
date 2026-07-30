"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createEventSchema,
  eventIdSchema,
  updateEventSchema,
} from "@/lib/schemas";
import { formatDate } from "@/lib/format";
import { sendTeamsNotification } from "@/lib/teams";

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
