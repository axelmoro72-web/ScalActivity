/**
 * Droits d'écriture des résultats, exécutés contre la base Supabase de
 * dev : seuls les participants confirmés d'une activité terminée
 * écrivent, et la base revérifie les règles de score même quand on
 * contourne l'application.
 *
 * Prérequis : .env.local rempli et migrations appliquées (dont
 * 20260924100000_participants_invites et 20260925090000_resultats).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { Database, ResultPlayerInput } from "../src/lib/database.types";
import type { SetScore } from "../src/lib/resultats";

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

type UserClient = { user: User; client: SupabaseClient<Database> };

const PASSWORD = "test-password-42!";
const testUsers: UserClient[] = [];
const eventIds: string[] = [];

async function createTestUser(i: number): Promise<UserClient> {
  const email = `resultat-test-${Date.now()}-${i}@scalian.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: `Joueur ${i}` },
  });
  if (error || !data.user) throw error ?? new Error("createUser sans user");

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  return { user: data.user, client };
}

/**
 * Activité créée par u1, avec u1 et u2 inscrits (et un invité pour la
 * pêche). La RLS n'autorise l'inscription qu'à une activité à venir : on
 * la déplace ensuite dans le passé en service_role.
 */
async function creerEvent(sport: string, terminee = true): Promise<string> {
  const [u1, u2] = testUsers;
  const { data, error } = await u1.client
    .from("events")
    .insert({
      title: `Test résultats ${sport}`,
      sport,
      starts_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      capacity: 4,
      created_by: u1.user.id,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("création event échouée");
  eventIds.push(data.id);

  for (const u of [u1, u2]) {
    const { error: e } = await u.client
      .from("registrations")
      .insert({ event_id: data.id, user_id: u.user.id });
    if (e) throw e;
  }
  await admin
    .from("registrations")
    .insert({ event_id: data.id, guest_name: "Julie Martin" });

  const debut = terminee
    ? Date.now() - 3 * 3600 * 1000
    : Date.now() - 30 * 60 * 1000;
  await admin
    .from("events")
    .update({ starts_at: new Date(debut).toISOString() })
    .eq("id", data.id);
  return data.id;
}

function saisir(
  u: UserClient,
  eventId: string,
  mode: "raquette_sets" | "peche_prises",
  sets: SetScore[],
  players: ResultPlayerInput[],
) {
  return u.client.rpc("save_event_result", {
    p_event_id: eventId,
    p_mode: mode,
    p_sets: sets,
    p_players: players,
  });
}

const joueur = (u: UserClient, team: "A" | "B"): ResultPlayerInput => ({
  user_id: u.user.id,
  guest_name: null,
  team,
  catches: null,
});

beforeAll(async () => {
  for (let i = 1; i <= 3; i++) {
    testUsers.push(await createTestUser(i));
  }
});

afterAll(async () => {
  for (const id of eventIds) {
    await admin.from("events").delete().eq("id", id);
  }
  for (const u of testUsers) {
    await admin.auth.admin.deleteUser(u.user.id);
  }
});

describe("saisie des résultats", () => {
  it("laisse un participant saisir, et trace qui l'a fait", async () => {
    const [u1, u2] = testUsers;
    const eventId = await creerEvent("Padel");
    const { error } = await saisir(u1, eventId, "raquette_sets", [{ a: 6, b: 4 }], [
      joueur(u1, "A"),
      joueur(u2, "B"),
    ]);
    expect(error).toBeNull();

    const { data } = await admin
      .from("event_results")
      .select("recorded_by, updated_by")
      .eq("event_id", eventId)
      .single();
    expect(data).toEqual({ recorded_by: u1.user.id, updated_by: null });
  });

  it("refuse un non-inscrit, par la RPC comme en écriture directe", async () => {
    const [u1, u2, u3] = testUsers;
    const eventId = await creerEvent("Padel");
    const { error } = await saisir(u3, eventId, "raquette_sets", [{ a: 6, b: 4 }], [
      joueur(u1, "A"),
      joueur(u2, "B"),
    ]);
    expect(error?.message).toMatch(/not_allowed/);

    const { error: direct } = await u3.client
      .from("event_results")
      .insert({ event_id: eventId, mode: "raquette_sets", sets: [{ a: 6, b: 4 }] });
    expect(direct).not.toBeNull();
  });

  it("refuse la saisie avant la fin de l'activité", async () => {
    const [u1, u2] = testUsers;
    const eventId = await creerEvent("Padel", false);
    const { error } = await saisir(u1, eventId, "raquette_sets", [{ a: 6, b: 4 }], [
      joueur(u1, "A"),
      joueur(u2, "B"),
    ]);
    expect(error?.message).toMatch(/not_allowed/);
  });

  it("revérifie les règles de score en base", async () => {
    const [u1, u2] = testUsers;
    const eventId = await creerEvent("Padel");
    const joueurs = [joueur(u1, "A"), joueur(u2, "B")];

    expect((await saisir(u1, eventId, "raquette_sets", [{ a: 6, b: 5 }], joueurs)).error?.message)
      .toMatch(/set_invalide/);
    expect(
      (await saisir(u1, eventId, "raquette_sets", [{ a: 3, b: 2, interrompu: true }, { a: 6, b: 4 }], joueurs))
        .error?.message,
    ).toMatch(/interruption_hors_dernier_set/);
    expect(
      (await saisir(u1, eventId, "raquette_sets", [{ a: 6, b: 4 }], [joueur(u1, "A"), joueur(u2, "A")]))
        .error?.message,
    ).toMatch(/equipes_invalides/);
    // Un set interrompu accepte n'importe quel score.
    expect(
      (await saisir(u1, eventId, "raquette_sets", [{ a: 6, b: 4 }, { a: 2, b: 2, interrompu: true }], joueurs))
        .error,
    ).toBeNull();
  });

  it("garde l'auteur initial et trace la modification", async () => {
    const [u1, u2] = testUsers;
    const eventId = await creerEvent("Padel");
    const joueurs = [joueur(u1, "A"), joueur(u2, "B")];
    await saisir(u1, eventId, "raquette_sets", [{ a: 6, b: 4 }], joueurs);
    const { error } = await saisir(u2, eventId, "raquette_sets", [{ a: 4, b: 6 }, { a: 3, b: 6 }], joueurs);
    expect(error).toBeNull();

    const { data } = await admin
      .from("event_results")
      .select("recorded_by, updated_by, sets")
      .eq("event_id", eventId)
      .single();
    expect(data?.recorded_by).toBe(u1.user.id);
    expect(data?.updated_by).toBe(u2.user.id);
    expect(data?.sets).toHaveLength(2);

    // L'auteur ne se falsifie pas : la colonne n'est pas modifiable.
    const { error: falsif } = await u2.client
      .from("event_results")
      .update({ recorded_by: u2.user.id } as never)
      .eq("event_id", eventId);
    expect(falsif).not.toBeNull();
  });

  it("accepte un invité inscrit à la pêche, refuse un inconnu", async () => {
    const [u1, u2] = testUsers;
    const eventId = await creerEvent("Pêche");
    const pecheur = (u: UserClient, n: number): ResultPlayerInput => ({
      user_id: u.user.id,
      guest_name: null,
      team: null,
      catches: n,
    });
    const { error } = await saisir(u1, eventId, "peche_prises", [], [
      pecheur(u1, 5),
      pecheur(u2, 5),
      { user_id: null, guest_name: "Julie Martin", team: null, catches: 2 },
    ]);
    expect(error).toBeNull();

    const { error: inconnu } = await saisir(u1, eventId, "peche_prises", [], [
      pecheur(u1, 5),
      { user_id: null, guest_name: "Jean Inconnu", team: null, catches: 9 },
    ]);
    expect(inconnu?.message).toMatch(/joueur_non_inscrit/);
  });
});
