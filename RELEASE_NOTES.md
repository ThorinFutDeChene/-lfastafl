# Álfastafl 0.7.0-dev9 — Interface hôte : plateau unique et menus

## Plein écran simplifié

Le PC hôte démarre **directement sur son unique plateau de jeu**.
L'ancienne fenêtre de gestion indépendante de la DEV8 est remplacée
par les menus de la fenêtre native Qt, même en plein écran. Le
plateau 3D reste visible et jouable lorsqu'aucun dialogue n'est
ouvert ; il ne s'ouvre **plus de deuxième plateau**. F11 permet
de basculer entre plein écran et fenêtre normale.

## Une colonne QR verticale à gauche

- **En haut : QR JOUEUR** demandant à rejoindre le camp disponible.
- **En bas : QR SPECTATEUR** demandant à regarder la partie.
- Le plateau reste en plein écran sur toute la surface **à droite**
  de cette colonne permanente, sans recouvrir les QR.
- QR masqués lorsque le LAN volontaire n'est pas ouvert, lorsque
  la partie n'est pas active ou qu'aucune partie n'est sélectionnée.
- Le QR ne se recharge pas à chaque rafraîchissement.
- L'hôte valide chaque demande : aucun nouveau droit réseau n'est
  attribué par le simple scan.

## Menus natifs et fenêtres de gestion

**Fichier** : Nouvelle partie, Sauvegarder la partie, Sauvegardes
(choisir/reprendre/supprimer), Quitter.

**Partie** : Rôle du PC hôte (Nains/Elfes/Spectateur), historique,
arbitrage et tutoriel.

**Paramètres** : Fenêtre unique regroupant modes et règles, contrôle
du temps, temps de reconnexion, durée des cinématiques,
affichage 2D/3D, qualité 3D, caméra, volume musique et effets.
Les paramètres d'une nouvelle partie ne modifient pas une
partie déjà créée ; ceux de l'affichage et du son sont immédiats.

**Réseau** : Connexions, validation des demandes et activation du LAN,
sans ouverture automatique de ports. **Mises à jour** : commandes
existantes conservées dans la barre des menus.

Toutes les fenêtres de gestion utilisent les contrôles déjà existants
et ne recréent pas de plateau ni de session serveur. Les téléphones,
tablettes et PC invités restent inchangés.

## Tests et distribution

Tests Python et Chromium pour l'interface, création, jeu, sauvegardes,
QR et autorisations, en plus des régressions moteur et 3D. Essais
réels Ubuntu MATE toujours nécessaires avant promotion en stable.

Paquet Debian **0.7.0~dev9** — canal **DEV** uniquement.
La stable 0.5.0 reste inchangée.
