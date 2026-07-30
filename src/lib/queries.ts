"use client";

import { useQuery } from "@tanstack/react-query";
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
