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

test('scénarios : mêmes duels que la série, chaque issue rejouée à l\'identique', () => {
  const [a, b] = [A.profilType('guerrier', 'armes', 60), A.profilType('voleur', 'combat', 60)];
  const sc = A.scenarios(a, b, 20, 11);
  const s = A.serie(a, b, 20, 11);
  assert.strictEqual(sc.reduce((t, x) => t + x.n, 0), 20);
  assert.strictEqual((sc.find((x) => x.issue === 'victoire') || { n: 0 }).n / 20, s.taux);
  for (let i = 1; i < sc.length; i++) assert.ok(sc[i - 1].n >= sc[i].n);
  for (const x of sc) {
    const r = A.rejouer(a, b, x);
    const issue = r.vainqueur == null ? 'nul' : r.vainqueur === r.moi ? 'victoire' : 'defaite';
    assert.strictEqual(issue, x.issue);
    assert.strictEqual(r.duree, x.representant.duree);
    assert.deepStrictEqual(A.rejouer(a, b, x).coups, r.coups);
  }
});

test('cinématique : une image par pas de 0,1 s, sorts lancés et coups enregistrés', () => {
  for (const [c1, s1, c2, s2] of [['druide', 'farouche', 'chasseur', 'maitrise'], ['mage', 'givre', 'demoniste', 'affliction']]) {
    const [a, b] = [A.profilType(c1, s1, 60), A.profilType(c2, s2, 60)];
    const r = A.rejouer(a, b, A.scenarios(a, b, 4, 3)[0]);
    assert.ok(Math.abs(r.images.length - (Math.round(r.duree * 10) + 1)) <= 1, `${r.images.length} images pour ${r.duree} s`);
    for (const im of r.images) {
      assert.strictEqual(im.c.length, 2);
      for (const c of im.c) assert.ok(c.pv >= 0 && c.pv <= c.pvMax && c.r >= 0 && c.r <= 1 && Number.isFinite(c.x));
    }
    for (const k of [0, 1]) assert.ok(r.actions.some((x) => x.camp === k), `${c1}/${c2} : sorts du camp ${k}`);
    assert.ok(r.coups.length > 0);
    for (const liste of [r.actions, r.coups]) for (let i = 1; i < liste.length; i++) assert.ok(liste[i].t >= liste[i - 1].t);
    assert.strictEqual(r.familiers.length, 2);
  }
});

test('chaque icône citée par le moteur existe dans icones/', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dossier = path.join(__dirname, '../public/simulateur/icones');
  const source = fs.readFileSync(require.resolve('../public/simulateur/js/arene.js'), 'utf8');
  const noms = new Set([...source.matchAll(/icone:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]));
  assert.ok(noms.size > 50, `${noms.size} icônes trouvées`);
  const manquantes = [...noms].filter((n) => !fs.existsSync(path.join(dossier, n + '.jpg')));
  assert.deepStrictEqual(manquantes, []);
});

test('enchaînement : le relevé ne change pas la série, et les étapes viennent des victoires', () => {
  const [a, b] = [A.profilType('voleur', 'combat', 60), A.profilType('mage', 'givre', 60)];
  const s = A.serie(a, b, 20, 11);
  const r = A.serie(a, b, 20, 11, { enchainement: true });
  assert.strictEqual(r.taux, s.taux);
  const e = r.enchainement;
  assert.strictEqual(e.base, r.taux > 0 ? 'victoire' : 'serre');
  assert.ok(e.etapes.length >= 1 && e.etapes.length <= 8);
  assert.ok(e.appui >= 1 && e.appui <= e.groupe && e.ouvrent >= e.appui && e.ouvrent <= e.n);
  for (let i = 1; i < e.etapes.length; i++) assert.notStrictEqual(e.etapes[i].nom, e.etapes[i - 1].nom, 'répétitions regroupées');
  for (const x of e.etapes) assert.ok(x.fois >= 1 && x.t >= 0);
  // Sans victoire possible, on garde les duels les plus serrés
  const faible = A.profilType('mage', 'givre', 20);
  const f = A.serie(faible, A.profilType('guerrier', 'armes', 60), 6, 3, { enchainement: true }).enchainement;
  assert.strictEqual(f.base, 'serre');
  assert.strictEqual(f.groupe, 2);
});

test('druide : un duel sur deux commence sans camouflage, chaque ouverture a son enchaînement', () => {
  const d = A.profilType('druide', 'farouche', 60), m = A.profilType('mage', 'givre', 60);
  const r = A.serie(d, m, 20, 11, { enchainement: true });
  assert.deepStrictEqual(r.ouvertures.map((o) => [o.ouverture, o.n]), [['camouflage', 10], ['combat', 10]]);
  assert.ok(Math.abs((r.ouvertures[0].taux + r.ouvertures[1].taux) / 2 - r.taux) < 1e-9);
  assert.strictEqual(r.ouvertures[0].etapes[0].nom, 'Bond');
  assert.notStrictEqual(r.ouvertures[1].etapes[0].nom, 'Bond');
  // À découvert : pas de Camouflage, mais déjà en félin
  const a = A.duel(d, m, { graine: 4, camouflage: false, journal: true });
  assert.strictEqual(a.ouvertures[0], 'combat');
  assert.strictEqual(a.images[0].c[0].forme, 'felin');
  assert.strictEqual(a.images[0].c[0].furtif, false);
  assert.strictEqual(A.duel(d, m, { graine: 4, journal: true }).images[0].c[0].furtif, true);
  // Les autres classes ne changent pas
  assert.strictEqual(A.serie(A.profilType('voleur', 'combat', 60), m, 4, 1, { enchainement: true }).ouvertures, undefined);
});
