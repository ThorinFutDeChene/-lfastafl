# Álfastafl 0.7.1-dev5 — Tournois : exemptions et revanches

## Formats achevés

- **Toutes rencontres :** calendrier complet à effectif impair, une
  exemption par ronde, sans attribution de point ni partie simulée.
- **Système suisse :** exemptions attribuées aux joueurs ayant eu
  le moins de repos, puis aux moins bien classés ; tirage au sort
  parmi les ex æquo. Une exemption rapporte **3 points**, sans
  affecter l'historique des factions.
- **Élimination directe :** effectifs non puissances de deux pris
  en charge, exemptions aléatoires pour former un tableau équilibré.
  Une exemption qualifie sans rencontre fictive.
- **Match nul :** la validation des résultats crée une revanche
  dans la même ronde, autant de fois que nécessaire. Les anciennes
  parties restent archivées, les factions des revanches sont équilibrées.

## Affichage et diffusions

- Le gestionnaire affiche explicitement les exemptions, revanches,
  qualifications et classements par points.
- Les spectateurs voient prioritairement les rencontres en cours.
  Une ancienne rencontre nulle remplacée ne revient pas dans la
  rotation, tandis qu'une cinématique finale reste visible.
- Sauvegardes de tournois précédentes compatibles.

## Recette et publication

279 tests Python, tests Chromium des nouveaux formats, recette
quatre joueurs / deux parties / spectateur / captures / reconnexion
et finale, ainsi que la régression du menu hôte : tous validés.
Les deux nouvelles recettes deviennent obligatoires pour les
prochaines publications DEV et stable. Tests physiques encore requis.

Le LAN automatique et le tutoriel collectif des DEV précédentes
restent en place. Stable 0.7.0 inchangée.

**Canal DEV : paquet Debian `0.7.1~dev5`.**
