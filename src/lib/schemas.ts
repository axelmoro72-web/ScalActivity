import { z } from "zod";

// Schémas partagés client/serveur. Toute entrée utilisateur repasse par
// ces schémas côté serveur, la validation client n'est que du confort.

export const loginSchema = z.object({
  email: z.email("Adresse email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export const inviteSchema = z.object({
  email: z.email("Adresse email invalide"),
});

export const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Le mot de passe doit faire au moins 8 caractères"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Les deux mots de passe ne correspondent pas",
    path: ["confirm"],
  });

/**
 * Montant saisi en euros ("12", "12.50", "12,50") converti en centimes
 * par arithmétique entière — jamais de float sur de la monnaie.
 */
export const euroAmountToCents = z
  .string()
  .trim()
  .regex(/^\d{1,6}([.,]\d{1,2})?$/, "Montant invalide (ex : 12,50)")
  .transform((raw) => {
    const [euros, decimals = ""] = raw.replace(",", ".").split(".");
    return parseInt(euros, 10) * 100 + parseInt(decimals.padEnd(2, "0") || "0", 10);
  });

export const createEventSchema = z
  .object({
    title: z.string().trim().min(1, "Titre requis").max(200),
    sport: z.string().trim().min(1, "Sport requis").max(100),
    location: z
      .string()
      .trim()
      .max(200)
      .transform((v) => (v === "" ? null : v)),
    startsAt: z.coerce
      .date({ error: "Date de début invalide" })
      .refine((d) => d.getTime() > Date.now(), {
        message: "L'événement doit être dans le futur",
      }),
    endsAt: z
      .union([z.literal(""), z.coerce.date({ error: "Date de fin invalide" })])
      .transform((v) => (v === "" ? null : v)),
    capacity: z.coerce
      .number({ error: "Nombre de places invalide" })
      .int("Nombre de places entier requis")
      .min(1, "Au moins une place")
      .max(100, "100 places maximum"),
    totalCost: euroAmountToCents,
  })
  .refine((v) => v.endsAt === null || v.endsAt > v.startsAt, {
    message: "La fin doit être après le début",
    path: ["endsAt"],
  });

export type CreateEventInput = z.input<typeof createEventSchema>;
export type CreateEventParsed = z.output<typeof createEventSchema>;

/** Formatage d'un montant en centimes pour l'affichage (ex : 1250 → "12,50 €"). */
export function formatCents(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = Math.abs(cents % 100).toString().padStart(2, "0");
  return `${euros},${rest} €`;
}
