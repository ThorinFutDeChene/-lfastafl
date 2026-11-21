# Álfastafl 0.7.1-dev3 — Tutoriel partagé en direct

## Présentation depuis le PC hôte

- Le tutoriel reste piloté exclusivement depuis le PC Ubuntu hôte :
  choix de l'exercice, sélection, coups et navigation.
- Un QR code est visible **dans la fenêtre du tutoriel** lorsque le LAN
  est volontairement activé. Il mène directement à la page spectateur.
- Téléphones, tablettes et autres ordinateurs voient les positions du
  plateau 3D, les indications, les cases sélectionnées, les coups légaux,
  les déplacements confirmés et le passage à l'exercice suivant.
- L'invité peut régler sa caméra, la qualité 3D ou choisir la vue 2D,
  mais ne peut modifier aucune pièce.
- Une invitation peut être utilisée par plusieurs appareils.

## Réseau et sécurité

- Partage en lecture seule, avec jeton temporaire imprévisible.
- Le serveur synchronise les positions du cours et non une capture
  vidéo du bureau Ubuntu.
- Bouton d'arrêt et de réactivation du partage dans le tutoriel.
- Fermer la présentation, couper le LAN ou laisser expirer le serveur
  révoque l'accès ; fermer la fenêtre native tente aussi une révocation
  immédiate.
- L'ouverture du LAN exige toujours l'action explicite de l'hôte.
- Aucun changement aux sauvegardes, parties, tournois ou rôles joueurs.

## Tests

Tests Python des droits d'accès, du QR, des coups, de la révocation et
de l'absence de persistance. Recette Chromium de la véritable URL
du QR, des sélections, du changement de leçon et de la fermeture.
Régressions existantes Qt, tutoriel, tournois et 3D conservées.

**DEV 0.7.1-dev3 — paquet Debian `0.7.1~dev3`. Stable 0.7.0 inchangée.**
