# Álfastafl 0.7.0-dev6 — Capture contre le trône vide, dans les deux sens

## Deux scènes de capture cinématographique

**1 nain capture 1 elfe contre le trône :**
1. Le nain atteint sa vraie case d'arrivée avant de frapper au contact.
2. Il porte un coup de hache, paré par l'elfe avec son bras protégeant l'arc.
3. Le nain frappe de nouveau et projette la sculpture elfique contre le trône.
4. Impact sur le socle, étincelles et **18 fragments de l'elfe** en 3D.

**1 elfe capture 1 nain contre le trône :**
1. L'archer s'arrête une case avant sa destination.
2. Il tire une flèche parée par le bouclier du nain.
3. Une seconde flèche pousse la sculpture de bronze contre le trône.
4. Éclats de la sculpture (18 fragments), **12 petits débris visuels**
   sur le socle, puis l'archer finit son déplacement réel.

Les deux scènes bénéficient d'une caméra locale mobile, des
animations d'armes articulées et de sons de choc contre la pierre,
entièrement synthétisés et disponibles hors ligne.

## Déclenchement conforme aux règles

- Le trône doit être **vide** ; le centre est hostile aux soldats des deux
  camps dans les trois variantes. Les cas d'un roi sur le trône, d'une
  capture en étau par deux pièces, d'un mur de boucliers ou d'une
  capture du roi suivent leurs propres règles et scènes.
- Une unique capture doit avoir été **confirmée par le serveur**,
  sur la case exactement comprise entre l'attaquant et le trône.
- **Aucun changement** des règles Tafl, des tours, du chronomètre, des
  permissions réseau, de l'historique et des sauvegardes. Le trône ne
  change ni de case ni d'occupation après la scène.
- Durées existantes 4/8/12 s, Désactivées, Passer, Réduire les animations,
  affichage 2D et spectateurs inchangés.
- Tests de captures réelles Python (2 camps × 3 variantes), déterminisme
  Node et scénarios Chromium avec les deux camps, caméra, fragments,
  spectateur et retour au plateau.
- Validation matérielle Ubuntu MATE, tablette et smartphone à réaliser
  avant promotion en stable.

## Publication

- Paquet Debian **0.7.0~dev6**, canal **Développement (DEV)**.
- Stable 0.5.0 inchangée.
