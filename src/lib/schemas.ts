import { z } from "zod";
import { parisInputToDate } from "@/lib/format";

// Schémas partagés client/serveur. Toute entrée utilisateur repasse par
// ces schémas côté serveur, la validation client n'est que du confort.

export const loginSchema = z.object({
  email: z.email("Adresse email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

/** Le site est réservé aux collègues : une adresse professionnelle identifie le titulaire du compte. */
export const DOMAINE_AUTORISE = "@scalian.com";

export const signupSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Nom trop court")
    .max(60, "Nom trop long (60 caractères maximum)"),
  email: z
    .email("Adresse email invalide")
    .refine((v) => v.toLowerCase().endsWith(DOMAINE_AUTORISE), {
      message: `Utilisez votre adresse professionnelle ${DOMAINE_AUTORISE}`,
    }),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum"),
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

/**
 * Date saisie dans un `<input type="datetime-local">` : une heure murale
 * sans fuseau, toujours interprétée en heure de Paris. Sans cela, le
 * serveur (UTC sur Vercel) la lirait dans son propre fuseau.
 */
function parisDateTime(label: string) {
  return z.string().transform((v, ctx) => {
    const d = parisInputToDate(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: label });
      return z.NEVER;
    }
    return d;
  });
}

/**
 * Le coût peut être saisi comme un total à partager ou comme un prix par
 * personne : selon l'activité, c'est l'un ou l'autre qui est connu.
 * La conversion se fait ici, à l'entrée.
 */
export const COST_MODES = ["total", "per_person"] as const;
export type CostMode = (typeof COST_MODES)[number];

// total_cost_cents est un int4. En mode « prix par personne » le montant
// est multiplié par la capacité (jusqu'à 100) : sans ce plafond, une
// saisie élevée déborderait l'entier et Postgres refuserait la ligne.
const TOTAL_MAX_CENTS = 99_999_999;

const eventFieldsSchema = z.object({
  title: z.string().trim().min(1, "Titre requis").max(200),
  sport: z.string().trim().min(1, "Sport requis").max(100),
  description: z
    .string()
    .trim()
    .max(2000, "Description trop longue (2000 caractères maximum)")
    .transform((v) => (v === "" ? null : v)),
  location: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v)),
  startsAt: parisDateTime("Date de début invalide"),
  endsAt: z.union([
    z.literal("").transform(() => null),
    parisDateTime("Date de fin invalide"),
  ]),
  capacity: z.coerce
    .number({ error: "Nombre de places invalide" })
    .int("Nombre de places entier requis")
    .min(1, "Au moins une place")
    .max(100, "100 places maximum"),
  // Forme du montant saisi. Absent d'un formulaire plus ancien encore en
  // cache : on retombe sur le coût total, l'ancien comportement.
  costMode: z.enum(COST_MODES).catch("total"),
  cost: euroAmountToCents,
})
  .transform((v) => ({
    ...v,
    // Une seule forme est stockée : le prix par personne reste dérivé
    // par la vue event_summary.
    totalCost: v.costMode === "per_person" ? v.cost * v.capacity : v.cost,
  }))
  .refine((v) => v.totalCost <= TOTAL_MAX_CENTS, {
    message: "Coût total trop élevé (999 999,99 € maximum)",
    path: ["cost"],
  });

const endsAfterStarts = (v: { startsAt: Date; endsAt: Date | null }) =>
  v.endsAt === null || v.endsAt > v.startsAt;

const endsAfterStartsError = {
  message: "La fin doit être après le début",
  path: ["endsAt"],
};

export const createEventSchema = eventFieldsSchema
  .refine((v) => v.startsAt.getTime() > Date.now(), {
    message: "L'événement doit être dans le futur",
    path: ["startsAt"],
  })
  .refine(endsAfterStarts, endsAfterStartsError);

export type CreateEventInput = z.input<typeof createEventSchema>;
export type CreateEventParsed = z.output<typeof createEventSchema>;

// Modification : mêmes règles que la création, sauf la date de début qui
// peut rester dans le passé (on corrige une coquille sur un événement déjà
// commencé sans être forcé de le redater).
export const updateEventSchema = eventFieldsSchema.refine(
  endsAfterStarts,
  endsAfterStartsError,
);

export const eventIdSchema = z.uuid("Identifiant d'événement invalide");

// Invité ajouté à la main. La borne de 60 caractères double la contrainte
// CHECK de la table ; le message d'erreur est plus clair ici.
export const guestNameSchema = z
  .string()
  .trim()
  .min(1, "Nom requis")
  .max(60, "Nom trop long (60 caractères maximum)");

export const registrationIdSchema = z.coerce
  .number({ error: "Inscription invalide" })
  .int("Inscription invalide")
  .positive("Inscription invalide");

// Fil de discussion. La limite de 2000 caractères double la contrainte
// CHECK de la table : le message d'erreur est plus clair ici.
export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Message vide")
  .max(2000, "Message trop long (2000 caractères maximum)");

export const messageIdSchema = z.coerce
  .number({ error: "Message invalide" })
  .int("Message invalide")
  .positive("Message invalide");
