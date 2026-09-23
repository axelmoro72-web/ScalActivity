"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Lieu de l'événement : saisie libre, complétée par des suggestions
 * d'OpenStreetMap servies par /api/lieux. Le champ reste utilisable si le
 * service ne répond pas — les suggestions sont une aide, pas une
 * contrainte (une salle interne, un point de rendez-vous informel…).
 */
export function LocationField({ defaultValue = "" }: { defaultValue?: string }) {
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const q = value.trim();
    // Trop court, ou suggestion retenue telle quelle : pas de recherche.
    if (q.length < 3 || suggestions.includes(q)) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lieux?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: string[] };
        setSuggestions(data.suggestions);
      } catch {
        // Requête annulée ou réseau indisponible : on laisse la saisie libre.
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `suggestions` ne sert qu'à éviter une relance inutile : le relire ici
    // rouvrirait une requête à chaque réponse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Filtré au rendu plutôt qu'en effet : vider la liste est une déduction
  // de la saisie, pas une synchronisation avec l'extérieur.
  const shown = value.trim().length < 3 ? [] : suggestions;

  return (
    <>
      <Input
        name="location"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        list={listId}
        autoComplete="off"
        maxLength={200}
        placeholder="4Padel Toulouse, Le Smile…"
      />
      <datalist id={listId}>
        {shown.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
