# Álfastafl 0.7.0-dev2 — chorégraphies de combat plus dynamiques

## Nouveautés
- Les captures sont désormais de vrais **enchaînements courts** : approche,
  feinte, parade, esquive latérale, riposte, coup final et fracture.
- Les trois camps conservent leurs figurines sculptées et articulations :
  le nain frappe à la hache et pare au bouclier, l'elfe vise et projette
  une flèche 3D, le roi attaque à l'épée.
- **Étincelles locales**, traînées lumineuses d'armes, impact défensif puis
  impact final, et mouvements de caméra rapprochés avec secousses limitées.
- **Effet sonore de riposte** original synthétisé hors ligne.
- Petites variations déterministes des duels pour éviter les séquences
  strictement identiques, sans hasard au moment du rendu.
- Les captures multiples enchaînent tous les combats dans la même fenêtre
  de temps serveur, sans ajouter de coups ni retarder artificiellement un tour.
- Nouveau test des enveloppes de mouvement (feinte/parade/esquive/riposte/
  frappe), vérification de la reproductibilité et contrôles Chromium.

## Compatibilité
- Aucun changement des règles, sauvegardes, autorisations LAN et chronomètres.
- Temps de scène inchangés : 4 s (rapide), 8 s (classique), 12 s (épique).
- Animation calculée localement à partir du temps restant du serveur :
  reprise en cours de scène sans rejouer les effets précédents.
- « Passer la scène », la vue 2D et « Réduire les animations » restent
  disponibles. Pas de téléchargement de médias.
- Les pièces de jeu restent des sculptures optimisées ; seuls les combattants
  cinématographiques sont articulés.
- **À vérifier sur du matériel réel** : fluidité et effets sous QtWebEngine
  (Ubuntu MATE), Safari mobile et Chrome Android.

## Distribution
- Paquet Debian **0.7.0~dev2**, canal **Développement (DEV)**.
- La stable n'est pas modifiée.
