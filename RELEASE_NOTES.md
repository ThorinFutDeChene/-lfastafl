# Álfastafl 0.7.0-dev5 — Le dernier combat du Roi

## Cinématique de victoire des Nains

Déclenchement : coup de nain **validé par le serveur** avec
`reason=king_captured`, `winner=dwarf`, `status=finished`.

- Le nain qui vient de jouer **achève son déplacement** sur la case
  définitive avant de porter un coup de hache au contact.
- Le roi se retourne, pare plusieurs coups avec son épée et tente
  une ultime résistance.
- Les nains **réellement positionnés** autour de lui frappent à tour de
  rôle, puis enchaînent une attaque coordonnée.
- Leur nombre est dicté par les règles effectivement appliquées :
  **deux nains** en prise historique sur un axe, **quatre nains**
  en encerclement complet, ou **trois nains** dans les configurations
  spéciales avec trône. Aucun combattant fictif n'est ajouté.
- La sculpture du roi s'affaisse puis se brise en **30 fragments 3D**.
  Sa **couronne sculptée est projetée**. Onde de choc et éclats
  lumineux accompagnent les haches.
- Caméra mobile et petite secousse au coup final, sons d'épée, haches,
  couronne et **fanfare de victoire des nains** composée par synthèse
  locale sans téléchargement.
- Affichage : **« Victoire des Nains — le roi livre son dernier combat ! »**

## Garanties techniques

- Le moteur de règles est inchangé. Le plateau réel conserve le roi sur sa
  case (le moteur définit cette victoire par immobilisation/encerclement) ;
  les sculptures animées n'affectent jamais l'historique ni les sauvegardes.
- Les nains de soutien restent à leur case, aucun mouvement de plateau
  supplémentaire. Le jeu et les horloges restent arrêtés une fois la victoire
  constatée par le serveur.
- Les scènes de victoire des Elfes à cheval et les captures ordinaires
  restent inchangées.
- Durées **4, 8 ou 12 secondes**, option Désactivées, vue 2D, préférences
  de réduction des animations et bouton **Passer** maintenus.
- Les clients LAN et spectateurs reçoivent le même événement de victoire,
  et les scènes locales suivent le même temps serveur.
- Tests : six configurations de capture du roi en Python, planificateur
  2/3/4 nains et phases de combat en Node, cas historiques et Fetlar réels
  dans Chromium, et bruitages synthétiques hors ligne.
- **Tests physiques Ubuntu MATE et appareils mobiles recommandés** avant
  toute promotion de cette version en stable.

## Distribution

- Paquet Debian **0.7.0~dev5**, canal **Développement (DEV)**.
- Stable 0.5.0 inchangée.
