/**
 * Tests d'intégration de la logique de file d'attente, exécutés contre la
 * base Supabase de dev (pas de Docker sur ce poste). Ils passent par la
 * vraie surface d'API : clients authentifiés (anon key + session), RLS,
 * grants par colonne et RPC cancel_registration.
 *
 * Prérequis : .env.local rempli (URL, anon key, service_role key) et
 * migrations appliquées.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
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

type UserClient = { user: User; client: SupabaseClient<Database> };

const PASSWORD = "test-password-42!";
const testUsers: UserClient[] = [];
let eventId: string;

async function createTestUser(i: number): Promise<UserClient> {
  const email = `queue-test-${Date.now()}-${i}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: `Testeur ${i}` },
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

/** Inscrit l'utilisateur via la vraie surface d'API (RLS + grants). */
async function register(u: UserClient) {
  const { error } = await u.client
    .from("registrations")
    .insert({ event_id: eventId, user_id: u.user.id });
  if (error) throw error;
}

async function participants() {
  const { data, error } = await admin
    .from("event_participants")
    .select("*")
    .eq("event_id", eventId)
    .order("position");
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  for (let i = 1; i <= 4; i++) {
    testUsers.push(await createTestUser(i));
  }
  const [u1] = testUsers;

  // Capacité 2 : u1 et u2 confirmés, u3 et u4 en liste d'attente.
  const { data, error } = await u1.client
    .from("events")
    .insert({
      title: "Test file d'attente",
      sport: "padel",
      starts_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      capacity: 2,
      total_cost_cents: 4800,
      created_by: u1.user.id,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("création event échouée");
  eventId = data.id;
});

afterAll(async () => {
  // Nettoyage physique par service_role : uniquement pour les données de
  // test — l'application, elle, ne supprime jamais rien.
  if (eventId) {
    await admin.from("registrations").delete().eq("event_id", eventId);
    await admin.from("events").delete().eq("id", eventId);
  }
  for (const u of testUsers) {
    await admin.auth.admin.deleteUser(u.user.id);
  }
});

describe("file d'attente", () => {
  it("attribue les positions dans l'ordre d'inscription et calcule le statut", async () => {
    for (const u of testUsers) {
      await register(u);
    }

    const list = await participants();
    expect(list).toHaveLength(4);
    expect(list.map((p) => p.user_id)).toEqual(
      testUsers.map((u) => u.user.id),
    );
    expect(list.map((p) => p.position)).toEqual([1, 2, 3, 4]);
    expect(list.map((p) => p.is_confirmed)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("interdit d'antidater registered_at à l'insertion (grant par colonne)", async () => {
    const intruder = testUsers[3];
    // Déjà inscrit : on vérifie seulement que la colonne est refusée,
    // l'erreur attendue est un refus de privilège, pas un doublon.
    const { error } = await intruder.client.from("registrations").insert({
      event_id: eventId,
      user_id: intruder.user.id,
      registered_at: new Date(0).toISOString(),
    } as never);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501"); // permission denied
  });

  it("promeut le premier en attente quand un confirmé se désinscrit, dans la même transaction", async () => {
    const [u1, , u3] = testUsers;

    const { data: promoted, error } = await u1.client.rpc(
      "cancel_registration",
      { p_event_id: eventId },
    );
    expect(error).toBeNull();

    // u3 était premier en liste d'attente : c'est lui — et lui seul —
    // qui bascule en confirmé.
    expect(promoted).toEqual([
      { user_id: u3.user.id, display_name: "Testeur 3" },
    ]);

    const list = await participants();
    expect(list.map((p) => p.user_id)).toEqual([
      testUsers[1].user.id,
      u3.user.id,
      testUsers[3].user.id,
    ]);
    expect(list.map((p) => p.is_confirmed)).toEqual([true, true, false]);
  });

  it("ne promeut personne quand un membre de la liste d'attente se désinscrit", async () => {
    const u4 = testUsers[3];

    const { data: promoted, error } = await u4.client.rpc(
      "cancel_registration",
      { p_event_id: eventId },
    );
    expect(error).toBeNull();
    expect(promoted).toEqual([]);

    const list = await participants();
    expect(list).toHaveLength(2);
    expect(list.every((p) => p.is_confirmed)).toBe(true);
  });

  it("replace en fin de file une personne qui se réinscrit après désistement", async () => {
    const [u1, u2, u3] = testUsers;

    // u1 s'était désinscrit ; il se réinscrit : l'index unique partiel
    // l'autorise, et il repart en fin de file.
    await register(u1);

    const list = await participants();
    expect(list.map((p) => p.user_id)).toEqual([
      u2.user.id,
      u3.user.id,
      u1.user.id,
    ]);
    expect(list.map((p) => p.is_confirmed)).toEqual([true, true, false]);
    expect(list[2].position).toBe(3);
  });

  it("refuse une double inscription active", async () => {
    const u2 = testUsers[1];
    const { error } = await u2.client
      .from("registrations")
      .insert({ event_id: eventId, user_id: u2.user.id });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("23505"); // violation d'unicité
  });

  it("promeut la liste d'attente quand la capacité augmente", async () => {
    const [u1, u2, u3] = testUsers;

    // État courant : u2 et u3 confirmés (capacité 2), u1 en attente.
    const { data: promoted, error } = await u1.client.rpc("update_event", {
      p_event_id: eventId,
      p_title: "Test file d'attente",
      p_sport: "padel",
      p_description: null,
      p_location: null,
      p_starts_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      p_ends_at: null,
      p_capacity: 3,
      p_total_cost_cents: 4800,
    });

    // u1 a créé l'event : la RLS l'autorise à le modifier.
    expect(error).toBeNull();
    expect(promoted).toEqual([
      { user_id: u1.user.id, display_name: "Testeur 1" },
    ]);

    const list = await participants();
    expect(list.map((p) => p.user_id)).toEqual([
      u2.user.id,
      u3.user.id,
      u1.user.id,
    ]);
    expect(list.every((p) => p.is_confirmed)).toBe(true);
  });

  it("refuse de réduire la capacité sous le nombre de confirmés", async () => {
    const u1 = testUsers[0];

    const { error } = await u1.client.rpc("update_event", {
      p_event_id: eventId,
      p_title: "Test file d'attente",
      p_sport: "padel",
      p_description: null,
      p_location: null,
      p_starts_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      p_ends_at: null,
      p_capacity: 2, // 3 personnes sont confirmées
      p_total_cost_cents: 4800,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("capacity_below_confirmed");
  });

  it("refuse la modification par quelqu'un d'autre que le créateur", async () => {
    const intruder = testUsers[1]; // u2 n'est pas créateur, pas admin

    const { error } = await intruder.client.rpc("update_event", {
      p_event_id: eventId,
      p_title: "Titre pirate",
      p_sport: "padel",
      p_description: null,
      p_location: null,
      p_starts_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      p_ends_at: null,
      p_capacity: 3,
      p_total_cost_cents: 4800,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("not_allowed");
  });

  it("refuse la désinscription sans inscription active", async () => {
    const u4 = testUsers[3]; // déjà désinscrit
    const { error } = await u4.client.rpc("cancel_registration", {
      p_event_id: eventId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("not_registered");
  });
});
