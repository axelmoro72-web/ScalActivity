"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";

type LieuProche = { label: string; km: number };

/**
 * Lieu de l'événement : saisie libre, complétée par des suggestions
 * d'OpenStreetMap servies par /api/lieux, de deux façons.
 *
 * - Tant que le champ est vide, les lieux proches où pratiquer le sport
 *   choisi sont proposés en boutons, du plus proche au plus loin.
 * - Dès qu'on tape, l'autocomplétion classique prend le relais.
 *
 * Le champ reste utilisable si le service ne répond pas : les suggestions
 * sont une aide, pas une contrainte (salle interne, point de rendez-vous
 * informel…).
 */
export function LocationField({
  defaultValue = "",
  sport = "",
}: {
  defaultValue?: string;
  sport?: string;
}) {
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [proches, setProches] = useState<LieuProche[]>([]);

  // Autocomplétion sur la saisie.
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
        const data = (await res.json()) as { suggestions?: string[] };
        setSuggestions(data.suggestions ?? []);
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

  // Lieux proches pour le sport choisi.
  useEffect(() => {
    const s = sport.trim();
    if (s.length < 3) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lieux?sport=${encodeURIComponent(s)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { lieux?: LieuProche[] };
        setProches(data.lieux ?? []);
      } catch {
        // Idem : pas de suggestion, pas de blocage.
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [sport]);

  // Filtré au rendu plutôt qu'en effet : vider la liste est une déduction
  // de la saisie, pas une synchronisation avec l'extérieur.
  const shown = value.trim().length < 3 ? [] : suggestions;
  const propositions = value.trim() === "" ? proches : [];

  return (
    <div className="flex flex-col gap-2">
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
      {propositions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] text-[var(--texte-3)]">
            {sport} près de Toulouse :
          </p>
          <div className="flex flex-wrap gap-1.5">
            {propositions.map((lieu) => (
              <button
                key={lieu.label}
                type="button"
                onClick={() => setValue(lieu.label)}
                title={lieu.label}
                className="grotesk max-w-full cursor-pointer truncate rounded-full bg-[var(--jauge)] px-3 py-1 text-[12px] font-medium text-[var(--vert)] transition-colors hover:bg-[var(--lime)]"
              >
                {lieu.label.split(",")[0]} · {lieu.km.toFixed(1)} km
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
