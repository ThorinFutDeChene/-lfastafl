# Álfastafl 0.7.1-dev1 — Fenêtre normale et aide tournoi

## Sortie du plein écran sur le PC hôte

- La barre de menus contient maintenant **Affichage → Quitter le
  plein écran (F11)**.
- La fenêtre repasse en mode normal Ubuntu et retrouve ses bordures.
  Le menu propose alors **Passer en plein écran (F11)**.
- **F11** déclenche la même action à tout moment.
- Le changement d'affichage est indépendant de la partie en cours,
  des connexions LAN, des sauvegardes et de la caméra.

## Bouton « ? » à droite du format de tournoi

Dans **Partie → Tournois et tirage des factions**, un bouton
**?** visible à droite de « Type de tournoi » affiche une
explication propre à l'option choisie :

- **Suisse** : rondes définies à l'avance, participants toujours
  en lice, classement 3 points par victoire et 1 par nul,
  appariements par score et évitement des rencontres répétées.
  Les exemptions à nombre impair ne rapportent actuellement
  aucun point automatique.
- **Élimination directe** : le vainqueur avance et le perdant
  est éliminé. Les tableaux de 2, 4, 8 ou 16 joueurs sont à
  privilégier. Gestion incomplète des exemptions et matchs nuls.
- **Toutes rencontres** : confrontation successive des participants,
  avec la réserve actuelle du calendrier à effectif impair.

L'aide s'ouvre au clic, s'adapte au changement du type choisi et
se referme au second clic. Marquage accessible `aria-expanded`
et `aria-controls`, focus clavier et contraste.

## Tests et périmètre

Tests unitaires de la transition Qt plein écran/fenêtré, scénarios
Chromium sur le placement et les explications du bouton ?, et
recette complète existante de démarrage Qt, serveur, tutoriel et 3D.

**DEV 0.7.1-dev1 — paquet Debian `0.7.1~dev1`.**
**Stable 0.7.0 inchangée.** Aucune migration de sauvegardes.
