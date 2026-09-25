"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { useProfile, useResultats } from "@/lib/queries";
import { normaliserNom } from "@/lib/activites";
import {
  historique,
  statsJoueur,
  type Participation,
  type StatsJoueur,
} from "@/lib/classement";
import { dateCourte } from "@/lib/format";
import { formatRang, formatSets, type Issue } from "@/lib/resultats";
import { AvatarInitials } from "@/components/avatar-initials";
import { NomJoueur } from "@/components/nom-joueur";
import type { JoueurResultat } from "@/lib/classement";

const ISSUE: Record<Issue, { libelle: string; style: string }> = {
  V: { libelle: "V", style: "bg-[var(--vert)] text-[var(--lime)]" },
  N: { libelle: "N", style: "bg-[var(--jauge)] text-[var(--texte-2)]" },
  D: { libelle: "D", style: "bg-[var(--rouge-pale)] text-[var(--rouge)]" },
};

function Stat({
  label,
  valeur,
  detail,
  ton,
}: {
  label: string;
  valeur: string;
  detail?: string;
  ton?: "victoire" | "defaite";
}) {
  const couleur =
    ton === "victoire"
      ? "text-[var(--lime-texte)]"
      : ton === "defaite"
        ? "text-[var(--rouge)]"
        : "";
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-card px-4 py-3.5">
      <div className="grotesk text-[10.5px] font-semibold tracking-[0.08em] uppercase text-[var(--texte-3)]">
        {label}
      </div>
      <div className={`grotesk mt-0.5 text-xl font-bold ${couleur}`}>{valeur}</div>
      {detail && <div className="mt-0.5 text-xs text-[var(--texte-2)]">{detail}</div>}
    </div>
  );
}

function libelleSerie(s: StatsJoueur["serie"]): string {
  if (!s) return "—";
  const mot = s.issue === "V" ? "victoire" : s.issue === "N" ? "nul" : "défaite";
  return `${s.longueur} ${mot}${s.longueur > 1 ? "s" : ""}`;
}

function StatsGlobales({ stats }: { stats: StatsJoueur }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat
        label="Matchs joués"
        valeur={String(stats.joues)}
        detail={
          stats.joues > 0
            ? `${Math.round((stats.v / stats.joues) * 100)} % de victoires`
            : undefined
        }
      />
      <Stat label="Victoires" valeur={String(stats.v)} ton="victoire" />
      <Stat
        label="Défaites"
        valeur={String(stats.d)}
        ton="defaite"
        detail={stats.n > 0 ? `+ ${stats.n} nul${stats.n > 1 ? "s" : ""}` : undefined}
      />
      <Stat label="Points" valeur={String(stats.points)} />
      {/* Les cases secondaires n'apparaissent que si elles ont un sens :
          pas de « Poissons 0 » pour qui n'a jamais pêché. */}
      {stats.joues > 0 && (
        <Stat label="Série en cours" valeur={libelleSerie(stats.serie)} />
      )}
      {stats.sorties > 0 && (
        <Stat
          label="Poissons"
          valeur={String(stats.prises)}
          detail={`${stats.sorties} sortie${stats.sorties > 1 ? "s" : ""}${
            stats.meilleurRang ? ` · meilleur rang ${formatRang(stats.meilleurRang)}` : ""
          }`}
        />
      )}
    </div>
  );
}

/** "Axel, Paul" avec chaque nom cliquable vers son profil. */
function Noms({ joueurs }: { joueurs: JoueurResultat[] }) {
  return (
    <>
      {joueurs.map((j, i) => (
        <span key={j.cle}>
          {i > 0 && ", "}
          <NomJoueur nom={j.nom} userId={j.user_id} />
        </span>
      ))}
    </>
  );
}

function LigneHistorique({ p }: { p: Participation }) {
  const r = p.resultat;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[var(--border)] px-1 py-3 last:border-b-0">
      <div className="w-[88px] flex-none text-xs text-[var(--texte-3)]">
        {dateCourte(r.starts_at)}
      </div>
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/events/${r.event_id}`} className="grotesk text-sm font-semibold hover:underline">
            {r.titre}
          </Link>
          <span className="grotesk rounded-full bg-[var(--lime-pale)] px-2 py-0.5 text-[10px] font-semibold tracking-[0.05em] uppercase text-[var(--lime-texte)]">
            {r.sport}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-[var(--texte-2)]">
          {r.lieu && `${r.lieu} · `}
          {p.issue ? (
            <>
              {p.coequipiers.length > 0 && (
                <>
                  avec <Noms joueurs={p.coequipiers} /> ·{" "}
                </>
              )}
              contre <Noms joueurs={p.adversaires} />
            </>
          ) : (
            `${p.nbPecheurs} pêcheur${p.nbPecheurs > 1 ? "s" : ""}`
          )}
        </p>
      </div>
      <div className="grotesk text-sm font-semibold tabular-nums">
        {p.issue ? formatSets(r.sets) : `🐟 ${p.prises} · ${formatRang(p.rang ?? 0)}`}
      </div>
      <div className="flex flex-none items-center gap-2">
        {p.issue && (
          <span
            className={`grotesk inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${ISSUE[p.issue].style}`}
          >
            {ISSUE[p.issue].libelle}
          </span>
        )}
        <span className="grotesk w-12 text-right text-sm font-bold text-[var(--lime-texte)]">
          +{p.points} pt{p.points > 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

/**
 * Profil d'un joueur : un membre (/joueurs/<uuid>) ou un invité sans
 * compte (/joueurs/invite?nom=Prénom%20Nom), reconnu à son nom.
 */
export default function JoueurPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nom?: string }>;
}) {
  const { id } = use(params);
  const { nom } = use(searchParams);
  const invite = id === "invite";
  const cle = invite ? `invite:${normaliserNom(nom ?? "")}` : id;

  const { data: profil } = useProfile(invite ? undefined : id);
  const { data: resultats, isPending, error } = useResultats();

  const parts = useMemo(() => historique(resultats ?? [], cle), [resultats, cle]);
  const stats = useMemo(() => statsJoueur(parts), [parts]);
  const parSport = useMemo(() => {
    const m = new Map<string, Participation[]>();
    for (const p of parts) m.set(p.resultat.sport, [...(m.get(p.resultat.sport) ?? []), p]);
    return [...m.entries()].map(([sport, ps]) => ({ sport, ps, stats: statsJoueur(ps) }));
  }, [parts]);

  const nomAffiche = invite ? (nom ?? "Invité") : (profil?.display_name ?? parts[0]?.nom ?? "…");

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-[var(--vert)] px-6 pt-1 pb-6">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/classement"
            className="grotesk text-xs font-medium text-[#8fae94] transition-colors hover:text-[var(--header-texte)]"
          >
            ← Retour au classement
          </Link>
          <div className="mt-3 flex items-center gap-4">
            <AvatarInitials name={nomAffiche} highlight size={56} />
            <div>
              <h1 className="grotesk text-[26px] leading-tight font-bold text-[var(--header-texte)]">
                {nomAffiche}
              </h1>
              <p className="mt-0.5 text-sm text-[var(--header-nav)]">
                {invite ? "Invité·e · " : ""}
                {parts.length} participation{parts.length > 1 ? "s" : ""} classée
                {parts.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 sm:px-6">
        {isPending && <p className="text-[var(--texte-2)]">Chargement…</p>}
        {error && <p className="text-destructive">Impossible de charger l&apos;historique.</p>}

        {resultats && (
          <>
            <StatsGlobales stats={stats} />

            {parSport.length > 0 && (
              <section className="mt-3.5 rounded-2xl border border-[var(--border)] bg-card px-5 py-4.5">
                <h2 className="grotesk mb-2 text-[15px] font-semibold">Par activité</h2>
                <div className="flex flex-col">
                  {parSport.map(({ sport, stats: s }) => (
                    <div
                      key={sport}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--border)] py-2.5 text-sm last:border-b-0"
                    >
                      <span className="grotesk w-28 font-semibold">{sport}</span>
                      <span className="grotesk font-bold">{s.points} pts</span>
                      {s.joues > 0 && (
                        <span className="text-[var(--texte-2)]">
                          {s.v} V · {s.n} N · {s.d} D · série {libelleSerie(s.serie)}
                        </span>
                      )}
                      {s.sorties > 0 && (
                        <span className="text-[var(--texte-2)]">
                          {s.prises} poisson{s.prises > 1 ? "s" : ""} en {s.sorties} sortie
                          {s.sorties > 1 ? "s" : ""}
                          {s.meilleurRang && ` · meilleur rang ${formatRang(s.meilleurRang)}`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-3.5 rounded-2xl border border-[var(--border)] bg-card px-5 py-4.5">
              <h2 className="grotesk mb-1 text-[15px] font-semibold">Historique</h2>
              {parts.length === 0 ? (
                <p className="py-2 text-sm text-[var(--texte-2)]">
                  Aucun résultat pour l&apos;instant.
                </p>
              ) : (
                parts.map((p) => <LigneHistorique key={p.resultat.event_id} p={p} />)
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
