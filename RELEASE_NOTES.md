# Álfastafl 0.5.1-dev5 — captures animées et ambiance sonore

Cette DEV conserve la stable 0.5.0 et les apports des DEV1–DEV4 : plateau 3D, accès invités, suppression des sauvegardes, redémarrage automatique et jeu direct sur le PC hôte.

## Échecs magiques : premier jalon jouable

- Après chaque capture confirmée par le serveur, la caméra quitte sa vue habituelle, suit l'attaquant, cadre l'impact puis revient à sa position précédente.
- Les figurines sculptées restent en **bronze pour les Nains** et en **pierre claire pour les Elfes**. Les victimes vacillent, se brisent en fragments animés ; les captures multiples touchent plusieurs figurines.
- Capture du roi : scène spéciale avec éclats dorés et son distinct.
- Les nouvelles parties proposent quatre réglages : **Désactivées**, **Rapide · 4 s**, **Classique · 8 s** (défaut) et **Épique · 12 s**.
- La durée et le coup sont **validés par le serveur**. Celui-ci suspend l'horloge et interdit le coup suivant jusqu'à la fin de la cinématique, y compris si un joueur choisit **Passer la scène**.
- Les joueurs et spectateurs autorisés reçoivent la scène avec son temps restant. Leur caméra revient au cadrage personnel ; passer une scène localement n'interrompt pas celle des autres appareils.
- Le modèle 3D actuel est sculptural et procédural, non articulé. Il s'agit du premier rendu « échecs magiques », **pas encore d'animations squelettiques finalisées**.

## Sons originaux sans fichiers externes

- Ambiance musicale procédurale nordique, dont l'intensité évolue avec la partie.
- Effets d'action : déplacement, arme, impact, destruction, capture royale.
- Bouton **Activer / Couper le son**, curseurs indépendants **Musique** et **Effets**, valeurs mémorisées par navigateur. Un geste utilisateur peut être nécessaire pour déverrouiller Web Audio sur mobile.
- Aucun son ou musique issu d'une bande originale commerciale ; les sons sont intégralement synthétisés hors ligne.

## Vérification

Tests serveur : pause horloge, durée correcte, impossibilité de jouer pendant la scène, reprise, sauvegarde/fermeture et compatibilité avec les anciennes parties. Scénarios Chromium du plateau 3D : scène issue d'une capture réelle, figurines et éclats, spectateur distant, bouton passer et retour au jeu. Les tests déjà présents du moteur, tutoriel, sécurité réseau et mise à jour restent obligatoires.

Le fonctionnement des animations et du son sur Ubuntu MATE réel et mobiles physiques reste à vérifier.

## Distribution

Version Debian **0.5.1~dev5**, canal **Mises à jour → Développement (DEV)**. La stable **0.5.0** reste inchangée.
