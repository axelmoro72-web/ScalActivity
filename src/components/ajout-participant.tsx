"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useMembers } from "@/lib/queries";
import { normaliserNom } from "@/lib/activites";
import { AvatarInitials } from "@/components/avatar-initials";

export type CibleAjout = { userId: string } | { guestName: string };

type Option =
  | { type: "membre"; id: string; nom: string }
  | { type: "invite"; nom: string };

/**
 * Ajout d'un participant : un seul champ qui propose les membres du site
 * (liste déroulante, filtrée à la frappe) et accepte aussi un nom libre
 * pour un invité sans compte.
 *
 * Un nom tapé qui correspond exactement à un membre est rattaché à ce
 * membre : sinon ses points partiraient sur un profil d'invité distinct.
 */
export function AjoutParticipant({
  dejaInscrits,
  pending,
  aide,
  onAdd,
}: {
  /** user_id des membres déjà inscrits, retirés de la liste. */
  dejaInscrits: string[];
  pending: boolean;
  aide: string;
  /** Renvoie true si l'ajout a réussi (le champ se vide alors). */
  onAdd: (cible: CibleAjout) => Promise<boolean>;
}) {
  const { data: membres } = useMembers();
  const [texte, setTexte] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const listeId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const saisie = normaliserNom(texte);
  const options = useMemo<Option[]>(() => {
    const dispo = (membres ?? []).filter((m) => !dejaInscrits.includes(m.id));
    const trouves = dispo
      .filter((m) => normaliserNom(m.display_name).includes(saisie))
      .slice(0, 8)
      .map((m) => ({ type: "membre" as const, id: m.id, nom: m.display_name }));
    const exact = (membres ?? []).some(
      (m) => normaliserNom(m.display_name) === saisie,
    );
    return saisie && !exact
      ? [...trouves, { type: "invite" as const, nom: texte.trim().replace(/\s+/g, " ") }]
      : trouves;
  }, [membres, dejaInscrits, saisie, texte]);

  async function choisir(o: Option | undefined) {
    if (!o || pending) return;
    const ok = await onAdd(
      o.type === "membre" ? { userId: o.id } : { guestName: o.nom },
    );
    if (ok) {
      setTexte("");
      setActif(0);
      setOuvert(false);
    }
  }

  /** Entrée sans option surlignée : membre au nom exact, sinon invité. */
  function valider() {
    const exact = (membres ?? []).find(
      (m) => normaliserNom(m.display_name) === saisie,
    );
    // Même déjà inscrit : le serveur répondra « déjà inscrit·e » plutôt
    // que de créer un invité homonyme.
    if (exact) {
      return choisir({ type: "membre", id: exact.id, nom: exact.display_name });
    }
    if (ouvert && options[actif]) return choisir(options[actif]);
    if (saisie) return choisir({ type: "invite", nom: texte.trim() });
  }

  return (
    <div className="mt-3.5 border-t border-[var(--border)] pt-3.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          valider();
        }}
        className="flex flex-wrap items-center gap-2.5"
      >
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value);
              setActif(0);
              setOuvert(true);
            }}
            onFocus={() => setOuvert(true)}
            onBlur={() => setOuvert(false)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOuvert(true);
                setActif((i) => Math.min(i + 1, options.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActif((i) => Math.max(i - 1, 0));
              } else if (e.key === "Escape") {
                setOuvert(false);
              }
            }}
            maxLength={60}
            placeholder="Ajouter un membre ou un invité (Prénom Nom)"
            aria-label="Participant à ajouter"
            role="combobox"
            aria-expanded={ouvert && options.length > 0}
            aria-controls={listeId}
            aria-autocomplete="list"
            className="h-9 w-full rounded-lg border border-[var(--input)] bg-transparent px-2.5 text-base outline-none focus-visible:border-[var(--vert)] md:text-sm"
          />
          {ouvert && options.length > 0 && (
            <ul
              id={listeId}
              role="listbox"
              className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-[12px] border border-[var(--border)] bg-popover p-1 shadow-lg"
            >
              {options.map((o, i) => (
                <li
                  key={o.type === "membre" ? o.id : "__invite__"}
                  role="option"
                  aria-selected={i === actif}
                  // mousedown et non click : le blur de l'input fermerait
                  // la liste avant que le clic n'arrive.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choisir(o);
                  }}
                  onMouseEnter={() => setActif(i)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-sm ${
                    i === actif ? "bg-[var(--lime-fond)]" : ""
                  }`}
                >
                  {o.type === "membre" ? (
                    <>
                      <AvatarInitials name={o.nom} size={24} />
                      <span className="truncate">{o.nom}</span>
                    </>
                  ) : (
                    <>
                      <span className="grotesk flex h-6 w-6 flex-none items-center justify-center rounded-full border border-dashed border-[var(--input)] text-xs text-[var(--texte-3)]">
                        +
                      </span>
                      <span className="truncate">
                        Ajouter « {o.nom} » comme invité·e
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          disabled={texte.trim().length === 0 || pending}
          className="grotesk h-9 flex-none cursor-pointer rounded-full bg-[var(--vert)] px-4 text-[13px] font-bold text-[var(--header-texte)] transition-colors hover:bg-[var(--vert-hover)] disabled:opacity-50"
        >
          {pending ? "Ajout…" : "Ajouter"}
        </button>
      </form>
      <p className="mt-2 text-xs text-[var(--texte-3)]">{aide}</p>
    </div>
  );
}
