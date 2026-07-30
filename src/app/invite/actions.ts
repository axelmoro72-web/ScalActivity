"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteSchema } from "@/lib/schemas";

export type InviteState = { ok: boolean; message: string } | null;

// Tout membre authentifié peut inviter un collègue (décision produit).
// L'appel admin (service_role) reste strictement côté serveur.
export async function inviteMember(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Vous devez être connecté." };
  }

  const parsed = inviteSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const admin = createAdminClient();
  // La redirection de l'email par défaut porte la session en fragment
  // d'URL : la cible doit être la page client qui sait le traiter.
  const { error } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    { redirectTo: `${siteUrl}/auth/set-password` },
  );

  if (error) {
    if (error.code === "email_exists") {
      return { ok: false, message: "Cette adresse a déjà un compte." };
    }
    console.error("inviteUserByEmail :", error);
    return {
      ok: false,
      message: "L'invitation n'a pas pu être envoyée. Réessayez plus tard.",
    };
  }

  return { ok: true, message: `Invitation envoyée à ${parsed.data.email}.` };
}
