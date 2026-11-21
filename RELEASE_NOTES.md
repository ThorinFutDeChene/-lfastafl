# Álfastafl 0.7.1-dev7 — Recette renforcée des tournois

## Tests de finale et captures réellement simultanées

- Un scénario Python contrôle l'intégralité d'une élimination directe
  à **quatre joueurs** : deux demi-finales, validation par l'hôte,
  reconnexion des deux gagnants sur la finale, victoire finale,
  persistance après redémarrage et absence de ronde supplémentaire.
- Deux captures sont désormais provoquées par de **vrais coups légaux**
  envoyés simultanément à deux parties indépendantes via l'API.
  Les animations issues du moteur sont vérifiées dans la diffusion
  du tournoi depuis un spectateur autorisé.
- Les tests de navigateur déjà en place continuent de vérifier
  les connexions de quatre joueurs, la rotation des plateaux,
  les QR codes, les permissions et la reconnexion.
- Une procédure de recette physique avec **14 scénarios** sur
  Ubuntu MATE, quatre appareils joueurs et un spectateur est
  fournie dans `RECETTE_TOURNOIS_TERRAIN.md`.

## Portée de la préversion

Aucun changement de règle, de format de sauvegarde, de protocole
d'authentification ni de comportement du plateau par rapport
à 0.7.1-dev6. La branche stable **0.7.0 reste inchangée**.

La réussite de GitHub Actions ne remplace pas les essais avec
plusieurs appareils réels et un pare-feu UFW actif. La promotion
en stable dépend notamment de cette recette terrain.
