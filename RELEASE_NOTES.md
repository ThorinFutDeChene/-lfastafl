# Álfastafl 0.5.0 — canal stable

Cette version stable reprend les fonctions de la **0.5.0-dev1** (plateau et figurines 3D) et remplace la stable 0.4.0.

## Plateau et figurines 3D

- Plateau 11 × 11 en chêne sombre, sculpté en volume, avec trône et coins adaptés aux trois variantes.
- **24 nains en bronze** (barbe, hache, bouclier), **12 elfes en pierre claire** (oreilles, cape, arc) et **un roi** (couronne, épée, sceptre). Première génération de figurines sculptées.
- Caméra libre à 360°, rotation, inclinaison, zoom, **Vue dessus**, **Recentrer** et niveaux de qualité **Éco / Standard / Haute**.
- Déplacements par clic, toucher ou glisser-déposer. Halo doré pour la pièce sélectionnée, cases légales dorées, captures possibles rouges ; propositions calculées par le moteur du serveur.
- Affichage 3D par défaut dans les parties et le tutoriel hôte. Mode **Vue 2D · clavier** et repli automatique si WebGL2 est absent ou perdu.
- Three.js r187 embarqué pour un fonctionnement hors ligne ; licence MIT et composants répertoriés dans THIRD_PARTY_NOTICES.md.

Le tutoriel de 28 exercices et le fonctionnement LAN volontaire de la 0.4.0 sont conservés. La version 3D n'implémente pas encore les scènes de combat animées, les figurines articulées ni les sons.

## Validation

La DEV d'origine a passé **174 tests Python**, **3 tests des réponses asynchrones**, **11 scénarios Chromium du tutoriel** et **13 scénarios Chromium du plateau 3D** ([CI DEV](https://github.com/ThorinFutDeChene/-lfastafl/actions/runs/44591067388)). La chaîne stable réexécute également les tests 3D et interdit la publication si l'un de ces contrôles échoue.

Le rendu QtWebEngine sur le poste Ubuntu MATE réel et sur des mobiles physiques reste à confirmer. Les limites connues de certaines règles particulières restent documentées dans RULES.md.

## Distribution

Paquet Debian **0.5.0**, version stable plus récente que **0.5.0~dev1**. Installation depuis le canal **Mises à jour → Stable**, avec conservation des sauvegardes et paramètres existants. Les choix de canal enregistrés restent inchangés.
