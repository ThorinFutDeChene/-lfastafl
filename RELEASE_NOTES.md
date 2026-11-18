# Álfastafl — 0.3.0-dev2 (DEV)

## Correction critique : serveur LAN et UFW automatiques

- Le jeu ouvre automatiquement son serveur réseau privé après démarrage du bureau Ubuntu.
- Autorisation Linux demandée par **polkit** ; aucune commande UFW à saisir par l’utilisateur.
- Le port TCP **8766** est autorisé seulement pour l’interface physique Wi-Fi/Ethernet détectée, sur son sous-réseau privé ; aucun port n’est ouvert sur Internet.
- Deux serveurs sur la même machine : administration et affichage local sur `127.0.0.1:8766`, invités sur l’adresse LAN du Lenovo. Pas d’écoute générale sur `0.0.0.0` dans l’application graphique.
- Les QR codes et invitations s’affichent uniquement quand l’accès LAN est réellement opérationnel ; l’adresse IP provient de l’interface choisie, pas d’un itinéraire VPN.
- À la fermeture et à la désactivation du LAN, **seule la règle créée par Álfastafl** est supprimée ; les règles UFW d’Enyalië ou des autres services sont préservées.
- Un helper privilégié surveille la fermeture du processus par un canal privé ; nettoyage de la règle même après arrêt anormal du jeu, quand le helper est encore actif.
- Après une panne électrique ou un arrêt forcé du helper lui-même, nettoyage des règles Álfastafl périmées au lancement suivant.
- Si l’autorisation est refusée, le programme reste utilisable sur son serveur local.

## Vérifications et réserves

- Tests automatisés de détection IPv4, isolation VPN, validation de la portée, cycle de vie des règles et non-interférence avec les autres applications.
- Pas de modification globale d’UFW, pas d’élévation permanente des droits du jeu.
- Les tests ne remplacent pas un essai réel avec **UFW actif et polkit sous Ubuntu MATE**.
- Le transport réseau est encore du HTTP non chiffré, à réserver à un LAN de confiance.
- Les cinématiques 3D et les fonctions de régie ne sont pas encore présentes.

## Fonctions déjà présentes (dev1)

Chronomètres T3, suspension/reconnexion, sauvegardes et reprises, règles de Tafl de base et arbitrages, mises à jour DEV et QR joueurs/spectateurs séparés.
