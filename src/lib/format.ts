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
