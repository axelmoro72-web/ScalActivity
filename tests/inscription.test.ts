/**
 * Tests d'intégration de l'inscription, exécutés contre la base Supabase
 * de dev. Deux garanties complémentaires y sont vérifiées :
 *
 *  - le domaine, imposé par le trigger `enforce_email_domain` ;
 *  - la possession de l'adresse, imposée par la confirmation par email
 *    (`enable_confirmations`), sans quoi n'importe qui pourrait créer un
 *    compte au nom d'un collègue en saisissant son adresse.
 *
 * Les comptes sont créés via le service_role, qui n'envoie aucun email :
 * le quota du tier gratuit est de deux envois par heure, et une adresse
 * de test inexistante produirait un rebond dans la messagerie Scalian.
 * Ce que ces tests couvrent, c'est donc l'effet du réglage — la connexion
 * refusée tant que l'adresse n'est pas confirmée — et non l'acheminement
 * du mail lui-même.
 *
 * Prérequis : .env.local rempli et migrations appliquées.
 */
import { afterAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "Variables NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY requises (.env.local).",
  );
}

const admin = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function clientAnonyme() {
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const PASSWORD = "test-password-42!";
const creesPendantLesTests: string[] = [];

/** Crée un compte sans envoyer d'email, confirmé ou non selon le besoin. */
async function creerCompte(suffixe: string, confirme: boolean) {
  const email = `inscription-test-${Date.now()}-${suffixe}@scalian.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: confirme,
    user_metadata: { display_name: `Nouveau ${suffixe}` },
  });
  if (error || !data.user) throw error ?? new Error("createUser sans user");
  creesPendantLesTests.push(data.user.id);
  return { id: data.user.id, email };
}

afterAll(async () => {
  for (const id of creesPendantLesTests) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("inscription", () => {
  it("refuse la connexion tant que l'adresse n'est pas confirmée", async () => {
    const { email } = await creerCompte("attente", false);

    const { data, error } = await clientAnonyme().auth.signInWithPassword({
      email,
      password: PASSWORD,
    });

    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
    // C'est toute la protection : le mot de passe est pourtant le bon.
    expect(
      error!.code === "email_not_confirmed" ||
        /not confirmed/i.test(error!.message),
    ).toBe(true);
  });

  it("autorise la connexion une fois l'adresse confirmée", async () => {
    const { id, email } = await creerCompte("confirme", false);

    // Ce que fait l'ouverture du lien reçu par email.
    const { error: confirmError } = await admin.auth.admin.updateUserById(id, {
      email_confirm: true,
    });
    expect(confirmError).toBeNull();

    const { data, error } = await clientAnonyme().auth.signInWithPassword({
      email,
      password: PASSWORD,
    });

    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
  });

  it("refuse une adresse hors du domaine autorisé", async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: `inscription-test-${Date.now()}@gmail.com`,
      password: PASSWORD,
      email_confirm: true,
    });

    // Le trigger enforce_email_domain s'applique même au service_role :
    // il est sur auth.users, pas dans une policy RLS.
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });
});
