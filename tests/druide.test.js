// Lancer avec : npm test
// Conversion d'une fiche de l'armurerie Blizzard (tests/fixtures/ohm-let.json) pour le simulateur.
const test = require('node:test');
const assert = require('node:assert');
const D = require('../public/simulateur/js/donnees.js');
const M = require('../public/simulateur/js/moteur.js');
const I = require('../public/simulateur/js/icones.js');
const { convertirDruide, idTalent, convertirTalents } = require('../druide.js');

const brut = require('./fixtures/ohm-let.json');
const p = convertirDruide({ key: 'eu/ohm-let', region: 'eu', armoryUrl: 'https://exemple/ohm-let' }, brut);

test('fiche complète au format du simulateur', () => {
  for (const champ of ['cle', 'nom', 'niveau', 'fiche', 'stats', 'base', 'talents', 'talentsJeu', 'equipement'])
    assert.ok(p[champ] !== undefined, champ);
  assert.strictEqual(p.cle, 'eu/ohm-let');
  assert.strictEqual(p.niveau, brut.level);
  assert.ok(p.equipement.length > 0);
  assert.ok(/^https:\/\//.test(p.portrait), 'portrait Blizzard');
});

test('talents dans le plafond du niveau (niveau − 9)', () => {
  const v = M.verifierTalents(p.talents, Math.max(0, p.niveau - 9));
  assert.ok(v.ok, v.erreurs.join(' ; '));
});

test('la conversion retombe sur la fiche hors forme', () => {
  const pr = M.calculerDruide(p.stats, p.talents, { niveau: p.niveau, base: p.base });
  assert.strictEqual(pr.pv.humanoide, p.fiche.pv, 'PV');
  assert.ok(Math.abs(pr.manaMax - p.fiche.mana) <= 1, `mana ${pr.manaMax} / ${p.fiche.mana}`);
  assert.strictEqual(pr.armure.humanoide, p.fiche.armure, 'armure');
  assert.ok(Math.abs(pr.esquive.humanoide - p.fiche.esquive) <= 0.01, 'esquive');
});

test('noms de talents du jeu reconnus, accents, ligatures et alias compris', () => {
  assert.strictEqual(idTalent('Cœur de fauve'), 'coeurSauvage');
  assert.strictEqual(idTalent('Griffes aiguisées'), 'griffesAcerees');
  assert.strictEqual(idTalent('Lacérer'), 'laceration');
  assert.strictEqual(idTalent('Talent inconnu'), null);
  const { points } = convertirTalents([{ id: 'feral-combat', talents: [{ name: 'Férocité', rank: 5 }, { name: 'Lacérer', rank: 1 }] }]);
  assert.deepStrictEqual(points, { ferocite: 5, laceration: 1 });
});

test('duels au niveau du druide : sorts appris seulement, icônes connues', () => {
  const noms = new Set();
  for (const adv of Object.keys(D.ADVERSAIRES)) for (const spec of D.ADVERSAIRES[adv].specs) for (const forme of ['ours', 'felin']) {
    const d = M.simuler({
      stats: p.stats, base: p.base, niveau: p.niveau, talents: p.talents, adversaire: adv, specAdv: spec.id, forme, graine: 3,
      ouverture: 'auto', methodeSoin: 'auto', seuilSoin: 40, powershift: true, distance: 25, equipAdv: 'bleu'
    }, { journal: true });
    assert.ok(['druide', 'adv', 'nul'].includes(d.gagnant));
    for (const a of d.actions) noms.add(a.nom);
    for (const c of d.coups) noms.add(c.nom);
  }
  const n = M.niveauDe(p.niveau);
  assert.deepStrictEqual(Object.entries(D.SORTS).filter(([, s]) => s.niveau > n && noms.has(s.nom)).map(([id]) => id), []);
  assert.deepStrictEqual([...noms].filter(x => !/^Coup blanc/.test(x) && !I.sort(x)).sort(), []);
});
