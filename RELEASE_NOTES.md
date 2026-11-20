# Álfastafl 0.7.0-dev4 — fuite royale à cheval et combat nain au contact

## Nouvelle scène de victoire du roi (option C)

Lorsque le **serveur confirme** un coup de roi gagnant (`reason=escape`,
`winner=elf` et `status=finished`), même en l'absence de capture :
1. Le roi atteint la case de sortie historique (bord) ou la case
   d'évasion d'une autre variante (coin).
2. Trois **chevaux 3D originaux, articulés, sellés et bridés** émergent
   au-delà du plateau. Deux cavaliers elfes accompagnent le roi.
3. Le roi monte en selle ; les elfes présents le saluent et les nains
   survivants protestent avec leurs armes.
4. Les trois cavaliers s'enfuient au galop, avec poursuite de caméra,
   particules lumineuses, bruits de sabots et fanfare originale
   synthétisée localement.
5. **« Victoire des Elfes — le roi s'échappe à cheval ! »** est affiché
   pendant la scène. La caméra revient exactement à sa position de
   départ et la partie reste terminée sur son plateau réel.

## Correction des combats

- **Nain (corps-à-corps) :** le nain arrive obligatoirement sur sa case
  de destination avant de donner le premier coup de hache, paré par
  l'elfe avec son bras portant l'arc ; l'autre nain porte la frappe finale.
- **Elfe (à distance) :** conserve son arrêt une case avant la destination,
  tire une flèche parée par le nain, puis son allié découpe celui-ci
  à l'épée avant que l'archer termine son coup.

## Invariants et compatibilité

- Le roi est déclaré vainqueur **uniquement par le moteur Tafl du serveur**.
  Aucun cheval ni escorte n'existe dans l'état de jeu.
- La cinématique de fuite conserve les durées 4/8/12 s déjà proposées.
  L'option Désactivées empêche également la scène.
- Les joueurs et spectateurs utilisent les mêmes délais serveur ; l'hôte
  ne concède aucun nouveau droit, la victoire reste enregistrée une
  seule fois dans l'historique et les sauvegardes.
- Assets (chevaux, cavaliers, poussière) et sons produits **hors ligne** ;
  le bouton « Passer » et la préférence système Réduire les animations
  restent pris en charge.
- Tests Python de victoire et d'expiration de scène, tests Node sur
  les portes de sortie et phases, test Chromium du cortège hôte/spectateur
  et de la remise en état du plateau.
- Rendu et fluidité **à vérifier sur Ubuntu MATE et appareils mobiles
  réels** avant promotion stable.

## Distribution

- Paquet Debian **0.7.0~dev4**, canal **DEV**.
- Stable 0.5.0 inchangée.
