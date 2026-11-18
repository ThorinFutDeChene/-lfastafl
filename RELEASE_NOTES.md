# Álfastafl — 0.3.0-dev1 (DEV)

## Nouvelle priorité critique : chronomètres et continuité

- Trois modes T3 : illimité, délai par coup, temps total indépendant pour chaque joueur.
- Défaite immédiate au temps, prononcée par le serveur et conservée dans l'historique d'événements.
- Affichage des horloges sur Ubuntu et navigateurs, avec temps serveur de référence.
- Détection d'absence des joueurs (grâce par défaut de 15 s), pause des deux horloges.
- Reconnexion avant échéance : reprise des horloges ; délai par défaut de 5 minutes configurable.
- À l'expiration : décision **non automatique** de l'hôte (forfait, remplaçant ou sauvegarde).
- Sauvegarde/reprise manuelle, parties listées, nouvelles invitations et révocation des anciennes sessions.
- Reprise des durées sans débit pendant la fermeture du programme ; écritures atomiques et points de contrôle réguliers.
- Conservation de l'arbitrage en attente en cas de sauvegarde pendant une répétition historique.
- Persistance du jeton de session sur l'appareil du joueur pour permettre une reconnexion après réouverture du navigateur.
- Compatibilité de lecture avec les sauvegardes `.alfastafl` des versions antérieures.

## Vérifications et limites

Les tests automatisés vérifient les horloges avec temps simulé, la présence des joueurs,
les endpoints HTTP, l'expiration, la reprise et la conservation des sauvegardes.
Le rendu de l'interface a été contrôlé dans Chromium à partir d'un état simulé ;
l'application Qt et les connexions de vrais smartphones doivent encore être validées sous Ubuntu MATE.

Le réseau LAN reste en HTTP non chiffré, sans commande automatique d'UFW ni découverte Avahi.
La détection est basée sur des requêtes périodiques du navigateur, qui peuvent être
ralenties sur les appareils mobiles en veille. La 3D, les effets sonores,
les cinématiques et les règles de forteresse atypiques restent incomplets.
Les cinématiques futures devront suspendre les horloges ; ce mécanisme n'est pas
encore testable car le moteur d'animations n'existe pas.
