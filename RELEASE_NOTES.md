# Álfastafl 0.7.2-dev4 — Tournois sur QR, rondes automatiques et podium 3D

## Création et inscriptions (PC hôte)

- Fenêtre « Tournois — factions équilibrées » : suppression de toute saisie
  manuelle des participants. L’organisateur choisit le nom, le format et,
  pour le système suisse, le nombre de rondes.
- Dès « Créer ce tournoi », fermeture de la fenêtre et affichage permanent
  des QR **joueur** et **spectateur** dans la colonne gauche de l’hôte.
- Chaque joueur entre **uniquement son pseudo** sur son propre appareil.
  Sa demande s’affiche dans la colonne de gauche du PC hôte :
  **Valider** ou **Refuser**. Dès validation, la demande disparaît et le
  participant rejoint automatiquement le plateau d’attente.
- Le PC hôte reste **organisateur/spectateur**, sans pouvoir jouer dans un
  tournoi QR. Il ne choisit aucune faction.
- Le bouton **Tirer les rondes** se trouve dans la marge sous le QR joueur.
  Le premier tirage est possible avec au moins deux inscriptions validées.
- Spectateurs : accès direct, y compris avant le tirage, en lecture seule,
  dans la limite configurée (10 appareils par défaut, joueurs et hôte exclus).

## Téléphones des joueurs

1. Pseudo → **Demander l’accès**.
2. Écran d’attente de l’autorisation par le PC hôte.
3. **Plateau plein écran 2D/3D** non interactif et indication
   « En attente du partenaire de ronde ».
4. Après tirage, révélation cinématique **3D de l’Elfe ou du Nain** attribué,
   puis plateau jouable avec boutons 2D/3D et **pseudo de l’adversaire**.
5. Après une rencontre, le résultat et ses animations restent visibles,
   puis retour au plateau d’attente ; la rencontre suivante est proposée
   automatiquement, sans ressaisir le pseudo ni repasser par l’autorisation.

## Automatisation et récompenses

- Le serveur attribue les binômes et équilibre les factions selon leur
  historique ; la première ronde est tirée au sort.
- Après enregistrement du dernier résultat d’une ronde, la suivante est
  automatiquement préparée. Les matchs nuls en élimination directe peuvent
  provoquer une revanche et une **petite finale pour le bronze** est créée
  lorsqu’il faut départager deux demi-finalistes éliminés.
- Dès que leur placement devient définitif, les trois premiers reçoivent
  une **scène 3D** : coupe d’or (1er), médaille d’argent « 2ème » et
  médaille de bronze « 3ème ». Les autres voient leur rang en grand.
- Pour les tournois à points, départage : points, victoires puis points
  des adversaires ; les ex æquo restants font l’objet d’un tirage au sort
  impartial. Le classement définitif est enregistré sur l’hôte.
- Les inscriptions, appareils reconnus, résultats et classements survivent
  aux redémarrages. Les parties terminées ne laissent plus de fichier
  `.alfastafl` (règle introduite en DEV3).

## Compatibilité

- Les anciens tournois préinscrits restent consultables ; leurs règles,
  résultats et historiques sont conservés.
- La version stable 0.7.1 n’est pas modifiée.

---

# Álfastafl 0.7.2-dev3 — Suppression automatique des sauvegardes terminées

- **Aucune sauvegarde de partie terminée :** dès qu'une partie est gagnée,
  abandonnée, perdue au temps, déclarée forfait ou terminée par un nul,
  son fichier `.alfastafl` est supprimé automatiquement.
- Une partie **encore en cours ou mise en pause** continue d'être sauvegardée
  et peut être reprise normalement.
- **Sauvegardes…** ne présente plus les parties terminées. L'écran des
  joueurs et spectateurs conserve néanmoins le plateau et le résultat
  jusqu'à la fermeture de l'application.
- Au premier démarrage de cette version, les anciens fichiers de parties
  déjà terminées sont également supprimés.
- **Tournois :** le résultat, le classement et la répartition des factions
  sont enregistrés séparément **avant** de supprimer le plateau terminé.
  La reprise d'un tournoi reste possible après redémarrage, même si la
  rencontre achevée n'a plus de sauvegarde.
- La stable 0.7.1 n'est pas modifiée.

## Validation

Tests de fin de partie, victoire, abandon, nul, expiration du temps,
forfait, récupération des anciens fichiers, persistance des tournois
et protection contre les erreurs d'écriture.

---

# Álfastafl 0.7.2-dev2 — Connexion mobile et spectateurs directs

## Joueurs via QR code

- Un seul champ « Votre pseudo » et un bouton « Demander l'accès ».
- Les identifiants techniques de partie et d'invitation restent cachés.
- Un écran d'attente remplace le formulaire jusqu'à la décision du PC hôte.
- Dès l'autorisation, le plateau occupe toute la fenêtre du navigateur,
  avec uniquement les deux boutons 2D et 3D.
- Le PC hôte conserve l'affectation des camps et le contrôle des accès.

## Spectateurs via QR code

- Connexion immédiate, sans pseudo ni validation manuelle.
- Plateau en lecture seule : aucune commande de jeu ou de caméra.
- Diffusion des tournois avec rotation des rencontres et cinématiques.
- Le serveur refuse les commandes de jeu même si un client contourne l'interface.

## Limite des connexions spectateurs

- Réseau → Connexions et autorisations : plafond configurable de 0 à 100,
  fixé à **10 spectateurs par défaut**.
- Décompte exclusif des appareils spectateurs : **ni le PC hôte ni les
  appareils joueurs** ne consomment de place.
- Les vues internes de diffusion d'un tournoi ne sont pas recomptées.
- Une session perdue libère sa place après 45 secondes d'inactivité ;
  la limite est vérifiée lors de toute nouvelle connexion.
- Le réglage est conservé entre les redémarrages de l'hôte.

## Validation

- Nouvelle suite serveur pour quota, droits, déconnexion et persistance.
- Recette navigateur avec deux écrans joueur, plein écran, QR spectateur
  direct, interdiction d'interaction et saturation de la limite.
- Régression des tournois à quatre joueurs et diffusion des captures.
- La stable n'est pas modifiée par cette version DEV.

---

# Álfastafl 0.7.2-dev1 — Menus simplifiés

## Nouvelle organisation des menus hôte

**Fichier**
- Sauvegarder la partie
- Sauvegardes…
- Quitter

**Partie**
- **2 joueurs** — ouvre le formulaire de création d'une partie à
  deux joueurs, anciennement dans « Fichier → Nouvelle partie »,
  avec activation automatique du réseau local.
- Tutoriel…
- Tournois et tirage des factions…

**Entrées retirées du menu Partie**
- Jouer / Spectateur / Arbitrage…
- Historique des coups…
- Diffusion des rencontres du tournoi…

## Compatibilité

Les commandes ne sont supprimées **que du menu natif**.
La gestion des autorisations, les rôles, l'historique interne et la
diffusion des tournois restent disponibles dans le jeu par leurs
autres interfaces et mécanismes existants.

La création de partie conserve le même formulaire, les mêmes QR
codes et la même ouverture automatique du LAN. Aucun changement
des règles, des formats de sauvegarde ni de l'API réseau.

## Recette

Tests de la composition des menus et de la liaison « 2 joueurs »
à la commande de création. Régressions moteur, tournoi, tutoriel
et interfaces Qt/Chromium/Firefox/WebKit exécutées en CI.

**Canal :** développement (DEV). **Stable 0.7.1 inchangée.**
