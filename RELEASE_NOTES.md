# Álfastafl 0.7.2-dev1 — Menus simplifiés

## Nouvelle organisation des menus hôte

**Fichier**
- Sauvegarder la partie
- Sauvegardes…
- Quitter

**Partie**
- **2 joueurs** — ouvre le formulaire de création d'une partie à
  deux joueurs, anciennement dans « Fichier → Nouvelle partie »,
  avec activation automatique du réseau local.
- Tutoriel…
- Tournois et tirage des factions…

**Entrées retirées du menu Partie**
- Jouer / Spectateur / Arbitrage…
- Historique des coups…
- Diffusion des rencontres du tournoi…

## Compatibilité

Les commandes ne sont supprimées **que du menu natif**.
La gestion des autorisations, les rôles, l'historique interne et la
diffusion des tournois restent disponibles dans le jeu par leurs
autres interfaces et mécanismes existants.

La création de partie conserve le même formulaire, les mêmes QR
codes et la même ouverture automatique du LAN. Aucun changement
des règles, des formats de sauvegarde ni de l'API réseau.

## Recette

Tests de la composition des menus et de la liaison « 2 joueurs »
à la commande de création. Régressions moteur, tournoi, tutoriel
et interfaces Qt/Chromium/Firefox/WebKit exécutées en CI.

**Canal :** développement (DEV). **Stable 0.7.1 inchangée.**
