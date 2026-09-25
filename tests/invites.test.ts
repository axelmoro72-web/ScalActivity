/**
 * Participants ajoutés à la main, y compris sans compte.
 *
 * Exécuté contre la base Supabase de dev. Les invités sont insérés en
 * service_role, comme le fait l'action serveur après avoir vérifié qui
 * demande l'ajout : la RLS, elle, n'autorise chacun qu'à s'inscrire
 * lui-même.
 *
 * L'enjeu principal est la détection des promotions. Elle reposait sur
 * un tableau d'user_id ; un invité en a un nul, il n'aurait donc jamais
 * été reconnu comme promu et personne n'aurait été prévenu.
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

const PASSWORD = "test-password-42!";
const testUsers: UserClient[] = [];
const eventIds: string[] = [];

async function createTestUser(i: number): Promise<UserClient> {
  const email = `invite-test-${Date.now()}-${i}@scalian.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: `Hôte ${i}` },
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

/** Activité créée par u1, avec la capacité voulue. */
async function creerEvent(capacity: number): Promise<string> {
  const [u1] = testUsers;
  const { data, error } = await u1.client
    .from("events")
    .insert({
      title: "Test invités",
      sport: "padel",
      starts_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      capacity,
      total_cost_cents: 4800,
      created_by: u1.user.id,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("création event échouée");
  eventIds.push(data.id);
  return data.id;
}

/** Ajout d'un invité, comme le fait l'action serveur. */
async function ajouterInvite(eventId: string, nom: string): Promise<number> {
  const { data, error } = await admin
    .from("registrations")
    .insert({ event_id: eventId, guest_name: nom })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("ajout invité échoué");
  return data.id;
}

async function inscrire(u: UserClient, eventId: string) {
  const { error } = await u.client
    .from("registrations")
    .insert({ event_id: eventId, user_id: u.user.id });
  if (error) throw error;
}

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

describe("participants invités", () => {
  it("affiche l'invité dans la liste sous son nom libre", async () => {
    const eventId = await creerEvent(4);
    await ajouterInvite(eventId, "Camille (invitée)");

    const { data, error } = await testUsers[1].client
      .from("event_participants")
      .select("*")
      .eq("event_id", eventId)
      .order("position");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].display_name).toBe("Camille (invitée)");
    expect(data![0].is_guest).toBe(true);
    expect(data![0].user_id).toBeNull();
    // Une place libre : l'invité est confirmé d'emblée.
    expect(data![0].is_confirmed).toBe(true);
  });

  it("refuse une inscription à la fois membre et invitée", async () => {
    const eventId = await creerEvent(4);
    const { error } = await admin.from("registrations").insert({
      event_id: eventId,
      user_id: testUsers[1].user.id,
      guest_name: "Les deux à la fois",
    });
    expect(error).not.toBeNull();
  });

  it("refuse une inscription sans membre ni invité", async () => {
    const eventId = await creerEvent(4);
    const { error } = await admin
      .from("registrations")
      .insert({ event_id: eventId });
    expect(error).not.toBeNull();
  });

  it("promeut l'invité en attente quand un confirmé se désinscrit", async () => {
    // Le cas que l'ancien tableau d'user_id ratait : l'invité passait
    // confirmé sans que personne ne soit prévenu.
    const eventId = await creerEvent(1);
    const [u1] = testUsers;
    await inscrire(u1, eventId);
    await ajouterInvite(eventId, "Dominique (invité)");

    const { data: promus, error } = await u1.client.rpc(
      "cancel_registration",
      { p_event_id: eventId },
    );

    expect(error).toBeNull();
    expect(promus).toHaveLength(1);
    expect(promus![0].display_name).toBe("Dominique (invité)");
    expect(promus![0].user_id).toBeNull();
  });

  it("retire un participant et promeut le suivant", async () => {
    const eventId = await creerEvent(1);
    const [u1, u2] = testUsers;
    const inviteId = await ajouterInvite(eventId, "Ajouté par erreur");
    await inscrire(u2, eventId);

    const { data: promus, error } = await u1.client.rpc("remove_participant", {
      p_event_id: eventId,
      p_registration_id: inviteId,
    });

    expect(error).toBeNull();
    expect(promus).toHaveLength(1);
    expect(promus![0].user_id).toBe(u2.user.id);

    const { data: restants } = await u1.client
      .from("event_participants")
      .select("*")
      .eq("event_id", eventId);
    expect(restants).toHaveLength(1);
    expect(restants![0].user_id).toBe(u2.user.id);
  });

  it("n'autorise le retrait qu'au créateur ou à un admin", async () => {
    const eventId = await creerEvent(4);
    const inviteId = await ajouterInvite(eventId, "Protégé");
    const intrus = testUsers[2];

    const { error } = await intrus.client.rpc("remove_participant", {
      p_event_id: eventId,
      p_registration_id: inviteId,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not_allowed/);

    // La ligne est toujours là.
    const { data } = await admin
      .from("event_participants")
      .select("*")
      .eq("event_id", eventId);
    expect(data).toHaveLength(1);
  });

  it("refuse de retirer deux fois la même inscription", async () => {
    const eventId = await creerEvent(4);
    const inviteId = await ajouterInvite(eventId, "Retiré une fois");
    const [u1] = testUsers;

    await u1.client.rpc("remove_participant", {
      p_event_id: eventId,
      p_registration_id: inviteId,
    });
    const { error } = await u1.client.rpc("remove_participant", {
      p_event_id: eventId,
      p_registration_id: inviteId,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not_registered/);
  });
});
