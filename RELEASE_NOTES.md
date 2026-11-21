# Álfastafl 0.7.0-dev11 — Attribution automatique et tournois équilibrés

## Connexions joueur : un seul camp libre, un seul bouton

La fenêtre **Réseau → Connexions et autorisations** tient maintenant
compte des places réellement disponibles. Si le PC hôte joue les
Nains, le téléphone est admis directement chez les Elfes (inversement
pour un PC hôte Elfe). Plus de boutons « elf » et « dwarf » simultanés
quand un camp est déjà pris.

Si deux téléphones jouent sans joueur sur le PC hôte, le premier
joueur autorisé reçoit le camp choisi. Le second obtient
**automatiquement** le camp restant. La fenêtre se met à jour après
chaque autorisation et fournit un refus explicite si les deux camps
sont occupés. Les spectateurs ne choisissent jamais un camp.

Le serveur impose l'affectation même si un invité modifie
artificiellement sa requête HTTP : impossible de prendre un camp
occupé. Les remplacements arbitraux prévus dans les règles existantes
restent compatibles.

## Tournoi : tirage au sort et rééquilibrage

Dans **Partie → Tournois et tirage des factions**, un menu local permet
de créer les participants et les rondes des trois formats
(élimination directe, toutes rencontres, suisse).

- **Premier match sans historique** : attribution Elfes/Nains
  par tirage aléatoire équitable.
- **Matchs suivants** : chacun reçoit de préférence le camp
  qu'il a joué le moins ; le moteur minimise le déséquilibre
  maximal puis total entre les deux adversaires.
- **Égalité** : si les deux prétendent au même camp, celui qui
  l'a joué le plus récemment reçoit l'autre. La comparaison
  se fait par **numéro de ronde** et respecte les rondes de repos.
- **Nouvelle égalité** : tirage au sort.
- Les camps d'un match de tournoi sont **imposés lors des connexions** :
  seuls les noms d'inscription exacts peuvent occuper les places.
- Les vainqueurs sont lus depuis les **parties terminées sur le
  serveur** ; les résultats et historiques des factions sont
  conservés de façon atomique dans les données locales. Le
  redémarrage du PC hôte ne remet pas les compteurs à zéro.

## Validation

Tests Python (situations PC hôte joueur, deux téléphones, tournoi,
historique et départages), test de démarrage natif PyQt6/QtWebEngine,
tests Chromium des menus et affectations et régressions 3D.

**Canal DEV, version Debian 0.7.0~dev11. Stable inchangée (0.5.0).**
