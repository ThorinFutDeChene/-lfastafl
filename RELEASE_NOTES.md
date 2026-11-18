# Álfastafl — 0.1.0-dev3 (préversion)

## Nouveau : mises à jour de l'application Ubuntu

- Menu natif **Mises à jour** avec canaux **Stable** et **DEV**.
- Vérification non bloquante des Releases GitHub au démarrage (désactivable).
- Téléchargement de la nouvelle version après accord de l'utilisateur.
- Vérification des empreintes **SHA-256**, des métadonnées du paquet Debian et des versions.
- Installation après seconde confirmation avec authentification Linux via `pkexec` et APT.
- Les erreurs réseau ne bloquent pas le jeu ; possibilité de poursuivre hors ligne.
- Préférences enregistrées dans le répertoire XDG de configuration.

## Maintenu depuis 0.1.0-dev2

- QR joueur à gauche et QR spectateur à droite, sans rafraîchissement des images QR.
- Plateau 11×11 de démonstration, trois variantes en cours de vérification, serveur LAN et invitations.
- Sauvegardes automatiques `.alfastafl` et premiers outils de tournoi.

## Limites

Il s'agit toujours d'une **version de développement**, sans véritable rendu 3D, cinématiques de combat, régie complète, minuterie ni gestion UFW automatique. Le contrôle des mises à jour concerne **l'application Ubuntu** ; les navigateurs invités reçoivent déjà les pages du serveur et n'installent aucun paquet.

La mise à jour de la version dev2 vers dev3 nécessite une installation manuelle **une seule fois**, puisque dev2 ne contient pas de vérificateur de mises à jour.
