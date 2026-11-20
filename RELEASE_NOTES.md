# Álfastafl 0.7.0-dev1 — combats de sculptures articulées

Cette préversion prolonge la 0.6.0-dev1 : le plateau 3D, les déplacements
fluides, le réseau local et l'ambiance sonore restent inchangés.

## Nouveautés
- Les **sculptures de combat** ont désormais des bras, jambes et têtes articulés.
  Les armes sont rattachées à leur bras : hache et bouclier du nain,
  arc de l'elfe, épée et sceptre du roi.
- Mise en scène locale synchronisée : déplacement, orientation vers la victime,
  attaque, garde, impact, fracture et retour de la caméra.
- Captures multiples en plusieurs affrontements successifs au sein de la
  fenêtre cinématique confirmée par le serveur.
- **18 fragments 3D** par victime, avec trajectoires et retombée sur le plateau.
- Trois bruitages supplémentaires générés hors ligne : arc, parade et bouclier.
- Les pièces en jeu utilisent toujours les modèles fusionnés d'origine :
  l'articulation coûteuse n'est créée que pour les cinématiques.

## Comportement et garanties
- Les règles Tafl, les permissions LAN, les sauvegardes et les chronomètres
  restent ceux du serveur. Aucune frappe n'ajoute un coup de jeu.
- Les scènes suivent le temps restant envoyé par le serveur ; une reconnexion
  tardive n'entraîne pas la répétition des effets précédents.
- L'hôte, les joueurs et les spectateurs disposent de scènes locales et
  d'options de passage indépendantes.
- La vue 2D et les préférences système de réduction des animations
  restent respectées. Aucune ressource externe n'est téléchargée.

## Vérifications
- Tests de compatibilité Python et JavaScript attendus dans GitHub Actions.
- Les tests WebGL vérifient désormais l'existence d'articulations, la
  conservation des modèles fusionnés et les 18 fragments.
- **Non validé sur matériel physique à ce stade** : rendu QtWebEngine sous
  Ubuntu MATE, fluidité et son sur téléphones et tablettes.

## Distribution
- Version Debian **0.7.0~dev1**, canal de mises à jour **DEV**.
- La branche stable et ses paquets ne sont pas modifiés.
