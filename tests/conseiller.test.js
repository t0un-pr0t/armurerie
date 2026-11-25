// Lancer avec : node --test tests/*.test.js
// Conseiller : talents ramenés au plafond, recherche déterministe, points faibles de l'équipement.
const test = require('node:test');
const assert = require('node:assert');
const D = require('../public/simulateur/js/donnees.js');
const M = require('../public/simulateur/js/moteur.js');
const { convertirDruide } = require('../druide.js');
const C = require('../public/simulateur/js/conseiller.js');

const ohm = convertirDruide({ key: 'eu/ohm-let', region: 'eu' }, require('./fixtures/ohm-let.json'));
const plafond = M.niveauDe(ohm.niveau) - 9;
const base = {
  stats: ohm.stats, base: ohm.base, niveau: ohm.niveau, talents: ohm.talents,
  adversaire: 'voleur', specAdv: 'finesse', forme: 'felin', graine: 1,
  ouverture: 'auto', methodeSoin: 'auto', seuilSoin: 40, powershift: true, distance: 25, equipAdv: 'bleu'
};
const petit = { talents: ohm.talents, plafond, nCrible: 10, nConfirme: 10, nStats: 10, maxEssais: 2 };

test('tronquer ramène chaque préréglage à un build valide du plafond', () => {
  for (const pr of D.PRESETS_TALENTS) {
    const t = C.tronquer(pr.points, plafond);
    const v = M.verifierTalents(t, plafond);
    assert.ok(v.ok, `${pr.id} : ${v.erreurs.join(' ; ')}`);
    assert.strictEqual(v.total, plafond, pr.id);
  }
});

test('completer garde un build valide', () => {
  const t = C.completer({}, D.PRESETS_TALENTS[0].points, plafond);
  const v = M.verifierTalents(t, plafond);
  assert.ok(v.ok, v.erreurs.join(' ; '));
  assert.strictEqual(v.total, plafond);
});

test('le conseiller est déterministe et propose un build valide', () => {
  const a = C.conseillerSync(base, petit), b = C.conseillerSync(base, petit);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.ok(M.verifierTalents(a.meilleur.points, plafond).ok);
  assert.ok(['ours', 'felin'].includes(a.meilleur.forme));
  assert.ok(a.meilleur.note >= a.actuel.note);
  assert.strictEqual(a.stats.length, Object.keys(C.DOSES).length);
});

test('points faibles de l\'équipement importé', () => {
  const pf = C.pointsFaibles(ohm);
  assert.ok(Array.isArray(pf.faibles) && Array.isArray(pf.sansEnchant) && Array.isArray(pf.vides));
  for (const o of pf.faibles) assert.ok(o.raisons.length > 0, o.emplacement);
});

test('héritage : chaque entrée a un effet et une source est citée', () => {
  for (const h of C.HERITAGE) assert.ok(h.nom && h.effet && h.utile && h.rangs > 0, h.nom);
  assert.ok(C.SOURCES_HERITAGE.every(s => /^https:\/\//.test(s.url)));
});
