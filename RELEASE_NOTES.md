# Álfastafl 0.7.1-dev2 — Tournois multi-rencontres et diffusion spectateur

## Matchs simultanés

- Un tournoi à quatre joueurs crée **deux rencontres indépendantes** à la première ronde. Les horloges n'avancent pas tant que les deux adversaires de la rencontre ne sont pas connectés.
- Chaque joueur autorisé peut démarrer sa rencontre à l'heure où son adversaire est disponible, sans attendre les autres matchs.
- Le menu **Partie → Tournois et tirage des factions → Diffuser les rencontres sur cet écran** active la régie automatique du PC hôte.
- L'écran hôte fait tourner les parties actives à environ **8,5 secondes** par plateau, avec **numéro de ronde et noms des adversaires**, et propose une commande d'arrêt.

## QR codes et appareils

- Les QR **Joueurs** et **Spectateurs** restent stables pendant la rotation, car ils invitent au tournoi et non à une partie particulière.
- Au premier accès, le participant déclare son **nom exact**, le serveur l'associe automatiquement à sa rencontre et à son camp, puis **l'hôte doit autoriser**.
- Une fois accepté, un **jeton de terminal aléatoire** est conservé par le navigateur et uniquement son empreinte est stockée sur le PC hôte. Ce jeton permet de rejoindre d'autres rencontres du même tournoi, y compris après redémarrage, sans nouvelle autorisation.
- Les adresses MAC ne sont **pas accessibles aux navigateurs** et ne servent pas d'identifiant. Après effacement du stockage du navigateur, changement de l'adresse d'origine du serveur ou révocation, la reconnaissance peut nécessiter une nouvelle approbation.
- L'hôte peut afficher les appareils approuvés et révoquer les droits d'une personne pour ce tournoi.

## Régie spectateur et captures

- Un spectateur approuvé a accès en lecture seule à tous les matchs de son tournoi, avec rotation automatique des plateaux.
- Les captures simultanées sur plusieurs rencontres déclenchent des **encarts cinématiques 3D distincts**, portant chacun le nom des adversaires et le numéro de ronde.
- Aucun spectateur ne peut obtenir un camp, envoyer un coup ou commander une autre partie.
- Les états du tournoi sont diffusés par une API en lecture seule, avec autorisation limitée au tournoi.

## Vérifications et limites

- Nouveaux tests Python : tournoi à quatre joueurs, deux matchs simultanés, attribution des camps, QR global avec validation, conservation des identifiants et reprise après redémarrage, refus inter-tournois, droits de spectateur, révocation et captures simultanées.
- Nouveaux scénarios Chromium : rotation sur le PC hôte et sur le spectateur, encarts simultanés, terminal joueur reconnu et QR de tournoi.
- **Ronde suivante** : reste lancée par l'hôte une fois tous les résultats de la ronde précédente connus. Les limitations préexistantes des effectifs impairs et des matchs nuls en élimination directe restent documentées dans l'aide « ? ».
- **Pas de migration des sauvegardes de parties**, pas de changement des règles Tafl.
- Les performances de rendu 3D sur téléphones/tablettes et Ubuntu MATE réels restent à valider.

**DEV 0.7.1-dev2 — paquet Debian `0.7.1~dev2`. Stable 0.7.0 inchangée.**
