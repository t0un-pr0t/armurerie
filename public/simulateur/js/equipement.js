/*
 * Équipement : ce que vaut chaque objet porté, et le personnage rééquipé selon trois paliers.
 *   - porté        : la fiche Blizzard telle quelle ;
 *   - pré-BiS      : le meilleur obtenable avant les donjons (bleus de quête, d'artisanat, de l'hôtel des ventes) ;
 *   - BiS          : le meilleur en donjon, la suite épique des donjons de son niveau.
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
      id: 'horsDonjon', nom: 'Pré-BiS', court: 'pré-BiS', qualite: 'RARE', ilvl: (n) => n,
      texte: 'objets rares (bleus) de niveau d\'objet égal à votre niveau : récompenses de quête, artisanat, hôtel des ventes',
    },
    {
      id: 'donjon', nom: 'BiS', court: 'BiS', qualite: 'EPIC', ilvl: (n) => n + 5,
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

  // ------------------------------------------------------------------ listes BiS réelles
  // data/bis/<classe>.json (outils/bis.js) : pour chaque spé, le BiS JcJ par tranche de champ de bataille
  // (ForeverBattlegrounds) et le meilleur objet tous les 5 niveaux (Timesaver), avec les stats Forever des objets.
  // Pré-BiS : le meilleur objet obtenable sans donjon, raid ni haut rang JcJ, au niveau du personnage.
  // BiS : l'objet conseillé par la liste JcJ de sa tranche, sauf si la réserve de la spé a nettement mieux.
  const TRANCHES = [19, 29, 39, 49, 59, 60];
  const SLOTS = {
    head: ['head'], neck: ['neck'], shoulder: ['shoulder'], back: ['back'], chest: ['chest'], wrist: ['wrist'], hand: ['hand'],
    waist: ['waist'], leg: ['leg'], foot: ['foot'], finger: ['leftFinger', 'rightFinger'], trinket: ['leftTrinket', 'rightTrinket'],
    weapon: ['weapon'], offHand: ['offHand'], ranged: ['ranged'],
  };
  const NOMS_SLOTS = {
    head: 'Tête', neck: 'Cou', shoulder: 'Épaules', back: 'Dos', chest: 'Torse', wrist: 'Poignets', hand: 'Mains', waist: 'Taille',
    leg: 'Jambes', foot: 'Pieds', leftFinger: 'Doigt', rightFinger: 'Doigt', leftTrinket: 'Bijou', rightTrinket: 'Bijou',
    weapon: 'Arme', offHand: 'Main gauche', ranged: 'Distance',
  };
  const ORDRE = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hand', 'waist', 'leg', 'foot', 'leftFinger', 'rightFinger',
    'leftTrinket', 'rightTrinket', 'weapon', 'offHand', 'ranged'];
  const SOIGNEURS = { pretre: ['sacre', 'discipline'], paladin: ['sacre'], chaman: ['restauration'], druide: ['restauration'] };
  // Part de chaque école de magie dans les dégâts de la spé (bonus « dégâts de feu » etc.)
  const ECOLES = {
    mage: { defaut: { FIRE: 0.5, FROST: 0.5 }, feu: { FIRE: 1 }, givre: { FROST: 1 }, arcanes: { ARCANE: 0.5, FROST: 0.3, FIRE: 0.2 } },
    demoniste: { defaut: { SHADOW: 0.8, FIRE: 0.2 }, destruction: { SHADOW: 0.6, FIRE: 0.4 } },
    pretre: { defaut: { SHADOW: 0.5, HOLY: 0.5 }, ombre: { SHADOW: 1 } },
    chaman: { defaut: { NATURE: 0.7, FIRE: 0.3 } },
    druide: { defaut: { NATURE: 0.5, ARCANE: 0.5 } },
    paladin: { defaut: { HOLY: 1 } },
  };
  const partEcoles = (p) => { const e = ECOLES[p.classe]; return e ? e[p.spec] || e.defaut : {}; };
  const iconeObjet = (nom) => (!nom ? null : /^https?:/.test(nom) ? nom : `https://render.worldofwarcraft.com/forever-eu/icons/56/${nom}.jpg`);
  const niveauDispo = (o) => (o.niveauRequis != null ? o.niveauRequis : Math.max(1, (o.ilvl || 1) - 4));
  const avantDonjon = (e) => !e.donjon && !e.raid && !(e.rang > 6);

  // Poids de chaque stat pour la spé (1 = sa stat principale), tirés de la répartition des paliers
  function poids(p) {
    const rep = repartition(p);
    const max = Math.max(...Object.values(rep));
    const w = {};
    for (const [k, v] of Object.entries(rep)) w[k] = v / max;
    w.physique = Math.max(w.force || 0, w.agilite || 0, w.pa || 0);
    // Pour un combattant physique, 2 PA coûtent un point de caractéristique (COUT.pa) et valent presque autant :
    // sans ce plancher, une pièce « +18 puissance d'attaque » compterait pour rien chez le druide farouche ou le paladin
    if (w.physique >= 0.5) w.pa = Math.max(w.pa || 0, 0.9 * w.physique);
    w.soins = (SOIGNEURS[p.classe] || []).includes(p.spec) ? (w.ps || 0.8) : 0;
    w.tank = p.spec === 'protection' || p.spec === 'farouche-tank' ? 1 : 0;
    w.mana = (w.intelligence || 0) > 0 ? 1 : 0;
    // Les objets Forever disent « coup critique » sans distinguer : pour un lanceur de sorts, c'est son critique des sorts
    w.lanceur = (w.ps || 0) >= 0.5 && w.physique < 0.5;
    return w;
  }
  // Stats d'un objet en grandeurs du simulateur (endurance, pa, ps, régénération…)
  function statsObjet(o, p) {
    const t = { force: 0, agilite: 0, endurance: 0, intelligence: 0, esprit: 0, pa: 0, ps: 0, soins: 0, armure: 0, mp5: 0, defense: 0 };
    const ecoles = partEcoles(p);
    for (const [k, v] of Object.entries(o.stats || {})) {
      if (STAT_VERS[k]) t[STAT_VERS[k]] += v;
      else if (k === 'SPELL_HEALING_DONE') t.soins += v;
      else if (k === 'EXTRA_ARMOR') t.armure += v;
      else if (k === 'RANGED_ATTACK_POWER') { if (p.classe === 'chasseur') t.pa += v; }
      else if (k === 'MANA_REGENERATION') t.mp5 += v;
      else if (k === 'DEFENSE_SKILL_RATING' || k === 'BLOCK_VALUE') t.defense += v;
      else if (/_SPELL_DAMAGE$/.test(k)) t.ps += v * (ecoles[k.replace('_SPELL_DAMAGE', '')] || 0);
    }
    return t;
  }
  const critiques = (pct, w) => {
    const x = { ...(pct || {}) };
    if (w.lanceur && x.crit) { x.critSort = (x.critSort || 0) + x.crit; x.crit = 0; }
    return x;
  };
  // Valeur d'un objet pour la spé, en points de caractéristique principale
  function valeurObjet(o, p, w = poids(p)) {
    if (!o) return 0;
    const t = statsObjet(o, p);
    const n = p.niveau || 60;
    let v = 0;
    for (const k of ['force', 'agilite', 'endurance', 'intelligence', 'esprit', 'pa', 'ps']) v += t[k] * COUT[k] * (w[k] || 0);
    v += t.soins * 0.45 * w.soins + t.mp5 * 2.5 * w.mana * 0.5 + t.defense * w.tank + (o.armure || 0) * (w.tank ? 0.05 : 0.01);
    const pct = critiques(o.pct, w);
    // 1 % de critique ou de toucher ≈ 12 points de stat principale au niveau 60 (moins à bas niveau)
    const critPhys = 12 * (n + 10) / 70 * w.physique;
    v += (pct.crit || 0) * critPhys + (pct.toucher || 0) * critPhys * 0.6;
    v += ((pct.critSort || 0) + (pct.touchSort || 0) * 0.6) * 12 * (n + 10) / 70 * (w.ps || 0);
    v += ((pct.esquive || 0) + (pct.parade || 0) + (pct.blocage || 0) * 0.5) * 12 * w.tank;
    if (o.arme && o.arme.dps && p.classe !== 'druide') {
      const distance = ['RANGED', 'RANGEDRIGHT', 'THROWN'].includes(o.type) && o.sousType !== 'Baguette';
      // 1 point de DPS d'arme vaut 14 de puissance d'attaque, soit 7 points de caractéristique
      const part = p.classe === 'chasseur' ? (distance ? 1 : 0.25) : distance ? 0.3 : w.physique;
      v += o.arme.dps * 7 * part;
    }
    return v;
  }

  // Ce qu'a la spé dans les listes : une entrée par objet et par emplacement, du côté de la faction
  function reserve(d, p) {
    const spec = d.specs[p.spec] || d.specs[Object.keys(d.specs).find((k) => !/tank/.test(k))];
    if (!spec) return null;
    const horde = /horde/i.test(p.faction || '');
    const n = Math.min(60, p.niveau || 60);
    const tranche = TRANCHES.find((t) => t >= n) || 60;
    const parSlot = {};
    const typesPropres = {};
    const ajouter = (l, origine, conseille, propre) => {
      const e = horde && l.h ? l.h : l.a;
      const o = d.objets[e.id];
      if (!o) return;
      if (propre) (typesPropres[l.slot] = typesPropres[l.slot] || new Set()).add(o.type);
      const liste = (parSlot[l.slot] = parSlot[l.slot] || new Map());
      const deja = liste.get(o.id);
      if (deja) { deja.conseille = deja.conseille || conseille; return; }
      liste.set(o.id, { objet: { ...o, icone: iconeObjet(o.icone) }, source: e.source, donjon: e.donjon, raid: e.raid, rang: e.rang, classic: !!e.classic, origine, conseille });
    };
    // Listes de la spé d'abord, puis celles des autres spés de la classe (mêmes armures et armes portables)
    const cle = Object.keys(d.specs).find((k) => d.specs[k] === spec);
    for (const k of [cle, ...Object.keys(d.specs).filter((x) => x !== cle)]) {
      const sp = d.specs[k], autre = k === cle ? '' : ' (autre spé)';
      for (const [t, lignes] of Object.entries(sp.tranches)) for (const l of lignes) ajouter(l, `BiS JcJ ${t === '60' ? 'niveau 60' : `tranche ${t}`}${autre}`, !autre && Number(t) === tranche, !autre);
      for (const [niv, lignes] of Object.entries(sp.montee)) for (const l of lignes) ajouter(l, `${niv === 'preraid' ? 'pré-raid niveau 60' : `montée, niveau ${niv}`}${autre}`, false, !autre);
    }
    return { spec, tranche, parSlot, typesPropres, cle };
  }

  // Le pré-BiS et le BiS de chaque emplacement pour ce personnage (classe, spé, niveau, faction)
  function choixBis(p, d) {
    if (!d || !d.specs) return null;
    const r = reserve(d, p);
    if (!r) return null;
    const n = Math.min(60, p.niveau || 60);
    const w = poids(p);
    // Armes : seulement les types que la spé porte dans ses propres listes (bouclier du tank, deux mains du vindicte…)
    const famille = (t) => (['WEAPON', 'WEAPONMAINHAND', 'WEAPONOFFHAND'].includes(t) ? 'UNE_MAIN' : t);
    const typeOk = (slot, o) => {
      const propres = r.typesPropres[slot];
      if (!['weapon', 'offHand', 'ranged'].includes(slot) || !propres) return true;
      if (slot === 'weapon' && o.type === 'WEAPONOFFHAND') return false;
      if (slot === 'offHand' && o.type === 'WEAPONMAINHAND') return false;
      return [...propres].some((t) => famille(t) === famille(o.type));
    };
    const cands = (slot, filtre) => [...((r.parSlot[slot] || new Map()).values())]
      .filter((c) => niveauDispo(c.objet) <= n && typeOk(slot, c.objet) && (!filtre || filtre(c)))
      .map((c) => ({ ...c, valeur: valeurObjet(c.objet, p, w) }));
    // Les k meilleurs ; pour le BiS, l'objet de la liste JcJ de la tranche passe devant à 15 % près
    const meilleurs = (liste, k, bonus) => liste.slice().sort((a, b) => b.valeur * (bonus && b.conseille ? 1.15 : 1) - a.valeur * (bonus && a.conseille ? 1.15 : 1)).slice(0, k);
    const somme = (xs) => xs.reduce((s, x) => s + x.valeur, 0);
    const choix = { pre: {}, bis: {} };
    const poser = (palier, slot, xs) => SLOTS[slot].forEach((emp, i) => { choix[palier][emp] = xs[i] || null; });
    for (const slot of Object.keys(SLOTS)) {
      if (slot === 'weapon' || slot === 'offHand') continue;
      const k = SLOTS[slot].length;
      const pre = meilleurs(cands(slot, avantDonjon), k, false);
      let bis = meilleurs(cands(slot), k, true);
      if (somme(bis) < somme(pre)) bis = pre;
      poser('pre', slot, pre);
      poser('bis', slot, bis);
    }
    // Armes : une arme à deux mains, ou une à une main et la main gauche, selon ce qui vaut le plus
    const armes = (filtre, bonus) => {
      const main = cands('weapon', filtre);
      const gauche = cands('offHand', filtre);
      const deux = meilleurs(main.filter((c) => c.objet.type === 'TWOHWEAPON'), 1, bonus)[0];
      const une = meilleurs(main.filter((c) => c.objet.type !== 'TWOHWEAPON'), 1, bonus)[0];
      const mg = meilleurs(gauche.filter((c) => !une || c.objet.id !== une.objet.id), 1, bonus)[0];
      const v1 = (une ? une.valeur : 0) + (mg ? mg.valeur : 0);
      return deux && (deux.valeur >= v1 || !une) ? { weapon: deux, offHand: null } : { weapon: une || null, offHand: mg || null };
    };
    const ap = armes(avantDonjon, false);
    let ab = armes(null, true);
    const val = (a) => (a.weapon ? a.weapon.valeur : 0) + (a.offHand ? a.offHand.valeur : 0);
    if (val(ab) < val(ap)) ab = ap;
    Object.assign(choix.pre, ap);
    Object.assign(choix.bis, ab);
    const lignes = ORDRE.filter((emp) => choix.pre[emp] || choix.bis[emp])
      .map((emp) => ({ emplacement: emp, emplacementNom: NOMS_SLOTS[emp], pre: choix.pre[emp], bis: choix.bis[emp] }));
    return { spec: r.cle, tranche: r.tranche, niveau: n, horde: /horde/i.test(p.faction || ''), sources: r.spec.sources, maj: d.maj, lignes, pre: choix.pre, bis: choix.bis };
  }

  // Le personnage rééquipé avec les objets d'un choix (« pre » ou « bis ») ; bijoux et reliques gardés
  function profilObjets(p, choix, id) {
    if (!Array.isArray(p.equipement) || !choix) return null;
    const pal = id === 'horsDonjon' ? 'pre' : 'bis';
    const neufs = choix[pal];
    const n = p.niveau || 1;
    const w = poids(p);
    const porte = new Map(p.equipement.map((o) => [o.emplacement, o]));
    const nouveau = new Map(porte);
    for (const [emp, c] of Object.entries(neufs)) {
      if (!c || GARDES.includes(c.objet.type)) continue;
      nouveau.set(emp, { ...c.objet, emplacement: emp, emplacementNom: NOMS_SLOTS[emp] });
    }
    const main = nouveau.get('weapon');
    if (main && main.type === 'TWOHWEAPON') nouveau.delete('offHand');
    else if (neufs.offHand === null && neufs.weapon && porte.get('offHand') && porte.get('weapon') && porte.get('weapon').type === 'TWOHWEAPON') nouveau.delete('offHand');
    const total = (objets) => {
      const t = { force: 0, agilite: 0, endurance: 0, intelligence: 0, esprit: 0, pa: 0, ps: 0, soins: 0, armure: 0, mp5: 0, defense: 0, objetsArmure: 0, crit: 0, critSort: 0, esquive: 0 };
      for (const o of objets) {
        if (GARDES.includes(o.type)) continue;
        const s = statsObjet(o, p);
        for (const k of Object.keys(s)) t[k] += s[k];
        t.objetsArmure += o.armure || 0;
        const pct = critiques(o.pct, w);
        t.crit += pct.crit || 0; t.critSort += pct.critSort || 0; t.esquive += pct.esquive || 0;
      }
      return t;
    };
    const a = total(porte.values()), b = total(nouveau.values());
    const d = {};
    for (const k of Object.keys(a)) d[k] = b[k] - a[k];
    // Le simulateur compte les soins pour moitié dans la puissance des sorts (comme statsPortees)
    d.ps += d.soins * 0.5;

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
    s.critique = Math.max(0, Math.round((s.critique + dCrit + d.crit) * 10) / 10);
    s.esquive = Math.max(0, Math.round((s.esquive + dCrit + d.esquive) * 10) / 10);
    s.critSorts = Math.round(((s.critSorts || 0) + d.critSort) * 10) / 10;
    s.puissanceSorts = Math.max(0, r((s.puissanceSorts || 0) + d.ps));
    s.regenMana = Math.max(0, r((s.regenMana || 0) + d.mp5));
    s.armure = Math.max(0, r(s.armure + d.objetsArmure + d.armure + 2 * d.agilite));

    // Arme : les dégâts de la nouvelle arme, plus la puissance d'attaque (14 PA = 1 DPS)
    const ancienne = porte.get('weapon');
    if (s.arme && s.arme.vitesse) {
      const v = s.arme.vitesse;
      const base = Math.max(0, (s.arme.min + s.arme.max) / 2 / v - p.stats.pa / 14);
      if (main && main.arme && (!ancienne || ancienne.id !== main.id || ancienne.nom !== main.nom)) {
        const extra = ancienne && ancienne.arme ? Math.max(0, base - ancienne.arme.dps) : 0;
        const nv = main.arme.vitesse;
        const plus = (extra + s.pa / 14) * nv;
        s.arme = { min: Math.max(1, r(main.arme.min + plus)), max: Math.max(2, r(main.arme.max + plus)), vitesse: nv };
      } else {
        s.arme = { min: Math.max(1, r(s.arme.min + dPa / 14 * v)), max: Math.max(2, r(s.arme.max + dPa / 14 * v)), vitesse: v };
      }
    }
    const distA = porte.get('ranged'), distB = nouveau.get('ranged');
    if (s.distance && distA && distA.arme && distB && distB.arme && distB !== distA) {
      const f = distB.arme.dps / Math.max(1, distA.arme.dps);
      s.distance = { min: r(s.distance.min * f), max: r(s.distance.max * f), vitesse: distB.arme.vitesse || s.distance.vitesse };
    }
    q.equipement = [...nouveau.values()];
    q.cle = `${p.cle}#${id}`;
    const pa = palierDe(id);
    q.nom = `${p.nom} (${pa ? pa.court : id})`;
    q.palier = id;
    return q;
  }

  // Objet par objet : l'objet porté comparé au pré-BiS et au BiS de son emplacement (valeur pour la spé)
  function analyserBis(p, choix) {
    if (!Array.isArray(p.equipement) || !choix) return null;
    const w = poids(p);
    const porte = new Map(p.equipement.map((o) => [o.emplacement, o]));
    const lignes = choix.lignes.map((l) => {
      const o = porte.get(l.emplacement) || null;
      const v = valeurObjet(o, p, w);
      const vp = l.pre ? l.pre.valeur : 0, vb = l.bis ? l.bis.valeur : 0;
      const garde = GARDES.includes((l.bis || l.pre || {}).objet?.type) || /Trinket/.test(l.emplacement);
      const dps = (x) => (x && x.objet.arme ? x.objet.arme.dps : null);
      return {
        ...l, objet: o, valeur: v, garde,
        ilvl: o ? niveauObjet(o, p.niveau) : null,
        horsDonjon: vp > 0 ? Math.min(1.5, v / vp) : null, donjon: vb > 0 ? Math.min(1.5, v / vb) : null,
        manque: garde ? 0 : Math.max(0, vp - v), manqueDonjon: garde ? 0 : Math.max(0, vb - v),
        dps: o && o.arme ? o.arme.dps : (dps(l.pre) || dps(l.bis) ? 0 : null), dpsHorsDonjon: dps(l.pre), dpsDonjon: dps(l.bis),
        identiquePre: !!(o && l.pre && (o.id === l.pre.objet.id || o.nom === l.pre.objet.nom)),
        identiqueBis: !!(o && l.bis && (o.id === l.bis.objet.id || o.nom === l.bis.objet.nom)),
      };
    });
    const comptees = lignes.filter((l) => !l.garde);
    const somme = (f) => comptees.reduce((s, l) => s + f(l), 0);
    const vp = somme((l) => (l.pre ? l.pre.valeur : 0)), vb = somme((l) => (l.bis ? l.bis.valeur : 0));
    const v = somme((l) => (l.pre || l.bis ? l.valeur : 0));
    return { lignes, horsDonjon: vp ? v / vp : null, donjon: vb ? v / vb : null, reel: true, choix };
  }

  const Equipement = {
    PALIERS, EMPLACEMENTS, QUALITES, NOMS_QUALITE, GARDES, TRANCHES, budget, niveauObjet, analyser, profilPalier, statsPortees, dpsArme,
    choixBis, profilObjets, analyserBis, valeurObjet, poids, iconeObjet,
  };
  racine.Equipement = Equipement;
  if (typeof module !== 'undefined' && module.exports) module.exports = Equipement;
})(typeof window !== 'undefined' ? window : globalThis);
