# Álfastafl 0.5.1-dev2 — redémarrage automatique après mise à jour

Cette préversion conserve toutes les fonctions de la **0.5.1-dev1** (plateau 3D immersif réservé aux invités autorisés) et ajoute un processus fiable de redémarrage après une installation Debian réussie.

## Nouveau : mise à jour puis redémarrage

- Une fois la mise à jour APT terminée **avec succès**, l'ancienne application se ferme et la nouvelle version s'ouvre automatiquement, sans message modal demandant de le faire manuellement.
- La relance est programmée par un processus détaché **sans privilèges root**, sans appel à un shell ; il attend la fermeture effective de l'ancienne application avant de lancer le binaire /usr/bin/alfastafl.
- Détection des processus *zombies* et des PID réutilisés ; pas de seconde instance tant que l'ancienne reste active. En cas de blocage prolongé, le processus auxiliaire cesse ses tentatives.
- Les parties sont sauvegardées et mises en pause lors de la fermeture, avec horloges suspendues. L'accès LAN et les règles temporaires de pare-feu sont fermés comme lors d'un arrêt normal ; ils ne sont **jamais** rouverts automatiquement.
- Refus de l'utilisateur, erreur APT ou échec de vérification : **aucune relance**. Si seul le démarrage auxiliaire échoue après une installation réussie, le programme reste ouvert et indique qu'une relance manuelle est nécessaire.
- La validation des téléchargements et l'accord préalable de l'utilisateur restent obligatoires.

**Important :** le redémarrage automatique ne peut prendre effet que si la version en cours d'exécution contient déjà ce mécanisme. L'installation de la 0.5.1-dev2 depuis une version antérieure demandera une dernière relance manuelle. À partir des mises à jour suivantes, la relance sera automatique.

## Conservé depuis 0.5.1-dev1

- Accès aux joueurs et spectateurs via invitation et validation par l'hôte.
- Plateau 3D en plein espace disponible sur téléphone, tablette ou ordinateur invité autorisé.
- Petit menu de commandes ☰, séparation des droits joueur/spectateur, horloges et arbitrages visibles.
- Retour à la demande d'accès si l'autorisation est révoquée.
- Les 3 variantes, les parties/sauvegardes et les 28 exercices du tutoriel local restent inchangés.

## Validation

Des tests unitaires vérifient l'attente de l'ancienne instance, les processus zombies, la protection contre la réutilisation de PID, l'absence de seconde copie en cas de timeout, le lancement sans privilèges, ainsi que la fermeture du LAN avant relance. Les parcours Qt sont testés pour installation réussie, refus APT et échec de relance. La chaîne de publication exige aussi les tests du moteur, le tutoriel Chromium et les scénarios du plateau 3D.

La validation sur l'environnement Ubuntu MATE réel et lors d'une mise à jour APT sur un poste utilisateur reste à effectuer.

## Distribution

Paquet Debian **0.5.1~dev2**, canal **Mises à jour → Développement (DEV)**. La stable **0.5.0** reste inchangée.
