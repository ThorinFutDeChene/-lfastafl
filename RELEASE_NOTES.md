# Álfastafl 0.5.1-dev4 — le PC hôte peut jouer

Cette préversion reprend toutes les fonctions de la **0.5.1-dev3** : plateau 3D, invités immersifs, suppression de sauvegardes et redémarrage automatique après mise à jour.

## Nouveau : jouer en tant qu'hôte

- La rubrique **Héberger → Sur ce PC** propose trois rôles avant création : **Héberger seulement (spectateur)**, **Jouer les Nains** et **Jouer les Elfes**.
- Le PC hôte peut jouer directement sur son plateau 3D, en conservant toutes les commandes d'administration, le tutoriel et l'affichage de la partie. Les clics, glisser-déposer, captures et chronomètres utilisent **exactement** la même validation serveur que les clients distants.
- Une partie existante dispose dans **Gestion de la partie → Jouer sur le PC hôte** des boutons **Jouer les Nains / Jouer les Elfes / Rester spectateur**.
- Aucun camp ne peut être attribué simultanément à un joueur distant et au PC hôte. Un camp occupé est désactivé dans l'interface et refusé par le serveur.
- Avant les premiers coups et avant le démarrage des chronomètres, l'hôte peut changer de camp ou retourner au rôle de spectateur. Changer de camp après le début est refusé.
- Si la partie est sauvegardée/fermée, les sessions sont révoquées ; après **Reprendre la partie sauvegardée**, l'hôte peut reprendre le camp libre. Le chronomètre d'une partie minutée démarre quand les deux joueurs ont rejoint la partie.
- Les appareils invités ne peuvent pas utiliser les nouvelles commandes hôte, ni s'arroger un camp déjà occupé. L'hôte conserve la possibilité de rester simple spectateur et de projeter la partie.

## Validation

Tests Python et HTTP : authentification du PC hôte, sélection des deux camps, coups légaux, tour de jeu, collision d'attribution des camps, refus des invités, changement de camp avant partie, stabilité des horloges et reprise après sauvegarde. Tests Chromium : création d'une partie avec camp hôte, déplacement réel du PC hôte sur le plateau 3D, présence d'un adversaire distant, sélection du camp sur une partie existante et conservation du rôle après rafraîchissement.

La chaîne DEV exécute aussi les contrôles habituels du moteur, du tutoriel, des figurines 3D, du LAN, des sauvegardes et des mises à jour. Les premiers essais avec un véritable Ubuntu MATE et des téléphones restent à confirmer.

## Distribution

Version Debian **0.5.1~dev4**, canal **Mises à jour → Développement (DEV)**. La stable **0.5.0** reste inchangée.
