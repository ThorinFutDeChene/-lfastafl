# Álfastafl — 0.5.1-dev4 (canal DEV)

La **0.5.1-dev4** reprend la [stable 0.5.0](https://github.com/ThorinFutDeChene/-lfastafl/releases/tag/v0.5.0) et ajoute une **interface immersive aux invités autorisés** : après accord de l'hôte, le plateau 3D occupe seul toute la fenêtre du téléphone, de la tablette ou de l'ordinateur. Le menu discret ☰ permet d'accéder aux réglages de vue et, pour les joueurs, aux actions de partie. L'accès LAN reste volontaire à chaque lancement et se désactive à la fermeture normale.

**Validation :** les 174 tests Python ont réussi localement, dont six nouveaux tests de prévisualisation des captures. La publication est conditionnée à la réussite de cette suite et des scénarios Chromium du tutoriel et du plateau 3D. Le fonctionnement graphique dans Qt sur Ubuntu MATE et sur les appareils mobiles réels reste à vérifier. Les cas atypiques du moteur de règles, les cinématiques et la régie restent partiellement ou entièrement à développer.

**Canaux de mise à jour :** les nouvelles installations de cette préversion choisissent `DEV` par défaut. Le choix de canal enregistré est conservé ; le canal DEV reçoit également les versions stables. Pour recevoir cette préversion, sélectionner **Mises à jour → Développement (DEV)**. Le numéro Debian `0.5.1~dev4` est plus récent que `0.5.1~dev3` et `0.5.0`.


Projet GPL-3.0 de jeu de tafl Viking-fantasy, prévu pour Ubuntu avec hôte local et invités via navigateur.

## Jouer directement sur le PC hôte

Le PC Ubuntu ne sert plus uniquement à héberger : il peut être **joueur Nain ou Elfe**, avec le même moteur de coups, les mêmes captures et les mêmes horloges que les appareils invités.

**Créer une partie :** dans **Héberger → Sur ce PC**, choisir **Jouer les Nains**, **Jouer les Elfes** ou **Héberger seulement (spectateur)**, puis créer la partie. Le jeu attribue alors au PC une session de joueur autorisée par le serveur. Le plateau 3D hôte reste directement jouable à la souris ; la vue 2D au clavier et les commandes de caméra restent disponibles.

**Partie déjà créée :** dans **Gestion de la partie → Jouer sur le PC hôte**, cliquer sur **Jouer les Nains** ou **Jouer les Elfes**. Seuls les camps réellement libres peuvent être attribués. **Rester spectateur** permet de quitter son camp avant le début des coups et des chronomètres. Il n'est pas permis de changer de camp après le début du jeu, ni de prendre le camp d'un autre joueur. Si la partie est suspendue, l'hôte doit d'abord choisir **Reprendre la partie sauvegardée**.

Le PC hôte conserve les commandes d'administration, le tutoriel, le LAN volontaire et les QR codes. Le rôle de joueur s'applique **uniquement** au camp choisi et n'accorde aucun droit nouveau aux appareils invités. Les autorisations de jeu et le contrôle des coups restent côté serveur. La session de joueur du PC hôte est automatiquement révoquée lors d'une sauvegarde/quitter ; après un redémarrage ou une reprise d'une partie sauvegardée, il faut sélectionner de nouveau son camp. Une partie chronométrée attend que les deux camps soient connectés avant de démarrer le chronomètre.

## Supprimer une partie sauvegardée

Sur le **PC hôte**, chaque partie de la rubrique **Parties hébergées et sauvegardées** dispose maintenant de deux commandes distinctes : **sélectionner** la partie ou **Supprimer**. La suppression demande systématiquement une confirmation mentionnant la variante et les premiers caractères de l'identifiant ; l'opération est définitive et efface le fichier de sauvegarde `.alfastafl` du dossier utilisateur, pas seulement l'affichage de la liste.

Pour protéger les parties en réseau, **une partie active ne peut pas être supprimée** : il faut d'abord utiliser **Sauvegarder et quitter cette partie**. Les parties en pause et les parties terminées peuvent être effacées ; les parties liées à un tournoi sont protégées contre l'effacement isolé. L'action est interdite aux joueurs et spectateurs distants par le serveur. Les invitations, sessions, demandes en attente, chronomètres et données de partie associées sont révoqués ou nettoyés. Si la partie supprimée était affichée, le plateau est désélectionné et revient à **Aucune partie sélectionnée**. Les autres sauvegardes restent inchangées.

Le formulaire de confirmation permet d'annuler sans aucune modification. Si le disque refuse la suppression, le serveur garde la partie dans la liste et affiche une erreur.

## Redémarrage automatique après une mise à jour

Après accord explicite et installation réussie d'un paquet vérifié par SHA-256 via APT/pkexec, l'application **se ferme et se relance automatiquement**, sans boîte de dialogue finale demandant une relance manuelle. Un processus auxiliaire, détaché et exécuté **sans privilèges administrateur**, attend la disparition de l'ancienne instance avant d'ouvrir la nouvelle version installée. Il reconnaît également les états *zombie* et les identifiants de processus réutilisés, évitant les relances multiples.

À la fermeture, les parties en cours sont **sauvegardées et mises en pause**, les horloges sont suspendues et les règles UFW temporaires ainsi que le serveur LAN sont fermés. Pour éviter toute ouverture réseau involontaire, le **LAN doit être réactivé volontairement** après redémarrage ; la partie sauvegardée peut alors être reprise et les joueurs réinvités.

Un refus d'installation, une erreur de téléchargement ou un échec APT ne déclenche **aucun redémarrage**. Si l'installation aboutit mais que le processus de relance ne peut pas être programmé, l'application reste ouverte et indique la relance manuelle nécessaire. Le processus auxiliaire expire sans rien lancer si l'ancienne instance ne s'est pas fermée.

**Première activation :** cette fonction ne peut être exécutée que par une version qui la contient déjà. Lors de l'installation de la **0.5.1-dev2 depuis une version antérieure**, la version déjà ouverte ne connaît pas encore cette procédure : une dernière relance manuelle reste nécessaire. À partir de la version dev2 installée et redémarrée, les mises à jour suivantes seront automatiquement suivies d'un redémarrage.

## Plateau 3D et figurines

Les parties et le tutoriel utilisent la **Vue 3D** par défaut. Le plateau 11×11 possède une base épaisse, un aspect chêne sombre en deux nuances et des repères de trône et de coins adaptés à la variante. Les pièces sont des figurines sculptées par génération procédurale :

- **Nains en bronze** : barbe, hache et bouclier.
- **Elfes en pierre claire** : oreilles, cape et arc.
- **Roi en pierre claire** : couronne, épée et sceptre.

Ces figurines constituent une première version. Le détail des modèles, leur préparation pour l'animation et leur rendu artistique seront affinés ensuite. Ce jalon ne contient pas encore de scène de combat, de son ni d'animation de capture.

### Commandes

| Action | Commande |
| --- | --- |
| Jouer un coup | Cliquer ou toucher une pièce, puis sa destination ; le glisser-déposer est également disponible. |
| Orienter le plateau | Faire glisser le fond pour tourner sur 360° et modifier l'inclinaison. |
| Zoomer | Utiliser la molette, deux doigts ou les boutons **+** et **−**. |
| Retrouver un cadrage lisible | Choisir **Vue dessus** ou **Recentrer**. |
| Adapter le rendu | Choisir **Qualité → Éco**, **Standard** ou **Haute**. |
| Jouer au clavier | Choisir **Affichage → Vue 2D · clavier**. |

Chaque joueur garde sa propre caméra. Les halos dorés indiquent la sélection et les destinations légales ; les destinations permettant une capture apparaissent en rouge, y compris pour une capture du roi. Ces prévisualisations viennent du moteur côté serveur. Les coups, captures, droits des joueurs et chronomètres restent contrôlés par ce même serveur.

Le rendu 3D nécessite **WebGL 2**. Si cette capacité est indisponible ou si le contexte graphique est perdu, l'affichage bascule automatiquement vers la vue 2D. Celle-ci reste également sélectionnable à tout moment. Les essais sur téléphones et tablettes réels restent à effectuer.

**Aucune connexion Internet n'est nécessaire pour afficher la 3D.** Three.js r187 et ses modules sont embarqués avec l'application ; le plateau et les figurines sont générés localement. Les mentions de licence MIT de Three.js sont réunies dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).


### Vue plateau seule pour appareils invités

Quand un téléphone, une tablette ou un ordinateur ouvre un lien ou scanne un QR d'invitation, le formulaire de demande d'accès reste affiché jusqu'à l'approbation par l'hôte. **Après réception de l'autorisation du serveur**, le plateau de jeu occupe automatiquement toute la surface de la page ; le formulaire, l'en-tête, l'historique, les légendes et les panneaux d'hébergement disparaissent.

Le petit bouton **☰** donne accès aux commandes de vue 3D/2D, de caméra et de qualité. Les **joueurs** y retrouvent également les commandes de partie nulle et d'abandon ; les **spectateurs** ne peuvent pas jouer. Les demandes de réponse (proposition de nulle, arbitrage) restent visibles au-dessus du plateau ; les horloges ne s'affichent que si la partie est chronométrée. En cas de révocation du droit d'accès, l'écran revient au formulaire de connexion.

Ce mode remplit la **fenêtre du navigateur**, mais ne force pas le plein écran natif ni la disparition des barres système, que les navigateurs mobiles ne permettent pas toujours sans intervention de l'utilisateur.

## Tutoriel interactif sur le PC hôte

Dans **Héberger**, choisir une variante de règles puis cliquer sur **Tutoriel**, à côté de **Créer une partie**. Le tutoriel s'ouvre dans un panneau et reprend la variante sélectionnée. Le bouton **Retour au jeu** ferme ce panneau.

Le parcours propose **9 exercices en Historique · Tawlbwrdd**, **9 en Classique · Fetlar** et **10 en Compétition · Copenhague**, soit **28 positions d'apprentissage**. Il aborde les camps et le premier coup, les déplacements, les obstacles, le trône, les captures, les cases hostiles, l'entrée volontaire entre deux adversaires, l'échappée et la capture du roi. Copenhague ajoute un exercice sur le mur de boucliers.

Chaque exercice présente une position, une explication et un objectif. Sélectionner une pièce affiche ses destinations légales, calculées par le moteur de règles du jeu. Un coup refusé ou un objectif non atteint reçoit une explication. Les commandes **Afficher un indice**, **Recommencer l'exercice**, **Précédent** et **Suivant**, ainsi que la liste des exercices, permettent de progresser librement. Le **mémo des règles** s'adapte à la variante et fournit les références déjà réunies dans [RULES.md](RULES.md).

Le tutoriel fonctionne **sans activer l'accès LAN**. Il est réservé au PC hôte, avec un contrôle d'accès également effectué par le serveur. Ses exercices utilisent des positions indépendantes des parties, des sauvegardes et des invitations QR. La progression n'est pas conservée entre les ouvertures ; ce parcours propose des exercices ciblés, sans adversaire IA ni partie complète accompagnée.

Les limites du moteur s'appliquent aussi au tutoriel : les forteresses de sortie complexes, certains nuls théoriques de Fetlar et les interprétations historiques nécessitent encore une validation approfondie. Le mémo présente les règles de la variante retenue et les limites correspondantes.

## Accès LAN volontaire et gestion automatique du pare-feu

**Démarrage normal sur Ubuntu :** Álfastafl lance uniquement le serveur d’administration sur `127.0.0.1:8766`. L'accès LAN reste désactivé, sans demande d'autorisation du pare-feu ni nouvelle règle UFW.

**Activation manuelle :** cliquer sur **Activer accès LAN** dans la barre d'outils. Álfastafl détecte alors une interface Wi-Fi/Ethernet privée et demande l’authentification administrateur via **polkit** (`pkexec`), sans commande terminal. Le service privilégié installe une règle UFW **limitée à cette interface, à son sous-réseau et au seul port TCP 8766**. L’application lance alors un second serveur, lié **uniquement à l’adresse IPv4 locale**, et affiche les QR codes joueur/spectateur. Les invitations ne sont pas affichées avant activation effective du serveur LAN.

**Fermeture normale :** Álfastafl désactive le partage, ferme le serveur LAN et retire automatiquement **sa propre règle UFW**, identifiée par un commentaire unique. Le lancement suivant reste toujours en mode local. Les règles existantes des autres programmes (par exemple Enyalië sur 8765) ne sont jamais supprimées. Un processus privilégié garde le canal ouvert : si le programme s’arrête brutalement, la fermeture de ce canal déclenche le nettoyage. Après une coupure électrique ou un arrêt forcé du service privilégié, les anciennes règles marquées Álfastafl sont nettoyées à la prochaine activation LAN autorisée.

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

La **0.5.0-dev1** est une préversion ; la [0.4.0](https://github.com/ThorinFutDeChene/-lfastafl/releases/tag/v0.4.0) reste la version de référence du **canal stable**. Le périmètre fonctionnel reste incomplet.

**Implémenté et testé** : plateau 11×11 et 37 pièces selon deux dispositions, trois variantes de base, déplacement orthogonal, captures usuelles, conditions de victoire principales, serveur HTTP multijoueur, invitation joueur/spectateur avec validation depuis le PC hôte, plusieurs parties, sauvegardes atomiques `.alfastafl`, reprise, historique des coups, génération de QR, infrastructure préliminaire des trois formats de tournoi et équilibrage des camps.

**Nouveau dans cette DEV** : plateau WebGL 2, premières figurines procédurales reconnaissables, caméra libre, sélection et déplacement par clic, toucher ou glisser-déposer, repères de capture calculés par le serveur et repli en 2D. La validation graphique de ce jalon est en cours.

**Restant** : validation exhaustive des cas atypiques du Tafl, y compris les forteresses de sortie complexes et les nuls théoriques de Fetlar (murs de boucliers, forteresse de sortie, encerclement), finalisation des cas particuliers de répétition, chiffrement du protocole LAN, découverte Avahi, raffinement artistique des figurines et modèles destinés à l'animation, cinématiques, bandes-son, réalisation automatique, régie multi-parties et tournoi entièrement intégré à l'interface.

## Tests sur Ubuntu (sans installer)

```bash
cd alfastafl_dev
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 -m alfastafl --host 127.0.0.1 --port 8766
```

Les workflows de publication DEV et stable sont configurés pour exécuter les scripts suivants avec Playwright et Chromium avant la construction du paquet :

```bash
node tests/browser_tutorial.cjs
node tests/browser_board3d.cjs
```

Le premier conserve les contrôles du tutoriel 2D. Le second prévoit 12 scénarios sur le rendu WebGL 2, les figurines, la caméra, les commandes de jeu, les captures, l'accès spectateur et le repli en 2D. Les captures sont produites dans `test-results/tutorial-ui/` et `test-results/board3d/`, puis conservées dans les artefacts GitHub Actions `alfastafl-tutorial-ui` et `alfastafl-board3d-ui`. Ces contrôles navigateur complètent les tests Python ; le parcours dans l'application Qt sur Ubuntu MATE et sur les mobiles réels reste à valider.

Dans Firefox local : `http://127.0.0.1:8766/`. Pour un accès LAN en test, lancer explicitement `--host 0.0.0.0` depuis un **réseau local de confiance** pour des tests CLI uniquement ; cette commande directe ne gère pas le pare-feu. L'application graphique gère automatiquement UFW. Le protocole HTTP n'est **pas chiffré**, il ne convient pas à une exposition Internet.

## Installation `.deb`

Le paquet construit installe les sources dans `/opt/alfastafl/`, le lanceur natif PyQt6 dans `/usr/bin/alfastafl`, et un raccourci `.desktop`. Dépendances : `python3`, `python3-pyqt6`, `python3-pyqt6.qtwebengine`, `python3-qrcode`, `python3-pil`, `iproute2`, `ufw`, `pkexec`.

## Données

`$XDG_DATA_HOME/alfastafl/parties/*.alfastafl`, ou `~/.local/share/alfastafl/parties/*.alfastafl`, avec écriture atomique. La désinstallation ne supprime pas ces données.

## Licence

GNU GPL version 3, voir `LICENSE`. Code source public, pas de télémétrie ni service cloud central.

Three.js et ses modules embarqués sont distribués sous licence MIT ; voir [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) et `web/vendor/three/LICENSE.txt`. Le code du plateau et des figurines procédurales appartient au projet Álfastafl et relève de sa licence GPL-3.0.

## Mise à jour de l'application Ubuntu (à partir de 0.1.0-dev3)

Le menu natif **Mises à jour** propose un canal **Stable** ou **DEV**, un bouton de vérification manuelle et l'option de vérification au démarrage. La vérification se déroule en arrière-plan, sans empêcher de jouer en réseau local hors connexion Internet.

Le canal DEV accepte les préversions et les versions stables publiées ; le canal stable ignore les préversions. La version installée est comparée aux versions Debian à l'aide de `dpkg --compare-versions` pour éviter les réinstallations ou régressions.

Avant installation, le jeu télécharge `SHA256SUMS.txt` et le `.deb` depuis les assets de la même Release GitHub, contrôle la somme SHA-256, les métadonnées Debian (nom/version/architecture), puis demande une **deuxième confirmation**. L'installation passe par l'agent d'autorisation Linux `pkexec` et `/usr/bin/apt-get`. Jamais de commande shell ni d'installation silencieuse. Un redémarrage manuel de l'application est nécessaire pour utiliser la nouvelle version.

Les paramètres sont conservés dans `$XDG_CONFIG_HOME/alfastafl/settings.ini` (par défaut `~/.config/alfastafl/settings.ini`). Les sauvegardes `.alfastafl` ne sont pas touchées. En l'absence d'Internet, le contrôle échoue sans empêcher le lancement. Le contrôle SHA-256 vérifie l'intégrité du paquet par rapport aux informations publiées sur GitHub ; il ne constitue pas à lui seul une signature cryptographique indépendante de l'éditeur.
