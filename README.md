# Álfastafl — 0.7.1-dev4 (canal DEV)

La **0.7.1-dev4** reprend la [stable 0.7.0](https://github.com/ThorinFutDeChene/-lfastafl/releases/tag/v0.7.0) et ajoute une **interface immersive aux invités autorisés** : après accord de l'hôte, le plateau 3D occupe seul toute la fenêtre du téléphone, de la tablette ou de l'ordinateur. Le menu discret ☰ permet d'accéder aux réglages de vue et, pour les joueurs, aux actions de partie. Le réseau local est ouvert automatiquement lors de la création ou reprise d'une partie, d'un tutoriel ou d'un tournoi, et se referme à l'arrêt du logiciel.

**Validation :** les tests du moteur, des captures, de l'horloge serveur, du tutoriel et de la vue 3D sont exécutés par la chaîne CI avant publication. Le rendu des scènes et la restitution sonore sur Ubuntu MATE et téléphones physiques restent à confirmer. Les cas atypiques du moteur de règles, la finition des animations et la régie restent partiellement ou entièrement à développer.

**Canaux de mise à jour :** les nouvelles installations de cette préversion choisissent `DEV` par défaut. Le choix de canal enregistré est conservé ; le canal DEV reçoit également les versions stables. Pour recevoir cette préversion, sélectionner **Mises à jour → Développement (DEV)**. Le numéro Debian `0.7.1~dev4` est plus récent que la stable `0.7.0`.


Projet GPL-3.0 de jeu de tafl Viking-fantasy, prévu pour Ubuntu avec hôte local et invités via navigateur.

## DEV 0.7.1-dev4 : LAN activé automatiquement pour jouer et présenter

Le menu natif **Réseau → Activer accès LAN** est supprimé. Il n'est
plus nécessaire d'ouvrir le réseau avant de commencer à jouer.

La demande est déclenchée dès **Fichier → Nouvelle partie**, lors
de la **sélection d'une partie sauvegardée**, et lors de la commande
de **reprise d'une partie suspendue**. Les menus du **tutoriel** et
des **tournois** déclenchent également le partage réseau pour leurs
QR codes. Une activité supplémentaire ne crée aucune règle doublon.

L'application démarre toujours sur la boucle locale uniquement.
L'ouverture nécessite une action de l'hôte et une autorisation système
Ubuntu via **polkit** peut encore apparaître pour le pare-feu UFW.
La règle est limitée à l'interface, au sous-réseau et au seul port TCP
8766. Si l'autorisation échoue, le jeu fonctionne localement.

Le menu Réseau conserve les **connexions et demandes d'autorisation**.
À la fermeture de l'application, le serveur réseau et la règle UFW
temporaire sont supprimés. Les sauvegardes, tournois et autorisations
des joueurs restent inchangés.

## DEV 0.7.1-dev3 : tutoriel partagé en direct sur le réseau local

Le PC hôte conserve seul le contrôle du tutoriel. Lorsque le réseau
local a été volontairement activé, un **QR code directement dans la
fenêtre du tutoriel** ouvre une page de spectateur dédiée. Les invités
voient le même exercice, les indications, les sélections, les coups
légaux et les déplacements confirmés, avec leur propre caméra 3D.
La vue 2D reste disponible pour les appareils sans WebGL.

Les accès invités sont strictement en **lecture seule** : aucune
commande du jeu ou du tutoriel ne peut être exécutée à distance.
Le QR est lié à une session temporaire avec jeton aléatoire ;
l'arrêt du partage, la fermeture du tutoriel ou l'arrêt du LAN
invalident l'accès. La session ne conserve aucune donnée sur disque.
Les parties et tournois existants restent inchangés.

## DEV 0.7.1-dev2 : tournois multirencontres, reconnaissance et diffusion

**Plusieurs rencontres en parallèle** : un tournoi à quatre participants
crée deux parties distinctes, chacune avec son propre plateau, son
chronomètre, ses invitations et ses sauvegardes. Les deux paires peuvent
jouer en même temps, ou commencer plus tard lorsque leurs deux joueurs
sont présents. L'organisateur valide les résultats pour créer la ronde
suivante : une partie ne bloque pas les autres.

**QR commun au tournoi** : une fois la diffusion lancée, la colonne
gauche contient un QR joueur et un QR spectateur pour tout le tournoi.
Chaque joueur scanne, saisit son nom d'inscription et retrouve son
match planifié. La **première connexion** exige l'accord de l'hôte ;
le navigateur reçoit alors un **jeton aléatoire fort** spécifique
au joueur, au rôle et au tournoi. Le serveur conserve uniquement son
empreinte SHA-256. Il n'utilise pas l'adresse MAC : les navigateurs
n'y ont pas accès. Aux rondes suivantes, scanner le QR permet au même
appareil de récupérer sa propre faction **sans réautorisation**,
y compris après redémarrage du PC hôte. Un autre appareil ou un
navigateur dont les données ont été supprimées doit être approuvé
de nouveau. **Révocation** des appareils : Partie → Tournois.

**Diffusion en direct** : l'écran hôte et les écrans spectateurs
autorisés font défiler automatiquement les plateaux 3D des rencontres,
**une toutes les 12 secondes**, avec noms, factions et état de jeu.
L'hôte peut passer manuellement à la rencontre suivante ou arrêter
la diffusion. En cas de prise, une fenêtre cinématique 3D indique
les adversaires concernés ; plusieurs scènes indépendantes peuvent
apparaître simultanément (**six maximum**, suivant les capacités
graphiques). Il s'agit de vues de jeu WebGL en direct, pas de
captures vidéo du bureau ni de fichiers multimédias enregistrés.

Les appareils spectateurs n'ont aucun droit de déplacement :
la diffusion leur est accordée par l'hôte pour le tournoi.
Dans cette ancienne DEV2, l'activation était manuelle ; la DEV4 la déclenche automatiquement.
L'ancien menu **Affichage → Quitter le plein écran (F11)** et le
bouton d'aide **?** sur le format suisse/élimination de la
DEV1 sont conservés.

**Essais nécessaires avant stable** : quatre appareils connectés,
plusieurs cinématiques au même instant et charge GPU des téléphones.
La ronde suivante n'est pas lancée sans validation de l'organisateur.

## DEV 0.7.1-dev1 : quitter le plein écran et aide aux formats de tournoi

**Affichage → Quitter le plein écran (F11).** Une commande visible
dans la barre de menus native Qt permet désormais de restaurer une
**fenêtre normale Ubuntu**, avec ses bordures et contrôles. La
commande devient **Passer en plein écran (F11)** dans ce mode.
La touche F11 exécute exactement la même bascule. Quitter le plein
écran ne ferme pas le jeu, ne coupe pas les connexions et ne
modifie ni la partie ni les sauvegardes.

**Partie → Tournois et tirage des factions.** Un bouton rond
**?**, directement **à droite de la liste Type de tournoi**, ouvre
une aide contextuelle qui s'adapte immédiatement au format sélectionné :

- **Système suisse :** tous les participants continuent pendant
  le nombre de rondes paramétré. À chaque ronde, le moteur classe
  les joueurs par points (3 victoire, 1 nul, 0 défaite) et recherche
  des adversaires de score proche, en évitant autant que possible
  les confrontations déjà jouées. Avec un nombre impair de joueurs,
  le participant non apparié ne reçoit pas de victoire automatique.
- **Élimination directe :** seuls les vainqueurs poursuivent ; les
  perdants sont éliminés. Pour éviter les limites actuelles de
  gestion des exemptions et matchs nuls, privilégier un tableau
  de **2, 4, 8 ou 16 joueurs**. Une partie nulle ne qualifie
  aucun des joueurs dans cette version.
- **Toutes rencontres :** les participants s'affrontent lors
  de rondes successives, de préférence avec un nombre **pair**
  de joueurs car le calendrier actuel à effectif impair ne couvre
  pas nécessairement tous les duels.

L'aide peut être ouverte et fermée au clavier ou à la souris,
indique l'état **ouvert/fermé** aux outils d'accessibilité et ne
modifie pas le calcul du tournoi. Le correctif est volontairement
limité à l'interface, aux indications et à l'affichage de fenêtre.
La stable **0.7.0 reste inchangée** ; ce correctif appartient au
prochain cycle **0.7.1**.

## DEV 0.7.0-dev12 : quatre flèches de sortie correctement orientées

Correction du **plateau 3D** : les quatre marques gravées aux
coins du plateau symbolisent les sorties du roi (Fetlar et
Copenhague). Jusqu'à la DEV11, les icônes n'utilisaient que
**deux orientations** pour les quatre coins ; deux flèches
pointaient donc vers **l'intérieur** au lieu de montrer la fuite.

Chaque icône est désormais orientée **vers l'extérieur dans
la diagonale de son propre coin** : ↖ ↗ ↙ ↘, indépendamment
de la rotation ou de l'inclinaison de la caméra. La correction
agit sur les **rotations des plans 3D** des emblèmes et ne modifie
ni les textures, ni le gameplay, ni les cases de victoire.

Un test de régression Chromium/WebGL récupère la transformation
réelle de chacune des quatre flèches et vérifie :
- les quatre coins distincts sont présents ;
- les quatre angles de rotation sont distincts ;
- chaque flèche s'oriente vers l'extérieur sur les **deux axes** ;
- les emblèmes restent couchés à plat sur le plateau.

La DEV12 conserve aussi les correctifs réseau et les fonctions
de tournoi de la DEV11 ainsi que la correction de démarrage Qt
de la DEV10. Stable inchangée : 0.5.0.

## DEV 0.7.0-dev11 : attribution des camps et tournois équitables

### Joueurs connectés : plus de choix impossible à l'autorisation

La fenêtre **Réseau → Connexions et autorisations** n'affiche désormais
que les camps réellement disponibles, contrôlés par le serveur :

- **PC hôte joueur Nain :** un téléphone autorisé reçoit
  **automatiquement les Elfes**, via un seul bouton
  « Autoriser — Elfes ».
- **PC hôte joueur Elfe :** l'invité reçoit automatiquement
  **les Nains**.
- **PC hôte spectateur + deux téléphones :** lors de la première
  autorisation, les camps Elfes et Nains sont libres ; le premier
  téléphone admis se voit attribuer le camp choisi. Le second n'a
  plus de choix et reçoit automatiquement la faction restante.
- **Partie complète :** plus d'attribution ; la demande peut être
  refusée. Les demandes encore en attente sont mises à jour après
  chaque admission, pour éviter les courses entre joueurs.
- **Spectateurs :** aucun camp, un seul bouton « Autoriser à regarder » ;
  le bouton « Refuser » reste disponible.

Ce contrôle existe aussi dans l'API : en présence d'**un seul camp
libre**, une autorisation sans camp le choisit automatiquement,
même en cas de demande simultanée. Quand les deux camps sont
disponibles, le premier joueur doit être attribué explicitement.
Le serveur rejette tout camp occupé ou réservé à quelqu'un d'autre,
sans déléguer la sécurité à JavaScript. Les remplacements autorisés
par l'arbitre continuent d'utiliser la faction à remplacer.

### Tournois : tirage initial, équilibrage et ancienneté

Dans **Partie → Tournois et tirage des factions**, le PC hôte peut
créer un tournoi (élimination directe, toutes rencontres ou Suisse),
enregistrer ses participants, puis demander la première ronde.
Chaque rencontre crée une partie avec des **camp Nains/Elfes
préattribués**. Le joueur doit se présenter avec **exactement
le nom inscrit** : lors de l'autorisation réseau, il reçoit son
camp prédéfini, sans menu de choix. Les personnes non inscrites
ne peuvent pas prendre une place de joueur du tournoi.

**Algorithme d'affectation des camps :**
1. **Première rencontre entre deux joueurs sans historique :**
   tirage au sort équitable.
2. **Rencontres suivantes :** priorité à la faction que chacun
   a le moins jouée. Parmi les répartitions possibles, minimiser
   d'abord le déséquilibre maximal par joueur, puis le déséquilibre
   total.
3. **Égalité de priorités :** si les deux joueurs réclament le
   même camp, celui qui a joué ce camp **le plus récemment**
   obtient **l'autre** ; celui qui attend depuis le plus longtemps
   le conserve. Si chaque joueur a joué autant d'Elfes que de
   Nains, il préfère aussi inverser son camp de la partie précédente.
4. **Nouvelle égalité :** tirage au sort, et non attribution
   arbitraire par le nom ou l'ordre du tournoi.

Le calcul utilise le **numéro de ronde** ; une exemption d'une
ronde ne fausse donc pas l'ancienneté. L'historique des factions
et les appariements sont sauvegardés atomiquement sous
`~/.local/share/alfastafl/parties/.tournaments.json`,
séparément des sauvegardes de chaque partie. Au lancement d'une
nouvelle ronde, le serveur extrait automatiquement les vainqueurs
des **parties terminées**, inscrit leurs camps et résultats
dans l'historique et refuse d'avancer tant que la ronde précédente
n'est pas achevée. Les résultats ne peuvent pas être forgés par
un navigateur invité.

L'interface Tournois permet de retrouver chaque rencontre et
d'ouvrir sa partie sur le plateau plein écran existant ; la
gestion réseau et les QR code restent inchangés.

Des tests unitaires détaillent le premier tirage, les cas
d'égalité, les tours de repos, l'historique conservé après
redémarrage, l'autorisation de tournoi et le cas PC hôte joueur.
Les scénarios Chromium couvrent les deux téléphones, la faction
automatique et la création/affichage d'un match de tournoi.

## DEV 0.7.0-dev10 : correctif critique de démarrage Qt sur Ubuntu

Les DEV8 et DEV9 pouvaient **ne pas se lancer du tout** sur Ubuntu.
Leur constructeur `QWebEngineView` essayait de configurer
`QWebEngineSettings.WebAttribute.JavascriptCanCloseWindows` :
**cet attribut provient de Qt WebKit et n'existe pas dans Qt WebEngine**.
L'accès produisait une exception Python avant l'apparition de la fenêtre,
alors que nos tests précédents simulaient un faux enum avec ce membre
inexistant et ne reproduisaient donc pas l'erreur sur Ubuntu.

La DEV10 supprime l'attribut erroné et conserve le support de
`JavascriptCanOpenWindows` présent dans Qt WebEngine.
Le test de faux Qt exclut dorénavant cette ancienne constante
et une **nouvelle recette native** lance effectivement PyQt6 et
QtWebEngine, ouvre la fenêtre et vérifie le chargement de la page
de jeu dans un serveur Xvfb sur Ubuntu (paquets Qt système Debian).
Cette recette est désormais **obligatoire avant publication**.

La fenêtre unique plein écran, les deux QR à gauche, les menus
natif Fichier / Partie / Paramètres / Réseau, le plateau 3D,
les règles Tafl et les sauvegardes restent inchangés.
Stable 0.5.0 inchangée ; installation de la DEV10 recommandée
pour les postes dont la DEV8/DEV9 ne démarre pas.

## DEV 0.7.0-dev9 : plateau unique en plein écran, deux QR à gauche et menus natifs

**Nouvelle interface du PC hôte sur Ubuntu** : au lancement, la fenêtre
principale est désormais le **plateau 3D en plein écran**. L'ancienne
fenêtre de gestion permanente est abandonnée. **Aucun deuxième plateau
n'est créé** ; les fonctionnalités de gestion se retrouvent dans
la barre de **menus natifs Qt** :

- **Fichier → Nouvelle partie** : une fenêtre modale permet de choisir
  « jouer les Nains », « jouer les Elfes » ou « rester spectateur »
  et de créer la partie. **Fichier → Sauvegarder** conserve la partie ;
  **Fichier → Sauvegardes** ouvre une fenêtre avec la liste des parties
  sauvegardées, la sélection, la reprise et la suppression définitive
  (confirmation requise ; interdite sur une partie active).
- **Partie** : choix du rôle du PC hôte, arbitrage et commande des
  joueurs, historique des coups, et tutoriel dans une fenêtre modale
  dédiée, sans interrompre la partie.
- **Paramètres** : fenêtre de réglages regroupant règles/variantes,
  horloges, délai de reconnexion, durée des cinématiques, mode 2D/3D,
  qualité 3D, caméra, musique et effets sonores. Les paramètres de
  création s'appliquent à la *prochaine* partie ; la vue et le son
  réagissent immédiatement sans redémarrage.
- **Réseau** : activation/désactivation manuelle et temporaire du
  réseau local, et fenêtre d'autorisation des demandes de joueurs ou
  spectateurs. Les mises à jour sont conservées dans le menu natif
  **Mises à jour**. **F11** bascule le plein écran.

Une **colonne permanente sur la gauche** montre le
**QR JOUEUR en haut à gauche** et le **QR SPECTATEUR en bas à gauche**,
avec un habillage viking. Les deux QR sont propres à la partie
en cours, apparaissent seulement si elle est active et si le LAN
est volontairement ouvert, et cessent d'être affichés dès l'arrêt
du LAN ou la suppression de la partie. Ils ne sont pas rechargés à
chaque interrogation. Un scan ne donne **aucun accès automatique** :
la personne fait une demande qui doit être autorisée dans Réseau
→ Connexions. La colonne reste présente à l'écran même hors ligne,
avec un message explicatif à la place de QR inopérants.

Le plateau occupe tout l'espace **à droite de la colonne** ; les menus
et fenêtres modales n'affectent ni les règles Tafl ni les sauvegardes
ni les cinématiques, et ne créent pas d'autre contexte WebGL. Les
téléphones et PC invités continuent d'utiliser leur propre interface
immersive après autorisation de l'hôte. Des tests Python vérifient
la fenêtre Qt plein écran et la continuité du LAN ; Chromium vérifie
le layout, la gestion des sauvegardes, la reprise, les suppressions,
les QR, l'approbation, le mode joueur et le tutoriel. Le rendu Qt sur
un matériel Ubuntu MATE réel reste à vérifier avant passage en stable.

## DEV 0.7.0-dev8 : PC hôte avec plateau dans une nouvelle fenêtre plein écran

**Gestion et affichage désormais séparés dans l'application Ubuntu.**
La fenêtre principale Qt, toujours maximisée avec sa barre d'outils
réseau, sert exclusivement à créer/reprendre/supprimer les parties,
choisir les camps, gérer les demandes d'accès et autoriser le LAN.
Elle **n'affiche plus le plateau** et n'alloue pas de scène WebGL.

À la création d'une partie (hôte joueur ou spectateur), à la sélection
d'une sauvegarde, au choix d'un camp ou avec le bouton
**« Ouvrir le plateau dans une fenêtre plein écran »**, le plateau
s'ouvre dans une **seconde fenêtre Qt indépendante**, initialement en
plein écran. Ce plateau possède son propre rendu 3D, ses animations,
ses contrôles de jeu et de caméra. Le menu discret ☰ ouvre les
réglages ; **F11** permet de sortir/rentrer du plein écran,
et **« Fermer »** ne ferme que cette fenêtre (ni le serveur ni la
fenêtre principale). La partie continue à exister sur le serveur.

**Tutoriel** : le bouton du PC hôte ouvre lui aussi une fenêtre Qt
distincte en plein écran, avec le plateau d'exercice et les
instructions. Le tutoriel reste strictement local et indépendant
des parties ; sa fermeture ramène à l'administration sans détruire
une partie en cours.

**QR code spectateur** : lorsque l'accès LAN est activé par l'hôte,
un QR discret en bas à droite du plateau plein écran permet de
scanner l'invitation **spectateur de la partie affichée**. Le scan
envoie une demande : l'accès reste soumis à l'**approbation de
l'hôte**. Le QR est automatiquement masqué lorsque le LAN est
désactivé, puis réapparaît à la réactivation. Il n'est pas rechargé
à chaque interrogation du serveur. Il est présent lorsque l'hôte
joue comme lorsqu'il observe.

Les clients distants autorisés conservent leur interface immersive
existante. Les règles, sauvegardes, coups et positions, chronomètres
et autorisations réseau sont inchangés. Les tests de la DEV incluent
une simulation Chromium des **fenêtres séparées** et du cycle
de vie du QR, ainsi que des assertions Python sur le plein écran
Qt. Tests physiques multi-écrans Ubuntu MATE encore nécessaires.

## DEV 0.7.0-dev7 : flèches enfin tirées depuis l'arc, pas depuis la poitrine

**Correction de position d'origine du tir elfique.** La DEV6
positionnait la flèche par une hauteur fixe au-dessus du corps de
l'archer : elle pouvait sembler jaillir de sa poitrine, sans utiliser
l'arc déjà sculpté dans sa main.

La **flèche est maintenant encochée sur la corde du vrai arc 3D** :
un ancrage invisible situé au milieu de la corde est attaché à
l'articulation du **bras gauche**, et suit donc exactement ses
mouvements. La flèche 3D repose physiquement sur cet ancrage
avant le tir ; sa pointe est alignée vers la cible, puis le départ
et la trajectoire sont calculés à partir de l'ancrage, y compris
lorsqu'une flèche rebondit sur le bouclier du nain. La flèche décorative
gravée à travers la poitrine est retirée **uniquement des figurines
animées** pour éviter qu'elle continue à apparaître après le lâcher.
Les figurines ordinaires sur le plateau conservent leur aspect initial.

La correction couvre **toutes les scènes avec un elfe archer** :
tir classique, prise en étau (flèche parée puis épée de l'elfe
d'appui), capture contre le trône (deux flèches, première parée),
et les captures génériques avec d'autres soutiens. Aucun changement
de règles, de positions sur le plateau, de réseau, d'horloge,
de permissions ou de sauvegardes. Le rendu fonctionne localement
sur l'hôte, les autres joueurs et leurs spectateurs autorisés.

Des tests Chromium contrôlent **la position de l'extrémité arrière
de la flèche sur la vraie corde**, l'animation des deux départs
et sa trajectoire. Les essais matériels Ubuntu MATE et mobiles
restent nécessaires avant de passer la version en stable.

## DEV 0.7.0-dev6 : captures d'un soldat contre le trône vide, dans les deux sens

Le trône vide est une case hostile aux soldats des **deux camps**
dans les trois variantes jouées. La cinématique se déclenche seulement
après une capture à une seule victime, confirmée par le serveur, lorsque
la sculpture adverse est située **entre la pièce qui vient de jouer et
le trône VIDE**. Aucun second combattant fictif n'est généré.

**Nain contre elfe :** le nain termine son déplacement jusqu'à la case
réellement choisie ; au contact, il assène un premier coup de hache,
l'elfe tente de parer avec le bras portant son arc, puis le nain
arme sa hache et donne le coup décisif. L'elfe est projeté contre le
trône, dont il fait jaillir de petits morceaux de pierre, puis sa
sculpture éclate en **18 fragments 3D**.

**Elfe contre nain :** l'archer s'immobilise une case avant sa destination,
décoche une flèche que le nain détourne avec son bouclier, puis en
tire une deuxième qui projette le nain de bronze contre le trône.
La sculpture explose en **18 fragments** et la collision produit
**12 débris du trône** (effets visuels locaux). L'archer termine
son déplacement jusqu'à la case sélectionnée.

Sons originaux (arc, parade, hache, collision et fracture), caméra
mobile, étincelles et retour à l'angle de vue initial. Le trône
lui-même et son état de jeu restent intacts, aucun coup ni capture
supplémentaire n'est généré. La scène fonctionne aussi pour les
spectateurs autorisés, suit le temps envoyé par le serveur, et
respecte les durées 4, 8, 12 s, le bouton Passer, la vue 2D et
Réduire les animations. Les captures contre un trône occupé, par
encadrement ou par mur de boucliers utilisent les scènes prévues
pour leur configuration réelle.

Les tests Python valident les deux camps dans les trois modes,
les tests Node vérifient le plan de la scène et sa chronologie,
et Chromium contrôle le rendu hôte/spectateur et l'intégrité du
plateau après la capture.

## DEV 0.7.0-dev5 : dernier combat du roi, 2, 3 ou 4 nains

**Cinématique de victoire des Nains**, uniquement après
`status=finished`, `winner=dwarf`, `reason=king_captured`
confirmés par le serveur. Le roi, qui reste sur sa vraie case dans le plateau
sauvegardé, est remplacé temporairement par sa sculpture articulée :
il se défend à l'épée, les nains ayant réellement fermé la prise
arrivent au contact et portent chacun un coup de hache, puis
**tous assènent une frappe collective**. La statue royale s'effondre,
la **couronne est projetée en 3D** et la sculpture vole en éclats.
Caméra rapprochée et effets originaux de cliquetis de lame, impact,
chute de couronne et fanfare grave des nains.

Le nombre d'attaquants est calculé sur le **plateau réel après le coup**,
suivant la règle réellement appliquée :
- **2 nains** : prise historique par deux côtés opposés, hors du trône ;
- **4 nains** : encerclement complet (Fetlar/Copenhague ; roi sur le trône
  historique) ;
- **3 nains** : exception du trône vide ou hostile dans les variantes qui
  prévoient cet étau. **Aucun quatrième nain fictif ne surgit du trône.**

Le nain qui vient de jouer termine son déplacement avant de frapper :
les nains déjà sur place restent sur leurs cases et bougent seulement
leurs sculptures, pas les pièces de jeu. Durées existantes 4/8/12 s,
commande « Passer la scène », respect des animations réduites et
restitution du plateau et de la caméra. Tous les spectateurs et joueurs
voient une chorégraphie locale fondée sur le même événement temporel.
Pas de modification du moteur Tafl, de l'historique, des tours ou des
sauvegardes. Tests Python, Node, WebAudio et Chromium dédiés.

## DEV 0.7.0-dev4 : fuite royale à cheval et coup de hache au contact

**Le roi fuit à cheval, escorté par deux cavaliers elfes (scène C).**
Lorsqu'une partie se termine par une victoire authentifiée
`status=finished`, `winner=elf`, `reason=escape` avec une pièce `R`,
le serveur ouvre une fenêtre cinématique de même durée que les captures :
**Rapide (4 s), Classique (8 s) ou Épique (12 s)**, sauf si les scènes
sont désactivées. Le roi court jusqu'à la case de sortie, trois chevaux
3D surgissent au bord du plateau, le roi monte en selle, les elfes
saluent et les nains protestent, puis le cortège part au galop hors du
plateau. Caméra mobile, particules et fanfare de cors synthétisés
localement accompagnent la victoire. Les chevaux ont des membres
articulés, des selles et des cavaliers elfes sculptés. **Deux escortes**
accompagnent toujours le souverain ; ce sont des personnages
cinématographiques, et non de nouvelles pièces jouables.
Les bords des règles historiques et les coins des autres variantes
sont pris en compte.

**Correction de réalisme :** le nain attaquant doit désormais **avoir
terminé son déplacement sur sa case définitive avant de lever sa hache**.
L'elfe pare avec le bras portant l'arc, puis le second nain assène
le coup final. L'elfe archer conserve, lui, la pause une case avant
la destination pour décocher sa flèche.

**Aucune altération des règles, positions, droits réseau, sauvegardes
ou horloges.** La cavalcade est déclenchée seulement par l'événement de
victoire envoyé par le serveur et se déroule localement chez les
joueurs et spectateurs. Vue 2D, bouton Passer, option de réduction
des animations et restitution de la caméra initiale restent préservés.
Les tests de régression couvrent également la victoire sans capture,
la scène à trois chevaux et la continuité des états terminés.

## DEV 0.7.0-dev3 : scènes de capture par encadrement à deux combattants

Pour une **capture ordinaire réellement encadrée par deux pièces alliées**,
les deux figurines participent à la scène. Le programme identifie la pièce
d'appui dans le plateau **après validation serveur**, sans inventer d'allié
pour une capture contre le trône, les coins ou un mur de boucliers.

**Elfes contre nain :** l'elfe mobile s'arrête une case avant sa destination,
vise et décoche une flèche. Le nain la pare avec son bouclier. L'elfe situé
de l'autre côté dégaine une **épée elfique en 3D**, prend son élan et fend la
sculpture de bronze en **deux moitiés géométriquement découpées**, qui
s'écartent et tombent. L'elfe mobile termine alors son déplacement jusqu'à
la case sélectionnée.

**Nains contre elfe :** depuis la DEV4, le nain mobile atteint d'abord sa
case de destination et assène ensuite un coup de hache au contact.
L'elfe tente une parade avec le bras portant l'arc. Le **second nain**, déjà en place derrière l'elfe, arme sa hache
et fait éclater la sculpture ; le premier nain reste sur sa case définitive.

Les deux attaques bénéficient d'un cadrage autour des trois personnages,
de bruitages distincts (flèche, bouclier, lame, taille, fracture) et
de traînées d'armes. Les déplacements de support sont purement graphiques
et aucune pièce alliée ne quitte sa case réelle.

**Garanties :** les règles, l'historique, les sauvegardes, l'horloge,
les autorisations et les coups légaux sont toujours déterminés par le serveur.
Les scènes restent locales et synchronisées au temps du même événement.
Les captures ne réunissant pas strictement ces conditions utilisent les
animations précédentes. La vue 2D et le mode Réduire les animations restent
disponibles. Tests Chromium dédiés aux prises par étau, au spectateur et
au retour à l'état graphique normal.

## DEV 0.7.0-dev2 : combats plus dynamiques
La préversion **0.7.0-dev2** transforme les captures en échanges animés : approche
rapide, **feinte, parade, esquive latérale, riposte et coup final**, avec
fragments de statue projetés après l'impact. Le nain combat à la hache et au
bouclier, le roi brandit son épée et l'elfe peut tirer une flèche en 3D.
Des **traînées de coups**, des étincelles au choc et une caméra qui suit les
adversaires, avec un léger tremblement borné, dynamisent l'affrontement.
Chaque capture multiple enchaîne les duels dans la durée prévue.

**Important :** ces mouvements sont purement visuels. Le serveur continue de
décider des captures, tours et horloges. Toutes les poses découlent du même
temps cinématique : spectateurs et joueurs voient la même action sans
rejouage sonore après reconnexion. La vue 2D, le bouton de passage de scène
et le réglage système « Réduire les animations » restent pris en charge.
Le choix préexistant **Rapide (4 s), Classique (8 s), Épique (12 s)** permet
de régler le rythme au moment de la création de la partie.

Les tests automatisés vérifient désormais la chorégraphie déterministe, les
articulations en navigateur, les vues hôte/spectateur et l'absence d'accès
Internet. Essais réels Ubuntu MATE, tablettes et mobiles toujours nécessaires
avant de promouvoir en stable.

## DEV 0.7.0 : combats articulés et cinématiques
**Figurines articulées en combat.** Lorsqu'une capture est confirmée par le serveur,
la scène utilise temporairement des sculptures segmentées : bras, armes, jambes et tête
pivotent autour d'articulations locales. Le nain arme sa hache et son bouclier ;
l'elfe défend son arc ; le roi garde son épée et son sceptre. Les figurines
ordinaires restent fusionnées afin de préserver les performances WebGL.
**Mise en scène.** L'attaquant s'élance, oriente son corps vers la victime,
prépare l'attaque, frappe, et la victime tente de se protéger avant de céder.
En cas de capture multiple, les adversaires sont traités successivement dans
la durée impartie par le serveur. Chaque statue vaincue produit 18 éclats 3D
avec trajectoires balistiques. La caméra effectue un léger travelling et reprend
exactement l'orientation initiale après la scène ou son interruption.
**Audio.** Ajout d'effets hors ligne distincts pour le tir d'arc, la garde et
le bouclier, synchronisés aux impacts et à la fragmentation. Les canaux de
volume existants sont conservés.
**Intégrité.** Aucun changement des règles, des sauvegardes, de la gestion des
connexions, ni de l'horloge authoritative. L'hôte, les joueurs et les spectateurs
disposent de scènes locales synchronisées aux mêmes horodatages de combat.
La vue 2D, les appareils sans WebGL et l'option système Réduire les animations
restent pris en charge.
**Validation.** Les scénarios Chromium vérifient désormais les articulations,
la fragmentation et l'indépendance des modèles de jeu. À valider sur
Ubuntu MATE/QtWebEngine et téléphones/tablettes avant promotion stable.

## DEV 0.6.0 : déplacement fluide des figurines et ambiance sonore

**Déplacements 3D.** Lorsque le serveur confirme un coup, la figurine concernée se déplace progressivement sur le plateau au lieu de changer instantanément de case. Le mouvement est une interpolation douce d'environ **0,5 à 1,15 seconde** selon la distance, avec un léger soulèvement et une inclinaison de sculpture. La caméra demeure sous le contrôle de chaque appareil ; les règles, les tours et les sauvegardes continuent d'être déterminés exclusivement par le serveur. L'animation se voit sur le **PC hôte, les appareils joueurs et les spectateurs autorisés** lorsque leur vue 3D est active. Elle ne se rejoue pas lors d'une actualisation identique, d'une reconnexion ou de la reprise d'une partie enregistrée. Un changement de partie, un passage en 2D, la fermeture d'une fenêtre ou une perte de WebGL arrête immédiatement le déplacement et remet la figurine exactement sur sa case de destination. Les appareils demandant une réduction des animations conservent un déplacement instantané. La cinématique prototype d'une **capture** reste prioritaire, sans doublon de déplacement.

**Musique et effets.** Le moteur Web Audio produit hors ligne une ambiance nordique originale : mélodie lente, bourdon grave, percussions sourdes et souffle de vent. L'atmosphère se tend progressivement après plusieurs coups. Les déplacements et captures disposent d'effets de friction, d'armes, de chocs et de fracture de pierre/bronze. **Musique** et **Effets** ont chacun leur volume, modifiable immédiatement et mémorisé indépendamment sur chaque ordinateur, tablette ou téléphone. Le bouton **Activer / Couper le son** respecte les restrictions de lecture automatique des navigateurs ; un geste utilisateur est nécessaire. Aucune piste musicale ni aucun fichier audio tiers n'est téléchargé.

**Historique 0.6.0.** La première scène de capture utilisait des sculptures rigides ; l'articulation et les nouveaux effets arrivent en 0.7.0. Un prototype de capture/sculpture brisée, déjà présent depuis la 0.5.1-dev5, reste disponible et ne doit pas être confondu avec l'animation finale. Les animations en 3D nécessitent WebGL2 ; la vue 2D demeure entièrement fonctionnelle.

## Cinématiques de capture et son (prototype introduit en DEV 0.5.1-dev5)

**Captures façon échecs magiques :** les nains de bronze, les elfes de pierre et le roi restent des **sculptures** pendant le combat. Après une capture validée par le moteur, la caméra se rapproche du lieu de l'affrontement, l'attaquant s'élance, la figurine touchée bascule et se fragmente en éclats, puis la caméra revient au cadrage initial. Les captures multiples animent plusieurs victimes. La capture du roi dispose d'un effet sonore spécifique et d'éclats dorés. Les figurines actuelles sont générées procéduralement ; **leurs membres et leurs armes deviennent articulés dans les scènes de combat de la 0.7.0** ; le rendu en jeu reste optimisé.

Dans **Héberger → Captures animées**, choisir **Rapide (4 s)**, **Classique (8 s, défaut)**, **Épique (12 s)** ou **Désactivées**. Pendant une capture active, **le serveur suspend le chronomètre et refuse les coups suivants** jusqu'à la fin de la scène ; la décision des captures reste exclusivement celle du moteur. Les invités autorisés et les spectateurs reçoivent la même capture avec le temps restant pour la voir au bon moment. Chaque appareil dispose du bouton **Passer la scène** ; il peut revenir immédiatement au plateau, mais le prochain tour attend la fin de la période commune, même si un utilisateur a passé la scène. Une partie existante créée avant ce jalon conserve son paramètre précédent (captures sans pause), sauf nouvelle partie créée avec l'option.

**Sons :** les bruitages de déplacement, arme, impact, fracture et capture du roi sont générés hors ligne via Web Audio. Une musique d'ambiance nordique originale, à motifs lents, devient plus tendue après plusieurs coups. Un bouton **Activer / Couper le son** et deux curseurs indépendants **Musique** et **Effets** apparaissent parmi les commandes de la vue 3D/2D. Les réglages sont stockés localement par navigateur. Certains téléphones empêchent la lecture automatique ; il faut alors toucher **Activer le son**. Aucun téléchargement audio, aucune piste commerciale ni licence tierce de bande-son n'est nécessaire.

En cas d'absence de WebGL, la **vue 2D reste jouable** et les effets sonores de capture restent disponibles. La synchronisation de l'animation dépend des actualisations HTTP régulières : un navigateur mobile en arrière-plan peut rejoindre la scène en cours sans revoir son début. Les captures ne modifient ni les règles, ni le fichier de sauvegarde.

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

À la fermeture, les parties en cours sont **sauvegardées et mises en pause**, les horloges sont suspendues et les règles UFW temporaires ainsi que le serveur LAN sont fermés. Pour éviter toute ouverture réseau involontaire, le LAN est **rouvert automatiquement** dès que l'hôte sélectionne une sauvegarde ou demande une nouvelle partie ; les joueurs peuvent alors être réinvités.

Un refus d'installation, une erreur de téléchargement ou un échec APT ne déclenche **aucun redémarrage**. Si l'installation aboutit mais que le processus de relance ne peut pas être programmé, l'application reste ouverte et indique la relance manuelle nécessaire. Le processus auxiliaire expire sans rien lancer si l'ancienne instance ne s'est pas fermée.

**Première activation :** cette fonction ne peut être exécutée que par une version qui la contient déjà. Lors de l'installation de la **0.5.1-dev2 depuis une version antérieure**, la version déjà ouverte ne connaît pas encore cette procédure : une dernière relance manuelle reste nécessaire. À partir de la version dev2 installée et redémarrée, les mises à jour suivantes seront automatiquement suivies d'un redémarrage.

## Plateau 3D et figurines

Les parties et le tutoriel utilisent la **Vue 3D** par défaut. Le plateau 11×11 possède une base épaisse, un aspect chêne sombre en deux nuances et des repères de trône et de coins adaptés à la variante. Les pièces sont des figurines sculptées par génération procédurale :

- **Nains en bronze** : barbe, hache et bouclier.
- **Elfes en pierre claire** : oreilles, cape et arc.
- **Roi en pierre claire** : couronne, épée et sceptre.

Les figurines restent des modèles procéduraux de première génération. La DEV 0.5.1-dev5 ajoute des **scènes de capture avec mouvements de groupes, effets d'impact et éclats de matière**, ainsi que le son. Les membres deviennent articulés dans les scènes de capture à compter de la 0.7.0, sans modification des figurines statiques.

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

Le tutoriel reste utilisable **sans réseau**, même si son ouverture tente désormais d'activer automatiquement le LAN pour le partage par QR. Il est réservé au PC hôte, avec un contrôle d'accès également effectué par le serveur. Ses exercices utilisent des positions indépendantes des parties, des sauvegardes et des invitations QR. La progression n'est pas conservée entre les ouvertures ; ce parcours propose des exercices ciblés, sans adversaire IA ni partie complète accompagnée.

Les limites du moteur s'appliquent aussi au tutoriel : les forteresses de sortie complexes, certains nuls théoriques de Fetlar et les interprétations historiques nécessitent encore une validation approfondie. Le mémo présente les règles de la variante retenue et les limites correspondantes.

## Accès LAN automatique à l'ouverture d'une activité et gestion du pare-feu

**Démarrage normal sur Ubuntu :** Álfastafl lance uniquement le serveur d’administration sur `127.0.0.1:8766`. L'accès LAN reste désactivé, sans demande d'autorisation du pare-feu ni nouvelle règle UFW.

**Activation automatique :** dès la création d'une partie, la sélection d'une sauvegarde, la reprise d'une partie, l'ouverture d'un tutoriel ou la préparation d'un tournoi, Álfastafl détecte une interface Wi-Fi/Ethernet privée et demande, si nécessaire, l'authentification administrateur via **polkit** (`pkexec`), sans commande terminal. Le service privilégié installe une règle UFW **limitée à cette interface, à son sous-réseau et au seul port TCP 8766**. L’application lance alors un second serveur, lié **uniquement à l’adresse IPv4 locale**, et affiche les QR codes joueur/spectateur. Les invitations ne sont pas affichées avant activation effective du serveur LAN.

**Fermeture normale :** Álfastafl désactive le partage, ferme le serveur LAN et retire automatiquement **sa propre règle UFW**, identifiée par un commentaire unique. Le lancement suivant reste toujours en mode local. Les règles existantes des autres programmes (par exemple Enyalië sur 8765) ne sont jamais supprimées. Un processus privilégié garde le canal ouvert : si le programme s’arrête brutalement, la fermeture de ce canal déclenche le nettoyage. Après une coupure électrique ou un arrêt forcé du service privilégié, les anciennes règles marquées Álfastafl sont nettoyées à la prochaine activation LAN autorisée.

**Échec d'autorisation :** si polkit refuse, que le Wi-Fi n’est pas disponible ou qu'UFW ne confirme pas l’ouverture, aucune exposition réseau n’est lancée ; le plateau reste disponible en local. L'accès peut être réessayé en relançant une activité ou en re-sélectionnant la sauvegarde. La fermeture d'Álfastafl retire automatiquement sa règle ; il n'existe plus de commande manuelle d'activation. Il faut qu’**UFW et iproute2** soient installés, ainsi qu’un agent polkit fonctionnel sur le bureau Ubuntu.

**Limites de sécurité :** les liaisons restent en HTTP non chiffré ; utilisation exclusive sur un réseau local de confiance. L’ouverture ne concerne que le réseau privé détecté, sans redirection NAT vers Internet. Si une règle UFW équivalente existait déjà **avant** Álfastafl, elle appartient à l’administrateur et sera conservée. Si l'adresse IP locale change pendant la partie, il peut être nécessaire de redémarrer Álfastafl puis de re-sélectionner la partie pour reconstruire la règle.

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
arrière-plan). Les captures animées introduites dans la DEV 0.5.1-dev5
suspendent désormais l'horloge **sur le serveur**, uniquement pour les parties
créées avec l'option de cinématique activée. Les parties anciennes conservent
leur rythme initial.
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

**Restant** : validation exhaustive des cas atypiques du Tafl, y compris les forteresses de sortie complexes et les nuls théoriques de Fetlar (murs de boucliers, forteresse de sortie, encerclement), finalisation des cas particuliers de répétition, chiffrement du protocole LAN, découverte Avahi, raffinement artistique des figurines et modèles articulés pour des combats plus réalistes, orchestration musicale avancée, réalisation automatique, régie multi-parties et tableau de bord de tournoi avancé (l'interface de création/rencontres et l'équilibrage des factions sont déjà disponibles).

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
