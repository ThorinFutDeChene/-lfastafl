# Álfastafl 0.3.1 — canal stable

## Comportement du partage local

Cette version stable reprend le comportement de **0.3.1-dev1** et succède à la [stable 0.3.0](https://github.com/ThorinFutDeChene/-lfastafl/releases/tag/v0.3.0) :

- À chaque lancement, le bouton **Activer accès LAN** est décoché et cliquable. Le jeu reste utilisable localement ; aucune activation LAN ni demande d'autorisation du pare-feu ne démarre automatiquement.
- Un clic active le partage avec la gestion UFW existante, limitée au réseau privé et au port TCP 8766.
- La désactivation manuelle ou la fermeture normale arrête le serveur LAN et retire la règle UFW créée pour la session.
- L'état actif n'est jamais mémorisé : le lancement suivant reste en mode local.
- Le message affiché sur l'accueil indique désormais comment activer le partage depuis la barre d'outils.

## Validation

- La 0.3.1 a passé **147 tests automatisés**, dont les contrôles du démarrage local, de l'activation par clic, de la fermeture et du relancement avec le LAN désactivé.
- Le cycle normal UFW et la connexion des joueurs ont été confirmés par l'utilisateur sur sa configuration Ubuntu MATE avec la **0.3.0**.
- Le nouveau démarrage manuel doit encore être confirmé sur le poste réel : démarrage local, activation manuelle, fermeture et relancement local.
- Le déroulement complet d'une partie, la reprise après déconnexion et le nettoyage après arrêt brutal restent à vérifier en conditions réelles.

Le protocole LAN reste en HTTP sur réseau privé de confiance. Les réserves de validation du moteur de règles et les fonctionnalités encore inachevées de la 0.3.0 s'appliquent également à cette version.

## Distribution

Version Debian : `0.3.1`, plus récente que `0.3.1~dev1` et `0.3.0`. Les sauvegardes et paramètres utilisateurs sont conservés. Les nouvelles installations choisissent le canal **Stable** par défaut ; les installations existantes conservent leur choix. Pour recevoir uniquement les versions stables, sélectionner **Mises à jour → Stable**.
