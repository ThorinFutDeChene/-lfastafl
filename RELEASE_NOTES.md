# Álfastafl 0.3.0 — canal stable

## Première publication sur le canal stable

Cette version reprend le moteur et l'interface de **0.3.0-dev2**. L'installation est publiée sous le numéro Debian `0.3.0` et sans indication DEV dans l'application.

### Fonctionnalités disponibles

- Plateau 11×11 avec trois variantes de règles en cours de validation.
- Partie sur Ubuntu et accès de joueurs/spectateurs depuis le réseau local avec QR codes distincts et autorisation par l'hôte.
- Serveur local de l'hôte et serveur LAN sur IPv4 privée ; gestion ponctuelle et limitée d'une règle UFW après authentification polkit, avec nettoyage à la fermeture.
- Chronomètres, suspension lors des déconnexions, sauvegarde automatique et reprise des parties.
- Fenêtre maximisée au démarrage, menu de vérification des mises à jour et sélection Stable / DEV.

### Réserves de validation

- **Le cycle réel polkit / UFW et les connexions depuis des smartphones sur Ubuntu MATE ne sont pas encore validés.** L'automatisation du pare-feu a été testée par simulation ; ne pas la considérer comme certifiée sur toutes les distributions.
- Le transport HTTP du LAN n'est pas chiffré : usage uniquement sur un réseau privé de confiance, sans ouverture de routeur vers Internet.
- Certaines règles particulières de Tafl, la 3D, les cinématiques et la régie multi-parties restent inachevées. Cette version stable 0.3.0 ne prétend pas être la version fonctionnellement complète 1.0.

### Mise à jour depuis une DEV

Le numéro Debian `0.3.0` est plus récent que `0.3.0~dev2`. Les sauvegardes utilisateurs et les paramètres XDG sont conservés lors de l'installation. Le canal de mise à jour déjà choisi n'est pas modifié automatiquement ; sélectionner **Stable** pour ignorer les futures préversions.
