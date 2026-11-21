# Álfastafl 0.7.1-dev6 — Fermeture automatique du LAN inactif

## Un accès réseau uniquement pendant son utilisation

- Après la fermeture de la dernière activité protégée, le contrôleur
  Qt lance une période de grâce de **60 secondes**.
- Sans nouvelle activité, le serveur réseau sur l'adresse IP privée
  s'arrête d'abord, puis le bail UFW temporaire est supprimé.
- Le serveur local **127.0.0.1** continue de fonctionner et le PC hôte
  conserve ses sauvegardes, ses tournois et la possibilité de rejouer.

## Aucune fermeture pendant une activité réelle

- Partie active, même si le deuxième joueur n'est pas encore connecté.
- Partie suspendue pour déconnexion, attente de remplaçant ou arbitrage.
- Tutoriel partagé actif avec actualisations régulières.
- Spectateurs autorisés suivant un match terminé ou un tournoi en cours.
- Régie de diffusion et préparation hôte d'une partie ou d'un tournoi.

Les vues hôte utilisent une activité temporaire, limitée et protégée
par une route HTTP accessible uniquement au navigateur sur la boucle
locale. Les invités inconnus ne peuvent pas prolonger le bail UFW.

## Réouverture et compatibilité

- Créer ou reprendre une partie, ouvrir un tournoi ou un tutoriel
  déclenche l'ouverture LAN comme en DEV4.
- Le bouton **Réactiver le partage** dans le tutoriel redemande
  automatiquement le LAN si nécessaire.
- Les historiques, les règles de jeu et les résultats de tournoi
  ne sont pas modifiés.

## Validation

Nouveaux contrôles des temporisations et de la fermeture dans l'ordre
serveur → pare-feu, tests sur parties actives, sauvegardes, reconnexion,
tutoriel et diffusion ; tests Python et Chromium du jeu/tournoi restent
obligatoires dans les pipelines DEV et stable.

**DEV 0.7.1-dev6 — Debian `0.7.1~dev6`. Stable 0.7.0 inchangée.**

La validation réelle des périphériques, du réseau Wi-Fi et des règles
UFW sur Ubuntu MATE reste à effectuer avant la prochaine stable.
