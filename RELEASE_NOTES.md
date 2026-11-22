# Álfastafl 0.7.2 — Version stable

La **0.7.2 stable** reprend la **0.7.2-dev6** validée et succède à la **0.7.1**.
Elle conserve les parties en cours et les résultats de tournoi enregistrés.

## Tournois organisés depuis le PC hôte

- Création sans saisie préalable des participants : inscriptions par QR code
  joueur avec pseudo, validation/refus directement dans la marge du PC hôte.
- Le PC hôte est organisateur et spectateur ; il ne joue pas dans le tournoi.
  Le premier tirage est lancé depuis la marge, puis les rencontres, factions
  équilibrées, rondes, revanches et petites finales avancent automatiquement.
- Plateau plein écran sur téléphone (2D/3D), écran d'attente entre les
  rondes, révélation des factions et indication de l'adversaire.
- Attribution des récompenses en fin de tournoi : coupe d'or, médaille
  d'argent, médaille de bronze et classement affiché sur les appareils.

## Cinématiques et spectateurs

- Les tournois utilisent les mêmes cinématiques de captures, combats,
  prises du roi et fuite du roi que les parties classiques (8 secondes).
  Les chronomètres sont suspendus pendant les scènes.
- Correction des rencontres de tournoi encore en cours provenant des
  préversions qui désactivaient les cinématiques.
- QR code spectateur donnant accès directement au plateau, sans demande
  d'autorisation, en lecture seule.
- Limite de **10 appareils spectateurs** par défaut (réglable de 0 à 100),
  hors PC hôte et appareils joueurs. Diffusion tournante des rencontres
  simultanées avec encarts pour les captures.

## Sauvegardes et historique

- Ouverture du réseau local automatiquement lorsqu'une partie démarre
  ou reprend ; interfaces mobiles simplifiées.
- Les **parties terminées ne conservent plus de fichier de sauvegarde** ;
  les parties interrompues restent sauvegardées et reprenables.
- Les **résultats et classements des tournois terminés** restent
  consultables dans un historique distinct.
- Suppression d'anciens tournois après confirmation ; une rencontre
  encore active ne peut pas être supprimée. Les autres tournois et
  parties individuelles sont préservés.
- Reprise des inscriptions et données de tournoi après redémarrage
  de l'hôte.

## Compatibilité et validation

La version 0.7.2 stable porte le **paquet Debian `0.7.2`**
et le tag **`v0.7.2`** (sans suffixe DEV).
Les règles historiques, le réseau local et les sauvegardes de parties
non terminées restent compatibles.

Recette automatisée sur Ubuntu et navigateurs Chromium, Firefox et
WebKit (moteur Safari) ; tests des tournois simultanés, des cinématiques,
de la connexion des joueurs et de la consultation/suppression des archives.
