# Álfastafl 0.7.1-dev4 — Activation automatique du réseau local

## Plus d'ouverture manuelle du LAN

- **Fichier → Nouvelle partie** : le menu déclenche automatiquement
  l'ouverture du réseau local. La création d'une partie fonctionne
  également si le menu natif a été contourné.
- **Fichier → Sauvegardes** : sélectionner une partie sauvegardée ou
  demander la reprise d'une partie suspendue ouvre automatiquement
  le réseau si nécessaire.
- **Partie → Tutoriel** et les **tournois** déclenchent également
  l'ouverture du LAN, afin de rendre leurs QR codes disponibles.
- Suppression de la commande **Réseau → Activer accès LAN**.
  Le menu Réseau conserve les connexions et demandes d'autorisation.
- Les demandes répétées n'ouvrent ni second serveur ni seconde règle UFW.

## Sécurité et disponibilité

- Au lancement d'Álfastafl, aucun serveur LAN n'est encore ouvert :
  le programme reste sur la boucle locale jusqu'à une activité de l'hôte.
- Une éventuelle autorisation système **polkit** reste nécessaire
  pour ajouter une règle UFW temporaire.
- Le réseau est limité à l'adresse IPv4 et au sous-réseau privés détectés,
  et au seul port TCP 8766.
- En cas de refus ou d'indisponibilité réseau, le jeu reste localement
  utilisable sans interrompre les sauvegardes.
- L'arrêt du programme ferme automatiquement le serveur LAN
  et sa règle UFW. La mise à jour conserve cette fermeture préalable.
- Les clients LAN ne peuvent pas déclencher l'ouverture du pare-feu :
  la demande exige le PC hôte local et un en-tête spécifique.

## Compatibilité

Les règles, sauvegardes, tournois simultanés, tutoriel partagé, droits
des joueurs et animations 3D sont inchangés. Stable 0.7.0 intacte.

**Canal DEV : paquet Debian `0.7.1~dev4`.**
