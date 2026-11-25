// Lancer avec : npm test
// Fiche Blizzard d'un personnage de n'importe quelle classe → combattant du simulateur (combattant.js).
const test = require('node:test');
const assert = require('node:assert');
const { convertirCombattant } = require('../combattant.js');

const ohm = convertirCombattant({ key: 'eu/ohm-let', region: 'eu' }, require('./fixtures/ohm-let.json'));
const goliathe = convertirCombattant({ key: 'eu/goliathe-latasse', region: 'eu' }, require('./fixtures/goliathe-latasse.json'));

test('druide farouche : classe, spécialisation et stats de la fiche', () => {
  assert.strictEqual(ohm.cle, 'eu/ohm-let');
  assert.strictEqual(ohm.classe, 'druide');
  assert.strictEqual(ohm.niveau, 36);
  assert.strictEqual(ohm.spec, 'farouche');
  assert.strictEqual(ohm.stats.pv, 1179);
  assert.strictEqual(ohm.stats.pa, 156);
  assert.ok(ohm.talents.length > 0);
});

test('paladin vindicte : arme lue sur la fiche, vitesse déduite du DPS', () => {
  assert.strictEqual(goliathe.classe, 'paladin');
  assert.strictEqual(goliathe.niveau, 44);
  assert.strictEqual(goliathe.spec, 'vindicte');
  assert.strictEqual(goliathe.stats.pv, 1957);
  assert.deepStrictEqual(goliathe.stats.arme, { min: 248, max: 307, vitesse: 3.4 });
});

test('pourcentages arrondis au dixième', () => {
  for (const p of [ohm, goliathe]) for (const k of ['critique', 'esquive', 'parade', 'blocage'])
    assert.strictEqual(p.stats[k], Math.round(p.stats[k] * 10) / 10, `${p.nom} ${k}`);
});
