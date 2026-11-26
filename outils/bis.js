#!/usr/bin/env node
// Récupère les listes BiS et l'équipement de montée de niveau de chaque spécialisation de WoW Forever,
// puis les stats Forever de chaque objet (infobulles Wowhead, en français).
//   node outils/bis.js [dossier de cache]
// Écrit public/simulateur/data/bis/<classe>.json (une liste par spé, et les objets cités).
//
// Sources :
//   - ForeverBattlegrounds (foreverbattlegrounds.com/gearing/<classe>/<spé>/) : BiS JcJ par tranche de
//     champ de bataille (19, 29, 39, 49, 59, 60), meilleur objet de chaque emplacement, toutes sources ;
//   - Timesaver (timesaver.gg/tools/wow-forever/leveling-gear/<classe>/<spé>) : meilleur objet de chaque
//     emplacement tous les 5 niveaux (quêtes, donjons, artisanat), et le pré-raid du niveau 60 ;
//   - Wowhead (nether.wowhead.com/forever/tooltip/item/<id>?locale=2) : nom français et stats Forever.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE = process.argv[2] || path.join(os.tmpdir(), 'armurerie-bis');
const SORTIE = path.join(__dirname, '..', 'public', 'simulateur', 'data', 'bis');
const UA = 'Mozilla/5.0 (armurerie-forever; listes BiS)';

// Classe et spé des sites (anglais) → identifiants du simulateur
const CLASSES = {
  warrior: 'guerrier', paladin: 'paladin', hunter: 'chasseur', rogue: 'voleur', priest: 'pretre',
  shaman: 'chaman', mage: 'mage', warlock: 'demoniste', druid: 'druide',
};
const SPECS = {
  warrior: { arms: 'armes', fury: 'fureur', protection: 'protection' },
  paladin: { holy: 'sacre', protection: 'protection', retribution: 'vindicte' },
  hunter: { 'beast-mastery': 'maitrise', marksmanship: 'precision', survival: 'survie' },
  rogue: { assassination: 'assassinat', combat: 'combat', subtlety: 'finesse' },
  priest: { discipline: 'discipline', holy: 'sacre', shadow: 'ombre' },
  shaman: { elemental: 'elementaire', enhancement: 'amelioration', restoration: 'restauration' },
  mage: { arcane: 'arcanes', fire: 'feu', frost: 'givre' },
  warlock: { affliction: 'affliction', demonology: 'demonologie', destruction: 'destruction' },
  druid: { balance: 'equilibre', feral: 'farouche', 'feral-tank': 'farouche-tank', restoration: 'restauration' },
};
// Emplacements des sites → clés de l'équipement Blizzard (combattant.js)
const EMPLACEMENTS = {
  head: 'head', neck: 'neck', shoulder: 'shoulder', back: 'back', chest: 'chest', wrist: 'wrist',
  hands: 'hand', hand: 'hand', waist: 'waist', legs: 'leg', feet: 'foot', finger: 'finger', trinket: 'trinket',
  'main hand': 'weapon', 'two-hand': 'weapon', 'two hand': 'weapon', weapon: 'weapon', 'one-hand': 'weapon',
  'off hand': 'offHand', 'off-hand': 'offHand', shield: 'offHand', 'held in off-hand': 'offHand',
  ranged: 'ranged', wand: 'ranged', thrown: 'ranged', relic: 'ranged', idol: 'ranged', libram: 'ranged', totem: 'ranged',
};
// Donjons et raids (classiques et nouveaux de Forever) : un objet qui en vient n'est pas du pré-BiS
const DONJONS = [
  'Ragefire Chasm', 'Wailing Caverns', 'Deadmines', 'Shadowfang Keep', 'Blackfathom Deeps', 'Stockade',
  'Gnomeregan', 'Razorfen Kraul', 'Razorfen Downs', 'Scarlet Monastery', 'Uldaman', "Zul'Farrak", 'Maraudon',
  'Sunken Temple', "Atal'Hakkar", 'Blackrock Depths', 'Blackrock Spire', 'Dire Maul', 'Stratholme', 'Scholomance',
  'Hall of Thanes', 'Ruins of Lordaeron', 'Excavation Site', 'City of Dalaran', 'Drowned City', "Krol'dok",
  'Alcaz Prison', 'Blackmaw Hold', "Shaper's Terrace", 'Barrow Deeps', 'Hyjal Summit', "Onyxia's Lair",
  'Molten Core', "Zul'Gurub", 'Dungeon drop', 'Drops in',
];
const RAIDS = ['Barrow Deeps', 'Hyjal Summit', "Onyxia's Lair", 'Molten Core', "Zul'Gurub"];

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function lire(url, fichier) {
  const f = path.join(CACHE, fichier);
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  for (let essai = 0; essai < 4; essai++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5' } });
    if (res.ok) {
      const t = await res.text();
      fs.writeFileSync(f, t);
      await attendre(250);
      return t;
    }
    if (res.status === 404) return null;
    await attendre(2000 * (essai + 1));
  }
  throw new Error(`${url} : échec`);
}

const texte = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const emplacement = (s) => {
  const k = texte(s).toLowerCase();
  if (!(k in EMPLACEMENTS)) throw new Error(`emplacement inconnu : « ${k} »`);
  return EMPLACEMENTS[k];
};
const donjon = (src) => DONJONS.some((d) => src.includes(d));
const raid = (src) => RAIDS.some((d) => src.includes(d));
// Rang JcJ exigé (« PvP rank 13 (Field Marshal) ») : au-delà du rang 6, ce n'est plus de l'équipement d'avant donjon
const rang = (src) => { const m = /PvP rank (\d+)/.exec(src); return m ? Number(m[1]) : null; };
const entree = (id, nom, source) => ({ id: Number(id), nom, source, donjon: donjon(source), raid: raid(source), rang: rang(source) });

// ForeverBattlegrounds : une table par tranche (« Levels 10–19 » … « Level 60 »)
function lireFbg(html) {
  const tranches = {};
  const parties = html.split(/<h2[^>]*>/).slice(1);
  for (const p of parties) {
    const titre = texte(p.slice(0, p.indexOf('</h2>')));
    const m = titre.match(/^Levels? (?:\d+[–-])?(\d+)$/);
    if (!m) continue;
    const table = p.match(/<table class="gear">([\s\S]*?)<\/table>/);
    if (!table) continue;
    const lignes = [];
    for (const tr of table[1].match(/<tr>[\s\S]*?<\/tr>/g) || []) {
      const td = tr.match(/<td>([\s\S]*?)<\/td>/g);
      if (!td || td.length < 3) continue;
      const slot = emplacement(td[0].replace(/<span[\s\S]*$/, ''));
      const liens = [...td[1].matchAll(/item=(\d+)"[^>]*>([^<]+)<\/a>/g)];
      if (!liens.length) continue;
      const src = td[2].replace(/<\/td>$/, '');
      const [srcA, srcH] = src.split(/<span class="gear__horde">/);
      const classic = (s) => /tag--classic/.test(s || '');
      const a = entree(liens[0][1], texte(liens[0][2]), texte(srcA));
      a.classic = classic(srcA);
      const horde = td[1].includes('gear__horde') && liens[1] ? entree(liens[1][1], texte(liens[1][2]), texte((srcH || '').replace(/^Horde:\s*/, ''))) : null;
      if (horde) { horde.source = horde.source.replace(/^Horde:\s*/, ''); horde.classic = classic(srcH); Object.assign(horde, { donjon: donjon(horde.source), raid: raid(horde.source), rang: rang(horde.source) }); }
      const r = /Requires level (\d+)/.exec(td[1]);
      lignes.push({ slot, a, h: horde, niveau: r ? Number(r[1]) : null });
    }
    tranches[m[1]] = lignes;
  }
  return tranches;
}

// Timesaver : pré-raid du niveau 60, puis une table tous les 5 niveaux
function lireTs(html) {
  const niveaux = {};
  const lireTable = (t) => {
    const lignes = [];
    for (const tr of t.match(/<tr class="border-t[\s\S]*?<\/tr>/g) || []) {
      const th = /<th[^>]*>([\s\S]*?)<\/th>/.exec(tr);
      if (!th) continue;
      const slot = emplacement(th[1]);
      const tds = [...tr.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
      const cellule = (c) => {
        const l = /item=(\d+)"[^>]*>([^<]+)<\/a>/.exec(c);
        if (!l) return null;
        const s = /<span class="block[^>]*>([\s\S]*?)<\/span><\/span>|<span class="block[^>]*>([\s\S]*?)<\/span>/.exec(c);
        return entree(l[1], texte(l[2]), texte(s ? s[1] || s[2] : ''));
      };
      if (!tds.length) continue;
      const a = cellule(tds[0][2]);
      const h = tds[0][1].includes('colSpan="2"') ? null : cellule((tds[1] || [])[2] || '');
      if (!a && !h) continue;
      lignes.push({ slot, a: a || h, h: tds[0][1].includes('colSpan="2"') ? null : h });
    }
    return lignes;
  };
  const pre = html.match(/pre-raid BiS \(level 60\)[\s\S]*?<table[\s\S]*?<\/table>/);
  if (pre) niveaux.preraid = lireTable(pre[0]);
  for (const d of html.match(/<details[\s\S]*?<\/details>/g) || []) {
    const n = /Level <!-- -->(\d+)/.exec(d);
    if (n) niveaux[n[1]] = lireTable(d);
  }
  return niveaux;
}

// Infobulle Wowhead (Forever, français) → objet au format de combattant.js
const STATS = { 3: 'AGILITY', 4: 'STRENGTH', 5: 'INTELLECT', 6: 'SPIRIT', 7: 'STAMINA' };
// Notes de l'infobulle Wowhead. En JcJ l'adversaire est humanoïde : la puissance « contre les humanoïdes » compte entière.
const NOTES = {
  12: 'DEFENSE_SKILL_RATING', 38: 'ATTACK_POWER', 39: 'RANGED_ATTACK_POWER', 41: 'SPELL_HEALING_DONE', 42: 'SPELL_DAMAGE_DONE',
  43: 'MANA_REGENERATION', 45: 'SPELL_POWER', 46: 'HEALTH_REGEN', 47: 'SPELL_PENETRATION', 48: 'BLOCK_VALUE',
  85: 'FIRE_SPELL_DAMAGE', 86: 'NATURE_SPELL_DAMAGE', 87: 'FROST_SPELL_DAMAGE', 88: 'SHADOW_SPELL_DAMAGE', 89: 'ARCANE_SPELL_DAMAGE',
  125: 'ATTACK_POWER', 133: 'SPELL_DAMAGE_DONE',
};
// Bonus contre d'autres familles (démons, bêtes…) et dégâts d'arme : sans effet en duel
const IGNORES = new Set(['83', '126', '127', '128', '131', '134', '137', '129', '130', '132', '135', '136']);
const QUALITES = ['POOR', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'ARTIFACT', 'HEIRLOOM'];
const TYPES = {
  'Tête': 'HEAD', 'Cou': 'NECK', 'Épaules': 'SHOULDER', 'Épaule': 'SHOULDER', 'Epaule': 'SHOULDER', 'Epaules': 'SHOULDER', 'Dos': 'CLOAK', 'Torse': 'CHEST', 'Robe': 'ROBE',
  'Poignets': 'WRIST', 'Mains': 'HAND', 'Taille': 'WAIST', 'Jambes': 'LEGS', 'Pieds': 'FEET', 'Doigt': 'FINGER',
  'Bijou': 'TRINKET', 'Deux mains': 'TWOHWEAPON', 'Une main': 'WEAPON', 'À une main': 'WEAPON', 'Main droite': 'WEAPONMAINHAND',
  'Main gauche': 'WEAPONOFFHAND', 'Tenu(e) en main gauche': 'HOLDABLE', 'Tenu en main gauche': 'HOLDABLE',
  'À distance': 'RANGED', 'Armes de jet': 'THROWN', 'Arme de jet': 'THROWN', 'Relique': 'RELIC', 'Chemise': 'BODY', 'Tabard': 'TABARD',
};
const inconnus = new Map();
function lireInfobulle(id, d, nomAnglais) {
  const t = d.tooltip || '';
  const nombre = (re) => { const m = re.exec(t); return m ? Number(m[1]) : null; };
  const ty = /<table width="100%"><tr><td>([^<]+)<\/td>(?:<th>([\s\S]*?)<\/th>)?/.exec(t);
  let type = ty ? TYPES[ty[1].trim()] : null;
  const sousType = ty ? texte(ty[2]) || null : null;
  if (ty && !type) inconnus.set(`type ${ty[1]}`, (inconnus.get(`type ${ty[1]}`) || 0) + 1);
  if (type === 'WEAPONOFFHAND' && sousType === 'Bouclier') type = 'SHIELD';
  if (type === 'RANGED' && sousType === 'Baguette') type = 'RANGEDRIGHT';
  const stats = {};
  for (const m of t.matchAll(/<!--stat(\d+)-->([+-]\d+)/g)) {
    const k = STATS[m[1]];
    if (k) stats[k] = (stats[k] || 0) + Number(m[2]);
    else inconnus.set(`stat${m[1]}`, (inconnus.get(`stat${m[1]}`) || 0) + 1);
  }
  for (const m of t.matchAll(/<!--rtg(\d+)-->(\d+)/g)) {
    const k = NOTES[m[1]];
    if (k) stats[k] = (stats[k] || 0) + Number(m[2]);
    else if (!IGNORES.has(m[1])) inconnus.set(`rtg${m[1]}`, (inconnus.get(`rtg${m[1]}`) || 0) + 1);
  }
  // Effets en pourcentage (« Équipé : augmente vos chances de coup critique de 1 % »)
  const pct = {};
  for (const ligne of t.split(/<br\s*\/?>|<\/span>|<\/div>/)) {
    const l = texte(ligne);
    // Seulement « Équipé : augmente vos chances… » (pas « réduit les chances de toucher des silences »)
    if (!/^[ÉE]quip[^:]*:\s*augmente (vos|les) chances/i.test(l)) continue;
    const m = /(\d+(?:[.,]\d+)?)\s?%/.exec(l);
    if (!m) continue;
    const v = Number(m[1].replace(',', '.'));
    const sorts = /sorts/.test(l);
    const k = /critique/.test(l) ? (sorts ? 'critSort' : 'crit') : /toucher/.test(l) ? (sorts ? 'touchSort' : 'toucher')
      : /esquiv/.test(l) ? 'esquive' : /parer/.test(l) ? 'parade' : /bloquer/.test(l) ? 'blocage' : null;
    if (k) pct[k] = (pct[k] || 0) + v;
  }
  const dmg = /<!--dmg-->[^<\d]*(\d+) - (\d+)/.exec(t);
  const vitesse = nombre(/<!--spd-->([\d.]+)/);
  const dps = nombre(/<!--dps-->\(([\d.]+)/);
  const nom = /^\[.*\]$/.test(d.name) ? (nomAnglais || d.name.slice(1, -1)) : d.name;
  return {
    id, nom, qualite: QUALITES[d.quality] || 'COMMON', icone: d.icon || null, type, sousType,
    ilvl: nombre(/<!--ilvl-->(\d+)/), niveauRequis: nombre(/<!--rlvl-->(\d+)/), armure: nombre(/<!--amr-->[^<\d]*(\d+)/) || 0,
    stats, pct: Object.keys(pct).length ? pct : undefined,
    arme: dmg && vitesse ? { min: Number(dmg[1]), max: Number(dmg[2]), vitesse, dps: dps || Math.round((Number(dmg[1]) + Number(dmg[2])) / 2 / vitesse * 10) / 10 } : null,
  };
}

async function parLots(xs, n, f) {
  const res = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const k = i++; res[k] = await f(xs[k], k); } }));
  return res;
}

(async () => {
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(SORTIE, { recursive: true });
  const maj = new Date().toISOString().slice(0, 10);
  for (const [classeEn, classe] of Object.entries(CLASSES)) {
    const specs = {};
    const noms = new Map();
    for (const [specEn, spec] of Object.entries(SPECS[classeEn])) {
      const urlFbg = `https://foreverbattlegrounds.com/gearing/${classeEn}/${specEn}/`;
      const urlTs = `https://timesaver.gg/tools/wow-forever/leveling-gear/${classeEn}/${specEn}`;
      const fbg = await lire(urlFbg, `fbg-${classeEn}-${specEn}.html`);
      const ts = specEn === 'feral-tank' ? null : await lire(urlTs, `ts-${classeEn}-${specEn}.html`);
      specs[spec] = {
        sources: { bis: urlFbg, montee: ts ? urlTs : null },
        tranches: fbg ? lireFbg(fbg) : {},
        montee: ts ? lireTs(ts) : {},
      };
      const s = specs[spec];
      console.log(`${classe}/${spec} : tranches ${Object.keys(s.tranches).join(',')} · montée ${Object.keys(s.montee).join(',')}`);
      for (const l of [...Object.values(s.tranches), ...Object.values(s.montee)].flat()) for (const e of [l.a, l.h]) if (e) noms.set(e.id, e.nom);
    }
    const ids = [...noms.keys()].sort((a, b) => a - b);
    const objets = {};
    await parLots(ids, 3, async (id) => {
      const brut = await lire(`https://nether.wowhead.com/forever/tooltip/item/${id}?locale=2`, `wh-${id}.json`);
      if (!brut) { console.warn(`  objet ${id} (${noms.get(id)}) introuvable sur Wowhead`); return; }
      objets[id] = lireInfobulle(id, JSON.parse(brut), noms.get(id));
    });
    const sortie = { classe, maj, specs, objets };
    fs.writeFileSync(path.join(SORTIE, `${classe}.json`), JSON.stringify(sortie));
    console.log(`→ ${classe}.json : ${Object.keys(specs).length} spés, ${Object.keys(objets).length} objets`);
  }
  if (inconnus.size) console.log('Non reconnus :', [...inconnus].sort((a, b) => b[1] - a[1]).slice(0, 30));
})().catch((e) => { console.error(e); process.exit(1); });
