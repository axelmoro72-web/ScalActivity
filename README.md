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
- **Aucune suppression physique**, à deux exceptions près : annulation =
  `status = 'cancelled'`, désinscription = `cancelled_at` renseigné. Seul un
  événement **déjà annulé** peut être supprimé définitivement (par son
  créateur ou un admin), pour le retirer de la liste ; ses inscriptions
  partent en cascade. Un message du fil de discussion se supprime aussi
  physiquement (par son auteur ou un admin) mais ne se modifie jamais.
- **Les vues énumèrent leurs colonnes**, jamais `select e.*` : Postgres fige
  la liste des colonnes à la création, une colonne ajoutée plus tard à la
  table n'apparaît pas dans la vue et le typage écrit à la main ne le voit
  pas. C'est exactement ce qui est arrivé à `description` (migration
  `20260731150000`).
- **RLS partout**, colonnes sensibles verrouillées par des grants par colonne
  (`registered_at`, `role`…).

Les promotions depuis la liste d'attente n'émettant aucun événement
observable, la désinscription passe par la fonction SQL
`cancel_registration` qui, dans une seule transaction, compare l'ordre des
participants avant/après et retourne les personnes promues. Le serveur
notifie ensuite Teams. C'est le seul endroit du code qui détecte les
promotions.

## Comptes et inscription

L'inscription est ouverte (plus d'invitation), mais soumise à deux
garanties distinctes qu'il ne faut pas confondre :

- **le domaine**, imposé par le trigger `enforce_email_domain` sur
  `auth.users` — le formulaire n'est pas le seul chemin vers l'API
  d'inscription, joignable directement avec la clé anon ;
- **la possession de l'adresse**, imposée par la confirmation par email
  (`enable_confirmations` dans `supabase/config.toml`). Sans elle, le
  domaine ne prouve rien : n'importe qui peut saisir l'adresse d'un
  collègue. Tant que le lien n'est pas ouvert, la connexion est refusée
  (`email_not_confirmed`).

Le lien atterrit sur `/auth/confirmation`, qui ouvre la session depuis le
fragment d'URL — le template par défaut de Supabase n'étant pas
personnalisable sans SMTP custom, c'est le même contournement que pour les
invitations (`/auth/set-password`).

Deux limites du tier gratuit à connaître, toutes deux levées par un SMTP
custom :

- **deux emails par heure**. Au-delà, l'envoi échoue en 429 : l'écran
  d'attente et la page de confirmation proposent donc un renvoi manuel.
- **les liens à usage unique sont consommés par les filtres
  anti-phishing** des messageries, qui les ouvrent avant leur
  destinataire. Le cas est détecté (`error_code=otp_expired`) et présenté
  comme tel plutôt que comme une panne. Le remède durable serait un code
  à six chiffres à la place du lien, ce qui suppose de personnaliser le
  template — donc un SMTP custom.

Les réglages d'authentification se poussent par `npx supabase config push`
(HTTPS, fonctionne malgré le blocage des ports Postgres).

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

## Notifications Teams

Inactives tant que `TEAMS_WEBHOOK_URL` n'est pas déclarée — l'application
loggue et continue. Mode opératoire complet (création du flux Power
Automate, choix du compte propriétaire, test, déploiement) :
[`docs/notifications-teams.md`](docs/notifications-teams.md).

## Tests

```bash
npm test
```

Couvre la logique de file d'attente (position, promotion, réinscription)
contre la base de dev — voir `tests/`.
