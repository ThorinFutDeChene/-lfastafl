# Álfastafl 0.1.0-dev2 — Préversion de développement

**Prototype technique — ne pas confondre avec une version stable.**

## Changements depuis dev1
- QR code joueur à gauche et spectateur à droite, liens au centre.
- Affichage responsive de la zone d'invitation.
- QR codes stables malgré les actualisations périodiques du plateau.

## Fonctionnalités actuellement testables
- Trois variantes de tafl, règles principales et plateau 11×11.
- Hôte Ubuntu avec interface intégrée et accès invité depuis un navigateur LAN.
- Demandes d'accès joueur/spectateur validées par l'hôte.
- Plusieurs parties, sauvegardes `.alfastafl`, reprise et premières fonctions de tournoi.

## Limitations connues
Le jeu n'intègre pas encore la véritable 3D, les cinématiques de combat,
les minuteries, la régie, la découverte mDNS, ni la gestion automatisée d'UFW.
Les règles complexes des variantes doivent encore être auditées. HTTP local
non chiffré : **ne pas exposer le serveur sur Internet**. Les invitations
sont destinées uniquement à un réseau local de confiance.

## Installation Ubuntu
Télécharger `alfastafl_0.1.0_dev2_all.deb`, puis :

```sh
sudo apt install ./alfastafl_0.1.0_dev2_all.deb
```

Code source et licence : GNU GPL-3.0, fichiers disponibles dans cette publication.
