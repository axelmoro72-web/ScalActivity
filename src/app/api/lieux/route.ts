import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
const BIAS = { lat: 43.6045, lon: 1.4442, ville: "Toulouse" };
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

/** Distance à vol d'oiseau depuis le point de référence, en km. */
function distanceKm(lat: number, lon: number): number {
  const rad = (v: number) => (v * Math.PI) / 180;
  const cos =
    Math.sin(rad(BIAS.lat)) * Math.sin(rad(lat)) +
    Math.cos(rad(BIAS.lat)) * Math.cos(rad(lat)) * Math.cos(rad(lon - BIAS.lon));
  return 6371 * Math.acos(Math.min(1, cos));
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

  const parNom = new Map<string, { label: string; km: number }>();
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
    if (!existant || km < existant.km) parNom.set(cle, { label: label(p), km });
  }

  return [...parNom.values()].sort((x, y) => x.km - y.km).slice(0, 5);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ suggestions: [], lieux: [] }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const sport = params.get("sport")?.trim() ?? "";
  const q = params.get("q")?.trim() ?? "";

  try {
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
