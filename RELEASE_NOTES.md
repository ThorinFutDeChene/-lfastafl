# Álfastafl 0.5.1-dev1 — plateau immersif pour invités

La DEV **0.5.1-dev1** reprend les fonctions de la stable **0.5.0** et ajoute un affichage plein plateau pour les appareils invités autorisés.

## Nouveautés

- Dès l'approbation de l'hôte, téléphone, tablette et ordinateur invités basculent automatiquement vers un **plateau occupant toute la fenêtre**.
- **Joueurs et spectateurs** bénéficient du plateau 3D ; seuls les joueurs peuvent déplacer les pièces. La validation d'accès est effectuée par le serveur, jamais sur la simple présence d'un lien ou d'un jeton non validé.
- Disparition des panneaux d'hébergement, du formulaire de demande, de l'historique et des explications hors plateau.
- Bouton discret **☰** donnant accès aux commandes 3D/2D, caméra, zoom, qualité et aux actions réservées au joueur.
- Chronomètres affichés uniquement lorsque la partie est chronométrée. Alertes et procédures d'arbitrage conservées au-dessus du plateau.
- La réouverture après autorisation conserve le mode immersif ; la révocation du droit d'accès réaffiche le formulaire de connexion sans conserver d'ancien état de partie visible.
- Aucun changement du comportement du PC hôte, du tutoriel ou du contrôle LAN volontaire.

## Vérifications

Les tests automatisés comprennent les validations Python, les interactions asynchrones, le tutoriel Chromium et les parcours de jeu 3D, ainsi que l'approbation effective par l'hôte, un appareil mobile, le retour en 2D et la perte d'autorisation. La publication est bloquée si ces scénarios échouent. Contrôle physique restant nécessaire sur Ubuntu MATE, Android, iOS et tablettes.

Il s'agit d'un affichage *plein plateau dans la fenêtre*. Le navigateur conserve ses commandes système, sauf action spécifique de l'utilisateur.

## Distribution

Version Debian `0.5.1~dev1`, proposée via **Mises à jour → Développement (DEV)** ; la **0.5.0 reste la stable de référence** et les sauvegardes sont conservées.
