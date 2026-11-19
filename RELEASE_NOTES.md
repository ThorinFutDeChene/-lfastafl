# Álfastafl 0.5.0-dev1 — plateau 3D et figurines

Cette préversion reprend la [stable 0.4.0](https://github.com/ThorinFutDeChene/-lfastafl/releases/tag/v0.4.0) et introduit le plateau 3D dans les parties et le tutoriel.

## Nouveau : plateau et figurines 3D

- Plateau 11×11 épais à l'aspect chêne sombre, avec trône et coins adaptés aux règles.
- Premières figurines procédurales : **nains en bronze** avec barbe, hache et bouclier ; **elfes en pierre claire** avec oreilles, cape et arc ; **roi** avec couronne, épée et sceptre.
- Caméra indépendante : rotation à 360°, inclinaison, zoom, **Vue dessus**, **Recentrer** et qualités **Éco / Standard / Haute**.
- Coups par clic, toucher ou glisser-déposer. Repères dorés pour la sélection et les déplacements légaux, destinations de capture rouges calculées par le serveur, roi compris.
- **Vue 3D** par défaut dans les parties et le tutoriel. **Vue 2D · clavier** sélectionnable, avec bascule automatique si WebGL 2 est indisponible ou si le contexte graphique est perdu.
- Three.js r187 embarqué : aucun téléchargement Internet nécessaire au rendu. Mentions de licence MIT dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Les figurines sont une première version à affiner. Les modèles détaillés, leur préparation pour l'animation, les scènes de combat, les animations de capture et les sons viendront dans un jalon ultérieur.

## Validation

Les 174 tests Python ont réussi localement, dont six nouveaux tests de prévisualisation des captures. La publication est conditionnée à la réussite de cette suite et des scénarios Chromium du tutoriel et du plateau 3D, y compris les déplacements, les gestes tactiles, les droits des spectateurs et le repli en 2D. Le rendu dans Qt sur Ubuntu MATE et sur les mobiles réels reste à vérifier.

Les règles, les autorisations et les chronomètres restent sous l'autorité du serveur. Le démarrage LAN désactivé, son activation volontaire et le nettoyage à la fermeture sont conservés. Les limites du moteur concernant les forteresses complexes, certains nuls de Fetlar et les interprétations historiques restent documentées dans le mémo et dans [RULES.md](RULES.md).

## Distribution

Version Debian : `0.5.0~dev1`, plus récente que `0.4.0`. La **0.4.0** reste la stable de référence. Les nouvelles installations de cette préversion choisissent **DEV** par défaut ; le choix de canal enregistré est conservé. Pour recevoir cette version, sélectionner **Mises à jour → Développement (DEV)**. Les sauvegardes et paramètres utilisateurs sont conservés.
