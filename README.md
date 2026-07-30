# ScalActivity

Application interne d'organisation d'activités sportives entre collègues :
création d'événements (padel, foot…), inscription avec liste d'attente
automatique, partage du coût, notifications Teams.

## Stack

Next.js (App Router) + TypeScript · Supabase (Postgres, Auth, RLS) via
`@supabase/ssr` · TanStack Query · Tailwind + shadcn/ui · Zod · Vercel.

## Principes du schéma

- **Pas de statut stocké sur les inscriptions** : confirmé / liste d'attente
  se déduit de l'ordre d'inscription (`row_number()` sur `registered_at, id`)
  comparé à `capacity`. Une désinscription promeut automatiquement le suivant.
- **Le prix par personne n'est jamais stocké** : `total_cost_cents / capacity`,
  calculé par la vue `event_summary`. Montants entiers en centimes.
- **Aucune suppression physique** : annulation = `status = 'cancelled'`,
  désinscription = `cancelled_at` renseigné.
- **RLS partout**, colonnes sensibles verrouillées par des grants par colonne
  (`registered_at`, `role`…).

Les promotions depuis la liste d'attente n'émettant aucun événement
observable, la désinscription passe par la fonction SQL
`cancel_registration` qui, dans une seule transaction, compare l'ordre des
participants avant/après et retourne les personnes promues. Le serveur
notifie ensuite Teams. C'est le seul endroit du code qui détecte les
promotions.

## Développement

```bash
npm install
cp .env.example .env.local   # puis remplir les clés
npm run dev
```

Le schéma vit dans `supabase/migrations/` (Supabase CLI). Toute évolution
passe par `npx supabase migration new <nom>` — jamais par l'interface web.

Sur un poste avec Docker : `npx supabase start` pour une base locale.
Sans Docker (cas actuel) : `npx supabase link --project-ref <ref>` puis
`npx supabase db push` vers le projet de dev.

## Tests

```bash
npm test
```

Couvre la logique de file d'attente (position, promotion, réinscription)
contre la base de dev — voir `tests/`.
