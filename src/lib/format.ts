/*
 * Toutes les heures de l'application sont exprimées en heure de Paris,
 * quel que soit le fuseau de l'appareil ou du serveur.
 *
 * Les instants restent stockés en UTC (timestamptz) ; Europe/Paris ne
 * concerne que la saisie et l'affichage. Sans cela, un formulaire rempli
 * « 19:00 » serait interprété dans le fuseau du serveur Vercel (UTC) et
 * l'événement tomberait à 21:00 heure de Paris en été.
 */
export const PARIS = "Europe/Paris";

/** Formatage d'un montant en centimes pour l'affichage (ex : 1250 → "12,50 €"). */
export function formatCents(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = Math.abs(cents % 100).toString().padStart(2, "0");
  return `${euros},${rest} €`;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: PARIS,
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** Initiales pour les avatars : "Sophie Laurent" → "SL", "axelmoro72" → "AX". */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  timeZone: PARIS,
});

/** Jour du mois sur deux chiffres : "06". */
export function dayOfMonth(iso: string): string {
  return dayFormatter.format(new Date(iso));
}

const monthFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "short",
  timeZone: PARIS,
});

/** Mois court sans point : "août" → "Août". */
export function monthShort(iso: string): string {
  const m = monthFormatter.format(new Date(iso)).replace(".", "");
  return m.charAt(0).toUpperCase() + m.slice(1);
}

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: PARIS,
});

/** "19:00" ou "19:00 – 20:30" si la fin est renseignée. */
export function timeRange(startIso: string, endIso: string | null): string {
  const start = timeFormatter.format(new Date(startIso));
  return endIso ? `${start} – ${timeFormatter.format(new Date(endIso))}` : start;
}

const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "long",
  timeZone: PARIS,
});

/** "inscrit·e lun. 3 août". */
export function registeredOn(iso: string): string {
  return shortDateFormatter.format(new Date(iso));
}

// Clé de jour parisienne ("2026-07-31") pour comparer deux instants.
const dayKeyFormatter = new Intl.DateTimeFormat("fr-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: PARIS,
});

/** Horodatage d'un message : "14:32" le jour même, "lun. 3 août 14:32" avant. */
export function messageStamp(iso: string): string {
  const date = new Date(iso);
  const time = timeFormatter.format(date);
  const sameDay =
    dayKeyFormatter.format(date) === dayKeyFormatter.format(new Date());
  return sameDay ? time : `${shortDateFormatter.format(date)} ${time}`;
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PARIS,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Champs de l'heure murale parisienne correspondant à un instant donné. */
function parisParts(date: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = parseInt(p.value, 10);
  }
  // hour12:false rend minuit "24" dans certaines implémentations.
  out.hour %= 24;
  return out;
}

/** Décalage de Paris par rapport à UTC, en millisecondes, à cet instant. */
function parisOffsetMs(date: Date): number {
  const p = parisParts(date);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    date.getTime()
  );
}

/**
 * Convertit la valeur d'un `<input type="datetime-local">` — une heure
 * murale parisienne, sans fuseau — en instant UTC.
 *
 * Deux passes : le décalage se lit à un instant, or on part d'une heure
 * murale. La seconde passe corrige les changements d'heure (le décalage
 * estimé et le décalage réel diffèrent aux abords des bascules).
 */
export function parisInputToDate(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const wallAsUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  if (Number.isNaN(wallAsUtc)) return null;

  const firstGuess = new Date(wallAsUtc - parisOffsetMs(new Date(wallAsUtc)));
  const corrected = new Date(wallAsUtc - parisOffsetMs(firstGuess));
  return corrected;
}

/**
 * Inverse : instant UTC → valeur d'un `<input type="datetime-local">`
 * en heure de Paris, pour préremplir le formulaire de modification.
 */
export function dateToParisInput(iso: string | null): string {
  if (!iso) return "";
  const p = parisParts(new Date(iso));
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
