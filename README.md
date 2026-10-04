# Mon Garage

Suivi de mes véhicules et vélos : entretiens et rappels, carburant / recharge, coûts (prêt, LOA, LLD, frais fixes, revente), documents et échéances, usure des composants de vélo.
HTML/CSS/JavaScript purs (modules ES, sans build) + Firebase gratuit (Auth e-mail et Realtime Database).

## Structure
```
index.html              accueil (cartes) et fiche véhicule à onglets
css/                    tokens, thème graphite (sombre / clair), composants, vues
js/core/                schéma des données, store (local + synchro clé par clé), calculs (coûts, prêt, conso, échéances)
js/services/            Firebase, stockage local
js/features/            export calendrier .ics / Outlook, dossier de revente imprimable
js/ui/                  icônes, toasts, fenêtres, graphiques
js/views/               accueil, fiche, entretiens, carburant, usure, coûts, documents
js/config/              configuration Firebase (null = fonctionnement local)
database.rules.json     règles Realtime Database (chaque compte ne voit que ses données)
```

## Données
- Local : `localStorage`, préfixe `mon_garage_v2_` ; les données de la première version (`monGarage_v1`) sont reprises automatiquement.
- Cloud : `users/<uid>/garage`, une clé par rubrique et par véhicule ; photos réduites (JPEG ~1200 px).

## Logo
Volant à quatre branches, vert anglais et or (`icon.svg`, décliné en `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`).

## Styles graphiques
Réglage → Style : 2 habillages visuels (sombre et clair pour chacun), appliqués par une classe `data-style` qui surcharge les tokens de couleur (`css/styles.css`).
- **Graphite** (par défaut) · **British** (vert anglais et laiton)

## Plan d'entretien pré-rempli
À la création d'une fiche, le plan d'entretien (rappels) est pré-rempli automatiquement selon la motorisation choisie (essence, diesel, hybride, électrique, GPL) pour une voiture, ou selon le type de vélo (VTT, vélo électrique…). Ce sont des préconisations généralisées à partir des usages courants (vidange, distribution, freins, liquide de frein, filtre à air, batterie 12 V, refroidissement de la batterie pour l'électrique…), pas le carnet d'entretien exact du modèle précis — chaque rappel reste modifiable ou supprimable ensuite. Détail dans `js/core/schema.js` (`FUEL_REMINDERS`, `BIKE_TYPE_REMINDERS`).

## Lien avec Carnet (Mon tableau de bord)
- **Envoi manuel d'un rappel** : sur chaque rappel d'entretien en retard ou bientôt dû (onglet Entretien), le bouton « Carnet » l'ajoute comme tâche datée dans l'onglet Accueil de l'app **Carnet** — via sa base Firebase partagée (même choix assumé, sans mot de passe, que pour Trace et Échappée). Un rappel déjà envoyé ne peut pas être renvoyé en double tant que son échéance n'a pas changé. Détail dans `js/services/carnet-sync.js`.
- **Widget Garage sur l'accueil de Carnet** : en arrière-plan, à chaque ouverture de l'accueil, Garage publie automatiquement un résumé des échéances en retard ou bientôt dues (3 par véhicule maximum) vers `app/garage_alerts` de la même base partagée — pur résumé, aucune donnée personnelle ou financière. Carnet s'y abonne en direct (lecture seule, aucune écriture) et affiche une carte « Garage » sur son accueil, mise à jour en temps réel. Fonctionnalité annexe et best-effort : si l'écriture échoue (hors ligne, règles pas encore déployées côté Carnet), l'app Garage continue de fonctionner normalement et retentera au prochain changement.
  ⚠️ Ce chemin (`garage_alerts`) doit être autorisé dans les règles Firebase de la base de **Carnet** (`database.rules.json` de ce dépôt) — voir le README de Carnet pour l'étape de déploiement, à faire une seule fois depuis la console Firebase.

## Carte véhicule (accueil) et photo en grand
Chaque carte de l'accueil affiche une vignette compacte (même format que le cadre de la fiche détail), distincte du bouton qui ouvre la fiche : toucher la photo l'affiche en plein écran (sans ouvrir la fiche), toucher le reste de la carte ouvre la fiche. L'échéance la plus urgente s'affiche sous le nom du véhicule plutôt qu'en incrustation sur la photo.

## Pièces jointes des documents
Chaque document (onglet Documents) peut avoir une pièce jointe — photo ou PDF (scan de la carte grise, de l'attestation d'assurance…) — ajoutée depuis le formulaire. Une photo s'affiche en grand au toucher du trombone ; un PDF se télécharge (ouverture native sur iPhone). Les images sont réduites comme les photos de véhicule ; les PDF sont limités à 4 Mo.

## Remise à zéro groupée des rappels
À chaque entretien enregistré (onglet Entretien), plusieurs rappels peuvent être cochés d'un coup (ex. vidange + filtre à huile + filtre à air faits le même jour) : chacun repart de la date et du kilométrage de cet entretien.

## Carburant en frais fixe estimé
Dans l'onglet Coûts, une estimation mensuelle du carburant (ou de la recharge) peut remplacer la saisie de chaque plein : consommation (L ou kWh/100 km) et prix sont saisis à la main, le kilométrage moyen par mois est calculé automatiquement (distance parcourue depuis l'achat ÷ nombre de mois). Modifier la consommation ou le prix ne change jamais les mois déjà écoulés : une nouvelle période démarre (visible dans la liste des frais fixes, catégorie « Carburant ») sauf si la modification a lieu le même mois que la précédente mise à jour.

## Hors ligne (PWA)

`sw.js` pré-met en cache l'app-shell à l'installation : l'app s'ouvre même sans réseau (au garage, en concession…), y compris dès le tout premier lancement hors ligne. Il vérifie aussi à chaque ouverture si les fichiers ont changé sur le serveur, pour afficher la dernière version publiée.

## Dossier de revente

Sur la fiche d'un véhicule (onglet Aperçu) → « Exporter le dossier de revente » : ouvre dans un nouvel onglet un document regroupant identité, achat, coût réel, historique d'entretien, consommation et documents, avec un bouton « Imprimer / Enregistrer en PDF ». À remettre à l'acheteur.

## Test local
```
python3 -m http.server 8000
```
puis http://localhost:8000.
