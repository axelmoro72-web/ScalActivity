"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createEventSchema,
  eventIdSchema,
  guestNameSchema,
  messageBodySchema,
  messageIdSchema,
  registrationIdSchema,
  updateEventSchema,
} from "@/lib/schemas";
import { formatCents, formatDate } from "@/lib/format";
import { sendTeamsNotification, siteUrl } from "@/lib/teams";

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
    `**${e.sport}** · ${formatDate(e.startsAt.toISOString())}${e.location ? ` · ${e.location}` : ""}`,
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
    `Nouvelle activité : ${parsed.data.title} 🏃`,
    [
      ...eventSummaryLines(parsed.data),
      ...(profile ? [`Proposée par ${profile.display_name}.`] : []),
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
        `**${p.display_name}** passe de la liste d'attente à confirmé pour « ${parsed.data.title} » (${formatDate(parsed.data.startsAt.toISOString())}) : le nombre de places a été augmenté.`,
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
    `Activité modifiée : ${parsed.data.title} ✏️`,
    [
      ...eventSummaryLines(parsed.data),
      ...(profile ? [`Modifiée par ${profile.display_name}.`] : []),
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
        ? `✅ ${me.display_name} s'inscrit à « ${summary.title} »`
        : `⏳ ${me.display_name} rejoint la liste d'attente de « ${summary.title} »`,
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
      `🚪 ${profile.display_name} se désinscrit de « ${event.title} »`,
      [fillLine(event)],
      eventLink(parsedId.data, "Voir l'activité"),
    );
  }

  if (promoted && promoted.length > 0) {
    for (const p of promoted) {
      await sendTeamsNotification(parsedId.data, "Une place s'est libérée 🎉", [
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
  await sendTeamsNotification(parsedId.data, "Événement annulé ❌", [
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
  await sendTeamsNotification(
    parsedId.data,
    `💬 ${profile?.display_name ?? "Quelqu'un"} sur « ${event?.title ?? "une activité"} »`,
    [parsedBody.data],
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


/**
 * Droit d'organisation sur une activité : son créateur, ou un admin.
 *
 * Les actions qui suivent écrivent avec le client service_role, qui
 * contourne la RLS — c'est donc ici, et nulle part ailleurs, que se
 * joue l'autorisation. La lecture passe volontairement par le client de
 * l'appelant : son propre rôle lui est lisible, pas modifiable.
 */
async function assertPeutOrganiser(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, erreur: "Vous devez être connecté." };
  }

  const [{ data: event }, { data: profile }] = await Promise.all([
    supabase
      .from("events")
      .select("title, status, starts_at, created_by")
      .eq("id", eventId)
      .single(),
    supabase.from("profiles").select("display_name, role").eq("id", user.id).single(),
  ]);

  if (!event) {
    return { ok: false as const, erreur: "Événement introuvable." };
  }
  if (event.created_by !== user.id && profile?.role !== "admin") {
    return {
      ok: false as const,
      erreur:
        "Seul le créateur de l'activité ou un admin peut gérer ses participants.",
    };
  }
  return { ok: true as const, user, event, profile };
}

/**
 * Ajout d'un participant à la main, sous un nom libre.
 *
 * Il n'a pas de compte : le domaine @scalian.com étant exigé à
 * l'inscription, un invité extérieur ne peut pas en avoir. La ligne
 * porte donc guest_name au lieu de user_id.
 *
 * Aucune promotion à détecter : l'inscription s'ajoute en fin de file,
 * elle ne change le statut de personne d'autre.
 */
export async function addGuest(
  eventId: string,
  guestName: string,
): Promise<ActionState> {
  const parsedId = eventIdSchema.safeParse(eventId);
  if (!parsedId.success) {
    return { ok: false, message: "Événement invalide." };
  }
  const parsedName = guestNameSchema.safeParse(guestName);
  if (!parsedName.success) {
    return { ok: false, message: parsedName.error.issues[0].message };
  }

  const acces = await assertPeutOrganiser(parsedId.data);
  if (!acces.ok) return { ok: false, message: acces.erreur };

  // Le client service_role ne repasse pas par la RLS, qui refusait déjà
  // toute inscription sur une activité annulée ou passée : on le
  // revérifie ici, faute de quoi la règle disparaîtrait par cette porte.
  if (acces.event.status !== "open") {
    return { ok: false, message: "Cette activité est annulée." };
  }
  if (new Date(acces.event.starts_at).getTime() < Date.now()) {
    return { ok: false, message: "Cette activité est déjà passée." };
  }

  const { error } = await createAdminClient()
    .from("registrations")
    .insert({ event_id: parsedId.data, guest_name: parsedName.data });

  if (error) {
    console.error("addGuest :", error);
    return { ok: false, message: "L'ajout a échoué. Réessayez." };
  }

  const { data: summary } = await createAdminClient()
    .from("event_summary")
    .select("title, capacity, registered_count, spots_left")
    .eq("id", parsedId.data)
    .single();
  if (summary) {
    await sendTeamsNotification(
      parsedId.data,
      `➕ ${parsedName.data} est ajouté·e à « ${summary.title} »`,
      [
        fillLine(summary),
        acces.profile ? `Ajouté·e par ${acces.profile.display_name}.` : "",
      ].filter(Boolean),
      eventLink(parsedId.data, "Voir l'activité"),
    );
  }

  return { ok: true, message: `${parsedName.data} a été ajouté·e.` };
}

/**
 * Retrait d'un participant par l'organisateur. Passe par la RPC
 * remove_participant : retirer quelqu'un libère une place et promeut le
 * suivant, promotion qu'il faut détecter dans la même transaction —
 * comme à la désinscription.
 */
export async function removeParticipant(
  eventId: string,
  registrationId: number,
): Promise<ActionState> {
  const parsedId = eventIdSchema.safeParse(eventId);
  if (!parsedId.success) {
    return { ok: false, message: "Événement invalide." };
  }
  const parsedRegistration = registrationIdSchema.safeParse(registrationId);
  if (!parsedRegistration.success) {
    return { ok: false, message: "Inscription invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Vous devez être connecté." };

  // L'autorisation est vérifiée par la fonction SQL elle-même.
  const { data: promoted, error } = await supabase.rpc("remove_participant", {
    p_event_id: parsedId.data,
    p_registration_id: parsedRegistration.data,
  });

  if (error) {
    if (error.message.includes("not_allowed")) {
      return {
        ok: false,
        message:
          "Seul le créateur de l'activité ou un admin peut retirer un participant.",
      };
    }
    if (error.message.includes("not_registered")) {
      return { ok: false, message: "Cette personne n'est plus inscrite." };
    }
    console.error("remove_participant :", error);
    return { ok: false, message: "Le retrait a échoué. Réessayez." };
  }

  if (promoted && promoted.length > 0) {
    const { data: event } = await supabase
      .from("events")
      .select("title, starts_at")
      .eq("id", parsedId.data)
      .single();
    for (const p of promoted) {
      await sendTeamsNotification(parsedId.data, "Une place s'est libérée 🎉", [
        event
          ? `**${p.display_name}** passe de la liste d'attente à confirmé pour « ${event.title} » (${formatDate(event.starts_at)}).`
          : `**${p.display_name}** passe de la liste d'attente à confirmé.`,
      ]);
    }
  }

  return { ok: true, message: "Participant retiré." };
}
