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

/** Jour du mois sur deux chiffres : "06". */
export function dayOfMonth(iso: string): string {
  return new Date(iso).getDate().toString().padStart(2, "0");
}

const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });

/** Mois court sans point : "août" → "Août". */
export function monthShort(iso: string): string {
  const m = monthFormatter.format(new Date(iso)).replace(".", "");
  return m.charAt(0).toUpperCase() + m.slice(1);
}

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
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
});

/** "inscrit·e lun. 3 août". */
export function registeredOn(iso: string): string {
  return shortDateFormatter.format(new Date(iso));
}
