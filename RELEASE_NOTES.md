# Álfastafl 0.7.0-dev3 — combats en étau, façon échecs magiques

## Nouvelles scènes 3D

**Capture elfe → nain (deux elfes en étau)**
1. L'elfe ayant joué avance jusqu'à la case **précédant** la case confirmée.
2. Il décoche une flèche visible. Le nain la pare avec son bouclier.
3. L'elfe déjà présent derrière le nain dégaine une véritable épée elfique
   sculptée, puis porte un coup de taille.
4. Le nain de bronze se fend en **deux moitiés découpées par clipping 3D**,
   qui se séparent. L'elfe mobile termine enfin son déplacement.

**Capture nain → elfe (deux nains en étau)**
1. Le nain mobile s'arrête avant sa destination et attaque à la hache.
2. L'elfe pare avec le bras protégé par son arc.
3. Le nain allié de l'autre côté assène le coup de hache final : la statue
   d'elfe se fracture en éclats. Le nain mobile termine sa course.

## Sécurité et compatibilité

- **Aucun changement de règles.** La pièce alliée de soutien est recherchée
  uniquement dans le plateau final confirmé par le serveur, et uniquement
  pour une prise adjacente ordinaire en étau. Rien n'est inventé pour les
  captures spéciales ni pour celles impliquant le roi.
- La cinématique conserve le même temps serveur et n'ajoute aucune action
  ni aucun tour. Les commandes des joueurs et les sauvegardes restent intactes.
- Le spectateur voit la même scène, sans droit de jeu.
- Le passage de scène restaure toutes les pièces réelles, les matériaux,
  le clipping et la caméra d'origine.
- L'ensemble des assets, flèches, armes, particules et sons sont générés
  localement, sans téléchargement, et restent compatibles hors ligne.
- Nouvelles assertions sur les pièces d'appui, les poses, la séparation
  en deux moitiés, les chronomètres et l'absence de coups supplémentaires.
- Essais physiques Ubuntu MATE et appareils mobiles encore nécessaires.

## Distribution

- Paquet Debian **0.7.0~dev3**, canal **DEV**.
- La stable 0.5.0 reste inchangée.
