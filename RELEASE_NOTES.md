# Álfastafl 0.5.1-dev3 — suppression des parties sauvegardées

Cette préversion reprend toutes les fonctions de la **0.5.1-dev2**, notamment l'affichage immersif des invités autorisés et le redémarrage automatique après une mise à jour.

## Nouveau : gestion des sauvegardes

- **Supprimer** apparaît à côté de chaque partie de la liste **Parties hébergées et sauvegardées** du PC hôte.
- Une confirmation explicite identifie la partie et avertit que la suppression est définitive.
- La suppression enlève réellement le fichier de sauvegarde `.alfastafl` et la partie de la mémoire du serveur ; elle n'efface aucune autre sauvegarde.
- Si la partie supprimée était sélectionnée, la zone de jeu est désélectionnée et les panneaux correspondants disparaissent.
- Une partie **active** ne peut pas être effacée : il faut d'abord choisir **Sauvegarder et quitter cette partie**. Les parties en pause ou terminées peuvent être supprimées ; les matchs référencés par un tournoi sont protégés.
- Commande **réservée au PC hôte**, refusée par le serveur pour tous les clients distants, même s'ils connaissent l'identifiant du match.
- Nettoyage des invitations, des sessions, des demandes en attente et des états internes liés à la partie effacée. Les appareils distants reviennent au formulaire de demande d'accès.
- Si l'utilisateur annule ou si le disque refuse l'effacement, la sauvegarde est conservée.

## Vérification

Tests Python de suppression : fichier effacé, persistance après redémarrage, refus pour partie active, protection tournoi, annulation via l'interface, gestion des erreurs de disque, sécurité des accès distants et révocation des sessions. Un nouveau scénario Chromium valide les boutons, la confirmation, le refus des parties actives et l'effacement de la partie sélectionnée. Tous les tests existants (moteur, tutoriel, plateau 3D et mise à jour automatique) sont également exécutés avant publication.

## Distribution

Version Debian **0.5.1~dev3**, canal **Mises à jour → Développement (DEV)**. La stable **0.5.0** reste inchangée. Les sauvegardes non supprimées sont conservées et la fonction de redémarrage automatique de la DEV2 reste intégrée.
