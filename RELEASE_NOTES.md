# Álfastafl 0.7.0-dev12 — Correction des flèches de sortie du roi

**Bug corrigé :** sur le plateau WebGL 3D, deux des quatre flèches
gravées dans les cases d'angle pointaient vers l'intérieur du
plateau, alors qu'elles doivent toutes indiquer la sortie du roi.

**Origine :** l'ancien code attribuait seulement deux rotations
aux quatre emblèmes de sortie.

**Correction :** calcul d'une orientation distincte pour chaque
coin à partir de sa position dans le monde 3D. Les flèches
indiquent désormais les diagonales extérieures ↖ ↗ ↙ ↘,
quelle que soit la position de la caméra.

**Contrôle anti-régression :** nouveau scénario Chromium/WebGL
qui calcule le vecteur réel de chacune des quatre flèches
après rotation et confirme qu'il pointe hors du plateau,
sans inclinaison verticale.

**Portée :** purement graphique. Aucune modification des règles,
des captures, des conditions de victoire, des parties enregistrées,
des animations, du tutoriel ou du protocole multijoueur.

**Distribution :** DEV `0.7.0~dev12`. Stable 0.5.0 inchangée.
