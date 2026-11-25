// Lancer avec : node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../public/simulateur/js/donnees.js');
const M = require('../public/simulateur/js/moteur.js');
const I = require('../public/simulateur/js/icones.js');

const racine = path.join(__dirname, '..', 'public', 'simulateur');
const existe = chemin => fs.existsSync(path.join(racine, chemin));
const stats = D.PRESETS_EQUIPEMENT.find(p => p.id === 'pvp').stats;

test('chaque icône déclarée est présente dans icones/', () => {
  const manquantes = I.tous().filter(f => !existe('icones/' + f + '.jpg'));
  assert.deepStrictEqual(manquantes, [], 'lancer node outils/icones.js');
});

test('chaque sort joué ou subi pendant un duel a une icône', () => {
  const ouvertures = ['auto', 'rodeurTraquer', 'rodeurRavager', 'chargeFarouche', 'direct'];
  const soins = ['auto', 'rapidite', 'sonner', 'sarments', 'regen', 'aucun'];
  const noms = new Set();
  for (const adv of Object.keys(D.ADVERSAIRES)) for (const spec of D.ADVERSAIRES[adv].specs) for (const forme of ['ours', 'felin'])
    D.PRESETS_TALENTS.forEach((tal, it) => { for (let g = 1; g <= 3; g++) {
      const d = M.simuler({
        stats, talents: tal.points, adversaire: adv, specAdv: spec.id, forme, graine: g,
        ouverture: ouvertures[(g + it) % 5], methodeSoin: soins[g * 2 % 6], seuilSoin: 40,
        powershift: g % 2 === 0, distance: 25, equipAdv: g === 3 ? 'epique' : 'bleu'
      }, { journal: true });
      for (const a of d.actions) noms.add(a.nom);
      for (const c of d.coups) noms.add(c.nom);
      for (const im of d.images) { if (im.incD) noms.add(im.incD.nom); if (im.incA) noms.add(im.incA.nom); }
    } });
  const sansIcone = [...noms].filter(n => !/^Coup blanc/.test(n) && !I.sort(n)).sort();
  assert.deepStrictEqual(sansIcone, [], 'ajouter ces noms à js/icones.js');
});

test('classes, formes et familiers ont une icône', () => {
  for (const adv of Object.keys(D.ADVERSAIRES)) assert.ok(I.classe(adv), adv);
  for (const f of ['ours', 'felin', 'humanoide']) assert.ok(I.forme(f), f);
  assert.ok(I.familier('chasseur') && I.familier('demoniste'));
});
