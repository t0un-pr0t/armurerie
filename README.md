# armurerie

Gestionnaire web des personnages **WoW Forever**, alimenté par l'armurerie officielle
(`worldofwarcraft.blizzard.com/<langue>/forever/<région>/armory/character/<prénom>-<nom>`).

## Lancer

    npm start            # ou : node server.js

puis ouvrir http://localhost:3000. Aucune dépendance (Node ≥ 18).

Variables d'environnement facultatives :

| Variable          | Défaut  | Rôle                                      |
|-------------------|---------|-------------------------------------------|
| `PORT`            | `3000`  | port HTTP                                 |
| `HOST`            | `0.0.0.0` | adresse d'écoute                        |
| `REFRESH_MINUTES` | `15`    | intervalle de réactualisation automatique |
| `LOCALE`          | `fr-fr` | langue des noms (classes, objets…)        |

## Fonctionnement

- La liste des personnages est dans `data/characters.json` (modifiable depuis l'interface).
- Le serveur lit la page d'armurerie de chaque personnage, en extrait les données
  (`characterProfileInitialState`) et les met en cache dans `data/cache.json`.
- Réactualisation automatique côté serveur ; la page se met à jour toute seule chaque minute.
- Un personnage absent de l'armurerie (pas encore indexé, nom mal orthographié) est affiché
  « introuvable » et retenté à chaque passage.

## Simulateur

`/simulateur/` (dossier `public/simulateur`) : tout personnage de l'armurerie, de n'importe quelle classe,
se compare aux joueurs de son rang (niveau ± 3). Tout le calcul se fait dans le navigateur, en JavaScript
sans compilation.

- **Classement** : les personnages de l'armurerie du même rang, classés par taux de victoire moyen contre
  les 17 spécialisations jouées en duel (à leur propre niveau), avec le joueur type de la spécialisation comme repère.
- **Fiche comparée** : vos stats avec l'équipement porté, en pré-BiS (meilleur avant les donjons) et en BiS (suite épique de donjon),
  face au joueur type, avec votre place parmi les joueurs de votre rang et les victoires de chaque version.
- **Équipement** : chaque objet porté comparé aux deux paliers de votre niveau, les trois emplacements les plus
  en retard mis en avant (voir plus bas).
- **Duels** : 30 duels contre chaque spécialisation, 40 contre chaque vrai joueur du rang ;
  « Voir le duel » regroupe la série par issue (victoire, défaite, nul) et rejoue en cinématique le duel
  le plus typique de chacune, pour toutes les classes : cadres d'unité (PV, mana, rage ou énergie, points
  de combo, incantations, contrôles), arène vue de côté avec distance et chiffres flottants, formes du
  druide, familiers, lecture ×1 à ×8, frise des sorts et décomptes ; puis courbe des PV, dégâts par
  technique et journal (`public/simulateur/js/cinematique.js`, données de `Arene.scenarios` et `Arene.rejouer`).
- **Conseils** : gain en points de victoire avec un peu plus de PV, PA, dégâts d'arme, puissance des sorts,
  critique ou armure (mêmes duels avec et sans), adversaires difficiles, gain d'un rééquipement.

Fonctionnement :

- À chaque lecture, le serveur convertit la fiche Blizzard en combattant (`combattant.js` : classe,
  spécialisation principale, talents, stats, armes, objets portés) ; `GET /api/combattants` renvoie la liste.
  Les fiches lues avant l'ajout des objets n'en ont pas jusqu'à leur prochaine lecture : la section
  Équipement l'indique.
- Le moteur toutes classes est `public/simulateur/js/arene.js` (Node et navigateur) : priorités par classe,
  sorts appris selon le niveau et les talents, contrôles et rendements décroissants, interruptions, familiers.
  Les joueurs types (`TYPES`, `SPECS_TYPES`) sont calés au niveau 60 puis ramenés au niveau voulu.
- Paliers d'équipement (`public/simulateur/js/equipement.js`), avec de vrais objets :
  - **porté** : la fiche telle quelle ;
  - **pré-BiS** : pour chaque emplacement, le meilleur objet obtenable sans donjon, raid ni rang JcJ
    supérieur à 6 (quêtes, réputations, artisanat, hôtel des ventes), portable au niveau du personnage ;
  - **BiS** : le meilleur objet, donjons compris ; à valeur proche, celui de la liste JcJ de la tranche
    de champ de bataille (19, 29, 39, 49, 59, 60) passe en premier.

  Les candidats viennent des listes de toutes les spés de la classe, dans `public/simulateur/data/bis/<classe>.json`,
  produits par `node outils/bis.js` à partir de trois sources : listes BiS JcJ par tranche de
  [ForeverBattlegrounds](https://foreverbattlegrounds.com/gearing/), équipement de montée et pré-raid de
  [Timesaver](https://timesaver.gg/tools/wow-forever/leveling-gear/), statistiques Forever de chaque
  objet sur [Wowhead](https://www.wowhead.com/forever) (noms en français quand ils existent). Relancer le script
  pour rafraîchir. `node outils/bis.js cache` réutilise les pages déjà téléchargées.

  La valeur d'un objet additionne ses statistiques pondérées pour la spé (répartition de `REPARTITION`,
  PA, soins, mana, défense et armure des tanks, critique, DPS d'arme). Le personnage rééquipé
  (`profilObjets`) reçoit la différence de stats, d'armure et d'arme. Il garde race, talents, enchantements,
  bijoux et reliques. Il joue les mêmes duels, avec les mêmes graines, et apparaît comme repère dans le classement.
  Sans liste pour la classe, l'ancienne estimation par niveau d'objet (`profilPalier`) sert de repli.
- `/simulateur/bis.html` : les listes pré-BiS et BiS de chaque classe et spé, au niveau et dans la faction choisis.
- Le bouton « Simuler » de chaque carte ouvre `/simulateur/?perso=<région>/<slug>`.

Tests : `npm test` (arène, scénarios et cinématique, conversion des combattants sur les fiches figées
de `tests/fixtures/`, paliers d'équipement et listes BiS, icônes du moteur).

## Déploiement

En ligne sur https://armurerie.lefournilcreatif.fr :

- `docker compose up -d --build` : conteneur sur `127.0.0.1:3130`, données dans le volume `donnees` (`/data`) ;
- Caddy (`/etc/caddy/sites/armurerie.caddy`) assure le HTTPS ; les requêtes de modification
  (`/api/*` hors GET) demandent un mot de passe, rangé dans `.env` (non versionné).
