// Types de la base, écrits à la main faute de base locale pour les générer
// (pas de Docker sur ce poste). À régénérer via `supabase gen types` quand
// une base locale sera disponible.
//
// Alias `type` et non `interface` : les interfaces n'ont pas de signature
// d'index implicite et ne satisfont pas `Record<string, unknown>` exigé
// par les génériques de supabase-js.

import type { ModeScore } from "./activites";
import type { Equipe, SetScore } from "./resultats";

export type EventStatus = "open" | "cancelled";
export type ProfileRole = "member" | "admin";

export type Profile = {
  id: string;
  display_name: string;
  role: ProfileRole;
  created_at: string;
};

export type Event = {
  id: string;
  title: string;
  sport: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number;
  total_cost_cents: number;
  cancel_deadline_at: string | null;
  status: EventStatus;
  created_by: string;
  created_at: string;
};

export type Registration = {
  id: number;
  event_id: string;
  /** Nul pour un invité ajouté à la main, qui n'a pas de compte. */
  user_id: string | null;
  /** Renseigné pour un invité seulement : l'un ou l'autre, jamais les deux. */
  guest_name: string | null;
  registered_at: string;
  cancelled_at: string | null;
};

/** Vue event_summary : event + prix par personne et compteurs dérivés. */
export type EventSummary = Event & {
  price_per_person_cents: number;
  registered_count: number;
  spots_left: number;
};

/** Vue event_message_list : message du fil avec le nom de son auteur. */
export type EventMessage = {
  id: number;
  event_id: string;
  user_id: string;
  body: string;
  created_at: string;
  display_name: string;
};

/** Vue event_participants : inscriptions actives avec position et statut calculés. */
export type EventParticipant = {
  id: number;
  event_id: string;
  user_id: string | null;
  registered_at: string;
  /** Nom du profil pour un membre, nom libre pour un invité. */
  display_name: string;
  is_guest: boolean;
  position: number;
  is_confirmed: boolean;
};

/** Retour de la RPC cancel_registration : les personnes promues en confirmé. */
export type PromotedUser = {
  /** Nul quand la personne promue est un invité sans compte. */
  user_id: string | null;
  display_name: string;
};

/** Table event_results : un résultat par événement terminé. */
export type EventResult = {
  event_id: string;
  mode: ModeScore;
  sets: SetScore[];
  recorded_by: string | null;
  recorded_at: string;
  updated_by: string | null;
  updated_at: string | null;
};

/** Table event_result_players : un membre ou un invité, dans une équipe ou avec ses prises. */
export type EventResultPlayer = {
  id: number;
  event_id: string;
  user_id: string | null;
  guest_name: string | null;
  team: Equipe | null;
  catches: number | null;
};

/**
 * Vue event_result_details : une ligne par joueur, avec l'événement et
 * les noms de qui a saisi / modifié. player_id est nul pour un résultat
 * sans joueur (ne devrait pas exister, la base l'interdit).
 */
export type EventResultDetail = {
  event_id: string;
  title: string;
  sport: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  mode: ModeScore;
  sets: SetScore[];
  recorded_by: string | null;
  recorded_by_name: string | null;
  recorded_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string | null;
  player_id: number | null;
  user_id: string | null;
  guest_name: string | null;
  display_name: string | null;
  team: Equipe | null;
  catches: number | null;
};

/** Joueur transmis à la RPC save_event_result. */
export type ResultPlayerInput = {
  user_id: string | null;
  guest_name: string | null;
  team: Equipe | null;
  catches: number | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        // Ligne créée par trigger à l'inscription ; l'app ne fait que
        // lire et modifier display_name.
        Row: Profile;
        Insert: { id: string; display_name: string };
        Update: { display_name?: string };
        Relationships: [];
      };
      events: {
        Row: Event;
        Insert: {
          title: string;
          sport: string;
          description?: string | null;
          location?: string | null;
          starts_at: string;
          ends_at?: string | null;
          capacity: number;
          total_cost_cents?: number;
          created_by: string;
        };
        Update: Partial<Omit<Event, "id" | "created_at">>;
        Relationships: [];
      };
      registrations: {
        Row: Registration;
        // Grants par colonne : seules event_id/user_id sont insérables,
        // seul cancelled_at est modifiable.
        // guest_name n'est pas insérable par `authenticated` (grant par
        // colonne) : seules les actions serveur, en service_role, ajoutent
        // un invité — après avoir vérifié qui le demande.
        Insert: {
          event_id: string;
          user_id?: string | null;
          guest_name?: string | null;
        };
        Update: { cancelled_at?: string | null };
        Relationships: [];
      };
      event_messages: {
        Row: Omit<EventMessage, "display_name">;
        // created_at n'est pas insérable (grant par colonne) : sinon un
        // message antidaté remonterait en tête du fil.
        Insert: { event_id: string; user_id: string; body: string };
        // Un message ne se modifie pas, il se supprime.
        Update: Record<string, never>;
        Relationships: [];
      };
      // Écriture uniquement via la RPC save_event_result (transaction
      // unique) ; les colonnes de traçabilité sont posées par trigger.
      event_results: {
        Row: EventResult;
        Insert: { event_id: string; mode: ModeScore; sets: SetScore[] };
        Update: { mode?: ModeScore; sets?: SetScore[] };
        Relationships: [];
      };
      event_result_players: {
        Row: EventResultPlayer;
        Insert: Omit<EventResultPlayer, "id">;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: {
      event_summary: { Row: EventSummary; Relationships: [] };
      event_participants: { Row: EventParticipant; Relationships: [] };
      event_message_list: { Row: EventMessage; Relationships: [] };
      event_result_details: { Row: EventResultDetail; Relationships: [] };
    };
    Functions: {
      cancel_registration: {
        Args: { p_event_id: string };
        Returns: PromotedUser[];
      };
      save_event_result: {
        Args: {
          p_event_id: string;
          p_mode: ModeScore;
          p_sets: SetScore[];
          p_players: ResultPlayerInput[];
        };
        Returns: undefined;
      };
      remove_participant: {
        Args: { p_event_id: string; p_registration_id: number };
        Returns: PromotedUser[];
      };
      update_event: {
        Args: {
          p_event_id: string;
          p_title: string;
          p_sport: string;
          p_description: string | null;
          p_location: string | null;
          p_starts_at: string;
          p_ends_at: string | null;
          p_capacity: number;
          p_total_cost_cents: number;
        };
        Returns: PromotedUser[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
