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
        Insert: { event_id: string; user_id: string };
        Update: { cancelled_at?: string | null };
        Relationships: [];
      };
    };
    Views: {
      event_summary: { Row: EventSummary; Relationships: [] };
      event_participants: { Row: EventParticipant; Relationships: [] };
    };
    Functions: {
      cancel_registration: {
        Args: { p_event_id: string };
        Returns: PromotedUser[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
