"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCurrentProfile, useResultats } from "@/lib/queries";
import { ACTIVITES, POINTS, activite } from "@/lib/activites";
import {
  classementPeche,
  classementRaquette,
  filtrerResultats,
  lienJoueur,
  type Periode,
} from "@/lib/classement";
import { AvatarInitials } from "@/components/avatar-initials";

const PERIODES: { cle: Periode; libelle: string }[] = [
  { cle: "saison", libelle: "Saison" },
  { cle: "mois", libelle: "Ce mois" },
  { cle: "tout", libelle: "Tout" },
];

function Pastilles<T extends string | null>({
  options,
  valeur,
  onChange,
  label,
}: {
  options: { cle: T; libelle: string }[];
  valeur: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--border)] bg-card p-1"
    >
      {options.map((o) => (
        <button
          key={o.cle ?? "toutes"}
          type="button"
          role="radio"
          aria-checked={valeur === o.cle}
          onClick={() => onChange(o.cle)}
          className={`grotesk h-8 flex-none cursor-pointer rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
            valeur === o.cle
              ? "bg-[var(--vert)] text-[var(--lime)]"
              : "text-[var(--texte-2)] hover:text-[var(--vert)]"
          }`}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}

/** Rang : le podium en couleur, le reste en simple chiffre. */
function Rang({ rang }: { rang: number }) {
  const style =
    rang === 1
      ? "bg-[var(--vert)] text-[var(--lime)]"
      : rang <= 3
        ? "bg-[var(--lime)] text-[var(--vert)]"
        : "text-[var(--texte-3)]";
  return (
    <span
      className={`grotesk inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${style}`}
    >
      {rang}
    </span>
  );
}

function CelluleNom({
  ligne,
  moi,
}: {
  ligne: { user_id: string | null; nom: string; rang: number };
  moi: boolean;
}) {
  return (
    <Link
      href={lienJoueur({ user_id: ligne.user_id, nom: ligne.nom })}
      className="flex min-w-0 items-center gap-2.5 hover:underline"
    >
      <AvatarInitials name={ligne.nom} highlight={moi} size={28} />
      <span
        className={`truncate text-sm ${ligne.rang <= 3 || moi ? "grotesk font-semibold" : ""}`}
      >
        {ligne.nom}
        {moi && (
          <span className="grotesk ml-1 text-xs font-medium text-[var(--lime-texte)]">
            (vous)
          </span>
        )}
        {!ligne.user_id && (
          <span className="grotesk ml-1.5 rounded-full border border-[var(--input)] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em] uppercase text-[var(--texte-3)]">
            invité·e
          </span>
        )}
      </span>
    </Link>
  );
}

const th =
  "grotesk px-2 py-2 text-left text-[10.5px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase text-[var(--texte-3)]";
const td = "px-2 py-2 text-sm whitespace-nowrap tabular-nums";

function Carte({
  titre,
  bareme,
  children,
}: {
  titre: string;
  bareme: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-[var(--border)] bg-card px-3 py-4 sm:px-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-2 sm:px-0">
        <h2 className="grotesk text-[15px] font-semibold">{titre}</h2>
        <span className="text-xs text-[var(--texte-3)]">{bareme}</span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export default function ClassementPage() {
  const { data: resultats, isPending, error } = useResultats();
  const { data: me } = useCurrentProfile();
  const [sport, setSport] = useState<string | null>(null);
  const [periode, setPeriode] = useState<Periode>("saison");
  const [now] = useState(() => new Date());

  const filtres = useMemo(
    () => filtrerResultats(resultats ?? [], { sport, periode, now }),
    [resultats, sport, periode, now],
  );
  const raquette = useMemo(() => classementRaquette(filtres), [filtres]);
  const peche = useMemo(() => classementPeche(filtres), [filtres]);

  const mode = sport ? activite(sport)?.mode : null;
  const voirRaquette = !sport || mode === "raquette_sets";
  const voirPeche = !sport || mode === "peche_prises";

  const activites = [
    { cle: null, libelle: "Toutes" },
    ...ACTIVITES.filter((a) => a.ranked).map((a) => ({
      cle: a.nom as string | null,
      libelle: a.nom,
    })),
  ];
  const b = POINTS.raquette_sets;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-7 sm:px-6">
      <h1 className="grotesk text-3xl leading-tight font-bold tracking-[-0.03em]">
        Classement
      </h1>
      <p className="mt-1 text-[13px] text-[var(--texte-2)]">
        Points recalculés à partir de tous les résultats saisis.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Pastilles label="Activité" options={activites} valeur={sport} onChange={setSport} />
        <Pastilles label="Période" options={PERIODES} valeur={periode} onChange={setPeriode} />
      </div>

      {isPending && <p className="mt-5 text-[var(--texte-2)]">Chargement…</p>}
      {error && (
        <p className="mt-5 text-destructive">Impossible de charger le classement.</p>
      )}

      {resultats && voirRaquette && (
        <Carte
          titre="Raquette"
          bareme={`Victoire ${b.victoire} pts · nul ${b.nul} · défaite ${b.defaite}`}
        >
          {raquette.length === 0 ? (
            <p className="px-2 py-3 text-sm text-[var(--texte-2)]">
              Aucun match sur cette période.
            </p>
          ) : (
            <table className="w-full min-w-[560px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={th}>#</th>
                  <th className={th}>Joueur</th>
                  <th className={`${th} text-right`}>Pts</th>
                  <th className={`${th} text-right`}>Joués</th>
                  <th className={`${th} text-center`}>V / N / D</th>
                  <th className={`${th} text-right`}>% V</th>
                  <th className={`${th} text-right`}>Sets G/P</th>
                </tr>
              </thead>
              <tbody>
                {raquette.map((l) => {
                  const moi = !!me && l.user_id === me.id;
                  return (
                    <tr
                      key={l.cle}
                      className={moi ? "bg-[var(--lime-fond)]" : l.rang <= 3 ? "bg-background/60" : ""}
                    >
                      <td className={`${td} rounded-l-[10px]`}>
                        <Rang rang={l.rang} />
                      </td>
                      <td className={`${td} max-w-[220px]`}>
                        <CelluleNom ligne={l} moi={moi} />
                      </td>
                      <td className={`${td} grotesk text-right font-bold`}>{l.points}</td>
                      <td className={`${td} text-right`}>{l.joues}</td>
                      <td className={`${td} text-center text-[var(--texte-2)]`}>
                        {l.v} / {l.n} / {l.d}
                      </td>
                      <td className={`${td} text-right`}>{l.pct} %</td>
                      <td className={`${td} rounded-r-[10px] text-right text-[var(--texte-2)]`}>
                        {l.setsGagnes} / {l.setsPerdus}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Carte>
      )}

      {resultats && voirPeche && (
        <Carte
          titre="Pêche"
          bareme={`1er ${POINTS.peche_prises[0]} pts · 2e ${POINTS.peche_prises[1]} · 3e ${POINTS.peche_prises[2]}`}
        >
          {peche.length === 0 ? (
            <p className="px-2 py-3 text-sm text-[var(--texte-2)]">
              Aucune sortie sur cette période.
            </p>
          ) : (
            <table className="w-full min-w-[560px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={th}>#</th>
                  <th className={th}>Pêcheur</th>
                  <th className={`${th} text-right`}>Pts</th>
                  <th className={`${th} text-right`}>Sorties</th>
                  <th className={`${th} text-right`}>🐟 Total</th>
                  <th className={`${th} text-right`}>Moy. / sortie</th>
                  <th className={`${th} text-right`}>Podiums</th>
                </tr>
              </thead>
              <tbody>
                {peche.map((l) => {
                  const moi = !!me && l.user_id === me.id;
                  return (
                    <tr
                      key={l.cle}
                      className={moi ? "bg-[var(--lime-fond)]" : l.rang <= 3 ? "bg-background/60" : ""}
                    >
                      <td className={`${td} rounded-l-[10px]`}>
                        <Rang rang={l.rang} />
                      </td>
                      <td className={`${td} max-w-[220px]`}>
                        <CelluleNom ligne={l} moi={moi} />
                      </td>
                      <td className={`${td} grotesk text-right font-bold`}>{l.points}</td>
                      <td className={`${td} text-right`}>{l.sorties}</td>
                      <td className={`${td} text-right`}>{l.prises}</td>
                      <td className={`${td} text-right`}>
                        {l.moyenne.toLocaleString("fr-FR")}
                      </td>
                      <td className={`${td} rounded-r-[10px] text-right`}>{l.podiums}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Carte>
      )}
    </main>
  );
}
