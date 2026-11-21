# Álfastafl 0.7.0-dev7 — Origine des flèches sur l'arc elfique

## Correctif 3D

**Défaut :** les flèches semblaient sortir de la poitrine des elfes,
car les cinématiques utilisaient une hauteur fixe par rapport au corps
plutôt que la géométrie de l'arme.

**Correction :**
- Point d'ancrage `combat-bow-nock` ajouté au **milieu de la corde de
  l'arc déjà sculpté**, attaché au bras gauche articulé.
- La flèche devient visible **encochée et alignée** vers la cible avant
  le lâcher. Son extrémité arrière rejoint exactement la corde, même
  lorsque l'elfe tourne ou lève le bras.
- Trajectoires calculées à partir du nock 3D transformé en coordonnées
  monde, y compris les impacts et ricochets contre le bouclier.
- L'ancienne flèche décorative figée en travers du buste reste
  présente sur les figurines de jeu immobiles mais est retirée
  des versions articulées, qui utilisent une véritable flèche animée.
- Mise en cohérence de **tous les tirs elfes** : prise en étau,
  capture contre le trône vide (première flèche parée et seconde
  flèche décisive) et captures ordinaires. Les combats de nains,
  les attaques collectives contre le roi et la fuite à cheval ne
  sont pas modifiés.

## Validation

- Régression Chromium : le test compare la vraie position du nock
  et la pointe arrière du projectile (tolérance < 0,005 case),
  vérifie son départ depuis l'arc et le deuxième tir en situation
  contre le trône et en duel classique.
- Aucune modification du Tafl (coups légaux, captures, horloges),
  de la sauvegarde, de l'état de la partie ou des accès réseau.
- Articulations et flèches procédurales 3D locales, sans nouveaux
  téléchargements ni données réseau.
- Essais visuels sur Ubuntu MATE, tablette et téléphone à confirmer.

## Distribution

- Paquet Debian **0.7.0~dev7** sur le canal **DEV**.
- Stable 0.5.0 inchangée.
