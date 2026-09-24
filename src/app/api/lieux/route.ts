import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CLUBS, clubsPourSport } from "@/lib/clubs";

/**
 * Suggestions de lieux pour le formulaire d'événement, dans deux modes :
 *
 * - `?q=` : autocomplétion sur ce que la personne tape.
 * - `?sport=` : lieux proches où pratiquer ce sport, triés par distance.
 *
 * S'appuie sur Photon (OpenStreetMap, sans clé ni facturation). L'appel
 * part du serveur : pas de requête vers un tiers depuis le navigateur des
 * membres, et un changement de fournisseur ne touche que ce fichier.
 *
 * Overpass, qui interroge vraiment l'étiquette `sport`, a été écarté :
 * instable depuis le réseau de l'entreprise, et ses résultats sont des
 * équipements isolés au nom inutilisable (« Court Extérieur 3 »). Photon
 * cherche par nom : en pratique, les clubs portent le nom du sport.
 */
// Agence Scalian Saint-Herblain, 1 avenue des Lions : les distances et le
// tri sont calculés depuis là.
const BIAS = {
  lat: 47.2462,
  lon: -1.6178,
  ville: "Nantes",
  agence: "Saint-Herblain",
};
const RAYON_KM = 40;

/** Types de lieux OSM considérés comme sportifs. */
const LIEUX_SPORTIFS = new Set([
  "sports_centre",
  "pitch",
  "fitness_centre",
  "sport",
  "stadium",
  "track",
  "swimming_pool",
  "golf_course",
  "club",
]);

type Feature = {
  properties?: Record<string, string>;
  geometry?: { coordinates?: [number, number] };
};

export type LieuProche = { label: string; km: number; url: string };

/**
 * Les sites viennent d'OpenStreetMap, éditable par tous : seule une URL
 * http(s) bien formée est proposée en lien (pas de `javascript:`…).
 */
function urlWeb(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Limite par membre, en mémoire : chaque appel en déclenche 3 à 5 vers
 * Photon et Nominatim, dont la charte d'usage bannit les IP trop
 * bavardes. Par instance serverless seulement — un garde-fou contre une
 * boucle ou un script, pas une limite stricte.
 */
const FENETRE_MS = 60_000;
const MAX_PAR_FENETRE = 40;
const appels = new Map<string, number[]>();

function tropDAppels(userId: string): boolean {
  const now = Date.now();
  const recents = (appels.get(userId) ?? []).filter(
    (t) => now - t < FENETRE_MS,
  );
  recents.push(now);
  appels.set(userId, recents);
  return recents.length > MAX_PAR_FENETRE;
}

/** Lien de repli : la fiche du lieu sur Google Maps (horaires, téléphone, réservation). */
function lienRecherche(label: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
}

/**
 * Site officiel des lieux, lu dans OpenStreetMap via Nominatim : Photon ne
 * renvoie pas les tags secondaires. Un seul appel groupé, et l'absence de
 * réponse n'est pas bloquante — on retombe sur la recherche Google.
 */
async function sitesWeb(
  ids: { type: string; id: string }[],
): Promise<Map<string, string>> {
  const sortie = new Map<string, string>();
  const osmIds = ids
    .filter((i) => i.type && i.id)
    .map((i) => `${i.type[0].toUpperCase()}${i.id}`)
    .slice(0, 10);
  if (osmIds.length === 0) return sortie;

  try {
    const url = `https://nominatim.openstreetmap.org/lookup?osm_ids=${osmIds.join(",")}&format=json&extratags=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "ScalActivity (https://scalactivity.vercel.app)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return sortie;
    const data = (await res.json()) as {
      osm_type?: string;
      osm_id?: number;
      extratags?: Record<string, string>;
    }[];
    for (const e of data) {
      const brut = e.extratags?.website ?? e.extratags?.["contact:website"];
      const site = brut ? urlWeb(brut) : null;
      if (site && e.osm_type && e.osm_id) {
        sortie.set(`${e.osm_type[0].toUpperCase()}${e.osm_id}`, site);
      }
    }
  } catch (err) {
    console.error("Nominatim injoignable :", err);
  }
  return sortie;
}

/** Distance à vol d'oiseau entre deux points, en km. */
function entre(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = (v: number) => (v * Math.PI) / 180;
  const cos =
    Math.sin(rad(a.lat)) * Math.sin(rad(b.lat)) +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return 6371 * Math.acos(Math.min(1, Math.max(-1, cos)));
}

/** Distance depuis l'agence, en km. */
function distanceKm(lat: number, lon: number): number {
  return entre(BIAS, { lat, lon });
}

/** "Toulouse Padel Club, Rue André Turcat, 31300 Toulouse" */
function label(p: Record<string, string | undefined>): string {
  const ville = [p.postcode, p.city].filter(Boolean).join(" ");
  return [p.name, p.street, ville].filter(Boolean).join(", ");
}

async function photon(q: string, tagsSportifs = false): Promise<Feature[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("lang", "fr");
  url.searchParams.set("limit", "20");
  url.searchParams.set("lat", String(BIAS.lat));
  url.searchParams.set("lon", String(BIAS.lon));
  if (tagsSportifs) {
    for (const tag of [
      "leisure:sports_centre",
      "leisure:pitch",
      "club:sport",
    ]) {
      url.searchParams.append("osm_tag", tag);
    }
  }

  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) {
    console.error(`Photon : réponse ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { features?: Feature[] };
  return data.features ?? [];
}

/**
 * Lien à proposer pour un lieu déjà choisi : son site officiel s'il est
 * connu d'OpenStreetMap, sinon sa fiche Google Maps, qui porte horaires,
 * téléphone et souvent le lien de réservation.
 */
async function lienLieu(lieu: string): Promise<string> {
  const connu = CLUBS.find((c) =>
    lieu.toLowerCase().includes(c.nom.toLowerCase()),
  );
  if (connu) return connu.url;

  const f = (await photon(lieu))[0];
  const p = f?.properties;
  if (p?.osm_type && p?.osm_id) {
    const sites = await sitesWeb([{ type: p.osm_type, id: p.osm_id }]);
    const site = sites.get(`${p.osm_type[0].toUpperCase()}${p.osm_id}`);
    if (site) return site;
  }
  return lienRecherche(lieu);
}

/**
 * Lieux proches où pratiquer ce sport. Trois recherches complémentaires :
 * le sport seul rate des clubs que la requête avec la ville retrouve, et
 * le filtre par type ramène les équipements dont le nom ne dit rien.
 */
async function lieuxProches(sport: string) {
  const [a, b, c] = await Promise.all([
    photon(sport),
    photon(sport, true),
    photon(`${sport} ${BIAS.ville}`),
  ]);

  const parNom = new Map<
    string,
    {
      label: string;
      km: number;
      lat: number;
      lon: number;
      osm: { type: string; id: string };
    }
  >();
  for (const f of [...a, ...b, ...c]) {
    const p = f.properties ?? {};
    const coords = f.geometry?.coordinates;
    if (!p.name || !coords) continue;

    const km = distanceKm(coords[1], coords[0]);
    if (km > RAYON_KM) continue;
    // Un lieu non sportif n'est retenu que si son nom porte le sport :
    // c'est ce qui distingue « Toulouse Padel Club » d'une rue du Padel.
    if (
      !LIEUX_SPORTIFS.has(p.osm_value ?? "") &&
      !p.name.toLowerCase().includes(sport.toLowerCase())
    ) {
      continue;
    }

    const cle = p.name.toLowerCase();
    const existant = parNom.get(cle);
    if (!existant || km < existant.km) {
      parNom.set(cle, {
        label: label(p),
        km,
        lat: coords[1],
        lon: coords[0],
        osm: { type: p.osm_type ?? "", id: p.osm_id ?? "" },
      });
    }
  }

  // Les complexes connus passent devant : OpenStreetMap les ignore ou les
  // décrit mal, alors qu'ils concentrent l'essentiel des réservations.
  const connus: LieuProche[] = clubsPourSport(sport).map((c) => ({
    label: `${c.nom}, ${c.adresse}`,
    km: distanceKm(c.lat, c.lon),
    url: c.url,
  }));
  // Doublons : OpenStreetMap nomme parfois autrement le même équipement
  // (« Urban Soccer / Urban Padel » pour Urban Padel Carquefou). Deux
  // lieux à moins de 300 m l'un de l'autre sont le même.
  const clubsConnus = clubsPourSport(sport);

  const restants = [...parNom.values()]
    .filter((l) => clubsConnus.every((c) => entre(c, l) > 0.3))
    .sort((x, y) => x.km - y.km)
    .slice(0, 5);
  const sites = await sitesWeb(restants.map((l) => l.osm));

  const osm: LieuProche[] = restants.map(({ label: nom, km, osm }) => ({
    label: nom,
    km,
    url:
      sites.get(`${osm.type[0]?.toUpperCase() ?? ""}${osm.id}`) ??
      lienRecherche(nom),
  }));

  return [...connus, ...osm].sort((x, y) => x.km - y.km).slice(0, 6);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ suggestions: [], lieux: [] }, { status: 401 });
  }
  if (tropDAppels(user.id)) {
    return NextResponse.json({ suggestions: [], lieux: [] }, { status: 429 });
  }

  const params = new URL(request.url).searchParams;
  const sport = params.get("sport")?.trim() ?? "";
  const lieu = params.get("lieu")?.trim() ?? "";
  const q = params.get("q")?.trim() ?? "";

  try {
    if (lieu.length >= 3) {
      return NextResponse.json({ url: await lienLieu(lieu) });
    }
    if (sport.length >= 3) {
      return NextResponse.json({ lieux: await lieuxProches(sport) });
    }
    if (q.length < 3) return NextResponse.json({ suggestions: [] });

    const suggestions = [
      ...new Set(
        (await photon(q))
          .map((f) => label(f.properties ?? {}))
          .filter((l) => l.length > 0 && l.length <= 200),
      ),
    ].slice(0, 6);
    return NextResponse.json({ suggestions });
  } catch (err) {
    // Un service de suggestions indisponible ne doit pas gêner la saisie :
    // le champ reste libre.
    console.error("Photon injoignable :", err);
    return NextResponse.json({ suggestions: [], lieux: [] });
  }
}
