# Álfastafl 0.3.1-dev1 — accès LAN désactivé au démarrage

## Comportement du partage local

Cette préversion reprend la base **0.3.0 stable** avec un changement ciblé de l'accès réseau :

- À chaque lancement, le bouton **Activer accès LAN** est décoché et cliquable. Le jeu reste utilisable localement ; aucune activation LAN ni demande d'autorisation du pare-feu ne démarre automatiquement.
- Un clic active le partage avec la gestion UFW existante, limitée au réseau privé et au port TCP 8766.
- La désactivation manuelle ou la fermeture normale arrête le serveur LAN et retire la règle UFW créée pour la session.
- L'état actif n'est jamais mémorisé : le lancement suivant reste en mode local.
- Le message affiché sur l'accueil indique désormais comment activer le partage depuis la barre d'outils.

## Validation

- Le cycle normal UFW et la connexion des joueurs ont été confirmés par l'utilisateur sur sa configuration Ubuntu MATE avec la **0.3.0**.
- Cette modification doit encore être confirmée sur le poste réel : démarrage local, activation manuelle, fermeture et relancement local.
- Le déroulement complet d'une partie, la reprise après déconnexion et le nettoyage après arrêt brutal restent à vérifier en conditions réelles.

Le protocole LAN reste en HTTP sur réseau privé de confiance. Les réserves de validation du moteur de règles et les fonctionnalités encore inachevées de la 0.3.0 s'appliquent également à cette préversion.

## Distribution

Version Debian : `0.3.1~dev1`, plus récente que `0.3.0`. La stable de référence reste **0.3.0**. Les sauvegardes et paramètres utilisateurs sont conservés. Pour recevoir cette préversion via l'application, sélectionner **Mises à jour → Développement (DEV)**.
