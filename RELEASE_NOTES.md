# Álfastafl 0.7.0-dev8 — Fenêtres plein écran du PC hôte

## Séparation nette entre l'hébergement et l'affichage

- **Fenêtre hôte principale** : démarre toujours maximisée (pas plein
  écran), conserve la barre d'outils d'autorisation LAN, la création
  et la sélection des parties, les sauvegardes, les camps et la
  validation des demandes. **Le plateau n'y est plus affiché** et
  aucun moteur 3D n'y consomme de ressources.
- **Nouvelle fenêtre native Qt plein écran** : ouvre le plateau
  lorsqu'une partie est créée, sélectionnée, lorsque l'hôte
  choisit de jouer les Nains/Elfes ou de rester spectateur, ou
  via le bouton de réouverture de plateau. Un joueur hôte peut
  réellement jouer dans cette fenêtre sans quitter l'administration.
- **Tutoriel** : s'ouvre depuis la fenêtre principale dans une
  autre fenêtre native plein écran. Exercices, légalité et affichage
  3D/2D restent indépendants de la partie et du LAN.
- **Menu ☰** du plateau pour les réglages, **F11** pour basculer
  entre plein écran et fenêtre ordinaire, **Fermer** pour retourner
  à l'administration sans arrêter la partie ni le serveur.
  La fermeture du logiciel referme proprement toutes ses fenêtres.

## Invitation spectateurs sur le plateau

- En jeu **et** en mode hôte spectateur, QR code
  **« SPECTATEURS »** en coin inférieur droit.
- Il pointe uniquement vers l'invitation spectateur de la partie
  affichée. La demande **ne donne jamais automatiquement accès** :
  l'hôte doit l'autoriser dans la fenêtre de gestion.
- QR visible uniquement quand l'accès LAN a été volontairement
  activé, masqué dès sa désactivation, actualisé seulement si
  l'URL/invitation change.
- Les invités distants conservent leur interface actuelle. Aucun
  droit supplémentaire accordé, pas de port ouvert au démarrage.

## Compatibilité et validation

- Moteur de jeu Tafl, animations, son, chronomètres, sauvegardes,
  autorisations LAN et historique préservés.
- La stable 0.5.0 reste inchangée.
- Tests Python pour les deux modes de fenêtres Qt ; nouveaux
  scénarios Chromium pour la séparation gestion/plateau, la fenêtre
  tutoriel, l'hôte joueur ou spectateur, le QR et la fermeture /
  réouverture du plateau.
- **Tests physiques sur Ubuntu MATE requis**, notamment l'usage
  sur plusieurs moniteurs et le comportement de QtWebEngine.

**Distribution :** canal DEV, paquet Debian `0.7.0~dev8`.
