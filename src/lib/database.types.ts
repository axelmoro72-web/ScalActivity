// Types de la base, écrits à la main faute de base locale pour les générer
// (pas de Docker sur ce poste). À régénérer via `supabase gen types` quand
// une base locale sera disponible.
//
// Alias `type` et non `interface` : les interfaces n'ont pas de signature
// d'index implicite et ne satisfont pas `Record<string, unknown>` exigé
// par les génériques de supabase-js.

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
  user_id: string;
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
  user_id: string;
  registered_at: string;
  display_name: string;
  position: number;
  is_confirmed: boolean;
};

/** Retour de la RPC cancel_registration : les personnes promues en confirmé. */
export type PromotedUser = {
  user_id: string;
  display_name: string;
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
        // Aucun UPDATE direct : modifier passe par update_event, annuler
        // par cancel_event (règles métier vérifiées côté base).
        Update: Record<string, never>;
        Relationships: [];
      };
      registrations: {
        Row: Registration;
        // Grants par colonne : seules event_id/user_id sont insérables.
        // Aucun UPDATE direct : la désinscription passe par
        // cancel_registration.
        Insert: { event_id: string; user_id: string };
        Update: Record<string, never>;
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
    };
    Views: {
      event_summary: { Row: EventSummary; Relationships: [] };
      event_participants: { Row: EventParticipant; Relationships: [] };
      event_message_list: { Row: EventMessage; Relationships: [] };
    };
    Functions: {
      cancel_event: {
        Args: { p_event_id: string };
        Returns: { title: string; starts_at: string }[];
      };
      cancel_registration: {
        Args: { p_event_id: string };
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
