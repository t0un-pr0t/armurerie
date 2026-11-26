/*
 * Équipement : ce que vaut chaque objet porté, et le personnage rééquipé selon trois paliers.
 *   - porté        : la fiche Blizzard telle quelle ;
 *   - hors donjon  : le meilleur obtenable sans donjon (bleus de quête, d'artisanat, de l'hôtel des ventes) ;
 *   - donjon       : la suite épique des donjons de son niveau.
 * La fiche ne donne pas le niveau d'objet : on l'estime par le « budget » de stats de l'objet
 * (règle de conception de WoW classique : somme des stats pondérées en norme 1,5, selon la qualité
 * et l'emplacement). Le personnage rééquipé garde sa fiche (race, talents, enchantements) et reçoit
 * seulement la différence de stats entre l'équipement porté et celui du palier.
 * Fonctionne dans Node (tests) et dans le navigateur (window.Equipement).
 */
(function (racine) {
  'use strict';

  // Coût d'un point de chaque stat, en points de caractéristique
  const POIDS = {
    STRENGTH: 1, AGILITY: 1, STAMINA: 1, INTELLECT: 1, SPIRIT: 1,
    ATTACK_POWER: 0.5, RANGED_ATTACK_POWER: 0.4,
    SPELL_POWER: 0.86, SPELL_DAMAGE_DONE: 0.86, SPELL_HEALING_DONE: 0.45,
    HIT_RATING: 1, CRIT_RATING: 1, SPELL_HIT_RATING: 1, SPELL_CRIT_RATING: 1,
    DODGE_RATING: 1, PARRY_RATING: 1, BLOCK_RATING: 1, DEFENSE_SKILL_RATING: 1,
    BLOCK_VALUE: 0.15, EXTRA_ARMOR: 0.07, HEALTH_REGEN: 1, MANA_REGENERATION: 2.5, SPELL_PENETRATION: 0.8,
    FIRE_RESISTANCE: 1, FROST_RESISTANCE: 1, SHADOW_RESISTANCE: 1, NATURE_RESISTANCE: 1, ARCANE_RESISTANCE: 1,
  };
  // Part du budget d'un objet selon son emplacement (1 = tête, torse, jambes, arme à deux mains)
  const EMPLACEMENTS = {
    HEAD: 1, CHEST: 1, ROBE: 1, LEGS: 1, TWOHWEAPON: 1,
    SHOULDER: 0.77, HAND: 0.77, WAIST: 0.77, FEET: 0.77, TRINKET: 0.7,
    WRIST: 0.56, NECK: 0.56, CLOAK: 0.56, FINGER: 0.56, HOLDABLE: 0.56, SHIELD: 0.56,
    WEAPON: 0.42, WEAPONMAINHAND: 0.42, WEAPONOFFHAND: 0.42,
    RANGED: 0.32, RANGEDRIGHT: 0.32, THROWN: 0.32, RELIC: 0.3,
  };
  // Valeur d'un emplacement complet selon la qualité et le niveau d'objet, et l'inverse
  const QUALITES = {
    POOR: { v: (i) => (i - 8) / 3, i: (v) => 3 * v + 8, armure: 0.8 },
    COMMON: { v: (i) => (i - 6) / 2.5, i: (v) => 2.5 * v + 6, armure: 0.9 },
    UNCOMMON: { v: (i) => (i - 4) / 2, i: (v) => 2 * v + 4, armure: 1 },
    RARE: { v: (i) => (i - 1.84) / 1.6, i: (v) => 1.6 * v + 1.84, armure: 1.1 },
    EPIC: { v: (i) => (i - 1.3) / 1.3, i: (v) => 1.3 * v + 1.3, armure: 1.25 },
    LEGENDARY: { v: (i) => (i - 1.3) / 1.2, i: (v) => 1.2 * v + 1.3, armure: 1.35 },
  };
  const qualite = (q) => QUALITES[q] || QUALITES.COMMON;
  const NOMS_QUALITE = { POOR: 'médiocre', COMMON: 'commun', UNCOMMON: 'inhabituel', RARE: 'rare', EPIC: 'épique', LEGENDARY: 'légendaire' };

  // Paliers d'équipement : qualité et niveau d'objet en fonction du niveau du personnage
  const PALIERS = [
    { id: 'porte', nom: 'Porté', court: 'porté' },
    {
      id: 'horsDonjon', nom: 'Meilleur hors donjon', court: 'hors donjon', qualite: 'RARE', ilvl: (n) => n,
      texte: 'objets rares (bleus) de niveau d\'objet égal à votre niveau : récompenses de quête, artisanat, hôtel des ventes',
    },
    {
      id: 'donjon', nom: 'Meilleur en donjon', court: 'donjon épique', qualite: 'EPIC', ilvl: (n) => n + 5,
      texte: 'suite épique (violette) de niveau d\'objet égal à votre niveau + 5 : les meilleurs butins des donjons de votre niveau',
    },
  ];

  // Emplacements d'un équipement complet (en plus des armes, reprises de l'équipement porté)
  const ARMURE = [
    ['head', 'HEAD', 'Tête'], ['neck', 'NECK', 'Cou'], ['shoulder', 'SHOULDER', 'Épaules'], ['back', 'CLOAK', 'Dos'],
    ['chest', 'CHEST', 'Torse'], ['wrist', 'WRIST', 'Poignets'], ['hand', 'HAND', 'Mains'], ['waist', 'WAIST', 'Taille'],
    ['leg', 'LEGS', 'Jambes'], ['foot', 'FEET', 'Pieds'], ['leftFinger', 'FINGER', 'Doigt'], ['rightFinger', 'FINGER', 'Doigt'],
  ];
  // Bijoux et reliques (idoles, librams, totems) restent ceux du personnage : leurs effets ne sont pas simulés
  const GARDES = ['TRINKET', 'RELIC'];
  const ARMES = ['TWOHWEAPON', 'WEAPON', 'WEAPONMAINHAND', 'WEAPONOFFHAND', 'SHIELD', 'HOLDABLE', 'RANGED', 'RANGEDRIGHT', 'THROWN', 'RELIC'];
  // Armes par défaut quand le personnage n'en porte pas
  const ARMES_DEFAUT = {
    guerrier: [['weapon', 'TWOHWEAPON', 'Arme'], ['ranged', 'THROWN', 'Distance']],
    paladin: [['weapon', 'TWOHWEAPON', 'Arme']],
    chaman: [['weapon', 'TWOHWEAPON', 'Arme']],
    druide: [['weapon', 'TWOHWEAPON', 'Arme']],
    chasseur: [['weapon', 'TWOHWEAPON', 'Arme'], ['ranged', 'RANGED', 'Distance']],
    voleur: [['weapon', 'WEAPON', 'Arme'], ['offHand', 'WEAPONOFFHAND', 'Main gauche'], ['ranged', 'THROWN', 'Distance']],
    pretre: [['weapon', 'TWOHWEAPON', 'Arme'], ['ranged', 'RANGEDRIGHT', 'Baguette']],
    mage: [['weapon', 'TWOHWEAPON', 'Arme'], ['ranged', 'RANGEDRIGHT', 'Baguette']],
    demoniste: [['weapon', 'TWOHWEAPON', 'Arme'], ['ranged', 'RANGEDRIGHT', 'Baguette']],
  };

  // Répartition du budget des objets d'un palier (en points de caractéristique), par classe et spécialisation
  const REPARTITION = {
    guerrier: { defaut: { force: 0.45, endurance: 0.3, agilite: 0.2, pa: 0.05 }, protection: { endurance: 0.45, force: 0.3, agilite: 0.25 } },
    paladin: {
      defaut: { force: 0.45, endurance: 0.3, agilite: 0.1, intelligence: 0.15 },
      sacre: { intelligence: 0.4, endurance: 0.2, esprit: 0.1, ps: 0.3 },
      protection: { endurance: 0.45, force: 0.25, intelligence: 0.15, agilite: 0.15 },
    },
    chasseur: { defaut: { agilite: 0.5, endurance: 0.25, intelligence: 0.15, pa: 0.1 } },
    voleur: { defaut: { agilite: 0.5, endurance: 0.25, force: 0.15, pa: 0.1 } },
    pretre: { defaut: { intelligence: 0.35, endurance: 0.2, esprit: 0.2, ps: 0.25 }, ombre: { intelligence: 0.3, endurance: 0.3, esprit: 0.1, ps: 0.3 } },
    chaman: {
      defaut: { force: 0.35, agilite: 0.2, endurance: 0.25, intelligence: 0.2 },
      elementaire: { intelligence: 0.35, endurance: 0.25, esprit: 0.05, ps: 0.35 },
      restauration: { intelligence: 0.4, endurance: 0.2, esprit: 0.1, ps: 0.3 },
    },
    mage: { defaut: { intelligence: 0.35, endurance: 0.25, esprit: 0.05, ps: 0.35 } },
    demoniste: { defaut: { endurance: 0.35, intelligence: 0.3, ps: 0.35 } },
    druide: {
      defaut: { force: 0.3, agilite: 0.3, endurance: 0.3, intelligence: 0.1 },
      equilibre: { intelligence: 0.35, endurance: 0.25, esprit: 0.1, ps: 0.3 },
      restauration: { intelligence: 0.35, esprit: 0.2, endurance: 0.2, ps: 0.25 },
    },
  };
  const COUT = { force: 1, agilite: 1, endurance: 1, intelligence: 1, esprit: 1, pa: 0.5, ps: 0.86 };
  const STAT_VERS = {
    STRENGTH: 'force', AGILITY: 'agilite', STAMINA: 'endurance', INTELLECT: 'intelligence', SPIRIT: 'esprit',
    ATTACK_POWER: 'pa', SPELL_POWER: 'ps', SPELL_DAMAGE_DONE: 'ps',
  };
  // Puissance d'attaque par point de Force et d'Agilité ; Agilité pour 1 % de critique au niveau 60
  const PA_PAR = {
    guerrier: [2, 0], paladin: [2, 0], chaman: [2, 0], druide: [2, 0], voleur: [1, 1], chasseur: [1, 1],
    pretre: [1, 0], mage: [1, 0], demoniste: [1, 0],
  };
  const AGI_CRIT_60 = { voleur: 29, chasseur: 53 };
  const agiParCrit = (classe, n) => (AGI_CRIT_60[classe] || 20) * (n + 10) / 70;

  // Valeur d'un ensemble de stats en points de caractéristique (norme 1,5)
  function budget(stats) {
    let s = 0;
    for (const [k, v] of Object.entries(stats || {})) if (POIDS[k] && v > 0) s += Math.pow(v * POIDS[k], 1.5);
    return Math.pow(s, 2 / 3);
  }
  // Niveau d'objet estimé d'un objet porté
  function niveauObjet(o, niveauPerso) {
    const mod = EMPLACEMENTS[o.type] || 0;
    const b = budget(o.stats);
    // Arme : le DPS dit mieux son niveau que ses stats
    const parDps = o.arme && FACTEUR_ARME[o.type]
      ? (o.arme.dps / ((QUALITE_ARME[o.qualite] || 0.8) * FACTEUR_ARME[o.type]) - 1.5) / 0.72 : 0;
    if (mod && (b > 0 || parDps > 0)) return Math.max(1, Math.round(Math.max(b > 0 ? qualite(o.qualite).i(b / mod) : 0, parDps)));
    if (o.niveauRequis) return o.niveauRequis + 5;
    return Math.max(1, (niveauPerso || 1) - 5);
  }
  // DPS d'arme d'un palier (approximation de WoW classique selon le niveau d'objet)
  const FACTEUR_ARME = { TWOHWEAPON: 1, WEAPON: 0.88, WEAPONMAINHAND: 0.88, WEAPONOFFHAND: 0.88, RANGED: 0.75, RANGEDRIGHT: 0.75, THROWN: 0.6 };
  const QUALITE_ARME = { UNCOMMON: 0.88, RARE: 1, EPIC: 1.12 };
  const dpsArme = (ilvl, q, type) => (0.72 * ilvl + 1.5) * (QUALITE_ARME[q] || 1) * (FACTEUR_ARME[type] || 0.8);
  const facteurArmure = (ilvl, q) => (ilvl + 20) * qualite(q).armure;

  const palierDe = (id) => PALIERS.find((x) => x.id === id);
  const repartition = (p) => { const r = REPARTITION[p.classe] || REPARTITION.guerrier; return r[p.spec] || r.defaut; };

  // Emplacements à remplir pour le personnage : armure complète + ses armes (ou celles de sa classe)
  function emplacements(p) {
    const objets = (p.equipement || []).filter((o) => EMPLACEMENTS[o.type] && !GARDES.includes(o.type));
    const armes = objets.filter((o) => ARMES.includes(o.type)).map((o) => [o.emplacement, o.type, o.emplacementNom]);
    const pris = new Set(armes.map((a) => a[0]));
    for (const d of ARMES_DEFAUT[p.classe] || ARMES_DEFAUT.guerrier) {
      if (pris.has(d[0])) continue;
      // Pas de main gauche à côté d'une arme à deux mains
      if (d[0] === 'offHand' && armes.some((a) => a[1] === 'TWOHWEAPON')) continue;
      if (d[0] === 'weapon' && armes.some((a) => a[0] === 'weapon')) continue;
      armes.push(d);
    }
    return [...ARMURE, ...armes];
  }

  // Objet par objet : valeur estimée face aux paliers
  function analyser(p) {
    if (!Array.isArray(p.equipement)) return null;
    const n = p.niveau || 1;
    const parEmp = new Map((p.equipement || []).map((o) => [o.emplacement, o]));
    const valeurPalier = (pal) => Math.max(0.1, qualite(pal.qualite).v(pal.ilvl(n)));
    const vh = valeurPalier(palierDe('horsDonjon')), vd = valeurPalier(palierDe('donjon'));
    const lignes = emplacements(p).map(([emp, type, nomEmp]) => {
      const o = parEmp.get(emp);
      const mod = EMPLACEMENTS[(o && EMPLACEMENTS[o.type] ? o.type : type)];
      // Arme : on retient le meilleur de ses stats et de son DPS (ramené au niveau d'objet)
      let valeur = o ? budget(o.stats) / mod : 0;
      if (o && o.arme && FACTEUR_ARME[o.type]) valeur = Math.max(valeur, qualite(o.qualite).v(niveauObjet(o, n)));
      const typeArme = FACTEUR_ARME[(o && o.type) || type] && !(o && o.sousType === 'Baguette') ? (o ? o.type : type) : null;
      return {
        emplacement: emp, emplacementNom: (o && o.emplacementNom) || nomEmp, type: o ? o.type : type, objet: o || null,
        dps: typeArme ? (o && o.arme ? o.arme.dps : 0) : null,
        dpsHorsDonjon: typeArme ? dpsArme(palierDe('horsDonjon').ilvl(n), 'RARE', typeArme) : null,
        dpsDonjon: typeArme ? dpsArme(palierDe('donjon').ilvl(n), 'EPIC', typeArme) : null,
        ilvl: o ? niveauObjet(o, n) : null, valeur,
        horsDonjon: valeur / vh, donjon: valeur / vd,
        manque: Math.max(0, vh - valeur) * mod, manqueDonjon: Math.max(0, vd - valeur) * mod,
      };
    });
    const somme = (f) => lignes.reduce((s, l) => s + f(l), 0);
    const mods = lignes.map((l) => EMPLACEMENTS[l.type] || 0);
    const total = somme((l) => l.valeur * (EMPLACEMENTS[l.type] || 0));
    return {
      lignes,
      horsDonjon: total / (vh * mods.reduce((s, x) => s + x, 0)),
      donjon: total / (vd * mods.reduce((s, x) => s + x, 0)),
    };
  }

  // Stats apportées par l'équipement porté (celles que le simulateur utilise)
  function statsPortees(p) {
    const t = { force: 0, agilite: 0, endurance: 0, intelligence: 0, esprit: 0, pa: 0, ps: 0, armure: 0 };
    for (const o of p.equipement || []) {
      if (GARDES.includes(o.type)) continue;
      for (const [k, v] of Object.entries(o.stats || {})) {
        if (STAT_VERS[k]) t[STAT_VERS[k]] += v;
        else if (k === 'SPELL_HEALING_DONE') t.ps += v * 0.5;
        else if (k === 'EXTRA_ARMOR') t.armure += v;
      }
    }
    return t;
  }

  // Le personnage rééquipé au palier voulu (copie ; « porte » renvoie le profil inchangé)
  function profilPalier(p, id) {
    const pal = palierDe(id);
    if (!pal || !pal.qualite) return p;
    if (!Array.isArray(p.equipement)) return null;
    const n = p.niveau || 1;
    const ilvl = pal.ilvl(n);
    const vSlot = Math.max(0.1, qualite(pal.qualite).v(ilvl));
    const emps = emplacements(p);
    // Budget total du palier, réparti selon la classe. Un objet porte 2 ou 3 stats :
    // en norme 1,5, k stats égales valent k^(1/3) fois le budget en points (2,5 stats → × 1,36)
    const B = emps.reduce((s, [, type]) => s + vSlot * (EMPLACEMENTS[type] || 0), 0);
    const rep = repartition(p);
    const T = B * Math.cbrt(2.5);
    const neuf = { force: 0, agilite: 0, endurance: 0, intelligence: 0, esprit: 0, pa: 0, ps: 0 };
    for (const [k, part] of Object.entries(rep)) neuf[k] = part * T / COUT[k];
    const avant = statsPortees(p);
    const d = {};
    for (const k of Object.keys(neuf)) d[k] = neuf[k] - avant[k];

    const q = JSON.parse(JSON.stringify(p));
    const s = q.stats;
    const r = (x) => Math.round(x);
    s.pv = Math.max(1, r(s.pv + 10 * d.endurance));
    if (s.mana > 0) s.mana = Math.max(0, r(s.mana + 15 * d.intelligence));
    for (const k of ['force', 'agilite', 'endurance', 'intelligence', 'esprit']) s[k] = Math.max(0, r((s[k] || 0) + d[k]));
    const [paF, paA] = PA_PAR[p.classe] || [1, 0];
    const dPa = paF * d.force + paA * d.agilite + d.pa;
    s.pa = Math.max(0, r(s.pa + dPa));
    const dCrit = d.agilite / agiParCrit(p.classe, n);
    s.critique = Math.max(0, Math.round((s.critique + dCrit) * 10) / 10);
    s.esquive = Math.max(0, Math.round((s.esquive + dCrit) * 10) / 10);
    s.puissanceSorts = Math.max(0, r((s.puissanceSorts || 0) + d.ps));

    // Armure : chaque pièce rapportée au niveau d'objet et à la qualité du palier ; bonus d'armure retiré
    let armureObjets = 0, armurePalier = 0;
    const fp = facteurArmure(ilvl, pal.qualite);
    for (const o of p.equipement || []) {
      if (!o.armure || GARDES.includes(o.type)) continue;
      armureObjets += o.armure;
      armurePalier += o.armure * fp / facteurArmure(niveauObjet(o, n), o.qualite);
    }
    s.armure = Math.max(0, r(s.armure + armurePalier - armureObjets - avant.armure + 2 * d.agilite));

    // Armes : DPS du palier à la place du DPS de l'arme portée, plus la nouvelle puissance d'attaque
    const objet = (emp) => (p.equipement || []).find((o) => o.emplacement === emp);
    const main = objet('weapon');
    const typeMain = main ? main.type : ((ARMES_DEFAUT[p.classe] || [])[0] || [])[1] || 'TWOHWEAPON';
    if (s.arme && s.arme.vitesse) {
      const v = s.arme.vitesse;
      const dpsAvant = main && main.arme ? main.arme.dps : Math.max(0, (s.arme.min + s.arme.max) / 2 / v - p.stats.pa / 14);
      const delta = (dpsArme(ilvl, pal.qualite, typeMain) - dpsAvant) * v + dPa / 14 * v;
      s.arme = { min: Math.max(1, r(s.arme.min + delta)), max: Math.max(2, r(s.arme.max + delta)), vitesse: v };
    }
    const dist = objet('ranged');
    if (s.distance && dist && dist.arme && FACTEUR_ARME[dist.type]) {
      const f = dpsArme(ilvl, pal.qualite, dist.type) / Math.max(1, dist.arme.dps);
      s.distance = { min: r(s.distance.min * f), max: r(s.distance.max * f), vitesse: s.distance.vitesse };
    }
    q.cle = `${p.cle}#${id}`;
    q.nom = `${p.nom} (${pal.court})`;
    q.palier = id;
    return q;
  }

  const Equipement = { PALIERS, EMPLACEMENTS, QUALITES, NOMS_QUALITE, GARDES, budget, niveauObjet, analyser, profilPalier, statsPortees, dpsArme };
  racine.Equipement = Equipement;
  if (typeof module !== 'undefined' && module.exports) module.exports = Equipement;
})(typeof window !== 'undefined' ? window : globalThis);
