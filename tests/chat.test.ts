/**
 * Tests d'intégration du fil de discussion, exécutés contre la base
 * Supabase de dev, par la vraie surface d'API : clients authentifiés,
 * RLS et grants par colonne.
 *
 * L'enjeu est moins le stockage des messages que les règles d'écriture :
 * poster en son seul nom, ne pas pouvoir antidater, et ne supprimer que
 * ses propres messages (ou n'importe lequel si l'on est admin).
 *
 * Prérequis : .env.local rempli et migrations appliquées.
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

// Adresses en @scalian.com : depuis la migration 20260923090000, un
// trigger sur auth.users refuse tout autre domaine à l'inscription.
const PASSWORD = "test-password-42!";
const testUsers: UserClient[] = [];
let eventId: string;

async function createTestUser(i: number): Promise<UserClient> {
  const email = `chat-test-${Date.now()}-${i}@scalian.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: `Bavard ${i}` },
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

async function post(u: UserClient, body: string) {
  const { data, error } = await u.client
    .from("event_messages")
    .insert({ event_id: eventId, user_id: u.user.id, body })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("insertion du message échouée");
  return data.id;
}

beforeAll(async () => {
  for (let i = 1; i <= 3; i++) {
    testUsers.push(await createTestUser(i));
  }
  const [u1] = testUsers;

  const { data, error } = await u1.client
    .from("events")
    .insert({
      title: "Test discussion",
      sport: "padel",
      description: "Prévoir des balles neuves.",
      starts_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      capacity: 4,
      total_cost_cents: 4800,
      created_by: u1.user.id,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("création event échouée");
  eventId = data.id;
});

afterAll(async () => {
  // Les messages partent en cascade avec l'événement (FK on delete cascade).
  if (eventId) {
    await admin.from("events").delete().eq("id", eventId);
  }
  for (const u of testUsers) {
    await admin.auth.admin.deleteUser(u.user.id);
  }
});

describe("fil de discussion", () => {
  it("expose le message avec le nom de son auteur et l'horodatage de la base", async () => {
    const [u1] = testUsers;
    const before = Date.now();
    const id = await post(u1, "On se retrouve devant le terrain 3.");

    const { data, error } = await u1.client
      .from("event_message_list")
      .select("*")
      .eq("id", id)
      .single();

    expect(error).toBeNull();
    expect(data!.body).toBe("On se retrouve devant le terrain 3.");
    expect(data!.display_name).toBe("Bavard 1");
    expect(data!.user_id).toBe(u1.user.id);
    // Horodaté par la base, pas par le client.
    expect(new Date(data!.created_at).getTime()).toBeGreaterThanOrEqual(
      before - 60_000,
    );
  });

  it("laisse la description de l'événement lisible par tous les membres", async () => {
    const [, u2] = testUsers;
    const { data, error } = await u2.client
      .from("event_summary")
      .select("description")
      .eq("id", eventId)
      .single();

    expect(error).toBeNull();
    expect(data!.description).toBe("Prévoir des balles neuves.");
  });

  it("interdit de poster au nom de quelqu'un d'autre", async () => {
    const [u1, u2] = testUsers;
    const { error } = await u2.client.from("event_messages").insert({
      event_id: eventId,
      user_id: u1.user.id,
      body: "Message attribué à quelqu'un d'autre",
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501"); // violation de policy RLS
  });

  it("interdit d'antidater created_at à l'insertion (grant par colonne)", async () => {
    const [, u2] = testUsers;
    // Sans ce refus, un message daté de 1970 resterait épinglé en tête du fil.
    const { error } = await u2.client.from("event_messages").insert({
      event_id: eventId,
      user_id: u2.user.id,
      body: "Message antidaté",
      created_at: new Date(0).toISOString(),
    } as never);

    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501"); // permission denied
  });

  it("interdit de modifier un message déjà publié", async () => {
    const [, u2] = testUsers;
    const id = await post(u2, "Texte d'origine");

    const { error } = await u2.client
      .from("event_messages")
      .update({ body: "Texte réécrit" } as never)
      .eq("id", id);

    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("ne laisse supprimer un message que par son auteur", async () => {
    const [, u2, u3] = testUsers;
    const id = await post(u2, "Message de Bavard 2");

    // Un tiers : la policy filtre la ligne, aucune suppression.
    const { data: parTiers, error: erreurTiers } = await u3.client
      .from("event_messages")
      .delete()
      .eq("id", id)
      .select("id");
    expect(erreurTiers).toBeNull();
    expect(parTiers).toHaveLength(0);

    const { data: parAuteur } = await u2.client
      .from("event_messages")
      .delete()
      .eq("id", id)
      .select("id");
    expect(parAuteur).toHaveLength(1);
  });

  it("laisse un admin supprimer le message d'un autre", async () => {
    const [, u2, u3] = testUsers;
    const id = await post(u2, "Message à modérer");

    await admin
      .from("profiles")
      .update({ role: "admin" } as never)
      .eq("id", u3.user.id);

    const { data, error } = await u3.client
      .from("event_messages")
      .delete()
      .eq("id", id)
      .select("id");

    await admin
      .from("profiles")
      .update({ role: "member" } as never)
      .eq("id", u3.user.id);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
