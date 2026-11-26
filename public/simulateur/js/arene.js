/*
 * Arène : duel entre deux personnages de n'importe quelle classe, à partir de leur fiche d'armurerie
 * (ou d'un « joueur type » de la classe au même niveau). Modèle volontairement simple : une ligne,
 * un pas de 0,1 s, une liste de priorités par classe, les sorts appris selon le niveau et les talents.
 * Utilisable dans le navigateur (window.Arene) et dans Node (require).
 */
(function (racine) {
  'use strict';

  const PAS = 0.1;
  const DUREE_MAX = 150;
  const MELEE = 5;
  const BORNES = [-45, 65];

  // ------------------------------------------------------------ outils
  function creerAlea(graine) {
    let a = (graine >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const borne = (x, a, b) => Math.max(a, Math.min(b, x));
  // Valeurs fixes calées au niveau 60, ramenées au niveau du personnage
  const ech = (n, x) => Math.pow(borne(n, 8, 60) / 60, x || 1.7);
  const sansAccent = (s) => String(s || '').replace(/œ/gi, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
  const facteurRage = (n) => 0.0091107836 * n * n + 3.225598133 * n + 4.2652911;

  // ------------------------------------------------------------ classes
  const CLASSES = {
    guerrier: { nom: 'Guerrier', icone: 'classicon_warrior', ressource: 'rage', melee: true, couleur: '#c69b6d' },
    paladin: { nom: 'Paladin', icone: 'classicon_paladin', ressource: 'mana', melee: true, couleur: '#f48cba' },
    chasseur: { nom: 'Chasseur', icone: 'classicon_hunter', ressource: 'mana', melee: false, distance: [10, 30], couleur: '#aad372' },
    voleur: { nom: 'Voleur', icone: 'classicon_rogue', ressource: 'energie', melee: true, couleur: '#fff468' },
    pretre: { nom: 'Prêtre', icone: 'classicon_priest', ressource: 'mana', melee: false, distance: [12, 28], couleur: '#d8d8d8' },
    chaman: { nom: 'Chaman', icone: 'classicon_shaman', ressource: 'mana', melee: true, couleur: '#0070dd' },
    mage: { nom: 'Mage', icone: 'classicon_mage', ressource: 'mana', melee: false, distance: [14, 28], couleur: '#3fc7eb' },
    demoniste: { nom: 'Démoniste', icone: 'classicon_warlock', ressource: 'mana', melee: false, distance: [14, 28], couleur: '#8788ee' },
    druide: { nom: 'Druide', icone: 'classicon_druid', ressource: 'mana', melee: false, distance: [12, 28], couleur: '#ff7c0a' },
  };

  // Joueur type au niveau 60 (équipement de donjon), ramené au niveau voulu par profilType
  const TYPES = {
    guerrier: { pv: 4500, mana: 0, armure: 5000, pa: 950, force: 280, agilite: 110, intelligence: 40, crit: 14, esquive: 6, parade: 6, blocage: 0, ps: 0, regen: 0, arme: [260, 340, 3.5] },
    paladin: { pv: 4100, mana: 4000, armure: 4800, pa: 850, force: 250, agilite: 90, intelligence: 180, crit: 12, esquive: 5, parade: 5, blocage: 0, ps: 120, regen: 150, arme: [250, 330, 3.5] },
    chasseur: { pv: 3900, mana: 3800, armure: 2800, pa: 550, force: 90, agilite: 330, intelligence: 140, crit: 15, esquive: 9, parade: 4, blocage: 0, ps: 0, regen: 120, arme: [110, 160, 2.7], distance: [120, 180, 3.0] },
    voleur: { pv: 3600, mana: 0, armure: 2200, pa: 900, force: 120, agilite: 300, intelligence: 40, crit: 22, esquive: 12, parade: 6, blocage: 0, ps: 0, regen: 0, arme: [150, 220, 2.6] },
    pretre: { pv: 3300, mana: 5500, armure: 1200, pa: 100, force: 40, agilite: 50, intelligence: 280, crit: 4, esquive: 3, parade: 0, blocage: 0, ps: 320, regen: 220, arme: [80, 120, 2.8] },
    chaman: { pv: 4000, mana: 4200, armure: 3600, pa: 800, force: 220, agilite: 100, intelligence: 180, crit: 12, esquive: 5, parade: 5, blocage: 0, ps: 200, regen: 160, arme: [240, 330, 3.6] },
    mage: { pv: 3500, mana: 6000, armure: 1100, pa: 60, force: 35, agilite: 45, intelligence: 300, crit: 4, esquive: 3, parade: 0, blocage: 0, ps: 430, regen: 180, arme: [80, 120, 2.8] },
    demoniste: { pv: 3600, mana: 5500, armure: 1500, pa: 60, force: 45, agilite: 50, intelligence: 260, crit: 4, esquive: 3, parade: 0, blocage: 0, ps: 360, regen: 170, arme: [80, 120, 2.8] },
    druide: { pv: 4300, mana: 4200, armure: 2600, pa: 520, force: 120, agilite: 160, intelligence: 200, crit: 14, esquive: 12, parade: 0, blocage: 0, ps: 220, regen: 180, arme: [90, 130, 2.8] },
  };

  // Spécialisations jouées en duel (adversaires types)
  const SPECS_TYPES = [
    { classe: 'guerrier', spec: 'armes', nom: 'Armes' },
    { classe: 'paladin', spec: 'vindicte', nom: 'Vindicte' },
    { classe: 'paladin', spec: 'sacre', nom: 'Sacré', mods: { pa: 0.6, ps: 1.8, mana: 1.2 } },
    { classe: 'chasseur', spec: 'precision', nom: 'Précision' },
    { classe: 'chasseur', spec: 'survie', nom: 'Survie' },
    { classe: 'voleur', spec: 'combat', nom: 'Combat' },
    { classe: 'voleur', spec: 'finesse', nom: 'Finesse' },
    { classe: 'pretre', spec: 'ombre', nom: 'Ombre' },
    { classe: 'pretre', spec: 'discipline', nom: 'Discipline' },
    { classe: 'chaman', spec: 'amelioration', nom: 'Amélioration' },
    { classe: 'chaman', spec: 'elementaire', nom: 'Élémentaire', mods: { pa: 0.4, ps: 1.7, arme: 0.8 } },
    { classe: 'mage', spec: 'givre', nom: 'Givre' },
    { classe: 'mage', spec: 'arcanes', nom: 'Arcanes' },
    { classe: 'demoniste', spec: 'affliction', nom: 'Affliction' },
    { classe: 'demoniste', spec: 'demonologie', nom: 'Démonologie' },
    { classe: 'druide', spec: 'farouche', nom: 'Combat farouche', mods: { ps: 0.5 } },
    { classe: 'druide', spec: 'equilibre', nom: 'Équilibre', mods: { pa: 0.5, ps: 1.8 } },
  ];

  function profilType(classe, spec, niveau, nomSpec, mods) {
    const T = TYPES[classe];
    const n = borne(Math.round(niveau || 60), 10, 60);
    const m = mods || (SPECS_TYPES.find((x) => x.classe === classe && x.spec === spec) || {}).mods || {};
    const k = (x) => m[x] || 1;
    const r = n / 60;
    const vers = (v60, v1) => Math.round((v1 + (v60 - v1) * r) * 10) / 10;
    const pa = Math.round(T.pa * ech(n, 1.4) * k('pa'));
    // Comme sur la fiche Blizzard, les dégâts affichés comprennent la puissance d'attaque
    const moy = (T.arme[0] + T.arme[1]) / 2 * ech(n, 1.5) * k('arme') + pa / 14 * T.arme[2];
    const stats = {
      pv: Math.round(T.pv * ech(n, 2.2)), mana: Math.round(T.mana * ech(n, 1.6) * k('mana')),
      force: Math.round(T.force * ech(n, 1.3)), agilite: Math.round(T.agilite * ech(n, 1.3)),
      endurance: 0, intelligence: Math.round(T.intelligence * ech(n, 1.3)), esprit: 0,
      pa, critique: vers(T.crit, 5), esquive: vers(T.esquive, 5),
      parade: vers(T.parade, T.parade ? 5 : 0), blocage: 0, armure: Math.round(T.armure * ech(n, 1.6)),
      puissanceSorts: Math.round(T.ps * ech(n, 1.6) * k('ps')), regenMana: Math.round(T.regen * ech(n, 1.4)),
      arme: { min: Math.round(moy * 0.88), max: Math.round(moy * 1.12), vitesse: T.arme[2] },
      distance: T.distance ? { min: Math.round(T.distance[0] * ech(n, 1.5)), max: Math.round(T.distance[1] * ech(n, 1.5)), vitesse: T.distance[2] } : null,
    };
    const nom = `${CLASSES[classe].nom} ${nomSpec || spec}`;
    return {
      cle: `type:${classe}:${spec}`, type: true, nom, niveau: n, classe, classeNom: CLASSES[classe].nom, spec,
      specs: [{ id: spec, nom: nomSpec || spec, points: Math.max(0, n - 9) }], talents: [], stats,
    };
  }

  // ------------------------------------------------------------ état
  function aura(s, c, id) { const a = c.auras[id]; return a && a.fin > s.t ? a : null; }
  function retirer(c, id) { delete c.auras[id]; }
  function autre(s, c) { return s.c[1 - c.cote]; }
  function distance(s) { return Math.abs(s.c[0].x - s.c[1].x); }
  function pct(c) { return c.pv / c.pvMax; }
  const CONTROLES = ['etourdi', 'peur', 'incap', 'horreur', 'bloc'];
  function controle(s, c) { return CONTROLES.some((id) => aura(s, c, id)); }
  function cc(s, c) { return CONTROLES.find((id) => aura(s, c, id) && id !== 'bloc') || null; }
  function enracine(s, c) { return !!aura(s, c, 'racine'); }
  // Contrôle rompu par les dégâts (Métamorphose, Cécité, Repentir…) : on ne frappe pas la cible
  function fragile(s, c) { const a = aura(s, c, 'incap'); return !!(a && a.casse); }
  function dotsSur(s, c) { return Object.keys(c.auras).some((id) => id.startsWith('dot_') && c.auras[id].fin > s.t && !c.auras[id].soin); }
  function immunise(s, c) { return !!(aura(s, c, 'bloc') || aura(s, c, 'bulle')); }
  function furtif(s, c) { return !!aura(s, c, 'furtif'); }
  // Un personnage camouflé reste invisible tant qu'on n'est pas presque à son contact
  function visible(s, c) { return c.pv > 0 && (!furtif(s, c) || distance(s) < 2.5); }
  function occupe(c) { return !!(c.incant || c.canal); }
  function ralenti(s, c) {
    let f = 1;
    for (const id in c.auras) { const a = c.auras[id]; if (a.fin > s.t && a.ralenti) f = Math.min(f, a.ralenti); }
    return f;
  }
  function rang(c, arbre) { return c.points[arbre] || 0; }
  function connait(c, ab) {
    if (c.niveau < (ab.niveau || 1)) return false;
    if (ab.spec && c.spec !== ab.spec) return false;
    if (ab.talent) {
      const nom = sansAccent(ab.talent.nom);
      if (c.talents.has(nom)) return true;
      return rang(c, ab.talent.arbre) >= ab.talent.points;
    }
    return true;
  }

  function log(s, c, type, texte, icone) {
    if (s.journal) s.journal.push({ t: Math.round(s.t * 10) / 10, cote: c ? c.cote : null, type, texte, icone: icone || null });
  }
  // Cinématique : coups reçus (chiffres flottants) et sorts lancés (frise), seulement en mode journal
  function coup(s, cible, nom, icone, m, genre) {
    if (s.coups) s.coups.push({ t: s.t, cible: cible.cote, nom, icone: icone || null, m: Math.round(m || 0), genre });
  }
  function action(s, c, ab) {
    if (s.actions) s.actions.push({ t: s.t, camp: c.cote, nom: ab.nom, icone: ab.icone || null, genre: /^Forme/.test(ab.nom) ? 'forme' : ab.cible === 'soi' ? 'soi' : 'cible' });
  }
  function compter(c, cle, nom, x, icone) {
    const b = c.bilan[cle];
    if (!b[nom]) b[nom] = { total: 0, n: 0, icone: icone || null };
    b[nom].total += x; b[nom].n++;
  }

  // ------------------------------------------------------------ auras, contrôles
  // Rendements décroissants : 100 %, 50 %, 25 %, puis immunité, remis à zéro 18 s après le dernier effet
  const DR = { etourdi: 1, peur: 1, incap: 1, racine: 1, silence: 1 };
  function poser(s, src, cible, id, duree, data) {
    data = data || {};
    if (cible.pv <= 0) return false;
    if (data.nefaste !== false && src !== cible && immunise(s, cible)) return false;
    if (data.cat && DR[data.cat] && !data.sansDR) {
      const d = cible.dr[data.cat] || (cible.dr[data.cat] = { n: 0, fin: 0 });
      if (d.fin < s.t) d.n = 0;
      if (d.n >= 3) { log(s, cible, 'info', `${cible.nom} est insensible (rendements décroissants)`); return false; }
      duree *= [1, 0.5, 0.25][d.n];
      d.n++; d.fin = s.t + duree + 18;
    }
    const id2 = data.cat && id !== data.cat ? data.cat : id;
    cible.auras[id2] = Object.assign({ fin: s.t + duree, debut: s.t, src: src.cote, nom: data.nom || id, subis: 0 }, data);
    if (data.cat && CONTROLES.includes(id2)) {
      annuler(s, cible, null);
      cible.bilan.cc[data.nom || id2] = (cible.bilan.cc[data.nom || id2] || 0) + duree;
      if (s.journal) s.evenements.push({ t: s.t, cote: cible.cote, texte: `${data.nom || id2} ${Math.round(duree * 10) / 10} s` });
      log(s, src, 'cc', `${data.nom || id2} : ${cible.nom} ${Math.round(duree * 10) / 10} s`);
    }
    return true;
  }
  function retirerEntraves(s, c) {
    for (const id of Object.keys(c.auras)) if (c.auras[id].ralenti || id === 'racine') delete c.auras[id];
  }

  // ------------------------------------------------------------ incantations
  function annuler(s, c, raison) {
    if (c.incant) { if (raison) log(s, c, 'echec', `${c.incant.ab.nom} interrompu (${raison})`, c.incant.ab.icone); c.incant = null; }
    if (c.canal) { c.canal = null; }
  }
  function interrompre(s, src, cible, duree, nom) {
    const ab = cible.incant ? cible.incant.ab : cible.canal ? cible.canal.ab : null;
    if (!ab || !ab.sort) return false;
    annuler(s, cible, nom);
    cible.auras.verrou = { fin: s.t + duree, ecole: ab.ecole, nom: 'Verrouillage' };
    log(s, src, 'cc', `${nom} : ${ab.ecole === 'physique' ? 'incantation bloquée' : 'école ' + (ECOLES[ab.ecole] || ab.ecole) + ' verrouillée'} ${duree} s`);
    if (s.journal) s.evenements.push({ t: s.t, cote: cible.cote, texte: `${nom} (${duree} s)` });
    return true;
  }

  // ------------------------------------------------------------ dégâts, soins
  function reduction(armure, niveau) { const a = Math.max(0, armure); return Math.min(0.75, a / (a + 400 + 85 * niveau)); }
  function multiplicateur(s, src, cible, o) {
    let m = 1;
    if (aura(s, src, 'pouvoirArcanes')) m *= 1.3;
    if (aura(s, src, 'infusion')) m *= 1.2;
    if (o.ecole === 'ombre' && aura(s, src, 'formeOmbre')) m *= 1.15;
    if (src.multDegats) m *= src.multDegats;
    if (aura(s, cible, 'ecorce')) m *= 0.8;
    if (o.ecole === 'physique' && aura(s, cible, 'formeOmbre')) m *= 0.85;
    if (cible.multSubis) m *= cible.multSubis;
    return m;
  }
  function degats(s, src, cible, montant, o) {
    src.absorbe = 0;
    if (cible.pv <= 0 || src.pv <= 0 && !o.periodique) return 0;
    if (immunise(s, cible)) { log(s, src, 'echec', `${o.nom} : ${cible.nom} est insensible`, o.icone); coup(s, cible, o.nom, o.icone, 0, 'insensible'); return 0; }
    let m = montant * multiplicateur(s, src, cible, o);
    if (o.ecole === 'physique' && !o.saignement) m *= 1 - reduction(cible.armure, src.niveau);
    if (o.crit) m *= o.multCrit || (o.ecole === 'physique' ? 2 : 1.5);
    m = Math.max(1, Math.round(m));
    // Boucliers (montant absorbé gardé pour le journal)
    let absorbe = 0;
    for (const id of ['bouclierPS', 'barriere']) {
      const b = aura(s, cible, id);
      if (b && m > 0) { const x = Math.min(Math.round(b.reste), m); b.reste -= x; m -= x; absorbe += x; if (b.reste < 1) retirer(cible, id); }
    }
    src.absorbe = absorbe;
    cible.pv -= m;
    coup(s, cible, o.nom, o.icone, m || absorbe, m ? (o.crit ? 'crit' : 'degat') : 'absorbé');
    compter(src, 'degats', o.nom, m, o.icone);
    if (src.familierDe != null) { /* sans objet */ }
    if (cible.classe === 'guerrier' || cible.forme === 'ours') cible.rage = Math.min(100, cible.rage + 2.5 * m / facteurRage(cible.niveau));
    // Ce qui cède aux dégâts
    if (furtif(s, cible)) { retirer(cible, 'furtif'); log(s, cible, 'info', `${cible.nom} sort de l'ombre`); }
    const inc = aura(s, cible, 'incap');
    if (inc && inc.casse && m > 0 && !(o.periodique && inc.nom === 'Métamorphose' && false)) { retirer(cible, 'incap'); log(s, cible, 'info', `${inc.nom} rompu par les dégâts`); }
    for (const id of ['peur', 'racine']) {
      const a = aura(s, cible, id);
      if (a && a.seuil) { a.subis += m; if (a.subis >= a.seuil) { retirer(cible, id); log(s, cible, 'info', `${a.nom} rompu par les dégâts`); } }
    }
    if (cible.incant && !aura(s, cible, 'bouclierPS') && cible.incant.recul < 1) {
      cible.incant.fin += 0.5; cible.incant.recul += 0.5;
    }
    if (cible.pv <= 0) { cible.pv = 0; s.fin = true; }
    return m;
  }
  function soigner(s, c, montant, nom, icone, crit) {
    if (c.pv <= 0) return 0;
    let m = montant * (crit ? 1.5 : 1);
    if (aura(s, c, 'frappeMortelle')) m *= 0.5;
    m = Math.round(Math.min(m, c.pvMax - c.pv));
    c.pv += m;
    if (m > 0) coup(s, c, nom, icone, m, 'soin');
    compter(c, 'soins', nom, m, icone);
    return m;
  }

  // Table d'attaque au corps à corps (ou à distance) : raté, esquive, parade, blocage, critique, coup normal
  function jet(s, src, cible, o) {
    o = o || {};
    const ecart = Math.max(0, cible.niveau - src.niveau);
    const r = s.alea() * 100;
    let seuil = 5 + ecart + (o.blanc && src.ambidextre ? 19 : 0);
    if (r < seuil) return 'rate';
    if (!o.distance && !o.inesquivable) {
      const esq = cible.esquive + (aura(s, cible, 'evasion') ? 50 : 0);
      if (r < (seuil += esq)) return 'esquive';
      if (!o.dos && r < (seuil += cible.parade)) return 'parade';
    }
    if (!o.distance && r < (seuil += cible.blocage)) return 'bloque';
    const base = o.distance && src.critDistance != null ? src.critDistance : src.forme === 'felin' ? src.critFelin : src.crit;
    const crit = base + (o.critBonus || 0);
    if (r < seuil + crit || aura(s, src, 'sangFroid')) { retirer(src, 'sangFroid'); return 'critique'; }
    return 'touche';
  }
  const LIBELLES = { rate: 'raté', esquive: 'esquivé', parade: 'paré', bloque: 'bloqué' };

  // Technique physique : le jet décide, puis les dégâts ; renvoie le résultat du jet ou null si raté
  const ECOLES = { arcane: 'des Arcanes', feu: 'du Feu', givre: 'du Givre', nature: 'de la Nature', ombre: 'de l\'Ombre', sacre: 'du Sacré' };
  const absorbeTexte = (c) => (c.absorbe ? ` (${c.absorbe} absorbés)` : '');
  function frappe(s, c, e, ab, montant, o) {
    o = o || {};
    const j = jet(s, c, e, o);
    if (j === 'rate' || j === 'esquive' || j === 'parade') {
      log(s, c, 'echec', `${ab.nom} : ${LIBELLES[j]}`, ab.icone);
      coup(s, e, ab.nom, ab.icone, 0, LIBELLES[j]);
      if (j === 'esquive') c.esquiveSubie = s.t;
      return null;
    }
    let m = montant;
    if (j === 'bloque') m = Math.max(0, m - e.valeurBlocage);
    const x = degats(s, c, e, m, Object.assign({ nom: ab.nom, icone: ab.icone, ecole: 'physique', crit: j === 'critique' }, o));
    log(s, c, 'degat', `${ab.nom} : ${x}${j === 'critique' ? ' (critique)' : ''}${absorbeTexte(c)}`, ab.icone);
    return j;
  }
  // Sort de dégâts : résistance, critique
  function sortDegats(s, c, e, ab, montant, o) {
    o = o || {};
    const ecart = Math.max(0, e.niveau - c.niveau);
    if (s.alea() * 100 < 4 + 2 * ecart) { log(s, c, 'echec', `${ab.nom} : résisté`, ab.icone); coup(s, e, ab.nom, ab.icone, 0, 'résisté'); return null; }
    const crit = s.alea() * 100 < c.critSort + (o.critBonus || 0) || !!aura(s, c, 'maitrise');
    if (aura(s, c, 'maitrise')) retirer(c, 'maitrise');
    const x = degats(s, c, e, montant + (ab.coef || 0) * c.ps, Object.assign({ nom: ab.nom, icone: ab.icone, ecole: ab.ecole, crit }, o));
    log(s, c, 'degat', `${ab.nom} : ${x}${crit ? ' (critique)' : ''}${absorbeTexte(c)}`, ab.icone);
    return { x, crit };
  }
  function sortSoin(s, c, ab, montant) {
    const crit = s.alea() * 100 < c.critSort;
    const x = soigner(s, c, montant + (ab.coef || 0) * c.ps, ab.nom, ab.icone, crit);
    log(s, c, 'soin', `${ab.nom} : +${x}${crit ? ' (critique)' : ''}`, ab.icone);
    return x;
  }
  // Effet périodique (dégâts ou soins) posé comme une aura
  function periodique(s, c, cible, ab, total, duree, periode, o) {
    o = o || {};
    const id = 'dot_' + ab.id;
    const n = Math.round(duree / periode);
    cible.auras[id] = {
      fin: s.t + duree + 0.01, src: c.cote, nom: ab.nom, icone: ab.icone, periode, prochain: s.t + periode,
      montant: (total + (ab.coefDot || 0) * c.ps) / n, ecole: o.ecole || ab.ecole, soin: !!o.soin, drain: !!o.drain,
      saignement: !!o.saignement, nefaste: !o.soin,
    };
  }

  // ------------------------------------------------------------ capacités
  // Coûts en mana : fraction de la mana maximale. Dégâts : valeurs du niveau 60 × ech(niveau).
  // incant : durée d'incantation (s) ; canal : canalisation ; portee en mètres ; recharge en secondes.
  const n_ = (c, v, x) => v * ech(c.niveau, x);
  const moyArme = (c) => (c.arme.min + c.arme.max) / 2;
  const tirage = (s, c) => c.arme.min + (c.arme.max - c.arme.min) * s.alea();

  const KITS = {
    // ---------------------------------------------------------------- guerrier
    guerrier: {
      capacites: {
        charge: { nom: 'Charge', icone: 'ability_warrior_charge', niveau: 4, rage: 0, portee: 25, min: 8, recharge: 15, gcd: 0,
          condition: (s, c) => !c.charge && !enracine(s, c),
          effet(s, c, e) { c.charge = true; c.x = e.x + Math.sign(c.x - e.x) * 2; c.rage += c.niveau >= 26 ? 15 : c.niveau >= 14 ? 12 : 9; poser(s, c, e, 'etourdi', 1, { cat: 'etourdi', sansDR: true, nom: 'Charge' }); } },
        interception: { nom: 'Interception', icone: 'ability_rogue_sprint', niveau: 30, rage: 10, portee: 25, min: 8, recharge: 30,
          condition: (s, c) => c.charge && !enracine(s, c),
          effet(s, c, e) { c.x = e.x + Math.sign(c.x - e.x) * 2; poser(s, c, e, 'etourdi', 3, { cat: 'etourdi', nom: 'Interception' }); } },
        rageBerserker: { nom: 'Rage berserker', icone: 'spell_nature_ancestralguardian', niveau: 32, rage: 0, recharge: 30, gcd: 0, cible: 'soi', sousControle: ['peur', 'incap'],
          effet(s, c) { retirer(c, 'peur'); if (aura(s, c, 'incap') && aura(s, c, 'incap').nom !== 'Métamorphose') retirer(c, 'incap'); c.rage = Math.min(100, c.rage + 10); } },
        volee: { nom: 'Volée de coups', icone: 'inv_gauntlets_04', niveau: 38, rage: 10, portee: MELEE, recharge: 10, gcd: 0,
          condition: (s, c, e) => occupe(e), effet(s, c, e) { interrompre(s, c, e, 4, 'Volée de coups'); } },
        cri: { nom: 'Cri d\'intimidation', icone: 'ability_golemthunderclap', niveau: 22, rage: 25, portee: 8, recharge: 180,
          condition: (s, c, e) => occupe(e) || pct(c) < 0.35,
          effet(s, c, e) { poser(s, c, e, 'peur', 8, { cat: 'peur', nom: 'Cri d\'intimidation', seuil: e.pvMax * 0.12 }); } },
        frappeMortelle: { nom: 'Frappe mortelle', icone: 'ability_warrior_savageblow', niveau: 40, talent: { nom: 'Frappe mortelle', arbre: 'armes', points: 31 }, rage: 30, portee: MELEE, recharge: 6,
          effet(s, c, e) { if (frappe(s, c, e, this, tirage(s, c) + n_(c, 160))) poser(s, c, e, 'frappeMortelle', 10, { nom: 'Frappe mortelle' }); } },
        sanguinaire: { nom: 'Sanguinaire', icone: 'spell_nature_bloodlust', niveau: 40, talent: { nom: 'Sanguinaire', arbre: 'fureur', points: 31 }, rage: 30, portee: MELEE, recharge: 6,
          effet(s, c, e) { frappe(s, c, e, this, 0.45 * c.pa); } },
        execution: { nom: 'Exécution', icone: 'inv_sword_48', niveau: 24, rage: 15, portee: MELEE,
          condition: (s, c, e) => pct(e) < 0.2,
          effet(s, c, e) { const x = c.rage; c.rage = 0; frappe(s, c, e, this, n_(c, 600) + 15 * x); } },
        fulgurance: { nom: 'Fulgurance', icone: 'ability_meleedamage', niveau: 12, rage: 5, portee: MELEE, recharge: 5,
          condition: (s, c) => c.esquiveSubie > s.t - 5,
          effet(s, c, e) { c.esquiveSubie = -99; frappe(s, c, e, this, tirage(s, c) + n_(c, 35), { inesquivable: true, critBonus: 25 }); } },
        brise: { nom: 'Brise-genou', icone: 'ability_shockwave', niveau: 8, rage: 10, portee: MELEE,
          condition: (s, c, e) => ralenti(s, e) > 0.7 && !e.immuniteRalenti,
          effet(s, c, e) { if (frappe(s, c, e, this, n_(c, 45))) { poser(s, c, e, 'brise', 15, { ralenti: 0.5, nom: 'Brise-genou' });
            if (c.spec === 'armes' && c.niveau >= 30 && s.alea() < 0.15) poser(s, c, e, 'racine', 5, { cat: 'racine', nom: 'Brise-genou amélioré' }); } } },
        tourbillon: { nom: 'Tourbillon', icone: 'ability_whirlwind', niveau: 36, rage: 25, portee: 8, recharge: 10,
          effet(s, c, e) { frappe(s, c, e, this, tirage(s, c)); } },
        pourfendre: { nom: 'Pourfendre', icone: 'ability_gouge', niveau: 4, rage: 10, portee: MELEE,
          condition: (s, c, e) => !aura(s, e, 'dot_pourfendre') && e.classe !== 'voleur',
          effet(s, c, e) { const j = jet(s, c, e, {}); if (j === 'rate' || j === 'esquive' || j === 'parade') { log(s, c, 'echec', `${this.nom} : ${LIBELLES[j]}`, this.icone); return; }
            periodique(s, c, e, this, n_(c, 147), 21, 3, { saignement: true, ecole: 'physique' }); log(s, c, 'degat', this.nom, this.icone); } },
        frappeHeroique: { nom: 'Frappe héroïque', icone: 'ability_rogue_ambush', niveau: 1, rage: 15, portee: MELEE, gcd: 0,
          condition: (s, c) => !c.prochainCoup && c.rage >= 50, effet(s, c) { c.prochainCoup = { nom: 'Frappe héroïque', icone: 'ability_rogue_ambush', bonus: n_(c, 157) }; } },
      },
      ia(s, c, e, d, T) {
        if (controle(s, c)) return T('rageBerserker');
        if (d > MELEE) return T('charge') || T('interception') || (ralenti(s, e) > 0.7 && d < 8 && T('brise'));
        if (T('volee') || T('execution') || T('frappeMortelle') || T('sanguinaire') || T('cri')) return true;
        // Garde 30 de rage pour la grosse technique si elle revient bientôt
        const grosse = ['frappeMortelle', 'sanguinaire'].find((id) => connait(c, c.kit.capacites[id]));
        const reserve = grosse && (c.cd[grosse] || 0) - s.t < 2 ? 30 : 0;
        if (c.rage - reserve < 10) return false;
        return T('fulgurance') || T('brise') || T('tourbillon') || T('pourfendre') || T('frappeHeroique');
      },
    },

    // ---------------------------------------------------------------- paladin
    paladin: {
      init(c) { c.sceau = c.niveau >= 1; },
      capacites: {
        jugement: { nom: 'Jugement', icone: 'spell_holy_righteousfury', niveau: 4, mana: 0.05, portee: 10, recharge: 8, sort: true, ecole: 'sacre', coef: 0.4,
          effet(s, c, e) { sortDegats(s, c, e, this, n_(c, 220)); } },
        marteau: { nom: 'Marteau de la justice', icone: 'spell_holy_sealofmight', niveau: 8, mana: 0.03, portee: 10, recharge: (c) => c.spec === 'sacre' ? 45 : 60, sort: true, ecole: 'sacre',
          condition: (s, c, e) => !controle(s, e) && (occupe(e) || pct(c) < 0.5 || pct(e) < 0.5 || e.pvMax < c.pvMax),
          effet(s, c, e) { poser(s, c, e, 'etourdi', c.niveau >= 54 ? 6 : c.niveau >= 40 ? 5 : c.niveau >= 24 ? 4 : 3, { cat: 'etourdi', nom: 'Marteau de la justice' }); } },
        repentir: { nom: 'Repentir', icone: 'spell_holy_prayerofhealing', niveau: 30, talent: { nom: 'Repentir', arbre: 'vindicte', points: 31 }, mana: 0.05, portee: 20, recharge: 60, sort: true, ecole: 'sacre',
          condition: (s, c, e) => !controle(s, e) && (pct(c) < 0.45 || occupe(e)),
          effet(s, c, e) { poser(s, c, e, 'incap', 6, { cat: 'incap', nom: 'Repentir', casse: true }); } },
        bouclier: { nom: 'Bouclier divin', icone: 'spell_holy_divineintervention', niveau: 6, mana: 0.05, recharge: 300, cible: 'soi', sort: true, ecole: 'sacre',
          condition: (s, c) => pct(c) < 0.25 && !aura(s, c, 'longanimite'),
          effet(s, c) { for (const id of Object.keys(c.auras)) if (c.auras[id].nefaste !== false && id !== 'longanimite') delete c.auras[id];
            poser(s, c, c, 'bulle', c.niveau >= 50 ? 12 : c.niveau >= 34 ? 10 : 6, { nefaste: false, nom: 'Bouclier divin' }); c.auras.longanimite = { fin: s.t + 60, nefaste: false }; } },
        liberte: { nom: 'Bénédiction de liberté', icone: 'spell_holy_sealofvalor', niveau: 18, mana: 0.05, recharge: 25, cible: 'soi', sort: true, ecole: 'sacre', sousControle: [],
          condition: (s, c) => enracine(s, c) || ralenti(s, c) < 0.8,
          effet(s, c) { retirerEntraves(s, c); c.auras.liberte = { fin: s.t + 10, nefaste: false, nom: 'Liberté' }; } },
        imposition: { nom: 'Imposition des mains', icone: 'spell_holy_layonhands', niveau: 10, mana: 0, recharge: 1200, cible: 'soi', sort: true, ecole: 'sacre',
          condition: (s, c) => pct(c) < 0.15, effet(s, c) { c.mana = 0; sortSoin(s, c, this, c.pvMax); } },
        eclair: { nom: 'Éclair lumineux', icone: 'spell_holy_flashheal', niveau: 20, mana: 0.05, incant: 1.5, cible: 'soi', sort: true, ecole: 'sacre', coef: 0.43,
          condition: (s, c, e) => pct(c) < 0.6, effet(s, c) { sortSoin(s, c, this, n_(c, 330, 2.2) * c.multSoins); } },
        lumiere: { nom: 'Lumière sacrée', icone: 'spell_holy_holybolt', niveau: 1, mana: 0.14, incant: 2.5, cible: 'soi', sort: true, ecole: 'sacre', coef: 0.71,
          condition: (s, c, e) => pct(c) < 0.5, effet(s, c) { sortSoin(s, c, this, n_(c, 700, 2.2) * c.multSoins); } },
        horion: { nom: 'Horion sacré', icone: 'spell_holy_searinglight', niveau: 40, talent: { nom: 'Horion sacré', arbre: 'sacre', points: 31 }, mana: 0.08, portee: 20, recharge: 30, sort: true, ecole: 'sacre', coef: 0.43,
          effet(s, c, e) { if (pct(c) < 0.6) sortSoin(s, c, this, n_(c, 500, 2.2)); else sortDegats(s, c, e, this, n_(c, 400)); } },
      },
      ia(s, c, e, d, T) {
        const sur = controle(s, e) || d > 12 || aura(s, c, 'bulle');
        if (T('imposition') || T('bouclier')) return true;
        if (aura(s, c, 'bulle') && pct(c) < 0.9) return T('lumiere') || T('eclair');
        if (T('liberte') || T('marteau') || T('repentir')) return true;
        if (sur && (T('lumiere') || T('eclair'))) return true;
        if (pct(c) < 0.3 && T('eclair')) return true;
        return T('horion') || T('jugement');
      },
    },

    // ---------------------------------------------------------------- chasseur
    chasseur: {
      init(c) { c.familier = { nom: 'Familier', icone: 'ability_hunter_pet_wolf', dps: 0.85 * c.niveau * (c.spec === 'maitrise' ? 1.4 : 1), ecole: 'physique', prochain: 2 }; },
      capacites: {
        morsure: { nom: 'Morsure de serpent', icone: 'ability_hunter_quickshot', niveau: 4, mana: 0.04, portee: 35, min: 8, sort: false, ecole: 'nature',
          condition: (s, c, e) => !aura(s, c, 'dot_morsure') && !aura(s, e, 'dot_morsure'),
          effet(s, c, e) { periodique(s, c, e, this, n_(c, 555), 15, 3); log(s, c, 'degat', 'Morsure de serpent', this.icone); } },
        arcanes: { nom: 'Tir des arcanes', icone: 'ability_impalingbolt', niveau: 6, mana: 0.04, portee: 35, min: 8, recharge: 6, ecole: 'arcane',
          effet(s, c, e) { sortDegats(s, c, e, this, n_(c, 183) + 0.15 * c.pad); } },
        choc: { nom: 'Trait de choc', icone: 'spell_frost_stun', niveau: 8, mana: 0.02, portee: 35, min: 8, recharge: 12,
          condition: (s, c, e) => ralenti(s, e) > 0.7 && CLASSES[e.classe].melee,
          effet(s, c, e) { if (jet(s, c, e, { distance: true }) !== 'rate') poser(s, c, e, 'choc', 4, { ralenti: 0.5, nom: 'Trait de choc' }); } },
        visee: { nom: 'Visée', icone: 'ability_hunter_aimedshot', niveau: 20, talent: { nom: 'Visée', arbre: 'precision', points: 11 }, mana: 0.08, portee: 35, min: 8, recharge: 6, incant: 2, ecole: 'physique',
          effet(s, c, e) { frappe(s, c, e, this, c.tirDistance(s) + n_(c, 600), { distance: true }); } },
        multiples: { nom: 'Flèches multiples', icone: 'ability_upgrademoonglaive', niveau: 18, mana: 0.06, portee: 35, min: 8, recharge: 6, ecole: 'physique',
          effet(s, c, e) { frappe(s, c, e, this, c.tirDistance(s) + n_(c, 150), { distance: true }); } },
        dispersion: { nom: 'Flèche de dispersion', icone: 'ability_golemstormbolt', niveau: 30, talent: { nom: 'Flèche de dispersion', arbre: 'precision', points: 21 }, mana: 0.04, portee: 15, recharge: 30,
          condition: (s, c, e, d) => d < 8 && !controle(s, e),
          effet(s, c, e) { poser(s, c, e, 'incap', 4, { cat: 'incap', nom: 'Flèche de dispersion', casse: true }); } },
        wyverne: { nom: 'Piqûre de wyverne', icone: 'inv_spear_02', niveau: 40, talent: { nom: 'Piqûre de wyverne', arbre: 'survie', points: 31 }, mana: 0.06, portee: 35, min: 8, recharge: 120,
          condition: (s, c, e) => !controle(s, e) && (pct(c) < 0.6 || occupe(e)),
          effet(s, c, e) { poser(s, c, e, 'incap', 12, { cat: 'incap', nom: 'Piqûre de wyverne', casse: true }); } },
        piege: { nom: 'Piège givrant', icone: 'spell_frost_chainsofice', niveau: 20, mana: 0.05, portee: MELEE, recharge: 30, ecole: 'givre',
          condition: (s, c, e) => !controle(s, e),
          effet(s, c, e) { poser(s, c, e, 'incap', 10, { cat: 'incap', nom: 'Piège givrant', casse: true }); } },
        coupure: { nom: 'Coupure d\'ailes', icone: 'ability_rogue_trip', niveau: 12, mana: 0.02, portee: MELEE,
          condition: (s, c, e) => ralenti(s, e) > 0.7,
          effet(s, c, e) { if (frappe(s, c, e, this, n_(c, 25))) poser(s, c, e, 'coupure', 10, { ralenti: 0.5, nom: 'Coupure d\'ailes' }); } },
        mangouste: { nom: 'Attaque du raptor', icone: 'ability_meleedamage', niveau: 1, mana: 0.03, portee: MELEE, recharge: 6,
          effet(s, c, e) { frappe(s, c, e, this, tirage(s, c) + n_(c, 140)); } },
        desengagement: { nom: 'Désengagement', icone: 'ability_rogue_feint', niveau: 20, mana: 0.02, portee: MELEE, recharge: 15, gcd: 0,
          condition: (s, c, e) => controle(s, e) || enracine(s, e) || ralenti(s, e) < 0.7,
          effet(s, c, e) { c.x += Math.sign(c.x - e.x || 1) * 12; } },
        intimidation: { nom: 'Intimidation', icone: 'ability_devour', niveau: 30, talent: { nom: 'Intimidation', arbre: 'maitrise', points: 21 }, mana: 0.04, portee: 30, recharge: 60, gcd: 0,
          condition: (s, c, e, d) => !controle(s, e) && (d < 8 || occupe(e)),
          effet(s, c, e) { poser(s, c, e, 'etourdi', 3, { cat: 'etourdi', nom: 'Intimidation' }); } },
      },
      ia(s, c, e, d, T) {
        if (d < 8) return T('piege') || T('dispersion') || T('intimidation') || T('coupure') || T('desengagement') || T('mangouste');
        return T('wyverne') || T('intimidation') || T('choc') || T('morsure') || T('visee') || T('arcanes') || T('multiples');
      },
    },

    // ---------------------------------------------------------------- voleur
    voleur: {
      init(c) { c.ambidextre = true; c.multBlanc = 1.35; c.furtifDebut = true; },
      capacites: {
        coupBas: { nom: 'Coup bas', icone: 'ability_cheapshot', niveau: 26, energie: 60, portee: MELEE, furtif: true,
          effet(s, c, e) { poser(s, c, e, 'etourdi', 4, { cat: 'etourdi', nom: 'Coup bas' }); c.cp = Math.min(5, c.cp + 2); } },
        embuscade: { nom: 'Embuscade', icone: 'ability_rogue_ambush', niveau: 18, energie: 60, portee: MELEE, furtif: true,
          effet(s, c, e) { frappe(s, c, e, this, 2.5 * tirage(s, c) + n_(c, 210), { dos: true, inesquivable: true }); c.cp = Math.min(5, c.cp + 1); } },
        aiguillon: { nom: 'Aiguillon perfide', icone: 'ability_rogue_kidneyshot', niveau: 30, energie: 25, portee: MELEE, recharge: 20,
          condition: (s, c, e) => c.cp >= 4 && !controle(s, e),
          effet(s, c, e) { const cp = c.cp; c.cp = 0; poser(s, c, e, 'etourdi', (c.niveau >= 50 ? 1 : 0) + cp, { cat: 'etourdi', nom: 'Aiguillon perfide' }); } },
        evisceration: { nom: 'Éviscération', icone: 'ability_rogue_eviscerate', niveau: 1, energie: 35, portee: MELEE,
          condition: (s, c, e) => c.cp >= 5 || (c.cp >= 2 && pct(e) < 0.2),
          effet(s, c, e) { const cp = c.cp; c.cp = 0; frappe(s, c, e, this, n_(c, 70 + 170 * cp) + 0.03 * cp * c.pa); } },
        suriner: { nom: 'Suriner', icone: 'ability_gouge', niveau: 6, energie: 45, portee: MELEE, recharge: 10,
          condition: (s, c, e) => occupe(e) && !controle(s, e),
          effet(s, c, e) { if (frappe(s, c, e, this, n_(c, 75))) { retirer(e, 'incap'); poser(s, c, e, 'incap', 5.5, { cat: 'incap', nom: 'Suriner', casse: true }); } } },
        coupDePied: { nom: 'Coup de pied', icone: 'ability_kick', niveau: 12, energie: 25, portee: MELEE, recharge: 10, gcd: 0,
          condition: (s, c, e) => occupe(e), effet(s, c, e) { interrompre(s, c, e, 5, 'Coup de pied'); } },
        evasion: { nom: 'Évasion', icone: 'spell_shadow_shadowward', niveau: 8, energie: 0, recharge: 300, cible: 'soi', gcd: 0,
          condition: (s, c, e) => pct(c) < 0.6 && CLASSES[e.classe].melee, effet(s, c) { c.auras.evasion = { fin: s.t + 15, nefaste: false, nom: 'Évasion' }; } },
        cecite: { nom: 'Cécité', icone: 'spell_shadow_mindsteal', niveau: 34, energie: 0, portee: 10, recharge: 300,
          condition: (s, c, e) => !controle(s, e) && (pct(c) < 0.4 || occupe(e) && !pret(s, c, 'coupDePied')),
          effet(s, c, e) { poser(s, c, e, 'incap', 10, { cat: 'incap', nom: 'Cécité', casse: true }); } },
        disparition: { nom: 'Disparition', icone: 'ability_vanish', niveau: 22, energie: 0, recharge: 300, cible: 'soi', gcd: 0, sousControle: [],
          condition: (s, c, e) => (pct(c) < 0.45 || enracine(s, c)) && !Object.keys(c.auras).some((id) => id.startsWith('dot_')),
          effet(s, c, e) { retirerEntraves(s, c); c.auras.furtif = { fin: s.t + 600, nefaste: false, nom: 'Camouflage' }; if (e.incant) annuler(s, e, 'cible perdue'); } },
        sprint: { nom: 'Sprint', icone: 'ability_rogue_sprint', niveau: 10, energie: 0, recharge: 300, cible: 'soi', gcd: 0,
          condition: (s, c, e, d) => d > 12 && !enracine(s, c), effet(s, c) { c.auras.sprint = { fin: s.t + 15, nefaste: false, vitesse: 1.7, nom: 'Sprint' }; } },
        hemorragie: { nom: 'Hémorragie', icone: 'spell_shadow_lifedrain', niveau: 30, talent: { nom: 'Hémorragie', arbre: 'finesse', points: 21 }, energie: 35, portee: MELEE,
          effet(s, c, e) { if (frappe(s, c, e, this, tirage(s, c) * 1.1)) c.cp = Math.min(5, c.cp + 1); } },
        preparation: { nom: 'Préparation', icone: 'spell_shadow_antishadow', niveau: 30, talent: { nom: 'Préparation', arbre: 'finesse', points: 21 }, energie: 0, recharge: 600, cible: 'soi', gcd: 0,
          condition: (s, c) => !pret(s, c, 'disparition') && !pret(s, c, 'evasion'),
          effet(s, c) { for (const k of ['disparition', 'evasion', 'cecite', 'sprint', 'suriner', 'coupDePied']) c.cd[k] = 0; } },
        poussee: { nom: 'Poussée d\'adrénaline', icone: 'spell_shadow_shadowworddominate', niveau: 40, talent: { nom: 'Poussée d\'adrénaline', arbre: 'combat', points: 31 }, energie: 0, recharge: 300, cible: 'soi', gcd: 0,
          condition: (s, c, e, d) => d <= MELEE, effet(s, c) { c.auras.adrenaline = { fin: s.t + 15, nefaste: false, nom: 'Poussée d\'adrénaline' }; } },
        deluge: { nom: 'Déluge de lames', icone: 'ability_warrior_punishingblow', niveau: 30, talent: { nom: 'Déluge de lames', arbre: 'combat', points: 21 }, energie: 25, recharge: 120, cible: 'soi', gcd: 0,
          condition: (s, c, e, d) => d <= MELEE, effet(s, c) { c.auras.deluge = { fin: s.t + 15, nefaste: false, hate: 1.2, nom: 'Déluge de lames' }; } },
        sangFroid: { nom: 'Sang froid', icone: 'spell_ice_lament', niveau: 30, talent: { nom: 'Sang froid', arbre: 'assassinat', points: 21 }, energie: 0, recharge: 180, cible: 'soi', gcd: 0,
          condition: (s, c) => c.cp >= 5, effet(s, c) { c.auras.sangFroid = { fin: s.t + 30, nefaste: false }; } },
        pernicieuse: { nom: 'Attaque pernicieuse', icone: 'spell_shadow_ritualofsacrifice', niveau: 1, energie: 45, portee: MELEE,
          effet(s, c, e) { if (frappe(s, c, e, this, tirage(s, c) + n_(c, 68))) c.cp = Math.min(5, c.cp + 1); } },
      },
      ia(s, c, e, d, T) {
        if (controle(s, c)) return false;
        if (furtif(s, c)) return d <= MELEE && (T('coupBas') || T('embuscade'));
        if (T('disparition') || T('evasion') || T('sprint')) return true;
        if (d > MELEE) return false;
        return T('coupDePied') || T('suriner') || T('cecite') || T('preparation') || T('poussee') || T('deluge') || T('aiguillon')
          || T('sangFroid') || T('evisceration') || T('hemorragie') || T('pernicieuse');
      },
    },

    // ---------------------------------------------------------------- prêtre
    pretre: {
      init(c) { if (c.niveau >= 40 && (c.talents.has('forme d ombre') || rang(c, 'ombre') >= 31)) c.formeOmbre = true; c.multBouclier = c.spec === 'discipline' ? 1.15 : 1; },
      capacites: {
        formeOmbre: { nom: 'Forme d\'ombre', icone: 'spell_shadow_shadowform', niveau: 40, talent: { nom: 'Forme d\'ombre', arbre: 'ombre', points: 31 }, mana: 0.03, cible: 'soi',
          condition: (s, c) => !aura(s, c, 'formeOmbre'), effet(s, c) { c.auras.formeOmbre = { fin: s.t + 9999, nefaste: false, nom: 'Forme d\'ombre' }; } },
        bouclier: { nom: 'Mot de pouvoir : Bouclier', icone: 'spell_holy_powerwordshield', niveau: 6, mana: 0.1, cible: 'soi', sort: true, ecole: 'sacre',
          condition: (s, c) => !aura(s, c, 'ameAffaiblie') && !aura(s, c, 'bouclierPS'),
          effet(s, c) { c.auras.bouclierPS = { fin: s.t + 30, reste: (n_(c, 940, 2) + 0.1 * c.ps) * c.multBouclier, nefaste: false, nom: 'Bouclier' };
            c.auras.ameAffaiblie = { fin: s.t + 15, nefaste: false }; } },
        cri: { nom: 'Cri psychique', icone: 'spell_shadow_psychicscream', niveau: 14, mana: 0.05, portee: 8, recharge: 30, sort: true, ecole: 'ombre',
          condition: (s, c, e) => !controle(s, e), effet(s, c, e) { poser(s, c, e, 'peur', 8, { cat: 'peur', nom: 'Cri psychique', seuil: e.pvMax * 0.12 }); } },
        silence: { nom: 'Silence', icone: 'spell_shadow_impphaseshift', niveau: 30, talent: { nom: 'Silence', arbre: 'ombre', points: 21 }, mana: 0.05, portee: 20, recharge: 45, sort: true, ecole: 'ombre', gcd: 0,
          condition: (s, c, e) => occupe(e), effet(s, c, e) { interrompre(s, c, e, 5, 'Silence'); poser(s, c, e, 'silence', 5, { cat: 'silence', nom: 'Silence' }); } },
        douleur: { nom: 'Mot de l\'ombre : Douleur', icone: 'spell_shadow_shadowwordpain', niveau: 4, mana: 0.06, portee: 30, sort: true, ecole: 'ombre', coefDot: 1.1,
          condition: (s, c, e) => !aura(s, e, 'dot_douleur'), effet(s, c, e) { periodique(s, c, e, this, n_(c, 852), 18, 3); log(s, c, 'degat', this.nom, this.icone); } },
        attaque: { nom: 'Attaque mentale', icone: 'spell_shadow_unholyfrenzy', niveau: 10, mana: 0.07, portee: 30, incant: 1.5, recharge: 8, sort: true, ecole: 'ombre', coef: 0.43,
          effet(s, c, e) { sortDegats(s, c, e, this, n_(c, 540)); } },
        fouet: { nom: 'Fouet mental', icone: 'spell_shadow_siphonmana', niveau: 20, talent: { nom: 'Fouet mental', arbre: 'ombre', points: 11 }, mana: 0.08, portee: 20, canal: 3, ticks: 3, sort: true, ecole: 'ombre', coef: 0.15,
          tick(s, c, e) { sortDegats(s, c, e, this, n_(c, 142)); poser(s, c, e, 'fouet', 1.2, { ralenti: 0.5, nom: 'Fouet mental' }); } },
        chatiment: { nom: 'Châtiment', icone: 'spell_holy_holysmite', niveau: 1, mana: 0.07, portee: 30, incant: 2.5, sort: true, ecole: 'sacre', coef: 0.71,
          condition: (s, c) => !aura(s, c, 'formeOmbre'), effet(s, c, e) { sortDegats(s, c, e, this, n_(c, 430)); } },
        renovation: { nom: 'Rénovation', icone: 'spell_holy_renew', niveau: 8, mana: 0.1, cible: 'soi', sort: true, ecole: 'sacre', coefDot: 1,
          condition: (s, c) => pct(c) < 0.75 && !aura(s, c, 'dot_renovation'), effet(s, c) { periodique(s, c, c, this, n_(c, 880, 2.2), 15, 3, { soin: true }); } },
        rapides: { nom: 'Soins rapides', icone: 'spell_holy_flashheal', niveau: 20, mana: 0.12, incant: 1.5, cible: 'soi', sort: true, ecole: 'sacre', coef: 0.43,
          condition: (s, c) => pct(c) < 0.5, effet(s, c) { sortSoin(s, c, this, n_(c, 800, 2.2)); } },
        soins: { nom: 'Soins', icone: 'spell_holy_heal', niveau: 16, mana: 0.15, incant: 2.5, cible: 'soi', sort: true, ecole: 'sacre', coef: 0.86,
          condition: (s, c) => pct(c) < 0.5, effet(s, c) { sortSoin(s, c, this, n_(c, 1100, 2.2)); } },
        infusion: { nom: 'Infusion de puissance', icone: 'spell_holy_powerinfusion', niveau: 30, talent: { nom: 'Infusion de puissance', arbre: 'discipline', points: 21 }, mana: 0.04, recharge: 180, cible: 'soi', gcd: 0,
          effet(s, c) { c.auras.infusion = { fin: s.t + 15, nefaste: false, nom: 'Infusion de puissance' }; } },
      },
      ia(s, c, e, d, T) {
        if (T('formeOmbre') || T('silence')) return true;
        if (d < 8 && CLASSES[e.classe].melee && T('cri')) return true;
        if (T('bouclier')) return true;
        const sur = controle(s, e) || d > 10 && !CLASSES[e.classe].melee === false;
        if (pct(c) < 0.35 && (T('rapides') || T('renovation'))) return true;
        if (sur && pct(c) < 0.55 && (T('soins') || T('rapides'))) return true;
        if (T('renovation') && pct(c) < 0.6) return true;
        return T('infusion') || T('douleur') || T('attaque') || T('fouet') || T('chatiment');
      },
    },

    // ---------------------------------------------------------------- chaman
    chaman: {
      init(c) { c.charges = c.niveau >= 8 ? 3 : 0; },
      capacites: {
        seisme: { nom: 'Totem de séisme', icone: 'spell_nature_tremortotem', niveau: 18, mana: 0.03, cible: 'soi', recharge: 120,
          condition: (s, c, e) => ['demoniste', 'pretre', 'guerrier'].includes(e.classe) && !c.seisme,
          effet(s, c) { c.seisme = { x: c.x, prochain: s.t + 4 }; } },
        lien: { nom: 'Totem de lien terrestre', icone: 'spell_nature_strengthofearthtotem02', niveau: 6, mana: 0.03, cible: 'soi', recharge: 15,
          condition: (s, c, e, d) => CLASSES[e.classe].melee && d < 15 && !c.lien,
          effet(s, c) { c.lien = { x: c.x, fin: s.t + 45 }; } },
        terre: { nom: 'Horion de terre', icone: 'spell_nature_earthshock', niveau: 4, mana: 0.08, portee: 20, recharge: 6, partage: 'horion', sort: true, ecole: 'nature', coef: 0.39, gcd: 1.5,
          condition: (s, c, e) => occupe(e) || pct(e) < 0.3 || c.spec === 'elementaire',
          effet(s, c, e) { interrompre(s, c, e, 2, 'Horion de terre'); sortDegats(s, c, e, this, n_(c, 517)); } },
        givre: { nom: 'Horion de givre', icone: 'spell_frost_frostshock', niveau: 20, mana: 0.1, portee: 20, recharge: 6, partage: 'horion', sort: true, ecole: 'givre', coef: 0.39,
          condition: (s, c, e) => ralenti(s, e) > 0.7 && (CLASSES[e.classe].melee !== CLASSES.chaman.melee || c.spec === 'elementaire'),
          effet(s, c, e) { if (sortDegats(s, c, e, this, n_(c, 490))) poser(s, c, e, 'horionGivre', 8, { ralenti: 0.5, nom: 'Horion de givre' }); } },
        flammes: { nom: 'Horion de flammes', icone: 'spell_fire_flameshock', niveau: 10, mana: 0.09, portee: 20, recharge: 6, partage: 'horion', sort: true, ecole: 'feu', coef: 0.15, coefDot: 0.4,
          condition: (s, c, e) => !aura(s, e, 'dot_flammes'),
          effet(s, c, e) { if (sortDegats(s, c, e, this, n_(c, 290))) periodique(s, c, e, this, n_(c, 320), 12, 3); } },
        tempete: { nom: 'Frappe-tempête', icone: 'spell_holy_sealofmight', niveau: 40, talent: { nom: 'Frappe-tempête', arbre: 'amelioration', points: 31 }, mana: 0.06, portee: MELEE, recharge: 20,
          effet(s, c, e) { if (frappe(s, c, e, this, tirage(s, c))) c.auras.tempete = { fin: s.t + 12, nefaste: false, charges: 2 }; } },
        maitrise: { nom: 'Maîtrise élémentaire', icone: 'spell_nature_wispheal', niveau: 40, talent: { nom: 'Maîtrise élémentaire', arbre: 'elementaire', points: 31 }, mana: 0, recharge: 180, cible: 'soi', gcd: 0,
          effet(s, c) { c.auras.maitrise = { fin: s.t + 30, nefaste: false }; } },
        eclair: { nom: 'Éclair', icone: 'spell_nature_lightning', niveau: 1, mana: 0.07, portee: 30, incant: (c) => c.niveau < 8 ? 2 : c.spec === 'elementaire' ? 2.5 : 3, sort: true, ecole: 'nature', coef: 0.86,
          effet(s, c, e) { sortDegats(s, c, e, this, n_(c, 430)); } },
        vagueInf: { nom: 'Vague de soins inférieurs', icone: 'spell_nature_healingwavelesser', niveau: 20, mana: 0.09, incant: 1.5, cible: 'soi', sort: true, ecole: 'nature', coef: 0.43,
          condition: (s, c) => pct(c) < 0.45, effet(s, c) { sortSoin(s, c, this, n_(c, 600, 2.2)); } },
        vague: { nom: 'Vague de soins', icone: 'spell_nature_magicimmunity', niveau: 1, mana: 0.15, incant: (c) => c.spec === 'restauration' ? 2.5 : 3, cible: 'soi', sort: true, ecole: 'nature', coef: 0.86,
          condition: (s, c) => pct(c) < 0.5, effet(s, c) { sortSoin(s, c, this, n_(c, 1100, 2.2)); } },
      },
      ia(s, c, e, d, T) {
        if (T('seisme') || T('lien')) return true;
        const sur = controle(s, e) || d > 12 && CLASSES[e.classe].melee && (enracine(s, e) || ralenti(s, e) < 0.7);
        if (T('terre') && occupe(e)) return true;
        if (pct(c) < 0.3 && T('vagueInf')) return true;
        if (sur && (T('vague') || T('vagueInf'))) return true;
        if (T('maitrise') || T('tempete') || T('givre') || T('flammes') || T('terre')) return true;
        if (c.spec !== 'amelioration' || d > MELEE + 2) return T('eclair');
        return false;
      },
    },

    // ---------------------------------------------------------------- mage
    mage: {
      capacites: {
        bloc: { nom: 'Bloc de glace', icone: 'spell_frost_frost', niveau: 30, talent: { nom: 'Bloc de glace', arbre: 'givre', points: 21 }, mana: 0, recharge: 300, cible: 'soi', gcd: 0, sousControle: [],
          condition: (s, c) => pct(c) < 0.15,
          effet(s, c) { for (const id of Object.keys(c.auras)) if (c.auras[id].nefaste !== false) delete c.auras[id]; poser(s, c, c, 'bloc', 10, { nefaste: false, nom: 'Bloc de glace' }); } },
        transfert: { nom: 'Transfert', icone: 'spell_arcane_blink', niveau: 20, mana: 0.06, recharge: 15, cible: 'soi', gcd: 0, sousControle: ['etourdi'],
          condition: (s, c, e, d) => (aura(s, c, 'etourdi') || enracine(s, c)) && d < 10 || d < 4 && !controle(s, e) && !enracine(s, e) && !pret(s, c, 'nova'),
          effet(s, c, e) { retirer(c, 'etourdi'); retirerEntraves(s, c); c.x = borne(c.x + Math.sign(c.x - e.x || 1) * 20, BORNES[0], BORNES[1]); } },
        contresort: { nom: 'Contresort', icone: 'spell_frost_iceshock', niveau: 24, mana: 0.04, portee: 30, recharge: 30, sort: true, ecole: 'arcane', gcd: 0,
          condition: (s, c, e) => occupe(e) && (e.incant ? e.incant.ab : e.canal.ab).sort,
          effet(s, c, e) { interrompre(s, c, e, 8, 'Contresort'); if (c.spec === 'arcanes' && c.niveau >= 20) poser(s, c, e, 'silence', 4, { cat: 'silence', nom: 'Contresort amélioré' }); } },
        barriere: { nom: 'Barrière de glace', icone: 'spell_ice_lament', niveau: 40, talent: { nom: 'Barrière de glace', arbre: 'givre', points: 31 }, mana: 0.08, recharge: 30, cible: 'soi',
          condition: (s, c) => !aura(s, c, 'barriere'),
          effet(s, c) { c.auras.barriere = { fin: s.t + 60, reste: n_(c, 900, 2) + 0.1 * c.ps, nefaste: false, nom: 'Barrière de glace' }; } },
        nova: { nom: 'Nova de givre', icone: 'spell_frost_frostnova', niveau: 10, mana: 0.05, portee: 10, recharge: 25, sort: true, ecole: 'givre',
          condition: (s, c, e) => !controle(s, e) && !enracine(s, e) && CLASSES[e.classe].melee !== false,
          effet(s, c, e) { poser(s, c, e, 'racine', 8, { cat: 'racine', nom: 'Nova de givre', seuil: e.pvMax * 0.15, gel: true }); } },
        mouton: { nom: 'Métamorphose', icone: 'spell_nature_polymorph', niveau: 8, mana: 0.06, portee: 30, incant: 1.5, recharge: 0, sort: true, ecole: 'arcane',
          condition: (s, c, e, d) => !controle(s, e) && d > 8 && pct(c) < 0.65 && !Object.keys(e.auras).some((id) => id.startsWith('dot_')) && !c.dernierMouton,
          effet(s, c, e) { c.dernierMouton = true; if (poser(s, c, e, 'incap', 10, { cat: 'incap', nom: 'Métamorphose', casse: true, mouton: true })) { retirerEntraves(s, e); } } },
        cone: { nom: 'Cône de froid', icone: 'spell_frost_glacier', niveau: 26, mana: 0.1, portee: 10, recharge: 10, sort: true, ecole: 'givre', coef: 0.13,
          condition: (s, c, e) => ralenti(s, e) > 0.7,
          effet(s, c, e) { if (sortDegats(s, c, e, this, n_(c, 350))) poser(s, c, e, 'cone', 8, { ralenti: 0.5, nom: 'Cône de froid' }); } },
        traitFeu: { nom: 'Trait de feu', icone: 'spell_fire_fireball', niveau: 6, mana: 0.07, portee: 20, recharge: 8, sort: true, ecole: 'feu', coef: 0.43,
          effet(s, c, e) { sortDegats(s, c, e, this, n_(c, 470), { critBonus: aura(s, e, 'racine') && c.spec === 'givre' ? 50 : 0 }); } },
        presence: { nom: 'Présence spirituelle', icone: 'spell_nature_enchantarmor', niveau: 30, talent: { nom: 'Présence spirituelle', arbre: 'arcanes', points: 21 }, mana: 0, recharge: 180, cible: 'soi', gcd: 0,
          condition: (s, c) => pct(c) < 0.6 || controle(s, autre(s, c)), effet(s, c) { c.auras.presence = { fin: s.t + 60, nefaste: false }; } },
        pouvoirArcanes: { nom: 'Pouvoir des arcanes', icone: 'spell_nature_lightning', niveau: 40, talent: { nom: 'Pouvoir des arcanes', arbre: 'arcanes', points: 31 }, mana: 0, recharge: 180, cible: 'soi', gcd: 0,
          effet(s, c) { c.auras.pouvoirArcanes = { fin: s.t + 15, nefaste: false, nom: 'Pouvoir des arcanes' }; } },
        projectiles: { nom: 'Projectiles des arcanes', icone: 'spell_nature_starfall', niveau: 8, mana: 0.14, portee: 30, canal: 5, ticks: 5, sort: true, ecole: 'arcane', coef: 0.24,
          condition: (s, c) => c.spec === 'arcanes', tick(s, c, e) { sortDegats(s, c, e, this, n_(c, 230)); } },
        givre: { nom: 'Éclair de givre', icone: 'spell_frost_frostbolt02', niveau: 4, mana: 0.06, portee: 30, incant: (c) => c.niveau < 8 ? 1.5 : c.spec === 'givre' ? 2.5 : 3, sort: true, ecole: 'givre', coef: 0.81,
          effet(s, c, e) { const g = aura(s, e, 'racine') && c.spec === 'givre' ? 50 : 0; if (sortDegats(s, c, e, this, n_(c, 515), { critBonus: g })) poser(s, c, e, 'eclairGivre', 9, { ralenti: 0.6, nom: 'Éclair de givre' }); } },
        boule: { nom: 'Boule de feu', icone: 'spell_fire_fireball02', niveau: 1, mana: 0.08, portee: 35, incant: (c) => c.niveau < 6 ? 1.5 : c.spec === 'feu' ? 3 : 3.5, sort: true, ecole: 'feu', coef: 1,
          effet(s, c, e) { sortDegats(s, c, e, this, n_(c, 680)); } },
      },
      ia(s, c, e, d, T) {
        if (T('bloc') || T('transfert') || T('contresort') || T('barriere')) return true;
        if (d < 10 && T('nova')) return true;
        if (d < 10 && T('cone')) return true;
        if (T('mouton') || T('presence') || T('pouvoirArcanes')) return true;
        // Gelé au contact : on s'éloigne d'abord, on tire ensuite
        if (enracine(s, e) && d < 10) return false;
        if (aura(s, e, 'racine') && T('traitFeu')) return true;
        if (c.spec === 'feu') return T('traitFeu') || T('boule');
        return T('projectiles') || T('givre') || T('traitFeu') || T('boule');
      },
    },

    // ---------------------------------------------------------------- démoniste
    demoniste: {
      init(c) {
        if (c.niveau >= 30) c.familier = { nom: 'Chasseur corrompu', icone: 'spell_shadow_summonfelhunter', dps: 0.35 * c.niveau, ecole: 'ombre', prochain: 2, verrou: true };
        else if (c.niveau >= 10) c.familier = { nom: 'Marcheur du Vide', icone: 'spell_shadow_summonvoidwalker', dps: 0.35 * c.niveau, ecole: 'physique', prochain: 2 };
        else c.familier = { nom: 'Diablotin', icone: 'spell_shadow_summonimp', dps: 0.6 * c.niveau, ecole: 'feu', prochain: 2 };
        if (c.spec === 'demonologie') { c.familier.dps *= 1.3; if (c.niveau >= 40) c.multSubis = 0.9; }
        c.pierre = c.niveau >= 10;
      },
      capacites: {
        pierre: { nom: 'Pierre de soins', icone: 'inv_stone_04', niveau: 10, mana: 0, cible: 'soi', gcd: 0, recharge: 120,
          condition: (s, c) => pct(c) < 0.35 && c.pierre, effet(s, c) { c.pierre = false; sortSoin(s, c, this, n_(c, 1200, 2)); } },
        voile: { nom: 'Voile mortel', icone: 'spell_shadow_deathcoil', niveau: 42, mana: 0.11, portee: 30, recharge: 120, sort: true, ecole: 'ombre', coef: 0.21,
          condition: (s, c, e, d) => !controle(s, e) && (d < 8 && CLASSES[e.classe].melee || occupe(e) || pct(c) < 0.3),
          effet(s, c, e) { const r = sortDegats(s, c, e, this, n_(c, 476)); if (r) { soigner(s, c, r.x, this.nom, this.icone); poser(s, c, e, 'horreur', 3, { nom: 'Voile mortel' }); } } },
        hurlement: { nom: 'Hurlement de terreur', icone: 'spell_shadow_deathscream', niveau: 40, mana: 0.11, portee: 10, incant: 1.5, recharge: 40, sort: true, ecole: 'ombre',
          condition: (s, c, e, d) => !controle(s, e) && d < 8,
          effet(s, c, e) { if (distance(s) <= 10) poser(s, c, e, 'peur', 15, { cat: 'peur', nom: 'Hurlement de terreur', seuil: e.pvMax * 0.12 }); } },
        peur: { nom: 'Peur', icone: 'spell_shadow_possession', niveau: 8, mana: 0.06, portee: 20, incant: 1.5, sort: true, ecole: 'ombre',
          condition: (s, c, e) => !controle(s, e) && !aura(s, e, 'peur') && (CLASSES[e.classe].melee || pct(c) < 0.5),
          effet(s, c, e) { poser(s, c, e, 'peur', c.niveau >= 56 ? 20 : c.niveau >= 32 ? 15 : 10, { cat: 'peur', nom: 'Peur', seuil: e.pvMax * 0.12 }); } },
        corruption: { nom: 'Corruption', icone: 'spell_shadow_abominationexplosion', niveau: 4, mana: 0.07, portee: 30, incant: (c) => c.spec === 'affliction' && c.niveau >= 14 ? 0 : 2, sort: true, ecole: 'ombre', coefDot: 1,
          condition: (s, c, e) => !aura(s, e, 'dot_corruption'), effet(s, c, e) { periodique(s, c, e, this, n_(c, 822), 18, 3); log(s, c, 'degat', this.nom, this.icone); } },
        agonie: { nom: 'Malédiction d\'agonie', icone: 'spell_shadow_curseofsargeras', niveau: 8, mana: 0.06, portee: 30, sort: true, ecole: 'ombre', coefDot: 1.2,
          condition: (s, c, e) => !aura(s, e, 'dot_agonie'), effet(s, c, e) { periodique(s, c, e, this, n_(c, 1044), 24, 2); log(s, c, 'degat', this.nom, this.icone); } },
        siphon: { nom: 'Siphon de vie', icone: 'spell_shadow_requiem', niveau: 40, talent: { nom: 'Siphon de vie', arbre: 'affliction', points: 31 }, mana: 0.08, portee: 30, sort: true, ecole: 'ombre', coefDot: 0.5,
          condition: (s, c, e) => !aura(s, e, 'dot_siphon'), effet(s, c, e) { periodique(s, c, e, this, n_(c, 450), 30, 3, { drain: true }); } },
        immolation: { nom: 'Immolation', icone: 'spell_fire_immolation', niveau: 1, mana: 0.09, portee: 30, incant: (c) => c.spec === 'destruction' ? 1.5 : 2, sort: true, ecole: 'feu', coef: 0.2, coefDot: 0.65,
          condition: (s, c, e) => !aura(s, e, 'dot_immolation') && c.spec === 'destruction',
          effet(s, c, e) { if (sortDegats(s, c, e, this, n_(c, 280))) periodique(s, c, e, this, n_(c, 510), 15, 3); } },
        drain: { nom: 'Drain de vie', icone: 'spell_shadow_lifedrain02', niveau: 14, mana: 0.12, portee: 20, canal: 5, ticks: 5, sort: true, ecole: 'ombre', coef: 0.1,
          condition: (s, c) => pct(c) < 0.6, tick(s, c, e) { const r = sortDegats(s, c, e, this, n_(c, 71)); if (r) soigner(s, c, r.x, this.nom, this.icone); } },
        trait: { nom: 'Trait de l\'ombre', icone: 'spell_shadow_shadowbolt', niveau: 1, mana: 0.09, portee: 30, incant: (c) => c.niveau < 6 ? 1.7 : c.spec === 'destruction' ? 2.5 : 3, sort: true, ecole: 'ombre', coef: 0.86,
          effet(s, c, e) { sortDegats(s, c, e, this, n_(c, 480)); } },
      },
      ia(s, c, e, d, T) {
        if (T('pierre') || T('voile')) return true;
        if (d < 8 && T('hurlement')) return true;
        if (T('peur')) return true;
        if (T('corruption') || T('agonie') || T('siphon') || T('immolation')) return true;
        if (controle(s, e) && aura(s, e, 'peur')) return T('drain') || false;
        return T('drain') || T('trait');
      },
    },

    // ---------------------------------------------------------------- druide (simplifié)
    druide: {
      init(c) {
        // Forme de sélénien (Équilibre 31 points) : armure renforcée, critique des sorts
        if (c.niveau >= 40 && (c.talents.has('forme de selenien') || rang(c, 'equilibre') >= 31)) { c.armure = Math.round(c.armure * 1.8); c.critSort += 3; }
        c.forme = 'humanoide'; c.felin = c.spec === 'farouche' && c.niveau >= 20; c.ours = c.spec === 'farouche' && c.niveau >= 10 && c.niveau < 20; if (c.felin) c.furtifDebut = c.niveau >= 20; },
      capacites: {
        felin: { nom: 'Forme de félin', icone: 'ability_druid_catform', niveau: 20, mana: 0.1, cible: 'soi', sousControle: [],
          condition: (s, c) => c.felin && c.forme !== 'felin' && (pct(c) >= 0.45 || aura(s, c, 'dot_recuperation') && pct(c) >= 0.35),
          effet(s, c) { retirerEntraves(s, c); c.forme = 'felin'; c.energie = 0; } },
        ours: { nom: 'Forme d\'ours', icone: 'ability_racial_bearform', niveau: 10, mana: 0.1, cible: 'soi',
          condition: (s, c) => c.ours && c.forme !== 'ours' && pct(c) >= 0.45, effet(s, c) { retirerEntraves(s, c); c.forme = 'ours'; c.rage = 10; } },
        humanoide: { nom: 'Forme humanoïde', icone: 'spell_nature_healingtouch', niveau: 1, cible: 'soi', gcd: 0, forme: ['felin', 'ours'],
          condition: (s, c, e, d) => pct(c) < 0.4 && c.mana > c.manaMax * 0.2 && (controle(s, e) || enracine(s, e) || d > 10 || !CLASSES[e.classe].melee && pct(e) > 0.5),
          effet(s, c) { c.forme = 'humanoide'; } },
        bond: { nom: 'Bond', icone: 'ability_druid_supriseattack', niveau: 36, energie: 50, portee: MELEE, furtif: true, forme: ['felin'],
          effet(s, c, e) { poser(s, c, e, 'etourdi', 3, { cat: 'etourdi', nom: 'Bond' }); periodique(s, c, e, this, n_(c, 600), 18, 3, { saignement: true, ecole: 'physique' }); c.cp = Math.min(5, c.cp + 1); } },
        ravage: { nom: 'Ravager', icone: 'ability_druid_ravage', niveau: 32, energie: 60, portee: MELEE, furtif: true, forme: ['felin'],
          effet(s, c, e) { frappe(s, c, e, this, 3.5 * c.coupFelin(s) + n_(c, 400), { dos: true }); c.cp = Math.min(5, c.cp + 1); } },
        morsure: { nom: 'Morsure féroce', icone: 'ability_druid_ferociousbite', niveau: 32, energie: 35, portee: MELEE, forme: ['felin'],
          condition: (s, c, e) => c.cp >= 5 || c.cp >= 3 && pct(e) < 0.25,
          effet(s, c, e) { const cp = c.cp; c.cp = 0; const ex = c.energie; c.energie = 0; frappe(s, c, e, this, n_(c, 100 + 170 * cp) + 2.5 * ex + 0.03 * cp * c.pa); } },
        eventrer: { nom: 'Éventrer', icone: 'ability_ghoulfrenzy', niveau: 20, energie: 30, portee: MELEE, forme: ['felin'],
          condition: (s, c, e) => c.cp >= 4 && (c.niveau < 32 || pct(e) > 0.5) && !aura(s, e, 'dot_eventrer'),
          effet(s, c, e) { const cp = c.cp; c.cp = 0; if (jet(s, c, e, { inesquivable: false }) !== 'rate') periodique(s, c, e, this, n_(c, 160 * cp) + 0.04 * cp * c.pa, 12, 2, { saignement: true, ecole: 'physique' }); } },
        griffure: { nom: 'Griffure', icone: 'ability_druid_disembowel', niveau: 24, energie: 35, portee: MELEE, forme: ['felin'],
          condition: (s, c, e) => !aura(s, e, 'dot_griffure'),
          effet(s, c, e) { if (frappe(s, c, e, this, n_(c, 66))) { periodique(s, c, e, this, n_(c, 90), 9, 3, { saignement: true, ecole: 'physique' }); c.cp = Math.min(5, c.cp + 1); } } },
        griffe: { nom: 'Griffe', icone: 'ability_druid_rake', niveau: 20, energie: 40, portee: MELEE, forme: ['felin'],
          effet(s, c, e) { if (frappe(s, c, e, this, c.coupFelin(s) + n_(c, 115))) c.cp = Math.min(5, c.cp + 1); } },
        sonner: { nom: 'Sonner', icone: 'ability_druid_bash', niveau: 14, rage: 10, portee: MELEE, recharge: 60, forme: ['ours'],
          condition: (s, c, e) => !controle(s, e), effet(s, c, e) { poser(s, c, e, 'etourdi', 2, { cat: 'etourdi', nom: 'Sonner' }); } },
        mutiler: { nom: 'Mutiler', icone: 'ability_druid_maul', niveau: 10, rage: 15, portee: MELEE, forme: ['ours'], gcd: 0,
          condition: (s, c) => !c.prochainCoup, effet(s, c) { c.prochainCoup = { nom: 'Mutiler', icone: 'ability_druid_maul', bonus: n_(c, 128) }; } },
        ecorce: { nom: 'Écorce', icone: 'spell_nature_stoneclawtotem', niveau: 44, mana: 0.05, recharge: 60, cible: 'soi', gcd: 0, sousControle: ['etourdi', 'peur', 'incap'], forme: ['humanoide'],
          condition: (s, c) => pct(c) < 0.5, effet(s, c) { c.auras.ecorce = { fin: s.t + 15, nefaste: false, nom: 'Écorce' }; } },
        sarments: { nom: 'Sarments', icone: 'spell_nature_stranglevines', niveau: 8, mana: 0.06, portee: 30, incant: 1.5, sort: true, ecole: 'nature', forme: ['humanoide'],
          condition: (s, c, e, d) => CLASSES[e.classe].melee && !enracine(s, e) && !controle(s, e) && (d > 6 || !c.felin),
          effet(s, c, e) { poser(s, c, e, 'racine', c.niveau >= 38 ? 21 : c.niveau >= 18 ? 15 : 12, { cat: 'racine', nom: 'Sarments', seuil: e.pvMax * 0.12 }); } },
        recuperation: { nom: 'Récupération', icone: 'spell_nature_rejuvenation', niveau: 4, mana: 0.09, cible: 'soi', sort: true, ecole: 'nature', coefDot: 0.8, forme: ['humanoide'],
          condition: (s, c) => pct(c) < 0.8 && !aura(s, c, 'dot_recuperation'), effet(s, c) { periodique(s, c, c, this, n_(c, 888, 2.2), 12, 3, { soin: true }); } },
        retablissement: { nom: 'Rétablissement', icone: 'spell_nature_resistnature', niveau: 12, mana: 0.14, incant: 2, cible: 'soi', sort: true, ecole: 'nature', coef: 0.5, coefDot: 0.5, forme: ['humanoide'],
          condition: (s, c) => pct(c) < 0.55, effet(s, c) { sortSoin(s, c, this, n_(c, 450, 2.2)); periodique(s, c, c, this, n_(c, 650, 2.2), 21, 3, { soin: true }); } },
        toucher: { nom: 'Toucher guérisseur', icone: 'spell_nature_healingtouch', niveau: 1, mana: 0.15, incant: (c) => c.niveau < 14 ? 2.5 : c.spec === 'restauration' ? 3 : 3.5, cible: 'soi', sort: true, ecole: 'nature', coef: 1, forme: ['humanoide'],
          condition: (s, c, e) => pct(c) < 0.5 && (controle(s, e) || enracine(s, e)), effet(s, c) { sortSoin(s, c, this, n_(c, 1200, 2.2)); } },
        feuLunaire: { nom: 'Éclat lunaire', icone: 'spell_nature_starfall', niveau: 4, mana: 0.08, portee: 30, sort: true, ecole: 'arcane', coef: 0.15, coefDot: 0.5, forme: ['humanoide'],
          condition: (s, c, e) => !aura(s, e, 'dot_feuLunaire'),
          effet(s, c, e) { if (sortDegats(s, c, e, this, n_(c, 200))) periodique(s, c, e, this, n_(c, 420), 12, 3); } },
        stellaire: { nom: 'Feu stellaire', icone: 'spell_arcane_starfire', niveau: 20, mana: 0.1, portee: 30, incant: (c) => c.spec === 'equilibre' ? 3 : 3.5, sort: true, ecole: 'arcane', coef: 1, forme: ['humanoide'],
          condition: (s, c, e, d) => controle(s, e) || enracine(s, e) && d > 8 || d > 20 || c.spec === 'equilibre' && !CLASSES[e.classe].melee,
          effet(s, c, e) { sortDegats(s, c, e, this, n_(c, 540)); } },
        colere: { nom: 'Colère', icone: 'spell_nature_abolishmagic', niveau: 1, mana: 0.06, portee: 30, incant: (c) => c.spec === 'equilibre' ? 1.5 : 2, sort: true, ecole: 'nature', coef: 0.57, forme: ['humanoide'],
          effet(s, c, e) { sortDegats(s, c, e, this, n_(c, 280)); } },
      },
      ia(s, c, e, d, T) {
        if (T('ecorce')) return true;
        if (c.forme === 'humanoide') {
          if (T('felin') || T('ours')) return true;
          if (pct(c) < 0.4 && T('recuperation')) return true;
          return T('sarments') || T('toucher') || T('retablissement') || T('recuperation') || T('feuLunaire') || T('stellaire') || T('colere');
        }
        if (T('humanoide')) return true;
        if (c.forme === 'felin') {
          if (furtif(s, c)) return d <= MELEE && (T('bond') || T('ravage'));
          if (d > MELEE && (enracine(s, c) || ralenti(s, c) < 0.8) && c.mana > c.manaMax * 0.35) { c.forme = 'humanoide'; return T('felin'); }
          return T('morsure') || T('eventrer') || T('griffure') || T('griffe');
        }
        return T('sonner') || T('mutiler');
      },
    },
  };
  const DOUX = ['marteau', 'repentir', 'choc', 'dispersion', 'wyverne', 'piege', 'intimidation', 'desengagement', 'cecite', 'coupDePied', 'volee', 'cri', 'charge', 'interception', 'contresort', 'nova', 'mouton', 'silence', 'peur', 'hurlement', 'sarments', 'seisme', 'lien', 'sonner', 'coupBas', 'aiguillon', 'suriner'];
  const CASSE = ['repentir', 'dispersion', 'wyverne', 'cecite', 'mouton', 'suriner'];
  for (const cl in KITS) for (const id in KITS[cl].capacites) {
    const ab = KITS[cl].capacites[id];
    ab.id = id;
    const src = ab.effet ? ab.effet.toString() : '';
    ab.seLogue = src.includes('log(');
    ab.degatsLogues = src.includes('sortDegats') || src.includes('frappe(');
    if (DOUX.includes(id)) ab.doux = true;
    if (CASSE.includes(id)) ab.casseIncap = true;
  }
  function pret(s, c, id) { return (c.cd[id] || 0) <= s.t; }
  const INTERRUPTIONS = ['volee', 'coupDePied', 'terre', 'contresort', 'silence'];
  function peutInterrompre(s, e, d) {
    if (e.pv <= 0 || controle(s, e) || fragile(s, e) || !visible(s, e)) return false;
    return INTERRUPTIONS.some((id) => {
      const ab = e.kit.capacites[id];
      return ab && connait(e, ab) && pret(s, e, ab.partage || id) && d <= (ab.portee || MELEE) && d <= 10
        && (!ab.energie || e.energie >= ab.energie - 10) && (!ab.rage || e.rage >= ab.rage);
    });
  }

  // ------------------------------------------------------------ combattant
  function creerCombattant(p, cote, x) {
    const st = p.stats || {};
    const n = p.niveau || 60;
    const cl = CLASSES[p.classe] ? p.classe : 'guerrier';
    const pvMax = Math.max(50, Math.round(st.pv || 100));
    const c = {
      cote, x, cle: p.cle, nom: p.nom, classe: cl, spec: p.spec || null, niveau: n, kit: KITS[cl],
      pvMax, pv: pvMax, manaMax: st.mana || 0, mana: st.mana || 0, rage: 0, energie: 100, cp: 0,
      armure: st.armure || 0, esquive: st.esquive || 0, parade: st.parade || 0, blocage: st.blocage || 0,
      valeurBlocage: n_({ niveau: n }, 40, 1.2),
      crit: st.critique || 5, critSort: 2 + (st.intelligence || 0) / Math.max(10, n), critDistance: null,
      pa: st.pa || 0, ps: st.puissanceSorts || 0,
      pad: n * 2 + 2 * (st.agilite || 0) - 10,
      arme: st.arme && st.arme.max ? Object.assign({}, st.arme) : { min: n, max: n * 1.5, vitesse: 2 },
      distance: st.distance || null,
      regen: (st.regenMana || 0) / 5,
      auras: {}, cd: {}, dr: {}, gcdFin: 0, incant: null, canal: null, swing: 0.5, tir: 0.5,
      forme: null, charge: false, esquiveSubie: -99, prochainCoup: null, dernierMana: -99,
      talents: new Set((p.talents || []).map((t) => sansAccent(typeof t === 'string' ? t : t.nom))),
      points: {}, multSoins: 1, multBouclier: 1, multBlanc: 1,
      bilan: { degats: {}, soins: {}, cc: {} },
    };
    for (const sp of p.specs || []) c.points[sp.id] = sp.points || 0;
    if (cl === 'paladin' && c.spec === 'sacre') c.multSoins = 1.2;
    if (cl === 'chasseur') c.critDistance = c.crit;
    // Arme à distance : dégâts de l'arme + puissance d'attaque à distance / 14 × vitesse
    c.tirDistance = (s) => {
      const w = c.distance || { min: c.arme.min * 0.5, max: c.arme.max * 0.5, vitesse: 3 };
      return w.min + (w.max - w.min) * s.alea() + c.pad / 14 * w.vitesse;
    };
    // Félin : coups rapides calés sur le niveau et la puissance d'attaque
    // La fiche est lue en forme humanoïde : le félin ajoute Agilité + 2 × niveau à la puissance d'attaque
    c.paFelin = c.pa + (st.agilite || 0) + 2 * n;
    c.critFelin = c.crit + (c.spec === 'farouche' && n >= 20 ? 6 : 0);
    c.coupFelin = (s) => (n_(c, 55, 1) + c.paFelin / 14) * (0.9 + 0.2 * s.alea());
    if (c.kit.init) c.kit.init(c);
    if (c.familier) c.familier.prochain = 2;
    return c;
  }

  // ------------------------------------------------------------ actions
  function coutDe(c, ab) {
    if (ab.mana) return { res: 'mana', x: Math.round(ab.mana * c.manaMax) };
    if (ab.rage) return { res: 'rage', x: ab.rage };
    if (ab.energie) {
      let x = ab.energie;
      if (ab.id === 'pernicieuse' && c.spec === 'combat' && c.niveau >= 14) x -= 5;
      if (ab.id === 'griffe' && c.niveau >= 20 && c.spec === 'farouche') x -= 5;
      return { res: 'energie', x };
    }
    return null;
  }
  function essayer(s, c, id) {
    const ab = c.kit.capacites[id];
    if (!ab || !connait(c, ab)) return false;
    if (!pret(s, c, ab.partage || id)) return false;
    if (ab.gcd !== 0 && c.gcdFin > s.t) return false;
    if (occupe(c)) return false;
    const ctl = cc(s, c);
    if (ctl && !(ab.sousControle && ab.sousControle.includes(ctl))) return false;
    if (aura(s, c, 'bloc') && id !== 'bloc') return false;
    if (ab.sort && (aura(s, c, 'silence') || (aura(s, c, 'verrou') && aura(s, c, 'verrou').ecole === ab.ecole))) return false;
    if (ab.forme && !ab.forme.includes(c.forme || 'humanoide')) return false;
    if (!ab.forme && c.forme && c.forme !== 'humanoide' && ab.cible !== 'soi' && ab.sort) return false;
    if (ab.furtif && !furtif(s, c)) return false;
    const e = autre(s, c);
    const d = distance(s);
    if (ab.cible !== 'soi') {
      if (!visible(s, e)) return false;
      if (d > (ab.portee || MELEE) || d < (ab.min || 0)) return false;
      if (immunise(s, e)) return false;
    }
    const tempsIncant = typeof ab.incant === 'function' ? ab.incant(c) : ab.incant || 0;
    // Pendant un contrôle fragile, on ne lance qu'un sort qui partira à la fin du contrôle
    if (ab.cible !== 'soi' && fragile(s, e) && !ab.doux && !(tempsIncant && s.t + tempsIncant >= aura(s, e, 'incap').fin - 0.3)) return false;
    // On évite d'incanter au contact d'un adversaire qui a une interruption prête (sauf en dernier recours)
    if (tempsIncant > 0 && !ab.doux && pct(c) > 0.2 && peutInterrompre(s, e, d)) return false;
    if (ab.casseIncap && dotsSur(s, e)) return false;
    if (ab.condition && !ab.condition(s, c, e, d)) return false;
    const cout = coutDe(c, ab);
    if (cout && c[cout.res] < cout.x) return false;
    if (cout) { c[cout.res] -= cout.x; if (cout.res === 'mana' && cout.x > 0) c.dernierMana = s.t; }
    const rech = typeof ab.recharge === 'function' ? ab.recharge(c) : ab.recharge || 0;
    if (rech) c.cd[ab.partage || id] = s.t + rech;
    if (ab.gcd !== 0) c.gcdFin = s.t + (ab.gcd || (c.ressource === 'energie' || c.forme === 'felin' ? 1 : 1.5));
    if (furtif(s, c) && !ab.gardeFurtif) retirer(c, 'furtif');
    let incant = tempsIncant;
    if (incant && aura(s, c, 'presence')) { incant = 0; retirer(c, 'presence'); }
    action(s, c, ab);
    if (ab.canal) {
      c.canal = { ab, cible: e, fin: s.t + ab.canal, prochain: s.t + ab.canal / ab.ticks };
      log(s, c, 'sort', `${ab.nom} (canalisé)`, ab.icone);
    } else if (incant > 0) {
      c.incant = { ab, cible: e, fin: s.t + incant, debut: s.t, recul: 0 };
    } else {
      if (ab.cible === 'soi' || !ab.seLogue) log(s, c, 'sort', ab.nom, ab.icone);
      ab.effet.call(ab, s, c, e);
    }
    return true;
  }

  // ------------------------------------------------------------ boucle
  function vitesse(s, c) {
    if (controle(s, c) && !aura(s, c, 'peur')) return 0;
    if (enracine(s, c)) return 0;
    let v = 7 * ralenti(s, c);
    if (aura(s, c, 'liberte')) v = 7;
    if (aura(s, c, 'sprint')) v *= 1.7;
    if (aura(s, c, 'peur')) v *= 0.7;
    if (furtif(s, c)) v *= c.classe === 'voleur' ? 0.85 : 0.8;
    if (c.lienSubi) v *= 0.5;
    return v;
  }
  function deplacer(s) {
    for (const c of s.c) {
      if (c.pv <= 0 || occupe(c)) continue;
      const e = autre(s, c);
      const d = distance(s);
      const dir = Math.sign(e.x - c.x) || 1;
      const v = vitesse(s, c) * PAS;
      if (!v) continue;
      if (aura(s, c, 'peur')) { c.x = borne(c.x - dir * v, BORNES[0], BORNES[1]); continue; }
      const cl = CLASSES[c.classe];
      const veutMelee = cl.melee || c.forme === 'felin' || c.forme === 'ours' || (c.classe === 'chaman' && c.spec !== 'elementaire');
      let [min, max] = veutMelee ? [0, 3.5] : (cl.distance || [12, 28]);
      if (c.classe === 'chaman' && !veutMelee) [min, max] = [12, 25];
      if (!visible(s, e)) { if (d > 2) c.x += dir * Math.min(v, d - 2); continue; }
      // Le personnage à distance recule s'il est plus rapide ou si la cible ne peut pas le suivre
      const libre = controle(s, e) || enracine(s, e) || vitesse(s, e) < v / PAS * 0.85;
      if (d > max) c.x += dir * Math.min(v, d - max);
      else if (d < min && libre && CLASSES[e.classe].melee !== false) c.x = borne(c.x - dir * v, BORNES[0], BORNES[1]);
    }
  }
  function attaquesAuto(s) {
    const d = distance(s);
    for (const c of s.c) {
      const e = autre(s, c);
      if (c.pv <= 0 || controle(s, c) || occupe(c) || !visible(s, e) || furtif(s, c) || immunise(s, e) || fragile(s, e)) continue;
      const hate = aura(s, c, 'deluge') ? 1.2 : 1;
      if (d <= MELEE && s.t >= c.swing) {
        const felin = c.forme === 'felin';
        const ours = c.forme === 'ours';
        const vit = felin ? 1 : ours ? 2.5 : c.arme.vitesse;
        c.swing = s.t + vit / hate;
        const pc = c.prochainCoup;
        if (pc && c.classe === 'guerrier' && c.rage < 15) c.prochainCoup = null;
        const j = jet(s, c, e, { blanc: !pc });
        const nom = c.prochainCoup ? c.prochainCoup.nom : 'Attaque';
        const icone = c.prochainCoup ? c.prochainCoup.icone : 'inv_sword_04';
        if (c.prochainCoup) { if (c.classe === 'guerrier') c.rage -= 15; if (ours) c.rage -= 15; }
        const bonus = c.prochainCoup ? c.prochainCoup.bonus : 0;
        c.prochainCoup = null;
        if (j === 'rate' || j === 'esquive' || j === 'parade') { coup(s, e, nom, icone, 0, LIBELLES[j]); if (j === 'esquive') c.esquiveSubie = s.t; continue; }
        let m = felin ? c.coupFelin(s) : ours ? c.coupFelin(s) * 2.5 : tirage(s, c) * c.multBlanc;
        m += bonus;
        if (j === 'bloque') m = Math.max(0, m - e.valeurBlocage);
        const x = degats(s, c, e, m, { nom, icone, ecole: 'physique', crit: j === 'critique', blanc: true });
        if (c.classe === 'guerrier' || ours) c.rage = Math.min(100, c.rage + 7.5 * x / facteurRage(c.niveau));
        // Sceau (paladin), Furie-des-vents ou Croque-roc (chaman), poisons (voleur), Frappe-tempête
        if (c.classe === 'paladin' && c.sceau) degats(s, c, e, n_(c, 75, 1.4) * c.arme.vitesse / 3.5 + 0.1 * c.ps, { nom: 'Sceau', icone: 'ability_thunderbolt', ecole: 'sacre' });
        if (c.classe === 'chaman' && c.spec !== 'elementaire') {
          if (c.niveau >= 30 && s.alea() < 0.2) for (let i = 0; i < 2; i++) if (jet(s, c, e, {}) !== 'rate') degats(s, c, e, tirage(s, c) + n_(c, 45), { nom: 'Furie-des-vents', icone: 'spell_nature_cyclone', ecole: 'physique' });
          else if (c.niveau < 30) degats(s, c, e, n_(c, 40, 1.3) * c.arme.vitesse / 3.6, { nom: 'Croque-roc', icone: 'spell_nature_rockbiter', ecole: 'physique' });
        }
        if (c.classe === 'voleur' && c.niveau >= 20 && s.alea() < 0.3) {
          degats(s, c, e, n_(c, 112), { nom: 'Poison instantané', icone: 'ability_poisons', ecole: 'nature' });
          if (s.alea() < 0.3 && !e.immuniteRalenti) poser(s, c, e, 'poisonAffaiblissant', 12, { ralenti: 0.5, nom: 'Poison affaiblissant' });
        }
        const ts = aura(s, e, 'tempete');
        void ts;
        // Bouclier de foudre : riposte sur l'attaquant
        if (e.classe === 'chaman' && e.charges > 0 && x > 0) { e.charges--; degats(s, e, c, n_(e, 280), { nom: 'Bouclier de foudre', icone: 'spell_nature_lightningshield', ecole: 'nature' }); }
      } else if (c.classe === 'chasseur' && d >= 8 && d <= 35 && s.t >= c.tir) {
        const w = c.distance || { vitesse: 3 };
        c.tir = s.t + w.vitesse / hate;
        const j = jet(s, c, e, { distance: true });
        if (j === 'rate') { coup(s, e, 'Tir automatique', 'inv_weapon_bow_05', 0, 'raté'); continue; }
        degats(s, c, e, c.tirDistance(s), { nom: 'Tir automatique', icone: 'inv_weapon_bow_05', ecole: 'physique', crit: j === 'critique' });
      }
    }
  }
  function periodiques(s) {
    for (const c of s.c) {
      const e = autre(s, c);
      // Effets périodiques posés sur c
      for (const id of Object.keys(c.auras)) {
        const a = c.auras[id];
        if (!a || !a.periode) continue;
        while (a.prochain <= s.t + 1e-9 && a.prochain <= a.fin) {
          a.prochain += a.periode;
          const src = s.c[a.src];
          if (a.soin) { soigner(s, c, a.montant, a.nom, a.icone); continue; }
          const x = degats(s, src, c, a.montant, { nom: a.nom, icone: a.icone, ecole: a.ecole, periodique: true, saignement: a.saignement });
          if (a.drain && x) soigner(s, src, x, a.nom, a.icone);
        }
        if (a.fin <= s.t) delete c.auras[id];
      }
      // Familier
      const f = c.familier;
      if (f && c.pv > 0 && s.t >= f.prochain && visible(s, e) && s.t > 1.5) {
        f.prochain = s.t + 2;
        const ech2 = f.ecole === 'physique' ? jet(s, { niveau: c.niveau, crit: 5, auras: {} }, e, {}) : 'touche';
        if (ech2 !== 'rate' && ech2 !== 'esquive' && ech2 !== 'parade') degats(s, c, e, f.dps * 2, { nom: f.nom, icone: f.icone, ecole: f.ecole, crit: ech2 === 'critique' });
        // Verrou magique du chasseur corrompu
        if (f.verrou && occupe(e) && (c.cd.verrouMagique || 0) <= s.t) { c.cd.verrouMagique = s.t + 24; interrompre(s, c, e, 6, 'Verrou magique'); }
      }
      // Totems
      if (c.lien) {
        if (s.t > c.lien.fin) c.lien = null;
        else e.lienSubi = Math.abs(e.x - c.lien.x) < 10 && !aura(s, e, 'liberte');
      } else e.lienSubi = false;
      if (c.seisme && s.t >= c.seisme.prochain) { c.seisme.prochain = s.t + 5; if (aura(s, c, 'peur')) { retirer(c, 'peur'); log(s, c, 'info', 'Totem de séisme : peur dissipée'); } }
      // Ressources
      if (c.ressource === 'energie' || c.forme === 'felin' || c.classe === 'voleur') c.energie = Math.min(100, c.energie + (aura(s, c, 'adrenaline') ? 20 : 10) * PAS);
      if (c.manaMax) c.mana = Math.min(c.manaMax, c.mana + c.regen * PAS * (s.t - c.dernierMana > 5 ? 1 : 0.15));
      // La métamorphose rend rapidement des points de vie
      const inc = aura(s, c, 'incap');
      if (inc && inc.mouton) c.pv = Math.min(c.pvMax, c.pv + c.pvMax * 0.03 * PAS);
    }
  }
  function incantations(s) {
    for (const c of s.c) {
      const e = autre(s, c);
      if (c.incant && s.t >= c.incant.fin) {
        const ab = c.incant.ab;
        c.incant = null;
        if (ab.cible !== 'soi' && (!visible(s, e) || distance(s) > (ab.portee || 30) + 3)) { log(s, c, 'echec', `${ab.nom} : cible hors de portée`, ab.icone); continue; }
        if (ab.cible !== 'soi' && !ab.degatsLogues) log(s, c, 'sort', ab.nom, ab.icone);
        ab.effet.call(ab, s, c, e);
      }
      if (c.canal) {
        const k = c.canal;
        if (!visible(s, e) || distance(s) > (k.ab.portee || 30) + 3) { c.canal = null; continue; }
        while (c.canal && s.t >= k.prochain - 1e-9 && k.prochain <= k.fin + 1e-9) {
          k.prochain += k.ab.canal / k.ab.ticks;
          k.ab.tick.call(k.ab, s, c, e);
        }
        if (c.canal && s.t >= k.fin) c.canal = null;
      }
    }
  }

  // Image de la cinématique : ce que montrent les cadres d'unité et l'arène à l'instant t
  function image(s) {
    return {
      t: s.t,
      c: s.c.map((c) => {
        const res = c.forme === 'felin' ? 'energie' : c.forme === 'ours' ? 'rage' : c.ressource;
        const v = res === 'mana' ? (c.manaMax ? c.mana / c.manaMax : 0) : c[res] / 100;
        const k = c.incant || c.canal;
        const ctl = CONTROLES.find((id) => aura(s, c, id)) || (enracine(s, c) ? 'racine' : null);
        return {
          x: Math.round(c.x * 100) / 100, pv: Math.round(c.pv), pvMax: c.pvMax,
          res, r: Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000, rv: Math.round(res === 'mana' ? c.mana : c[res]),
          mana: c.forme && c.forme !== 'humanoide' && c.manaMax ? Math.round(c.mana / c.manaMax * 1000) / 1000 : null,
          cp: c.cp || 0, forme: c.forme || null, furtif: furtif(s, c), fam: !!c.familier && c.pv > 0,
          inc: k ? { nom: k.ab.nom, icone: k.ab.icone || null, p: c.incant ? Math.min(1, (s.t - k.debut) / Math.max(0.1, k.fin - k.debut)) : Math.max(0, (k.fin - s.t) / k.ab.canal), canal: !c.incant } : null,
          cc: ctl ? { id: ctl, nom: aura(s, c, ctl).nom } : null,
        };
      }),
    };
  }

  function creerDuel(p1, p2, options) {
    options = options || {};
    const s = {
      t: 0, alea: creerAlea(options.graine || 1), fin: false,
      journal: options.journal ? [] : null, evenements: [], courbe: options.journal ? [] : null,
      images: options.journal ? [] : null, actions: options.journal ? [] : null, coups: options.journal ? [] : null,
    };
    s.c = [creerCombattant(p1, 0, 0), creerCombattant(p2, 1, 20)];
    for (const c of s.c) {
      c.ressource = c.classe === 'voleur' ? 'energie' : CLASSES[c.classe].ressource;
      if (c.furtifDebut) { c.auras.furtif = { fin: 9999, nefaste: false, nom: 'Camouflage' }; if (c.classe === 'druide') c.forme = 'felin'; }
      if (c.classe === 'druide' && c.ours) { c.forme = 'ours'; }
    }
    return s;
  }
  function pas(s) {
    s.t = Math.round((s.t + PAS) * 1000) / 1000;
    periodiques(s);
    if (s.fin) return;
    incantations(s);
    if (s.fin) return;
    // L'ordre d'action alterne pour ne favoriser personne
    const ordre = Math.round(s.t * 10) % 2 ? [s.c[0], s.c[1]] : [s.c[1], s.c[0]];
    for (const c of ordre) {
      if (c.pv <= 0 || s.fin) continue;
      const e = autre(s, c);
      const T = (id) => essayer(s, c, id);
      c.kit.ia(s, c, e, distance(s), T);
    }
    if (s.fin) return;
    attaquesAuto(s);
    deplacer(s);
    if (s.courbe && Math.round(s.t * 10) % 5 === 0) s.courbe.push([s.t, pct(s.c[0]), pct(s.c[1])]);
    if (s.images) s.images.push(image(s));
  }
  function resultat(s) {
    const [a, b] = s.c;
    const vainqueur = a.pv <= 0 && b.pv > 0 ? 1 : b.pv <= 0 && a.pv > 0 ? 0 : null;
    const r = { vainqueur, duree: s.t, pv: [pct(a), pct(b)], bilans: [a.bilan, b.bilan] };
    if (s.journal) {
      r.journal = s.journal; r.courbe = s.courbe; r.evenements = s.evenements; r.noms = [a.nom, b.nom];
      r.images = s.images; r.actions = s.actions; r.coups = s.coups;
      r.familiers = s.c.map((c) => (c.familier ? { nom: c.familier.nom, icone: c.familier.icone } : null));
    }
    return r;
  }
  function duel(p1, p2, options) {
    const s = creerDuel(p1, p2, options);
    if (s.courbe) s.courbe.push([0, 1, 1]);
    if (s.images) s.images.push(image(s));
    while (!s.fin && s.t < DUREE_MAX) pas(s);
    if (s.courbe) s.courbe.push([s.t, pct(s.c[0]), pct(s.c[1])]);
    return resultat(s);
  }

  // i-ème duel d'une série : sa graine, et le côté de départ qui alterne
  function tirageSerie(graine, i) { return { g: (graine || 7) * 7919 + i * 104729, inverse: i % 2 === 1 }; }

  // Série de duels : taux de victoire de p1, nuls, durée moyenne, PV restants du vainqueur
  function serie(p1, p2, n, graine) {
    n = n || 100;
    let v = 0, nuls = 0, duree = 0, pvFin = 0;
    const degats = {};
    let meilleur = null;
    for (let i = 0; i < n; i++) {
      // Le côté de départ alterne : chacun commence une fois sur deux à gauche
      const { g, inverse } = tirageSerie(graine, i);
      const r = inverse ? duel(p2, p1, { graine: g }) : duel(p1, p2, { graine: g });
      const moi = inverse ? 1 : 0;
      if (r.vainqueur === moi) { v++; pvFin += r.pv[moi]; } else if (r.vainqueur == null) nuls++;
      duree += r.duree;
      for (const [nom, x] of Object.entries(r.bilans[moi].degats)) degats[nom] = (degats[nom] || 0) + x.total / n;
      if (!meilleur) meilleur = { graine: g, inverse };
    }
    return { n, taux: v / n, tauxNul: nuls / n, duree: duree / n, pvVainqueur: v ? pvFin / v : 0, degats };
  }

  // Les duels d'une série (mêmes graines que serie) regroupés par issue pour p1, la plus fréquente d'abord.
  // Chaque issue garde son duel le plus typique : durée et PV du vainqueur les plus proches de la médiane.
  function scenarios(p1, p2, n, graine) {
    n = n || 30;
    const groupes = new Map();
    for (let i = 0; i < n; i++) {
      const { g, inverse } = tirageSerie(graine, i);
      const r = inverse ? duel(p2, p1, { graine: g }) : duel(p1, p2, { graine: g });
      const moi = inverse ? 1 : 0;
      const issue = r.vainqueur == null ? 'nul' : r.vainqueur === moi ? 'victoire' : 'defaite';
      if (!groupes.has(issue)) groupes.set(issue, []);
      groupes.get(issue).push({ graine: g, inverse, duree: r.duree, pvMoi: r.pv[moi], pvAdv: r.pv[1 - moi], pvVainqueur: r.vainqueur == null ? 0 : r.pv[r.vainqueur] });
    }
    const mediane = (xs) => { const t = xs.slice().sort((a, b) => a - b); return t[Math.floor(t.length / 2)]; };
    return [...groupes].map(([issue, ds]) => {
      const md = mediane(ds.map((d) => d.duree)), mp = mediane(ds.map((d) => d.pvVainqueur));
      const ecart = (d) => Math.abs(d.duree - md) / 10 + Math.abs(d.pvVainqueur - mp);
      const representant = ds.reduce((m, d) => (ecart(d) < ecart(m) ? d : m));
      return { issue, n: ds.length, part: ds.length / n, dureeMediane: md, representant };
    }).sort((a, b) => b.n - a.n || (a.issue < b.issue ? -1 : 1));
  }
  // Rejoue le représentant d'un scénario avec la cinématique ; moi : côté de p1 dans ce duel
  function rejouer(p1, p2, sc) {
    const d = sc.representant;
    const r = d.inverse ? duel(p2, p1, { graine: d.graine, journal: true }) : duel(p1, p2, { graine: d.graine, journal: true });
    r.moi = d.inverse ? 1 : 0;
    return r;
  }

  // Un duel raconté : on rejoue des graines jusqu'à tomber sur l'issue la plus fréquente
  function duelRaconte(p1, p2, issue, graine) {
    let dernier = null;
    for (let i = 0; i < 40; i++) {
      const r = duel(p1, p2, { graine: (graine || 3) * 31 + i * 977, journal: true });
      dernier = r;
      if (issue == null || r.vainqueur === issue) return r;
    }
    return dernier;
  }

  // Adversaires types du niveau
  function adversairesTypes(niveau) {
    return SPECS_TYPES.map((x) => profilType(x.classe, x.spec, niveau, x.nom, x.mods));
  }
  // Variante d'un profil (conseils) : stats multipliées
  function variante(p, mods) {
    const q = JSON.parse(JSON.stringify(p));
    for (const [k, f] of Object.entries(mods)) {
      if (k === 'arme') { q.stats.arme.min *= f; q.stats.arme.max *= f; if (q.stats.distance) { q.stats.distance.min *= f; q.stats.distance.max *= f; } }
      else if (typeof q.stats[k] === 'number') q.stats[k] = k === 'critique' || k === 'esquive' ? q.stats[k] + f : q.stats[k] * f;
    }
    return q;
  }

  const Arene = { CLASSES, TYPES, SPECS_TYPES, KITS, profilType, adversairesTypes, duel, serie, scenarios, rejouer, duelRaconte, variante, creerAlea, ech, connait, creerCombattant, sansAccent, DUREE_MAX };
  racine.Arene = Arene;
  if (typeof module !== 'undefined' && module.exports) module.exports = Arene;
})(typeof window !== 'undefined' ? window : globalThis);
