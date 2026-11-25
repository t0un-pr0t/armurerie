// Fiche d'un druide de l'armurerie Blizzard → personnage du simulateur (public/simulateur).
// Le serveur l'appelle à chaque lecture d'un druide ; GET /api/druides renvoie le résultat.
// Talents reconnus par leur nom, stats de la fiche ramenées au format du moteur, objets.
'use strict';

const D = require('./public/simulateur/js/donnees.js');

// --------------------------------------------------------------- talents
const ARBRE_DU_JEU = { balance: 'equilibre', 'feral-combat': 'farouche', restoration: 'restauration' };
const sansAccent = (s) => String(s || '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
// Noms officiels de WoW Forever qui diffèrent de ceux du simulateur
const ALIAS = {
  'griffes aiguisees': 'griffesAcerees',
  'frappes de predateur': 'frappesPredatrices',
  'lacerer': 'laceration',
  'coeur de fauve': 'coeurSauvage',
  'morsure primordiale': 'morsurePrimitive',
  'dechiqueter et lacerer': 'dechirerLacerer',
};
const TALENTS = {};
for (const a of D.ARBRES) for (const t of a.talents) TALENTS[t.id] = { arbre: a.id, ...t };
const PAR_NOM = {};
for (const t of Object.values(TALENTS)) PAR_NOM[sansAccent(t.nom)] = t.id;
for (const [nom, id] of Object.entries(ALIAS)) PAR_NOM[nom] = id;

const idTalent = (nom) => PAR_NOM[sansAccent(nom)] || null;

// Talents de l'armurerie → { points: {id: rang}, liste } ; un talent inconnu est gardé, non simulé
function convertirTalents(specs) {
  const points = {}, liste = [];
  for (const sp of specs || []) {
    const arbre = ARBRE_DU_JEU[sp.id] || null;
    for (const t of sp.talents || []) {
      const id = idTalent(t.name);
      const connu = id && TALENTS[id];
      const rang = connu ? Math.min(t.rank || 0, connu.max) : t.rank || 0;
      if (connu && (!arbre || connu.arbre === arbre)) points[id] = rang;
      liste.push({
        arbre, nom: t.name, rang, id: connu ? id : null, nomSimulateur: connu ? connu.nom : null,
        max: connu ? connu.max : null, sim: !!(connu && connu.sim), description: (t.description || '').trim(),
        icone: t.icon?.url || null,
      });
    }
  }
  return { points, liste };
}

// ------------------------------------------------------------------ stats
const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;

function lireStats(st = {}) {
  const tout = [...(st.overview || []), ...(st.basic ? [...(st.basic.primary || []), ...(st.basic.secondary || [])] : []),
    ...(st.groups || []).flatMap((g) => g.stats || [])];
  const v = (e) => tout.find((s) => s.enum === e)?.value ?? null;
  const n = (e) => { const x = v(e); return x && typeof x.value === 'number' ? x.value : 0; };
  const dmg = v('DAMAGE');
  return {
    pv: n('HEALTH'), mana: n('MANA'), force: n('STRENGTH'), agilite: n('AGILITY'), endurance: n('STAMINA'),
    intelligence: n('INTELLECT'), esprit: n('SPIRIT'), pa: n('ATTACKPOWER'), crit: n('CRITICALSTRIKE'),
    esquive: n('DODGE'), parade: n('PARRY'), armure: n('ARMOR'), regenMana: n('MANAREGEN'),
    degatsMin: dmg?.min ? Math.round(dmg.min.value) : 0, degatsMax: dmg?.max ? Math.round(dmg.max.value) : 0,
    vitesse: n('ATTACKSPEED'), dpsAttaque: r1(n('ATTACKDPS')),
  };
}

// Fiche (forme humanoïde, talents compris) → stats du moteur et base PV / mana.
// Le moteur réapplique Cœur sauvage (Intelligence) et Esprit vivant : on les retire ici.
// Critique et esquive : le moteur compte 1 + Agilité / 20 ; l'écart avec la fiche passe dans crit et esquive.
function convertirStats(fiche, points, equipement) {
  const r = (id) => points[id] || 0;
  const intelligence = r1(fiche.intelligence / (1 + 0.02 * r('coeurSauvage')));
  const esprit = r1(fiche.esprit / (1 + 0.05 * r('espritVivant')));
  const armureBonus = equipement.reduce((s, o) => s + (o.armureBonus || 0), 0);
  const arme = equipement.find((o) => o.arme);
  const stats = {
    force: fiche.force, agilite: fiche.agilite, endurance: fiche.endurance, intelligence, esprit,
    pa: Math.round(fiche.pa - (2 * fiche.force - 20)),
    dpsArme: arme ? r1(arme.arme.dps) : 0,
    armure: Math.round(fiche.armure - 2 * fiche.agilite - armureBonus),
    armureBonus,
    soins: 0,
    crit: r3(fiche.crit - (1 + fiche.agilite / 20)),
    esquive: r3(fiche.esquive - (1 + fiche.agilite / 20)),
    toucher: 0,
  };
  const base = {
    pv: Math.round(fiche.pv - (fiche.endurance - 20) * 10),
    mana: Math.round(fiche.mana - (intelligence * (1 + 0.02 * r('coeurSauvage')) - 20) * 15),
  };
  return { stats, base };
}

// -------------------------------------------------------------- objets
const EMPLACEMENTS = {
  head: 'Tête', neck: 'Cou', shoulder: 'Épaules', back: 'Dos', chest: 'Torse', shirt: 'Chemise', tabard: 'Tabard',
  wrist: 'Poignets', hand: 'Mains', waist: 'Taille', leg: 'Jambes', foot: 'Pieds', leftFinger: 'Doigt', rightFinger: 'Doigt',
  leftTrinket: 'Bijou', rightTrinket: 'Bijou', weapon: 'Arme', offhand: 'Main gauche', ranged: 'Relique',
};
const ORDRE = Object.keys(EMPLACEMENTS);
const iconeObjet = (o) => o?.media?.content?.assets?.find((a) => a.key === 'icon')?.value || null;

function convertirObjet(emplacement, o) {
  const stats = (o.stats || []).map((s) => s.display?.display_string || `${s.value} ${s.type?.name}`);
  const armureBonus = (o.stats || []).filter((s) => s.type?.type === 'EXTRA_ARMOR').reduce((t, s) => t + (s.value || 0), 0);
  const w = o.weapon;
  return {
    emplacement: EMPLACEMENTS[emplacement] || emplacement,
    id: o.id, nom: o.name, qualite: o.quality?.type || 'COMMON', ilvl: o.level?.value || null,
    type: o.item_subclass?.name || '', armure: o.armor?.value || 0, armureBonus,
    stats, enchantement: (o.enchantments || []).map((e) => e.display_string.replace(/^Enchanté\s*:\s*/u, '')).join(' · ') || null,
    effets: (o.spells || []).map((s) => (s.description || '').trim()).filter(Boolean),
    arme: w ? { min: w.damage.min_value, max: w.damage.max_value, vitesse: w.attack_speed.value / 1000, dps: w.dps.value } : null,
    icone: iconeObjet(o),
  };
}

// ---------------------------------------------------------- personnage
// entree : { key, region, armoryUrl } ; c : characterProfileInitialState.character
function convertirDruide(entree, c) {
  const fiche = lireStats(c.stats);
  const tal = convertirTalents(c.specs);
  const equipement = Object.entries(c.gear || {})
    .sort((a, b) => ORDRE.indexOf(a[0]) - ORDRE.indexOf(b[0]))
    .map(([k, o]) => convertirObjet(k, o));
  const { stats, base } = convertirStats(fiche, tal.points, equipement);
  const totalPoints = Object.values(tal.points).reduce((s, x) => s + x, 0);
  const remarques = [];
  const inconnus = tal.liste.filter((t) => !t.id);
  if (inconnus.length) remarques.push(`Talents non reconnus, ignorés par le simulateur : ${inconnus.map((t) => t.nom).join(', ')}.`);
  const nonSimules = tal.liste.filter((t) => t.id && !t.sim);
  if (nonSimules.length) remarques.push(`Talents reconnus sans effet dans le simulateur : ${nonSimules.map((t) => t.nom).join(', ')}.`);
  if (totalPoints > c.level - 9) remarques.push(`${totalPoints} points de talents pour ${c.level - 9} attendus au niveau ${c.level}.`);
  return {
    cle: entree.key, nom: [c.name, c.surname].filter(Boolean).join(' '), region: c.region || entree.region,
    niveau: c.level, classe: c.class?.name, race: c.race?.name, genre: c.gender?.name,
    faction: c.faction?.name, guilde: c.guild ? c.guild.name : null, ilvl: c.averageItemLevel || null,
    urlArmurerie: entree.armoryUrl, majArmurerie: c.lastUpdatedTimestamp?.iso8601 || null,
    portrait: c.avatar?.url || null,
    specs: (c.specs || []).map((sp) => ({ arbre: ARBRE_DU_JEU[sp.id] || null, nom: sp.name, points: sp.spentPoints || 0, icone: sp.icon?.url || null })),
    fiche, talents: tal.points, talentsJeu: tal.liste, equipement, stats, base, remarques,
  };
}

module.exports = { convertirDruide, convertirTalents, convertirStats, lireStats, idTalent };
