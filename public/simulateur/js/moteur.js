/*
 * Moteur de duel : un druide contre un adversaire de même niveau (60 par défaut).
 * Pas de 0,1 s, positions sur une ligne (en mètres), aléatoire à graine.
 * Utilisable dans le navigateur (window.Moteur) et dans Node (require).
 */
(function (racine) {
  'use strict';

  const D = racine.DONNEES || (typeof require !== 'undefined' ? require('./donnees.js') : null);
  const { SORTS, ADVERSAIRES, ARBRES, CONSTANTES } = D;
  const NIVEAUX_ADV = D.NIVEAUX_ADV || {};
  const NIVEAUX_CAPA = D.NIVEAUX_CAPA || {};
  // Constantes du niveau en cours de simulation (niveau 60 hors simulation)
  let K = CONSTANTES;

  const PAS = 0.1;
  const DUREE_MAX = 180;
  const CONTROLES = ['etourdi', 'peur', 'mouton', 'gel', 'desoriente', 'horreur', 'bloc'];
  const RALENTIS = ['ralentiBrise', 'ralentiCone', 'ralentiGivre', 'ralentiChoc', 'ralentiAiles', 'ralentiPoison', 'ralentiFatigue'];
  const CASSABLES = ['mouton', 'gel', 'desoriente'];
  const SORTS_NATURE = ['toucher', 'retablissement', 'recuperation', 'sarments', 'prompteGuerison', 'emprise', 'innervation', 'ecorce'];
  const CLASSES_MELEE = ['guerrier', 'paladin', 'voleur'];

  // ---------------------------------------------------------------- aléatoire
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

  // ------------------------------------------------------------ niveau
  // Mode « niveau N » (estimé) : les valeurs fixes du moteur, calées au niveau 60,
  // suivent une loi en (N / 60)^x. Au niveau 60, tous les facteurs valent 1.
  const NIVEAU_MIN = 20;
  const FACTEURS_60 = { tech: 1, soin: 1, cout: 1, pvAdv: 1, armAdv: 1, degAdv: 1 };
  const EXPOSANTS = { tech: 1.7, soin: 2.2, cout: 1.8, pvAdv: 2.2, armAdv: 1.9, degAdv: 1.9 };
  function niveauDe(n) {
    const x = Math.round(Number(n) || CONSTANTES.niveau);
    return Math.max(NIVEAU_MIN, Math.min(CONSTANTES.niveau, x));
  }
  // base : { pv, mana } de base du personnage (sans Endurance ni Intelligence), sinon estimés
  function constantesNiveau(niveau, base) {
    const n = niveauDe(niveau);
    if (n === CONSTANTES.niveau && !base) return CONSTANTES;
    const r = n / CONSTANTES.niveau;
    const f = {};
    for (const k in EXPOSANTS) f[k] = n === CONSTANTES.niveau ? 1 : Math.pow(r, EXPOSANTS[k]);
    return Object.assign({}, CONSTANTES, {
      niveau: n, f,
      pvBase: base && base.pv ? base.pv : Math.round(CONSTANTES.pvBase * Math.pow(r, 1.8)),
      manaBase: base && base.mana ? base.mana : Math.round(CONSTANTES.manaBase * r),
      facteurRage: n === CONSTANTES.niveau ? CONSTANTES.facteurRage : 0.0091107836 * n * n + 3.225598133 * n + 4.2652911,
      armureK: 400 + 85 * n,
      seuilSarments: CONSTANTES.seuilSarments * f.tech
    });
  }
  function facteurs() { return K.f || FACTEURS_60; }
  function avecNiveau(niveau, base, fn) {
    const precedent = K;
    K = constantesNiveau(niveau, base);
    try { return fn(); } finally { K = precedent; }
  }
  function nomSort(s, id) {
    const sp = SORTS[id];
    return sp.nomBas && s.niveau < 40 ? sp.nomBas : sp.nom;
  }
  // Rang de Lucioles selon le niveau : 18, 30, 42, 54
  function lucioles(n) { return n >= 54 ? 505 : n >= 42 ? 395 : n >= 30 ? 285 : 175; }

  // ---------------------------------------------------------------- talents
  function indexTalents() {
    const idx = {};
    ARBRES.forEach(arbre => arbre.talents.forEach(t => { idx[t.id] = Object.assign({ arbre: arbre.id }, t); }));
    return idx;
  }
  const TALENTS = indexTalents();

  function verifierTalents(points, max) {
    const plafond = max === undefined ? 51 : max;
    const erreurs = [];
    const parArbre = {};
    let total = 0;
    ARBRES.forEach(arbre => {
      const parPalier = {};
      let somme = 0;
      arbre.talents.forEach(t => {
        const r = points[t.id] || 0;
        if (r < 0 || r > t.max) erreurs.push(`${t.nom} : ${r}/${t.max}`);
        if (r > 0 && t.requis && (points[t.requis] || 0) < TALENTS[t.requis].max) erreurs.push(`${t.nom} demande ${TALENTS[t.requis].nom} au maximum`);
        parPalier[t.palier] = (parPalier[t.palier] || 0) + r;
        somme += r;
      });
      let cumul = 0;
      for (let p = 1; p <= 7; p++) {
        if ((parPalier[p] || 0) > 0 && cumul < 5 * (p - 1)) erreurs.push(`${arbre.nom}, palier ${p} : il faut ${5 * (p - 1)} points avant (${cumul})`);
        cumul += parPalier[p] || 0;
      }
      parArbre[arbre.id] = somme;
      total += somme;
    });
    if (total > plafond) erreurs.push(`${total} points dépensés sur ${plafond}`);
    return { ok: erreurs.length === 0, erreurs, total, parArbre };
  }

  // ------------------------------------------------------- profil du druide
  // options : { niveau, base } pour un profil hors niveau 60
  function calculerDruide(stats, points, options) {
    if (options && (options.niveau || options.base)) return avecNiveau(options.niveau, options.base, () => profilDruide(stats, points));
    return profilDruide(stats, points);
  }
  function profilDruide(stats, points) {
    const r = id => points[id] || 0;
    const f = facteurs();
    // Forme d'ours (sous le niveau 40) : armure des objets +180 % ; redoutable : +360 % et des PV en plus
    const redoutable = K.niveau >= 40;
    const bonusArmure = stats.armureBonus || 0;
    // Cœur sauvage (Forever) : Intelligence +2 %, Endurance en ours +4 %, Force en félin +2 % par rang
    const hotw = r('coeurSauvage');
    const int = stats.intelligence * (1 + 0.02 * hotw);
    const staOurs = stats.endurance * (1 + 0.04 * hotw);
    const strFelin = stats.force * (1 + 0.02 * hotw);
    const esprit = stats.esprit * (1 + 0.05 * r('espritVivant'));
    const pvH = Math.round(K.pvBase + (stats.endurance - 20) * 10);
    const armureObjets = stats.armure;
    const armureForme = 3 * K.niveau * r('peauEpaisse'); // armure de base en forme animale
    const ps = 0.5 * K.niveau * r('frappesPredatrices');
    const critForme = 1 + stats.agilite / 20 + stats.crit + 3 * r('griffesAcerees') + 3 * r('chefMeute') + 2 * r('majesteNature');
    const esquive = 1 + stats.agilite / 20 + (stats.esquive || 0);
    const esquiveForme = esquive + r('reactionNaturelle');
    return {
      pv: {
        humanoide: pvH,
        felin: pvH,
        ours: Math.round(K.pvBase + (staOurs - 20) * 10 + (redoutable ? 1240 * f.soin : 0))
      },
      manaMax: Math.round(K.manaBase + (int - 20) * 15),
      armure: {
        humanoide: Math.round(armureObjets + stats.agilite * 2 + bonusArmure),
        felin: Math.round(armureObjets + stats.agilite * 2 + armureForme + bonusArmure),
        ours: Math.round(armureObjets * (redoutable ? 4.6 : 2.8) + stats.agilite * 2 + armureForme + bonusArmure)
      },
      pa: {
        felin: Math.round(2 * strFelin - 20 + stats.agilite + 40 + ps + (stats.pa || 0)),
        ours: Math.round(2 * stats.force - 20 + 3 * K.niveau + ps + (stats.pa || 0))
      },
      dpsArme: stats.dpsArme || 0,
      crit: critForme,
      multCrit: 2 + 0.1 * r('instinctNaturel'),
      bonusPhysique: 1 + 0.02 * r('naturaliste'),
      esquive: { humanoide: esquive, ours: esquiveForme, felin: esquiveForme + 2 * r('celeriteFeline') },
      toucher: stats.toucher + 2 * r('porteeNature'),
      soins: Math.round(stats.soins + 0.12 * r('instinctNaturel') * int),
      critSoins: int / 60 + 1.8 + 2 * r('majesteNature'),
      esprit,
      regenMana: 15 + esprit / 5,
      coutForme: Math.round(K.coutForme * K.manaBase * (1 - 0.1 * r('changeformeNaturel'))),
      incantToucher: 3.5 - 0.1 * r('naturaliste')
    };
  }

  function reductionArmure(armure) {
    const a = Math.max(0, armure);
    return Math.min(0.75, a / (a + K.armureK));
  }

  // ---------------------------------------------------------------- outils
  function aura(s, e, id) {
    const x = e.auras[id];
    return x !== undefined && x.fin > s.t ? x : null;
  }
  function capa(e, id) { return !!(e.capa && e.capa.has(id)); }
  function immunise(s, e) { return !!(aura(s, e, 'bouclier') || aura(s, e, 'bloc')); }
  function controle(s, e) {
    for (const id of CONTROLES) if (aura(s, e, id)) return id;
    return null;
  }
  function enracine(s, e) { return !!(aura(s, e, 'enracine') || aura(s, e, 'immobilise')); }
  const SAIGNEMENTS = ['saignTraquer', 'griffureDot', 'dechirureDot', 'lacerationDot'];
  function saigne(s, e) { return SAIGNEMENTS.some(id => aura(s, e, id)); }
  function ralenti(s, e) {
    let f = 1;
    for (const id of RALENTIS) { const x = aura(s, e, id); if (x && x.facteur < f) f = x.facteur; }
    return f;
  }
  function distance(s) { return Math.abs(s.adv.x - s.druide.x); }
  function pret(s, e, id) {
    if (s.niveau < CONSTANTES.niveau) {
      const requis = e.camp === 'druide' ? SORTS[id] && SORTS[id].niveau : (NIVEAUX_ADV[e.classe] || {})[id];
      if (requis > s.niveau) return false;
    }
    return (e.cd[id] || 0) <= s.t;
  }
  function rang(s, id) { return s.points[id] || 0; }
  function pct(e) { return e.pv / e.pvMax; }
  function autre(s, e) { return e === s.druide ? s.adv : s.druide; }

  function log(s, type, texte) {
    if (s.journalActif) s.journal.push({ t: Math.round(s.t * 10) / 10, type, texte });
  }
  function evenement(s, type, texte) {
    if (s.journalActif) s.evenements.push({ t: Math.round(s.t * 10) / 10, type, texte });
  }
  // Sort ou technique lancé par un camp (pour la cinématique)
  function utilise(s, e, nom, genre) {
    const u = s.res.utilisations[e.camp];
    u[nom] = (u[nom] || 0) + 1;
    if (s.journalActif) s.actions.push({ t: Math.round(s.t * 10) / 10, camp: e.camp, nom, genre: genre || 'sort' });
  }
  // Chiffre flottant sur une cible : dégâts, soin ou échec
  function coup(s, cible, nom, montant, genre) {
    if (s.journalActif) s.coups.push({ t: Math.round(s.t * 10) / 10, cible: cible.camp, nom, m: Math.round(montant), genre });
  }

  function poser(s, cible, id, duree, data, nefaste) {
    if (nefaste) {
      if (immunise(s, cible)) { log(s, 'info', `${cible.nom} est insensible (${libelleAura(id)})`); return false; }
      if (aura(s, cible, 'liberte') && (id === 'enracine' || id === 'immobilise' || id.startsWith('ralenti'))) {
        log(s, 'info', `${cible.nom} est protégé par Bénédiction de liberté`);
        return false;
      }
      if (id === 'mouton' && cible.camp === 'druide' && cible.forme !== 'humanoide') {
        log(s, 'info', 'Le druide en forme animale est insensible à la Métamorphose');
        return false;
      }
    }
    // Rendements décroissants : 100 %, 50 %, 25 % puis insensible, remis à zéro après 15 s
    if (nefaste && CONTROLES.includes(id) && !(data && data.sansDR)) {
      const dr = cible.dr[id] && cible.dr[id].fin > s.t ? cible.dr[id] : { n: 0 };
      const mult = [1, 0.5, 0.25, 0][Math.min(dr.n, 3)];
      if (mult === 0) { log(s, 'info', `${cible.nom} est insensible (rendements décroissants : ${libelleAura(id)})`); return false; }
      duree *= mult;
      cible.dr[id] = { n: dr.n + 1, fin: s.t + duree + 15 };
      if (mult < 1) log(s, 'info', `Rendements décroissants : ${libelleAura(id)} réduit à ${duree.toFixed(1).replace('.', ',')} s`);
    }
    cible.auras[id] = Object.assign({ fin: s.t + duree, debut: s.t }, data || {});
    if (nefaste && cible.camp === 'druide' && CONTROLES.includes(id)) s.res.controlesSubis[id] = (s.res.controlesSubis[id] || 0) + duree;
    if (CONTROLES.includes(id) && id !== 'bloc') {
      if (cible.incant) annulerIncant(s, cible, 'interrompu');
      if (cible.camp === 'druide') retirer(cible, 'rodeur');
      evenement(s, 'cc', `${cible.nom} : ${libelleAura(id)} ${duree.toFixed(1).replace('.', ',')} s`);
    }
    return true;
  }
  function retirer(e, id) { delete e.auras[id]; }
  function retirerEntraves(e) {
    for (const id of Object.keys(e.auras)) {
      if (id === 'immobilise' || id.startsWith('ralenti') || (id === 'enracine')) delete e.auras[id];
    }
  }

  function libelleAura(id) {
    return ({
      etourdi: 'étourdi', peur: 'apeuré', mouton: 'métamorphosé', gel: 'gelé (piège)', desoriente: 'désorienté',
      horreur: 'horrifié', bloc: 'Bloc de glace', enracine: 'enraciné', immobilise: 'immobilisé', silence: 'réduit au silence'
    })[id] || id;
  }

  // ------------------------------------------------------------ incantation
  function lancerIncant(s, e, id, duree, nom, surFin) {
    e.incant = { id, nom, debut: s.t, fin: s.t + duree, total: duree, surFin };
    if (e.camp === 'druide') e.dernierSort = s.t;
    else utilise(s, e, nom, 'incant');
    log(s, 'incant', `${e.nom} incante ${nom} (${duree.toFixed(1).replace('.', ',')} s)`);
  }
  function annulerIncant(s, e, raison) {
    if (!e.incant) return;
    log(s, 'interruption', `${e.incant.nom} de ${e.nom} ${raison}`);
    if (e.camp === 'druide') s.res.soinsInterrompus++;
    e.incant = null;
  }
  function interrompre(s, cible, verrou, ecole, par) {
    if (!cible.incant) return false;
    const nom = cible.incant.nom;
    cible.incant = null;
    if (cible.camp === 'druide') s.res.soinsInterrompus++;
    log(s, 'interruption', `${par} interrompt ${nom}${verrou ? ` (école verrouillée ${verrou} s)` : ''}`);
    if (verrou) poser(s, cible, 'verrou', verrou, { ecole }, false);
    return true;
  }

  // ------------------------------------------------------------ dégâts, soins
  function armureDe(s, e) {
    let a;
    if (e.camp === 'druide') {
      a = s.profil.armure[e.forme];
      if (aura(s, e, 'enrager')) a *= 0.84;
    } else {
      a = e.def.armure;
    }
    if (aura(s, e, 'lucioles')) a -= lucioles(s.niveau);
    return a;
  }

  function degats(s, src, cible, montant, o) {
    if (s.fini || cible.pv <= 0) return 0;
    if (immunise(s, cible)) { log(s, 'info', `${o.nom} : ${cible.nom} est insensible`); return 0; }
    let m = montant;
    if (src.camp === 'adv') m *= s.f.degAdv;
    if (o.ecole === 'physique' && src.camp === 'druide') {
      m *= s.profil.bonusPhysique;
      if (saigne(s, cible)) m *= 1 + 0.02 * rang(s, 'dechirerLacerer');
    }
    const demo = aura(s, src, 'demoralise');
    if (demo && o.melee) m -= demo.pa / 14 * (src.def ? src.def.vitesseArme : 2);
    if (src.camp === 'adv' && aura(s, src, 'bouclier')) m *= 0.5; // Bouclier divin : dégâts infligés −50 % (Forever)
    if (src.classe === 'mage' && o.ecole === 'givre' && aura(s, src, 'barriere')) m *= 1.15;
    if (src.camp === 'adv') {
      if (capa(src, 'lienSpirituel') && src.familierPv > 0) m *= 1.03;
      if (o.ecole !== 'physique' && aura(s, src, 'pouvoirArcanes')) m *= 1.3;
      if (capa(src, 'aiguillonAmeliore') && aura(s, cible, 'etourdi')) m *= 1.1;
    }
    if (o.crit) m *= o.multCrit || (src.camp === 'druide' ? s.profil.multCrit : 2);
    const brut = Math.max(1, m);
    if (o.ecole === 'physique' && !o.ignoreArmure) m *= 1 - reductionArmure(armureDe(s, cible));
    if (cible.camp === 'druide' && aura(s, cible, 'ecorce')) m *= 0.8;
    m = Math.max(1, Math.round(m));
    // Lien spirituel : 30 % des dégâts passent au démon tant qu'il vit
    if (capa(cible, 'lienSpirituel') && cible.familierPv > 0) {
      const part = Math.min(cible.familierPv, Math.round(m * 0.3));
      cible.familierPv -= part;
      m -= part;
      if (cible.familierPv <= 0) { cible.familierActif = false; log(s, 'info', 'Le chasseur corrompu meurt : fin du Lien spirituel'); }
    }
    for (const [id, nomBouclier] of [['barriere', 'la Barrière de glace'], ['rempart', 'le Rempart du templier']]) {
      const b = aura(s, cible, id);
      if (!b) continue;
      const abs = Math.min(b.reste, m);
      b.reste -= abs;
      m -= abs;
      if (b.reste <= 0) retirer(cible, id);
      if (m === 0) { log(s, 'info', `${o.nom} absorbé par ${nomBouclier}`); return 0; }
    }
    cible.pv -= m;
    s.combat = true;

    // Statistiques
    const table = src.camp === 'druide' ? s.res.parSort : s.res.parSource;
    table[o.nom] = (table[o.nom] || 0) + m;
    if (src.camp === 'druide') s.res.degatsInfliges += m; else s.res.degatsSubis += m;
    log(s, src.camp === 'druide' ? 'degatD' : 'degatA', `${o.nom} ${o.crit ? 'CRITIQUE ' : ''}→ ${cible.nom} : ${m}`);
    coup(s, cible, o.nom, m, o.crit ? 'crit' : 'degat');

    // Rage
    if (cible.camp === 'druide' && cible.forme === 'ours') cible.rage = Math.min(100, cible.rage + 2.5 * m / K.facteurRage);
    // Forever : la rage du guerrier frappé se calcule avant l'armure
    if (cible.classe === 'guerrier') cible.rage = Math.min(100, cible.rage + 2.5 * brut / K.facteurRage);
    if (o.blanc && src.camp === 'druide' && src.forme === 'ours') src.rage = Math.min(100, src.rage + 7.5 * m / K.facteurRage);
    if (o.blanc && src.classe === 'guerrier') src.rage = Math.min(100, src.rage + 7.5 * m / K.facteurRage);

    // Contrôles qui cassent sous les dégâts
    for (const id of CASSABLES) if (aura(s, cible, id)) { retirer(cible, id); log(s, 'info', `${libelleAura(id)} se dissipe sur ${cible.nom}`); }
    const racines = aura(s, cible, 'enracine');
    if (racines && racines.cassable) { retirer(cible, 'enracine'); log(s, 'info', `Les racines de ${cible.nom} se brisent`); }
    else if (racines && racines.seuil) {
      racines.cumul = (racines.cumul || 0) + m;
      if (racines.cumul >= racines.seuil) { retirer(cible, 'enracine'); log(s, 'info', `Sarments cède sous les dégâts (${Math.round(racines.cumul)})`); }
    }
    const peur = aura(s, cible, 'peur');
    if (peur) { peur.cumul = (peur.cumul || 0) + m; if (peur.cumul >= peur.seuil) { retirer(cible, 'peur'); log(s, 'info', `${cible.nom} n'est plus apeuré`); } }
    if (cible.camp === 'druide') retirer(cible, 'rodeur');
    if (cible.camp === 'adv') cible.camoufle = false;

    // Recul d'incantation
    if (cible.incant && !o.sansRecul) {
      let recul = 0.5;
      if (cible.camp === 'druide') {
        recul *= 1 - 0.14 * rang(s, 'focaliseNature');
      }
      cible.incant.fin = Math.min(cible.incant.fin + recul, cible.incant.debut + cible.incant.total * 2);
    }

    // Emprise de la nature
    if (cible.camp === 'druide' && o.melee && aura(s, cible, 'emprise')) {
      if (s.alea() < 0.35) {
        retirer(cible, 'emprise');
        if (poser(s, src, 'enracine', 12, { cassable: false }, true)) evenement(s, 'cc', `Emprise de la nature enracine ${src.nom}`);
      }
    }

    if (cible.pv <= 0) {
      cible.pv = 0;
      s.fini = true;
      s.gagnant = src.camp;
      log(s, 'fin', `${cible.nom} meurt.`);
      evenement(s, 'fin', `${cible.nom} meurt`);
    }
    return m;
  }

  function soigner(s, cible, montant, nom, critique) {
    let m = montant;
    if (cible.camp === 'druide') m *= 1 + 0.02 * rang(s, 'donNature');
    if (aura(s, cible, 'frappeMortelle')) m *= 0.5;
    if (critique) m *= 1.5;
    m = Math.round(m);
    const effectif = Math.min(m, cible.pvMax - cible.pv);
    cible.pv += effectif;
    if (cible.camp === 'druide') s.res.soins += effectif; else s.res.soinsAdv += effectif;
    if (effectif > 0) coup(s, cible, nom, effectif, 'soin');
    log(s, cible.camp === 'druide' ? 'soinD' : 'soinA', `${nom}${critique ? ' CRITIQUE' : ''} → ${cible.nom} : +${effectif}${effectif < m ? ` (${m - effectif} en trop)` : ''}`);
    return effectif;
  }

  // Jet d'attaque physique : rate / esquive / parade / critique / touche
  function jet(s, src, cible, o) {
    const toucher = src.camp === 'druide' ? s.profil.toucher : src.def.toucher;
    const rate = Math.max(0, 5 - toucher) + (o.deuxArmes ? 19 : 0);
    let esquive = cible.camp === 'druide' ? s.profil.esquive[cible.forme] : cible.def.esquive;
    if (aura(s, cible, 'evasion')) esquive += 50;
    if (aura(s, cible, 'fantomatique')) esquive += 15;
    if (o.inesquivable || controle(s, cible)) esquive = 0;
    const parade = (o.dos || controle(s, cible) || cible.camp === 'druide') ? 0 : cible.def.parade;
    const crit = (src.camp === 'druide' ? s.profil.crit : src.def.crit) + (o.critBonus || 0);
    const r = s.alea() * 100;
    if (r < rate) return 'rate';
    if (r < rate + esquive) return 'esquive';
    if (r < rate + esquive + parade) return 'parade';
    if (r < rate + esquive + parade + crit) return 'critique';
    return 'touche';
  }
  function libelleJet(j) { return ({ rate: 'raté', esquive: 'esquivé', parade: 'paré' })[j]; }

  // ===================================================================
  //                              DRUIDE
  // ===================================================================
  function coutEnergie(s, id) {
    const r = x => rang(s, x);
    const base = ({
      griffe: 45 - r('ferocite'), griffure: 40 - r('ferocite'), lambeau: 60 - 2 * r('attaquesDechiquetantes'),
      traquer: 50, ravager: 60, dechirure: 30, morsure: 35, chargeFeline: 10
    })[id] || 0;
    // Posture (Forever) : à énergie pleine sous Rôder, la première technique coûte 10 de moins
    return base && aura(s, s.druide, 'posture') ? base - 10 : base;
  }
  function coutRage(s, id) {
    const f = rang(s, 'ferocite');
    return ({
      mutilation: 15 - f, balayage: 20 - f, morsurePrimitive: 20 - f, rugissement: 10, sonner: 10, chargeFarouche: 5,
      laceration: 15 - (rang(s, 'attaquesDechiquetantes') >= 3 ? 1 : 0)
    })[id] || 0;
  }
  function coutMana(s, id) {
    if (id === 'formeOurs' || id === 'formeFelin') return s.profil.coutForme;
    if (id === 'toucher') return Math.round(SORTS.toucher.mana * (1 - 0.02 * rang(s, 'espritTranquille')) * s.f.cout);
    if (id === 'puissanceChangeante') return Math.round(0.55 * K.manaBase);
    return Math.round((SORTS[id].mana || 0) * s.f.cout);
  }
  function recharge(s, id) {
    if (id === 'sonner') return SORTS.sonner.recharge - 15 * rang(s, 'impactBrutal');
    return SORTS[id].recharge || 0;
  }

  // Forever : les formes frappent avec le DPS de l'arme équipée (ours 2,5 s, félin 1,0 s)
  function degatBlanc(s) {
    const d = s.druide;
    const vit = d.forme === 'ours' ? 2.5 : 1;
    const base = (s.profil.dpsArme + s.profil.pa[d.forme === 'ours' ? 'ours' : 'felin'] / 14) * vit;
    return base * (0.85 + 0.3 * s.alea());
  }

  function peutUtiliser(s, id) {
    const d = s.druide, a = s.adv, sp = SORTS[id];
    if (controle(s, d) || d.incant) return false;
    if (sp.talent && !rang(s, sp.talent)) return false;
    if (id !== 'formeOurs' && id !== 'formeFelin' && id !== 'annulerForme') {
      if (sp.forme === 'humanoide' && d.forme !== 'humanoide') return false;
      if ((sp.forme === 'felin' || sp.forme === 'ours') && d.forme !== sp.forme) return false;
      if (sp.forme === 'animal' && d.forme === 'humanoide') return false;
    }
    if (sp.gcd > 0 && d.gcdFin > s.t + 1e-9) return false;
    if (!pret(s, d, id)) return false;
    const gratuit = aura(s, d, 'clarte');
    if (!gratuit) {
      if (coutEnergie(s, id) > d.energie) return false;
      if (coutRage(s, id) > d.rage) return false;
    }
    if (coutMana(s, id) > d.mana) return false;
    if (SORTS_NATURE.includes(id) && aura(s, d, 'verrou')) return false;
    // Silence (Contresort amélioré, Coup de pied amélioré) : ni sort ni changement de forme payant
    if (aura(s, d, 'silence') && (SORTS_NATURE.includes(id) || coutMana(s, id) > 0)) return false;
    const dist = distance(s);
    const cibleOk = !immunise(s, a) && !a.camoufle;
    switch (id) {
      case 'formeOurs': return d.forme !== 'ours';
      case 'formeFelin': return d.forme !== 'felin';
      case 'annulerForme': return d.forme !== 'humanoide';
      case 'traquer': case 'ravager': return !!aura(s, d, 'rodeur') && dist <= K.porteeMelee && cibleOk;
      case 'griffe': case 'griffure': case 'dechirure': case 'morsure': case 'mutilation': case 'balayage':
      case 'morsurePrimitive': case 'laceration':
        return dist <= K.porteeMelee && cibleOk && (id !== 'dechirure' && id !== 'morsure' || d.cp > 0) && (id !== 'mutilation' || !d.mutilationPrete);
      case 'lambeau': return dist <= K.porteeMelee && cibleOk && derriere(s);
      case 'sonner': return dist <= K.porteeMelee && cibleOk;
      case 'chargeFarouche': case 'chargeFeline': return dist >= 8 && dist <= 25 && cibleOk && !enracine(s, d);
      case 'puissanceChangeante': return d.energie < 100;
      case 'emprise': return !aura(s, d, 'emprise');
      case 'rugissement': return dist <= 10 && cibleOk;
      case 'lucioles': case 'sarments': return dist <= 30 && cibleOk;
      case 'prompteGuerison': return !!(aura(s, d, 'recuperation') || aura(s, d, 'retabHot'));
      default: return true;
    }
  }

  function derriere(s) {
    const a = s.adv;
    return !!(controle(s, a) || aura(s, s.druide, 'rodeur') || aura(s, s.druide, 'dansDos') ||
      (a.incant && distance(s) <= K.porteeMelee && s.alea() < 0.5));
  }

  function payer(s, id) {
    const d = s.druide;
    d.mana -= coutMana(s, id);
    if (coutMana(s, id) > 0) d.dernierSort = s.t;
    if (SORTS[id].gcd > 0) d.gcdFin = s.t + SORTS[id].gcd;
    if (recharge(s, id)) d.cd[id] = s.t + recharge(s, id);
    const energie = coutEnergie(s, id);
    if (energie) retirer(d, 'posture');
    if (aura(s, d, 'clarte') && (energie || coutRage(s, id))) { retirer(d, 'clarte'); return; }
    d.energie -= energie;
    if (id !== 'mutilation') d.rage -= coutRage(s, id);
  }

  function changerForme(s, forme) {
    const d = s.druide;
    const ratio = pct(d);
    const avant = d.forme;
    d.forme = forme;
    d.pvMax = s.profil.pv[forme];
    d.pv = Math.max(1, Math.round(ratio * d.pvMax));
    d.rage = 0;
    d.mutilationPrete = false;
    if (avant === 'felin') { retirer(d, 'rodeur'); retirer(d, 'posture'); d.energieQuittee = d.energie; d.tQuitteFelin = s.t; }
    if (forme === 'ours') d.rage = s.alea() < 0.2 * rang(s, 'furie') ? 10 : 0;
    if (forme === 'felin') {
      // Fureur (Forever) : garde 20 % par rang de l'énergie laissée en quittant le félin,
      // plus 2 énergie par seconde et par rang passée hors forme (20 au plus par rang)
      const f = rang(s, 'furie');
      const garde = (d.energieQuittee || 0) * 0.2 * f;
      const horsForme = Math.min(20 * f, 2 * f * (s.t - (d.tQuitteFelin === undefined ? s.t : d.tQuitteFelin)));
      d.energie = Math.min(100, Math.round(garde + horsForme));
    }
    if (forme !== 'humanoide') {
      retirerEntraves(d);
      s.res.changementsForme++;
    }
    d.prochainCoup = Math.max(d.prochainCoup, s.t + 0.2);
    evenement(s, 'forme', `Forme : ${nomForme(forme)}`);
    log(s, 'forme', `Le druide passe en ${nomForme(forme)}${forme === 'ours' ? ` (rage ${Math.round(d.rage)})` : forme === 'felin' ? ` (énergie ${Math.round(d.energie)})` : ''}`);
  }
  function nomForme(f) { return ({ humanoide: 'forme humanoïde', ours: 'forme d\'ours', felin: 'forme de félin' })[f]; }

  function gagnerCombo(s, n) { s.druide.cp = Math.min(5, s.druide.cp + n); }

  // Coup spécial en mêlée du druide
  function frappe(s, nom, montant, o) {
    const d = s.druide, a = s.adv;
    const j = jet(s, d, a, o || {});
    retirer(d, 'rodeur');
    if (j === 'rate' || j === 'esquive' || j === 'parade') {
      log(s, 'echec', `${nom} : ${libelleJet(j)}`);
      coup(s, a, nom, 0, libelleJet(j));
      return null;
    }
    const crit = j === 'critique';
    if (montant > 0) degats(s, d, a, montant, { nom, ecole: 'physique', crit, ignoreArmure: o && o.ignoreArmure });
    else { s.combat = true; a.camoufle = false; log(s, 'degatD', `${nom} touche ${a.nom}`); }
    if (crit && d.forme === 'felin' && s.alea() < 0.5 * rang(s, 'frenesieSanglante')) gagnerCombo(s, 1);
    if (crit && d.forme === 'ours' && s.alea() < 0.5 * rang(s, 'frenesieSanglante')) d.rage = Math.min(100, d.rage + 5);
    procClarte(s, d.forme === 'ours' ? 2.5 : 1);
    return j;
  }
  // Augure de clarté est appris au niveau 20 dans Forever
  function procClarte(s, vitesse) {
    if (s.alea() < 2 * vitesse / 60) poser(s, s.druide, 'clarte', 15, {}, false);
  }

  function poserPeriodique(s, cible, id, duree, periode, total, o) {
    const ticks = Math.round(duree / periode);
    cible.auras[id] = Object.assign({
      fin: s.t + duree + 0.01, debut: s.t, periode, prochain: s.t + periode, montant: total / ticks
    }, o);
  }

  // Exécute une action du druide. Renvoie true si elle a été lancée.
  function essayer(s, id) {
    const d = s.druide, a = s.adv;
    // macro « changer de forme » : quitter la forme actuelle d'abord
    if ((id === 'formeOurs' || id === 'formeFelin') && d.forme !== 'humanoide' && d.forme !== (id === 'formeOurs' ? 'ours' : 'felin')) {
      if (!peutUtiliser(s, id)) return false;
    }
    if (!peutUtiliser(s, id)) return false;
    const sp = SORTS[id];
    const r = x => rang(s, x);
    const gratuit = !!aura(s, d, 'clarte');
    const fs = 1 + 0.05 * r('furieSauvage');
    const tech = s.f.tech, fsoin = s.f.soin;
    payer(s, id);
    utilise(s, d, nomSort(s, id), id === 'formeOurs' || id === 'formeFelin' || id === 'annulerForme' ? 'forme' : 'sort');
    switch (id) {
      case 'formeOurs': changerForme(s, 'ours'); break;
      case 'formeFelin': changerForme(s, 'felin'); break;
      case 'annulerForme':
        changerForme(s, 'humanoide');
        log(s, 'forme', 'Le druide quitte sa forme (hors temps de recharge global)');
        break;
      case 'traquer': {
        const j = frappe(s, 'Traquer', 0, { dos: true, inesquivable: false });
        // Traquer ne fait pas de dégâts directs : on retire la ligne de 1 dégât
        if (j) {
          poser(s, a, 'etourdi', 2 + 0.5 * r('impactBrutal'), {}, true);
          poserPeriodique(s, a, 'saignTraquer', 18, 3, 600 * tech, { type: 'degats', ecole: 'physique', nom: 'Traquer (saignement)', source: 'druide' });
          gagnerCombo(s, 1);
        }
        break;
      }
      case 'ravager': {
        const j = frappe(s, 'Ravager', degatBlanc(s) * 4.35 + 98 * tech, { dos: true });
        if (j) gagnerCombo(s, 1);
        break;
      }
      case 'griffe': if (frappe(s, 'Griffe', (degatBlanc(s) * 1.4 + 27 * tech) * fs)) gagnerCombo(s, 1); break;
      case 'lambeau': if (frappe(s, 'Lambeau', (degatBlanc(s) * 2 + 80 * tech) * fs, { dos: true })) gagnerCombo(s, 1); break;
      case 'griffure':
        if (frappe(s, 'Griffure', 76 * tech * fs)) {
          poserPeriodique(s, a, 'griffureDot', 9, 3, 126 * tech * fs, { type: 'degats', ecole: 'physique', nom: 'Griffure (saignement)', source: 'druide' });
          gagnerCombo(s, 1);
        }
        break;
      case 'dechirure': {
        const cp = d.cp;
        const j = jet(s, d, a, { dos: derriere(s) });
        if (j === 'rate' || j === 'esquive' || j === 'parade') { log(s, 'echec', `Déchirure : ${libelleJet(j)}`); break; }
        const total = Math.round([0, 305, 497, 688, 879, 1070][cp] * tech + 0.04 * s.profil.pa.felin * cp);
        poserPeriodique(s, a, 'dechirureDot', 12, 2, total, { type: 'degats', ecole: 'physique', nom: 'Déchirure', source: 'druide' });
        log(s, 'degatD', `Déchirure ${cp} points : ${total} en 12 s`);
        d.cp = 0;
        break;
      }
      case 'morsure': {
        const cp = d.cp;
        const extra = gratuit ? 0 : Math.max(0, d.energie);
        // Discipline prédatrice : l'énergie en trop reste, et rapporte moitié moins
        const discipline = r('disciplinePredatrice') > 0;
        if (!discipline) d.energie -= extra;
        const base = [0, 247, 407, 567, 727, 887][cp] * tech + extra * 2.5 * (discipline ? 0.5 : 1) + s.profil.pa.felin * 0.03 * cp;
        if (frappe(s, `Morsure féroce (${cp})`, base)) d.cp = 0;
        break;
      }
      case 'celerite': poser(s, d, 'celerite', 15, {}, false); log(s, 'info', 'Célérité : vitesse +60 %'); break;
      case 'lucioles':
        if (poser(s, a, 'lucioles', 40, {}, true)) { a.camoufle = false; log(s, 'info', `Lucioles : armure de ${a.nom} −${lucioles(s.niveau)}`); }
        break;
      case 'mutilation': d.mutilationPrete = true; break;
      case 'balayage': frappe(s, 'Balayage', 83 * tech * (1 + 0.1 * r('instinctFarouche')) * fs); break;
      case 'morsurePrimitive': frappe(s, 'Morsure primitive', degatBlanc(s) + 77 * tech); break;
      case 'laceration':
        if (frappe(s, 'Lacération', degatBlanc(s) * 0.1)) {
          const avant = aura(s, a, 'lacerationDot');
          const cumul = Math.min(5, (avant ? avant.cumul : 0) + 1);
          poserPeriodique(s, a, 'lacerationDot', 15, 3, 100 * tech * cumul, { type: 'degats', ecole: 'physique', nom: `Lacération (${cumul})`, source: 'druide', cumul });
        }
        break;
      case 'puissanceChangeante':
        d.energie = Math.min(100, d.energie + 40);
        s.res.powershifts++;
        log(s, 'info', 'Puissance changeante : +40 énergie');
        break;
      case 'chargeFeline': {
        const sens = Math.sign(a.x - d.x) || 1;
        d.x = a.x + sens * 2;
        poser(s, d, 'dansDos', 3, {}, false);
        log(s, 'info', `Charge farouche (félin) : bond dans le dos de ${a.nom}`);
        break;
      }
      case 'rugissement':
        poser(s, a, 'demoralise', 30, { pa: 204 * tech }, true);
        log(s, 'info', `Rugissement démoralisant sur ${a.nom}`);
        break;
      case 'sonner': {
        interrompre(s, a, 0, null, 'Sonner');
        const duree = 4 + 0.5 * r('impactBrutal');
        poser(s, a, 'etourdi', duree, {}, true);
        s.res.etourdissements++;
        break;
      }
      case 'enrager':
        d.rage = Math.min(100, d.rage + 10);
        poser(s, d, 'enrager', 10, { periode: 1, prochain: s.t + 1, type: 'rage', montant: 2 }, false);
        log(s, 'info', 'Enrager : +10 rage puis 20 en 10 s, armure −16 %');
        break;
      case 'chargeFarouche': {
        const sens = Math.sign(a.x - d.x) || 1;
        d.x = a.x - sens * 3;
        interrompre(s, a, 4, a.incant ? 'toutes' : null, 'Charge farouche');
        poser(s, a, 'immobilise', 4, {}, true);
        log(s, 'info', `Charge farouche : ${a.nom} immobilisé 4 s`);
        break;
      }
      case 'regenFrenetique':
        poser(s, d, 'regenFren', 10, { periode: 1, prochain: s.t + 1, type: 'regenFren' }, false);
        log(s, 'info', 'Régénération frénétique activée');
        break;
      case 'toucher': {
        const instant = !!aura(s, d, 'rapidite');
        const fin = () => soigner(s, d, 2472 * fsoin + s.profil.soins, 'Toucher guérisseur', s.alea() * 100 < s.profil.critSoins);
        if (instant) { retirer(d, 'rapidite'); log(s, 'info', 'Toucher guérisseur instantané (Rapidité de la nature)'); fin(); }
        else lancerIncant(s, d, 'toucher', s.profil.incantToucher, 'Toucher guérisseur', fin);
        break;
      }
      case 'retablissement': {
        const fin = () => {
          soigner(s, d, 1061 * fsoin + 0.3 * s.profil.soins, 'Rétablissement', s.alea() * 100 < s.profil.critSoins + 10 * r('retablissementAmeliore'));
          const duree = 21 + 6 * r('splendeurNature');
          poserPeriodique(s, d, 'retabHot', duree, 3, (1064 * fsoin + 0.5 * s.profil.soins) * duree / 21 * (1 + 0.02 * r('genese')), { type: 'soin', nom: 'Rétablissement (sur la durée)', magie: true });
        };
        if (aura(s, d, 'rapidite')) { retirer(d, 'rapidite'); fin(); }
        else lancerIncant(s, d, 'retablissement', 2, 'Rétablissement', fin);
        break;
      }
      case 'recuperation': {
        const duree = 12 + 3 * r('splendeurNature');
        poserPeriodique(s, d, 'recuperation', duree, 3, (776 * fsoin + 0.8 * s.profil.soins) * duree / 12 * (1 + 0.05 * r('recuperationAmelioree')) * (1 + 0.02 * r('genese')), { type: 'soin', nom: 'Récupération', magie: true });
        log(s, 'soinD', 'Récupération posée');
        break;
      }
      case 'sarments':
        lancerIncant(s, d, 'sarments', 1.5, 'Sarments', () => {
          if (poser(s, a, 'enracine', 27, { cassable: false, seuil: K.seuilSarments * (1 + 0.25 * r('sarmentsAmeliores')), cumul: 0 }, true)) {
            evenement(s, 'cc', `Sarments : ${a.nom} enraciné`);
            log(s, 'info', `Sarments : ${a.nom} enraciné`);
          }
        });
        break;
      case 'ecorce': poser(s, d, 'ecorce', 15, { magie: true }, false); log(s, 'info', 'Écorce : dégâts subis −20 %'); break;
      case 'innervation': poser(s, d, 'innervation', 20, { magie: true }, false); log(s, 'info', 'Innervation'); break;
      case 'rapiditeNature': poser(s, d, 'rapidite', 30, {}, false); break;
      case 'prompteGuerison': {
        // Forever : rend d'un coup tout ce qui restait à soigner
        const rej = aura(s, d, 'recuperation');
        const hot = rej || aura(s, d, 'retabHot');
        const restants = Math.max(1, Math.floor((hot.fin - hot.prochain) / hot.periode + 1e-6) + 1);
        const montant = hot.montant * restants;
        retirer(d, rej ? 'recuperation' : 'retabHot');
        soigner(s, d, montant, 'Prompte guérison', false);
        break;
      }
      case 'emprise': poser(s, d, 'emprise', 45, { magie: true }, false); log(s, 'info', 'Emprise de la nature prête'); break;
      default: break;
    }
    if (id === 'mutilation' || id === 'rapiditeNature') log(s, 'info', `${sp.nom}`);
    return true;
  }

  // ------------------------------------------------------- fenêtre de soin
  function fenetreSecurite(s) {
    const a = s.adv, dist = distance(s);
    let f = 0;
    const ctl = controle(s, a);
    if (ctl) f = Math.max(f, a.auras[ctl].fin - s.t);
    if (aura(s, a, 'bloc')) f = Math.max(f, a.auras.bloc.fin - s.t);
    // Paladin sous Bouclier divin qui se soigne, Marteau en recharge : il ne frappe pas
    if (aura(s, a, 'bouclier') && a.incant && !pret(s, a, 'marteau')) f = Math.max(f, a.incant.fin - s.t + 1.5);
    if (enracine(s, a) && CLASSES_MELEE.includes(a.classe) && dist > K.porteeMelee + 1) {
      const r = a.auras.enracine || a.auras.immobilise;
      f = Math.max(f, r.fin - s.t);
    }
    if (CLASSES_MELEE.includes(a.classe) && dist > 30 && !controle(s, a)) f = Math.max(f, (dist - 25) / 7);
    return f;
  }

  function choisirSoin(s, fenetre) {
    const d = s.druide, cf = s.profil.coutForme;
    if (aura(s, d, 'rapidite')) return 'toucher';
    if (fenetre >= s.profil.incantToucher + 0.05 && d.mana >= coutMana(s, 'toucher') + cf) return 'toucher';
    if (fenetre >= 2.05 && d.mana >= coutMana(s, 'retablissement') + cf) return 'retablissement';
    // Prompte guérison (Forever) : instantanée, rend tout le reste d'un soin sur la durée
    if (rang(s, 'prompteGuerison') && pret(s, d, 'prompteGuerison') && pct(d) < 0.7 &&
        (aura(s, d, 'recuperation') || aura(s, d, 'retabHot')) && d.mana >= coutMana(s, 'prompteGuerison') + cf) return 'prompteGuerison';
    if (!aura(s, d, 'recuperation') && d.mana >= coutMana(s, 'recuperation') + cf) return 'recuperation';
    if (d.mana >= coutMana(s, 'retablissement') + cf) return 'retablissement';
    return null;
  }

  // ---------------------------------------------------------- plans de soin
  function formePrincipaleId(s) { return s.formePrincipale === 'ours' ? 'formeOurs' : 'formeFelin'; }

  function planifierSoin(s, opportunite) {
    const d = s.druide, a = s.adv, dist = distance(s);
    const methode = s.config.methodeSoin;
    if (methode === 'aucun') return null;
    if (aura(s, d, 'verrou') || aura(s, d, 'silence')) return null;
    const cf = s.profil.coutForme;
    const reprise = { type: 'action', id: formePrincipaleId(s), attente: 3 };
    const sortirForme = d.forme !== 'humanoide' ? [{ type: 'action', id: 'annulerForme' }] : [];
    const melee = CLASSES_MELEE.includes(a.classe);
    const essais = [];
    const mRetab = coutMana(s, 'retablissement');

    if (opportunite) {
      const etapes = sortirForme.slice();
      if (enracine(s, a) && dist < 12 && melee) etapes.push({ type: 'fuir', jusqua: 14, attente: 3 });
      etapes.push({ type: 'soin' }, { type: 'soinsBoucle' }, reprise);
      return { nom: 'fenêtre de soin', etapes };
    }

    const ns = () => rang(s, 'rapiditeNature') && pret(s, d, 'rapiditeNature') && d.mana >= coutMana(s, 'toucher') + cf * (d.forme !== 'humanoide' ? 1 : 0) + cf;
    const bash = () => dist <= K.porteeMelee && pret(s, d, 'sonner') && !immunise(s, a) &&
      d.mana >= mRetab + cf * 2 && (d.forme === 'ours' ? d.rage >= 10 : rang(s, 'furie') >= 5 || d.rage >= 10);
    const roots = () => melee && dist <= 30 && !aura(s, a, 'liberte') && !immunise(s, a) && !enracine(s, a) && d.mana >= coutMana(s, 'sarments') + mRetab + cf;
    const regen = () => pret(s, d, 'regenFrenetique') && (d.forme === 'ours' ? d.rage >= 20 : d.mana >= cf);

    const plans = {
      rapidite: () => ns() && { nom: 'Rapidité de la nature', etapes: sortirForme.concat([{ type: 'action', id: 'rapiditeNature' }, { type: 'action', id: 'toucher' }, reprise]) },
      sonner: () => bash() && {
        nom: 'Sonner puis soigner',
        etapes: (d.forme !== 'ours' ? [{ type: 'action', id: 'formeOurs' }] : []).concat([
          { type: 'action', id: 'sonner', attente: 2.5 }, { type: 'action', id: 'annulerForme' }, { type: 'soin' }, { type: 'soinsBoucle' }, reprise
        ])
      },
      sarments: () => roots() && {
        nom: 'Sarments puis distance',
        etapes: sortirForme.concat(
          [{ type: 'action', id: 'sarments' }, { type: 'verifRacines' }, { type: 'fuir', jusqua: 14, attente: 3 }],
          d.mana < 0.4 * d.manaMax && pret(s, d, 'innervation') ? [{ type: 'action', id: 'innervation' }] : [],
          [{ type: 'soin' }, { type: 'soinsBoucle' }, { type: 'actionSiPossible', id: 'emprise' }, reprise]
        )
      },
      regen: () => regen() && {
        nom: 'Régénération frénétique',
        etapes: (d.forme !== 'ours' ? [{ type: 'action', id: 'formeOurs' }] : []).concat(
          [{ type: 'actionSiPossible', id: 'enrager' }, { type: 'attendreRage', seuil: 20, attente: 4 }, { type: 'action', id: 'regenFrenetique' }],
          s.formePrincipale === 'felin' ? [] : []
        )
      }
    };

    if (methode !== 'auto') {
      const p = plans[methode] && plans[methode]();
      return p || null;
    }
    // Ordre automatique : le plus sûr d'abord
    essais.push('rapidite');
    if (dist <= K.porteeMelee) essais.push('sonner');
    if (melee) essais.push('sarments');
    if (s.formePrincipale === 'ours' || d.forme === 'ours' || d.mana < mRetab + 2 * cf) essais.push('regen');
    for (const m of essais) {
      const p = plans[m]();
      if (p) return p;
    }
    // Dernier recours : soin direct sous Écorce
    if (pct(d) < s.config.seuilSoin / 100 * 0.6 && d.mana >= mRetab + cf * 2) {
      return {
        nom: 'soin de dernier recours',
        etapes: sortirForme.concat([{ type: 'actionSiPossible', id: 'ecorce' }, { type: 'soin' }, reprise])
      };
    }
    return null;
  }

  function demarrerPlan(s, plan) {
    s.druide.plan = Object.assign({ i: 0, debutEtape: s.t }, plan);
    s.res.plans[plan.nom] = (s.res.plans[plan.nom] || 0) + 1;
    evenement(s, 'plan', `Plan : ${plan.nom}`);
    log(s, 'plan', `Le druide décide : ${plan.nom}`);
  }
  function etapeSuivante(s) { const p = s.druide.plan; p.i++; p.debutEtape = s.t; }
  function abandonnerPlan(s, raison) {
    log(s, 'plan', `Plan abandonné (${raison})`);
    s.druide.plan = null;
    s.druide.intentionForcee = null;
  }

  // Renvoie true si le plan a pris la main ce pas-ci.
  function executerPlan(s) {
    const d = s.druide, p = d.plan, a = s.adv;
    const e = p.etapes[p.i];
    if (!e) { d.plan = null; d.intentionForcee = null; return false; }
    if (s.t - p.debutEtape > (e.attente || 2.5)) { abandonnerPlan(s, 'trop long'); return false; }
    switch (e.type) {
      case 'action':
        if (essayer(s, e.id)) etapeSuivante(s);
        else if (!pret(s, d, e.id) || aura(s, d, 'silence') || (SORTS_NATURE.includes(e.id) && aura(s, d, 'verrou'))) { abandonnerPlan(s, `${nomSort(s, e.id)} indisponible`); return false; }
        return true;
      case 'actionSiPossible':
        if (peutUtiliser(s, e.id)) { essayer(s, e.id); etapeSuivante(s); return true; }
        if (d.gcdFin > s.t) return true;
        etapeSuivante(s);
        return executerPlan(s);
      case 'attendreRage':
        if (d.rage >= e.seuil) { etapeSuivante(s); return executerPlan(s); }
        return false; // laisse la rotation continuer pendant l'attente
      case 'verifRacines':
        if (enracine(s, a)) { etapeSuivante(s); return executerPlan(s); }
        abandonnerPlan(s, 'Sarments n\'a pas tenu');
        return false;
      case 'fuir':
        if (!enracine(s, a)) { d.intentionForcee = null; etapeSuivante(s); return true; }
        if (distance(s) >= e.jusqua) { d.intentionForcee = null; etapeSuivante(s); return executerPlan(s); }
        d.intentionForcee = 'fuir';
        return true;
      case 'soin': {
        if (d.gcdFin > s.t) return true;
        const id = choisirSoin(s, fenetreSecurite(s));
        if (!id) { abandonnerPlan(s, 'pas assez de mana'); return false; }
        if (essayer(s, id)) etapeSuivante(s);
        else if (aura(s, d, 'verrou') || aura(s, d, 'silence')) { abandonnerPlan(s, 'école de la nature verrouillée'); return false; }
        return true;
      }
      case 'soinsBoucle': {
        if (d.gcdFin > s.t) return true;
        const fen = fenetreSecurite(s);
        const id = choisirSoin(s, fen);
        const continuer = pct(d) < 0.9 && fen >= 2.05 && id && id !== 'recuperation';
        if (!continuer) { etapeSuivante(s); return executerPlan(s); }
        p.debutEtape = s.t;
        essayer(s, id);
        return true;
      }
      default:
        etapeSuivante(s);
        return false;
    }
  }

  // ------------------------------------------------------------- rotation
  function iaDruide(s) {
    const d = s.druide, a = s.adv;
    if (controle(s, d)) return;
    d.intention = d.intentionForcee || 'approcher';
    if (d.incant) return;
    const dist = distance(s);

    if (d.plan) { if (executerPlan(s)) return; }
    if (d.incant || controle(s, d)) return;

    const seuil = s.config.seuilSoin / 100;
    const reserve = s.config.methodeSoin === 'aucun' ? 0 : s.profil.coutForme + coutMana(s, 'toucher');

    // Opportunités et soins
    if (!d.plan && s.t >= d.prochainEssaiSoin) {
      const opportunite = pct(d) < 0.75 && fenetreSecurite(s) >= 2.6 && !aura(s, d, 'rodeur') && d.mana >= coutMana(s, 'retablissement') + 2 * s.profil.coutForme;
      if (pct(d) < seuil || opportunite) {
        const plan = planifierSoin(s, pct(d) >= seuil && opportunite);
        if (plan) { demarrerPlan(s, plan); if (executerPlan(s)) return; }
        else d.prochainEssaiSoin = s.t + 1;
      }
    }

    // En forme humanoïde sans plan : reprendre la forme principale
    if (d.forme === 'humanoide') { essayer(s, formePrincipaleId(s)); return; }

    // Sortir des entraves quand la cible est hors de portée
    if ((enracine(s, d) || ralenti(s, d) < 0.95) && dist > K.porteeMelee + 1 && d.gcdFin <= s.t &&
        s.config.powershift && d.mana >= s.profil.coutForme + reserve) {
      const f = d.forme;
      essayer(s, 'annulerForme');
      essayer(s, f === 'ours' ? 'formeOurs' : 'formeFelin');
      log(s, 'info', 'Changement de forme pour briser l\'entrave');
      return;
    }

    // Revenir à la forme principale si on l'a quittée pour un plan terminé
    if (d.forme !== s.formePrincipale && !d.plan && d.gcdFin <= s.t && d.mana >= s.profil.coutForme) {
      const enOursUtile = d.forme === 'ours' && aura(s, d, 'regenFren');
      if (!enOursUtile) { essayer(s, formePrincipaleId(s)); return; }
    }

    // Forever : Écorce gratuite et Emprise de la nature utilisables en forme
    if (s.combat && pct(d) < 0.6 && pret(s, d, 'ecorce') && !aura(s, d, 'ecorce') && essayer(s, 'ecorce')) return;
    if (CLASSES_MELEE.includes(a.classe) && dist <= 12 && !aura(s, d, 'emprise') && pret(s, d, 'emprise') &&
        d.mana >= coutMana(s, 'emprise') + reserve && !aura(s, d, 'rodeur') && essayer(s, 'emprise')) return;

    if (d.forme === 'felin') rotationFelin(s, dist, reserve);
    else if (d.forme === 'ours') rotationOurs(s, dist);
  }

  function rotationFelin(s, dist, reserve) {
    const d = s.druide, a = s.adv;
    const rodeur = !!aura(s, d, 'rodeur');
    if (rodeur) {
      if (dist <= K.porteeMelee) {
        const ouv = s.ouverture;
        if (ouv === 'rodeurRavager' && essayer(s, 'ravager')) return;
        if (essayer(s, 'traquer')) return;
        essayer(s, 'ravager');
      }
      return;
    }
    if (dist > 10 && pret(s, d, 'celerite') && (a.categorie === 'distance' || dist > 15) && !enracine(s, d)) { essayer(s, 'celerite'); }
    if (dist >= 8 && dist <= 25 && rang(s, 'chargeFarouche') && !immunise(s, a) && essayer(s, 'chargeFeline')) return;
    if (dist > K.porteeMelee) {
      if (dist <= 30 && !aura(s, a, 'lucioles') && (a.camoufle || a.classe === 'voleur')) essayer(s, 'lucioles');
      return;
    }
    if (d.gcdFin > s.t) return;
    if (immunise(s, a)) return;
    // Interrompre un gros soin adverse : passer en ours et Sonner
    if (a.incant && (a.incant.id === 'lumiere') && a.incant.fin - s.t > 1.7 && pret(s, d, 'sonner') &&
        d.mana >= 2 * s.profil.coutForme && !d.plan) {
      demarrerPlan(s, { nom: 'Interrompre le soin (ours + Sonner)', etapes: [{ type: 'action', id: 'formeOurs' }, { type: 'attendreRage', seuil: 10, attente: 2.5 }, { type: 'action', id: 'sonner', attente: 2 }] });
      if (executerPlan(s)) return;
    }
    // Puissance changeante (Forever) : mana contre 40 énergie, hors temps de recharge global
    if (s.config.powershift && d.energie < 30 && d.mana >= coutMana(s, 'puissanceChangeante') + reserve) essayer(s, 'puissanceChangeante');
    const pvA = s.f.pvAdv;
    if (!aura(s, a, 'lucioles') && a.def.armure > 3000 * s.f.armAdv && !controle(s, a)) { if (essayer(s, 'lucioles')) return; }
    const finisseur = d.cp >= 5 || (d.cp >= 3 && a.pv < 900 * pvA);
    if (finisseur) {
      if (!aura(s, a, 'dechirureDot') && a.pv > 1800 * pvA && a.classe !== 'mage') { if (essayer(s, 'dechirure')) return; }
      if (essayer(s, 'morsure')) return;
      return;
    }
    if (!aura(s, a, 'griffureDot') && a.pv > 1000 * pvA && !derriereFixe(s)) { if (essayer(s, 'griffure')) return; }
    if (derriereFixe(s) && essayer(s, 'lambeau')) return;
    if (derriereFixe(s) && d.energie < coutEnergie(s, 'lambeau')) return; // garder l'énergie pour Lambeau
    essayer(s, 'griffe');
  }
  function derriereFixe(s) { return !!(controle(s, s.adv) || aura(s, s.druide, 'dansDos')); }

  function rotationOurs(s, dist) {
    const d = s.druide, a = s.adv;
    const enMelee = dist <= K.porteeMelee;
    if (immunise(s, a)) return;
    // Interruptions : prioritaires
    if (a.incant && enMelee && d.rage >= 10 && pret(s, d, 'sonner') && s.config.methodeSoin !== 'sonner') { if (essayer(s, 'sonner')) return; }
    if (a.incant && enMelee && d.rage >= 10 && pret(s, d, 'sonner') && pct(d) > 0.6) { if (essayer(s, 'sonner')) return; }
    if (dist >= 8 && dist <= 25) {
      if (d.rage < 5 && pret(s, d, 'enrager') && rang(s, 'chargeFarouche')) { essayer(s, 'enrager'); }
      if (essayer(s, 'chargeFarouche')) return;
    }
    if (!enMelee) return;
    if (d.rage < 10 && pret(s, d, 'enrager')) essayer(s, 'enrager');
    const garde = s.config.methodeSoin === 'sonner' || s.config.methodeSoin === 'auto' ? 10 : 0;
    if (d.gcdFin <= s.t) {
      if (!aura(s, a, 'lucioles')) { if (essayer(s, 'lucioles')) return; }
      if (!aura(s, a, 'demoralise') && a.categorie === 'corps à corps' && d.rage >= 10) { if (essayer(s, 'rugissement')) return; }
      if (d.rage >= coutRage(s, 'morsurePrimitive') + garde && essayer(s, 'morsurePrimitive')) return;
      const lac = aura(s, a, 'lacerationDot');
      if (rang(s, 'laceration') && (!lac || lac.cumul < 5 || lac.fin - s.t < 4) && d.rage >= coutRage(s, 'laceration') + garde &&
          (a.def.armure > 3000 * s.f.armAdv || !lac) && essayer(s, 'laceration')) return;
    }
    if (!d.mutilationPrete && d.rage >= coutRage(s, 'mutilation') + garde) essayer(s, 'mutilation');
    if (d.rage >= 60 && d.gcdFin <= s.t) essayer(s, 'balayage');
  }

  // ===================================================================
  //                             ADVERSAIRES
  // ===================================================================
  function gcdAdv(s, a, duree) { a.gcdFin = s.t + (duree || 1.5); }
  function libreAdv(s, a) { return !controle(s, a) && !a.incant && a.gcdFin <= s.t; }
  function cibleVisible(s) { const d = s.druide; return !aura(s, d, 'rodeur') && !immunise(s, d); }
  // Fuir n'a de sens que si l'on va plus vite que le druide (ou qu'il est bloqué)
  function fuiteUtile(s, a) { const d = s.druide; return !!controle(s, d) || vitesse(s, a) > vitesse(s, d) * 1.05; }

  function frappeAdv(s, a, nom, montant, o) {
    const d = s.druide;
    const j = jet(s, a, d, o || {});
    if (j === 'rate' || j === 'esquive' || j === 'parade') {
      log(s, 'echec', `${nom} de ${a.nom} : ${libelleJet(j)}`);
      coup(s, d, nom, 0, libelleJet(j));
      if (j === 'esquive' && a.classe === 'guerrier') a.fulgurance = s.t + 5;
      // Réaction naturelle : 20 % de chances par rang de gagner 5 rage en esquivant en ours
      if (j === 'esquive' && d.forme === 'ours' && s.alea() < 0.2 * rang(s, 'reactionNaturelle')) d.rage = Math.min(100, d.rage + 5);
      return null;
    }
    degats(s, a, d, montant, Object.assign({ nom, ecole: 'physique', crit: j === 'critique', melee: true }, o || {}));
    return j;
  }
  function sortAdv(s, a, nom, montant, ecole, o) {
    const d = s.druide;
    const r = s.alea() * 100;
    if (r < 4) { log(s, 'echec', `${nom} de ${a.nom} : résisté`); coup(s, d, nom, 0, 'résisté'); return null; }
    const crit = r < 4 + a.def.crit + ((o && o.critBonus) || 0);
    return degats(s, a, d, montant, Object.assign({ nom, ecole, crit, multCrit: (o && o.multCrit) || 1.5 }, o || {}));
  }
  function verrouilleAdv(s, a) { return !!aura(s, a, 'verrou'); }

  function contresortMage(s, a, d) {
    utilise(s, a, 'Contresort');
    a.cd.contresort = s.t + 30;
    interrompre(s, d, 10, 'nature', 'Contresort');
    // Contresort amélioré (Arcanes) : silence 4 s, plus de changement de forme payant
    if (capa(a, 'contresortAmeliore') && poser(s, d, 'silence', 4, {}, true)) log(s, 'degatA', 'Contresort amélioré : druide réduit au silence 4 s');
  }
  function transfertMage(s, a, d) {
    utilise(s, a, 'Transfert');
    a.cd.transfert = s.t + 15;
    retirerEntraves(a);
    retirer(a, 'etourdi');
    a.x += Math.sign(a.x - d.x || 1) * 20;
    log(s, 'info', 'Transfert : le mage se libère et se téléporte à 20 m');
  }

  const IA = {
    guerrier(s, a, d, dist) {
      a.intention = 'approcher';
      // Rage du berserker améliorée (Forever) : hors temps de recharge global, retire racines et ralentissements
      if (capa(a, 'rageBerserkerAmelioree') && !controle(s, a) && (enracine(s, a) || ralenti(s, a) < 0.95) && dist > K.porteeMelee && pret(s, a, 'berserker')) {
        a.cd.berserker = s.t + 30;
        retirerEntraves(a);
        a.rage = Math.min(100, a.rage + 10);
        utilise(s, a, 'Rage du berserker');
        log(s, 'info', 'Rage du berserker : le guerrier se libère, +10 rage');
      }
      if (!libreAdv(s, a) || !cibleVisible(s)) return;
      const druideIncante = !!d.incant;
      if (!a.charge && dist >= 8 && dist <= 25 && !enracine(s, a)) {
        a.charge = true;
        a.x = d.x + Math.sign(a.x - d.x) * 3;
        a.rage += 15;
        poser(s, d, 'etourdi', 1, { sansDR: true }, true);
        utilise(s, a, 'Charge');
        log(s, 'degatA', 'Charge du guerrier : étourdi 1 s, +15 rage');
        gcdAdv(s, a);
        return;
      }
      if (a.charge && dist >= 8 && dist <= 25 && !enracine(s, a) && pret(s, a, 'interception') && a.rage >= 10) {
        a.rage -= 10;
        a.cd.interception = s.t + 30;
        a.x = d.x + Math.sign(a.x - d.x) * 3;
        poser(s, d, 'etourdi', 3, {}, true);
        utilise(s, a, 'Interception');
        log(s, 'degatA', 'Interception : étourdi 3 s');
        gcdAdv(s, a);
        return;
      }
      if (druideIncante && dist <= K.porteeMelee && pret(s, a, 'volee') && a.rage >= 10) {
        a.rage -= 10;
        a.cd.volee = s.t + 10;
        utilise(s, a, 'Volée de coups');
        interrompre(s, d, 4, 'nature', 'Volée de coups');
        return;
      }
      if (druideIncante && dist <= 10 && pret(s, a, 'cri') && a.rage >= 25 && !pret(s, a, 'volee')) {
        a.rage -= 25;
        a.cd.cri = s.t + 180;
        utilise(s, a, 'Cri d\'intimidation');
        poser(s, d, 'peur', 8, { seuil: 700 * s.f.degAdv, sansFuite: true }, true);
        gcdAdv(s, a);
        return;
      }
      if (dist > K.porteeMelee) return;
      if (pret(s, a, 'frappeMortelle') && a.rage >= 30) {
        a.rage -= 30;
        utilise(s, a, 'Frappe mortelle');
        a.cd.frappeMortelle = s.t + 6;
        if (frappeAdv(s, a, 'Frappe mortelle', a.def.degats * (0.85 + 0.3 * s.alea()) + 160)) poser(s, d, 'frappeMortelle', 10, {}, true);
        gcdAdv(s, a);
        return;
      }
      if (a.fulgurance > s.t && a.rage >= 5 && pret(s, a, 'fulgurance')) {
        a.rage -= 5;
        utilise(s, a, 'Fulgurance');
        a.cd.fulgurance = s.t + 5;
        a.fulgurance = 0;
        frappeAdv(s, a, 'Fulgurance', a.def.degats + 35, { inesquivable: true, critBonus: 25 });
        gcdAdv(s, a);
        return;
      }
      if (ralenti(s, d) > 0.9 && a.rage >= 10) {
        a.rage -= 10;
        utilise(s, a, 'Brise-genou');
        if (frappeAdv(s, a, 'Brise-genou', 45)) {
          poser(s, d, 'ralentiBrise', 15, { facteur: 0.6 }, true);
          // Brise-genou amélioré : 15 % de chances d'immobiliser 5 s
          if (capa(a, 'briseGenouAmeliore') && s.alea() < 0.15 && poser(s, d, 'immobilise', 5, {}, true)) log(s, 'degatA', 'Brise-genou amélioré : druide immobilisé 5 s');
        }
        gcdAdv(s, a);
        return;
      }
      if (a.rage >= 60 && !a.frappeHeroique) { a.rage -= 15; a.frappeHeroique = true; }
    },

    paladin(s, a, d, dist) {
      a.intention = 'approcher';
      if (controle(s, a) || a.incant) return;
      const bulle = !!aura(s, a, 'bouclier');
      const rechargeMarteau = capa(a, 'marteauAmeliore') ? 40 : 55;
      const multSoin = capa(a, 'soinsSacres') ? 1.2 : 1;
      if (a.gcdFin > s.t) return;
      // Rempart du templier (Sacré 31/20) : absorbe 100 % des PV 8 s ; Longanimité bloque le Bouclier divin 1 min
      if (capa(a, 'rempart') && pct(a) < 0.4 && pret(s, a, 'rempart') && !bulle) {
        a.cd.rempart = s.t + 300;
        a.cd.bouclier = Math.max(a.cd.bouclier || 0, s.t + 60);
        poser(s, a, 'rempart', 8, { reste: a.pvMax }, false);
        utilise(s, a, 'Rempart du templier');
        log(s, 'info', `Rempart du templier : absorbe ${a.pvMax} dégâts pendant 8 s`);
        evenement(s, 'cc', 'Rempart du templier (8 s)');
        gcdAdv(s, a);
        return;
      }
      if (pct(a) < 0.2 && pret(s, a, 'bouclier')) {
        a.cd.bouclier = s.t + 300;
        a.cd.rempart = Math.max(a.cd.rempart || 0, s.t + 60);
        for (const id of Object.keys(a.auras)) delete a.auras[id];
        poser(s, a, 'bouclier', 10, {}, false);
        utilise(s, a, 'Bouclier divin');
        log(s, 'info', 'Bouclier divin : le paladin est insensible 10 s, ses dégâts −50 %');
        evenement(s, 'cc', 'Bouclier divin (10 s)');
        gcdAdv(s, a);
        return;
      }
      if (pct(a) < 0.15 && pret(s, a, 'imposition') && !bulle) {
        a.cd.imposition = s.t + 1200;
        utilise(s, a, 'Imposition des mains');
        soigner(s, a, a.pvMax, 'Imposition des mains', false);
        a.mana = 0;
        evenement(s, 'soin', 'Imposition des mains');
        gcdAdv(s, a);
        return;
      }
      if ((enracine(s, a) || ralenti(s, a) < 0.95) && a.mana >= 60 && !aura(s, a, 'liberte')) {
        a.mana -= 60;
        retirerEntraves(a);
        poser(s, a, 'liberte', 10, {}, false);
        utilise(s, a, 'Bénédiction de liberté');
        log(s, 'info', 'Bénédiction de liberté : entraves retirées');
        gcdAdv(s, a);
        return;
      }
      const peutSoigner = !verrouilleAdv(s, a);
      if (d.incant && dist <= 10 && pret(s, a, 'marteau') && cibleVisible(s)) {
        a.cd.marteau = s.t + rechargeMarteau;
        poser(s, d, 'etourdi', 6, {}, true);
        utilise(s, a, 'Marteau de la justice');
        log(s, 'degatA', 'Marteau de la justice : étourdi 6 s');
        gcdAdv(s, a);
        return;
      }
      // Repentir (Forever, Vindicte palier 5) : 6 s, cède aux dégâts, 20 m. Sert à couper un soin ou à se soigner.
      if (capa(a, 'repentir') && pret(s, a, 'repentir') && dist <= 20 && cibleVisible(s) && a.mana >= 135 && !controle(s, d) &&
          ((d.incant && !pret(s, a, 'marteau')) || (pct(a) < 0.45 && !bulle && peutSoigner))) {
        a.mana -= 135;
        a.cd.repentir = s.t + 60;
        utilise(s, a, 'Repentir');
        if (poser(s, d, 'desoriente', 6, {}, true)) log(s, 'degatA', 'Repentir : druide neutralisé 6 s');
        gcdAdv(s, a);
        return;
      }
      const securite = bulle || controle(s, d) || dist > 12;
      if (peutSoigner && pct(a) < 0.5 && securite && a.mana >= 660) {
        a.mana -= 660;
        lancerIncant(s, a, 'lumiere', 2.5, 'Lumière sacrée', () => soigner(s, a, 1450 * s.f.soin * multSoin, 'Lumière sacrée', s.alea() < 0.15));
        return;
      }
      if (peutSoigner && pct(a) < 0.35 && a.mana >= 660 && !bulle) {
        a.mana -= 660;
        lancerIncant(s, a, 'lumiere', 2.5, 'Lumière sacrée', () => soigner(s, a, 1450 * s.f.soin * multSoin, 'Lumière sacrée', s.alea() < 0.15));
        return;
      }
      if (peutSoigner && pct(a) < 0.6 && securite && a.mana >= 140) {
        a.mana -= 140;
        lancerIncant(s, a, 'eclair', 1.5, 'Éclair lumineux', () => soigner(s, a, 437 * s.f.soin * multSoin, 'Éclair lumineux', s.alea() < 0.15));
        return;
      }
      if (!cibleVisible(s)) return;
      if (dist <= 10 && pret(s, a, 'marteau') && s.combat && (pct(a) < 0.55 || s.alea() < 0.02)) {
        a.cd.marteau = s.t + rechargeMarteau;
        poser(s, d, 'etourdi', 6, {}, true);
        utilise(s, a, 'Marteau de la justice');
        log(s, 'degatA', 'Marteau de la justice : étourdi 6 s');
        gcdAdv(s, a);
        return;
      }
      if (dist <= 10 && pret(s, a, 'jugement') && a.mana >= 90) {
        a.mana -= 90;
        a.cd.jugement = s.t + 10;
        const mult = aura(s, d, 'etourdi') ? 2 : 1;
        utilise(s, a, 'Jugement d\'autorité');
        sortAdv(s, a, `Jugement d'autorité${mult === 2 ? ' (cible étourdie)' : ''}`, 260 * mult, 'sacre');
        gcdAdv(s, a);
      }
    },

    mage(s, a, d, dist) {
      if (aura(s, a, 'bloc')) { a.intention = 'rester'; return; }
      if (controle(s, a)) return;
      const visible = cibleVisible(s);
      if (!visible) { a.intention = 'rester'; return; }
      const druideLibre = !controle(s, d) && !enracine(s, d);
      // Réactions hors temps de recharge global
      if (d.incant && pret(s, a, 'contresort') && dist <= 30 && !a.incant && s.alea() < 0.3) {
        contresortMage(s, a, d);
        return;
      }
      // Pouvoir des arcanes : hors temps de recharge global
      if (capa(a, 'pouvoirArcanes') && pret(s, a, 'pouvoirArcanes') && s.combat && dist <= 30 && pct(d) < 0.8) {
        a.cd.pouvoirArcanes = s.t + 180;
        poser(s, a, 'pouvoirArcanes', 15, {}, false);
        utilise(s, a, 'Pouvoir des arcanes');
        log(s, 'info', 'Pouvoir des arcanes : dégâts des sorts +30 % pendant 15 s');
      }
      if ((controle(s, a) || enracine(s, a)) && pret(s, a, 'transfert') && dist <= 8) { /* bloqué : traité plus bas */ }
      if (pct(a) < 0.2 && pret(s, a, 'bloc') && !a.incant) {
        a.cd.bloc = s.t + 300;
        for (const id of Object.keys(a.auras)) delete a.auras[id];
        poser(s, a, 'bloc', 10, {}, false);
        utilise(s, a, 'Bloc de glace');
        log(s, 'info', 'Bloc de glace : le mage est insensible 10 s');
        evenement(s, 'cc', 'Bloc de glace (10 s)');
        return;
      }
      if (a.incant) { a.intention = 'rester'; return; }
      if (a.gcdFin > s.t) { a.intention = dist < 20 && fuiteUtile(s, a) ? 'fuir' : 'rester'; return; }
      if (capa(a, 'barriere') && !aura(s, a, 'barriere') && pret(s, a, 'barriere') && a.mana >= 300) {
        a.mana -= 300;
        a.cd.barriere = s.t + 30;
        poser(s, a, 'barriere', 60, { reste: Math.round(920 * s.f.soin) }, false);
        utilise(s, a, 'Barrière de glace');
        log(s, 'info', `Barrière de glace (${Math.round(920 * s.f.soin)} absorbés, givre +15 %)`);
        gcdAdv(s, a);
        return;
      }
      if (d.forme === 'humanoide' && d.incant && pret(s, a, 'contresort') === false && dist <= 30 && a.mana >= 150 && !verrouilleAdv(s, a)) {
        a.mana -= 150;
        lancerIncant(s, a, 'metamorphose', 1.5, 'Métamorphose', () => poser(s, d, 'mouton', 10, {}, true));
        a.intention = 'rester';
        return;
      }
      if (d.incant && pret(s, a, 'contresort') && dist <= 30) {
        contresortMage(s, a, d);
        return;
      }
      if (dist <= 10 && druideLibre && pret(s, a, 'nova') && a.mana >= 100) {
        a.mana -= 100;
        a.cd.nova = s.t + 23;
        utilise(s, a, 'Nova de givre');
        degats(s, a, d, 75, { nom: 'Nova de givre', ecole: 'givre' });
        poser(s, d, 'enracine', 8, { cassable: true, nova: true }, true);
        gcdAdv(s, a);
        a.intention = 'fuir';
        return;
      }
      if (dist <= 6 && druideLibre && pret(s, a, 'transfert')) { transfertMage(s, a, d); gcdAdv(s, a); return; }
      if (dist <= 10 && druideLibre && pret(s, a, 'cone') && a.mana >= 210) {
        a.mana -= 210;
        a.cd.cone = s.t + 10;
        utilise(s, a, 'Cône de froid');
        if (sortAdv(s, a, 'Cône de froid', 390, 'givre')) poser(s, d, 'ralentiCone', 6, { facteur: 0.6 }, true);
        gcdAdv(s, a);
        return;
      }
      const geleNova = d.auras.enracine && d.auras.enracine.nova && aura(s, d, 'enracine');
      // Javelot de glace (Forever) : recharge partagée avec Trait de feu, ×4 sur une cible gelée ou avec Doigts de givre
      const doigts = aura(s, a, 'doigts');
      if (dist <= 30 && pret(s, a, 'traitFeu') && a.mana >= 150 && (geleNova || doigts)) {
        a.mana -= 150;
        a.cd.traitFeu = s.t + 8;
        retirer(a, 'doigts');
        utilise(s, a, 'Javelot de glace');
        sortAdv(s, a, 'Javelot de glace (cible gelée)', 200 * 4, 'givre');
        gcdAdv(s, a);
        return;
      }
      if (dist <= 20 && pret(s, a, 'traitFeu') && a.mana >= 300 && (druideLibre || geleNova)) {
        a.mana -= 300;
        a.cd.traitFeu = s.t + 8;
        utilise(s, a, 'Trait de feu');
        sortAdv(s, a, 'Trait de feu', 600, 'feu');
        gcdAdv(s, a);
        return;
      }
      // Garder la distance avant d'incanter
      const vitesseD = vitesse(s, d);
      if (dist < 22 && (vitesseD === 0 || controle(s, d)) && dist < 18) { a.intention = 'fuir'; return; }
      if (dist < 12 && druideLibre && fuiteUtile(s, a)) { a.intention = 'fuir'; return; }
      if (dist <= 35 && a.mana >= 290) {
        a.mana -= 290;
        a.intention = 'rester';
        const effet = () => {
          const gel = d.auras.enracine && d.auras.enracine.nova && aura(s, d, 'enracine');
          if (sortAdv(s, a, 'Éclair de givre', 780, 'givre', { critBonus: gel && capa(a, 'fracasser') ? 50 : 0, multCrit: 2 })) {
            poser(s, d, 'ralentiGivre', 9, { facteur: 0.6 }, true);
            if (capa(a, 'doigtsGivre') && s.alea() < 0.15) { poser(s, a, 'doigts', 15, {}, false); log(s, 'info', 'Doigts de givre : prochain Javelot de glace comme sur cible gelée'); }
          }
        };
        // Présence spirituelle (Arcanes) : Éclair de givre instantané, gardé pour une cible bloquée ou basse
        if (capa(a, 'presenceSpirituelle') && pret(s, a, 'presence') && (controle(s, d) || enracine(s, d) || pct(d) < 0.4)) {
          a.cd.presence = s.t + 180;
          utilise(s, a, 'Présence spirituelle');
          log(s, 'info', 'Présence spirituelle : Éclair de givre instantané');
          gcdAdv(s, a);
          utilise(s, a, 'Éclair de givre');
          effet();
        } else lancerIncant(s, a, 'eclairGivre', 2.5, 'Éclair de givre', effet);
        return;
      }
      a.intention = dist > 30 ? 'approcher' : 'rester';
    },

    chasseur(s, a, d, dist) {
      if (controle(s, a)) return;
      if (!cibleVisible(s)) { a.intention = 'rester'; return; }
      a.familierActif = true;
      if (a.incant) { a.intention = 'rester'; return; }
      const druideBloque = controle(s, d) || enracine(s, d) || ralenti(s, d) < 0.8;
      if (a.gcdFin > s.t) return;
      // Courroux bestial : hors temps de recharge global
      if (capa(a, 'courroux') && pret(s, a, 'courroux') && s.combat) {
        a.cd.courroux = s.t + 120;
        poser(s, a, 'courroux', 18, {}, false);
        utilise(s, a, 'Courroux bestial');
        log(s, 'info', 'Courroux bestial : familier +50 % de dégâts pendant 18 s');
      }
      // Intimidation : le familier étourdit 3 s, pour couper un soin ou se dégager
      if (capa(a, 'intimidation') && pret(s, a, 'intimidation') && !controle(s, d) && (d.incant || dist <= K.porteeMelee)) {
        utilise(s, a, 'Intimidation');
        a.cd.intimidation = s.t + 60;
        if (d.incant) annulerIncant(s, d, 'interrompu par Intimidation');
        if (poser(s, d, 'etourdi', 3, {}, true)) log(s, 'degatA', 'Intimidation : druide étourdi 3 s');
        gcdAdv(s, a);
        if (dist <= K.porteeMelee) a.intention = 'fuir';
        return;
      }
      if (dist <= K.porteeMelee) {
        if (capa(a, 'dispersion') && pret(s, a, 'dispersion') && !controle(s, d)) {
          a.cd.dispersion = s.t + 30;
          utilise(s, a, 'Flèche de dispersion');
          degats(s, a, d, 80, { nom: 'Flèche de dispersion', ecole: 'physique' });
          poser(s, d, 'desoriente', 4, {}, true);
          gcdAdv(s, a);
          a.intention = 'fuir';
          return;
        }
        if (pret(s, a, 'piege') && (aura(s, d, 'desoriente') || s.alea() < 0.3)) {
          a.cd.piege = s.t + 30;
          s.piege = { x: a.x, arme: s.t + 1 };
          utilise(s, a, 'Piège givrant');
          log(s, 'info', 'Le chasseur pose un Piège givrant');
          gcdAdv(s, a);
          a.intention = 'fuir';
          return;
        }
        if (aura(s, d, 'desoriente') || aura(s, d, 'gel')) { a.intention = 'fuir'; return; }
        if (ralenti(s, d) > 0.9 && a.mana >= 60) {
          a.mana -= 60;
          utilise(s, a, 'Coupure d\'ailes');
          if (frappeAdv(s, a, 'Coupure d\'ailes', 50)) poser(s, d, 'ralentiAiles', 10, { facteur: 0.5 }, true);
          gcdAdv(s, a);
          a.intention = 'fuir';
          return;
        }
        if (pret(s, a, 'raptor')) {
          a.cd.raptor = s.t + 6;
          utilise(s, a, 'Attaque du raptor');
          frappeAdv(s, a, 'Attaque du raptor', 330);
        }
        a.intention = fuiteUtile(s, a) ? 'fuir' : 'rester';
        return;
      }
      if (dist < 8) { a.intention = fuiteUtile(s, a) ? 'fuir' : 'approcher'; return; }
      if (dist < 25 && (druideBloque || aura(s, d, 'gel')) && fuiteUtile(s, a) && !(aura(s, d, 'gel') && dist >= 20)) { a.intention = 'fuir'; return; }
      a.intention = 'rester';
      if (dist > 35) { a.intention = 'approcher'; return; }
      if (!aura(s, d, 'piqure') && a.mana >= 115) {
        a.mana -= 115;
        const vipere = d.mana > d.manaMax * 0.3;
        if (vipere) poserPeriodique(s, d, 'piqure', 8, 2, 600 * s.f.degAdv, { type: 'drain', nom: 'Piqûre de vipère' });
        else poserPeriodique(s, d, 'piqure', 15, 3, 555, { type: 'degats', ecole: 'nature', nom: 'Piqûre de serpent', source: 'adv' });
        utilise(s, a, vipere ? 'Piqûre de vipère' : 'Piqûre de serpent');
        log(s, 'info', vipere ? 'Piqûre de vipère : drain de mana' : 'Piqûre de serpent');
        gcdAdv(s, a);
        return;
      }
      if (!druideBloque && pret(s, a, 'choc') && dist < 30 && a.mana >= 80) {
        a.mana -= 80;
        a.cd.choc = s.t + 12;
        poser(s, d, 'ralentiChoc', 4, { facteur: 0.5 }, true);
        utilise(s, a, 'Trait de choc');
        log(s, 'degatA', 'Trait de choc : ralenti 4 s');
        gcdAdv(s, a);
        return;
      }
      if (capa(a, 'visee') && pret(s, a, 'visee') && a.mana >= 310 && (dist >= 20 || druideBloque)) {
        a.mana -= 310;
        a.cd.visee = s.t + 6;
        lancerIncant(s, a, 'visee', 2, 'Visée', () => {
          const j = frappeAdv(s, a, 'Visée', a.def.degats + 600, { melee: false });
          return j;
        });
        return;
      }
      if (pret(s, a, 'arcanes') && a.mana >= 160) {
        a.mana -= 160;
        a.cd.arcanes = s.t + 6;
        utilise(s, a, 'Tir des arcanes');
        sortAdv(s, a, 'Tir des arcanes', 300, 'arcane');
        gcdAdv(s, a);
        return;
      }
      if (pret(s, a, 'multi') && a.mana >= 200) {
        a.mana -= 200;
        a.cd.multi = s.t + 6;
        utilise(s, a, 'Flèches multiples');
        frappeAdv(s, a, 'Flèches multiples', a.def.degats + 150, { melee: false });
        gcdAdv(s, a);
      }
    },

    voleur(s, a, d, dist) {
      if (controle(s, a)) return;
      a.intention = 'approcher';
      const druideCamoufle = !!aura(s, d, 'rodeur');
      if (a.camoufle && druideCamoufle) {
        if (dist <= 6 && !a.decouvert) {
          a.decouvert = true;
          if (s.alea() < 0.5) { retirer(d, 'rodeur'); log(s, 'info', 'Le voleur repère le druide en premier'); }
          else { a.camoufle = false; log(s, 'info', 'Le druide repère le voleur en premier'); }
        }
        return;
      }
      if (!cibleVisible(s)) return;
      if (a.gcdFin > s.t) return;
      if (a.camoufle) {
        if (dist <= K.porteeMelee && a.energie >= 60) {
          a.energie -= 60;
          a.camoufle = false;
          poser(s, d, 'etourdi', 4, {}, true);
          a.cp = Math.min(5, a.cp + (capa(a, 'premeditation') ? 4 : 2));
          utilise(s, a, 'Coup bas');
          log(s, 'degatA', `Coup bas${capa(a, 'premeditation') ? ' et Préméditation' : ''} : étourdi 4 s`);
          gcdAdv(s, a, 1);
        }
        return;
      }
      const rechargeLongue = capa(a, 'elusivite') ? 210 : 300;
      // Préparation (Finesse) : remet à zéro Disparition, Cécité, Évasion et Coup de pied
      if (capa(a, 'preparation') && pret(s, a, 'preparation') && s.combat && !pret(s, a, 'disparition') && !pret(s, a, 'cecite')) {
        a.cd.preparation = s.t + 600;
        for (const id of ['disparition', 'cecite', 'evasion', 'coupPied']) a.cd[id] = 0;
        utilise(s, a, 'Préparation');
        log(s, 'info', 'Préparation : Disparition, Cécité, Évasion et Coup de pied de nouveau prêts');
        gcdAdv(s, a, 1);
        return;
      }
      // Finesse : disparaître pour rouvrir par un Coup bas
      if (capa(a, 'reouverture') && pret(s, a, 'disparition') && s.combat && pct(a) < 0.55 && !controle(s, d) && dist <= 10 && !saigne(s, a)) {
        a.cd.disparition = s.t + rechargeLongue;
        retirerEntraves(a);
        a.camoufle = true;
        a.energie = Math.max(a.energie, 60);
        utilise(s, a, 'Disparition');
        log(s, 'info', 'Disparition : le voleur se camoufle pour rouvrir');
        gcdAdv(s, a, 1);
        return;
      }
      if (enracine(s, a) && d.incant && pret(s, a, 'disparition') && dist > K.porteeMelee) {
        a.cd.disparition = s.t + rechargeLongue;
        retirerEntraves(a);
        a.camoufle = true;
        utilise(s, a, 'Disparition');
        log(s, 'info', 'Disparition : le voleur se libère et se camoufle');
        gcdAdv(s, a, 1);
        return;
      }
      if (dist > K.porteeMelee) return;
      if (capa(a, 'poussee') && s.combat && pret(s, a, 'poussee') && pct(d) < 0.9) {
        a.cd.poussee = s.t + 300;
        poser(s, a, 'poussee', 15, {}, false);
        utilise(s, a, 'Poussée d\'adrénaline');
        log(s, 'info', 'Poussée d\'adrénaline : régénération d\'énergie doublée 15 s');
      }
      if (d.incant && pret(s, a, 'coupPied') && a.energie >= 25) {
        a.energie -= 25;
        a.cd.coupPied = s.t + 10;
        utilise(s, a, 'Coup de pied');
        interrompre(s, d, 5, 'nature', 'Coup de pied');
        if (capa(a, 'coupPiedAmeliore') && poser(s, d, 'silence', 2, {}, true)) log(s, 'degatA', 'Coup de pied amélioré : silence 2 s');
        return;
      }
      // Cécité : coupe un soin quand Coup de pied est en recharge
      if (d.incant && !pret(s, a, 'coupPied') && pret(s, a, 'cecite') && a.energie >= 30 && dist <= 10) {
        a.energie -= 30;
        a.cd.cecite = s.t + rechargeLongue;
        utilise(s, a, 'Cécité');
        interrompre(s, d, 0, null, 'Cécité');
        if (poser(s, d, 'desoriente', 10, {}, true)) log(s, 'degatA', 'Cécité : druide aveuglé 10 s');
        gcdAdv(s, a, 1);
        return;
      }
      if (pct(a) < 0.6 && pret(s, a, 'evasion')) {
        a.cd.evasion = s.t + 300;
        poser(s, a, 'evasion', 15, {}, false);
        utilise(s, a, 'Évasion');
        log(s, 'info', 'Évasion : esquive +50 %');
        return;
      }
      if (a.cp >= 4 && pret(s, a, 'aiguillon') && a.energie >= 25 && !controle(s, d)) {
        a.energie -= 25;
        a.cd.aiguillon = s.t + 20;
        poser(s, d, 'etourdi', 1 + a.cp, {}, true);
        utilise(s, a, 'Aiguillon perfide');
        log(s, 'degatA', `Aiguillon perfide : étourdi ${1 + a.cp} s`);
        a.cp = 0;
        gcdAdv(s, a, 1);
        return;
      }
      // Frappe fantomatique (Finesse) : esquive +15 % pendant 7 s
      if (capa(a, 'fantomatique') && pret(s, a, 'fantomatique') && a.energie >= 40 && a.cp < 5) {
        a.energie -= 40;
        a.cd.fantomatique = s.t + 20;
        utilise(s, a, 'Frappe fantomatique');
        if (frappeAdv(s, a, 'Frappe fantomatique', a.def.degats * 1.25)) { a.cp = Math.min(5, a.cp + 1); poser(s, a, 'fantomatique', 7, {}, false); }
        gcdAdv(s, a, 1);
        return;
      }
      if (a.cp >= 5 && a.energie >= 35) {
        a.energie -= 35;
        // Sang-froid (Assassinat) : Éviscération critique assurée
        const froid = capa(a, 'sangFroid') && pret(s, a, 'sangFroid');
        if (froid) { a.cd.sangFroid = s.t + 180; utilise(s, a, 'Sang-froid'); log(s, 'info', 'Sang-froid'); }
        utilise(s, a, 'Éviscération');
        if (frappeAdv(s, a, 'Éviscération', 1300, froid ? { critBonus: 100 } : undefined)) a.cp = 0;
        gcdAdv(s, a, 1);
        return;
      }
      if (pret(s, a, 'suriner') && a.energie >= 45 && !controle(s, d) && (d.incant || (pct(a) < 0.5 && a.energie < 60))) {
        a.energie -= 45;
        a.cd.suriner = s.t + 10;
        utilise(s, a, 'Suriner');
        if (frappeAdv(s, a, 'Suriner', 20)) poser(s, d, 'desoriente', 4, {}, true);
        gcdAdv(s, a, 1);
        return;
      }
      // Entaille (Forever) : coûte 5, rend 15 énergie, 50 % de l'arme de main gauche
      if (pret(s, a, 'entaille') && a.energie >= 5 && a.energie < 60) {
        a.energie += 10;
        a.cd.entaille = s.t + 10;
        utilise(s, a, 'Entaille');
        if (frappeAdv(s, a, 'Entaille', a.def.degats * 0.5)) a.cp = Math.min(5, a.cp + 1);
        gcdAdv(s, a, 1);
        return;
      }
      if (a.energie >= 40) {
        a.energie -= 40;
        utilise(s, a, capa(a, 'premeditation') ? 'Hémorragie' : 'Attaque pernicieuse');
        const jp = frappeAdv(s, a, capa(a, 'premeditation') ? 'Hémorragie' : 'Attaque pernicieuse', 330);
        if (jp) a.cp = Math.min(5, a.cp + (jp === 'critique' && capa(a, 'scelleDestin') ? 2 : 1));
        gcdAdv(s, a, 1);
      }
    },

    demoniste(s, a, d, dist) {
      if (controle(s, a)) return;
      if (!cibleVisible(s)) { a.intention = 'rester'; return; }
      a.familierActif = a.familierPv > 0;
      // Chasseur corrompu : hors temps de recharge global
      if (a.familierActif && d.incant && pret(s, a, 'verrouMagique') && s.alea() < 0.5) {
        a.cd.verrouMagique = s.t + 22;
        utilise(s, a, 'Verrou magique');
        interrompre(s, d, 6, 'nature', 'Verrou magique (chasseur corrompu)');
      }
      if (a.familierActif && pret(s, a, 'devorer')) {
        const id = ['recuperation', 'retabHot', 'ecorce', 'emprise'].find(x => aura(s, d, x));
        if (id) { a.cd.devorer = s.t + 8; retirer(d, id); utilise(s, a, 'Dévorer la magie'); log(s, 'info', `Dévorer la magie retire ${id === 'retabHot' ? 'Rétablissement' : SORTS[id].nom}`); }
      }
      // Pierre de soins (1 440), une fois par combat, hors temps de recharge global
      if (pct(a) < 0.35 && !a.pierreUtilisee) {
        a.pierreUtilisee = true;
        utilise(s, a, 'Pierre de soins');
        soigner(s, a, 1440 * s.f.soin, 'Pierre de soins', false);
      }
      if (a.incant) { a.intention = 'rester'; return; }
      if (a.gcdFin > s.t) return;
      a.intention = 'rester';
      const libre = !controle(s, d);
      if (dist <= 8 && libre && pret(s, a, 'voile') && a.mana >= 400) {
        a.mana -= 400;
        a.cd.voile = s.t + 120;
        utilise(s, a, 'Voile mortel');
        const m = sortAdv(s, a, 'Voile mortel', 589, 'ombre');
        if (m) soigner(s, a, m, 'Voile mortel', false);
        poser(s, d, 'horreur', 3, {}, true);
        gcdAdv(s, a);
        return;
      }
      if (dist <= 10 && libre && a.mana >= 150 && !verrouilleAdv(s, a)) {
        a.mana -= 150;
        lancerIncant(s, a, 'peur', 1.5, 'Peur', () => poser(s, d, 'peur', 10, { seuil: 500 * s.f.degAdv }, true));
        return;
      }
      if (!aura(s, d, 'corruption') && a.mana >= 290) {
        a.mana -= 290;
        poserPeriodique(s, d, 'corruption', 18, 3, 1000, { type: 'degats', ecole: 'ombre', nom: 'Corruption', source: 'adv', magie: true });
        utilise(s, a, 'Corruption');
        log(s, 'info', 'Corruption');
        gcdAdv(s, a);
        return;
      }
      if (!aura(s, d, 'agonie') && a.mana >= 265) {
        a.mana -= 265;
        poserPeriodique(s, d, 'agonie', 24, 2, 1300, { type: 'degats', ecole: 'ombre', nom: 'Fléau d\'agonie', source: 'adv' });
        utilise(s, a, 'Fléau d\'agonie');
        log(s, 'info', 'Fléau d\'agonie');
        gcdAdv(s, a);
        return;
      }
      // Forever : les fléaux sont séparés des malédictions, Fatigue s'ajoute à Agonie
      if (capa(a, 'fatigue') && !aura(s, d, 'ralentiFatigue') && a.mana >= 120 && dist <= 30) {
        a.mana -= 120;
        utilise(s, a, 'Malédiction de fatigue');
        if (poser(s, d, 'ralentiFatigue', 12, { facteur: 0.7, magie: true }, true)) log(s, 'info', 'Malédiction de fatigue : vitesse −30 %');
        gcdAdv(s, a);
        return;
      }
      if (dist <= 30 && a.mana >= 380 && !verrouilleAdv(s, a)) {
        a.mana -= 380;
        lancerIncant(s, a, 'trait', 2.5, 'Trait de l\'ombre', () => sortAdv(s, a, 'Trait de l\'ombre', 780, 'ombre'));
        return;
      }
      if (dist > 30) a.intention = 'approcher';
    }
  };

  // ---------------------------------------------------- attaques automatiques
  function attaquesAuto(s) {
    const d = s.druide, a = s.adv, dist = distance(s);
    // Druide
    if (d.forme !== 'humanoide' && dist <= K.porteeMelee && !controle(s, d) && !d.incant && !aura(s, d, 'rodeur') &&
        !immunise(s, a) && !a.camoufle && s.t >= d.prochainCoup && s.combat) {
      const vit = d.forme === 'ours' ? 2.5 : 1;
      d.prochainCoup = s.t + vit;
      if (d.forme === 'ours' && d.mutilationPrete && d.rage >= coutRage(s, 'mutilation')) {
        if (!aura(s, d, 'clarte')) d.rage -= coutRage(s, 'mutilation'); else retirer(d, 'clarte');
        d.mutilationPrete = false;
        frappe(s, 'Mutilation', (degatBlanc(s) + 128 * s.f.tech) * (1 + 0.05 * rang(s, 'furieSauvage')));
      } else {
        const j = jet(s, d, a, {});
        if (j === 'rate' || j === 'esquive' || j === 'parade') log(s, 'echec', `Attaque du druide : ${libelleJet(j)}`);
        else {
          degats(s, d, a, degatBlanc(s), { nom: d.forme === 'ours' ? 'Coup blanc (ours)' : 'Coup blanc (félin)', ecole: 'physique', crit: j === 'critique', blanc: true });
          if (j === 'critique' && d.forme === 'ours' && s.alea() < 0.5 * rang(s, 'frenesieSanglante')) d.rage = Math.min(100, d.rage + 5);
          procClarte(s, vit);
        }
      }
    }
    // Adversaire au corps à corps
    const peutTaper = !controle(s, a) && !a.incant && cibleVisible(s) && !a.camoufle && s.t >= a.prochainCoup &&
      !aura(s, d, 'gel') && !aura(s, d, 'desoriente');
    if (peutTaper && dist <= K.porteeMelee && (CLASSES_MELEE.includes(a.classe) || a.classe === 'chasseur')) {
      a.prochainCoup = s.t + (a.classe === 'chasseur' ? 3.6 : a.def.vitesseArme);
      let montant = a.classe === 'chasseur' ? 220 : a.def.degats;
      let nom = 'Coup blanc';
      if (a.classe === 'guerrier' && a.frappeHeroique) { montant += 157; nom = 'Frappe héroïque'; a.frappeHeroique = false; }
      const j = frappeAdv(s, a, nom, montant * (0.85 + 0.3 * s.alea()), { blanc: true, deuxArmes: a.classe === 'voleur' });
      if (j && a.classe === 'paladin' && s.alea() < 0.42) sortAdv(s, a, 'Sceau d\'autorité', a.def.degats * 0.7, 'sacre');
      if (j && a.classe === 'voleur' && s.alea() < 0.2) poser(s, d, 'ralentiPoison', 12, { facteur: 0.5 }, true);
      if (a.classe === 'voleur') a.energie = Math.min(100, a.energie + (j ? 0 : 0));
    } else if (peutTaper && a.classe === 'chasseur' && dist >= 8 && dist <= 35 && a.intention === 'rester') {
      a.prochainCoup = s.t + a.def.vitesseArme;
      frappeAdv(s, a, 'Tir automatique', a.def.degats * (0.9 + 0.2 * s.alea()), { melee: false });
    }
    // Familiers
    if (a.familierActif && cibleVisible(s) && !aura(s, d, 'gel') && !aura(s, d, 'desoriente') && !aura(s, d, 'mouton') && s.t >= a.prochainFamilier) {
      a.prochainFamilier = s.t + 2;
      const nom = a.classe === 'chasseur' ? 'Loup' : 'Chasseur corrompu';
      let montant = a.classe === 'chasseur' ? 95 : 70;
      if (capa(a, 'familierFort')) montant *= 1.2;
      if (aura(s, a, 'courroux')) montant *= 1.5;
      const j = jet(s, a, d, { inesquivable: false });
      if (j !== 'rate' && j !== 'esquive' && j !== 'parade') degats(s, a, d, montant * (0.85 + 0.3 * s.alea()), { nom, ecole: 'physique', crit: j === 'critique', melee: true });
    }
  }

  // --------------------------------------------------------------- mouvement
  function vitesse(s, e) {
    if (controle(s, e) && !aura(s, e, 'peur')) return 0;
    if (aura(s, e, 'peur') && e.auras.peur.sansFuite) return 0;
    if (enracine(s, e) || e.incant) return 0;
    let v = K.vitesseCourse;
    if (e.camp === 'druide') {
      if (e.forme === 'felin') {
        let bonus = 0.15 * rang(s, 'celeriteFeline');
        if (aura(s, e, 'celerite')) bonus = Math.max(bonus, 0.6);
        v *= 1 + bonus;
      }
      if (aura(s, e, 'rodeur')) v *= 0.7;
    } else if (e.camoufle) v *= 0.85;
    return v * ralenti(s, e);
  }

  function deplacer(s) {
    const d = s.druide, a = s.adv;
    const avantD = d.x;
    for (const e of [d, a]) {
      const o = autre(s, e);
      let intention = e.intention;
      if (aura(s, e, 'peur') && !e.auras.peur.sansFuite) intention = 'fuir';
      const v = vitesse(s, e);
      if (v === 0 || intention === 'rester') continue;
      const sens = Math.sign(o.x - e.x) || 1;
      const dist = Math.abs(o.x - e.x);
      if (intention === 'approcher') {
        if (dist <= 3) continue;
        e.x += sens * Math.min(v * PAS, dist - 3);
      } else if (intention === 'fuir') {
        e.x -= sens * v * PAS;
      }
    }
    // Piège givrant
    if (s.piege && s.t >= s.piege.arme) {
      const lo = Math.min(avantD, d.x) - 1, hi = Math.max(avantD, d.x) + 1;
      if (s.piege.x >= lo && s.piege.x <= hi) {
        s.piege = null;
        if (s.alea() < 0.4) log(s, 'info', 'Le druide contourne le Piège givrant');
        else if (poser(s, d, 'gel', 10, {}, true)) log(s, 'degatA', 'Le druide déclenche le Piège givrant : gelé 10 s');
      }
    }
  }

  // ----------------------------------------------------- effets périodiques
  function periodiques(s) {
    for (const e of [s.druide, s.adv]) {
      for (const id of Object.keys(e.auras)) {
        const x = e.auras[id];
        if (!x || !x.periode) continue;
        while (x.prochain <= s.t + 1e-9 && x.prochain <= x.fin && !s.fini) {
          x.prochain += x.periode;
          const src = e === s.druide ? s.adv : s.druide;
          if (x.type === 'degats') degats(s, src, e, x.montant, { nom: x.nom, ecole: x.ecole, ignoreArmure: true, sansRecul: x.ecole === 'physique' ? false : false });
          else if (x.type === 'soin') soigner(s, e, x.montant, x.nom, false);
          else if (x.type === 'drain') { const m = Math.min(e.mana, x.montant); e.mana -= m; s.res.manaDraine += m; log(s, 'degatA', `${x.nom} : −${Math.round(m)} mana`); }
          else if (x.type === 'rage') e.rage = Math.min(100, e.rage + x.montant);
          else if (x.type === 'regenFren') {
            const r = Math.min(10, Math.floor(e.rage));
            if (r > 0 && e.forme === 'ours') { e.rage -= r; soigner(s, e, r * 25 * s.f.soin, 'Régénération frénétique', false); }
          }
        }
        if (x.fin <= s.t) {
          // Floraison : un soin égal à l'Esprit quand Récupération ou Rétablissement arrive à son terme
          if (e === s.druide && (id === 'recuperation' || id === 'retabHot') && rang(s, 'floraison') && !s.fini) soigner(s, e, s.profil.esprit, 'Floraison', false);
          delete e.auras[id];
        }
      }
    }
  }

  function ressources(s) {
    const d = s.druide, a = s.adv;
    const tick = Math.abs(s.t / 2 - Math.round(s.t / 2)) < 1e-6 && s.t > 0;
    if (!tick) return;
    // Druide : énergie, mana (règle des 5 secondes)
    d.energie = Math.min(100, d.energie + 20);
    let regen = s.profil.regenMana;
    const innerv = aura(s, d, 'innervation');
    if (innerv) regen *= 5;
    else if (s.t - d.dernierSort < 5) regen *= 0.167 * rang(s, 'reflexion');
    d.mana = Math.min(d.manaMax, d.mana + regen);
    // Adversaire
    if (a.classe === 'voleur') a.energie = Math.min(100, a.energie + (aura(s, a, 'poussee') ? 40 : 20));
    // Règle des 5 secondes pour l'adversaire aussi : pas de régénération s'il a dépensé du mana
    if (a.manaMax) {
      if (a.mana < a.manaPrec - 1e-6) a.dernierSort = s.t;
      if (s.t - (a.dernierSort || -10) >= 5) a.mana = Math.min(a.manaMax, a.mana + 25);
      else if (a.classe === 'mage') a.mana = Math.min(a.manaMax, a.mana + 12.5); // Armure de mage : 50 % en incantant
      a.manaPrec = a.mana;
    }
  }

  // ================================================================ combat
  // Spécialisation de l'adversaire : celle demandée, sinon la première de sa classe
  function specAdversaire(advId, specId) {
    const specs = (ADVERSAIRES[advId] && ADVERSAIRES[advId].specs) || [];
    return specs.find(x => x.id === specId) || specs[0] || { id: 'base', nom: '', mods: {}, capacites: [] };
  }

  function resoudreConfig(config) {
    const def = ADVERSAIRES[config.adversaire];
    const spec = specAdversaire(config.adversaire, config.specAdv);
    const forme = config.forme === 'auto' ? (spec.conseilForme || def.conseilForme) : config.forme;
    let ouverture = config.ouverture;
    if (ouverture === 'auto') ouverture = forme === 'felin' ? 'rodeurTraquer' : ((config.talents.chargeFarouche || 0) ? 'chargeFarouche' : 'direct');
    if (forme === 'ours' && (ouverture === 'rodeurTraquer' || ouverture === 'rodeurRavager')) ouverture = 'rodeurTraquer';
    // Sans Traquer (niveau 36) ni Ravager (32), l'ouverture sous Rôder retombe sur ce qui est appris
    const n = niveauDe(config.niveau);
    const repli = () => forme === 'ours' ? ((config.talents.chargeFarouche || 0) ? 'chargeFarouche' : 'direct') : 'direct';
    if (ouverture === 'rodeurTraquer' && n < SORTS.traquer.niveau) ouverture = forme === 'felin' && n >= SORTS.ravager.niveau ? 'rodeurRavager' : repli();
    if (ouverture === 'rodeurRavager' && n < SORTS.ravager.niveau) ouverture = repli();
    return { forme, ouverture };
  }

  function creerCombat(config, journalActif) {
    const spec = specAdversaire(config.adversaire, config.specAdv);
    const def = Object.assign({}, ADVERSAIRES[config.adversaire], spec.mods || {});
    const mult = config.equipAdv === 'epique' ? 1.15 : 1;
    const profil = profilDruide(config.stats, config.talents);
    const { forme, ouverture } = resoudreConfig(config);
    const f = facteurs();
    const niveau = K.niveau;
    // Talents adverses à 31 points : pas avant le niveau 40
    const capacites = (spec.capacites || []).filter(c => !(NIVEAUX_CAPA[c] > niveau));
    const s = {
      t: 0, alea: creerAlea(config.graine || 1), config, points: config.talents, profil, niveau, f,
      formePrincipale: forme, ouverture, journalActif: !!journalActif, journal: [], evenements: [], actions: [], coups: [], images: [],
      fini: false, gagnant: null, combat: false, piege: null,
      res: {
        parSort: {}, parSource: {}, degatsInfliges: 0, degatsSubis: 0, soins: 0, soinsAdv: 0, soinsInterrompus: 0,
        manaDraine: 0, plans: {}, changementsForme: 0, powershifts: 0, etourdissements: 0,
        utilisations: { druide: {}, adv: {} }, controlesSubis: {}
      }
    };
    const formeDepart = (ouverture === 'rodeurTraquer' || ouverture === 'rodeurRavager') ? 'felin' : forme;
    s.druide = {
      camp: 'druide', nom: 'Druide', forme: formeDepart, pvMax: profil.pv[formeDepart], pv: profil.pv[formeDepart],
      mana: profil.manaMax, manaMax: profil.manaMax, rage: formeDepart === 'ours' && rang(s, 'furie') >= 5 ? 10 : 0,
      energie: 100, cp: 0, x: 0, auras: {}, dr: {}, cd: {}, gcdFin: 0, incant: null, prochainCoup: 0,
      mutilationPrete: false, dernierSort: -10, intention: 'approcher', intentionForcee: null, plan: null, prochainEssaiSoin: 0,
      energieQuittee: 0, tQuitteFelin: 0
    };
    if (formeDepart === 'felin' && formeDepart !== forme) {
      // ouverture en félin puis passage dans la forme principale
    }
    // Emprise de la nature est apprise au niveau 10 dans Forever : posée avant le duel
    s.druide.auras.emprise = { fin: 45, debut: 0, magie: true };
    s.druide.cd.emprise = 15;
    if (ouverture === 'rodeurTraquer' || ouverture === 'rodeurRavager') {
      s.druide.auras.rodeur = { fin: 1e9, debut: 0 };
      s.druide.auras.posture = { fin: 1e9, debut: 0 };
    }
    s.adv = {
      camp: 'adv', nom: def.nom, classe: def.classe, categorie: def.categorie,
      def: Object.assign({}, def, { degats: def.degats * mult, armure: def.armure * f.armAdv }),
      pvMax: Math.round(def.pv * mult * f.pvAdv), pv: Math.round(def.pv * mult * f.pvAdv), mana: def.mana, manaMax: def.mana,
      rage: 0, energie: 100, cp: 0, x: config.distance || 25, auras: {}, dr: {}, cd: {}, gcdFin: 0, incant: null,
      prochainCoup: 0, prochainFamilier: 1, intention: 'rester', manaPrec: def.mana, dernierSort: -10, camoufle: def.classe === 'voleur', charge: false,
      familierActif: false, spec: spec.id, capa: new Set(capacites),
      familierPv: def.classe === 'demoniste' ? Math.round(2800 * f.pvAdv) : 0
    };
    s.multAdv = mult;
    if (capa(s.adv, 'barriere')) { s.adv.auras.barriere = { fin: 60, debut: 0, reste: Math.round(920 * f.soin) }; s.adv.cd.barriere = 25; }
    log(s, 'info', `Début du duel${niveau < CONSTANTES.niveau ? ` au niveau ${niveau}` : ''} à ${config.distance || 25} m contre un ${def.nom.toLowerCase()} ${spec.nom}. Forme principale : ${nomForme(forme)}, ouverture : ${libelleOuverture(ouverture)}.`);
    return s;
  }

  function libelleOuverture(o) {
    return ({ rodeurTraquer: 'Rôder puis Traquer', rodeurRavager: 'Rôder puis Ravager', chargeFarouche: 'Charge farouche', direct: 'attaque directe' })[o] || o;
  }

  function pas(s) {
    periodiques(s);
    if (s.fini) return;
    // fin des incantations
    for (const e of [s.druide, s.adv]) {
      if (e.incant && s.t >= e.incant.fin - 1e-9) {
        const inc = e.incant;
        e.incant = null;
        if (!controle(s, e)) inc.surFin();
        if (s.fini) return;
      }
    }
    ressources(s);
    // Le druide quitte la forme de félin d'ouverture si sa forme principale est l'ours
    const d = s.druide;
    if (s.formePrincipale === 'ours' && d.forme === 'felin' && !aura(s, d, 'rodeur') && !controle(s, d) && d.gcdFin <= s.t && !d.plan) {
      essayer(s, 'formeOurs');
    }
    iaDruide(s);
    const a = s.adv;
    const dist = distance(s);
    // Forever : Transfert libère des étourdissements (réaction humaine d'environ 0,6 s)
    const et = aura(s, a, 'etourdi');
    if (a.classe === 'mage' && et && controle(s, a) === 'etourdi' && pret(s, a, 'transfert') && s.t - et.debut >= 0.6) transfertMage(s, a, d);
    if (!controle(s, a) || aura(s, a, 'bloc')) IA[a.classe](s, a, d, dist);
    else a.intention = 'rester';
    if (controle(s, d)) d.intention = 'rester';
    attaquesAuto(s);
    deplacer(s);
  }

  // Image de la cinématique : positions, ressources, incantations et contrôles à l'instant t
  function image(s) {
    const d = s.druide, a = s.adv;
    const inc = e => e.incant ? { nom: e.incant.nom, p: Math.min(1, (s.t - e.incant.debut) / e.incant.total) } : null;
    const r1 = x => Math.round(x * 10) / 10;
    return {
      t: r1(s.t), xD: r1(d.x), xA: r1(a.x),
      pvD: Math.max(0, Math.round(d.pv)), pvMaxD: d.pvMax, pvA: Math.max(0, Math.round(a.pv)), pvMaxA: a.pvMax,
      forme: d.forme, mana: d.mana / d.manaMax, rage: Math.round(d.rage), energie: Math.round(d.energie), cp: d.cp,
      resA: a.classe === 'guerrier' ? a.rage / 100 : a.classe === 'voleur' ? a.energie / 100 : a.mana / a.manaMax,
      cpA: a.cp, incD: inc(d), incA: inc(a), ccD: controle(s, d) || (enracine(s, d) ? 'enracine' : null),
      ccA: controle(s, a) || (enracine(s, a) ? 'enracine' : null), cacheD: !!aura(s, d, 'rodeur'), cacheA: !!a.camoufle,
      familier: a.familierPv > 0 || a.classe === 'chasseur'
    };
  }

  function simuler(config, options) {
    return avecNiveau(config.niveau, config.base, () => simulerNiveau(config, options || {}));
  }
  function simulerNiveau(config, opts) {
    const s = creerCombat(config, opts.journal);
    const duree = opts.dureeMax || DUREE_MAX;
    while (!s.fini && s.t < duree) {
      pas(s);
      if (s.journalActif) s.images.push(image(s));
      s.t = Math.round((s.t + PAS) * 1000) / 1000;
    }
    if (s.journalActif) s.images.push(image(s));
    return {
      gagnant: s.gagnant || 'nul', duree: s.t, pvDruide: pct(s.druide), pvAdv: pct(s.adv), manaFin: s.druide.mana / s.druide.manaMax,
      res: s.res, journal: s.journal, evenements: s.evenements, actions: s.actions, coups: s.coups,
      images: s.images, classeAdv: s.adv.classe, nomAdv: s.adv.nom, formePrincipale: s.formePrincipale,
      ouverture: s.ouverture, profil: s.profil, pvMaxAdv: s.adv.pvMax, niveau: s.niveau
    };
  }

  function simulerSerie(config, n) {
    const agg = {
      n, victoires: 0, defaites: 0, nuls: 0, duree: 0, dureeVictoire: 0, pvRestants: 0, degats: 0, subis: 0, soins: 0,
      interrompus: 0, manaDraine: 0, parSort: {}, parSource: {}, plans: {}, changementsForme: 0
    };
    const graine = config.graine || 1;
    const resumes = [];
    for (let i = 0; i < n; i++) {
      const g = graine * 7919 + i * 104729 + 1;
      const r = simuler(Object.assign({}, config, { graine: g }));
      resumes.push({ graine: g, gagnant: r.gagnant, duree: r.duree, pvDruide: r.pvDruide, pvAdv: r.pvAdv, plan: planPrincipal(r.res) });
      if (r.gagnant === 'druide') { agg.victoires++; agg.dureeVictoire += r.duree; agg.pvRestants += r.pvDruide; }
      else if (r.gagnant === 'adv') agg.defaites++;
      else agg.nuls++;
      agg.duree += r.duree;
      agg.degats += r.res.degatsInfliges;
      agg.subis += r.res.degatsSubis;
      agg.soins += r.res.soins;
      agg.interrompus += r.res.soinsInterrompus;
      agg.manaDraine += r.res.manaDraine;
      agg.changementsForme += r.res.changementsForme;
      for (const k in r.res.parSort) agg.parSort[k] = (agg.parSort[k] || 0) + r.res.parSort[k];
      for (const k in r.res.parSource) agg.parSource[k] = (agg.parSource[k] || 0) + r.res.parSource[k];
      for (const k in r.res.plans) agg.plans[k] = (agg.plans[k] || 0) + r.res.plans[k];
    }
    const moy = x => x / n;
    return {
      n, tauxVictoire: agg.victoires / n, tauxDefaite: agg.defaites / n, tauxNul: agg.nuls / n,
      dureeMoyenne: moy(agg.duree), dureeVictoire: agg.victoires ? agg.dureeVictoire / agg.victoires : 0,
      pvRestants: agg.victoires ? agg.pvRestants / agg.victoires : 0,
      degats: moy(agg.degats), subis: moy(agg.subis), soins: moy(agg.soins), interrompus: moy(agg.interrompus),
      manaDraine: moy(agg.manaDraine), changementsForme: moy(agg.changementsForme),
      parSort: mapMoy(agg.parSort, n), parSource: mapMoy(agg.parSource, n), plans: mapMoy(agg.plans, n),
      resolu: resoudreConfig(config), resumes
    };
  }
  function mapMoy(m, n) { const o = {}; for (const k in m) o[k] = m[k] / n; return o; }

  // Plan de soin le plus lancé pendant un duel (null s'il ne s'est pas soigné)
  function planPrincipal(res) {
    let meilleur = null;
    for (const k in res.plans) if (!meilleur || res.plans[k] > res.plans[meilleur]) meilleur = k;
    return meilleur;
  }
  // Regroupe des duels en scénarios (issue + plan de soin principal), du plus fréquent au plus rare.
  // Le représentant est le duel dont la durée, puis les PV restants, sont les plus proches de la médiane du groupe.
  function scenarios(resumes) {
    const groupes = new Map();
    for (const r of resumes) {
      const cle = r.gagnant + '|' + (r.plan || '');
      if (!groupes.has(cle)) groupes.set(cle, { cle, gagnant: r.gagnant, plan: r.plan, duels: [] });
      groupes.get(cle).duels.push(r);
    }
    const mediane = v => { const t = v.slice().sort((a, b) => a - b); return t[Math.floor((t.length - 1) / 2)]; };
    return [...groupes.values()].map(g => {
      const md = mediane(g.duels.map(r => r.duree));
      const mp = mediane(g.duels.map(r => r.pvDruide - r.pvAdv));
      const ecart = r => Math.abs(r.duree - md) / 10 + Math.abs(r.pvDruide - r.pvAdv - mp);
      const representant = g.duels.reduce((a, b) => (ecart(b) < ecart(a) ? b : a));
      return { cle: g.cle, gagnant: g.gagnant, plan: g.plan, n: g.duels.length, part: g.duels.length / resumes.length, dureeMediane: md, representant };
    }).sort((a, b) => b.n - a.n || (a.cle < b.cle ? -1 : 1));
  }

  const Moteur = {
    simuler, simulerSerie, scenarios, planPrincipal, calculerDruide, verifierTalents, reductionArmure, resoudreConfig, specAdversaire,
    libelleOuverture, nomForme, constantesNiveau, niveauDe, NIVEAU_MIN, TALENTS
  };
  racine.Moteur = Moteur;
  if (typeof module !== 'undefined' && module.exports) module.exports = Moteur;
})(typeof window !== 'undefined' ? window : globalThis);
