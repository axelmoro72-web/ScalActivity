"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { DUREE_PAR_DEFAUT_MS } from "@/lib/cycle";
import { grouperResultats } from "@/lib/classement";

/** Utilisateur courant + son profil (rôle admin, nom affiché). */
export function useCurrentProfile() {
  return useQuery({
    queryKey: ["current-profile"],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return profile;
    },
  });
}

/**
 * Filtre PostgREST « terminé » / « pas terminé » : fin passée, ou début
 * + 2 h sans fin (cf. src/lib/cycle.ts). Les horodatages ISO ne
 * contiennent ni virgule ni parenthèse, ils passent tels quels dans or().
 */
function filtreFin(termine: boolean) {
  const now = new Date();
  const limiteDebut = new Date(now.getTime() - DUREE_PAR_DEFAUT_MS);
  return termine
    ? `ends_at.lte.${now.toISOString()},and(ends_at.is.null,starts_at.lte.${limiteDebut.toISOString()})`
    : `ends_at.gt.${now.toISOString()},and(ends_at.is.null,starts_at.gt.${limiteDebut.toISOString()})`;
}

/**
 * Événements à venir ou en cours (y compris annulés, affichés barrés).
 * Une activité commencée reste listée jusqu'à sa fin, puis passe dans
 * « Terminés ».
 */
export function useUpcomingEvents() {
  return useQuery({
    queryKey: ["events", "upcoming"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("event_summary")
        .select("*")
        .or(filtreFin(false))
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

/** Événements terminés, du plus récent au plus ancien (hors annulés). */
export function useFinishedEvents() {
  return useQuery({
    queryKey: ["events", "finished"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("event_summary")
        .select("*")
        .eq("status", "open")
        .or(filtreFin(true))
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Résultats saisis, regroupés par événement. Sans argument : tous
 * (classement, profils) — volume d'une app interne, le calcul se fait
 * côté client à partir des résultats bruts.
 */
export function useResultats(eventIds?: string[]) {
  return useQuery({
    queryKey: ["resultats", eventIds ?? "tous"],
    enabled: eventIds === undefined || eventIds.length > 0,
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from("event_result_details").select("*");
      if (eventIds) query = query.in("event_id", eventIds);
      const { data, error } = await query.order("player_id", {
        ascending: true,
      });
      if (error) throw error;
      return grouperResultats(data);
    },
  });
}

export function useEvent(eventId: string) {
  return useQuery({
    queryKey: ["events", eventId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("event_summary")
        .select("*")
        .eq("id", eventId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/** Participants de plusieurs événements d'un coup (avatars de la liste). */
export function useManyParticipants(eventIds: string[]) {
  return useQuery({
    queryKey: ["events", "participants", eventIds],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("event_participants")
        .select("*")
        .in("event_id", eventIds)
        .order("position", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

/** Profil public d'un membre (organisateur d'un événement). */
export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profiles", userId],
    enabled: !!userId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Fil de discussion d'un événement.
 *
 * Deux mécanismes de fraîcheur volontairement superposés : l'abonnement
 * Realtime fait apparaître les messages des autres sans action de leur
 * part, et un refetch périodique sert de filet si le websocket ne
 * s'établit pas (réseau d'entreprise, onglet réveillé après veille).
 * L'auteur d'un message, lui, voit le sien immédiatement : la mutation
 * invalide la requête au retour de l'action serveur.
 */
export function useMessages(eventId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`event-messages-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_messages",
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["events", eventId, "messages"],
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, queryClient]);

  return useQuery({
    queryKey: ["events", eventId, "messages"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("event_message_list")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

/** Participants actifs avec position et statut calculés par la vue. */
export function useParticipants(eventId: string) {
  return useQuery({
    queryKey: ["events", eventId, "participants"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("event_participants")
        .select("*")
        .eq("event_id", eventId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
