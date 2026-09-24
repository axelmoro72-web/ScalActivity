"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CompteState = { ok: boolean; message: string } | null;

/**
 * Suppression de son propre compte.
 *
 * `events.created_by` référence `profiles` sans cascade : tant qu'une
 * activité créée par la personne existe, la ligne profiles (et donc le
 * compte) ne peut pas être effacée. On refuse donc tant qu'il reste des
 * activités à venir — les autres inscrits doivent être prévenus, c'est à
 * l'organisateur d'annuler — puis on efface ses activités passées ou
 * annulées, qui n'intéressent plus personne.
 *
 * Le reste part en cascade : inscriptions, messages du fil, profil.
 */
export async function deleteAccount(): Promise<CompteState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Vous devez être connecté." };

  const now = new Date().toISOString();
  const { data: aVenir, error: readError } = await supabase
    .from("events")
    .select("id")
    .eq("created_by", user.id)
    .eq("status", "open")
    .gt("starts_at", now);

  if (readError) {
    console.error("deleteAccount (lecture) :", readError);
    return { ok: false, message: "Suppression impossible. Réessayez." };
  }
  if (aVenir && aVenir.length > 0) {
    return {
      ok: false,
      message: `Annulez d'abord vos ${aVenir.length} activité(s) à venir : des collègues y sont inscrits.`,
    };
  }

  // Mêmes critères que la vérification, et non « toutes ses activités » :
  // une activité à venir créée entre-temps (autre onglet) n'est pas
  // effacée sans prévenir ses inscrits. Elle bloque alors deleteUser
  // (clé étrangère sans cascade) et la suppression échoue proprement.
  const admin = createAdminClient();
  const { error: eventsError } = await admin
    .from("events")
    .delete()
    .eq("created_by", user.id)
    .or(`status.eq.cancelled,starts_at.lte."${now}"`);
  if (eventsError) {
    console.error("deleteAccount (événements) :", eventsError);
    return { ok: false, message: "Suppression impossible. Réessayez." };
  }

  const { error: userError } = await admin.auth.admin.deleteUser(user.id);
  if (userError) {
    console.error("deleteAccount (compte) :", userError);
    return { ok: false, message: "Suppression impossible. Réessayez." };
  }

  await supabase.auth.signOut();
  redirect("/login?compte=supprime");
}
