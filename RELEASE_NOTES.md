# Álfastafl 0.7.1-dev8 — Compatibilité Firefox et WebKit

## Extension des tests de navigateurs

- La recette du tutoriel partagé (QR, sélection des coups, déplacements,
  lecture seule et révocation) s'exécute maintenant avec les moteurs
  **Chromium**, **Firefox** et **WebKit** via Playwright.
- La recette à quatre joueurs / deux rencontres / un spectateur est
  également exécutée sous ces trois moteurs : autorisations,
  déplacements, reconnection, rotation des plateaux, scènes de prises
  simultanées et qualification des finalistes.
- GitHub Actions installe les moteurs nécessaires et doit réussir ces
  tests avant toute publication de DEV8.
- Le cahier de recette physique distingue Firefox Linux/Android,
  Chrome Android et Safari iOS/macOS.

**Limite :** WebKit Linux constitue un test du moteur de rendu,
et non une validation de Safari sur iPhone, iPad ou macOS. Les essais
réels sur ces appareils et le Wi-Fi restent obligatoires avant
une déclaration de compatibilité complète.

## Correctifs et continuité

- Le test de mise à jour lit désormais la version attendue dans
  `VERSION` pour éviter les blocages CI à chaque nouvelle DEV.
- Aucun changement de règles, de sauvegarde ou du protocole réseau.
- Version stable **0.7.0 inchangée**.

Pour les résultats de la recette multijoueurs et les scénarios
terrain, voir `RECETTE_TOURNOIS_TERRAIN.md`.
