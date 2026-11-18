# Álfastafl — 0.3.0 (canal stable)

La **0.3.0 stable** reprend le code fonctionnel de 0.3.0-dev2 et les correctifs de distribution de la branche `main`. Ce statut indique une **Release non préliminaire sur le canal stable**, pas une version 1.0 ni l'achèvement des fonctionnalités prévues.

**Validation en environnement réel à terminer :** le dialogue polkit et le nettoyage de la règle UFW doivent encore être vérifiés sur Ubuntu MATE avec deux smartphones. Le réseau local fonctionne en HTTP non chiffré ; ne pas exposer l'application sur Internet. Les règles de jeu atypiques, la 3D, les cinématiques et la régie restent partiellement ou entièrement à développer.

**Canaux de mise à jour :** les nouvelles installations de cette version choisissent `Stable` par défaut. Les installations provenant d'une DEV conservent leur choix de canal existant ; pour rester uniquement sur les versions stables, utiliser **Mises à jour → Stable**.


Projet GPL-3.0 de jeu de tafl Viking-fantasy, prévu pour Ubuntu avec hôte local et invités via navigateur.

## Base fonctionnelle reprise de la DEV 0.3.0-dev2 : réseau LAN et pare-feu automatiques

**Démarrage normal sur Ubuntu :** Álfastafl lance immédiatement le serveur d’administration sur `127.0.0.1:8766`, puis détecte automatiquement une interface Wi-Fi/Ethernet privée. Il demande l’authentification administrateur via **polkit** (`pkexec`), sans commande terminal. Le service privilégié installe une règle UFW **limitée à cette interface, à son sous-réseau et au seul port TCP 8766**. L’application lance alors un second serveur, lié **uniquement à l’adresse IPv4 locale**, et affiche les QR codes joueur/spectateur. Les invitations ne sont pas affichées avant activation effective du serveur LAN.

**Fermeture normale :** Álfastafl ferme le serveur LAN et retire automatiquement **sa propre règle UFW**, identifiée par un commentaire unique. Les règles existantes des autres programmes (par exemple Enyalië sur 8765) ne sont jamais supprimées. Un processus privilégié garde le canal ouvert : si le programme s’arrête brutalement, la fermeture de ce canal déclenche le nettoyage. Après une coupure électrique ou un arrêt forcé du service privilégié, les anciennes règles marquées Álfastafl sont nettoyées au prochain lancement autorisé.

**Échec d'autorisation :** si polkit refuse, que le Wi-Fi n’est pas disponible ou qu'UFW ne confirme pas l’ouverture, aucune exposition réseau n’est lancée ; le plateau reste disponible en local. L’accès peut être réessayé dans la barre d’outils. La désactivation manuelle du LAN retire également la règle. Il faut qu’**UFW et iproute2** soient installés, ainsi qu’un agent polkit fonctionnel sur le bureau Ubuntu.

**Limites de sécurité :** les liaisons restent en HTTP non chiffré ; utilisation exclusive sur un réseau local de confiance. L’ouverture ne concerne que le réseau privé détecté, sans redirection NAT vers Internet. Si une règle UFW équivalente existait déjà **avant** Álfastafl, elle appartient à l’administrateur et sera conservée. Si l'adresse IP change pendant la partie, il peut être nécessaire de désactiver puis réactiver le LAN.

## DEV 0.3.0-dev1 : temps et continuité des parties

Trois réglages **avant création** de la partie : sans limite, temps configurable
par déplacement (réinitialisé à chaque coup légal), ou temps total indépendant
par joueur. Les deux compteurs ne démarrent que lorsque les deux joueurs
approuvés ont contacté le serveur. Les décisions de temps (notamment la
**défaite immédiate au temps**) appartiennent au serveur Python : l'affichage
navigateur n'est qu'une estimation rafraîchie régulièrement. L'application
Ubuntu hôte poursuit la surveillance même sans requête de navigateur.

**Déconnexions :** le serveur surveille le contact périodique des sessions
joueurs, et non la présence des spectateurs. Le délai de grâce par défaut est
15 secondes ; si un joueur ne répond plus, les deux horloges sont suspendues.
Le délai de reconnexion par défaut est **5 minutes**, modifiable de 1 à 60
minutes depuis la fenêtre « Héberger ». Reconnexion de la même session avant
l'échéance : reprise automatique ; après l'échéance : **décision obligatoire
de l'hôte**, sans forfait automatique. Choix possibles : déclarer forfait,
autoriser un remplaçant après approbation, ou sauvegarder pour plus tard.
Le navigateur conserve, sur l'appareil autorisé, un jeton de session pour
retrouver la partie après fermeture/rechargement du navigateur. Ne pas partager
ce jeton ni utiliser cette option sur un appareil public.

**Reprise :** « Sauvegarder et quitter » met les compteurs en pause, révoque
les invitations et les sessions précédentes, et conserve la partie au format
`.alfastafl`. La liste des parties depuis l'ordinateur hôte permet de les
retrouver, puis de les reprendre avec **de nouveaux QR codes** et de nouvelles
autorisations de joueurs. Une interruption de l'application Ubuntu suspend les
parties à la réouverture ; les temps sont consignés après chaque coup,
à chaque pause, et périodiquement toutes les cinq secondes pour limiter les
pertes de temps de jeu lors d'un arrêt brutal. La sauvegarde garde également
l'arbitrage des répétitions historiques en attente : il ne peut être contourné
par la reprise.

**Limites DEV :** la détection de présence repose encore sur le rafraîchissement
HTTP du navigateur (les navigateurs mobiles peuvent ralentir les requêtes en
arrière-plan). Les cinématiques n'existent pas encore : leur future suspension
du chronomètre devra être ajoutée lorsque les animations seront intégrées.
Le protocole LAN reste du HTTP non chiffré. Usage exclusivement sur un réseau local de confiance.

## DEV 0.2.0-dev1: audit des regles (premiere passe)

Les trois modes sont maintenant distincts pour les conditions de victoire,
les captures, les repetitions et les blocages. Le mur de boucliers de
Copenhague est gere par les flancs; l'encerclement, la detection prudente de
deux formes de forteresse et le vote d'arbitrage des repetitions historiques
sont presents. Les coups affiches comme accessibles dans le navigateur sont
maintenant demandes au serveur et non plus estimes visuellement.

Les joueurs autorises peuvent egalement proposer/accepter une partie nulle,
ou abandonner. Le serveur garde l'autorite sur ces decisions. Sauvegardes et
publications DEV/stables sont conservees.

**Etat :** ce travail critique est un **premier jalon**, non une certification
exhaustive. Voir [RULES.md](RULES.md) pour les references et les cas encore
incomplets, notamment les forteresses de sortie atypiques.

## Interface Ubuntu et QR codes

Depuis **0.1.0-dev4**, la fenêtre Ubuntu démarre **maximisée**, sans mode plein écran. Les panneaux du bureau, la barre de titre et les commandes de fenêtre restent accessibles.

### Correction interface DEV 0.1.0-dev2

Les deux QR codes d’invitation sont maintenant séparés : joueur à gauche, informations au centre, spectateur à droite. Sur les petits écrans, ils restent côte à côte sous les informations. Les QR codes ne sont plus rechargés à chaque rafraîchissement de l’état réseau, ce qui évite les interruptions pendant la lecture au smartphone.

## État réel

Il s'agit d'un **prototype technique jouable**, pas d'une version stable complète.

**Implémenté et testé** : plateau 11×11 et 37 pièces selon deux dispositions, trois variantes de base, déplacement orthogonal, captures usuelles, conditions de victoire principales, serveur HTTP multijoueur, invitation joueur/spectateur avec validation depuis le PC hôte, plusieurs parties, sauvegardes atomiques `.alfastafl`, reprise, historique des coups, génération de QR, infrastructure préliminaire des trois formats de tournoi et équilibrage des camps.

**Restant** : validation exhaustive des cas atypiques du Tafl, y compris les forteresses de sortie complexes et les nuls théoriques de Fetlar (murs de boucliers, forteresse de sortie, encerclement), finalisation des cas particuliers de répétition, chiffrement du protocole LAN, découverte Avahi, moteur 3D WebGL/Three.js et modèles Blender, cinématiques, bandes-son, réalisation automatique, régie multi-parties, tournoi entièrement intégré à l'interface,  La version actuelle affiche un plateau HTML/CSS en légère perspective, **pas la 3D réelle validée pour le produit final**.

## Tests sur Ubuntu (sans installer)

```bash
cd alfastafl_dev
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 -m alfastafl --host 127.0.0.1 --port 8766
```

Dans Firefox local : `http://127.0.0.1:8766/`. Pour un accès LAN en test, lancer explicitement `--host 0.0.0.0` depuis un **réseau local de confiance** pour des tests CLI uniquement ; cette commande directe ne gère pas le pare-feu. L'application graphique gère automatiquement UFW. Le protocole HTTP n'est **pas chiffré**, il ne convient pas à une exposition Internet.

## Installation `.deb`

Le paquet construit installe les sources dans `/opt/alfastafl/`, le lanceur natif PyQt6 dans `/usr/bin/alfastafl`, et un raccourci `.desktop`. Dépendances : `python3`, `python3-pyqt6`, `python3-pyqt6.qtwebengine`, `python3-qrcode`, `python3-pil`, `iproute2`, `ufw`, `pkexec`.

## Données

`$XDG_DATA_HOME/alfastafl/parties/*.alfastafl`, ou `~/.local/share/alfastafl/parties/*.alfastafl`, avec écriture atomique. La désinstallation ne supprime pas ces données.

## Licence

GNU GPL version 3, voir `LICENSE`. Code source public, pas de télémétrie ni service cloud central.

## Mise à jour de l'application Ubuntu (à partir de 0.1.0-dev3)

Le menu natif **Mises à jour** propose un canal **Stable** ou **DEV**, un bouton de vérification manuelle et l'option de vérification au démarrage. La vérification se déroule en arrière-plan, sans empêcher de jouer en réseau local hors connexion Internet.

Le canal DEV accepte les préversions et les versions stables publiées ; le canal stable ignore les préversions. La version installée est comparée aux versions Debian à l'aide de `dpkg --compare-versions` pour éviter les réinstallations ou régressions.

Avant installation, le jeu télécharge `SHA256SUMS.txt` et le `.deb` depuis les assets de la même Release GitHub, contrôle la somme SHA-256, les métadonnées Debian (nom/version/architecture), puis demande une **deuxième confirmation**. L'installation passe par l'agent d'autorisation Linux `pkexec` et `/usr/bin/apt-get`. Jamais de commande shell ni d'installation silencieuse. Un redémarrage manuel de l'application est nécessaire pour utiliser la nouvelle version.

Les paramètres sont conservés dans `$XDG_CONFIG_HOME/alfastafl/settings.ini` (par défaut `~/.config/alfastafl/settings.ini`). Les sauvegardes `.alfastafl` ne sont pas touchées. En l'absence d'Internet, le contrôle échoue sans empêcher le lancement. Le contrôle SHA-256 vérifie l'intégrité du paquet par rapport aux informations publiées sur GitHub ; il ne constitue pas à lui seul une signature cryptographique indépendante de l'éditeur.
