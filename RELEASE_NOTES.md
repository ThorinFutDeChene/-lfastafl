# Álfastafl 0.4.0 — canal stable

Cette version stable reprend le tutoriel de **0.4.0-dev1**, sans changement fonctionnel, et succède à la [stable 0.3.1](https://github.com/ThorinFutDeChene/-lfastafl/releases/tag/v0.3.1).

## Nouveau : Tutoriel

- Bouton **Tutoriel** à côté de **Créer une partie**, réservé au PC hôte. Le panneau reprend la variante sélectionnée dans **Héberger**.
- **9 exercices historiques, 9 Fetlar et 10 Copenhague** : camps, déplacements, obstacles, trône, captures, cases hostiles, entrée volontaire entre des adversaires, échappée et capture du roi ; mur de boucliers pour Copenhague.
- Destinations légales calculées par le moteur du jeu, explications des erreurs, indices, reprise d'un exercice et navigation libre.
- Mémo adapté à la variante, avec les sources et les limites déjà documentées dans [RULES.md](RULES.md).
- Exercices indépendants des parties, sauvegardes et invitations QR, utilisables avec le LAN désactivé. L'API refuse l'accès aux appareils invités.

La progression n'est pas persistée. Le tutoriel propose des exercices ciblés ; il ne comprend pas d'IA ni de partie complète accompagnée.

## Validation

La DEV **0.4.0-dev1** dont est issue cette version a passé **168 tests Python** et **11 scénarios Chromium**, couvrant notamment les **28 exercices** ([exécution CI](https://github.com/ThorinFutDeChene/-lfastafl/actions/runs/44497542210)). Le parcours visuel dans l'application Qt sur Ubuntu MATE reste à vérifier sur le poste réel.

Les limites du moteur concernant les forteresses complexes, certains nuls de Fetlar et les interprétations historiques restent documentées dans le mémo et dans [RULES.md](RULES.md). Le comportement LAN de la 0.3.1 est conservé : démarrage désactivé, activation par clic et fermeture automatique du partage.

## Distribution

Version Debian : `0.4.0`, plus récente que `0.4.0~dev1` et `0.3.1`. Les nouvelles installations choisissent **Stable** par défaut ; le choix de canal enregistré est conservé. Le canal DEV reçoit également les versions stables. Pour recevoir uniquement les versions stables, sélectionner **Mises à jour → Stable**. Les sauvegardes et paramètres utilisateurs sont conservés.
