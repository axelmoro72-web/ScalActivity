"use client";

import { useEffect, useState } from "react";

/**
 * Lien vers le lieu d'un événement, pour réserver ou consulter les
 * disponibilités : le site officiel du club quand OpenStreetMap le
 * connaît, sinon sa fiche Google Maps (horaires, téléphone, réservation).
 *
 * Résolu à l'affichage plutôt que stocké avec l'événement : le lieu est
 * un texte libre, et une adresse peut être saisie à la main.
 */
export function LienLieu({ lieu }: { lieu: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/lieux?lieu=${encodeURIComponent(lieu)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { url?: string };
        // Défense en profondeur : seul un lien web est rendu cliquable.
        setUrl(data.url && /^https?:\/\//i.test(data.url) ? data.url : null);
      } catch {
        // Pas de lien : le lieu reste affiché en texte.
      }
    })();
    return () => controller.abort();
  }, [lieu]);

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="grotesk mt-2 inline-flex h-9 items-center rounded-full bg-[color-mix(in_srgb,var(--lime)_16%,transparent)] px-4 text-[13px] font-semibold text-[var(--lime)] transition-colors hover:bg-[color-mix(in_srgb,var(--lime)_26%,transparent)]"
    >
      Réserver ou voir les disponibilités ↗
    </a>
  );
}
