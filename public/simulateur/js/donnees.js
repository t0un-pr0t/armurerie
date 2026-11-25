/*
 * Données du simulateur : druide niveau 60, World of Warcraft: Forever
 * (sortie le 4 novembre 2026, build 1.60.1). Les valeurs viennent des notes
 * de développement relevées par des sites de fans (voir SOURCES) ; elles se
 * contredisent parfois, et CHANGEMENTS_FOREVER dit lesquelles sont sûres.
 * Elles servent à comparer des choix (forme, ouverture, soins) entre eux,
 * pas à prédire un combat au point de vie près. Corrigez-les ici.
 */
(function (racine) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Talents (51 points au niveau 60). palier : 1 à 7, il faut 5 points par
  // palier déjà dépensés dans l'arbre. col : position dans la grille (1 à 4).
  // Les paliers suivent les sources ; quand elles ne donnent pas la position,
  // elle est déduite et marquée « position supposée » dans le commentaire.
  // ---------------------------------------------------------------------------
  const ARBRES = [
    {
      id: 'equilibre', nom: 'Équilibre',
      talents: [
        { id: 'genese', nom: 'Genèse', max: 5, palier: 1, col: 1, nouveau: true, desc: 'Dégâts et soins périodiques +2 % par rang. Le simulateur l\'applique à vos soins sur la durée.', sim: true },
        { id: 'colereAmelioree', nom: 'Colère améliorée', max: 5, palier: 1, col: 2, desc: 'Incantation de Colère −0,1 s et coût −10 % par rang.' },
        { id: 'lueurLunaire', nom: 'Lueur lunaire', max: 3, palier: 2, col: 1, desc: 'Coût des sorts de dégâts −8 % par rang.' },
        { id: 'eclatLunaireAmeliore', nom: 'Éclat lunaire amélioré', max: 2, palier: 2, col: 2, desc: 'Dégâts et critique d\'Éclat lunaire +5 % par rang.' },
        { id: 'majesteNature', nom: 'Majesté de la nature', max: 2, palier: 2, col: 3, nouveau: true, desc: 'Critique des sorts et en mêlée +2 % par rang, formes comprises.', sim: true },
        { id: 'porteeNature', nom: 'Allonge de la nature', max: 2, palier: 2, col: 4, desc: 'Portée des sorts d\'Équilibre +10 % et toucher de tous les sorts et attaques +2 % par rang.', sim: true },
        { id: 'sarmentsAmeliores', nom: 'Sarments améliorés', max: 3, palier: 3, col: 1, desc: 'Sarments +25 % de dégâts par rang ; la cible encaisse jusqu\'à 25 % de dégâts de plus avant que les racines cèdent.', sim: true },
        { id: 'splendeurNature', nom: 'Splendeur de la nature', max: 1, palier: 3, col: 2, nouveau: true, desc: 'Éclat lunaire et Récupération +3 s, Rétablissement +6 s, Essaim d\'insectes +2 s.', sim: true },
        { id: 'essaim', nom: 'Essaim d\'insectes', max: 1, palier: 4, col: 1, desc: 'Sort : 48 dégâts de nature en 12 s (rang 1), toucher de la cible −2 %.' },
        { id: 'vengeance', nom: 'Vengeance', max: 5, palier: 4, col: 2, desc: 'Bonus aux critiques des sorts des Arcanes et de Nature +20 % par rang.' },
        { id: 'feuEtoileAmeliore', nom: 'Feu stellaire amélioré', max: 5, palier: 4, col: 3, desc: 'Incantation de Feu stellaire −0,1 s par rang, 3 % de chances d\'étourdir 3 s.' },
        { id: 'surcroissance', nom: 'Surcroissance', max: 2, palier: 5, col: 1, nouveau: true, desc: 'Sarments peut toucher une cible de plus. Remplace Emprise de la nature améliorée.' },
        { id: 'graceNature', nom: 'Grâce de la nature', max: 1, palier: 5, col: 2, desc: 'Un critique de sort non périodique donne +10 % de vitesse d\'incantation pendant 3 s.' },
        { id: 'eclipse', nom: 'Éclipse', max: 3, palier: 5, col: 3, nouveau: true, desc: 'Colère réduit l\'incantation des 2 Feux stellaires suivants de 0,17 s par rang.' },
        { id: 'fureurLunaire', nom: 'Fureur lunaire', max: 5, palier: 6, col: 2, desc: 'Dégâts des Arcanes et de Nature +2 % par rang.' },
        { id: 'formeSelenien', nom: 'Forme de sélénien', max: 1, palier: 7, col: 2, desc: 'Armure des objets +360 %, Augure de clarté deux fois plus fréquent, critique des sorts du groupe +3 %. Pas de soin.' }
      ]
    },
    {
      id: 'farouche', nom: 'Combat farouche',
      talents: [
        { id: 'furie', nom: 'Fureur', max: 5, palier: 1, col: 1, change: true, desc: 'Arrive depuis Restauration. Ours : 20 % de chances par rang de gagner 10 rage en prenant la forme. Félin : vous retrouvez 20 % par rang de l\'énergie que vous aviez en quittant le félin, plus 2 énergie par seconde et par rang passée hors forme (20 au plus par rang).', sim: true },
        { id: 'ferocite', nom: 'Férocité', max: 5, palier: 1, col: 2, desc: 'Coût de Mutilation, Morsure primitive, Balayage, Griffe et Griffure −1 rage ou énergie par rang.', sim: true },
        { id: 'celeriteFeline', nom: 'Célérité farouche', max: 2, palier: 2, col: 1, change: true, desc: 'En félin : vitesse +15 % et esquive +2 % par rang, en intérieur aussi.', sim: true },
        { id: 'instinctFarouche', nom: 'Instinct farouche', max: 3, palier: 2, col: 2, change: true, desc: 'Balayage +10 % de dégâts par rang, Rôder plus difficile à repérer.', sim: true },
        { id: 'impactBrutal', nom: 'Impact brutal', max: 2, palier: 2, col: 3, change: true, desc: 'Étourdissement de Sonner et Traquer +0,5 s et recharge de Sonner −15 s par rang.', sim: true },
        { id: 'peauEpaisse', nom: 'Peau épaisse', max: 3, palier: 2, col: 4, change: true, desc: 'En forme animale : armure de base +3 par niveau et par rang (+180 par rang au niveau 60). Les sources divergent sur ce chiffre.', sim: true },
        { id: 'furieSauvage', nom: 'Furie sauvage', max: 2, palier: 3, col: 1, change: true, desc: 'Dégâts de Griffe, Griffure, Lambeau, Mutilation et Balayage +5 % par rang.', sim: true },
        { id: 'attaquesDechiquetantes', nom: 'Attaques déchiquetantes', max: 3, palier: 3, col: 2, nouveau: true, desc: 'Coût de Lambeau −2 énergie par rang ; coût de Lacération −1 rage à 3/3. Remplace Lambeau amélioré.', sim: true },
        { id: 'chargeFarouche', nom: 'Charge farouche', max: 1, palier: 3, col: 3, change: true, desc: 'Ours : charge (8–25 m), immobilise 4 s et interrompt, recharge 15 s. Félin : bond dans le dos de la cible, recharge 30 s.', sim: true },
        { id: 'griffesAcerees', nom: 'Griffes acérées', max: 2, palier: 3, col: 4, change: true, desc: 'Critique en forme d\'ours et de félin +3 % par rang.', sim: true },
        { id: 'frappesPredatrices', nom: 'Frappes prédatrices', max: 3, palier: 4, col: 1, desc: 'Puissance d\'attaque en forme +50 % du niveau par rang (+90 à 3/3).', sim: true },
        { id: 'laceration', nom: 'Lacération', max: 1, palier: 4, col: 2, requis: 'furieSauvage', nouveau: true, desc: 'Ours, 15 rage : saignement cumulable 5 fois, qui ignore l\'armure. Le rang de base saigne 20 en 15 s ; le simulateur prend 100 par cumul au rang max (non publié).', sim: true },
        { id: 'frenesieSanglante', nom: 'Frénésie sanglante', max: 2, palier: 4, col: 3, change: true, desc: 'Fusion avec Furie primitive. Un critique a 50 % de chances par rang de rendre 5 rage (ours) ou un point de combo de plus (félin).', sim: true },
        { id: 'disciplinePredatrice', nom: 'Discipline prédatrice', max: 1, palier: 4, col: 4, nouveau: true, desc: 'Morsure féroce ne consomme plus l\'énergie en trop mais en tire encore des dégâts (la moitié, dans le simulateur).', sim: true },
        { id: 'instinctNaturel', nom: 'Instinct naturel', max: 2, palier: 5, col: 1, nouveau: true, desc: 'Bonus aux dégâts critiques en mêlée +10 % par rang ; vos soins gagnent un bonus égal à une part de votre Intelligence (12 % ou 25 % selon les sources).', sim: true },
        { id: 'chefMeute', nom: 'Chef de la meute', max: 1, palier: 5, col: 2, change: true, desc: 'Critique +3 % pour le groupe en forme d\'ours ou de félin. Ne se cumule pas avec l\'aura du sélénien.', sim: true },
        { id: 'reactionNaturelle', nom: 'Réaction naturelle', max: 5, palier: 5, col: 3, nouveau: true, desc: 'Esquive +1 % par rang en forme ; en ours, 20 % de chances par rang de gagner 5 rage quand vous esquivez.', sim: true },
        { id: 'dechirerLacerer', nom: 'Déchirer et lacérer', max: 5, palier: 6, col: 2, nouveau: true, desc: 'Dégâts en mêlée contre une cible qui saigne +2 % par rang (3 % selon une source).', sim: true },
        { id: 'morsurePrimitive', nom: 'Morsure primitive', max: 3, palier: 7, col: 2, requis: 'chefMeute', nouveau: true, desc: 'Ours, 20 rage, recharge 6 s : 100 % des dégâts de l\'arme + 77 au rang 3. Talent ultime de l\'ours (ancien Mutiler).', sim: true },
        { id: 'puissanceChangeante', nom: 'Puissance changeante', max: 1, palier: 7, col: 3, requis: 'disciplinePredatrice', nouveau: true, desc: 'Félin : convertit 55 % du mana de base en 40 énergie. Recharge 8 s, impossible à énergie pleine. Talent ultime du félin, remplace Fureur du tigre et la transformation rapide.', sim: true }
      ]
    },
    {
      id: 'restauration', nom: 'Restauration',
      talents: [
        { id: 'coeurSauvage', nom: 'Cœur sauvage', max: 5, palier: 1, col: 1, change: true, desc: 'Arrive depuis Combat farouche, sans prérequis. Par rang : Intelligence +2 %, Endurance en ours +4 %, Force en félin +2 %.', sim: true },
        { id: 'focaliseNature', nom: 'Focalisation de la nature', max: 5, palier: 1, col: 2, change: true, desc: 'Recul des sorts de Nature et des Arcanes quand vous êtes frappé −14 % par rang (Sarments compris).', sim: true },
        { id: 'naturaliste', nom: 'Naturaliste', max: 5, palier: 2, col: 1, change: true, desc: 'Remplace Toucher guérisseur amélioré. Incantation de Toucher guérisseur −0,1 s et dégâts physiques +2 % par rang.', sim: true },
        { id: 'changeformeNaturel', nom: 'Changeforme naturel', max: 3, palier: 2, col: 2, change: true, desc: 'Arrive depuis Équilibre. Coût en mana des formes −10 % par rang.', sim: true },
        { id: 'reflexion', nom: 'Réflexion', max: 3, palier: 2, col: 3, change: true, desc: 'Environ 17 % par rang de votre régénération de mana continue pendant l\'incantation (5 % dans Classic).', sim: true },
        { id: 'donNature', nom: 'Don de la nature', max: 5, palier: 3, col: 1, change: true, desc: 'Effets des soins +2 % par rang. Ne demande plus Essaim d\'insectes.', sim: true },
        { id: 'subtilite', nom: 'Subtilité', max: 3, palier: 3, col: 2, change: true, desc: 'Menace des sorts de Nature et des Arcanes réduite.' },
        { id: 'recuperationAmelioree', nom: 'Récupération améliorée', max: 3, palier: 3, col: 3, desc: 'Effet de Récupération +5 % par rang.', sim: true },
        { id: 'floraison', nom: 'Floraison', max: 1, palier: 3, col: 4, nouveau: true, desc: 'Quand Récupération ou Rétablissement arrive à son terme, soigne de 100 % de votre Esprit (50 % s\'il est dissipé). Remplace Don de la Terre-mère.', sim: true },
        { id: 'espritTranquille', nom: 'Esprit tranquille', max: 5, palier: 4, col: 1, desc: 'Coût en mana de Toucher guérisseur −2 % par rang.', sim: true },
        { id: 'retablissementAmeliore', nom: 'Rétablissement amélioré', max: 5, palier: 4, col: 3, requis: 'recuperationAmelioree', change: true, desc: 'Critique de Rétablissement +10 % par rang. Demande Récupération améliorée.', sim: true },
        { id: 'prompteGuerison', nom: 'Prompte guérison', max: 1, palier: 4, col: 4, change: true, desc: 'Descend du palier 7 au palier 4. Consomme votre Récupération ou Rétablissement et rend d\'un coup tout ce qui restait à soigner. 20 % du mana de base, recharge 15 s.', sim: true },
        { id: 'rapiditeNature', nom: 'Rapidité de la nature', max: 1, palier: 5, col: 1, desc: 'Votre prochain sort de Nature devient instantané. Recharge 3 min.', sim: true },
        { id: 'espritVivant', nom: 'Esprit vivant', max: 3, palier: 5, col: 2, nouveau: true, desc: 'Esprit +5 % par rang.', sim: true },
        { id: 'tranquiliteAmelioree', nom: 'Tranquillité améliorée', max: 2, palier: 5, col: 4, desc: 'Menace de Tranquillité −50 % et recharge −30 %.' },
        { id: 'croissanceSauvage', nom: 'Croissance sauvage', max: 1, palier: 7, col: 2, nouveau: true, desc: 'Soin de groupe sur la durée : 336 PV en 7 s, 3 s d\'incantation, recharge 6 s.' }
      ]
    }
  ];

  // Préréglages de talents JcJ (format id: rang). Tous à 51 points.
  const PRESETS_TALENTS = [
    {
      id: 'felinPuissance', nom: 'Félin, Puissance changeante (0/31/20)',
      desc: 'Talent ultime du félin pour l\'énergie, Chef de la meute, Charge farouche et Impact brutal. En Restauration : Cœur sauvage, Naturaliste et Prompte guérison, sans Rapidité de la nature.',
      points: {
        furie: 5, ferocite: 5, celeriteFeline: 2, impactBrutal: 2, furieSauvage: 2, attaquesDechiquetantes: 3,
        chargeFarouche: 1, griffesAcerees: 2, frappesPredatrices: 3, frenesieSanglante: 2, disciplinePredatrice: 1,
        chefMeute: 1, peauEpaisse: 1, puissanceChangeante: 1,
        coeurSauvage: 5, focaliseNature: 5, naturaliste: 5, recuperationAmelioree: 3, retablissementAmeliore: 1, prompteGuerison: 1
      }
    },
    {
      id: 'ferocheRapidite', nom: 'Farouche + Rapidité (0/30/21)',
      desc: 'Pas de talent ultime farouche, mais Rapidité de la nature pour un Toucher guérisseur instantané et Prompte guérison. Le choix polyvalent pour les deux formes.',
      points: {
        furie: 5, ferocite: 5, celeriteFeline: 2, impactBrutal: 2, peauEpaisse: 1, furieSauvage: 2, attaquesDechiquetantes: 3,
        chargeFarouche: 1, griffesAcerees: 2, frappesPredatrices: 3, frenesieSanglante: 2, chefMeute: 1, instinctNaturel: 1,
        coeurSauvage: 5, focaliseNature: 5, naturaliste: 5, recuperationAmelioree: 3, retablissementAmeliore: 1, prompteGuerison: 1,
        rapiditeNature: 1
      }
    },
    {
      id: 'oursMorsure', nom: 'Ours, Morsure primitive (0/33/18)',
      desc: 'Talent ultime de l\'ours, Lacération pour saigner les cibles à forte armure, Peau épaisse 3/3. En Restauration : Cœur sauvage 5/5 (Endurance +20 % en ours) et Prompte guérison.',
      points: {
        furie: 5, ferocite: 5, celeriteFeline: 2, impactBrutal: 2, peauEpaisse: 3, furieSauvage: 2, chargeFarouche: 1,
        griffesAcerees: 2, frappesPredatrices: 3, laceration: 1, frenesieSanglante: 2, chefMeute: 1, reactionNaturelle: 1,
        morsurePrimitive: 3,
        coeurSauvage: 5, focaliseNature: 5, naturaliste: 4, recuperationAmelioree: 3, prompteGuerison: 1
      }
    },
    {
      id: 'hybrideMajeste', nom: 'Majesté + félin (10/31/10)',
      desc: 'Les nouveaux talents d\'Équilibre utiles en forme : Majesté de la nature (+4 % de critique) et Allonge de la nature (+4 % de toucher). Peu de soins.',
      points: {
        genese: 5, majesteNature: 2, porteeNature: 2, lueurLunaire: 1,
        furie: 5, ferocite: 5, celeriteFeline: 2, impactBrutal: 2, peauEpaisse: 1, furieSauvage: 2, attaquesDechiquetantes: 3,
        chargeFarouche: 1, griffesAcerees: 2, frappesPredatrices: 3, frenesieSanglante: 2, disciplinePredatrice: 1,
        chefMeute: 1, puissanceChangeante: 1,
        coeurSauvage: 5, focaliseNature: 5
      }
    }
  ];

  // ---------------------------------------------------------------------------
  // Équipement du druide (statistiques totales, buffs exclus). Dans Forever,
  // les formes frappent avec le DPS de l'arme équipée (dpsArme).
  // ---------------------------------------------------------------------------
  const PRESETS_EQUIPEMENT = [
    { id: 'bleu', nom: 'Bleu pré-raid', stats: { force: 140, agilite: 120, pa: 260, dpsArme: 48, endurance: 250, intelligence: 210, esprit: 140, armure: 1900, soins: 150, crit: 1, toucher: 1 } },
    { id: 'pvp', nom: 'Épique JcJ', stats: { force: 180, agilite: 150, pa: 380, dpsArme: 56, endurance: 300, intelligence: 230, esprit: 140, armure: 2400, soins: 250, crit: 2, toucher: 2 } },
    { id: 'raid', nom: 'Épique raid farouche', stats: { force: 230, agilite: 240, pa: 520, dpsArme: 62, endurance: 270, intelligence: 180, esprit: 110, armure: 2200, soins: 60, crit: 4, toucher: 4 } }
  ];

  // ---------------------------------------------------------------------------
  // Sorts et techniques du druide (rang max). Coûts avant talents.
  // forme : humanoide, ours, felin, animal (ours ou félin) ou toutes.
  // ---------------------------------------------------------------------------
  const SORTS = {
    formeOurs:       { nom: 'Forme d\'ours redoutable', forme: 'humanoide', mana: 'forme', gcd: 1.5, desc: 'Armure des objets +360 %, +1 240 PV, génère de la rage. Brise sarments et ralentissements.' },
    formeFelin:      { nom: 'Forme de félin', forme: 'humanoide', mana: 'forme', gcd: 1.5, desc: 'Énergie et points de combo. Brise sarments et ralentissements, immunité à la Métamorphose.' },
    annulerForme:    { nom: 'Quitter la forme', gcd: 0, desc: 'Instantané, hors temps de recharge global.' },
    rodeur:          { nom: 'Rôder', forme: 'felin', gcd: 0, recharge: 10, desc: 'Camouflage hors combat, vitesse −30 %. À énergie pleine, Posture (Poised) retire 10 au coût de la première technique.' },
    traquer:         { nom: 'Traquer', forme: 'felin', energie: 50, gcd: 1, desc: 'Depuis Rôder : étourdit 2 s (+ Impact brutal) et saigne 420 en 18 s. 1 point de combo.' },
    ravager:         { nom: 'Ravager', forme: 'felin', energie: 60, gcd: 1, desc: 'Depuis Rôder, dans le dos : 435 % des dégâts de l\'arme + 98. 1 point de combo.' },
    griffe:          { nom: 'Griffe', forme: 'felin', energie: 45, gcd: 1, desc: '140 % des dégâts + 27. 1 point de combo.' },
    lambeau:         { nom: 'Lambeau', forme: 'felin', energie: 60, gcd: 1, desc: 'Dans le dos : 200 % des dégâts + 80. 1 point de combo.' },
    griffure:        { nom: 'Griffure', forme: 'felin', energie: 40, gcd: 1, desc: '76 dégâts puis 126 en 9 s. 1 point de combo.' },
    dechirure:       { nom: 'Déchirure', forme: 'felin', energie: 30, gcd: 1, desc: 'Coup de grâce : saignement de 12 s (1 070 à 5 points + 4 % de la PA par point). Ignore l\'armure.' },
    morsure:         { nom: 'Morsure féroce', forme: 'felin', energie: 35, gcd: 1, desc: 'Coup de grâce direct (≈890 à 5 points) ; l\'énergie en trop ajoute des dégâts.' },
    celerite:        { nom: 'Célérité', forme: 'felin', gcd: 0, recharge: 300, desc: 'Vitesse +60 % pendant 15 s.' },
    puissanceChangeante: { nom: 'Puissance changeante', forme: 'felin', mana: 'puissance', talent: 'puissanceChangeante', gcd: 0, recharge: 8, desc: '55 % du mana de base → 40 énergie.' },
    chargeFeline:    { nom: 'Charge farouche (félin)', forme: 'felin', energie: 10, talent: 'chargeFarouche', gcd: 1, recharge: 30, desc: 'Bond dans le dos de la cible (8–25 m).' },
    lucioles:        { nom: 'Lucioles (farouche)', forme: 'animal', gcd: 1, recharge: 6, desc: 'Gratuit en forme, appris sans talent : armure de la cible −505 pendant 40 s.' },
    mutilation:      { nom: 'Mutilation', forme: 'ours', rage: 15, gcd: 0, desc: 'Prochain coup +128 dégâts.' },
    morsurePrimitive:{ nom: 'Morsure primitive', forme: 'ours', rage: 20, talent: 'morsurePrimitive', gcd: 1.5, recharge: 6, desc: '100 % des dégâts de l\'arme + 77.' },
    laceration:      { nom: 'Lacération', forme: 'ours', rage: 15, talent: 'laceration', gcd: 1.5, desc: 'Saignement cumulable 5 fois, 100 par cumul en 15 s.' },
    balayage:        { nom: 'Balayage', forme: 'ours', rage: 20, gcd: 1.5, desc: '83 dégâts.' },
    rugissement:     { nom: 'Rugissement démoralisant', forme: 'ours', rage: 10, gcd: 1.5, desc: 'Puissance d\'attaque des ennemis proches −204 pendant 30 s (−138 dans Classic).' },
    sonner:          { nom: 'Sonner', forme: 'ours', rage: 10, gcd: 1.5, recharge: 60, desc: 'Étourdit 4 s (+ Impact brutal) et interrompt. Recharge −15 s par rang d\'Impact brutal.' },
    enrager:         { nom: 'Enrager', forme: 'ours', gcd: 0, recharge: 60, desc: '10 rage tout de suite puis 20 en 10 s, armure −16 %.' },
    chargeFarouche:  { nom: 'Charge farouche', forme: 'ours', rage: 5, talent: 'chargeFarouche', gcd: 1.5, recharge: 15, desc: '8–25 m : immobilise 4 s et interrompt.' },
    regenFrenetique: { nom: 'Régénération frénétique', forme: 'ours', gcd: 0, recharge: 180, desc: 'Pendant 10 s, convertit jusqu\'à 10 rage par seconde en 25 PV chacun.' },
    ecorce:          { nom: 'Écorce', forme: 'toutes', mana: 0, gcd: 1, recharge: 60, desc: 'Gratuite et utilisable en forme dans Forever : dégâts subis −20 % pendant 15 s.' },
    emprise:         { nom: 'Emprise de la nature', forme: 'toutes', mana: 50, gcd: 1, recharge: 60, desc: 'Apprise au niveau 10, utilisable en forme : le prochain attaquant en mêlée a 35 % de chances d\'être enraciné.' },
    toucher:         { nom: 'Toucher guérisseur', forme: 'humanoide', mana: 840, incant: 3.5, gcd: 1.5, desc: '≈2 470 PV. 3,5 s (3,0 s avec Naturaliste 5/5). 840 mana (800 dans Classic).' },
    retablissement:  { nom: 'Rétablissement', forme: 'humanoide', mana: 525, incant: 2, gcd: 1.5, desc: '≈1 060 PV puis 1 064 en 21 s. 525 mana (880 dans Classic).' },
    recuperation:    { nom: 'Récupération', forme: 'humanoide', mana: 360, gcd: 1.5, desc: '776 PV en 12 s (888 dans Classic), instantané.' },
    sarments:        { nom: 'Sarments', forme: 'humanoide', mana: 160, incant: 1.5, gcd: 1.5, desc: 'Enracine 27 s. Cède après un certain montant de dégâts (600 dans le simulateur, non publié).' },
    innervation:     { nom: 'Innervation', forme: 'humanoide', mana: 0, gcd: 1.5, recharge: 360, desc: 'Régénération de mana ×5 pendant 20 s, même en incantant.' },
    rapiditeNature:  { nom: 'Rapidité de la nature', forme: 'humanoide', talent: 'rapiditeNature', gcd: 0, recharge: 180, desc: 'Prochain sort de Nature instantané.' },
    prompteGuerison: { nom: 'Prompte guérison', forme: 'humanoide', mana: 249, talent: 'prompteGuerison', gcd: 1.5, recharge: 15, desc: 'Consomme un soin sur la durée et rend tout ce qui restait.' }
  };

  // Niveau d'apprentissage des sorts (mode « niveau N », estimé d'après Classic 1.12).
  // Les techniques tirées d'un talent n'en ont pas : le talent suffit.
  const NIVEAUX_SORTS = {
    formeOurs: 10, mutilation: 10, rugissement: 10, emprise: 10, enrager: 12, sonner: 14, balayage: 16, lucioles: 18,
    formeFelin: 20, rodeur: 20, griffe: 20, dechirure: 20, lambeau: 22, griffure: 24, celerite: 26,
    ravager: 32, morsure: 32, traquer: 36, regenFrenetique: 36, innervation: 40, ecorce: 44,
    toucher: 1, recuperation: 4, sarments: 8, retablissement: 12
  };
  for (const [id, n] of Object.entries(NIVEAUX_SORTS)) SORTS[id].niveau = n;
  // Sous le niveau 40, Forme d'ours remplace Forme d'ours redoutable
  SORTS.formeOurs.nomBas = 'Forme d\'ours';

  // ---------------------------------------------------------------------------
  // Adversaires niveau 60. degats : moyenne par coup blanc avant armure.
  // ---------------------------------------------------------------------------
  const ADVERSAIRES = {
    guerrier: {
      nom: 'Guerrier', classe: 'guerrier', categorie: 'corps à corps', specialite: 'Armes, arme à deux mains',
      pv: 5800, armure: 6000, mana: 0, vitesseArme: 3.6, degats: 540, crit: 20, toucher: 4, esquive: 5, parade: 5,
      conseilForme: 'ours',
      resume: 'Charge, Interception, Frappe mortelle (soins −50 %), Brise-genou (−40 % dans Forever), Volée de coups, Cri d\'intimidation. Maîtrise tactique de base.'
    },
    paladin: {
      nom: 'Paladin', classe: 'paladin', categorie: 'corps à corps', specialite: 'Vindicte, Sceau d\'autorité, Repentir',
      pv: 5400, armure: 6800, mana: 5200, vitesseArme: 3.6, degats: 310, crit: 15, toucher: 2, esquive: 5, parade: 5,
      conseilForme: 'felin',
      resume: 'Classe reconstruite. Marteau de la justice, Jugement qui ne consomme plus le Sceau, Lumière sacrée, Éclair lumineux (affaibli), Bouclier divin, Imposition des mains (20 min), Bénédiction de liberté.'
    },
    mage: {
      nom: 'Mage', classe: 'mage', categorie: 'distance', specialite: 'Givre',
      pv: 3900, armure: 1300, mana: 7000, vitesseArme: 2, degats: 0, crit: 15, toucher: 3, esquive: 4, parade: 0,
      conseilForme: 'felin',
      resume: 'Éclair de givre, Javelot de glace (×4 sur cible gelée), Trait de feu, Nova de givre, Transfert (libère des étourdissements), Cône de froid (−40 %), Contresort, Métamorphose, Bloc de glace.'
    },
    chasseur: {
      nom: 'Chasseur', classe: 'chasseur', categorie: 'distance', specialite: 'Précision, familier loup',
      pv: 4700, armure: 3800, mana: 5000, vitesseArme: 3.0, degats: 320, crit: 20, toucher: 4, esquive: 6, parade: 3,
      conseilForme: 'felin',
      resume: 'Tir automatique, Visée (2 s d\'incantation dans Forever), Tir des arcanes, Flèches multiples (recharge 6 s), Trait de choc, Piège givrant (recharge 30 s partagée), Piqûre de vipère, Coupure d\'ailes, familier.'
    },
    voleur: {
      nom: 'Voleur', classe: 'voleur', categorie: 'corps à corps', specialite: 'Combat, deux armes, poison affaiblissant',
      pv: 4300, armure: 2600, mana: 0, vitesseArme: 1.4, degats: 190, crit: 25, toucher: 5, esquive: 8, parade: 5,
      conseilForme: 'ours',
      resume: 'Camouflage, Coup bas (4 s), Attaque pernicieuse, Entaille (nouvelle, rend de l\'énergie), Aiguillon perfide, Suriner, Cécité, Coup de pied, Évasion, Disparition, poison affaiblissant.'
    },
    demoniste: {
      nom: 'Démoniste', classe: 'demoniste', categorie: 'distance', specialite: 'Affliction, chasseur corrompu',
      pv: 5000, armure: 1800, mana: 6500, vitesseArme: 2, degats: 0, crit: 10, toucher: 3, esquive: 4, parade: 0,
      conseilForme: 'felin',
      resume: 'Corruption, Fléau d\'agonie (les fléaux sont séparés des malédictions), Peur, Voile mortel, Trait de l\'ombre, Pierre de soins (1 440), Verrou magique et Dévorer la magie du chasseur corrompu.'
    }
  };

  // Niveau d'apprentissage des techniques adverses (ids de l'IA du moteur), estimé d'après Classic 1.12
  const NIVEAUX_ADV = {
    guerrier: { frappeMortelle: 40, volee: 38, berserker: 32, interception: 30, cri: 22, fulgurance: 12 },
    paladin: { marteau: 8, jugement: 4, bouclier: 34, imposition: 10, repentir: 40, rempart: 40 },
    mage: { contresort: 24, transfert: 20, bloc: 30, barriere: 40, nova: 10, cone: 26, traitFeu: 6, pouvoirArcanes: 40, presence: 30 },
    chasseur: { courroux: 40, intimidation: 30, dispersion: 30, piege: 28, choc: 8, visee: 20, arcanes: 6, multi: 18, raptor: 1 },
    voleur: { preparation: 40, disparition: 22, poussee: 40, coupPied: 12, cecite: 34, evasion: 8, aiguillon: 30, fantomatique: 20, sangFroid: 30, suriner: 6, entaille: 1 },
    demoniste: { verrouMagique: 36, devorer: 30, voile: 42 }
  };
  // Talents de spécialisation adverses qui demandent 31 points (niveau 40) ; les autres sont accessibles dès 30
  const NIVEAUX_CAPA = {
    barriere: 40, repentir: 40, rempart: 40, courroux: 40, pouvoirArcanes: 40, preparation: 40, poussee: 40, premeditation: 40, lienSpirituel: 40
  };

  const CONSTANTES = {
    niveau: 60,
    pvBase: 1483,          // PV de base du druide niveau 60
    manaBase: 1244,        // mana de base du druide niveau 60
    coutForme: 0.55,       // part du mana de base (inchangé dans Forever)
    facteurRage: 230.6,    // constante de conversion dégâts → rage au niveau 60
    armureK: 5500,         // armure / (armure + 400 + 85 × 60)
    vitesseCourse: 7,      // mètres par seconde
    porteeMelee: 5,
    seuilSarments: 600     // dégâts avant que les racines cèdent (valeur supposée)
  };

  // ---------------------------------------------------------------------------
  // Ce qui change entre Classic et Forever, tel que le simulateur l'utilise.
  // fiab : 'sur' (les sources concordent), 'divergent' (elles se contredisent,
  // le simulateur prend la valeur indiquée) ou 'suppose' (non publié).
  // ---------------------------------------------------------------------------
  const CHANGEMENTS_FOREVER = [
    { sujet: 'Lambeau', avant: '225 % + 180', apres: '200 % + 80', fiab: 'divergent', note: 'Une source donne « 200 %, contre 155 % » ; l\'autre détaille le rang 5.' },
    { sujet: 'Griffe', avant: 'dégâts + 115', apres: '140 % + 27', fiab: 'sur' },
    { sujet: 'Ravager', avant: '350 %', apres: '435 % + 98', fiab: 'sur' },
    { sujet: 'Déchirure, Griffure, Morsure féroce, Traquer', avant: '—', apres: '≈ +13 à +25 % de dégâts de base', fiab: 'divergent', note: 'Valeurs du rang max reprises de foreverchanges.pro quand elles existent.' },
    { sujet: 'Coups en forme', avant: 'selon le niveau', apres: 'DPS de l\'arme équipée', fiab: 'sur', note: 'Enchantements et effets d\'arme fonctionnent en forme.' },
    { sujet: 'Transformation rapide', avant: '40 énergie avec Fureur 5/5', apres: 'garde l\'énergie, n\'en donne plus', fiab: 'sur', note: 'Remplacée par Puissance changeante (talent ultime, 40 énergie, recharge 8 s).' },
    { sujet: 'Fureur du tigre, Berserk', avant: 'présents', apres: 'retirés', fiab: 'sur' },
    { sujet: 'Écorce', avant: '15 % du mana, humanoïde', apres: 'gratuite, en forme', fiab: 'sur' },
    { sujet: 'Lucioles (farouche)', avant: 'talent', apres: 'de base, gratuites en forme, recharge 6 s', fiab: 'sur' },
    { sujet: 'Emprise de la nature, Augure de clarté', avant: 'talents', apres: 'appris en montant de niveau', fiab: 'sur' },
    { sujet: 'Cœur sauvage', avant: 'palier 6 farouche, 4 %/4 %/4 %', apres: 'palier 1 Restauration, 2 %/4 %/2 %', fiab: 'divergent', note: 'Le bonus d\'Endurance en ours à 5/5 vaut 20 % ou 10 % selon la source ; le simulateur prend 20 %.' },
    { sujet: 'Chef de la meute', avant: 'palier 7', apres: 'palier 5, prérequis de Morsure primitive', fiab: 'divergent' },
    { sujet: 'Griffes acérées', avant: '3 rangs, +2 %', apres: '2 rangs, +3 %', fiab: 'sur' },
    { sujet: 'Impact brutal', avant: '+0,5 s par rang', apres: '+0,5 s et Sonner −15 s par rang', fiab: 'divergent' },
    { sujet: 'Peau épaisse', avant: 'armure des objets +2 %/rang', apres: 'armure de base +180/rang en forme', fiab: 'divergent' },
    { sujet: 'Rugissement démoralisant', avant: '−138 PA', apres: '−204 PA', fiab: 'divergent' },
    { sujet: 'Enrager', avant: '20 rage en 10 s', apres: '10 tout de suite + 20 en 10 s', fiab: 'sur' },
    { sujet: 'Rétablissement, Toucher, Récupération', avant: '880 mana / 800 mana / 888 PV', apres: '525 mana / 840 mana / 776 PV', fiab: 'sur' },
    { sujet: 'Prompte guérison', avant: 'palier 7', apres: 'palier 4, rend tout le reste du soin', fiab: 'sur' },
    { sujet: 'Réflexion', avant: '5 %/rang', apres: '≈17 %/rang', fiab: 'suppose', note: 'Seul le rang 1 est publié.' },
    { sujet: 'Lacération', avant: 'sort de Burning Crusade', apres: 'talent, 5 cumuls', fiab: 'suppose', note: 'Dégâts du rang max non publiés : 100 par cumul.' },
    { sujet: 'Sarments', avant: 'ne cède pas aux dégâts', apres: 'cède après un seuil de dégâts', fiab: 'suppose', note: 'Seuil de 600 dégâts pris par le simulateur.' },
    { sujet: 'Paladin', avant: 'Lumière, Marteau 45 s', apres: 'Repentir au palier 5, Éclair lumineux −16 %, Bouclier divin 10 s', fiab: 'divergent', note: 'Durée et pénalité du Bouclier divin à vérifier en jeu.' },
    { sujet: 'Mage', avant: 'Transfert 15 s', apres: 'Transfert libère des étourdissements, Javelot de glace, Cône de froid −40 % 6 s, Contresort 30 s', fiab: 'sur' },
    { sujet: 'Chasseur', avant: 'Visée 3 s, pièges 15 s', apres: 'Visée 2 s, pièges 30 s partagés, Flèches multiples 6 s', fiab: 'sur' },
    { sujet: 'Voleur', avant: '—', apres: 'Entaille (rend de l\'énergie), Cécité modélisée', fiab: 'divergent', note: 'Énergie rendue par Entaille : 15 ou 25 selon la source.' },
    { sujet: 'Démoniste', avant: 'une malédiction', apres: 'Fléau d\'agonie + Malédiction de fatigue (−30 %), Pierre de soins 1 440', fiab: 'sur' },
    { sujet: 'Guerrier', avant: 'Brise-genou −50 %', apres: 'Brise-genou −40 %, rage subie calculée sans l\'armure', fiab: 'sur' },
    { sujet: 'Spécialisations adverses', avant: '—', apres: 'Classées d\'après les tier lists JcJ de novembre 2026', fiab: 'divergent', note: 'Les listes ne s\'accordent pas toujours (paladin Sacré, mage Arcanes) ; seules les données du niveau 30 donnent des taux de victoire réels.' },
    { sujet: 'Rempart du templier', avant: '—', apres: 'absorbe 100 % des PV 8 s, recharge 5 min', fiab: 'divergent', note: 'Talent de Protection (palier 5), cité pour le paladin Sacré par wowforeverinfo.' },
    { sujet: 'Lien spirituel', avant: 'talent à 31 points', apres: 'talent à 21 points, 30 % des dégâts au démon, +3 %', fiab: 'suppose', note: 'PV du chasseur corrompu (2 800) supposés.' },
    { sujet: 'Verrou magique', avant: 'recharge 24 s', apres: 'recharge 22 s', fiab: 'sur' },
    { sujet: 'Intimidation, Courroux bestial', avant: 'inchangés', apres: 'étourdit 3 s ; familier +50 % pendant 18 s', fiab: 'sur' },
    { sujet: 'Élusivité, Préparation', avant: 'Disparition −45 s', apres: 'Disparition et Cécité −90 s ; Préparation remet tout à zéro', fiab: 'sur' }
  ];

  const SOURCES = [
    { nom: 'Classic WoW Forever, changements du druide', url: 'https://classicwowforever.com/class-changes/druid/' },
    { nom: 'ForeverChanges, druide', url: 'https://foreverchanges.pro/class/druid' },
    { nom: 'ConquestCapped, talents du druide', url: 'https://conquestcapped.com/guides/wow-forever/wow-forever-druid-talents/' },
    { nom: 'Wowhead, arbres de talents du druide et du paladin', url: 'https://www.wowhead.com/forever/news/massive-talent-tree-changes-to-druids-and-paladins-class-tuning-for-wow-forever-383670' },
    { nom: 'Classic WoW Forever, autres classes', url: 'https://classicwowforever.com/class-changes/paladin/' },
    { nom: 'ForeverChanges, autres classes', url: 'https://foreverchanges.pro/class/paladin' },
    { nom: 'wowforeverinfo, tier list JcJ (duels et champs de bataille)', url: 'https://wowforeverinfo.com/tier-lists/pvp/' },
    { nom: 'metaroad, tier list JcJ', url: 'https://metaroad.gg/news/wow-forever-pvp-tier-list' },
    { nom: 'seemeta, tier list JcJ (1.60.1)', url: 'https://seemeta.com/en/wow-forever/pvp-tier-list' },
    { nom: 'wowforeverguides, duels du niveau 30 (bêta)', url: 'https://wowforeverguides.com/news/wow-forever-pvp-tournament' }
  ];

  /*
   * Spécialisations jouées en duel dans WoW Forever (tier lists de novembre 2026).
   * La première de chaque classe est celle choisie par défaut.
   * - mods : statistiques qui remplacent celles de la classe ;
   * - capacites : drapeaux lus par l'IA du moteur ;
   * - conseilForme : forme conseillée si elle diffère de celle de la classe.
   */
  const SPECS_ADVERSAIRES = {
    guerrier: [
      {
        id: 'armes', nom: 'Armes', specialite: 'Armes, arme à deux mains',
        meta: 'Seule spécialisation jouée en duel : B selon wowforeverinfo, metaroad et seemeta. Furie et Protection sont notées C à D.',
        mods: {}, capacites: ['rageBerserkerAmelioree', 'briseGenouAmeliore'],
        resume: 'Frappe mortelle (soins −50 %), Rage du berserker améliorée (10 rage tout de suite, retire ralentissements et racines, recharge 30 s), Brise-genou amélioré (15 % de chances d\'immobiliser 5 s).'
      }
    ],
    paladin: [
      {
        id: 'vindicte', nom: 'Vindicte', specialite: 'Vindicte, Sceau d\'autorité, Repentir',
        meta: 'Duel : C (wowforeverinfo), B (metaroad, seemeta). Meilleure spécialisation paladin dans les duels du niveau 30 (77 % de victoires).',
        mods: {}, capacites: ['repentir'],
        resume: 'Repentir (6 s, cède aux dégâts), Sceau d\'autorité, Jugement, soins d\'appoint.'
      },
      {
        id: 'sacre', nom: 'Sacré (31/20 Protection)', specialite: 'Sacré, soins, Rempart du templier',
        meta: 'JcJ : A sur les trois tier lists ; duel : B (wowforeverinfo) à C (seemeta).',
        mods: { pv: 5600, degats: 240, mana: 6400 }, capacites: ['rempart', 'marteauAmeliore', 'soinsSacres'],
        resume: 'Pas de Repentir. Soins +20 %, Rempart du templier (absorbe 100 % des PV pendant 8 s, recharge 5 min, bloque le Bouclier divin 1 min), Marteau de la justice amélioré (recharge −15 s).'
      }
    ],
    mage: [
      {
        id: 'givre', nom: 'Givre', specialite: 'Givre',
        meta: 'S partout (wowforeverinfo, metaroad, seemeta), en duel comme en champ de bataille.',
        mods: {}, capacites: ['barriere', 'doigtsGivre', 'fracasser'],
        resume: 'Barrière de glace (920, givre +15 %), Fracasser (+50 % de critique sur cible gelée), Doigts de givre, Javelot de glace.'
      },
      {
        id: 'arcane', nom: 'Arcanes', specialite: 'Arcanes, Présence spirituelle',
        meta: 'Duel : B (wowforeverinfo), A (metaroad, seemeta). Meilleure spécialisation mage dans les duels du niveau 30 (65 %).',
        mods: { mana: 7700 }, capacites: ['contresortAmeliore', 'presenceSpirituelle', 'pouvoirArcanes'],
        resume: 'Pas de Barrière de glace ni de Fracasser. Contresort amélioré (silence 4 s), Présence spirituelle (prochain sort instantané, recharge 3 min), Pouvoir des arcanes (dégâts +30 % pendant 15 s, recharge 3 min).'
      }
    ],
    chasseur: [
      {
        id: 'precision', nom: 'Précision', specialite: 'Précision, familier loup',
        meta: 'A en duel et en champ de bataille (wowforeverinfo, metaroad, seemeta).',
        mods: {}, capacites: ['visee', 'dispersion'],
        resume: 'Visée, Flèche de dispersion (désoriente 4 s), Tir des arcanes, Trait de choc.'
      },
      {
        id: 'betes', nom: 'Maîtrise des bêtes', specialite: 'Maîtrise des bêtes, familier',
        meta: 'A en duel et en champ de bataille (wowforeverinfo, metaroad, seemeta). À égalité en tête des chasseurs au niveau 30 (68 %).',
        mods: { degats: 300 }, capacites: ['visee', 'intimidation', 'courroux', 'familierFort'],
        resume: 'Pas de Flèche de dispersion. Intimidation (étourdit 3 s, recharge 60 s), Courroux bestial (familier +50 % de dégâts pendant 18 s, recharge 2 min), familier plus fort (+20 %).'
      }
    ],
    voleur: [
      {
        id: 'finesse', nom: 'Finesse', specialite: 'Finesse, Préparation, dagues',
        meta: 'Duel : S (wowforeverinfo, metaroad, seemeta). Meilleure spécialisation voleur au niveau 30 (67 %).',
        mods: {}, capacites: ['premeditation', 'preparation', 'elusivite', 'reouverture', 'fantomatique'],
        resume: 'Préméditation (+2 points de combo à l\'ouverture), Préparation (remet à zéro Disparition, Cécité, Évasion et Coup de pied, recharge 10 min), Élusivité (Disparition et Cécité −90 s), Frappe fantomatique (esquive +15 % pendant 7 s). Disparaît pour rouvrir par un Coup bas quand rien ne le fait saigner.'
      },
      {
        id: 'assassinat', nom: 'Assassinat', specialite: 'Assassinat, Sang-froid',
        meta: 'Duel : A (wowforeverinfo, metaroad, seemeta).',
        mods: { degats: 180 }, capacites: ['sangFroid', 'aiguillonAmeliore', 'scelleDestin'],
        resume: 'Sang-froid (Éviscération critique assurée, recharge 3 min), Aiguillon perfide amélioré (+10 % de dégâts sur cible étourdie), Scelle le destin (points de combo en plus sur critique). Tue pendant un étourdissement.'
      },
      {
        id: 'combat', nom: 'Combat', specialite: 'Combat, deux armes, poison affaiblissant',
        meta: 'Duel : A (wowforeverinfo), B (metaroad, seemeta).',
        mods: {}, capacites: ['poussee', 'coupPiedAmeliore'],
        resume: 'Poussée d\'adrénaline (énergie doublée 15 s), Coup de pied amélioré (silence 2 s), dégâts réguliers.'
      }
    ],
    demoniste: [
      {
        id: 'demonologie', nom: 'Démonologie', specialite: 'Démonologie, Lien spirituel, chasseur corrompu',
        meta: 'Duel : S (wowforeverinfo, metaroad, seemeta). 80 % de victoires dans les duels du niveau 30, meilleur score toutes classes.',
        mods: { pv: 5450 }, capacites: ['lienSpirituel'],
        resume: 'Lien spirituel (30 % des dégâts subis passent au démon, dégâts +3 %), Étreinte démoniaque (Endurance +15 %). Pas de Malédiction de fatigue.'
      },
      {
        id: 'affliction', nom: 'Affliction', specialite: 'Affliction, chasseur corrompu',
        meta: 'Duel : S (wowforeverinfo), A (metaroad, seemeta).',
        mods: {}, capacites: ['fatigue'],
        resume: 'Malédiction de fatigue (vitesse −30 % pendant 12 s), sorts sur la durée renforcés.'
      }
    ]
  };
  for (const k of Object.keys(SPECS_ADVERSAIRES)) ADVERSAIRES[k].specs = SPECS_ADVERSAIRES[k];

  const DONNEES = { ARBRES, PRESETS_TALENTS, PRESETS_EQUIPEMENT, SORTS, ADVERSAIRES, CONSTANTES, NIVEAUX_ADV, NIVEAUX_CAPA, CHANGEMENTS_FOREVER, SOURCES };
  racine.DONNEES = DONNEES;
  if (typeof module !== 'undefined' && module.exports) module.exports = DONNEES;
})(typeof window !== 'undefined' ? window : globalThis);
