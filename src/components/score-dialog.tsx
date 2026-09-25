"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { saveResult } from "@/app/events/actions";
import type { ModeScore } from "@/lib/activites";
import { cleJoueur, type Resultat } from "@/lib/classement";
import { jourMois } from "@/lib/format";
import {
  ajouterSet,
  bilanSets,
  erreurEquipes,
  erreurSet,
  formatRang,
  issueMatch,
  rangsPeche,
  supprimerSet,
  type Equipe,
  type SetScore,
} from "@/lib/resultats";
import type { EventParticipant, ResultPlayerInput } from "@/lib/database.types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Saisie en cours d'un set : des chaînes, pour laisser un champ vide. */
type SetBrouillon = {
  a: string;
  b: string;
  tb: [string, string] | null;
  interrompu: boolean;
};

const SET_VIDE: SetBrouillon = { a: "", b: "", tb: null, interrompu: false };

function versNombre(v: string): number {
  return v.trim() === "" ? NaN : Number(v);
}

function versSet(s: SetBrouillon): SetScore {
  return {
    a: versNombre(s.a),
    b: versNombre(s.b),
    tb: s.tb ? [versNombre(s.tb[0]), versNombre(s.tb[1])] : null,
    interrompu: s.interrompu,
  };
}

function versBrouillon(s: SetScore): SetBrouillon {
  return {
    a: String(s.a),
    b: String(s.b),
    tb: s.tb ? [String(s.tb[0]), String(s.tb[1])] : null,
    interrompu: !!s.interrompu,
  };
}

function cleParticipant(p: EventParticipant): string {
  return cleJoueur({
    user_id: p.user_id,
    guest_name: p.is_guest ? p.display_name : null,
  });
}

/** Équipes proposées d'office : 2 inscrits → 1v1, 4 → 2v2 dans l'ordre d'inscription. */
function equipesInitiales(
  participants: EventParticipant[],
  existant: Resultat | undefined,
): Record<string, Equipe | null> {
  const out: Record<string, Equipe | null> = {};
  const n = participants.length;
  participants.forEach((p, i) => {
    const cle = cleParticipant(p);
    if (existant) {
      out[cle] = existant.joueurs.find((j) => j.cle === cle)?.team ?? null;
    } else if (n === 2 || n === 4) {
      out[cle] = i < n / 2 ? "A" : "B";
    } else {
      out[cle] = null;
    }
  });
  return out;
}

const champ =
  "h-10 w-12 rounded-[10px] border-[1.5px] border-[var(--input)] bg-[var(--fond-input)] text-center text-base font-semibold outline-none focus-visible:border-[var(--vert)] aria-invalid:border-[var(--rouge)] md:text-sm";

export function Tracabilite({ r }: { r: Resultat }) {
  return (
    <p className="text-xs text-[var(--texte-3)]">
      Saisi par {r.saisi_par ?? "?"} le {jourMois(r.saisi_le)}
      {r.modifie_le &&
        ` · modifié par ${r.modifie_par ?? "?"} le ${jourMois(r.modifie_le)}`}
    </p>
  );
}

// ---------- raquette ----------

function SaisieRaquette({
  participants,
  existant,
  onSubmit,
  pending,
}: {
  participants: EventParticipant[];
  existant: Resultat | undefined;
  onSubmit: (sets: SetScore[], players: ResultPlayerInput[]) => void;
  pending: boolean;
}) {
  const [equipes, setEquipes] = useState(() =>
    equipesInitiales(participants, existant),
  );
  const [sets, setSets] = useState<SetBrouillon[]>(() =>
    existant?.sets.length ? existant.sets.map(versBrouillon) : [SET_VIDE],
  );
  const [tente, setTente] = useState(false);
  const premierChamp = useRef<(HTMLInputElement | null)[]>([]);
  const focusSet = useRef<number | null>(null);

  // « + Set » place le curseur dans le premier champ de la nouvelle colonne.
  useEffect(() => {
    if (focusSet.current === null) return;
    const input = premierChamp.current[focusSet.current];
    input?.focus();
    input?.scrollIntoView({ block: "nearest", inline: "nearest" });
    focusSet.current = null;
  }, [sets.length]);

  const membres = (e: Equipe) =>
    participants.filter((p) => equipes[cleParticipant(p)] === e);
  const equipeA = membres("A");
  const equipeB = membres("B");
  const erreurEquipe = erreurEquipes(
    equipeA.map(cleParticipant),
    equipeB.map(cleParticipant),
  );

  const scores = sets.map(versSet);
  const erreurs = scores.map((s, i) => {
    const brouillon = sets[i];
    const rempli = brouillon.a !== "" && brouillon.b !== "";
    return rempli || tente ? erreurSet(s) : null;
  });
  const valides = scores.filter((s) => !erreurSet(s));
  const bilan = bilanSets(valides);
  const issue = issueMatch(valides);

  const maj = (i: number, patch: Partial<SetBrouillon>) =>
    setSets((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const nomEquipe = (e: Equipe) => {
    const m = e === "A" ? equipeA : equipeB;
    return m.length ? m.map((p) => p.display_name).join(" · ") : "—";
  };

  function envoyer() {
    setTente(true);
    if (erreurEquipe || scores.some((s) => erreurSet(s))) return;
    onSubmit(
      scores,
      [...equipeA, ...equipeB].map((p) => ({
        user_id: p.user_id,
        guest_name: p.is_guest ? p.display_name : null,
        team: equipes[cleParticipant(p)],
        catches: null,
      })),
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Composition des équipes */}
      <div>
        <div className="grotesk mb-2 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-[var(--texte-3)]">
          Équipes
        </div>
        <div className="flex flex-col gap-1">
          {participants.map((p) => {
            const cle = cleParticipant(p);
            return (
              <div key={p.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {p.display_name}
                </span>
                <div
                  role="radiogroup"
                  aria-label={`Équipe de ${p.display_name}`}
                  className="flex rounded-full bg-[var(--jauge)] p-0.5"
                >
                  {(["A", "B", null] as const).map((e) => (
                    <button
                      key={e ?? "aucune"}
                      type="button"
                      role="radio"
                      aria-checked={equipes[cle] === e}
                      onClick={() => setEquipes((prev) => ({ ...prev, [cle]: e }))}
                      className={`grotesk h-7 min-w-9 cursor-pointer rounded-full px-2.5 text-xs font-bold transition-colors ${
                        equipes[cle] === e
                          ? e
                            ? "bg-[var(--vert)] text-[var(--lime)]"
                            : "bg-card text-[var(--texte-2)]"
                          : "text-[var(--texte-2)] hover:text-[var(--vert)]"
                      }`}
                    >
                      {e ?? "—"}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {tente && erreurEquipe && (
          <p className="mt-1.5 text-xs text-[var(--rouge)]">{erreurEquipe}</p>
        )}
      </div>

      {/* Scoreboard : une ligne par équipe, une colonne par set */}
      <div className="flex items-start gap-2">
        <div className="flex flex-none flex-col">
          <div className="h-8" />
          {(["A", "B"] as const).map((e) => (
            <div key={e} className="flex h-12 max-w-[120px] flex-col justify-center sm:max-w-[180px]">
              <span className="grotesk text-sm font-bold">Équipe {e}</span>
              <span className="truncate text-xs text-[var(--texte-2)]">
                {nomEquipe(e)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-initial gap-1.5 overflow-x-auto pb-1">
          {sets.map((s, i) => {
            const score = scores[i];
            const septSix =
              !s.interrompu &&
              Math.max(score.a, score.b) === 7 &&
              Math.min(score.a, score.b) === 6;
            const dernier = i === sets.length - 1;
            return (
              <div key={i} className="group/set flex w-[76px] flex-none flex-col items-center">
                <div className="flex h-8 items-center gap-1">
                  <span className="grotesk text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--texte-3)]">
                    Set {i + 1}
                  </span>
                  {i > 0 && (
                    <button
                      type="button"
                      aria-label={`Supprimer le set ${i + 1}`}
                      onClick={() => setSets((prev) => supprimerSet(prev, i))}
                      className="cursor-pointer text-[var(--texte-3)] transition-opacity hover:text-[var(--rouge)] focus-visible:opacity-100 md:opacity-0 md:group-hover/set:opacity-100"
                    >
                      <Trash2Icon className="size-3.5" />
                    </button>
                  )}
                </div>
                {(["a", "b"] as const).map((cote, k) => (
                  <div key={cote} className="flex h-12 items-center">
                    <input
                      ref={k === 0 ? (el) => { premierChamp.current[i] = el; } : undefined}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      value={s[cote]}
                      aria-label={`Set ${i + 1}, équipe ${cote.toUpperCase()}`}
                      aria-invalid={!!erreurs[i]}
                      onChange={(e) => {
                        const v = e.target.value;
                        const next = { ...s, [cote]: v };
                        const ns = versSet(next);
                        // Le tie-break n'a plus de sens si le set n'est plus à 7-6.
                        const garderTb =
                          Math.max(ns.a, ns.b) === 7 && Math.min(ns.a, ns.b) === 6;
                        maj(i, { [cote]: v, tb: garderTb ? s.tb : null });
                      }}
                      className={champ}
                    />
                  </div>
                ))}
                {septSix &&
                  (s.tb ? (
                    <div className="mt-1 flex items-center gap-0.5">
                      <span className="text-[10px] font-semibold text-[var(--texte-3)]">TB</span>
                      {[0, 1].map((k) => (
                        <input
                          key={k}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={s.tb![k]}
                          aria-label={`Tie-break set ${i + 1}, équipe ${k === 0 ? "A" : "B"}`}
                          onChange={(e) => {
                            const tb = [...s.tb!] as [string, string];
                            tb[k] = e.target.value;
                            maj(i, { tb });
                          }}
                          className="h-7 w-7 rounded-md border border-[var(--input)] bg-[var(--fond-input)] text-center text-xs outline-none focus-visible:border-[var(--vert)]"
                        />
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => maj(i, { tb: ["", ""] })}
                      className="grotesk mt-1 cursor-pointer text-[11px] font-semibold text-[var(--lime-texte)] hover:underline"
                    >
                      + TB
                    </button>
                  ))}
                {dernier && (
                  <label className="mt-1.5 flex cursor-pointer items-start gap-1 text-[10.5px] leading-tight text-[var(--texte-2)]">
                    <input
                      type="checkbox"
                      checked={s.interrompu}
                      onChange={(e) =>
                        maj(i, { interrompu: e.target.checked, tb: null })
                      }
                      className="mt-px accent-[var(--vert)]"
                    />
                    Set interrompu (fin du temps)
                  </label>
                )}
                {erreurs[i] && (
                  <p className="mt-1 text-center text-[10.5px] leading-tight text-[var(--rouge)]">
                    {erreurs[i]}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Hors de la zone défilante : reste visible sur mobile. */}
        <button
          type="button"
          onClick={() => {
            focusSet.current = sets.length;
            setSets((prev) => ajouterSet(prev, SET_VIDE));
          }}
          className="grotesk mt-8 flex h-[92px] w-14 flex-none cursor-pointer items-center justify-center rounded-[12px] border-2 border-dashed border-[var(--lime)] text-xs font-bold text-[var(--lime-texte)] transition-colors hover:bg-[var(--lime-fond)]"
        >
          + Set
        </button>
      </div>

      {/* Bandeau en direct */}
      <div className="grotesk rounded-[12px] bg-[var(--vert)] px-4 py-2.5 text-sm font-semibold text-[var(--header-texte)]">
        Sets : {bilan.setsA} – {bilan.setsB} ·{" "}
        {issue === "nul" ? (
          <span>🤝 Match nul</span>
        ) : (
          <span className="text-[var(--lime)]">🏆 Équipe {issue} gagne</span>
        )}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={envoyer}
        className="grotesk h-10 cursor-pointer rounded-full bg-[var(--lime)] px-6 text-sm font-bold text-[var(--vert)] transition-colors hover:bg-[var(--lime-hover)] disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : "Enregistrer le score"}
      </button>
    </div>
  );
}

// ---------- pêche ----------

function SaisiePeche({
  participants,
  existant,
  onSubmit,
  pending,
}: {
  participants: EventParticipant[];
  existant: Resultat | undefined;
  onSubmit: (sets: SetScore[], players: ResultPlayerInput[]) => void;
  pending: boolean;
}) {
  const [prises, setPrises] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const p of participants) {
      const cle = cleParticipant(p);
      const j = existant?.joueurs.find((x) => x.cle === cle);
      out[cle] = j?.prises != null ? String(j.prises) : "";
    }
    return out;
  });
  const [erreur, setErreur] = useState<string | null>(null);

  const rangs = useMemo(() => {
    const saisis = participants
      .map((p) => ({ cle: cleParticipant(p), prises: versNombre(prises[cleParticipant(p)]) }))
      .filter((x) => Number.isInteger(x.prises) && x.prises >= 0);
    return new Map(rangsPeche(saisis).map((x) => [x.cle, x.rang]));
  }, [participants, prises]);

  function envoyer() {
    const saisis = participants.filter((p) => prises[cleParticipant(p)].trim() !== "");
    if (saisis.length === 0) {
      setErreur("Saisissez les prises d'au moins un participant.");
      return;
    }
    const invalide = saisis.find((p) => {
      const n = versNombre(prises[cleParticipant(p)]);
      return !Number.isInteger(n) || n < 0;
    });
    if (invalide) {
      setErreur(`${invalide.display_name} : nombre entier positif ou nul attendu.`);
      return;
    }
    setErreur(null);
    onSubmit(
      [],
      saisis.map((p) => ({
        user_id: p.user_id,
        guest_name: p.is_guest ? p.display_name : null,
        team: null,
        catches: versNombre(prises[cleParticipant(p)]),
      })),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--texte-3)]">
        Nombre de poissons pêchés par chacun. Laissez vide pour quelqu&apos;un
        qui n&apos;a finalement pas pêché.
      </p>
      <div className="flex flex-col gap-1">
        {participants.map((p) => {
          const cle = cleParticipant(p);
          const rang = rangs.get(cle);
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-[10px] px-1 py-1">
              <span className="min-w-0 flex-1 truncate text-sm">{p.display_name}</span>
              {rang !== undefined && (
                <span
                  className={`grotesk rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    rang <= 3
                      ? "bg-[var(--lime-pale)] text-[var(--lime-texte)]"
                      : "text-[var(--texte-3)]"
                  }`}
                >
                  {formatRang(rang)}
                </span>
              )}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={prises[cle]}
                aria-label={`Poissons pêchés par ${p.display_name}`}
                onChange={(e) =>
                  setPrises((prev) => ({ ...prev, [cle]: e.target.value }))
                }
                className={champ}
              />
              <span className="w-4 text-sm">🐟</span>
            </div>
          );
        })}
      </div>
      {erreur && <p className="text-xs text-[var(--rouge)]">{erreur}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={envoyer}
        className="grotesk h-10 cursor-pointer rounded-full bg-[var(--lime)] px-6 text-sm font-bold text-[var(--vert)] transition-colors hover:bg-[var(--lime-hover)] disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : "Enregistrer les prises"}
      </button>
    </div>
  );
}

// ---------- modale ----------

/**
 * Bouton « Saisir le score » / « Modifier le score » et sa modale. À
 * n'afficher qu'aux participants confirmés d'une activité classée
 * terminée : l'action serveur et la base refusent tous les autres.
 */
export function ScoreDialog({
  eventId,
  titre,
  mode,
  participants,
  existant,
  className,
}: {
  eventId: string;
  titre: string;
  mode: ModeScore;
  /** Participants confirmés. */
  participants: EventParticipant[];
  existant: Resultat | undefined;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (v: { sets: SetScore[]; players: ResultPlayerInput[] }) =>
      saveResult({ eventId, ...v }),
    onSuccess: (state) => {
      if (state?.ok) {
        toast.success(state.message);
        setOpen(false);
      } else {
        toast.error(state?.message ?? "Une erreur est survenue.");
      }
      queryClient.invalidateQueries({ queryKey: ["resultats"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
  const onSubmit = (sets: SetScore[], players: ResultPlayerInput[]) =>
    mutation.mutate({ sets, players });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            onClick={(e) => e.stopPropagation()}
            className={
              className ??
              `grotesk h-[34px] cursor-pointer rounded-full px-4 text-[13px] font-bold transition-colors ${
                existant
                  ? "border-[1.5px] border-[var(--vert)] bg-transparent text-[var(--vert)] hover:bg-[var(--accent)]"
                  : "bg-[var(--lime)] text-[var(--vert)] hover:bg-[var(--lime-hover)]"
              }`
            }
          >
            {existant ? "Modifier le score" : "Saisir le score"}
          </button>
        }
      />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="grotesk text-lg">
            {existant ? "Modifier le score" : "Saisir le score"}
          </DialogTitle>
          <DialogDescription>{titre}</DialogDescription>
          {existant && <Tracabilite r={existant} />}
        </DialogHeader>
        {participants.length === 0 ? (
          <p className="text-sm text-[var(--texte-2)]">Aucun participant confirmé.</p>
        ) : mode === "raquette_sets" ? (
          <SaisieRaquette
            participants={participants}
            existant={existant}
            onSubmit={onSubmit}
            pending={mutation.isPending}
          />
        ) : (
          <SaisiePeche
            participants={participants}
            existant={existant}
            onSubmit={onSubmit}
            pending={mutation.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

