/*
 * Icônes des sorts, des classes et des formes (© Blizzard Entertainment), en 36 × 36
 * depuis wow.zamimg.com (le CDN de Wowhead), copiées dans icones/.
 * `node outils/icones.js` télécharge celles qui manquent après un ajout ici.
 */
(function (racine) {
  'use strict';

  // Nom affiché par le moteur → nom de fichier Wowhead
  const SORTS = {
    // Druide : formes
    'Forme d\'ours redoutable': 'ability_racial_bearform',
    'Forme d\'ours': 'ability_racial_bearform',
    'Forme de félin': 'ability_druid_catform',
    'Quitter la forme': 'inv_misc_head_elf_02',
    'Rôder': 'ability_ambush',
    // Druide : ours
    'Mutilation': 'ability_druid_mangle2',
    'Morsure primitive': 'ability_druid_maul',
    'Lacération': 'ability_druid_lacerate',
    'Balayage': 'inv_misc_monsterclaw_03',
    'Sonner': 'ability_druid_bash',
    'Enrager': 'ability_druid_enrage',
    'Régénération frénétique': 'ability_bullrush',
    'Rugissement démoralisant': 'ability_druid_demoralizingroar',
    'Charge farouche': 'ability_hunter_pet_bear',
    // Druide : félin
    'Traquer': 'ability_druid_supriseattack',
    'Ravager': 'ability_druid_ravage',
    'Griffure': 'ability_druid_disembowel',
    'Griffe': 'ability_druid_rake',
    'Lambeau': 'spell_shadow_vampiricaura',
    'Déchirure': 'ability_ghoulfrenzy',
    'Morsure féroce': 'ability_druid_ferociousbite',
    'Puissance changeante': 'ability_mount_jungletiger',
    'Célérité': 'ability_druid_dash',
    'Charge farouche (félin)': 'spell_druid_feralchargecat',
    // Druide : sorts
    'Lucioles (farouche)': 'spell_nature_faeriefire',
    'Écorce': 'spell_nature_stoneclawtotem',
    'Emprise de la nature': 'spell_nature_natureswrath',
    'Sarments': 'spell_nature_stranglevines',
    'Innervation': 'spell_nature_lightning',
    'Toucher guérisseur': 'spell_nature_healingtouch',
    'Récupération': 'spell_nature_rejuvenation',
    'Rétablissement': 'spell_nature_resistnature',
    'Prompte guérison': 'inv_relics_idolofrejuvenation',
    'Rapidité de la nature': 'spell_nature_ravenform',
    // Guerrier
    'Charge': 'ability_warrior_charge',
    'Frappe mortelle': 'ability_warrior_savageblow',
    'Brise-genou': 'ability_shockwave',
    'Fulgurance': 'ability_meleedamage',
    'Rage du berserker': 'spell_nature_ancestralguardian',
    'Volée de coups': 'inv_gauntlets_04',
    'Cri d\'intimidation': 'ability_golemthunderclap',
    'Frappe héroïque': 'ability_rogue_ambush',
    // Paladin
    'Jugement d\'autorité': 'spell_holy_righteousfury',
    'Sceau d\'autorité': 'ability_warrior_innerrage',
    'Bénédiction de liberté': 'spell_holy_sealofvalor',
    'Marteau de la justice': 'spell_holy_sealofmight',
    'Repentir': 'spell_holy_prayerofhealing',
    'Lumière sacrée': 'spell_holy_holybolt',
    'Éclair lumineux': 'spell_holy_flashheal',
    'Bouclier divin': 'spell_holy_divineintervention',
    'Imposition des mains': 'spell_holy_layonhands',
    'Rempart du templier': 'spell_holy_ardentdefender',
    // Mage
    'Éclair de givre': 'spell_frost_frostbolt02',
    'Nova de givre': 'spell_frost_frostnova',
    'Javelot de glace': 'spell_frost_frostblast',
    'Transfert': 'spell_arcane_blink',
    'Cône de froid': 'spell_frost_glacier',
    'Trait de feu': 'spell_fire_fireball',
    'Barrière de glace': 'spell_ice_lament',
    'Bloc de glace': 'spell_frost_frost',
    'Pouvoir des arcanes': 'spell_nature_lightning',
    'Présence spirituelle': 'spell_nature_enchantarmor',
    'Contresort': 'spell_frost_iceshock',
    // Chasseur
    'Piqûre de vipère': 'ability_hunter_aimedshot',
    'Flèche de dispersion': 'ability_golemstormbolt',
    'Piège givrant': 'spell_frost_chainsofice',
    'Coupure d\'ailes': 'ability_rogue_trip',
    'Attaque du raptor': 'ability_meleedamage',
    'Trait de choc': 'spell_frost_stun',
    'Tir des arcanes': 'ability_impalingbolt',
    'Visée': 'inv_spear_07',
    'Piqûre de serpent': 'ability_hunter_quickshot',
    'Courroux bestial': 'ability_druid_ferociousbite',
    'Intimidation': 'ability_devour',
    'Tir automatique': 'ability_whirlwind',
    'Flèches multiples': 'ability_upgrademoonglaive',
    'Loup': 'ability_hunter_pet_wolf',
    // Voleur
    'Coup bas': 'ability_cheapshot',
    'Frappe fantomatique': 'spell_shadow_curse',
    'Entaille': 'inv_throwingknife_04',
    'Éviscération': 'ability_rogue_eviscerate',
    'Hémorragie': 'spell_shadow_lifedrain',
    'Disparition': 'ability_vanish',
    'Évasion': 'spell_shadow_shadowward',
    'Suriner': 'ability_gouge',
    'Aiguillon perfide': 'ability_rogue_kidneyshot',
    'Coup de pied': 'ability_kick',
    'Cécité': 'spell_shadow_mindsteal',
    'Préparation': 'spell_shadow_antishadow',
    'Attaque pernicieuse': 'spell_shadow_ritualofsacrifice',
    'Sang-froid': 'spell_ice_lament',
    'Poussée d\'adrénaline': 'spell_shadow_shadowworddominate',
    // Démoniste
    'Corruption': 'spell_shadow_abominationexplosion',
    'Fléau d\'agonie': 'spell_shadow_curseofsargeras',
    'Malédiction de fatigue': 'spell_shadow_grimward',
    'Voile mortel': 'spell_shadow_deathcoil',
    'Peur': 'spell_shadow_possession',
    'Trait de l\'ombre': 'spell_shadow_shadowbolt',
    'Pierre de soins': 'inv_stone_04',
    'Verrou magique': 'spell_shadow_mindrot',
    'Dévorer la magie': 'spell_nature_purge',
    'Chasseur corrompu': 'spell_shadow_summonfelhunter'
  };
  const CLASSES = {
    druide: 'classicon_druid', guerrier: 'classicon_warrior', paladin: 'classicon_paladin', mage: 'classicon_mage',
    chasseur: 'classicon_hunter', voleur: 'classicon_rogue', demoniste: 'classicon_warlock'
  };
  const FORMES = { ours: 'ability_racial_bearform', felin: 'ability_druid_catform', humanoide: 'inv_misc_head_elf_02' };
  const FAMILIERS = { chasseur: 'ability_hunter_pet_wolf', demoniste: 'spell_shadow_summonfelhunter' };

  const chemin = f => f ? 'icones/' + f + '.jpg' : null;
  // « Lacération (3) » ou « Traquer (saignement) » reprennent l'icône du sort de base
  const fichier = nom => !nom ? null : SORTS[nom] || SORTS[nom.replace(/\s*\([^)]*\)$/, '')] || null;

  const ICONES = {
    SORTS, CLASSES, FORMES, FAMILIERS, fichier,
    sort: nom => chemin(fichier(nom)),
    classe: id => chemin(CLASSES[id]),
    forme: f => chemin(FORMES[f]),
    familier: id => chemin(FAMILIERS[id]),
    tous: () => [...new Set([SORTS, CLASSES, FORMES, FAMILIERS].flatMap(Object.values))]
  };
  racine.ICONES = ICONES;
  if (typeof module !== 'undefined' && module.exports) module.exports = ICONES;
})(typeof window !== 'undefined' ? window : globalThis);
