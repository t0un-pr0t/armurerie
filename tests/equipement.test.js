// Lancer avec : npm test
// Équipement porté face aux paliers « hors donjon » et « donjon épique » (public/simulateur/js/equipement.js).
const test = require('node:test');
const assert = require('node:assert');
const { convertirCombattant } = require('../combattant.js');
const E = require('../public/simulateur/js/equipement.js');

const ohm = convertirCombattant({ key: 'eu/ohm-let', region: 'eu' }, require('./fixtures/ohm-let.json'));
const goliathe = convertirCombattant({ key: 'eu/goliathe-latasse', region: 'eu' }, require('./fixtures/goliathe-latasse.json'));

test('niveau d\'objet estimé par le budget de stats', () => {
  // Torse vert : Force 13, Endurance 13 → budget ≈ 20,6 → niveau d'objet ≈ 45
  const o = { type: 'CHEST', qualite: 'UNCOMMON', stats: { STRENGTH: 13, STAMINA: 13 } };
  assert.ok(Math.abs(E.budget(o.stats) - 20.6) < 0.1);
  assert.ok(Math.abs(E.niveauObjet(o, 44) - 45) <= 1);
  // Une arme sans stats est estimée par son DPS
  const arme = { type: 'TWOHWEAPON', qualite: 'RARE', stats: {}, arme: { dps: 33 } };
  assert.ok(E.niveauObjet(arme, 44) > 35);
});

test('« porté » renvoie le profil tel quel', () => {
  assert.strictEqual(E.profilPalier(goliathe, 'porte'), goliathe);
});

test('les paliers ne touchent pas au profil d\'origine et vont du porté au donjon', () => {
  for (const p of [goliathe, ohm]) {
    const avant = JSON.stringify(p);
    const h = E.profilPalier(p, 'horsDonjon'), d = E.profilPalier(p, 'donjon');
    assert.strictEqual(JSON.stringify(p), avant);
    assert.notStrictEqual(h.cle, p.cle);
    assert.ok(h.stats.pv > p.stats.pv && d.stats.pv > h.stats.pv, `${p.nom} PV`);
    assert.ok(d.stats.pa > h.stats.pa, `${p.nom} PA`);
    assert.ok(d.stats.armure > h.stats.armure, `${p.nom} armure`);
  }
});

test('analyse objet par objet', () => {
  const a = E.analyser(goliathe);
  assert.ok(a.lignes.length >= 13);
  assert.ok(a.horsDonjon > 0.3 && a.horsDonjon < 1.3);
  assert.ok(a.donjon < a.horsDonjon);
  // Bijoux et reliques ne sont pas comptés
  assert.ok(!a.lignes.some((l) => l.type === 'TRINKET' || l.type === 'RELIC'));
  // La canne à pêche d'Ohm Let est loin du palier
  const canne = E.analyser(ohm).lignes.find((l) => l.emplacement === 'weapon');
  assert.ok(canne.horsDonjon < 0.2 && canne.dpsHorsDonjon > canne.dps);
});

test('sans équipement lu, pas d\'analyse ni de palier', () => {
  const p = { ...goliathe, equipement: undefined };
  assert.strictEqual(E.analyser(p), null);
  assert.strictEqual(E.profilPalier(p, 'donjon'), null);
});
