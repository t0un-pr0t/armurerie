// Lancer avec : node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const D = require('../public/simulateur/js/donnees.js');
const M = require('../public/simulateur/js/moteur.js');

const stats = D.PRESETS_EQUIPEMENT.find(p => p.id === 'pvp').stats;
const talents = D.PRESETS_TALENTS[0].points;
const base = {
  stats, talents, forme: 'auto', ouverture: 'auto', seuilSoin: 40, methodeSoin: 'auto',
  powershift: true, distance: 25, equipAdv: 'bleu'
};

test('les préréglages de talents sont valides', () => {
  for (const p of D.PRESETS_TALENTS) {
    const v = M.verifierTalents(p.points);
    assert.ok(v.ok, `${p.nom} : ${v.erreurs.join(', ')}`);
    assert.strictEqual(v.total, 51, `${p.nom} dépense ${v.total} points`);
  }
});

test('la vérification refuse un palier non débloqué et un prérequis manquant', () => {
  assert.strictEqual(M.verifierTalents({ chefMeute: 1 }).ok, false);
  assert.strictEqual(M.verifierTalents({ ferocite: 6 }).ok, false);
  // Morsure primitive demande Chef de la meute, même avec 30 points avant
  const sansChef = Object.assign({}, D.PRESETS_TALENTS.find(p => p.id === 'oursMorsure').points, { chefMeute: 0, peauEpaisse: 3, reactionNaturelle: 2 });
  assert.strictEqual(M.verifierTalents(sansChef).ok, false);
});

test('les talents référencés par le moteur existent', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../public/simulateur/js/moteur.js'), 'utf8');
  const ids = new Set([...source.matchAll(/\brang\(s, '(\w+)'\)|\br\('(\w+)'\)/g)].map(m => m[1] || m[2]));
  assert.ok(ids.size > 20, `${ids.size} talents trouvés`);
  for (const id of ids) assert.ok(M.TALENTS[id], id);
  for (const id of ['armesNaturelles', 'empriseAmelioree', 'luciolesFarouches', 'augureClarte', 'emprise']) assert.ok(!M.TALENTS[id], `${id} n'est plus un talent dans Forever`);
});

test('Forever : Fureur garde l\'énergie et Puissance changeante en rend', () => {
  const r = M.simuler(Object.assign({}, base, { adversaire: 'guerrier', forme: 'felin' }), { journal: true });
  assert.ok(r.res.powershifts > 0, 'Puissance changeante jamais utilisée');
  assert.ok(!r.journal.some(l => /Transformation rapide/.test(l.texte)));
  const sansTalent = M.simuler(Object.assign({}, base, { adversaire: 'guerrier', forme: 'felin', talents: D.PRESETS_TALENTS.find(p => p.id === 'ferocheRapidite').points }));
  assert.strictEqual(sansTalent.res.powershifts, 0);
});

test('profil du druide : l\'ours a plus de PV et d\'armure', () => {
  const p = M.calculerDruide(stats, talents);
  assert.ok(p.pv.ours > p.pv.felin);
  assert.ok(p.armure.ours > 3 * p.armure.felin);
  assert.ok(p.coutForme > 0 && p.coutForme < p.manaMax);
  assert.ok(M.reductionArmure(1e6) <= 0.75);
});

test('un duel est déterministe pour une graine donnée', () => {
  const c = Object.assign({}, base, { adversaire: 'mage', graine: 42 });
  const a = M.simuler(c), b = M.simuler(c);
  assert.strictEqual(a.gagnant, b.gagnant);
  assert.strictEqual(a.duree, b.duree);
});

for (const adversaire of Object.keys(D.ADVERSAIRES)) {
  for (const forme of ['ours', 'felin']) {
    test(`duel ${forme} contre ${adversaire} : se termine et produit un journal`, () => {
      const r = M.simuler(Object.assign({}, base, { adversaire, forme, graine: 7 }), { journal: true });
      assert.ok(['druide', 'adv', 'nul'].includes(r.gagnant));
      assert.ok(r.duree > 0 && r.duree <= 180.1);
      assert.ok(r.journal.length > 5);
      assert.ok(r.images.length > 20);
      assert.ok(r.res.degatsInfliges > 0, 'le druide doit infliger des dégâts');
      assert.ok(r.res.degatsSubis > 0, 'l\'adversaire doit infliger des dégâts');
      for (const im of r.images) assert.ok(im.pvD >= 0 && im.pvD <= im.pvMaxD && im.pvA >= 0 && im.pvA <= im.pvMaxA);
    });
  }
}

test('les séries donnent des taux cohérents', () => {
  for (const adversaire of Object.keys(D.ADVERSAIRES)) {
    const r = M.simulerSerie(Object.assign({}, base, { adversaire }), 30);
    const somme = r.tauxVictoire + r.tauxDefaite + r.tauxNul;
    assert.ok(Math.abs(somme - 1) < 1e-9);
  }
});

test('toutes les méthodes de soin et ouvertures fonctionnent', () => {
  for (const methodeSoin of ['auto', 'sonner', 'sarments', 'rapidite', 'regen', 'aucun']) {
    for (const ouverture of ['auto', 'rodeurTraquer', 'rodeurRavager', 'chargeFarouche', 'direct']) {
      const r = M.simuler(Object.assign({}, base, { adversaire: 'guerrier', methodeSoin, ouverture, graine: 3 }));
      assert.ok(r.duree > 0);
    }
  }
});

test('sans soins, le druide ne se soigne pas', () => {
  const r = M.simuler(Object.assign({}, base, { adversaire: 'guerrier', methodeSoin: 'aucun', graine: 5 }));
  assert.strictEqual(r.res.soins, 0);
});

// ------------------------------------------------ spécialisations adverses
test('chaque classe adverse a au moins une spécialisation complète', () => {
  const G = require('../public/simulateur/js/guide.js');
  for (const [classe, a] of Object.entries(D.ADVERSAIRES)) {
    assert.ok(a.specs && a.specs.length >= 1, classe);
    const ids = new Set();
    for (const sp of a.specs) {
      assert.ok(sp.id && sp.nom && sp.meta && sp.resume, `${classe}.${sp.id}`);
      assert.ok(!ids.has(sp.id), `identifiant en double : ${classe}.${sp.id}`);
      ids.add(sp.id);
      assert.ok(G.CONSEILS_SPECS[classe][sp.id], `conseil manquant : ${classe}.${sp.id}`);
    }
  }
});

test('une spécialisation inconnue ou absente retombe sur la première', () => {
  assert.strictEqual(M.specAdversaire('voleur').id, 'finesse');
  assert.strictEqual(M.specAdversaire('voleur', 'inconnue').id, 'finesse');
  assert.strictEqual(M.specAdversaire('voleur', 'combat').id, 'combat');
  const a = M.simuler(Object.assign({}, base, { adversaire: 'voleur', graine: 3 }));
  const b = M.simuler(Object.assign({}, base, { adversaire: 'voleur', specAdv: 'finesse', graine: 3 }));
  assert.strictEqual(a.duree, b.duree);
});

for (const [adversaire, a] of Object.entries(D.ADVERSAIRES)) {
  for (const sp of a.specs) {
    test(`spécialisation ${adversaire} ${sp.id} : le duel se joue`, () => {
      const r = M.simuler(Object.assign({}, base, { adversaire, specAdv: sp.id, forme: 'felin', graine: 11 }), { journal: true });
      assert.ok(['druide', 'adv', 'nul'].includes(r.gagnant));
      assert.ok(r.res.degatsInfliges > 0 && r.res.degatsSubis > 0);
      assert.ok(r.journal[0].texte.includes(sp.nom), 'le journal nomme la spécialisation');
      const pvAttendus = Math.round((sp.mods.pv || a.pv));
      assert.strictEqual(r.pvMaxAdv, pvAttendus);
    });
  }
}

test('les capacités propres aux spécialisations apparaissent dans les duels', () => {
  const cherche = (adversaire, specAdv, texte) => {
    for (const forme of ['felin', 'ours']) for (let g = 1; g <= 30; g++) {
      const r = M.simuler(Object.assign({}, base, { adversaire, specAdv, forme, graine: g }), { journal: true });
      if (r.journal.some(j => j.texte.includes(texte))) return true;
    }
    return false;
  };
  assert.ok(cherche('paladin', 'sacre', 'Rempart du templier'));
  assert.ok(!cherche('paladin', 'sacre', 'Repentir'));
  assert.ok(cherche('mage', 'arcane', 'Pouvoir des arcanes'));
  assert.ok(cherche('voleur', 'combat', 'silence 2 s'));
  assert.ok(!cherche('mage', 'arcane', 'Barrière de glace'));
  assert.ok(cherche('chasseur', 'betes', 'Intimidation'));
  assert.ok(cherche('voleur', 'finesse', 'Préméditation'));
  assert.ok(cherche('demoniste', 'demonologie', 'Lien spirituel') || cherche('demoniste', 'demonologie', 'Chasseur corrompu'));
  assert.ok(!cherche('demoniste', 'demonologie', 'Malédiction de fatigue'));
});

test('cinématique : chaque camp enregistre ses sorts et techniques', () => {
  for (const adversaire of Object.keys(D.ADVERSAIRES)) {
    const r = M.simuler(Object.assign({}, base, { adversaire, forme: 'ours', graine: 3 }), { journal: true });
    const druide = r.actions.filter(a => a.camp === 'druide');
    const adv = r.actions.filter(a => a.camp === 'adv');
    assert.ok(druide.length > 0, `${adversaire} : actions du druide`);
    assert.ok(adv.length > 0, `${adversaire} : actions de l'adversaire`);
    const noms = new Set(Object.values(D.SORTS).map(s => s.nom));
    for (const a of druide) assert.ok(noms.has(a.nom), `${a.nom} est un sort du druide`);
    for (let i = 1; i < r.actions.length; i++) assert.ok(r.actions[i].t >= r.actions[i - 1].t, 'actions dans l\'ordre');
    assert.ok(r.coups.length > 0 && r.coups.every(c => c.cible === 'druide' || c.cible === 'adv'));
    // une image par pas de 0,1 s, la dernière à la fin du duel
    assert.ok(Math.abs(r.images[r.images.length - 1].t - Math.round(r.duree * 10) / 10) < 0.11);
  }
  // sans journal, rien n'est enregistré mais les compteurs restent tenus
  const s = M.simuler(Object.assign({}, base, { adversaire: 'mage', graine: 3 }));
  assert.strictEqual(s.actions.length, 0);
  assert.ok(Object.keys(s.res.utilisations.adv).length > 0);
});

test('scénarios : groupes triés, représentant rejouable à l\'identique', () => {
  const cfg = Object.assign({}, base, { adversaire: 'voleur', forme: 'felin', graine: 4 });
  const serie = M.simulerSerie(cfg, 40);
  assert.strictEqual(serie.resumes.length, 40);
  const sc = M.scenarios(serie.resumes);
  assert.strictEqual(sc.reduce((s, x) => s + x.n, 0), 40);
  for (let i = 1; i < sc.length; i++) assert.ok(sc[i - 1].n >= sc[i].n);
  for (const x of sc) {
    assert.strictEqual(x.cle, x.representant.gagnant + '|' + (x.representant.plan || ''));
    const r = M.simuler(Object.assign({}, cfg, { graine: x.representant.graine }), { journal: true });
    assert.strictEqual(r.gagnant, x.representant.gagnant);
    assert.strictEqual(r.duree, x.representant.duree);
    assert.strictEqual(M.planPrincipal(r.res), x.representant.plan);
  }
});
