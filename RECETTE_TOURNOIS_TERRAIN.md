# Recette terrain — tournois multijoueurs (0.7.1 DEV)

**Statut : à exécuter sur appareils réels.** Les contrôles CI vérifient cinq navigateurs isolés, mais ne remplacent pas un réseau Wi-Fi et le pare-feu d'Ubuntu MATE.

## Préparation

- Installer la dernière version du canal **DEV** sur l'hôte Ubuntu MATE.
- Prévoir quatre navigateurs joueurs indépendants (A, B, C, D), plus un appareil spectateur. Le PC hôte sert d'organisateur et peut également afficher la régie.
- Placer les appareils sur le même réseau local ; vérifier qu'aucune isolation des clients Wi-Fi n'empêche leur communication.
- Noter version, modèle/OS/navigateur de chaque appareil, réseau testé, heure, résultat **OK / KO / non testé**, captures d'écran et logs utiles.
- Effectuer les premiers essais sans modifier manuellement UFW : son ouverture/fermeture doit être gérée par l'application.
- Avant de tester l'expiration du LAN, enregistrer les résultats : une partie active ou une diffusion autorisée doit maintenir le réseau ouvert.

## Parcours d'acceptation à quatre joueurs

| ID | Action | Résultat attendu | Résultat terrain |
| --- | --- | --- | --- |
| T01 | Ouvrir **Partie → Tournois**, créer une élimination directe avec A/B/C/D et lancer le premier tour. | Deux rencontres indépendantes ; chaque joueur est inscrit une fois, sans plateau fantôme. | À renseigner |
| T02 | Scanner le QR **joueur** depuis chacun des quatre appareils ; autoriser chaque connexion une seule fois. | Deux factions par match, attribuées par le tirage ; autorisations propres à chaque appareil. | À renseigner |
| T03 | Effectuer au moins un coup légal de chaque rencontre à quelques secondes d'intervalle. | Les plateaux, tours, historiques et chronomètres ne se mélangent pas. | À renseigner |
| T04 | Scanner le QR **spectateur** depuis un cinquième navigateur et autoriser l'accès. | Accès à la régie en lecture seule ; aucune commande de déplacement, ni d'arbitrage. | À renseigner |
| T05 | Laisser tourner l'affichage spectateur au moins 30 secondes. | Rotation des deux rencontres environ toutes les 12 secondes ; noms et factions affichés correctement. | À renseigner |
| T06 | Effectuer une prise réelle dans chaque partie, lorsque les positions le permettent. | Chaque animation se rapporte à la bonne rencontre ; aucune capture ne modifie l'autre plateau. | À renseigner |
| T07 | Déconnecter provisoirement le Wi-Fi d'un joueur puis rouvrir le QR du tournoi sur le même navigateur. | Reconnexion à la bonne rencontre, sans nouvelle autorisation, avec l'historique conservé ; traitement de la suspension selon le délai écoulé. | À renseigner |
| T08 | Ouvrir le même QR sur un appareil inconnu ou après effacement des identifiants locaux. | Une nouvelle autorisation de l'hôte est requise ; aucun vol de place. | À renseigner |
| T09 | Terminer les deux demi-finales et créer la ronde suivante depuis l'hôte. | Une seule finale, opposant aux deux vainqueurs réels ; résultats précédents conservés. | À renseigner |
| T10 | Rejoindre la finale depuis les appareils déjà approuvés, avec le même QR. | Les deux finalistes accèdent à leur nouvelle partie sans demande d'autorisation. | À renseigner |
| T11 | Jouer la finale jusqu'à la victoire ou conclure par abandon volontaire. | Champion correctement enregistré ; classement et historique cohérents ; aucune troisième ronde créée. | À renseigner |
| T12 | Fermer puis relancer l'hôte et consulter le tournoi. | Finale, champion et toutes les parties sauvegardées restent consultables. | À renseigner |
| T13 | Fermer toute activité, toutes les diffusions et toutes les fenêtres de régie, sans partie active. | Le serveur LAN et la règle UFW temporaire disparaissent après la période de grâce de 60 secondes ; la boucle locale reste disponible. | À renseigner |
| T14 | Démarrer une nouvelle partie, reprendre une sauvegarde puis rouvrir un tournoi. | Le LAN se réactive automatiquement ; aucune ouverture manuelle en doublon. | À renseigner |

## Contrôles complémentaires

- **Temps et sécurité** : essai avec une horloge active, interruption réseau, reconnexion après un délai supérieur au délai autorisé, révocation puis nouvelle demande d'accès.
- **Tournois alternatifs** : un suisse avec cinq joueurs (exemption et points), une élimination avec cinq joueurs (qualifications automatiques) et une partie nulle en élimination (revanche dans la même ronde).
- **Régie graphique** : plusieurs scènes de capture simultanées sur un appareil suffisamment puissant ; vérifier fluidité, audio, identification des joueurs et charge du navigateur.
- **Ubuntu** : lors du test T13, observer sans modifier les connexions et le pare-feu avec `ss -ltn | grep ':8766'` et `sudo ufw status`. Ne pas conclure à une anomalie si la présence d'une autre activité autorisée empêche légitimement la fermeture.

## Critères de clôture

La priorité « recette des tournois » n'est clôturée que lorsque T01–T14 sont exécutés sans anomalie bloquante sur les appareils physiques, que les anomalies sont documentées et corrigées, et que les tests CI correspondants sont au vert. **Ne pas promouvoir en stable sur la seule réussite du pipeline.**
