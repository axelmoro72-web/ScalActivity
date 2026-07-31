"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

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

/** Événements à venir (y compris annulés, affichés barrés). */
export function useUpcomingEvents() {
  return useQuery({
    queryKey: ["events", "upcoming"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("event_summary")
        .select("*")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data;
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
