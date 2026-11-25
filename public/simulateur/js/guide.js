/*
 * Guide par adversaire : forme conseillée, ouverture, rotation, sortie pour
 * se soigner et pièges à éviter. Texte de référence pour un druide farouche
 * niveau 60 en duel dans World of Warcraft: Forever. Les taux de victoire
 * affichés à côté viennent du simulateur et sont recalculés dans la page.
 */
(function (racine) {
  'use strict';

  const GUIDE = {
    guerrier: {
      forme: 'ours',
      pourquoi: 'Le guerrier frappe fort en blanc et applique Frappe mortelle (soins −50 %). L\'armure de l\'ours divise ses coups par deux et lui donne de la rage gratuite, alors que le félin fond sous les critiques. Dans Forever, sa rage ne baisse plus quand il frappe une cible très armurée : l\'ours ne l\'affame plus.',
      ouverture: [
        'Restez à plus de 25 m pour éviter sa Charge, entrez en ours avant le contact.',
        'Charge farouche (immobilise 4 s), avec Enrager juste avant pour les 10 rage immédiates.',
        'Rugissement démoralisant dès qu\'il est au contact (−204 PA dans Forever).'
      ],
      rotation: [
        'Morsure primitive dès qu\'elle est prête (recharge 6 s) si vous avez le talent.',
        'Mutilation à chaque coup avec le reste de la rage, Balayage seulement en excès.',
        'Lacération jusqu\'à 5 cumuls : le saignement ignore son armure de plaques.',
        'Sonner pour couper une Volée de coups ou pour ouvrir une fenêtre de soin (recharge 30 s avec Impact brutal 2/2).',
        'Écorce est gratuite en forme : posez-la quand il ouvre ses gros coups.'
      ],
      soin: [
        'Attendez la fin de Frappe mortelle avant un gros soin.',
        'Sarments puis reculer à 14 m. Dans Forever, les racines cèdent sous les dégâts : ne le frappez plus une fois enraciné.',
        'Sonner, quitter la forme, Toucher guérisseur (3 s avec Naturaliste) pendant les 4 à 5 s d\'étourdissement.',
        'Rapidité de la nature + Toucher guérisseur en urgence, puis Prompte guérison sur la Récupération.'
      ],
      pieges: [
        'Ne vous soignez jamais au contact sans contrôle : Volée de coups l\'interrompt et verrouille la Nature.',
        'Cri d\'intimidation : gardez un changement de forme pour après la peur, pas pendant.',
        'Brise-genou ralentit de 40 % : un changement de forme le brise.'
      ]
    },
    paladin: {
      forme: 'felin',
      pourquoi: 'Le paladin a beaucoup d\'armure et se soigne. Les saignements (Traquer, Griffure, Déchirure) ignorent l\'armure et le félin garde la pression. Le félin est la seule forme qui gagne, mais le duel reste serré (souvent moins d\'une victoire sur deux sans Rapidité de la nature). L\'ours ne perd presque jamais et ne le tue presque jamais : les duels finissent nuls au bout de 3 minutes.',
      ouverture: [
        'Rôder, approche par derrière, Traquer (étourdit 2 à 3 s, saignement). À énergie pleine, Posture retire 10 au coût.',
        'Griffure puis Griffe jusqu\'à 5 points de combo, Lambeau tant qu\'il est étourdi.',
        'Déchirure à 5 points : c\'est l\'essentiel de vos dégâts contre lui.'
      ],
      rotation: [
        'Gardez Griffure et Déchirure actives en permanence.',
        'Lucioles (gratuites en forme) dès qu\'elles tombent : −505 d\'armure.',
        'Puissance changeante sous 30 d\'énergie si vous l\'avez (40 énergie, recharge 8 s). La transformation rapide ne rend plus d\'énergie.',
        'Quand il incante Lumière sacrée (2,5 s) : passez en ours et Sonner. Avec Fureur 5/5, vous retrouvez votre énergie en revenant en félin.'
      ],
      soin: [
        'Pendant son Bouclier divin (10 s), ses dégâts sont divisés par deux : soignez-vous et reprenez de l\'énergie.',
        'Marteau de la justice dure 6 s (recharge 55 s) : soignez-vous juste après qu\'il l\'a utilisé.',
        'Vindicte : Repentir (6 s) cède aux dégâts mais il s\'en sert pour se soigner : gardez Sonner pour la Lumière sacrée qui suit.',
        'Sarments marchent mal : Bénédiction de liberté et Purification les annulent.'
      ],
      pieges: [
        'Imposition des mains le remet à pleine vie une fois par combat : comptez-la dans votre budget de mana.',
        'Puissance changeante coûte 684 mana : gardez de quoi faire un Toucher guérisseur.'
      ]
    },
    mage: {
      forme: 'felin',
      pourquoi: 'Le mage a peu de PV et d\'armure. En forme animale, vous êtes insensible à la Métamorphose et chaque changement de forme brise Nova de givre et les ralentissements. L\'ours est trop lent pour le rattraper.',
      ouverture: [
        'Rôder et approche par l\'arrière. Givre : sa Barrière de glace absorbe environ 920 dégâts et renforce son givre de 15 %.',
        'Traquer, puis Griffe ou Lambeau. Dans Forever, Transfert le libère de l\'étourdissement : attendez-vous à ce qu\'il s\'en serve tout de suite.',
        'Déchirure dès 4 à 5 points de combo, ou Morsure féroce s\'il est bas.'
      ],
      rotation: [
        'Après une Nova de givre : changez de forme tout de suite. Gelé, vous prenez un Javelot de glace à ×4.',
        'Après son Transfert : Charge farouche en félin (8 à 25 m, recharge 30 s) vous remet dans son dos, puis Célérité.',
        'Sonner (en ours) sur un Éclair de givre en cours si vous avez assez de mana.',
        'Bloc de glace : ne frappez pas, profitez-en pour vous soigner.'
      ],
      soin: [
        'Pendant son Bloc de glace (10 s) : Toucher guérisseur sans risque.',
        'Pas de soin à portée de Contresort (recharge 30 s) : il bloque l\'école Nature.',
        'Récupération (instantanée) avant de rentrer en forme si vous êtes déjà touché.'
      ],
      pieges: [
        'Ne restez pas en forme humanoïde au contact : Métamorphose.',
        'Le Cône de froid ralentit de 40 % pendant 6 s : un changement de forme le brise.',
        'Doigts de givre : après un Éclair de givre, son Javelot suivant frappe comme sur une cible gelée.'
      ]
    },
    chasseur: {
      forme: 'felin',
      pourquoi: 'Le chasseur veut vous garder à distance. Il faut coller vite et rester dans sa zone de mêlée. Le félin a Célérité et, dans Forever, un bond (Charge farouche) ; l\'ours se fait kiter et vider de son mana par la Piqûre de vipère.',
      ouverture: [
        'Rôder pour approcher sans être visé (Marque du chasseur mise à part).',
        'Traquer, puis Griffure et Griffe.',
        'Ignorez le familier et frappez le chasseur.'
      ],
      rotation: [
        'Déchirure à 5 points, Morsure féroce pour finir.',
        'Changement de forme pour briser Coupure d\'ailes et Trait de choc.',
        'Charge farouche en félin dès qu\'il recule à 8 m ou plus, Célérité ensuite.',
        'Méfiez-vous du Piège givrant au sol (recharge 30 s partagée entre les pièges).'
      ],
      soin: [
        'Dans la zone morte (5 à 8 m), il ne peut ni tirer ni frapper : soignez-vous là s\'il est enraciné.',
        'Précision : Flèche de dispersion, puis il recule : Récupération et repartez.',
        'La Piqûre de vipère draine votre mana : soignez tôt, avant d\'être à sec.'
      ],
      pieges: [
        'Courir en ligne droite vers lui à 30 m : Visée ne prend plus que 2 s d\'incantation dans Forever.',
        'Flèches multiples revient toutes les 6 s.',
        'Le Piège givrant gèle 10 s ; sous l\'effet, il se replace et reprend ses tirs.'
      ]
    },
    voleur: {
      forme: 'ours',
      pourquoi: 'Le voleur ouvre avec Coup bas et enchaîne les étourdissements. L\'ours encaisse la séquence grâce à son armure ; le félin gagne aussi s\'il ouvre le premier. Contre le poison affaiblissant, l\'ours n\'a pas besoin de courir.',
      ouverture: [
        'Restez en ours si vous le savez proche : son Coup bas fera beaucoup moins mal.',
        'En félin : Rôder vous rend aussi invisible. Celui qui repère l\'autre en premier ouvre.',
        'Rugissement démoralisant pour réduire ses dégâts, Lucioles pour le garder visible.'
      ],
      rotation: [
        'Morsure primitive et Mutilation en boucle, Balayage avec l\'excès de rage.',
        'Sonner après son Aiguillon perfide, pour qu\'il ait peu d\'énergie au moment de la reprise.',
        'Sous Évasion, vos coups ratent souvent : utilisez ces 15 s pour la Régénération frénétique. Réaction naturelle rend de la rage sur vos esquives.'
      ],
      soin: [
        'Rapidité de la nature + Toucher guérisseur : seul soin que ni Coup de pied ni Cécité ne coupent.',
        'Régénération frénétique en ours, sans quitter la forme.',
        'Évitez les soins incantés : Suriner (4 s), Cécité (10 s) et Coup de pied les coupent.'
      ],
      pieges: [
        'Ne cassez pas Suriner vous-même par un coup : attendez la fin ou changez de forme.',
        'Entaille lui rend de l\'énergie : il a plus de ressources que dans Classic, ne comptez pas l\'affamer.',
        'Disparition fait sortir du combat : repassez en Rôder pour ne pas vous faire rouvrir.'
      ]
    },
    demoniste: {
      forme: 'felin',
      pourquoi: 'Le démoniste vous use avec ses sorts sur la durée et vous immobilise par la Peur. Il faut le tuer vite : le félin fait le plus de dégâts en peu de temps. Le résultat dépend surtout de Rapidité de la nature : sans elle, vous perdez la plupart des duels, quelle que soit la forme.',
      ouverture: [
        'Rôder, Traquer, puis Griffure et Griffe.',
        'Déchirure à 5 points de combo.',
        'Restez collé : à distance, il pose Corruption, Fléau d\'agonie et, en Affliction, Malédiction de fatigue (−30 %) sans risque.'
      ],
      rotation: [
        'Sonner (en ours) une Peur ou un Trait de l\'ombre en cours.',
        'Après une Peur, changez de forme pour briser Fatigue (Affliction) ; avec Fureur 5/5 vous gardez votre énergie.',
        'Gardez des dégâts pour après sa Pierre de soins (1 440 PV, sous 35 % de PV).'
      ],
      soin: [
        'Son chasseur corrompu dissipe vos soins sur la durée et coupe vos incantations (Verrou magique) : préférez Rapidité de la nature + Toucher.',
        'Prompte guérison juste après une Récupération : instantanée, le chasseur n\'a rien à dissiper.',
        'Ne vous soignez pas pendant que ses sorts sur la durée tournent : vous perdez la course au mana.'
      ],
      pieges: [
        'Changer de forme ne brise pas la Peur.',
        'Voile mortel (horreur 3 s) arrive quand vous êtes bas : gardez de la marge.',
        'Écorce est dissipée par Dévorer la magie : ne comptez pas dessus.'
      ]
    }
  };

  // Ce qui change entre les deux formes, en résumé.
  const COMPARAISON_FORMES = [
    { critere: 'PV', ours: '+1 240 PV, Endurance +20 % avec Cœur sauvage 5/5', felin: 'PV de base' },
    { critere: 'Armure', ours: 'Armure des objets ×4,6 (+ Peau épaisse)', felin: 'Armure des objets (+ Peau épaisse)' },
    { critere: 'Ressource', ours: 'Rage (en frappant, en étant frappé, Enrager +10 tout de suite)', felin: 'Énergie (20 toutes les 2 s), gardée entre deux formes avec Fureur' },
    { critere: 'Dégâts', ours: 'Faibles et réguliers, Morsure primitive et Lacération en talents', felin: 'Élevés, saignements qui ignorent l\'armure' },
    { critere: 'Mobilité', ours: 'Charge farouche (immobilise 4 s)', felin: 'Rôder, Célérité, Charge farouche (bond dans le dos)' },
    { critere: 'Contrôle', ours: 'Sonner (4 s, interrompt)', felin: 'Traquer (2 s, depuis Rôder)' },
    { critere: 'Défense', ours: 'Régénération frénétique, Écorce', felin: 'Écorce (gratuite en forme)' }
  ];

  // Conseils propres à chaque spécialisation adverse (voir DONNEES.ADVERSAIRES[classe].specs)
  const CONSEILS_SPECS = {
    guerrier: {
      armes: [
        'Rage du berserker améliorée le libère de Sarments et d\'Emprise de la nature toutes les 30 s : ne comptez pas sur les racines pour soigner, surtout s\'il vient de l\'utiliser contre un ralentissement.',
        'Brise-genou amélioré peut vous immobiliser 5 s : en félin, un changement de forme vous en libère ; en ours, restez sur place et tapez.'
      ]
    },
    paladin: {
      vindicte: [
        'Repentir (6 s) cède aux dégâts : il s\'en sert pour lancer une Lumière sacrée. Gardez Sonner pour elle.',
        'C\'est la spécialisation paladin la plus dangereuse en duel : jouez félin, l\'ours finit en nul.'
      ],
      sacre: [
        'Pas de Repentir et des dégâts faibles, mais des soins 20 % plus forts et deux protections : le Rempart du templier (absorbe 100 % de ses PV pendant 8 s), puis le Bouclier divin une minute plus tard.',
        'Pendant le Rempart, ne gaspillez ni Sonner ni Rapidité de la nature : gardez une Déchirure sur lui et usez sa mana. Le Marteau revient toutes les 40 s.',
        'En félin, la simulation gagne environ un duel sur deux ; l\'ours ne le tue pas en 3 minutes.'
      ]
    },
    mage: {
      givre: [
        'La Barrière de glace absorbe environ 920 dégâts et renforce son givre : cassez-la avant de dépenser vos points de combo.',
        'Fracasser : sous Nova de givre, ses Éclairs critiquent une fois sur deux. Sortez des racines en changeant de forme avant de vous soigner.'
      ],
      arcane: [
        'Pas de Barrière de glace : il tombe plus vite qu\'un mage Givre.',
        'Contresort amélioré vous réduit au silence 4 s : pas de soin ni de changement de forme payant pendant ce temps. Ne lancez pas un soin à 30 m de lui quand Contresort est prêt (recharge 30 s).',
        'Présence spirituelle lui donne un Éclair de givre instantané quand vous êtes bloqué ou bas en vie ; Pouvoir des arcanes augmente ses dégâts de 30 % pendant 15 s : gardez Écorce pour ce moment.'
      ]
    },
    chasseur: {
      precision: [
        'Flèche de dispersion (4 s) au contact, puis il recule pour Visée : gardez Célérité pour revenir.'
      ],
      betes: [
        'Pas de Flèche de dispersion, mais Intimidation (le familier étourdit 3 s, recharge 60 s) coupe un soin même de loin : soignez juste après l\'avoir vue partir.',
        'Courroux bestial : le familier frappe 50 % plus fort pendant 18 s. Écorce ou ours à ce moment-là, puis revenez sur le chasseur.'
      ]
    },
    voleur: {
      finesse: [
        'Coup bas et Préméditation : il ouvre à 4 points de combo et peut placer une Éviscération pendant l\'étourdissement. Gardez Rôder pour qu\'il ne vous trouve pas en premier.',
        'Il disparaît pour rouvrir : un saignement (Griffure, Déchirure) le fait sortir du camouflage, gardez-en un sur lui.',
        'Préparation lui rend Disparition et Cécité : comptez deux Cécités par duel. Frappe fantomatique augmente son esquive de 15 % pendant 7 s.'
      ],
      assassinat: [
        'Sang-froid : une Éviscération critique assurée, souvent pendant Aiguillon perfide (+10 % sur cible étourdie). Gardez Écorce pour son premier étourdissement à 4 ou 5 points.'
      ],
      combat: [
        'Poussée d\'adrénaline : 15 s d\'énergie doublée. Passez en ours et laissez-la passer.',
        'Coup de pied amélioré vous réduit au silence 2 s : pas de changement de forme payant juste après.'
      ]
    },
    demoniste: {
      demonologie: [
        'Le plus dur des duels : 30 % de vos dégâts partent au chasseur corrompu (2 800 PV, valeur supposée) tant qu\'il vit, et ses dégâts sont augmentés de 3 %.',
        'Prenez Rapidité de la nature (préréglage « Farouche + Rapidité ») : sans elle la simulation ne gagne presque jamais, avec elle environ un duel sur deux.',
        'Il n\'a pas de Malédiction de fatigue : collez-le et forcez-le à fuir plutôt qu\'à incanter.'
      ],
      affliction: [
        'Malédiction de fatigue (−30 % de vitesse pendant 12 s) : un changement de forme la retire.',
        'Avec Rapidité de la nature, la simulation gagne environ trois duels sur quatre ; sans elle, moins d\'un sur quatre.'
      ]
    }
  };

  racine.GUIDE = { GUIDE, COMPARAISON_FORMES, CONSEILS_SPECS };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.GUIDE;
})(typeof window !== 'undefined' ? window : globalThis);
