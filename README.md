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
Volant à quatre branches, vert anglais et or (`icon.svg`, décliné en `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`), aussi utilisé comme logo sur l'écran de connexion.

## Réglages (thème)
Bouton réglages (en-tête de l'accueil) → feuille « Réglages » : thème sombre/clair. Un seul style graphique, **Acier**, appliqué à tous les comptes (attribut `data-style`).

## Plan d'entretien pré-rempli
À la création d'une fiche, le plan d'entretien (rappels) est pré-rempli automatiquement selon la motorisation choisie (essence, diesel, hybride, électrique, GPL) pour une voiture, ou selon le type de vélo (VTT, vélo électrique…). Ce sont des préconisations généralisées à partir des usages courants (vidange, distribution, freins, liquide de frein, filtre à air, batterie 12 V, refroidissement de la batterie pour l'électrique…), pas le carnet d'entretien exact du modèle précis — chaque rappel reste modifiable ou supprimable ensuite. Détail dans `js/core/schema.js` (`FUEL_REMINDERS`, `BIKE_TYPE_REMINDERS`).

## Lien avec Carnet (Mon tableau de bord)
- **Échéances dans Carnet** : en arrière-plan, une fois les données du compte chargées, Garage publie automatiquement les échéances en retard ou à moins de 30 jours de chaque véhicule actif (8 par véhicule maximum, avec leur date quand elle existe) vers `app/garage_alerts` de la base partagée de Carnet — pur résumé, aucune donnée personnelle ou financière. Le nœud est réécrit en entier à chaque changement : un véhicule vendu, archivé ou supprimé (ici ou sur un autre appareil) disparaît aussi de Carnet. Carnet s'y abonne en direct (lecture seule) : section « Garage » de l'onglet Tâches, calendrier du mois et pop-up des retards. Best-effort : si l'écriture échoue (hors ligne, règles pas encore déployées côté Carnet), l'app continue normalement et retentera au prochain changement. Détail dans `js/services/carnet-sync.js`.
- L'ancien bouton « Envoyer à Carnet » d'un rappel a été retiré : Carnet affiche déjà ces échéances automatiquement, il créait des doublons.
  ⚠️ Ce chemin (`garage_alerts`) doit être autorisé dans les règles Firebase de la base de **Carnet** (`database.rules.json` de ce dépôt) — voir le README de Carnet pour l'étape de déploiement, à faire une seule fois depuis la console Firebase.

## Carte véhicule (accueil) et photo en grand
Chaque carte de l'accueil affiche une vignette (80 px), distincte du bouton qui ouvre la fiche : toucher la photo l'affiche en plein écran (sans ouvrir la fiche), toucher le reste de la carte ouvre la fiche. Sous le nom : seulement la marque, le modèle et, pour un véhicule, la plaque d'immatriculation (pas l'année, le kilométrage ni la motorisation) ; l'échéance la plus urgente s'affiche en dessous.

## Archiver un véhicule (vendu, accidenté…)
Depuis la fiche d'un véhicule existant, « Déclarer vendu / accidenté… » demande un motif (vendu, accidenté / épave, volé, autre) et une date, puis masque le véhicule de l'accueil — ses entretiens, coûts, documents et rappels sont conservés, pas supprimés, et il ne remonte plus dans le pop-up des entretiens en retard ni vers Carnet. Un lien « Archives (N) » apparaît en bas de l'accueil dès qu'au moins un véhicule est archivé : il liste les véhicules archivés avec leur motif et leur date, permet de rouvrir leur fiche (consultation et modification normales) ou de les restaurer (bouton dédié, ou directement depuis leur fiche).

## Pièces jointes des documents
Chaque document (onglet Documents) peut avoir plusieurs pièces jointes — photos ou PDF (scan de la carte grise, de l'attestation d'assurance, et son avenant…) — ajoutées en une ou plusieurs fois depuis le formulaire (10 maximum par document). S'il n'y en a qu'une, le trombone l'ouvre directement ; s'il y en a plusieurs, un badge affiche leur nombre et le trombone rouvre la fiche du document pour les lister et les ouvrir une à une. Les images sont réduites comme les photos de véhicule ; chaque fichier est limité à 4 Mo.
- **Photo** : affichée en grand dans l'app.
- **PDF** : visionneuse plein écran intégrée (`js/ui/attachment-viewer.js`) — pages rendues avec pdf.js (chargé à la demande depuis cdnjs, puis gardé en cache par le service worker pour l'aperçu hors ligne), zoom −/+, et bouton « Ouvrir / Partager » (feuille de partage native sur iPhone : Fichiers, Imprimer, Mail… ; sinon nouvel onglet). Si l'aperçu est impossible (tout premier affichage hors ligne, PDF protégé), ce bouton reste proposé. Avant, le PDF était « téléchargé » via un lien `data:` : en mode app sur iPhone il s'ouvrait sans bouton retour, ou pas du tout.
- Un PDF sans type de fichier (certains sélecteurs iPhone / Drive) est ré-étiqueté `application/pdf` à l'ajout (et vérifié par son en-tête `%PDF`) : il était auparavant rejeté au stockage et la pièce jointe disparaissait.

## Factures rangées dans les documents
Un entretien (onglet Entretiens) ou une autre dépense (onglet Coûts) peut recevoir sa facture (photos ou PDF) directement dans son formulaire : elle est rangée automatiquement dans l'onglet Documents, comme document « Facture » relié à sa saisie (étiquette « Entretien » ou « Dépense »). Retirer tous les fichiers retire ce document ; supprimer l'entretien ou la dépense supprime aussi sa facture. Un trombone sur la ligne ouvre la facture. Détail dans `js/features/linked-doc.js`.

## Autres dépenses
Section « Autres dépenses » de l'onglet Coûts : achats ponctuels hors entretien (roues carbone, accessoires, équipement…), avec catégorie, montant et facture. Comptés dans les coûts (série « Autres dépenses » du graphique et de la répartition). Clé `v_<id>_expenses`.

## Lien avec Mon Budget
Les entretiens (avec un coût) et autres dépenses datés **à partir du 1er octobre 2026** sont publiés dans la base de Mon Budget (`budget/linked/garage`, montants en centimes, sans pièce jointe) et y apparaissent comme dépenses « Transport » en lecture seule — plus de double saisie. Best-effort, uniquement une fois les données du compte chargées. ⚠️ Publier une fois les règles de Mon Budget (`database.rules.json` du dépôt Mon budget). Détail dans `js/services/budget-sync.js`.

## Rappel « jamais réalisé »
Dans un rappel d'entretien, la case « Jamais réalisé depuis la mise en circulation » remplace la saisie du dernier entretien : l'échéance et la barre d'avancement se comptent alors depuis la date de mise en circulation du véhicule (champ de la fiche véhicule, case B de la carte grise), à 0 km. Pour un vélo (pas de carte grise), le départ est la date d'achat (onglet Coûts), à 0 km. Sans cette date, seul le critère en km s'applique et la carte du rappel indique où la renseigner. Dès qu'un entretien coche ce rappel, il repart normalement de cet entretien.

## Rappels en retard à l'ouverture
Au lancement de l'app (une fois par session, après l'écran de connexion), si des rappels d'entretien sont en retard — tous véhicules confondus —, une fenêtre les liste en une seule fois (véhicule, rappel, retard). Un appui sur une ligne ouvre directement la saisie de l'entretien, rappel déjà coché ; un seul bouton « Fermer ».

## Remise à zéro groupée des rappels et des composants d'usure
À chaque entretien enregistré (onglet Entretien), plusieurs rappels peuvent être cochés d'un coup (ex. vidange + filtre à huile + filtre à air faits le même jour) : chacun repart de la date et du kilométrage de cet entretien. Pour un vélo, les composants suivis en usure (onglet Usure : chaîne, pneus, plaquettes…) peuvent aussi être cochés et remis à zéro en même temps, sans repasser par le bouton « Remplacé ».

## Carburant : estimation mensuelle
L'onglet Carburant ne propose plus que ça : une estimation mensuelle (consommation en L ou kWh/100 km, prix) — pas de plein à saisir, pas de graphique. Le kilométrage moyen par mois est calculé automatiquement (distance parcourue depuis l'achat ÷ nombre de mois). Elle compte comme du carburant dans les coûts (pas un frais fixe). À la première activation, l'estimation est appliquée rétroactivement depuis la date d'achat du véhicule, pour rattraper l'historique sans avoir à saisir chaque mois passé. Modifier ensuite la consommation ou le prix ne change jamais les mois déjà écoulés : une nouvelle période démarre au 1er du mois en cours (l'ancienne se clôt à la fin du mois précédent), sauf si la modification a lieu le même mois que la précédente mise à jour, auquel cas elle s'ajuste sur place. Les coûts se comptant par mois entier (jamais au prorata du jour), la bascule entre deux périodes se fait toujours sur une frontière de mois, pour qu'un même mois ne soit jamais compté par les deux à la fois. Le bouton « Réinitialiser » efface tout l'historique estimé pour repartir de zéro (utile pour corriger une estimation mal rattrapée) : la saisie suivante rattrape de nouveau tout l'historique depuis l'achat. Les anciens pleins saisis à la main (fonctionnalité retirée) ne comptent plus du tout dans les coûts ; toute donnée résiduelle de ce type est purgée automatiquement (localement et côté cloud) à l'ouverture de l'app.

## Solde anticipé (crédit)
Dans « Achat & financement » (onglet Coûts), un crédit soldé par anticipation peut être renseigné (montant réglé, date) : les mensualités s'arrêtent à cette date, remplacées par ce montant dans les coûts, le capital restant dû retombe à 0 et le coût du crédit (intérêts) est recalculé en conséquence.

## Hors ligne (PWA)

`sw.js` pré-met en cache l'app-shell à l'installation : l'app s'ouvre même sans réseau (au garage, en concession…), y compris dès le tout premier lancement hors ligne. Il vérifie aussi à chaque ouverture si les fichiers ont changé sur le serveur, pour afficher la dernière version publiée.

## Dossier de revente

Sur la fiche d'un véhicule (onglet Aperçu) → « Exporter le dossier de revente » : ouvre dans un nouvel onglet un document regroupant identité, achat, coût réel, historique d'entretien, consommation et documents, avec un bouton « Imprimer / Enregistrer en PDF ». À remettre à l'acheteur.

## Test local
```
python3 -m http.server 8000
```
puis http://localhost:8000.

## Style
Style minimaliste commun aux apps (anthracite, cartes pleines), couleur **Acier** (gris argent), thème sombre ou clair. Logo : volant acier avec la ligne d'horizon commune aux logos des apps.
