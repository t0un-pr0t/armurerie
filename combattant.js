// Fiche Blizzard d'un personnage (toutes classes) → combattant du simulateur (public/simulateur/js/arene.js).
// Le serveur l'appelle à chaque lecture ; GET /api/combattants renvoie le résultat.
'use strict';

const CLASSES = {
  warrior: 'guerrier', paladin: 'paladin', hunter: 'chasseur', rogue: 'voleur', priest: 'pretre',
  shaman: 'chaman', mage: 'mage', warlock: 'demoniste', druid: 'druide',
};
// Arbres de talents : slug Blizzard → identifiant du simulateur (les slugs « holy », « protection »… servent à plusieurs classes)
const ARBRES = {
  arms: 'armes', fury: 'fureur', protection: 'protection', holy: 'sacre', retribution: 'vindicte',
  'beast-mastery': 'maitrise', beastmastery: 'maitrise', marksmanship: 'precision', survival: 'survie',
  assassination: 'assassinat', combat: 'combat', subtlety: 'finesse', discipline: 'discipline', shadow: 'ombre',
  elemental: 'elementaire', enhancement: 'amelioration', restoration: 'restauration', arcane: 'arcanes',
  fire: 'feu', frost: 'givre', affliction: 'affliction', demonology: 'demonologie', destruction: 'destruction',
  balance: 'equilibre', 'feral-combat': 'farouche', feral: 'farouche',
};
// Quand la fiche ne donne pas l'identifiant de l'arbre : son nom français
const NOMS_ARBRES = {
  'magie de l ombre': 'ombre', ombre: 'ombre', 'combat farouche': 'farouche', 'maitrise des betes': 'maitrise',
  arcane: 'arcanes', arcanes: 'arcanes', sacre: 'sacre', equilibre: 'equilibre',
  amelioration: 'amelioration', elementaire: 'elementaire', demonologie: 'demonologie',
};
const sansAccent = (s) => String(s || '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();

function lireStats(st = {}) {
  const tout = [...(st.overview || []), ...(st.groups || []).flatMap((g) => g.stats || [])];
  const v = (e) => tout.find((s) => s.enum === e)?.value ?? null;
  const n = (e) => { const x = v(e); return x && typeof x.value === 'number' ? x.value : 0; };
  const dmg = v('DAMAGE');
  return {
    pv: n('HEALTH'), mana: n('MANA'), force: n('STRENGTH'), agilite: n('AGILITY'), endurance: n('STAMINA'),
    intelligence: n('INTELLECT'), esprit: n('SPIRIT'), pa: n('ATTACKPOWER'), critique: n('CRITICALSTRIKE'),
    esquive: n('DODGE'), parade: n('PARRY'), blocage: n('BLOCK'), armure: n('ARMOR'),
    puissanceSorts: n('SPELLPOWER'), regenMana: n('MANAREGEN'),
    degatsMin: dmg?.min ? dmg.min.value : 0, degatsMax: dmg?.max ? dmg.max.value : 0, dpsAttaque: n('ATTACKDPS'),
  };
}

const r1 = (x) => Math.round(x * 10) / 10;
// Objets portés : ce qu'il faut pour estimer leur valeur (public/simulateur/js/equipement.js)
// Effets « Équipé : augmente vos chances de coup critique de 1 % » (toucher, esquive…), en points de pourcentage.
// Même lecture que outils/bis.js pour les objets des listes BiS.
function pourcentages(descriptions) {
  const pct = {};
  for (const l of descriptions) {
    if (!/^[ÉE]quip[^:]*:\s*augmente (vos|les) chances/i.test(l || '')) continue;
    const m = /(\d+(?:[.,]\d+)?)\s?%/.exec(l);
    if (!m) continue;
    const sorts = /sorts/.test(l);
    const k = /critique/.test(l) ? (sorts ? 'critSort' : 'crit') : /toucher/.test(l) ? (sorts ? 'touchSort' : 'toucher')
      : /esquiv/.test(l) ? 'esquive' : /parer/.test(l) ? 'parade' : /bloquer/.test(l) ? 'blocage' : null;
    if (k) pct[k] = (pct[k] || 0) + Number(m[1].replace(',', '.'));
  }
  return Object.keys(pct).length ? pct : undefined;
}

function equipement(gear) {
  return Object.entries(gear || {}).map(([emplacement, o]) => {
    const stats = {};
    for (const s of o.stats || []) {
      const k = s.type?.type;
      if (k && typeof s.value === 'number') stats[k.replace(/,$/, '')] = (stats[k.replace(/,$/, '')] || 0) + s.value;
    }
    const w = o.weapon;
    return {
      emplacement, id: o.item?.id || o.id || null, emplacementNom: o.slot?.name || emplacement, type: o.inventory_type?.type || null,
      nom: o.name, qualite: o.quality?.type || null, niveauRequis: o.requirements?.level?.value || null,
      sousType: o.item_subclass?.name || null, armure: o.armor?.value || 0, stats,
      arme: w ? { min: w.damage.min_value, max: w.damage.max_value, vitesse: w.attack_speed.value / 1000, dps: r1(w.dps.value) } : null,
      icone: o.media?.content?.assets?.find((a) => a.key === 'icon')?.value || null,
      pct: pourcentages((o.spells || []).map((x) => x.description)),
    };
  });
}
const arme = (o) => {
  const w = o?.weapon;
  return w ? { min: w.damage.min_value, max: w.damage.max_value, vitesse: w.attack_speed.value / 1000, dps: r1(w.dps.value), nom: o.name } : null;
};

// entree : { key, region, armoryUrl } ; c : characterProfileInitialState.character
function convertirCombattant(entree, c) {
  const f = lireStats(c.stats);
  const specs = (c.specs || []).map((sp) => ({
    id: ARBRES[sp.id] || NOMS_ARBRES[sansAccent(sp.name)] || sansAccent(sp.name).replace(/\s+/g, '-'), nom: sp.name, points: sp.spentPoints || 0,
    icone: sp.icon?.url || null,
  }));
  const principale = specs.reduce((m, s) => (s.points > (m?.points ?? -1) ? s : m), null);
  const talents = (c.specs || []).flatMap((sp) => (sp.talents || []).map((t) => ({ nom: t.name, rang: t.rank || 0, icone: t.icon?.url || null })));
  const main = arme(c.gear?.weapon);
  const distance = arme(c.gear?.ranged);
  // La vitesse d'attaque de la fiche est souvent fausse (2,0) : on la déduit des dégâts et du DPS affichés
  const moyenne = (f.degatsMin + f.degatsMax) / 2;
  const vitesse = f.dpsAttaque > 0 && moyenne > 0 ? moyenne / f.dpsAttaque : main?.vitesse || 2;
  return {
    cle: entree.key,
    nom: [c.name, c.surname].filter(Boolean).join(' '),
    region: c.region || entree.region,
    niveau: c.level,
    classe: CLASSES[c.class?.slug] || c.class?.slug || null,
    classeNom: c.class?.name || null,
    race: c.race?.name || null,
    faction: c.faction?.name || null,
    guilde: c.guild ? c.guild.name : null,
    ilvl: c.averageItemLevel || null,
    portrait: c.avatar?.url || null,
    urlArmurerie: entree.armoryUrl || null,
    majArmurerie: c.lastUpdatedTimestamp?.iso8601 || null,
    spec: principale && principale.points > 0 ? principale.id : null,
    specs,
    talents,
    stats: {
      pv: f.pv, mana: f.mana, force: f.force, agilite: f.agilite, endurance: f.endurance, intelligence: f.intelligence,
      esprit: f.esprit, pa: f.pa, critique: r1(f.critique), esquive: r1(f.esquive),
      parade: r1(f.parade), blocage: r1(f.blocage), armure: f.armure,
      puissanceSorts: f.puissanceSorts, regenMana: f.regenMana,
      arme: { min: Math.round(f.degatsMin), max: Math.round(f.degatsMax), vitesse: Math.round(vitesse * 100) / 100 },
      distance,
    },
    equipement: equipement(c.gear),
  };
}

module.exports = { convertirCombattant, equipement, pourcentages, lireStats, CLASSES, ARBRES, sansAccent };
