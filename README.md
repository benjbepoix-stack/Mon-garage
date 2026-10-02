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

## Styles graphiques
Réglage → Style : 9 habillages visuels (sombre et clair pour chacun), appliqués par une classe `data-style` qui surcharge les tokens de couleur (`css/styles.css`).
- **Graphite** (par défaut) · **Racing** (rouge corsa) · **Néon** (électrique) · **Atelier** (vintage) · **British** (vert anglais)
- **Rallye terre** : blanc sable, bleu nuit et rouge, titres condensés façon numéro de course.
- **Électrique** : bleu glacier et blanc, look épuré façon tableau de bord.
- **Classic Italia** : ivoire, rosso corsa et or, typographie serif façon voiture de collection.
- **Offroad désert** : kaki, sable et rouille, cartes à bordure marquée.

## Plan d'entretien pré-rempli
À la création d'une fiche, le plan d'entretien (rappels) est pré-rempli automatiquement selon la motorisation choisie (essence, diesel, hybride, électrique, GPL) pour une voiture, ou selon le type de vélo (VTT, vélo électrique…). Ce sont des préconisations généralisées à partir des usages courants (vidange, distribution, freins, liquide de frein, filtre à air, batterie 12 V, refroidissement de la batterie pour l'électrique…), pas le carnet d'entretien exact du modèle précis — chaque rappel reste modifiable ou supprimable ensuite. Détail dans `js/core/schema.js` (`FUEL_REMINDERS`, `BIKE_TYPE_REMINDERS`).

## Lien avec Carnet (Mon tableau de bord)
- **Envoi manuel d'un rappel** : sur chaque rappel d'entretien en retard ou bientôt dû (onglet Entretien), le bouton « Carnet » l'ajoute comme tâche datée dans l'onglet Accueil de l'app **Carnet** — via sa base Firebase partagée (même choix assumé, sans mot de passe, que pour Trace et Échappée). Un rappel déjà envoyé ne peut pas être renvoyé en double tant que son échéance n'a pas changé. Détail dans `js/services/carnet-sync.js`.
- **Widget Garage sur l'accueil de Carnet** : en arrière-plan, à chaque ouverture de l'accueil, Garage publie automatiquement un résumé des échéances en retard ou bientôt dues (3 par véhicule maximum) vers `app/garage_alerts` de la même base partagée — pur résumé, aucune donnée personnelle ou financière. Carnet s'y abonne en direct (lecture seule, aucune écriture) et affiche une carte « Garage » sur son accueil, mise à jour en temps réel. Fonctionnalité annexe et best-effort : si l'écriture échoue (hors ligne, règles pas encore déployées côté Carnet), l'app Garage continue de fonctionner normalement et retentera au prochain changement.
  ⚠️ Ce chemin (`garage_alerts`) doit être autorisé dans les règles Firebase de la base de **Carnet** (`database.rules.json` de ce dépôt) — voir le README de Carnet pour l'étape de déploiement, à faire une seule fois depuis la console Firebase.

## Hors ligne (PWA)

`sw.js` pré-met en cache l'app-shell à l'installation : l'app s'ouvre même sans réseau (au garage, en concession…), y compris dès le tout premier lancement hors ligne. Il vérifie aussi à chaque ouverture si les fichiers ont changé sur le serveur, pour afficher la dernière version publiée.

## Dossier de revente

Sur la fiche d'un véhicule (onglet Aperçu) → « Exporter le dossier de revente » : ouvre dans un nouvel onglet un document regroupant identité, achat, coût réel, historique d'entretien, consommation et documents, avec un bouton « Imprimer / Enregistrer en PDF ». À remettre à l'acheteur.

## Test local
```
python3 -m http.server 8000
```
puis http://localhost:8000.
