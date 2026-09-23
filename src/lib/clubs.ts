/**
 * Complexes sportifs connus autour de l'agence de Saint-Herblain.
 *
 * OpenStreetMap connaît mal ces équipements privés : plusieurs des plus
 * fréquentés (Le Smile, Le Sporting) n'y sont pas étiquetés par sport, ou
 * sans site web. Cette liste, tenue à la main, les remonte en tête des
 * suggestions avec leur lien de réservation ; les résultats OpenStreetMap
 * viennent ensuite compléter.
 *
 * Coordonnées obtenues par géocodage des adresses (Photon), vérifiées le
 * 23/09/2026. Pour ajouter un club : nom, adresse, coordonnées, site de
 * réservation, et les sports proposés en minuscules sans accent.
 */
export type Club = {
  nom: string;
  adresse: string;
  lat: number;
  lon: number;
  url: string;
  /** Mots-clés en minuscules, comparés au sport choisi dans le formulaire. */
  sports: string[];
};

export const CLUBS: Club[] = [
  {
    nom: "Le Smile",
    adresse: "2 chemin des Cyprès, 44880 Sautron",
    lat: 47.2527,
    lon: -1.6587,
    url: "https://www.smile-nantes.fr/fr-fr/apex/session_booking",
    // « urbantennis » (touch tennis) n'est pas du tennis : pas d'alias.
    sports: ["padel", "badminton", "foot", "foot5", "futsal", "urbantennis"],
  },
  {
    nom: "Le Sporting",
    adresse: "3 impasse du Bourrelier, 44800 Saint-Herblain",
    lat: 47.2219,
    lon: -1.6422,
    url: "https://lesporting.com/activites/",
    sports: [
      "padel",
      "badminton",
      "squash",
      "foot",
      "foot5",
      "futsal",
      "volley",
      "ping-pong",
      "tennis de table",
      "petanque",
      "cross training",
    ],
  },
  {
    nom: "UCPA Sport Station Nantes",
    adresse: "9 boulevard de Berlin, 44000 Nantes",
    lat: 47.216,
    lon: -1.5325,
    url: "https://www.ucpa.com/sport-station/nantes",
    sports: ["padel", "squash", "escalade", "fitness", "musculation"],
  },
  {
    nom: "Smash Goal",
    adresse: "5 rue de la Garde, 44300 Nantes",
    lat: 47.2502,
    lon: -1.5012,
    url: "https://smashgoal.fr/",
    sports: [
      "padel",
      "badminton",
      "foot",
      "foot5",
      "futsal",
      "ping-pong",
      "tennis de table",
    ],
  },
  {
    nom: "Urban Padel Carquefou",
    adresse: "3 rue Suzanne Lenglen, 44470 Carquefou",
    lat: 47.2877,
    lon: -1.4803,
    url: "https://www.urbanpadel.fr/nantes-carquefou",
    sports: ["padel", "foot", "foot5", "futsal"],
  },
  {
    nom: "Le SET",
    adresse: "11 route de l'Hommeau, 44140 Le Bignon",
    lat: 47.1104,
    lon: -1.5254,
    url: "https://lesetsport.fr/padel",
    sports: ["padel"],
  },
  {
    nom: "Vital Club Savenay",
    adresse: "parc commercial de la Colleraye, 44260 Savenay",
    lat: 47.3737,
    lon: -1.9342,
    url: "https://www.vitalclub.fr/",
    sports: ["padel", "fitness", "musculation"],
  },
];

/** "Ping-pong" et "ping pong" doivent tomber sur la même entrée. */
function normalise(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Clubs proposant ce sport. Comparaison stricte, après normalisation :
 * « tennis de table » ne doit pas répondre à « tennis ». Les variantes
 * (foot / foot5 / futsal) sont donc listées explicitement par club.
 */
export function clubsPourSport(sport: string): Club[] {
  const s = normalise(sport);
  if (s.length < 3) return [];
  return CLUBS.filter((c) => c.sports.some((v) => normalise(v) === s));
}
