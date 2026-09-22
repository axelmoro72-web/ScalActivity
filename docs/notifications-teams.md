# Connecter les notifications Teams

L'application poste des cartes dans une conversation Teams via un webhook. Le code
est prêt ([`src/lib/teams.ts`](../src/lib/teams.ts)) ; il ne manque que le
webhook et la variable d'environnement.

Les connecteurs Office 365 (« Incoming Webhook ») ont été retirés par
Microsoft. Le remplacement est un **flux Power Automate** déclenché par une
requête HTTP, qui attend une *Adaptive Card* — c'est exactement ce que
l'application envoie. Ne cherchez pas « Connecteurs » dans Teams.

## 0. Décider qui détient le flux

Un flux Power Automate s'exécute via une **connexion**, et une connexion
appartient à un compte. Ce choix se fait avant tout le reste, parce qu'il
détermine ce qui se passe le jour où le titulaire quitte l'entreprise.

| Détenteur | Conséquence |
| --- | --- |
| **Compte de service** (recommandé) | Le flux appartient à l'organisation, survit aux départs. Nécessite une demande à l'IT : un compte technique licencié Power Automate, par exemple `svc-scalactivity@…`. Il devra être **membre de la conversation de groupe** pour pouvoir y publier. |
| Compte personnel | Fonctionne immédiatement, mais consomme votre licence et s'arrête avec votre compte. Ajouter des copropriétaires au flux limite le risque sans le supprimer : la connexion reste celle du créateur. |

Le **nom affiché** sur les messages est un réglage indépendant : voir
l'étape 2. Publier « en tant que Flow bot » n'empêche pas le flux de
tourner sous le compte propriétaire.

## 1. Créer le flux

La destination actuelle est une **conversation de groupe** (`SCALACTIVITY`,
4 membres), pas un canal d'équipe. Le modèle n'est pas le même — c'est le
piège de cette étape.

Depuis le compte retenu à l'étape 0 :

1. Ouvrir Teams, aller sur la conversation qui doit recevoir les
   notifications.
2. Cliquer sur le `···` en haut à droite de la conversation → **Workflows**.
   (À défaut : rail de gauche → `···` → application **Workflows** →
   *Créer*, puis chercher « webhook ».)
3. Choisir le modèle **« Publier dans une conversation quand une requête de
   webhook est reçue »** (*Post to a chat when a webhook request is
   received*). Le modèle équivalent pour un canal d'équipe s'appelle
   *« … dans un canal … »* : ce n'est pas celui-là.
4. Valider la connexion Microsoft Teams proposée, puis **Suivant**.
5. Sélectionner la conversation de destination, puis créer le flux.

> Si l'usage se généralise, une véritable équipe avec un canal dédié est
> plus durable qu'une conversation de groupe : l'historique survit aux
> départs et la gestion des membres est explicite. Le flux se refait alors
> avec le modèle « canal », le reste du mode opératoire est identique.

## 2. Vérifier le compte d'affichage

Éditer le flux (Teams → `···` → Workflows → le flux → Modifier, ou
`make.powerautomate.com` → *Mes flux*), ouvrir l'action **Publier une carte
dans une conversation ou un canal** et vérifier le paramètre **Publier en
tant que** :

- `Flow bot` → les messages arrivent signés « Workflows ». **À privilégier.**
- `Utilisateur` → les messages portent le nom du propriétaire du flux.

## 3. Récupérer l'URL

Le déclencheur du flux affiche une URL de la forme :

```
https://prod-XX.westeurope.logic.azure.com/workflows/<id>/triggers/manual/paths/invoke?…&sig=<signature>
```

**C'est un secret.** La signature `sig=` suffit à poster dans la conversation :
quiconque possède l'URL peut écrire sous l'identité du flux. Elle ne doit
jamais être commitée dans le dépôt. Si elle fuite, régénérer le flux
(étape 1) invalide l'ancienne.

## 4. Tester avant d'installer

Ce test envoie exactement la charge utile de l'application. S'il passe,
l'application passera aussi — et s'il échoue, le problème est côté Teams,
pas côté code.

```bash
curl -i -X POST -H "Content-Type: application/json" -d "{\"type\":\"message\",\"attachments\":[{\"contentType\":\"application/vnd.microsoft.card.adaptive\",\"content\":{\"$schema\":\"http://adaptivecards.io/schemas/adaptive-card.json\",\"type\":\"AdaptiveCard\",\"version\":\"1.4\",\"body\":[{\"type\":\"TextBlock\",\"size\":\"Medium\",\"weight\":\"Bolder\",\"text\":\"Test ScalActivity\",\"wrap\":true},{\"type\":\"TextBlock\",\"text\":\"Si vous lisez ceci, le webhook fonctionne.\",\"wrap\":true}]}}]}" "URL_DU_WEBHOOK"
```

Attendu : `HTTP/2 202` et une carte dans la conversation. Le flux est asynchrone,
un `202` signifie « accepté », pas « publié » — vérifier la conversation.

## 5. Déclarer la variable

**Production (Vercel)** : projet `scalactivity` → Settings → Environment
Variables → nom `TEAMS_WEBHOOK_URL`, valeur l'URL, environnement
`Production`.

> Passer par l'interface web, **pas** par `vercel env add` en ligne de
> commande depuis PowerShell 5.1 : l'encodage y glisse un BOM invisible en
> tête de valeur, ce qui produit des en-têtes HTTP invalides. Le problème
> s'est déjà produit sur ce projet.

**Développement local** : ajouter la ligne dans `.env.local` (fichier non
versionné) :

```
TEAMS_WEBHOOK_URL=https://prod-XX.westeurope.logic.azure.com/workflows/...
```

## 6. Redéployer

Une variable d'environnement n'est lue qu'au démarrage du déploiement :
Vercel → Deployments → le dernier → `···` → **Redeploy**. Sans cette étape,
la production continue de tourner sans la variable.

## 7. Vérifier en conditions réelles

Créer un événement de test, puis l'annuler : la carte « Événement annulé »
doit tomber dans la conversation. Supprimer ensuite l'événement annulé pour
ne pas polluer la liste.

## 8. Un fil par activité

Par défaut, le workflow poste chaque carte comme un nouveau message. Pour
regrouper tout ce qui concerne une activité (création, modifications,
messages du chat, places libérées, annulation) dans **un seul fil**, le
workflow doit se souvenir du message racine de chaque activité.

L'application envoie pour cela, à côté de la carte, un champ `eventId`
(identifiant de l'activité). La correspondance `eventId` → message racine
est stockée dans une liste SharePoint.

### a. Créer la liste SharePoint

Dans le site SharePoint de l'équipe (onglet **Fichiers** du canal →
*Ouvrir dans SharePoint*) : *Nouveau* → **Liste** → *Liste vide*, nommée
`ScalActivity fils`. Ajouter une colonne **Une ligne de texte** nommée
`MessageId`. La colonne `Titre` existante recevra l'`eventId`.

### b. Modifier le workflow

Éditer le flux (`make.powerautomate.com` → *Mes flux* → le flux →
*Modifier*). Garder le déclencheur, **supprimer** le bloc
*Appliquer à chacun* / *Publier une carte* existant, puis ajouter :

1. **SharePoint — Obtenir les éléments** : site et liste ci-dessus,
   *Requête de filtre* : `Title eq '@{triggerBody()?['eventId']}'`,
   *Nombre supérieur* : `1`.
2. **Condition** (mode expression) :
   `length(body('Obtenir_les_éléments')?['value'])` *est égal à* `0`.
3. Branche **Oui** (première carte de l'activité → nouveau fil) :
   - **Teams — Publier une carte dans une conversation ou un canal** :
     *Publier en tant que* `Flow bot`, *Publier dans* `Channel`, l'équipe,
     le canal, *Carte adaptative* :
     `@{triggerBody()?['attachments'][0]['content']}`.
   - **SharePoint — Créer un élément** : même liste, *Titre* :
     `@{triggerBody()?['eventId']}`, *MessageId* : le contenu dynamique
     **ID du message** de l'action précédente.
4. Branche **Non** (activité déjà connue → réponse dans le fil) :
   - **Teams — Répondre avec une carte adaptative dans un canal** :
     *Publier en tant que* `Flow bot`, même équipe et canal, *Message* :
     `@{first(body('Obtenir_les_éléments')?['value'])?['MessageId']}`,
     *Carte adaptative* : `@{triggerBody()?['attachments'][0]['content']}`.

Le nom interne des actions (`Obtenir_les_éléments`) dépend de la langue
de l'éditeur : le plus sûr est d'insérer `body(...)` via le sélecteur de
contenu dynamique.

Enregistrer. L'URL du webhook ne change pas : rien à refaire côté Vercel.

### Remarques

- Les activités créées **avant** cette mise en place n'ont pas de message
  racine : leur prochaine notification (un message de chat, par exemple)
  ouvrira leur fil.
- Supprimer une ligne de la liste fait repartir l'activité sur un
  nouveau fil à la notification suivante.

## Ce qui déclenche une notification

| Déclencheur | Contenu |
| --- | --- |
| Création d'une activité | Titre, sport, date, lieu, places, coût, auteur, bouton « Voir et s'inscrire » |
| Modification d'une activité | Mêmes informations à jour, auteur de la modification, bouton « Voir l'activité » |
| Inscription | Nom, confirmé ou liste d'attente, remplissage (confirmés, attente, places restantes) |
| Désinscription | Nom et remplissage mis à jour |
| Message dans le fil d'une activité | Auteur, activité, texte du message, bouton « Répondre » |
| Annulation d'un événement | Titre, date, et la liste des personnes inscrites |
| Désinscription libérant une place | La personne promue depuis la liste d'attente |
| Augmentation du nombre de places | Chaque personne promue depuis la liste d'attente |

Les promotions sont détectées côté base, dans la même transaction que
l'opération qui les provoque (`cancel_registration`, `update_event`) : c'est
la seule façon fiable de savoir qui vient de passer de la liste d'attente à
confirmé.

Les boutons pointent vers `NEXT_PUBLIC_SITE_URL`, ou à défaut vers le
domaine de production Vercel (`VERCEL_PROJECT_PRODUCTION_URL`, fourni
automatiquement). Sans l'un ni l'autre, la carte part sans bouton.

## Dépannage

| Symptôme | Cause probable |
| --- | --- |
| Rien ne part, log `TEAMS_WEBHOOK_URL absente` | Variable non déclarée, ou déploiement pas refait depuis (étape 6) |
| `202` au curl mais rien dans la conversation | Flux désactivé, destination différente de celle attendue, ou modèle « canal » choisi au lieu de « conversation » |
| `400` / `401` / `403` | URL tronquée à la copie, ou signature `sig=` régénérée |
| Les messages portent un nom de personne | Paramètre « Publier en tant que » sur `Utilisateur` (étape 2) |
| Tout s'arrête du jour au lendemain | Compte propriétaire du flux désactivé (étape 0) |

Une notification qui échoue n'interrompt jamais l'action métier : l'erreur
est écrite dans les logs (Vercel → Deployments → Runtime Logs) et
l'inscription, l'annulation ou la modification aboutit normalement.
