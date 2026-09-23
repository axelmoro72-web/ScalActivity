import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Suggestions de lieux pour le formulaire d'événement.
 *
 * S'appuie sur Photon (OpenStreetMap, sans clé ni facturation). L'appel
 * part du serveur : pas de requête vers un tiers depuis le navigateur des
 * membres, et un éventuel changement de fournisseur ne touche que ce
 * fichier. Les résultats sont orientés autour de Toulouse, sans s'y
 * limiter : une recherche explicite ailleurs remonte quand même.
 */
const BIAS = { lat: 43.6045, lon: 1.4442 };

/** "Toulouse Padel Club, Rue André Turcat, 31300 Toulouse" */
function label(p: Record<string, string | undefined>): string {
  const ville = [p.postcode, p.city].filter(Boolean).join(" ");
  return [p.name, p.street, ville].filter(Boolean).join(", ");
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ suggestions: [] }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json({ suggestions: [] });

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("lang", "fr");
  url.searchParams.set("limit", "6");
  url.searchParams.set("lat", String(BIAS.lat));
  url.searchParams.set("lon", String(BIAS.lon));

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) {
      console.error(`Photon : réponse ${res.status}`);
      return NextResponse.json({ suggestions: [] });
    }
    const data = (await res.json()) as {
      features?: { properties?: Record<string, string> }[];
    };
    const suggestions = [
      ...new Set(
        (data.features ?? [])
          .map((f) => label(f.properties ?? {}))
          .filter((l) => l.length > 0 && l.length <= 200),
      ),
    ];
    return NextResponse.json({ suggestions });
  } catch (err) {
    // Un service de suggestions indisponible ne doit pas gêner la saisie :
    // le champ reste libre.
    console.error("Photon injoignable :", err);
    return NextResponse.json({ suggestions: [] });
  }
}
