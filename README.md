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

## Hors ligne (PWA)

`sw.js` pré-met en cache l'app-shell à l'installation : l'app s'ouvre même sans réseau (au garage, en concession…), y compris dès le tout premier lancement hors ligne. Il vérifie aussi à chaque ouverture si les fichiers ont changé sur le serveur, pour afficher la dernière version publiée.

## Dossier de revente

Sur la fiche d'un véhicule (onglet Aperçu) → « Exporter le dossier de revente » : ouvre dans un nouvel onglet un document regroupant identité, achat, coût réel, historique d'entretien, consommation et documents, avec un bouton « Imprimer / Enregistrer en PDF ». À remettre à l'acheteur.

## Test local
```
python3 -m http.server 8000
```
puis http://localhost:8000.
