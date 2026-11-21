# Álfastafl 0.7.1-dev9 — Fiabilisation des recettes multi-navigateurs

## Correctif de tests automatisés

- La fermeture des contextes Playwright dans les scénarios
  **tournoi à quatre joueurs** et **tutoriel partagé** ne patiente
  plus sur des requêtes HTTP d'actualisation de l'affichage.
- Les scénarios testent toujours les autorisations, les deux rencontres
  simultanées, la rotation des spectateurs, les captures, la reconnexion
  des finalistes, ainsi que les déplacements du tutoriel partagé.
- Les tests Chromium, Firefox et WebKit restent obligatoires avant
  la publication de cette préversion sur GitHub Actions.

## Compatibilité et limites

Ce correctif ne change **aucune fonctionnalité du jeu** ni les règles
de tafl, les sauvegardes, le protocole réseau ou les animations.
La stable **0.7.0** est inchangée.

La recette physique Ubuntu MATE, téléphones et tablettes, incluant
Safari iOS/macOS, reste à exécuter selon
`RECETTE_TOURNOIS_TERRAIN.md` (suivi : issue GitHub n°7).
