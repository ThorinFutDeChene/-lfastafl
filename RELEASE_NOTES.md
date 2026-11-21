# Álfastafl 0.7.0 — Version stable

La **0.7.0 stable** reprend l'intégralité du code de la
**0.7.0-dev12**, après validation automatisée complète.

## Interface et réseau

- **Fenêtre unique plein écran** pour l'hôte Ubuntu : le plateau 3D
  reste visible ; la gestion s'effectue via les menus natifs Fichier,
  Partie, Paramètres, Réseau, Affichage et Mises à jour.
- **Colonne gauche** : QR joueur en haut, QR spectateur en bas ;
  ces invitations apparaissent uniquement si une partie est en cours
  et que l'hôte a explicitement ouvert le réseau local.
- Connexion et attribution de factions sous contrôle du serveur :
  chaque accès nécessite l'accord de l'hôte ; si un camp est déjà
  occupé, seul l'autre est disponible.
- Téléphones, tablettes et ordinateurs invités : plateau immersif
  sans commandes d'administration.

## Plateau, règles et cinématiques

- Plateau 11 × 11 en bois avec figurines 3D d'elfes, de nains et du roi.
- Déplacements animés, musique et effets sonores avec réglages indépendants.
- Captures animées : combats entre elfes et nains, captures utilisant
  le trône vide, affrontement du roi contre deux, trois ou quatre nains
  selon la variante, échappée royale à cheval avec escorte.
- Les flèches des **quatre cases de sortie** pointent désormais
  correctement **vers l'extérieur** (correctif de la DEV12).
- Tutoriel local, parties sauvegardées et reprise.

## Tournois

- Création de rencontres et attribution automatique des factions.
- Première rencontre tirée au sort ; ensuite répartition en faveur
  de la faction la moins jouée, départage sur l'ancienneté du camp
  et ultime tirage au sort en cas d'égalité.
- Historique des parties et des factions conservé lors du redémarrage.

## Vérification et publication

Cette release déclenche à nouveau la suite de tests complète,
avec **démarrage réel de QtWebEngine sous Xvfb**, tests du moteur,
scénarios Chromium du tutoriel, de l'interface et du plateau 3D,
et vérification des quatre orientations des flèches de sortie.
Le paquet Debian est contrôlé avant sa mise en ligne.

Les fichiers de sauvegarde et les préférences existantes sont
conservés lors de la mise à jour.

**Version Debian : `0.7.0`**. Canal : **Stable** (également
visible depuis le canal DEV). Remplace la stable 0.5.0.
