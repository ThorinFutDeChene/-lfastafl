# Álfastafl 0.7.0-dev10 — Correctif critique de démarrage Ubuntu

## Symptôme

L'application installée (en particulier DEV8 et DEV9) ne s'ouvrait
pas : aucune fenêtre ne s'affichait.

## Cause identifiée et correction

Le constructeur de la fenêtre Qt6 utilisait
`QWebEngineSettings.WebAttribute.JavascriptCanCloseWindows`,
un attribut propre à l'ancien moteur **Qt WebKit**, qui n'existe
**pas dans Qt WebEngine 6**. Sur le véritable Qt6 Ubuntu, l'accès à
cette propriété levait une exception et empêchait l'ouverture de
la fenêtre principale, sans boîte de dialogue puisque le lanceur
Debian utilise `Terminal=false`.

**Correctif :** suppression de cet attribut inexistant, conservation
de `JavascriptCanOpenWindows` supporté et de
`windowCloseRequested` pour fermer les fenêtres si nécessaire.

## Recette anti-régression renforcée

- Le faux Qt des tests Python ne définit désormais plus cet attribut
  invalide ; toute réintroduction échoue en CI.
- Un test nouveau exécute réellement **PyQt6 + QtWebEngine** dans une
  session graphique Xvfb, sur le système Ubuntu du runner GitHub.
  La fenêtre native et la page WebEngine de jeu doivent être ouvertes ;
  le processus doit rester actif. Ce test est obligatoire avant
  la compilation et la publication du paquet .deb.
- Les contrôles Python, les tests des menus et QR joueur/spectateur et
  la régression du plateau 3D restent exécutés.

## Distribution

- **Version Debian : 0.7.0~dev10**. Canal **DEV**, pas stable.
- La stable 0.5.0 n'est pas modifiée.
- Aucune migration des sauvegardes ; aucune modification des règles
  ni des autorisations réseau.
