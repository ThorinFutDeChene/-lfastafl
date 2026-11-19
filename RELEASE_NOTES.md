# Álfastafl 0.6.0-dev1 — déplacements fluides et ambiance sonore

Cette préversion inaugure la branche **0.6.0**, en conservant les fonctionnalités de la **0.5.1-dev5** (jeu hôte/invités, plateau 3D, sauvegardes et leur suppression, redémarrage après mise à jour et premier prototype de captures animées).

## Déplacements des figurines

- **Interpolation 3D visible** lors de chaque coup nouvellement confirmé par le serveur, sur les postes hôte, joueurs et spectateurs.
- Durée adaptative d'environ **500 à 1 150 ms** selon la distance, avec léger soulèvement et transfert de poids : les sculptures de bronze et de pierre conservent leur identité et leurs formes.
- **Aucun changement des règles ni des tours** : l'état du plateau est immédiatement celui du serveur. Le mouvement est uniquement graphique et ne crée aucun coup supplémentaire.
- Sur une simple actualisation du plateau, lors de la restauration d'une sauvegarde ou après une reconnexion contenant plusieurs coups, les anciennes animations ne sont pas rejouées.
- L'animation n'empêche pas de manipuler librement la caméra. Les clics 3D sur les figurines en mouvement sont neutralisés pendant leur court déplacement.
- Retour immédiat à la position correcte en cas de bascule 2D, de nouvelle partie, de fenêtre masquée ou de contexte WebGL perdu ; respect du réglage système **Réduire les animations**.
- En cas de capture cinématographique activée, le prototype d'échecs magiques déjà présent **reste prioritaire** : pas de double animation ni de double bruitage.

## Bande-son originale hors ligne

- Musique d'inspiration nordique, avec motif modal, bourdon, vent et percussion sourde entièrement **synthétisés sur place**.
- Bruitages différenciés pour sélection, déplacement de figurine, attaque, impact, fracture et roi.
- **Deux canaux de volume indépendants**, Musique et Effets : les curseurs agissent immédiatement et leurs niveaux restent enregistrés par appareil.
- Démarrage après un geste utilisateur, coupure sans relance permanente des minuteries, arrêt lorsque la page est cachée ou qu'aucune partie active n'est affichée.
- Aucun téléchargement sonore, aucune bande originale commerciale ni dépendance Internet.

## Validation technique

La chaîne DEV impose les tests Python du moteur et des serveurs, les tests des réponses réseau tardives, des tests supplémentaires du moteur Web Audio et les scénarios Chromium du tutoriel et du plateau 3D. Les nouveaux scénarios doivent vérifier la progression du mouvement sur hôte et spectateur, le retour exact en 2D, l'absence de rejouage, la caméra indépendante, l'accessibilité et le fonctionnement des contrôles audio.

**Non encore validé sur matériel physique :** sortie audio réelle dans QtWebEngine sous Ubuntu MATE, performances et restrictions Web Audio sur iOS/Android/tablettes. Les scènes de combat articulées et la finition cinématographique relèvent toujours du développement 0.7.0.

## Distribution

Paquet Debian **0.6.0~dev1** sur le canal **Mises à jour → Développement (DEV)**. La stable **0.5.0** reste inchangée. Les sauvegardes existantes sont préservées.
