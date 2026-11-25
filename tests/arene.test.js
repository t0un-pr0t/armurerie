// Lancer avec : npm test
// Arène toutes classes (public/simulateur/js/arene.js) : déterminisme, fin des duels, toutes les classes.
const test = require('node:test');
const assert = require('node:assert');
const A = require('../public/simulateur/js/arene.js');
const { convertirCombattant } = require('../combattant.js');

const goliathe = convertirCombattant({ key: 'eu/goliathe-latasse', region: 'eu' }, require('./fixtures/goliathe-latasse.json'));

test('un joueur type par spécialisation, de toutes les classes', () => {
  const types = A.adversairesTypes(60);
  assert.strictEqual(types.length, A.SPECS_TYPES.length);
  for (const c of Object.keys(A.CLASSES)) assert.ok(types.some((t) => t.classe === c), c);
  for (const t of types) assert.ok(t.stats.pv > 0 && t.stats.arme.max >= t.stats.arme.min, t.nom);
  assert.ok(A.profilType('mage', 'givre', 20).stats.pv < A.profilType('mage', 'givre', 60).stats.pv);
});

test('même graine, même duel', () => {
  const [a, b] = [A.profilType('voleur', 'combat', 40), A.profilType('mage', 'givre', 40)];
  assert.deepStrictEqual(A.duel(a, b, { graine: 5 }), A.duel(a, b, { graine: 5 }));
  assert.deepStrictEqual(A.serie(a, b, 6, 2), A.serie(a, b, 6, 2));
});

test('chaque spécialisation se bat contre chacune, du niveau 10 au 60, sans erreur et avec un vainqueur', () => {
  let nuls = 0, total = 0;
  for (const n of [10, 25, 40, 60]) {
    const types = A.adversairesTypes(n);
    for (const a of types) for (const b of types) {
      const r = A.duel(a, b, { graine: n + total });
      assert.ok(r.duree > 0 && r.duree <= A.DUREE_MAX, `${a.nom} / ${b.nom} niv. ${n}`);
      if (r.vainqueur == null) nuls++;
      total++;
    }
  }
  assert.ok(nuls / total < 0.02, `${nuls} nuls sur ${total}`);
});

test('un vrai personnage affronte toutes les spécialisations de son niveau', () => {
  for (const t of A.adversairesTypes(goliathe.niveau)) {
    const s = A.serie(goliathe, t, 4, 1);
    assert.ok(s.taux >= 0 && s.taux <= 1, t.nom);
  }
});

test('duel raconté : journal, courbe des PV et bilans', () => {
  const r = A.duelRaconte(goliathe, A.profilType('mage', 'givre', 44), 0, 1);
  assert.ok(r.journal.length > 3);
  assert.ok(r.courbe.length >= 2);
  assert.deepStrictEqual(r.courbe[0], [0, 1, 1]);
  assert.strictEqual(r.noms[0], goliathe.nom);
  assert.ok(Object.keys(r.bilans[0].degats).length > 0);
});

test('variante : les stats changent, le profil d\'origine non', () => {
  const v = A.variante(goliathe, { pv: 1.1, critique: 2, arme: 1.1 });
  assert.strictEqual(Math.round(v.stats.pv), Math.round(goliathe.stats.pv * 1.1));
  assert.strictEqual(v.stats.critique, goliathe.stats.critique + 2);
  assert.strictEqual(goliathe.stats.arme.min, 248);
});
