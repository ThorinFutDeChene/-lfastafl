# Álfastafl — DEV 0.1.0-dev2

Projet GPL-3.0 de jeu de tafl Viking-fantasy, prévu pour Ubuntu avec hôte local et invités via navigateur.

## Correction interface DEV 0.1.0-dev2

Les deux QR codes d’invitation sont maintenant séparés : joueur à gauche, informations au centre, spectateur à droite. Sur les petits écrans, ils restent côte à côte sous les informations. Les QR codes ne sont plus rechargés à chaque rafraîchissement de l’état réseau, ce qui évite les interruptions pendant la lecture au smartphone.

## État réel

Il s'agit d'un **prototype technique jouable**, pas d'une version stable complète.

**Implémenté et testé** : plateau 11×11 et 37 pièces selon deux dispositions, trois variantes de base, déplacement orthogonal, captures usuelles, conditions de victoire principales, serveur HTTP multijoueur, invitation joueur/spectateur avec validation depuis le PC hôte, plusieurs parties, sauvegardes atomiques `.alfastafl`, reprise, historique des coups, génération de QR, infrastructure préliminaire des trois formats de tournoi et équilibrage des camps.

**Non terminé** : audit exhaustif des subtilités historiques et des règles de Copenhague (murs de boucliers, forteresse de sortie, encerclement), traitement complet des répétitions, timer et suspension réseau, authentification renforcée, détecteur Avahi, ouverture/fermeture UFW automatique avec privilèges, moteur 3D WebGL/Three.js et modèles Blender, cinématiques, bandes-son, réalisation automatique, régie multi-parties, tournoi entièrement intégré à l'interface, publication GitHub automatisée et mises à jour DEV/stables. La version actuelle affiche un plateau HTML/CSS en légère perspective, **pas la 3D réelle validée pour le produit final**.

## Tests sur Ubuntu (sans installer)

```bash
cd alfastafl_dev
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 -m alfastafl --host 127.0.0.1 --port 8766
```

Dans Firefox local : `http://127.0.0.1:8766/`. Pour un accès LAN en test, lancer explicitement `--host 0.0.0.0` depuis un **réseau local de confiance** et vérifier les règles du pare-feu manuellement ; la gestion UFW automatique reste à développer. Le protocole HTTP n'est **pas chiffré**, il ne convient pas à une exposition Internet.

## Installation `.deb`

Le paquet construit installe les sources dans `/opt/alfastafl/`, le lanceur natif PyQt6 dans `/usr/bin/alfastafl`, et un raccourci `.desktop`. Dépendances : `python3`, `python3-pyqt6`, `python3-pyqt6.qtwebengine`, `python3-qrcode`, `python3-pil`.

## Données

`$XDG_DATA_HOME/alfastafl/parties/*.alfastafl`, ou `~/.local/share/alfastafl/parties/*.alfastafl`, avec écriture atomique. La désinstallation ne supprime pas ces données.

## Licence

GNU GPL version 3, voir `LICENSE`. Code source public, pas de télémétrie ni service cloud central.

## Mise à jour de l'application Ubuntu (à partir de 0.1.0-dev3)

Le menu natif **Mises à jour** propose un canal **Stable** ou **DEV**, un bouton de vérification manuelle et l'option de vérification au démarrage. La vérification se déroule en arrière-plan, sans empêcher de jouer en réseau local hors connexion Internet.

Le canal DEV accepte les préversions et les versions stables publiées ; le canal stable ignore les préversions. La version installée est comparée aux versions Debian à l'aide de `dpkg --compare-versions` pour éviter les réinstallations ou régressions.

Avant installation, le jeu télécharge `SHA256SUMS.txt` et le `.deb` depuis les assets de la même Release GitHub, contrôle la somme SHA-256, les métadonnées Debian (nom/version/architecture), puis demande une **deuxième confirmation**. L'installation passe par l'agent d'autorisation Linux `pkexec` et `/usr/bin/apt-get`. Jamais de commande shell ni d'installation silencieuse. Un redémarrage manuel de l'application est nécessaire pour utiliser la nouvelle version.

Les paramètres sont conservés dans `$XDG_CONFIG_HOME/alfastafl/settings.ini` (par défaut `~/.config/alfastafl/settings.ini`). Les sauvegardes `.alfastafl` ne sont pas touchées. En l'absence d'Internet, le contrôle échoue sans empêcher le lancement. Le contrôle SHA-256 vérifie l'intégrité du paquet par rapport aux informations publiées sur GitHub ; il ne constitue pas à lui seul une signature cryptographique indépendante de l'éditeur.
