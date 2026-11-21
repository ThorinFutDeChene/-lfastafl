# Álfastafl 0.7.1 — Version stable

La **0.7.1** reprend les fonctionnalités et les corrections de
**0.7.1-dev9**. Elle succède à la stable 0.7.0, sans migration
des sauvegardes `.alfastafl` ni remise à zéro des paramètres.

## Tournois et multijoueur

- Plusieurs rencontres peuvent se jouer en parallèle dans un tournoi,
  notamment deux demi-finales à quatre joueurs, avec une finale
  créée à partir des résultats des parties effectivement terminées.
- Tournois suisses et à élimination directe : affichage des règles
  via le bouton « ? », gestion des effectifs impairs, exemptions,
  classement et replays en cas de match nul en élimination.
- Reconnexion via le QR du tournoi : les appareils déjà approuvés
  sont reconnus par un secret enregistré dans leur navigateur ;
  une nouvelle approbation est exigée pour un appareil inconnu.
- Spectateurs en lecture seule : rotation des plateaux,
  noms des joueurs, scènes de capture et plusieurs encarts
  simultanés quand plusieurs rencontres sont actives.

## Tutoriel, réseau et interface

- Tutoriel présenté exclusivement depuis le PC hôte, avec QR code
  pour partager les coups légaux, sélections, déplacements et
  explications sur les appareils des invités.
- Activation automatique de l'accès LAN lors de la création,
  de la reprise d'une partie ou de l'ouverture d'un tutoriel.
  Extinction du partage après 60 secondes sans activité protégée ;
  les rencontres actives ne sont pas coupées et la boucle locale
  reste accessible.
- Quitter ou rétablir le plein écran avec F11 ; améliorations
  du plateau 3D et de l'interface des joueurs.

## Validation

- Recette automatisée du moteur de règles et des sauvegardes.
- Simulation de quatre joueurs, deux parties simultanées,
  un spectateur et une finale jouée jusqu'au résultat.
- Vérifications du tutoriel partagé et du tournoi sur
  **Chromium, Firefox et WebKit** ; contrôles QtWebEngine,
  animations 3D, construction et intégrité du paquet Debian.
- Correction des scripts de test Playwright, sans altération
  du fonctionnement du jeu.

**Limites de validation :** la recette sur plusieurs téléphones,
tablettes et ordinateurs physiques n'a pas encore été clôturée.
Le comportement sur Wi-Fi réel, l'ouverture et la fermeture UFW
sur Ubuntu MATE ainsi que Safari natif sur iPhone, iPad ou Mac
restent à vérifier. Le passage des tests WebKit sur Linux
ne garantit pas à lui seul Safari sur les appareils Apple.
Ces validations sont suivies dans
[le ticket n°7](https://github.com/ThorinFutDeChene/-lfastafl/issues/7).

## Installation

Paquet Debian : `alfastafl_0.7.1_all.deb`.
Le canal stable n'installe pas les préversions DEV.
Le choix de canal des installations existantes est conservé.
