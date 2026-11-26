// Lancer avec : npm test
// Équipement porté face aux paliers pré-BiS (« horsDonjon ») et BiS (« donjon ») (public/simulateur/js/equipement.js).
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

// ------------------------------------------------------------ listes BiS réelles (data/bis/<classe>.json, outils/bis.js)
const bis = (c) => require(`../public/simulateur/data/bis/${c}.json`);
const { pourcentages } = require('../combattant.js');

test('listes BiS : toutes les classes, toutes les spés, toutes les tranches, chaque objet décrit', () => {
  for (const c of ['guerrier', 'paladin', 'chasseur', 'voleur', 'pretre', 'chaman', 'mage', 'demoniste', 'druide']) {
    const d = bis(c);
    assert.ok(Object.keys(d.specs).length >= 3, c);
    for (const [k, s] of Object.entries(d.specs)) {
      assert.deepStrictEqual(Object.keys(s.tranches).map(Number), E.TRANCHES, `${c}/${k}`);
      for (const lignes of Object.values(s.tranches)) for (const l of lignes) {
        assert.ok(d.objets[l.a.id], `${c}/${k} : objet ${l.a.id} sans fiche`);
        if (l.h) assert.ok(d.objets[l.h.id], `${c}/${k} : objet horde ${l.h.id} sans fiche`);
      }
    }
  }
});

test('choixBis : pré-BiS sans donjon ni haut rang, BiS au moins aussi bon, objets portables au niveau', () => {
  for (const [classe, spec, niveau, faction] of [['druide', 'farouche', 36, 'Alliance'], ['mage', 'givre', 29, 'Horde'], ['guerrier', 'protection', 60, 'Alliance']]) {
    const c = E.choixBis({ classe, spec, niveau, faction }, bis(classe));
    assert.strictEqual(c.tranche, E.TRANCHES.find((t) => t >= niveau));
    assert.strictEqual(c.horde, faction === 'Horde');
    for (const l of c.lignes) {
      if (l.pre) {
        assert.ok(!l.pre.donjon && !l.pre.raid && !(l.pre.rang > 6), `${classe} ${l.emplacement} : pré-BiS de donjon`);
        // (une main gauche du pré-BiS disparaît quand le BiS prend une arme à deux mains)
        if (l.emplacement !== 'offHand') assert.ok(l.bis && l.bis.valeur >= l.pre.valeur - 1e-9, `${classe} ${l.emplacement} : BiS moins bon que le pré-BiS`);
      }
      for (const x of [l.pre, l.bis]) if (x) assert.ok((x.objet.niveauRequis ?? x.objet.ilvl - 4) <= niveau, `${x.objet.nom} trop haut`);
    }
  }
  // Le tank garde son bouclier ; le mage ne porte pas de main gauche à côté d'un bâton
  const prot = E.choixBis({ classe: 'guerrier', spec: 'protection', niveau: 60 }, bis('guerrier'));
  assert.strictEqual(prot.lignes.find((l) => l.emplacement === 'offHand').bis.objet.sousType, 'Bouclier');
});

test('profilObjets : le druide rééquipé change de stats, le profil d\'origine est intact', () => {
  const avant = JSON.stringify(ohm);
  const c = E.choixBis(ohm, bis('druide'));
  const a = E.analyserBis(ohm, c);
  assert.ok(a.reel && a.horsDonjon > 0 && a.horsDonjon < 1, 'le porté vaut moins que le pré-BiS');
  const pre = E.profilObjets(ohm, c, 'horsDonjon');
  const bi = E.profilObjets(ohm, c, 'donjon');
  assert.strictEqual(JSON.stringify(ohm), avant);
  assert.ok(pre.stats.pv > ohm.stats.pv && bi.stats.agilite > ohm.stats.agilite);
  assert.notStrictEqual(pre.cle, ohm.cle);
  // Un objet « +18 puissance d'attaque » compte pour un combattant physique
  assert.ok(E.valeurObjet({ stats: { ATTACK_POWER: 18 } }, ohm) > 5);
});

test('pourcentages : seules les phrases « augmente vos chances » comptent', () => {
  assert.deepStrictEqual(pourcentages(['Équipé : augmente vos chances d\'infliger un coup critique de 1 %.']), { crit: 1 });
  assert.strictEqual(pourcentages(['Équipé : réduit les chances de toucher des effets de silence de 4 %.']), undefined);
});
