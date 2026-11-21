# Álfastafl 0.7.1-dev2 — Tournois multirencontres

## Plusieurs matchs simultanés
- Quatre inscrits : **deux parties jouables en parallèle** sur
  quatre appareils, avec chronomètres et sauvegardes indépendants.
- Chacun démarre lorsqu'il est disponible et retrouve sa partie
  si son adversaire n'a pas encore commencé. Nouvelle ronde
  préparée par l'organisateur après validation des résultats.

## QR de tournoi et réassociation à un appareil
- **QR joueur et QR spectateur de tournoi** dans la colonne de gauche,
  uniquement lorsque le LAN est volontairement ouvert.
- Première connexion après **accord explicite de l'hôte** ; un
  jeton cryptographique fort et propre au navigateur est enregistré.
- Les rencontres suivantes se rejoignent sans réautorisation
  si ce jeton est reconnu pour le même nom et tournoi.
- Adresse MAC inaccessible depuis le navigateur ; seules les
  **empreintes SHA-256 des jetons** sont enregistrées au serveur.
- Possibilité de **révoquer** les appareils d'un participant.
  Changer d'appareil ou effacer ses données exige un nouvel accord.

## Diffusion du tournoi
- Sur le PC hôte et les appareils spectateurs autorisés, rotation
  automatique des rencontres toutes les **12 secondes**.
- Noms des deux adversaires, camps et nombre de coups affichés.
- L'hôte peut afficher la rencontre suivante ou arrêter le défilement.
- Chaque prise provoque un **encart 3D** légendé avec les noms
  des joueurs concernés. Plusieurs encarts indépendants sont
  affichés simultanément (jusqu'à six selon la puissance du matériel).
- Flux de plateaux 3D en direct : pas de vidéo du bureau de l'hôte.

## Compatibilité et recette
La stable **0.7.0** n'est pas modifiée. Le correctif plein écran F11
et l'aide des formats de tournoi restent intégrés depuis la DEV1.
Les tests couvrent la concurrence, les jetons, les accès spectateurs
et les scènes multiples. Les appareils réels restent à tester.

**Canal DEV — paquet `0.7.1~dev2`.**
