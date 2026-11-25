/*
 * Interface du simulateur : réglages, comparaison ours / félin, cinématique du
 * duel le plus fréquent, druides de l'armurerie, guide par adversaire et
 * calculateur de talents. Aucune dépendance.
 */
(function () {
  'use strict';
  const D = window.DONNEES, M = window.Moteur, G = window.GUIDE, I = window.ICONES, C = window.Conseiller;
  // Druides importés de l'armurerie par outils/armurerie.js (js/personnages.js)
  const P = window.PERSONNAGES || { personnages: [] };
  const PERSOS = P.personnages || [];
  const $ = id => document.getElementById(id);
  const el = (tag, attrs, ...enfants) => {
    const n = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    for (const e of enfants) if (e != null) n.append(e);
    return n;
  };
  const fmt = n => Math.round(n).toLocaleString('fr-FR');
  const pc = x => Math.round(x * 100) + ' %';
  const virgule = (x, d) => (+x).toFixed(d === undefined ? 1 : d).replace('.', ',');
  const NOMS_FORME = { ours: 'Ours', felin: 'Félin', humanoide: 'Humanoïde' };
  const STATS = [
    ['force', 'Force'], ['agilite', 'Agilité'], ['pa', 'Puissance d\'attaque'], ['endurance', 'Endurance'],
    ['intelligence', 'Intelligence'], ['esprit', 'Esprit'], ['armure', 'Armure'], ['soins', 'Bonus aux soins'],
    ['crit', 'Critique (%)'], ['toucher', 'Toucher (%)'], ['dpsArme', 'DPS de l\'arme']
  ];

  // --------------------------------------------------------------- état
  const memo = {
    lire(k, def) { try { const v = localStorage.getItem('druidhow.' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    ecrire(k, v) { try { localStorage.setItem('druidhow.' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };
  const etat = {
    adversaire: memo.lire('adversaire', 'mage'),
    forme: 'auto',
    presetTalents: memo.lire('presetTalents', D.PRESETS_TALENTS[0].id),
    talents: memo.lire('talents', null) || Object.assign({}, D.PRESETS_TALENTS[0].points),
    equipement: memo.lire('equipement', 'pvp'),
    // Les anciennes sauvegardes n'ont pas le DPS de l'arme : on complète avec l'équipement JcJ.
    stats: Object.assign({}, D.PRESETS_EQUIPEMENT.find(p => p.id === 'pvp').stats, memo.lire('stats', null) || {}),
    nombre: memo.lire('nombre', 200) === 100 ? 100 : 200,
    tirage: 1,
    onglet: 'simulateur',
    talentSel: null,
    guideAdv: null,
    // Clé du druide de l'armurerie chargé dans le simulateur, et réglages à retrouver en le quittant
    perso: memo.lire('perso', null),
    avantPerso: memo.lire('avantPerso', null),
    // ?perso=eu/ohm-let ouvre ce druide dans l'onglet Armurerie
    persoVu: (() => { try { const c = new URLSearchParams(location.search).get('perso'); return PERSOS.some(p => p.cle === c) ? c : null; } catch (e) { return null; } })()
  };
  if (!D.ADVERSAIRES[etat.adversaire]) etat.adversaire = 'mage';
  if (etat.perso && !PERSOS.some(p => p.cle === etat.perso)) etat.perso = null;
  function persoActif() { return etat.perso ? PERSOS.find(p => p.cle === etat.perso) || null : null; }
  // Niveau simulé : celui du druide chargé, sinon 60. Un point de talent par niveau à partir du 10.
  function niveauActif() { const p = persoActif(); return p ? M.niveauDe(p.niveau) : 60; }
  function plafondTalents() { return niveauActif() - 9; }
  function optionsNiveau() { const p = persoActif(); return p ? { niveau: p.niveau, base: p.base } : null; }
  // Spécialisation choisie pour chaque classe adverse ({ classe: id }), la première par défaut
  etat.specs = memo.lire('specs', null) || {};
  function specDe(classe) { return M.specAdversaire(classe, etat.specs[classe]); }
  function nomSpecCourt(sp) { return sp.nom.split(' (')[0]; }
  function conseilFormeDe(classe) { return specDe(classe).conseilForme || D.ADVERSAIRES[classe].conseilForme; }
  if (!M.verifierTalents(etat.talents, plafondTalents()).ok) etat.talents = Object.assign({}, D.PRESETS_TALENTS[0].points);

  function config(extra) {
    const c = Object.assign({
      stats: etat.stats, talents: etat.talents, adversaire: etat.adversaire, forme: etat.forme,
      ouverture: $('ouverture').value, methodeSoin: $('methodeSoin').value, seuilSoin: +$('seuilSoin').value,
      powershift: $('powershift').checked, distance: +$('distance').value, equipAdv: $('equipAdv').value, graine: etat.tirage
    }, optionsNiveau() || {}, extra || {});
    if (!c.specAdv) c.specAdv = specDe(c.adversaire).id;
    return c;
  }

  // ----------------------------------------------------------- onglets
  const ONGLETS = ['simulateur', 'armurerie', 'guide', 'talents', 'mecaniques'];
  function ouvrirOnglet(id, depuisHash) {
    if (!ONGLETS.includes(id)) id = 'simulateur';
    etat.onglet = id;
    for (const o of ONGLETS) {
      $('t-' + o).setAttribute('aria-selected', String(o === id));
      $('v-' + o).hidden = o !== id;
    }
    if (!depuisHash) { try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignore */ } }
    if (id === 'guide') { rendreGuide(); lancerMatrice(); }
    if (id === 'armurerie') { rendreArmurerie(); lancerMatricePerso(); }
    if (id === 'talents') rendreTalents();
    const b = $('t-' + id), nav = b.parentNode;
    if (nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: b.offsetLeft - nav.offsetLeft - (nav.clientWidth - b.offsetWidth) / 2, behavior: mouvementReduit ? 'auto' : 'smooth' });
  }
  ONGLETS.forEach(o => $('t-' + o).addEventListener('click', () => ouvrirOnglet(o)));
  // Flèches gauche / droite entre onglets, comme un tablist
  $('t-simulateur').parentNode.addEventListener('keydown', e => {
    const i = ONGLETS.indexOf(etat.onglet), d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const o = ONGLETS[(i + d + ONGLETS.length) % ONGLETS.length];
    ouvrirOnglet(o); $('t-' + o).focus();
  });
  // Sur téléphone, la bande défile : un fondu signale ce qui dépasse de chaque côté
  function fondusOnglets() {
    const nav = $('t-simulateur').parentNode;
    const plus = [];
    if (nav.scrollLeft > 4) plus.push('gauche');
    if (nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4) plus.push('droite');
    nav.dataset.plus = plus.join(' ');
  }
  $('t-simulateur').parentNode.addEventListener('scroll', fondusOnglets, { passive: true });
  window.addEventListener('resize', fondusOnglets);
  // Une ligne d'état sous chaque titre d'onglet
  function majIndices() {
    const a = D.ADVERSAIRES[etat.adversaire];
    $('i-simulateur').textContent = `Contre ${a.nom.toLowerCase()} ${nomSpecCourt(specDe(etat.adversaire))}`;
    const p = persoVu();
    $('i-armurerie').textContent = p ? `${p.nom} · niveau ${p.niveau}` : 'Aucun druide importé';
    const v = M.verifierTalents(etat.talents, plafondTalents());
    $('i-talents').textContent = `${v.total} / ${plafondTalents()} points · ${v.parArbre.equilibre}/${v.parArbre.farouche}/${v.parArbre.restauration}`;
    fondusOnglets();
  }
  window.addEventListener('hashchange', () => ouvrirOnglet(location.hash.slice(1), true));

  // ------------------------------------------------------------ profil
  function rendreProfil() {
    const p = M.calculerDruide(etat.stats, etat.talents, optionsNiveau());
    const v = M.verifierTalents(etat.talents, plafondTalents());
    const perso = persoActif();
    const items = [
      ...(perso ? [['Personnage', `${perso.nom} · niv. ${niveauActif()}`]] : []),
      ['PV ours / félin', `${fmt(p.pv.ours)} / ${fmt(p.pv.felin)}`],
      ['Armure ours', fmt(p.armure.ours)],
      ['PA félin', fmt(p.pa.felin)],
      ['Critique', p.crit.toFixed(1).replace('.', ',') + ' %'],
      ['Esquive ours / félin', `${p.esquive.ours.toFixed(1).replace('.', ',')} / ${p.esquive.felin.toFixed(1).replace('.', ',')} %`],
      ['Mana', fmt(p.manaMax)],
      ['Coût de forme', fmt(p.coutForme)],
      ['Talents', `${v.parArbre.equilibre}/${v.parArbre.farouche}/${v.parArbre.restauration}`]
    ];
    $('profil').replaceChildren(...items.map(([k, val]) => el('div', null, el('span', { class: 'etiquette', text: k }), el('b', { text: val }))));
    majIndices();
  }

  // ---------------------------------------------------------- réglages
  function remplirSelects() {
    const optsTalents = () => [
      ...D.PRESETS_TALENTS.map(p => el('option', { value: p.id, text: p.nom })),
      el('option', { value: 'perso', text: 'Personnalisés (onglet Talents)' })
    ];
    $('talents-preset').replaceChildren(...optsTalents());
    $('talents-preset-2').replaceChildren(...optsTalents());
    $('equipement').replaceChildren(...D.PRESETS_EQUIPEMENT.map(p => el('option', { value: p.id, text: p.nom })), el('option', { value: 'perso', text: 'Personnalisé' }));
    syncPresets();
  }
  function syncPresets() {
    const correspond = D.PRESETS_TALENTS.find(p => memesPoints(p.points, etat.talents));
    const v = correspond ? correspond.id : 'perso';
    $('talents-preset').value = v; $('talents-preset-2').value = v;
    const eq = D.PRESETS_EQUIPEMENT.find(p => STATS.every(([k]) => (p.stats[k] || 0) === (etat.stats[k] || 0)));
    $('equipement').value = eq ? eq.id : 'perso';
  }
  function memesPoints(a, b) {
    const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of ks) if ((a[k] || 0) !== (b[k] || 0)) return false;
    return true;
  }
  function choisirPresetTalents(id) {
    const p = D.PRESETS_TALENTS.find(x => x.id === id);
    if (!p) return;
    // Les préréglages sont faits pour le niveau 60 : ils déchargent le druide de l'armurerie.
    quitterPerso();
    etat.talents = Object.assign({}, p.points);
    memo.ecrire('talents', etat.talents);
    changementProfil();
  }
  $('talents-preset').addEventListener('change', e => choisirPresetTalents(e.target.value));
  $('talents-preset-2').addEventListener('change', e => { choisirPresetTalents(e.target.value); rendreTalents(); });
  $('equipement').addEventListener('change', e => {
    const p = D.PRESETS_EQUIPEMENT.find(x => x.id === e.target.value);
    if (!p) return;
    quitterPerso();
    etat.stats = Object.assign({}, p.stats);
    memo.ecrire('stats', etat.stats);
    rendreStats();
    changementProfil();
  });
  function rendreStats() {
    $('stats').replaceChildren(...STATS.map(([k, nom]) => {
      const inp = el('input', { type: 'number', id: 'stat-' + k, min: '0', step: '1', value: String(etat.stats[k] || 0) });
      inp.addEventListener('change', () => {
        etat.stats = Object.assign({}, etat.stats, { [k]: Math.max(0, +inp.value || 0) });
        memo.ecrire('stats', etat.stats);
        changementProfil();
      });
      return el('div', { class: 'champ' }, el('label', { for: 'stat-' + k, text: nom }), inp);
    }));
  }
  function changementProfil() {
    syncPresets();
    rendreProfil();
    rendrePersoCharge();
    matriceObsolete = true;
    planifierSimulation();
  }

  function rendreAdversaires() {
    $('choix-adv').replaceChildren(...Object.entries(D.ADVERSAIRES).map(([id, a]) => {
      const b = el('button', { type: 'button', class: 'adv', 'aria-pressed': String(id === etat.adversaire) },
        el('b', { text: a.nom }), el('small', { text: `${a.categorie} · ${nomSpecCourt(specDe(id))}` }));
      b.addEventListener('click', () => { etat.adversaire = id; memo.ecrire('adversaire', id); rendreAdversaires(); planifierSimulation(); });
      return b;
    }));
    rendreSpecs();
    majIndices();
  }
  function choisirSpec(classe, specId) {
    etat.specs[classe] = specId;
    memo.ecrire('specs', etat.specs);
    matriceObsolete = true;
  }
  function rendreSpecs() {
    const specs = D.ADVERSAIRES[etat.adversaire].specs;
    const sp = specDe(etat.adversaire);
    $('choix-spec').replaceChildren(...specs.map(x => {
      const b = el('button', { type: 'button', 'aria-pressed': String(x.id === sp.id), text: nomSpecCourt(x) });
      b.addEventListener('click', () => { choisirSpec(etat.adversaire, x.id); rendreAdversaires(); planifierSimulation(); });
      return b;
    }));
    $('spec-meta').textContent = sp.meta;
  }
  $('choix-forme').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    etat.forme = b.dataset.v;
    for (const x of $('choix-forme').children) x.setAttribute('aria-pressed', String(x === b));
    if (dernierComparatif) rendreComparatif(dernierComparatif);
  });
  for (const x of $('choix-nombre').children) x.setAttribute('aria-pressed', String(+x.dataset.v === etat.nombre));
  $('choix-nombre').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    etat.nombre = +b.dataset.v;
    memo.ecrire('nombre', etat.nombre);
    for (const x of $('choix-nombre').children) x.setAttribute('aria-pressed', String(x === b));
    planifierSimulation();
  });
  $('avances').open = memo.lire('avances', false) === true;
  $('avances').addEventListener('toggle', () => memo.ecrire('avances', $('avances').open));
  $('seuilSoin').addEventListener('input', () => { $('seuilSoin-val').textContent = $('seuilSoin').value + ' %'; });
  for (const id of ['ouverture', 'methodeSoin', 'seuilSoin', 'powershift', 'distance', 'equipAdv']) {
    $(id).addEventListener('change', () => { matriceObsolete = true; planifierSimulation(); });
  }
  // Même réglages, autre tirage aléatoire : vérifie qu'un écart entre les formes tient.
  $('reglages').addEventListener('submit', e => { e.preventDefault(); etat.tirage++; lancerComparaison(); });

  // -------------------------------------------------- séries découpées
  // Lance n duels par petits paquets pour garder la page réactive.
  let jeton = 0;
  function serieDecoupee(cfg, n, surFin, jt) {
    const paquet = 20;
    const parts = [];
    let fait = 0;
    function suite() {
      if (jt !== jeton) return;
      const k = Math.min(paquet, n - fait);
      parts.push({ k, r: M.simulerSerie(Object.assign({}, cfg, { graine: cfg.graine * 31 + fait + 1 }), k) });
      fait += k;
      if (fait < n) setTimeout(suite, 0);
      else surFin(fusionner(parts, n));
    }
    setTimeout(suite, 0);
  }
  function fusionner(parts, n) {
    const r = { n, parSort: {}, parSource: {}, plans: {} };
    const champs = ['tauxVictoire', 'tauxDefaite', 'tauxNul', 'dureeMoyenne', 'degats', 'subis', 'soins', 'interrompus', 'manaDraine', 'changementsForme'];
    for (const c of champs) r[c] = parts.reduce((s, p) => s + p.r[c] * p.k, 0) / n;
    const vict = parts.reduce((s, p) => s + p.r.tauxVictoire * p.k, 0);
    r.dureeVictoire = vict ? parts.reduce((s, p) => s + p.r.dureeVictoire * p.r.tauxVictoire * p.k, 0) / vict : 0;
    r.pvRestants = vict ? parts.reduce((s, p) => s + p.r.pvRestants * p.r.tauxVictoire * p.k, 0) / vict : 0;
    for (const m of ['parSort', 'parSource', 'plans']) {
      for (const p of parts) for (const k in p.r[m]) r[m][k] = (r[m][k] || 0) + p.r[m][k] * p.k / n;
    }
    r.resolu = parts[0].r.resolu;
    r.resumes = parts.flatMap(p => p.r.resumes);
    return r;
  }

  // ------------------------------------------------- comparaison formes
  let minuterie = null;
  function planifierSimulation() {
    clearTimeout(minuterie);
    minuterie = setTimeout(lancerComparaison, 250);
  }
  let dernierComparatif = null;
  function lancerComparaison() {
    const jt = ++jeton;
    const n = etat.nombre;
    $('lancer').disabled = true;
    $('verdict').replaceChildren(el('p', { class: 'attente', text: `Simulation de ${n * 2} duels contre ${D.ADVERSAIRES[etat.adversaire].nom.toLowerCase()}…` }));
    $('cine').classList.add('perime');
    // Les réglages sont figés au lancement : la cinématique rejoue un duel avec exactement les mêmes.
    const cfg = { ours: config({ forme: 'ours' }), felin: config({ forme: 'felin' }) };
    const res = {};
    serieDecoupee(cfg.ours, n, r => {
      res.ours = r;
      serieDecoupee(cfg.felin, n, r2 => {
        res.felin = r2;
        if (jt !== jeton) return;
        $('lancer').disabled = false;
        dernierComparatif = { id: jt, res, cfg, adversaire: etat.adversaire, spec: specDe(etat.adversaire).id, n, nomDruide: (persoActif() || { nom: 'Druide' }).nom };
        rendreComparatif(dernierComparatif);
      }, jt);
    }, jt);
  }

  function meilleureForme(res) {
    const sc = f => res[f].tauxVictoire - 0.5 * res[f].tauxDefaite;
    return sc('ours') >= sc('felin') ? 'ours' : 'felin';
  }
  function classeTaux(t) { return t >= 0.6 ? 'bon' : t >= 0.35 ? 'moyen' : 'mauvais'; }
  function texteTaux(t) { return t >= 0.75 ? 'Duel favorable' : t >= 0.55 ? 'Avantage druide' : t >= 0.35 ? 'Duel serré' : t >= 0.15 ? 'Duel difficile' : 'Très défavorable'; }

  function rendreComparatif(c) {
    const { res, adversaire, n } = c;
    const adv = D.ADVERSAIRES[adversaire];
    const best = meilleureForme(res);
    const conseil = conseilFormeDe(adversaire);
    const choisie = etat.forme === 'auto' ? best : etat.forme;
    const t = res[best].tauxVictoire;
    const accord = best === conseil ? 'C\'est aussi la forme conseillée par le guide.' : `Le guide conseille plutôt la forme de ${conseil === 'ours' ? 'l\'ours' : 'félin'} ; avec vos réglages, la simulation dit l'inverse.`;
    $('verdict').replaceChildren(
      el('span', { class: 'etiquette', text: `Contre ${adv.nom.toLowerCase()} ${nomSpecCourt(M.specAdversaire(adversaire, c.spec))}${c.cfg.ours.niveau ? ` · niveau ${M.niveauDe(c.cfg.ours.niveau)} (estimé)` : ''} · ${n} duels par forme` }),
      el('div', { class: 'ligne1' },
        el('h2', { text: `Jouez ${best === 'ours' ? 'ours' : 'félin'}` }),
        el('span', { class: 'pastille ' + classeTaux(t), text: `${texteTaux(t)} · ${pc(t)}` })),
      el('p', { class: 'prose', text: `${accord} Ouverture : ${M.libelleOuverture(M.resoudreConfig(c.cfg[best]).ouverture)}.` })
    );
    $('formes').replaceChildren(...['ours', 'felin'].map(f => {
      const r = res[f];
      const barre = el('div', { class: 'barre', role: 'img', 'aria-label': `${pc(r.tauxVictoire)} de victoires, ${pc(r.tauxNul)} de nuls, ${pc(r.tauxDefaite)} de défaites` });
      for (const [cl, v] of [['v', r.tauxVictoire], ['n', r.tauxNul], ['d', r.tauxDefaite]]) if (v > 0) barre.append(el('span', { class: cl, style: `flex:${v}` }));
      const sous = r.tauxVictoire ? `victoire en ${Math.round(r.dureeVictoire)} s` : `${pc(r.tauxNul)} de nuls`;
      return el('div', { class: 'forme-ligne' + (f === best ? ' conseil' : '') },
        el('div', { class: 'nom' }, NOMS_FORME[f], el('small', { text: sous })),
        barre,
        el('div', { class: 'taux', text: pc(r.tauxVictoire) }));
    }));
    rendreMoyennes(res[choisie], choisie);
    $('cine').classList.remove('perime');
    rendreCinematique(c, choisie);
  }

  function rendreMoyennes(r, forme) {
    $('moyennes-forme').textContent = `en ${NOMS_FORME[forme].toLowerCase()}`;
    const items = [
      ['Durée', Math.round(r.dureeMoyenne) + ' s'],
      ['Dégâts infligés', fmt(r.degats)],
      ['Dégâts reçus', fmt(r.subis)],
      ['Soins reçus', fmt(r.soins)],
      ['Changements de forme', r.changementsForme.toFixed(1).replace('.', ',')],
      ['PV restants (victoire)', r.pvRestants ? pc(r.pvRestants) : '–']
    ];
    if (r.manaDraine > 1) items.push(['Mana drainé', fmt(r.manaDraine)]);
    if (r.interrompus > 0.05) items.push(['Soins interrompus', r.interrompus.toFixed(1).replace('.', ',')]);
    $('chiffres').replaceChildren(...items.map(([k, v]) => el('div', null, el('span', { class: 'etiquette', text: k }), el('b', { text: v }))));
    $('par-sort').replaceChildren(...repartition(r.parSort, ''));
    $('par-source').replaceChildren(...repartition(r.parSource, ' adv-src'));
  }
  function repartition(m, cl) {
    const e = Object.entries(m).sort((a, b) => b[1] - a[1]);
    const total = e.reduce((s, x) => s + x[1], 0) || 1;
    const top = e.slice(0, 6);
    const reste = e.slice(6).reduce((s, x) => s + x[1], 0);
    if (reste > 0) top.push(['Autres', reste]);
    if (!top.length) return [el('p', { class: 'discret', text: 'Rien.' })];
    const max = top[0][1] || 1;
    return top.map(([k, v]) => el('div', { class: 'rep' + cl },
      el('span', { text: k }), el('span', { class: 'v', text: `${fmt(v)} · ${Math.round(100 * v / total)} %` }),
      el('div', { class: 'trait' }, el('span', { style: `width:${(100 * v / max).toFixed(1)}%` }))));
  }

  // ---------------------------------------------------------- cinématique
  // Les duels d'une série sont regroupés par issue (gagnant + plan de soin principal).
  // On rejoue le duel le plus typique du groupe choisi à partir des images que le
  // moteur enregistre toutes les 0,1 s, avec les sorts et les coups de chaque camp.
  const ETATS_CC = {
    etourdi: 'étourdi', peur: 'apeuré', mouton: 'métamorphosé', gel: 'gelé', desoriente: 'désorienté',
    horreur: 'horrifié', bloc: 'Bloc de glace', enracine: 'enraciné'
  };
  const FORME_DU_SORT = { [D.SORTS.formeOurs.nom]: 'ours', [D.SORTS.formeFelin.nom]: 'felin' };
  const VIE_FLOTTANT = 1.4;   // s de duel pendant lesquelles un chiffre reste affiché
  const VIE_LEGENDE = 2.5;
  const mouvementReduit = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  const vitesseLue = memo.lire('vitesse', 2);
  const cine = {
    cle: null, choix: 0, charge: null, duel: null, t: 0, T: 0, lecture: false, raf: 0, dernier: 0,
    vitesse: [1, 2, 4, 8].includes(vitesseLue) ? vitesseLue : 2, visible: false, enAttente: false, reprendre: false,
    largeur: 0, flottants: new Map(), decompte: {}, tetes: {}
  };
  const fmtT = t => t.toFixed(1).replace('.', ',');
  const maj1 = t => t[0].toUpperCase() + t.slice(1);
  // Icône de sort : décorative (le nom est écrit à côté), d'où alt vide
  const ico = (src, taille) => src
    ? el('img', { class: 'ico', src, alt: '', width: taille, height: taille, decoding: 'async' })
    : el('span', { class: 'ico vide', style: `width:${taille}px;height:${taille}px` });
  const iconeAction = a => a.icone || I.sort(a.nom);
  // Silhouettes du druide, de profil et tournées vers la droite, posées sur le sol (bas du dessin)
  const SILHOUETTES = {
    humanoide: { titre: 'Elfe de la nuit', l: 38, h: 53, svg: `<svg viewBox="0 0 40 56" aria-hidden="true">
      <path class="trait" style="stroke-opacity:.75;stroke-width:1.8" d="M31.8 55.6 L31.8 8.6 C30 7.2 30.4 3.6 33.2 3.2 C36 3 36.8 6.2 35 7.4 C34 8 33 7.2 33.4 6.2"/>
      <path class="corps" d="M22 3.6 C24.2 3.6 25.8 4.8 26.2 6.8 L26.4 8.2 L27.8 10.2 L26.6 10.8 L26.6 12 C26.4 13.2 25.4 13.8 24.2 13.8 L23.4 16.4 C25.6 16.8 27 18 27.6 20 L28.4 24.2 L31.4 23.8 C32.6 23.8 33 24.6 33 25.4 L33 26.6 C33 27.4 32.4 27.6 31.6 27.6 L28 27.8 L26.4 27.6 L26 30.4 C26.8 38 28.4 46 31 54 L31.2 55.6 L10.2 55.6 L10.4 54 C12.4 46 13.4 38 14.2 30 C14 26 14.4 21.4 15.6 18 C15 15.6 15 12.6 16 10.4 L7.6 3.2 L17.6 7.6 C18.6 5 20 3.6 22 3.6 Z"/>
      <circle class="oeil" cx="24.2" cy="8.6" r=".9"/>
      <path class="trait" d="M14.4 30.2 C18 31.2 22.6 31.2 26 30.4 M27.6 20 C26 22 25.8 25 26.4 27.6 M17.6 7.6 C16.6 11 16.4 15 17 18.4 M20 31 L18.6 55"/></svg>` },
    felin: { titre: 'Maine coon', l: 64, h: 39, svg: `<svg viewBox="0 0 72 44" aria-hidden="true">
      <path class="loin" d="M50.2 32 L48.4 43.6 L53.6 43.6 L54.4 33 Z M26.6 32 L30.6 43.6 L35.6 43.6 L31.8 32.4 Z"/>
      <path class="corps" d="M17 20 C24 18.2 36 18 46 18.4 C50 18.6 53 17.4 55 15.4 C55 13.5 55.2 11.6 55.8 10 L57.4 3.2 L59.6 7 L62.2 2.2 L64.2 7.6 C65.6 8.4 66.6 10 67 11.8 L68.8 13.6 C69.2 14.4 68.8 15.2 68 15.4 L66.4 16.4 C65.8 17.6 64.6 18.2 63.4 18.4 L62.6 20.2 L61 19.8 L60.6 22 L59 21.8 L58.8 24.2 L57.2 24.2 L57 26.4 L55.6 26.8 L56.4 41.6 C56.6 42.8 57.8 43 58.8 43.2 C59.4 43.4 59.2 43.8 58.6 43.8 L51.6 43.8 L51 33.2 L48.5 33.6 L47 32.6 L45 33.6 L43 32.6 L41 33.4 L39 32.6 L37 33.4 L35 32.6 L33 33.2 L30.5 32.4 C29.4 35 29 37.6 29.6 40 L30.8 42.6 C31.2 43.4 30.6 43.8 29.8 43.8 L24.4 43.8 C23.4 41.4 22.2 39 20.6 37.2 C17.6 35.4 15.4 32.6 14.6 29 C9 28 4 23 2.6 16 C1.6 10.6 3 5.4 6.6 2.6 C8 1.6 9.6 2.8 8.8 4.4 C7.4 7.6 7.4 11.6 9 15 C10.6 18 13.4 20 17 20 Z"/>
      <circle class="oeil" cx="64.4" cy="11.8" r="1"/>
      <path class="trait" d="M57.4 3.2 L57 0.4 M62.2 2.2 L62.6 0.4 M34 19 L33.2 23.6 M39 18.8 L38.4 23 M44 19.2 L43.6 22.6 M28.4 19.6 L27.6 24 M60.2 19.2 C59 21 58.4 23 58.4 25 M4.6 12 L7.6 12.8 M4.2 7.6 L7 8.6"/>
      <path class="trait" style="stroke-opacity:.25;stroke-width:.6" d="M67 15.8 L71.6 14.8 M67 16.4 L71.4 17.4"/></svg>` },
    ours: { titre: 'Ours', l: 66, h: 40, svg: `<svg viewBox="0 0 72 44" aria-hidden="true">
      <path class="loin" d="M46.4 32 L44.6 43.6 L50.8 43.6 L51.6 33 Z M23.6 32 L27.2 43.6 L33 43.6 L29.4 33 Z"/>
      <path class="corps" d="M7 23 C5 15 11 10.5 19 10 C27 9.5 33 5.5 41 5.5 C46.5 5.5 50 8 52.5 11 C53.5 8.8 55.5 7.6 57.5 8.6 C58.6 9.3 58.6 10.6 58.2 11.6 C60.5 12.5 62.5 14 64 15.6 L69.2 17.4 C71 18 71.2 20.6 69.6 21.6 L64.6 24.2 C62 25.4 59.5 26.2 57.6 28.2 L58.8 41.4 C59 43 57.8 43.6 56.2 43.6 L49.6 43.6 L48.4 35 C40 36.6 31 36.6 25 35.2 L24.6 43.6 L17.4 43.6 C15.6 43.6 15 42.4 14.8 41 C12 37.4 8.6 31.6 7 23 Z"/>
      <circle class="oeil" cx="62.4" cy="17.2" r="1.15"/>
      <path class="trait" d="M57.6 28.2 C55.5 26 54.5 22 55.5 18.5 M25 35.2 C22 31 22.5 25 25 21.5 M64.4 16 C65.6 18 65.6 21 64.6 24"/>
      <circle class="truffe" cx="70" cy="19.4" r="1.2"/></svg>` }
  };
  function ecrireTexte(n, v) { if (n._t !== v) { n._t = v; n.textContent = v; } }
  function ecrireStyle(n, k, v) { const c = '_s' + k; if (n[c] !== v) { n[c] = v; n.style[k] = v; } }
  // Nombre d'éléments (triés par t) arrivés au temps t
  function nbJusqua(liste, t) {
    let a = 0, b = liste.length;
    while (a < b) { const m = (a + b) >> 1; if (liste[m].t <= t + 1e-6) a = m + 1; else b = m; }
    return a;
  }
  function indice(im, t) {
    let i = Math.max(0, Math.min(im.length - 1, Math.round(t * 10)));
    while (i > 0 && im[i].t > t + 1e-6) i--;
    while (i < im.length - 1 && im[i + 1].t <= t + 1e-6) i++;
    return i;
  }

  function libelleIssue(gagnant, nomAdv) {
    return gagnant === 'druide' ? 'Victoire du druide' : gagnant === 'adv' ? `Victoire du ${nomAdv.toLowerCase()}` : 'Nul au bout de 180 s';
  }
  function libellePlan(plan) { return plan ? `plan « ${maj1(plan)} »` : 'sans plan de soin'; }
  function issueDuel(r, nomAdv) {
    const adv = nomAdv.toLowerCase();
    if (r.gagnant === 'druide') return `le druide gagne en ${Math.round(r.duree)} s avec ${pc(r.pvDruide)} de ses PV`;
    if (r.gagnant === 'adv') return `le druide tombe en ${Math.round(r.duree)} s, le ${adv} garde ${pc(r.pvAdv)} de ses PV`;
    return `personne ne tombe en 180 s (druide à ${pc(r.pvDruide)}, ${adv} à ${pc(r.pvAdv)})`;
  }

  function rendreCinematique(c, forme) {
    const r = c.res[forme];
    const adv = D.ADVERSAIRES[c.adversaire];
    const liste = M.scenarios(r.resumes);
    const cle = c.id + '|' + forme;
    if (cine.cle !== cle) { cine.cle = cle; cine.choix = 0; }
    const montres = liste.slice(0, 4);
    if (cine.choix >= montres.length) cine.choix = 0;
    const sc = montres[cine.choix];
    $('cine-forme').textContent = `en ${NOMS_FORME[forme].toLowerCase()}`;
    $('scenarios').replaceChildren(...montres.map((x, i) => {
      const b = el('button', { type: 'button', class: 'scenario ' + x.gagnant, 'aria-pressed': String(i === cine.choix) },
        el('b', null, el('i'), libelleIssue(x.gagnant, adv.nom)),
        el('small', { text: libellePlan(x.plan) }),
        el('span', { class: 'num', text: `${x.n} duels sur ${r.n} · ${pc(x.part)}` }));
      b.addEventListener('click', () => { cine.choix = i; rendreCinematique(c, forme); });
      return b;
    }));
    const autres = liste.slice(4);
    const nAutres = autres.reduce((s, x) => s + x.n, 0);
    $('cine-intro').textContent = `${cine.choix === 0 ? 'Issue la plus fréquente' : 'Issue moins fréquente'} sur ${r.n} duels : `
      + `${libelleIssue(sc.gagnant, adv.nom).toLowerCase()}, ${libellePlan(sc.plan)} (${pc(sc.part)}). `
      + `Duel rejoué, le plus typique du groupe : ${issueDuel(sc.representant, adv.nom)}.`
      + (autres.length ? ` ${nAutres} autre${nAutres > 1 ? 's' : ''} duel${nAutres > 1 ? 's' : ''} se répartissent en ${autres.length} issue${autres.length > 1 ? 's' : ''} rare${autres.length > 1 ? 's' : ''}.` : '');
    const charge = cle + '|' + cine.choix;
    if (cine.charge === charge) return;
    cine.charge = charge;
    const d = M.simuler(Object.assign({}, c.cfg[forme], { graine: sc.representant.graine }), { journal: true });
    chargerDuel(d, adv, M.specAdversaire(c.adversaire, c.spec), c.nomDruide);
  }

  // Le moteur note « Quitter la forme » puis la nouvelle forme au même instant : on n'en garde
  // qu'une action, « Transformation rapide » si le druide reprend la forme qu'il quittait.
  function actionsDruide(d) {
    const acts = d.actions.filter(a => a.camp === 'druide');
    const sortie = [];
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i], b = acts[i + 1];
      if (a.nom === D.SORTS.annulerForme.nom && b && b.t === a.t && FORME_DU_SORT[b.nom]) {
        const avant = d.images[Math.max(0, indice(d.images, a.t) - 1)].forme;
        sortie.push(Object.assign({}, b, { nom: avant === FORME_DU_SORT[b.nom] ? 'Transformation rapide' : b.nom, icone: I.forme(FORME_DU_SORT[b.nom]) }));
        i++;
      } else sortie.push(a);
    }
    return sortie;
  }

  // Caméra : centrée sur les deux combattants, lissée, sans jamais en laisser sortir un.
  function camera(im) {
    const largeurVisee = p => Math.min(90, Math.max(28, Math.abs(p.xA - p.xD) * 1.6 + 12));
    const c = new Float64Array(im.length), w = new Float64Array(im.length);
    let cc = (im[0].xD + im[0].xA) / 2, ww = largeurVisee(im[0]);
    for (let i = 0; i < im.length; i++) {
      const p = im[i];
      cc += ((p.xD + p.xA) / 2 - cc) * 0.06;
      ww += (largeurVisee(p) - ww) * 0.04;
      let lo = cc - ww / 2, hi = cc + ww / 2;
      lo = Math.min(lo, Math.min(p.xD, p.xA) - 3);
      hi = Math.max(hi, Math.max(p.xD, p.xA) + 3);
      cc = (lo + hi) / 2; ww = hi - lo;
      c[i] = cc; w[i] = ww;
    }
    return { c, w };
  }

  function construireCadre(boite, nom, sousNom, icone) {
    const r = {};
    r.ico = ico(icone, 24);
    r.sous = el('span', { class: 'sous-nom', text: sousNom });
    r.cc = el('span', { class: 'cc', hidden: '' });
    r.pv = el('span'); r.pvCur = el('span'); r.pvMax = el('span', { class: 'max' });
    r.res = el('span'); r.resVal = el('span', { class: 'val' });
    r.mana = el('span', { style: 'background:var(--mana)' }); r.manaVal = el('span', { class: 'val' });
    r.rgMana = el('div', { class: 'rangee' }, el('div', { class: 'jauge fine' }, r.mana), r.manaVal);
    r.pips = el('div', { class: 'pips', title: 'Points de combo' }, ...Array.from({ length: 5 }, () => el('i')));
    r.incBarre = el('i'); r.incNom = el('b'); r.incIco = el('img', { class: 'ico', alt: '', width: 18, height: 18 });
    r.incant = el('div', { class: 'incant' }, r.incBarre, r.incIco, r.incNom);
    r.fil = el('div', { class: 'fil' });
    boite.replaceChildren(
      el('div', { class: 'tete' }, r.ico, el('b', { text: nom }), r.sous, r.cc),
      el('div', { class: 'rangee', title: 'Points de vie' }, el('div', { class: 'jauge' }, r.pv), el('span', { class: 'val' }, r.pvCur, r.pvMax)),
      el('div', { class: 'rangee' }, el('div', { class: 'jauge fine' }, r.res), r.resVal),
      r.rgMana, r.pips, r.fil);
    return r;
  }

  function construireArene() {
    if (cine.jD) return;
    cine.reperes = Array.from({ length: 24 }, () => el('span', { class: 'repere' }));
    cine.lien = el('span', { class: 'lien' });
    cine.ecart = el('span', { class: 'ecart' });
    cine.fam = el('span', { class: 'familier', title: 'Familier' });
    cine.jD = el('span', { class: 'druide-fig' });
    cine.figs = {};
    for (const [forme, s] of Object.entries(SILHOUETTES)) {
      const f = el('span', { class: 'silhouette', title: 'Druide en ' + s.titre.toLowerCase(), style: `width:${s.l}px;height:${s.h}px` });
      f.innerHTML = s.svg;
      f.dataset.forme = forme;
      cine.figs[forme] = f;
      cine.jD.append(f);
    }
    cine.jA = el('span', { class: 'jeton' });
    cine.nD = el('span', { class: 'nom-jeton' });
    cine.nA = el('span', { class: 'nom-jeton' });
    $('monde').replaceChildren(...cine.reperes, cine.lien, cine.ecart, cine.fam, cine.jA, cine.jD, cine.nA, cine.nD);
  }

  function construireFrise() {
    for (const camp of ['druide', 'adv']) {
      const tete = el('span', { class: 'tete-lecture' });
      $(camp === 'druide' ? 'piste-d' : 'piste-a').replaceChildren(...cine.actions[camp].map(a =>
        el('i', { class: a.genre === 'forme' ? 'forme' : '', style: `left:${(100 * a.t / cine.T).toFixed(2)}%`, title: `${fmtT(a.t)} s · ${a.nom}` })), tete);
      cine.tetes[camp] = tete;
    }
    $('frise-adv').textContent = cine.nomAdv;
  }

  function construireDecomptes() {
    for (const camp of ['druide', 'adv']) {
      const items = new Map();
      for (const a of cine.actions[camp]) {
        if (!items.has(a.nom)) items.set(a.nom, el('li', { class: 'avenir' }, ico(iconeAction(a), 20), el('span', { text: a.nom }), el('span', { class: 'n', text: '–' })));
      }
      cine.decompte[camp] = { items, cle: null };
      $(camp === 'druide' ? 'decompte-d' : 'decompte-a').replaceChildren(...(items.size ? items.values() : [el('li', { class: 'avenir seul', text: 'Aucun sort.' })]));
    }
    $('decompte-titre-a').textContent = `Sorts et techniques du ${cine.nomAdv.toLowerCase()}`;
  }

  function chargerDuel(d, adv, spec, nomDruide) {
    pause();
    cine.nomDruide = nomDruide || 'Druide';
    const im = d.images;
    cine.duel = d;
    cine.T = im[im.length - 1].t;
    cine.t = 0;
    cine.nomAdv = adv.nom;
    cine.classeAdv = d.classeAdv;
    cine.couleurResA = d.classeAdv === 'guerrier' ? 'var(--rage)' : d.classeAdv === 'voleur' ? 'var(--energie)' : 'var(--mana)';
    cine.cam = camera(im);
    cine.actions = { druide: actionsDruide(d), adv: d.actions.filter(a => a.camp === 'adv') };
    cine.legendes = d.evenements.filter(e => e.type !== 'forme').map(e => ({ t: e.t, texte: e.texte, fin: e.type === 'fin' }));
    if (d.gagnant === 'nul') cine.legendes.push({ t: cine.T, texte: '180 s écoulées : match nul', fin: true });
    cine.cd = construireCadre($('cadre-d'), cine.nomDruide, '', I.forme(im[0].forme));
    cine.ca = construireCadre($('cadre-a'), adv.nom, nomSpecCourt(spec), I.classe(d.classeAdv));
    construireArene();
    for (const n of cine.flottants.values()) n.remove();
    cine.flottants.clear();
    cine.formeVue = null;
    cine.jA.title = adv.nom;
    cine.jA.style.backgroundImage = I.classe(d.classeAdv) ? `url("${I.classe(d.classeAdv)}")` : 'none';
    cine.fam.style.backgroundImage = I.familier(d.classeAdv) ? `url("${I.familier(d.classeAdv)}")` : 'none';
    ecrireTexte(cine.nA, adv.nom);
    construireFrise();
    construireDecomptes();
    $('cine-temps').max = String(cine.T);
    $('arene').setAttribute('aria-label', `Duel rejoué contre le ${adv.nom.toLowerCase()}, ${Math.round(d.duree)} secondes`);
    cine.largeur = $('monde').clientWidth;
    dessiner();
    cine.enAttente = !mouvementReduit;
    if (cine.enAttente && cine.visible) { cine.enAttente = false; jouer(); }
  }

  function majCadre(r, p, druide, t) {
    const pv = druide ? p.pvD : p.pvA, max = druide ? p.pvMaxD : p.pvMaxA;
    ecrireStyle(r.pv, 'transform', `scaleX(${(pv / max).toFixed(3)})`);
    ecrireTexte(r.pvCur, fmt(pv));
    ecrireTexte(r.pvMax, ' / ' + fmt(max));
    let ratio, couleur, valeur, mana = null, cp = 0, pips;
    if (druide) {
      ecrireTexte(r.sous, NOMS_FORME[p.forme]);
      if (r.forme !== p.forme) { r.forme = p.forme; r.ico.src = I.forme(p.forme); }
      if (p.forme === 'ours') { ratio = p.rage / 100; couleur = 'var(--rage)'; valeur = String(p.rage); mana = p.mana; }
      else if (p.forme === 'felin') { ratio = p.energie / 100; couleur = 'var(--energie)'; valeur = String(p.energie); mana = p.mana; cp = p.cp; }
      else { ratio = p.mana; couleur = 'var(--mana)'; valeur = pc(p.mana); }
      pips = p.forme === 'felin';
    } else {
      ratio = p.resA; couleur = cine.couleurResA;
      valeur = cine.classeAdv === 'guerrier' || cine.classeAdv === 'voleur' ? String(Math.round(p.resA * 100)) : pc(p.resA);
      cp = p.cpA || 0;
      pips = cine.classeAdv === 'voleur';
    }
    ecrireStyle(r.res, 'transform', `scaleX(${Math.max(0, Math.min(1, ratio)).toFixed(3)})`);
    ecrireStyle(r.res, 'background', couleur);
    ecrireTexte(r.resVal, valeur);
    ecrireStyle(r.rgMana, 'visibility', mana == null ? 'hidden' : 'visible');
    if (mana != null) { ecrireStyle(r.mana, 'transform', `scaleX(${mana.toFixed(3)})`); ecrireTexte(r.manaVal, pc(mana)); }
    ecrireStyle(r.pips, 'visibility', pips ? 'visible' : 'hidden');
    if (r.cp !== cp) { r.cp = cp; [...r.pips.children].forEach((x, k) => { x.className = k < cp ? 'on' : ''; }); }
    const cc = druide ? p.ccD : p.ccA, cache = druide ? p.cacheD : p.cacheA;
    const etatTxt = cc ? (ETATS_CC[cc] || cc) : cache ? (druide ? 'rôde' : 'camouflé') : '';
    ecrireTexte(r.cc, etatTxt);
    if (r.cc.hidden !== !etatTxt) r.cc.hidden = !etatTxt;
    // Incantation en cours, sinon les trois derniers sorts (le plus récent en premier)
    const inc = druide ? p.incD : p.incA;
    const acts = cine.actions[druide ? 'druide' : 'adv'];
    const n = nbJusqua(acts, t);
    const neuf = n > 0 && t - acts[n - 1].t < 1.5;
    const cle = inc ? 'i' + inc.nom : 'a' + n + (neuf ? 'n' : '');
    if (r.filCle !== cle) {
      r.filCle = cle;
      if (inc) {
        ecrireTexte(r.incNom, inc.nom);
        const src = I.sort(inc.nom);
        r.incIco.hidden = !src;
        if (src) r.incIco.src = src;
        r.fil.replaceChildren(r.incant);
      } else r.fil.replaceChildren(...acts.slice(Math.max(0, n - 3), n).reverse().map((a, k) =>
        el('span', { class: k === 0 && neuf ? 'neuf' : '' }, ico(iconeAction(a), 18), a.nom)));
    }
    if (inc) ecrireStyle(r.incBarre, 'transform', `scaleX(${inc.p.toFixed(3)})`);
  }

  function majDecompte(camp, t) {
    const acts = cine.actions[camp], dc = cine.decompte[camp];
    const n = nbJusqua(acts, t), nr = nbJusqua(acts, t - 1.2);
    const cle = n + ':' + nr;
    if (dc.cle === cle) return;
    dc.cle = cle;
    const comptes = new Map(), recents = new Set();
    for (let i = 0; i < n; i++) {
      comptes.set(acts[i].nom, (comptes.get(acts[i].nom) || 0) + 1);
      if (i >= nr) recents.add(acts[i].nom);
    }
    for (const [nom, li] of dc.items) {
      const k = comptes.get(nom) || 0;
      li.className = k ? (recents.has(nom) ? 'recent' : '') : 'avenir';
      li.lastChild.textContent = k ? '×' + k : '–';
    }
  }

  function creerFlottant(h) {
    const rate = h.genre !== 'degat' && h.genre !== 'crit' && h.genre !== 'soin';
    const cl = 'flottant ' + (h.genre === 'soin' ? 'soin' : rate ? 'rate' : 'vers-' + h.cible) + (h.genre === 'crit' ? ' crit' : '');
    const texte = h.genre === 'soin' ? '+' + fmt(h.m) : rate ? h.genre : fmt(h.m) + (h.genre === 'crit' ? ' !' : '');
    const src = I.sort(h.nom);
    return el('div', { class: cl, 'aria-hidden': 'true' },
      el('span', { class: 'ligne' }, src ? ico(src, 16) : null, texte),
      /^Coup blanc/.test(h.nom) ? null : el('small', { text: h.nom }));
  }

  function dessiner() {
    const d = cine.duel;
    if (!d) return;
    const im = d.images, t = cine.t;
    const i = indice(im, t), j = Math.min(im.length - 1, i + 1);
    const p = im[i], q = im[j];
    const f = j > i ? Math.max(0, Math.min(1, (t - p.t) / (q.t - p.t))) : 0;
    const lerp = (a, b) => a + (b - a) * f;
    majCadre(cine.cd, p, true, t);
    majCadre(cine.ca, p, false, t);
    // arène
    const ww = lerp(cine.cam.w[i], cine.cam.w[j]);
    const lo = lerp(cine.cam.c[i], cine.cam.c[j]) - ww / 2;
    const ecran = x => (x - lo) / ww * 100;
    const xD = lerp(p.xD, q.xD), xA = lerp(p.xA, q.xA);
    const sD = ecran(xD), sA = ecran(xA);
    // un repère tous les 5, 10, 20 ou 50 m, assez espacés pour que les chiffres ne se touchent pas
    const pasRepere = cine.largeur ? ([5, 10, 20].find(m => m * cine.largeur / ww >= 46) || 50) : (ww > 50 ? 10 : 5);
    let x = Math.ceil((lo - ww * 0.1) / pasRepere) * pasRepere;
    for (const rp of cine.reperes) {
      const sx = ecran(x);
      const vu = sx <= 110;
      if (rp.hidden === vu) rp.hidden = !vu;
      if (vu) { ecrireStyle(rp, 'left', sx.toFixed(2) + '%'); ecrireTexte(rp, x + ' m'); }
      x += pasRepere;
    }
    ecrireStyle(cine.lien, 'left', Math.min(sD, sA).toFixed(2) + '%');
    ecrireStyle(cine.lien, 'width', Math.abs(sA - sD).toFixed(2) + '%');
    const ecartPx = Math.abs(sA - sD) / 100 * cine.largeur;
    if (cine.ecart.hidden !== ecartPx < 90) cine.ecart.hidden = ecartPx < 90;
    ecrireStyle(cine.ecart, 'left', ((sD + sA) / 2).toFixed(2) + '%');
    ecrireTexte(cine.ecart, Math.round(Math.abs(xA - xD)) + ' m');
    const druideAGauche = xD <= xA;
    // Le druide prend la silhouette de sa forme et regarde toujours son adversaire
    if (cine.formeVue !== p.forme) {
      cine.formeVue = p.forme;
      for (const f of Object.values(cine.figs)) f.classList.toggle('on', f.dataset.forme === p.forme);
    }
    ecrireStyle(cine.jD, 'left', sD.toFixed(2) + '%');
    ecrireStyle(cine.jD, 'transform', druideAGauche ? 'none' : 'scaleX(-1)');
    cine.jD.classList.toggle('controle', !!p.ccD);
    cine.jD.classList.toggle('cache', p.cacheD);
    ecrireStyle(cine.jA, 'left', sA.toFixed(2) + '%');
    cine.jA.classList.toggle('controle', !!p.ccA);
    cine.jA.classList.toggle('cache', p.cacheA);
    // Noms sous les combattants, tournés vers l'extérieur pour ne pas se chevaucher
    // le nom de gauche finit, celui de droite commence, à 14 px du centre, sans franchir le milieu
    const ecartNoms = Math.abs(sA - sD) / 100 * (cine.largeur || 0);
    const debord = Math.round(Math.max(-14, Math.min(14, ecartNoms / 2 - 5)));
    const aGauche = `translateX(calc(-100% + ${debord}px))`, aDroite = `translateX(${-debord}px)`;
    ecrireTexte(cine.nD, cine.nomDruide + ' · ' + NOMS_FORME[p.forme].toLowerCase());
    ecrireStyle(cine.nD, 'left', sD.toFixed(2) + '%');
    ecrireStyle(cine.nD, 'transform', druideAGauche ? aGauche : aDroite);
    ecrireStyle(cine.nA, 'left', sA.toFixed(2) + '%');
    ecrireStyle(cine.nA, 'transform', druideAGauche ? aDroite : aGauche);
    if (cine.fam.hidden !== !p.familier) cine.fam.hidden = !p.familier;
    ecrireStyle(cine.fam, 'left', `calc(${sA.toFixed(2)}% ${druideAGauche ? '+' : '-'} 30px)`);
    // chiffres flottants au-dessus de la cible
    const coups = d.coups, actifs = new Set();
    for (let k = nbJusqua(coups, t - VIE_FLOTTANT); k < coups.length && coups[k].t <= t + 1e-6; k++) {
      const h = coups[k];
      actifs.add(k);
      let n = cine.flottants.get(k);
      if (!n) { n = creerFlottant(h); cine.flottants.set(k, n); $('monde').append(n); }
      const age = Math.max(0, t - h.t) / VIE_FLOTTANT;
      n.style.left = (h.cible === 'druide' ? sD : sA).toFixed(2) + '%';
      // trois couloirs : gauche, droite, et celui du milieu plus haut pour que les noms ne se chevauchent pas
      const couloir = k % 3;
      n.style.transform = `translate(calc(-50% + ${couloir === 0 ? 0 : couloir === 1 ? -52 : 52}px), ${(-age * 46 - (couloir === 0 ? 26 : 0)).toFixed(1)}px)`;
      n.style.opacity = (1 - age * age).toFixed(2);
    }
    for (const [k, n] of cine.flottants) if (!actifs.has(k)) { n.remove(); cine.flottants.delete(k); }
    // légende, frise, décomptes
    const nl = nbJusqua(cine.legendes, t);
    const L = nl ? cine.legendes[nl - 1] : null;
    ecrireTexte($('cine-legende'), L && (L.fin || t - L.t < VIE_LEGENDE) ? L.texte : '');
    ecrireTexte($('cine-t'), `${fmtT(t)} s / ${fmtT(cine.T)} s`);
    const pos = (100 * t / (cine.T || 1)).toFixed(2) + '%';
    ecrireStyle(cine.tetes.druide, 'left', pos);
    ecrireStyle(cine.tetes.adv, 'left', pos);
    const curseur = $('cine-temps');
    if (Math.abs(+curseur.value - t) > 0.05) curseur.value = t.toFixed(1);
    majDecompte('druide', t);
    majDecompte('adv', t);
  }

  // ------------------------------------------------------------- lecture
  function majBoutonLecture() {
    $('cine-lecture').textContent = cine.lecture ? '❚❚ Pause' : cine.T && cine.t >= cine.T ? '▶ Revoir' : '▶ Lecture';
  }
  function boucle(ts) {
    if (!cine.lecture) return;
    if (cine.dernier) cine.t = Math.min(cine.T, cine.t + Math.min(0.1, (ts - cine.dernier) / 1000) * cine.vitesse);
    cine.dernier = ts;
    dessiner();
    if (cine.t >= cine.T) { pause(); return; }
    cine.raf = requestAnimationFrame(boucle);
  }
  function jouer() {
    if (!cine.duel) return;
    if (cine.t >= cine.T) cine.t = 0;
    cine.lecture = true;
    cine.dernier = 0;
    cancelAnimationFrame(cine.raf);
    cine.raf = requestAnimationFrame(boucle);
    majBoutonLecture();
  }
  function pause() {
    cine.lecture = false;
    cancelAnimationFrame(cine.raf);
    majBoutonLecture();
  }
  function allerA(t) {
    if (!cine.duel) return;
    cine.enAttente = false;
    cine.t = Math.max(0, Math.min(cine.T, t));
    cine.dernier = 0;
    dessiner();
    majBoutonLecture();
  }
  $('cine-lecture').addEventListener('click', () => {
    cine.enAttente = false; cine.reprendre = false;
    if (cine.lecture) pause(); else jouer();
  });
  $('cine-debut').addEventListener('click', () => { allerA(0); jouer(); });
  $('cine-temps').addEventListener('input', e => allerA(+e.target.value));
  for (const x of $('cine-vitesse').children) x.setAttribute('aria-pressed', String(+x.dataset.v === cine.vitesse));
  $('cine-vitesse').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    cine.vitesse = +b.dataset.v;
    memo.ecrire('vitesse', cine.vitesse);
    for (const x of $('cine-vitesse').children) x.setAttribute('aria-pressed', String(x === b));
  });
  for (const id of ['piste-d', 'piste-a']) {
    const piste = $(id);
    const viser = ev => { const b = piste.getBoundingClientRect(); if (b.width) allerA((ev.clientX - b.left) / b.width * cine.T); };
    piste.addEventListener('pointerdown', ev => {
      try { piste.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      piste._glisse = true; viser(ev);
    });
    piste.addEventListener('pointermove', ev => { if (piste._glisse) viser(ev); });
    for (const fin of ['pointerup', 'pointercancel']) piste.addEventListener(fin, () => { piste._glisse = false; });
  }
  // Lecture automatique quand la scène est à l'écran, pause quand elle en sort
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entrees => {
      cine.visible = entrees[entrees.length - 1].isIntersecting;
      if (cine.visible) {
        if (cine.enAttente || cine.reprendre) { cine.enAttente = false; cine.reprendre = false; jouer(); }
      } else if (cine.lecture) { pause(); cine.reprendre = true; }
    }, { threshold: 0.35 }).observe($('scene'));
  } else cine.visible = true;
  const mesurer = () => { const l = $('monde').clientWidth; if (l && l !== cine.largeur) { cine.largeur = l; dessiner(); } };
  if ('ResizeObserver' in window) new ResizeObserver(mesurer).observe($('monde'));
  else window.addEventListener('resize', mesurer);

  // ------------------------------------------------------------ armurerie
  // Un druide de l'armurerie se charge dans le simulateur avec son niveau, ses talents
  // et son équipement ; les réglages d'avant sont gardés pour y revenir.
  function chargerPerso(p) {
    if (!persoActif()) {
      etat.avantPerso = { stats: etat.stats, talents: etat.talents };
      memo.ecrire('avantPerso', etat.avantPerso);
    }
    etat.perso = p.cle;
    etat.stats = Object.assign({}, p.stats);
    etat.talents = Object.assign({}, p.talents);
    memo.ecrire('perso', etat.perso); memo.ecrire('stats', etat.stats); memo.ecrire('talents', etat.talents);
    rendreStats();
    changementProfil();
  }
  function quitterPerso() {
    if (!persoActif()) return;
    const avant = etat.avantPerso || {};
    etat.perso = null;
    etat.stats = Object.assign({}, D.PRESETS_EQUIPEMENT.find(x => x.id === 'pvp').stats, avant.stats || {});
    etat.talents = Object.assign({}, avant.talents && M.verifierTalents(avant.talents).ok ? avant.talents : D.PRESETS_TALENTS[0].points);
    memo.ecrire('perso', null); memo.ecrire('stats', etat.stats); memo.ecrire('talents', etat.talents);
    rendreStats();
  }
  const pointsPerso = p => p.specs.map(x => x.points).join('/');
  const nomArbre = id => (D.ARBRES.find(a => a.id === id) || { nom: id }).nom;
  function rendrePersoCharge() {
    const p = persoActif();
    $('perso-charge').hidden = !p;
    if (!p) { $('perso-charge').replaceChildren(); return; }
    const retour = el('button', { type: 'button', class: 'puce', text: 'Revenir au druide niveau 60' });
    retour.addEventListener('click', () => { quitterPerso(); changementProfil(); });
    const gagner = el('button', { type: 'button', class: 'puce', text: 'Comment gagner ce duel ?' });
    gagner.addEventListener('click', () => {
      etat.persoVu = p.cle;
      conseil.cible = etat.adversaire + '.' + specDe(etat.adversaire).id;
      ouvrirOnglet('armurerie');
      lancerConseil();
      $('perso-conseil').scrollIntoView({ block: 'start', behavior: mouvementReduit ? 'auto' : 'smooth' });
    });
    const v = M.verifierTalents(etat.talents, plafondTalents());
    const talents = memesPoints(etat.talents, p.talents) ? `talents ${pointsPerso(p)}` : `talents modifiés ${v.parArbre.equilibre}/${v.parArbre.farouche}/${v.parArbre.restauration}`;
    $('perso-charge').replaceChildren(
      el('img', { src: p.portrait, alt: '', width: '32', height: '32' }),
      el('div', null, el('b', { text: p.nom }),
        el('div', { class: 'discret', text: `Niveau ${niveauActif()} · ${talents} · équipement de l'armurerie · duel estimé` })),
      el('div', { class: 'boutons' }, gagner, retour));
  }
  // Simulateur réglé sur ce druide contre cette spécialisation
  function allerAuDuel(p, classe, specId) {
    if (etat.perso !== p.cle) chargerPerso(p);
    etat.adversaire = classe; memo.ecrire('adversaire', classe);
    if (specId) choisirSpec(classe, specId);
    rendreAdversaires();
    ouvrirOnglet('simulateur');
    clearTimeout(minuterie);
    lancerComparaison();
    window.scrollTo(0, 0);
  }

  const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  function dateFr(iso) { const d = new Date(iso); return isNaN(d) ? '?' : DATE.format(d); }
  function persoVu() { return PERSOS.find(p => p.cle === etat.persoVu) || persoActif() || PERSOS[0] || null; }
  function rendreArmurerie() {
    const p = persoVu();
    $('perso-chips').hidden = PERSOS.length < 2;
    $('perso-chips').replaceChildren(...PERSOS.map(x => {
      const b = el('button', { type: 'button', class: 'puce', 'aria-pressed': String(p && x.cle === p.cle), text: `${x.nom} (${x.niveau})` });
      b.addEventListener('click', () => { etat.persoVu = x.cle; annulerConseil(); rendreArmurerie(); lancerMatricePerso(); majIndices(); });
      return b;
    }));
    for (const id of ['perso-comparatif', 'perso-conseil', 'perso-details', 'perso-conversion']) $(id).hidden = !p;
    if (!p) {
      $('perso-carte').replaceChildren(el('div', { class: 'ident' },
        el('h2', { text: 'Aucun druide importé' }),
        el('p', { class: 'prose', text: P.aide || 'Lancez « node outils/armurerie.js » : le script lit les druides de l\'armurerie et écrit js/personnages.js.' })));
      return;
    }
    const charge = etat.perso === p.cle;
    const btn = el('button', { type: 'button', class: 'btn principal', text: charge ? 'Ouvrir dans le simulateur' : 'Charger dans le simulateur' });
    btn.addEventListener('click', () => allerAuDuel(p, etat.adversaire));
    $('perso-carte').replaceChildren(
      el('img', { class: 'portrait', src: p.portrait, alt: `Portrait de ${p.nom}`, width: '84', height: '84' }),
      el('div', { class: 'ident' },
        el('span', { class: 'etiquette', text: `Armurerie · ${p.region.toUpperCase()} · ${p.faction}` }),
        el('h2', { text: p.nom }),
        el('p', { class: 'meta', text: `${p.classe} ${p.race.toLowerCase()} niveau ${p.niveau}${p.guilde ? ` · <${p.guilde}>` : ''} ${p.ilvl ? ` · niveau d'objet moyen ${p.ilvl}` : ''}` }),
        el('div', { class: 'specs-perso' }, ...p.specs.map(x => el('span', null,
          x.icone ? el('img', { class: 'ico-pt', src: x.icone, alt: '' }) : null, nomArbre(x.arbre), el('b', { text: String(x.points) }))))),
      el('div', { class: 'bas' },
        el('p', { class: 'dates' }, `Fiche mise à jour le ${dateFr(p.majArmurerie)}, importée le ${dateFr(P.capture)} · `,
          el('a', { href: p.urlArmurerie, target: '_blank', rel: 'noopener', text: 'fiche Blizzard' })),
        btn));
    rendreTalentsPerso(p);
    rendreEquipementPerso(p);
    rendreControlePerso(p);
    rendreMatricePerso();
    majConseil();
  }

  function rendreTalentsPerso(p) {
    const ligne = t => el('li', { class: t.id && t.sim ? '' : 'hors-sim' },
      t.icone ? el('img', { src: t.icone, alt: '', width: '24', height: '24' }) : el('span'),
      el('span', null, t.nom,
        !t.id ? el('small', { text: 'Inconnu du simulateur, ignoré' })
          : !t.sim ? el('small', { text: 'Sans effet en duel dans le simulateur' })
          : t.nomSimulateur && t.nomSimulateur !== t.nom ? el('small', { text: `« ${t.nomSimulateur} » dans le simulateur` }) : null),
      el('span', { class: 'rg', text: `${t.rang}/${t.max || '?'}` }));
    const arbres = [...new Set(p.talentsJeu.map(t => t.arbre))];
    $('perso-talents').replaceChildren(...arbres.map(a => {
      const sp = p.specs.find(x => x.arbre === a);
      return el('section', null,
        el('h4', null, nomArbre(a), el('span', { class: 'num', text: String(sp ? sp.points : '') })),
        el('ul', null, ...p.talentsJeu.filter(t => t.arbre === a).map(ligne)));
    }), ...(p.remarques || []).map(r => el('p', { class: 'discret', text: r })));
  }

  function rendreEquipementPerso(p) {
    $('perso-equipement').replaceChildren(...p.equipement.map(o => el('li', { class: 'objet', 'data-q': o.qualite || '' },
      o.icone ? el('img', { src: o.icone, alt: '', width: '36', height: '36', loading: 'lazy' }) : el('span'),
      el('div', null,
        el('div', { class: 'nom', text: o.nom }),
        el('div', { class: 'ligne', text: [o.emplacement, o.type, `niveau ${o.ilvl}`, o.armure ? `${o.armure} armure` : null].filter(Boolean).join(' · ') }),
        o.arme ? el('div', { class: 'bonus', text: `${o.arme.min}–${o.arme.max} dégâts, vitesse ${virgule(o.arme.vitesse, 2)} · ${virgule(o.arme.dps)} DPS` }) : null,
        o.stats && o.stats.length ? el('div', { class: 'bonus', text: o.stats.join(' · ') }) : null,
        o.enchantement ? el('div', { class: 'ench', text: o.enchantement }) : null,
        ...(o.effets || []).map(e => el('div', { class: 'ligne', text: e }))))));
  }

  // Les valeurs hors forme recalculées doivent retomber sur la fiche de l'armurerie
  function rendreControlePerso(p) {
    const pr = M.calculerDruide(p.stats, p.talents, { niveau: p.niveau, base: p.base });
    const f = p.fiche, st = p.stats;
    const redoutable = M.niveauDe(p.niveau) >= 40;
    const ctrl = (a, b, tol) => Math.abs(a - b) <= (tol || 0)
      ? el('td', { class: 'ok', text: 'identique' }) : el('td', { class: 'discret', text: `écart ${virgule(b - a)}` });
    const ligne = (nom, a, b, c) => el('tr', null, el('td', { text: nom }), el('td', { class: 'n', text: a }), el('td', { class: 'n', text: b }), c);
    const note = t => el('td', { class: 'discret', text: t });
    $('perso-controle').replaceChildren(
      el('thead', null, el('tr', null, el('th', { text: '' }), el('th', { class: 'n', text: 'Armurerie' }), el('th', { class: 'n', text: 'Simulateur' }), el('th', { text: '' }))),
      el('tbody', null,
        ligne('Points de vie', fmt(f.pv), fmt(pr.pv.humanoide), ctrl(f.pv, pr.pv.humanoide)),
        ligne('Mana', fmt(f.mana), fmt(pr.manaMax), ctrl(f.mana, pr.manaMax, 1)),
        ligne('Armure', fmt(f.armure), fmt(pr.armure.humanoide), ctrl(f.armure, pr.armure.humanoide)),
        ligne('Esquive', virgule(f.esquive, 2) + ' %', virgule(pr.esquive.humanoide, 2) + ' %', ctrl(f.esquive, pr.esquive.humanoide, 0.01)),
        ligne('Puissance d\'attaque des objets', '–', fmt(st.pa), note(`fiche ${fmt(f.pa)} − 2 × Force + 20`)),
        ligne('Armure des objets', '–', `${fmt(st.armure)} + ${fmt(st.armureBonus || 0)}`, note('la part bonus n\'est pas multipliée en ours')),
        ligne('DPS de l\'arme', '–', virgule(st.dpsArme), note(`${fmt(f.degatsMin)}–${fmt(f.degatsMax)} en humanoïde`)),
        ligne('PV en ours', '–', fmt(pr.pv.ours), note(redoutable ? 'Forme d\'ours redoutable' : 'Forme d\'ours, sans le bonus de PV de la forme redoutable (niveau 40)')),
        ligne('Armure en ours', '–', fmt(pr.armure.ours), note(redoutable ? 'objets × 4,6' : 'objets × 2,8 avant le niveau 40')),
        ligne('PA félin / ours', '–', `${fmt(pr.pa.felin)} / ${fmt(pr.pa.ours)}`, note('')),
        ligne('Critique en forme', '–', virgule(pr.crit) + ' %', note('Griffes acérées comprises')),
        ligne('Coût d\'une forme', '–', fmt(pr.coutForme) + ' mana', note(''))));
  }

  let matPerso = { cle: null, res: {}, jeton: 0 };
  function configPerso(p, extra) { return config(Object.assign({ stats: p.stats, talents: p.talents, niveau: p.niveau, base: p.base }, extra)); }
  function cleMatricePerso(p) {
    return JSON.stringify([p.cle, P.capture, ...['ouverture', 'methodeSoin', 'seuilSoin', 'distance', 'equipAdv'].map(id => $(id).value), $('powershift').checked]);
  }
  function lancerMatricePerso() {
    const p = persoVu();
    if (!p) return;
    const cle = cleMatricePerso(p);
    if (matPerso.cle === cle) { rendreMatricePerso(); return; }
    const jt = matPerso.jeton + 1;
    matPerso = { cle, res: {}, jeton: jt };
    const taches = [];
    for (const l of lignesMatrice()) for (const f of ['ours', 'felin']) taches.push([l, f]);
    let i = 0;
    rendreMatricePerso();
    const suite = () => {
      if (jt !== matPerso.jeton) return;
      const [l, f] = taches[i];
      (matPerso.res[l.cle] = matPerso.res[l.cle] || {})[f] = M.simulerSerie(configPerso(p, { adversaire: l.classe, specAdv: l.spec.id, forme: f, graine: 5 }), 100);
      i++;
      if (etat.onglet === 'armurerie') rendreMatricePerso();
      if (i < taches.length) setTimeout(suite, 0);
    };
    setTimeout(suite, 0);
  }
  function rendreMatricePerso() {
    const p = persoVu();
    if (!p) return;
    const n = M.niveauDe(p.niveau);
    const res = matPerso.res;
    const lignes = lignesMatrice();
    const faits = lignes.reduce((s, l) => s + Object.keys(res[l.cle] || {}).length, 0);
    const fini = faits === lignes.length * 2;
    const total = p.specs.reduce((s, x) => s + x.points, 0);
    $('perso-comp-titre').textContent = `Ours ou félin au niveau ${n} ?`;
    $('perso-comp-intro').textContent = `${p.nom} affronte chaque spécialisation jouée en duel, au niveau ${n} : ses ${total} points de talents (${pointsPerso(p)}), son équipement de l'armurerie, les réglages avancés du simulateur, 100 duels par case. C'est une estimation : l'adversaire est un personnage type du même niveau, sans les sorts qu'il n'a pas encore appris ni ses talents à 31 points.`;
    $('perso-matrice-etat').textContent = fini ? '' : `calcul en cours… ${faits} / ${lignes.length * 2}`;
    const cell = (k, f) => {
      const r = res[k] && res[k][f];
      if (!r) return el('td', { class: 'cellule discret', text: '…' });
      const o = res[k][f === 'ours' ? 'felin' : 'ours'];
      const best = o && meilleureForme(res[k]) === f;
      return el('td', { class: 'cellule' + (best ? ' conseil' : '') }, pc(r.tauxVictoire), r.tauxNul > 0.1 ? el('small', { text: ` · ${pc(r.tauxNul)} nuls` }) : null);
    };
    $('perso-matrice').replaceChildren(
      el('thead', null, el('tr', null, el('th', { text: 'Adversaire' }), el('th', { text: 'Spécialisation' }), el('th', { class: 'n', text: 'Ours' }), el('th', { class: 'n', text: 'Félin' }), el('th', { text: '' }))),
      el('tbody', null, ...lignes.map(l => {
        const d = D.ADVERSAIRES[l.classe];
        const premiere = d.specs[0] === l.spec;
        const voir = el('button', { type: 'button', class: 'puce', 'aria-label': `Voir le duel contre ${d.nom.toLowerCase()} ${nomSpecCourt(l.spec)}` },
          'Voir', el('span', { class: 'long', text: ' le duel' }));
        voir.addEventListener('click', () => allerAuDuel(p, l.classe, l.spec.id));
        return el('tr', { class: premiere ? 'debut-classe' : null },
          el('td', null, premiere ? el('b', { text: d.nom }) : null),
          el('td', { class: 'discret', text: nomSpecCourt(l.spec) }),
          cell(l.cle, 'ours'), cell(l.cle, 'felin'),
          el('td', { class: 'voir' }, voir));
      })));
    // Bilan une fois la grille remplie
    if (!fini) { $('perso-resume').replaceChildren(); return; }
    const cases = lignes.map(l => {
      const f = meilleureForme(res[l.cle]);
      return { l, f, t: res[l.cle][f].tauxVictoire };
    });
    const nom = c => `${D.ADVERSAIRES[c.l.classe].nom} ${nomSpecCourt(c.l.spec)}`;
    const felin = cases.filter(c => c.f === 'felin').length;
    const tri = cases.slice().sort((a, b) => b.t - a.t);
    const moy = f => pc(lignes.reduce((s, l) => s + res[l.cle][f].tauxVictoire, 0) / lignes.length);
    const item = (k, v) => el('div', null, el('span', { class: 'etiquette', text: k }), el('b', { text: v }));
    $('perso-resume').replaceChildren(
      item('Forme à jouer', felin * 2 >= cases.length ? `Félin (${felin} spés sur ${cases.length})` : `Ours (${cases.length - felin} spés sur ${cases.length})`),
      item('Victoires en moyenne', `ours ${moy('ours')} · félin ${moy('felin')}`),
      item('Meilleur duel', `${nom(tri[0])} · ${pc(tri[0].t)} en ${NOMS_FORME[tri[0].f].toLowerCase()}`),
      item('Le plus dur', `${nom(tri[tri.length - 1])} · ${pc(tri[tri.length - 1].t)}`));
  }


  // ------------------------------------------------- comment gagner ce duel
  // Le Conseiller (js/conseiller.js) essaie d'autres talents, mesure le poids des statistiques
  // et le seuil à atteindre ; on l'avance par tranches de 40 ms pour garder la page réactive.
  const conseil = { cible: null, cache: {}, jeton: 0, encours: null };
  const nomF = f => NOMS_FORME[f].toLowerCase();
  const FORMES_C = ['ours', 'felin'];
  function cibleConseil() {
    const c = conseil.cible || etat.adversaire + '.' + specDe(etat.adversaire).id;
    const [k, s] = c.split('.');
    return D.ADVERSAIRES[k] && D.ADVERSAIRES[k].specs.some(x => x.id === s) ? c : etat.adversaire + '.' + specDe(etat.adversaire).id;
  }
  const cleConseil = (p, cible) => JSON.stringify([cleMatricePerso(p), cible]);
  function annulerConseil() {
    conseil.jeton++; conseil.encours = null;
    $('conseil-go').disabled = false; $('conseil-prog').hidden = true; $('conseil-etat').textContent = '';
  }
  function majConseil() {
    const p = persoVu();
    if (!p || !C) return;
    const sel = $('conseil-adv');
    if (!sel.options.length) {
      sel.replaceChildren(...Object.entries(D.ADVERSAIRES).map(([k, a]) => el('optgroup', { label: a.nom },
        ...a.specs.map(sp => el('option', { value: k + '.' + sp.id, text: `${a.nom} ${nomSpecCourt(sp)}` })))));
    }
    sel.value = cibleConseil();
    const n = M.niveauDe(p.niveau);
    $('conseil-titre').textContent = `Comment ${p.nom} peut gagner`;
    $('conseil-intro').textContent = `Le simulateur essaie d'autres répartitions de vos ${n - 9} points de talents, mesure ce que rapporte chaque statistique d'équipement contre cet adversaire, puis cherche combien il en faut pour passer 50 % de victoires. Environ 4 000 duels au niveau ${n}, quelques secondes. Les points d'héritage sont listés à part : ils ne se simulent pas.`;
    const k = cleConseil(p, sel.value);
    if (conseil.encours === k) return;
    if (conseil.encours) annulerConseil();
    if (conseil.cache[k]) rendreConseil(p, sel.value, conseil.cache[k]);
    else { $('conseil-res').replaceChildren(); $('conseil-etat').textContent = ''; }
  }
  function lancerConseil() {
    const p = persoVu();
    if (!p || !C) return;
    majConseil();
    const cible = $('conseil-adv').value;
    conseil.cible = cible;
    const k = cleConseil(p, cible);
    if (conseil.cache[k]) { rendreConseil(p, cible, conseil.cache[k]); return; }
    if (conseil.encours === k) return;
    const [classe, spec] = cible.split('.');
    const jt = ++conseil.jeton;
    conseil.encours = k;
    const it = C.conseiller(configPerso(p, { adversaire: classe, specAdv: spec }), { talents: p.talents, plafond: M.niveauDe(p.niveau) - 9 });
    $('conseil-go').disabled = true;
    $('conseil-prog').hidden = false;
    $('conseil-prog').firstChild.style.width = '0';
    $('conseil-res').replaceChildren();
    const pas = () => {
      if (jt !== conseil.jeton) return;
      const t0 = performance.now();
      let r;
      do { r = it.next(); } while (!r.done && performance.now() - t0 < 40);
      if (r.done) {
        conseil.cache[k] = r.value;
        conseil.encours = null;
        $('conseil-go').disabled = false;
        $('conseil-prog').hidden = true;
        if ($('conseil-adv').value === cible && persoVu() === p) rendreConseil(p, cible, r.value);
        return;
      }
      $('conseil-etat').textContent = `${r.value.texte}…`;
      $('conseil-prog').firstChild.style.width = Math.min(100, 100 * r.value.duels / r.value.prevu) + '%';
      setTimeout(pas, 0);
    };
    setTimeout(pas, 0);
  }
  $('conseil-go').addEventListener('click', lancerConseil);
  $('conseil-adv').addEventListener('change', e => { conseil.cible = e.target.value; majConseil(); });

  // Talents proposés chargés dans le simulateur, contre cet adversaire, dans la forme conseillée
  function essayerBuild(p, points, forme, classe, specId) {
    if (etat.perso !== p.cle) chargerPerso(p);
    etat.talents = Object.assign({}, points);
    memo.ecrire('talents', etat.talents);
    etat.forme = forme;
    for (const x of $('choix-forme').children) x.setAttribute('aria-pressed', String(x.dataset.v === forme));
    syncPresets(); rendreProfil(); rendrePersoCharge();
    matriceObsolete = true;
    allerAuDuel(p, classe, specId);
  }

  // Écart-type d'une différence entre deux taux mesurés sur n duels chacun
  const bruit = (t, n) => Math.sqrt(2 * Math.max(t * (1 - t), 0.04) / n);
  const pts = x => (x >= 0 ? '+' : '−') + Math.abs(Math.round(x * 100)) + ' pts';
  // Enchantements de Classic 1.12 par emplacement, avec la statistique qu'ils apportent
  const ENCHANTS = {
    'Dos': [['agilite', 'Agilité +1 à +3'], ['armure', 'Armure +10 à +70']],
    'Torse': [['endurance', 'Statistiques +1 à +4'], ['endurance', 'PV +25 à +100']],
    'Poignets': [['force', 'Force +1 à +9'], ['endurance', 'Endurance +1 à +9'], ['intelligence', 'Intelligence +3 à +7']],
    'Mains': [['agilite', 'Agilité +5 à +15'], ['force', 'Force +5 à +7']],
    'Pieds': [['agilite', 'Agilité +1 à +7'], ['endurance', 'Endurance +1 à +7']],
    'Arme': [['pa', 'Impact, +3 à +9 dégâts'], ['intelligence', 'Intelligence +3 à +9']]
  };

  function rendreConseil(p, cible, r) {
    const [classe, specId] = cible.split('.');
    const a = D.ADVERSAIRES[classe], sp = a.specs.find(x => x.id === specId);
    const nomAdv = `${a.nom.toLowerCase()} ${nomSpecCourt(sp)}`;
    const av = r.actuel, ap = r.meilleur;
    const nc = r.n.confirme, ns = r.n.stats;
    const gainT = ap.taux - av.taux;
    const netT = ap.confirme && gainT > 2 * bruit(av.taux, nc);
    $('conseil-etat').textContent = `${fmt(r.duels)} duels contre ${nomAdv}`;

    // Bilan en quatre cases
    const caseB = (k, v, t, cls) => el('div', { class: cls || '' }, el('span', { class: 'etiquette', text: k }), el('b', { text: v }), el('small', { text: t }));
    const eq = r.ref.taux >= 0.5
      ? caseB('Équipement', 'Déjà favori', `${pc(r.ref.taux)} avec les talents retenus : chaque statistique ajoute de la marge.`)
      : r.seuil && r.seuil.atteint
        ? caseB('Équipement', `+${fmt(r.seuil.quantite)}${r.seuil.unite} ${r.seuil.nom}`, 'environ, pour passer 50 % de victoires avec les talents retenus')
        : r.seuil
          ? caseB('Équipement', `> +${fmt(r.seuil.max)}${r.seuil.unite} ${r.seuil.nom}`, 'ne suffit pas pour passer 50 % : l\'écart vient du niveau de l\'adversaire et des réglages, pas d\'une pièce')
          : caseB('Équipement', '–', 'aucune statistique ne fait bouger ce duel de façon nette');
    const bilan = el('div', { class: 'bilan' },
      caseB('Aujourd\'hui', pc(av.taux), `de victoires en ${nomF(av.forme)}, vos talents, ${nc} duels`),
      ap.ecarts.length
        ? caseB('Talents proposés', `${pc(ap.taux)}`, `en ${nomF(ap.forme)}, ${pts(gainT)} ${netT ? '(écart net)' : '(dans le bruit)'}`)
        : caseB('Talents proposés', 'Les vôtres', `aucun build testé ne fait mieux ; jouez en ${nomF(av.forme)}`),
      eq,
      caseB('Héritage', 'Hors simulation', 'ni lisible dans l\'armurerie, ni de statistiques à simuler : voir la liste'));

    // --- Talents
    const builds = el('table', { class: 'mini' },
      el('thead', null, el('tr', null, el('th', { text: `Build (${r.n.crible} duels)` }), el('th', { class: 'n', text: 'Ours' }), el('th', { class: 'n', text: 'Félin' }))),
      el('tbody', null, ...r.builds.map((b, i) => el('tr', { class: i === 0 ? 'retenu' : '' },
        el('td', { text: b.nom }), ...FORMES_C.map(f => el('td', { class: 'n', text: pc(b.res[f].taux) + (b.res[f].nul >= 0.2 ? ` · ${pc(b.res[f].nul)} nuls` : '') }))))));
    const ecarts = ap.ecarts.length ? el('ul', { class: 'ecarts' }, ...ap.ecarts.map(e => el('li', { class: e.apres > e.avant ? 'plus' : 'moins' },
      el('span', { class: 'sg', text: e.apres > e.avant ? '+' : '−' }),
      el('span', { text: e.nom + (M.TALENTS[e.id] && !M.TALENTS[e.id].sim ? ' (sans effet en duel)' : '') }),
      el('span', { class: 'rg', text: `${e.avant} → ${e.apres}` })))) : null;
    const essayer = ap.ecarts.length ? el('button', { type: 'button', class: 'btn', text: 'Essayer dans le simulateur' }) : null;
    if (essayer) essayer.addEventListener('click', () => essayerBuild(p, ap.points, ap.forme, classe, specId));
    const carteT = el('section', { class: 'carte' },
      el('header', null, el('img', { src: 'icones/spell_nature_resistnature.jpg', alt: '' }), el('h3', { text: 'Talents' }),
        ap.ecarts.length ? el('span', { class: 'pastille ' + (netT ? 'bon' : 'moyen'), text: pts(gainT) }) : null),
      el('p', { text: ap.ecarts.length
        ? `${ap.nom} : ${pc(av.taux)} → ${pc(ap.taux)} en ${nomF(ap.forme)}, vérifié sur ${nc} duels neufs. ${netT ? 'L\'écart dépasse le bruit de la mesure.' : `Sous ±${Math.round(200 * bruit(av.taux, nc))} points, l'écart peut venir du hasard.`}`
        : `Aucun des builds testés ne bat le vôtre contre le ${nomAdv} une fois vérifié sur ${nc} duels neufs. Gardez vos talents et jouez en ${nomF(av.forme)}.` }),
      ecarts,
      r.echanges.length ? el('p', { class: 'discret', text: 'Échanges d\'un point gardés : ' + r.echanges.map(e => `${M.TALENTS[e.de].nom} → ${M.TALENTS[e.vers].nom}`).join(', ') + '.' }) : null,
      el('h4', { text: 'Builds essayés, mêmes tirages' }),
      el('div', { class: 'tableau' }, builds),
      el('p', { class: 'discret', text: `Préréglages du niveau 60 ramenés à ${r.plafond} points, arbre principal d'abord.` }),
      essayer);

    // --- Équipement
    const maxG = Math.max(0.01, ...r.stats.map(s => s.gain));
    const nb = bruit(r.ref.taux, ns);
    const poids = el('ul', { class: 'poids' }, ...r.stats.map(s => {
      const dansBruit = Math.abs(s.gain) < 2 * nb;
      return el('li', { class: dansBruit ? 'bruit' : '' },
        el('span', { text: `+${s.dose}${s.unite} ${s.nom}` }),
        el('span', { class: 'jauge-p' }, el('i', { class: dansBruit ? 'bruit' : '', style: `width:${Math.max(0, s.gain) / maxG * 100}%` })),
        el('span', { class: 'v', text: pts(s.gain) }));
    }));
    const top = r.stats.filter(s => s.gain > 0).slice(0, 3).map(s => s.stat);
    const pf = C.pointsFaibles(p);
    const enchants = pf.sansEnchant.filter(e => ENCHANTS[e]).map(e => {
      const opts = ENCHANTS[e].filter(([st]) => top.includes(st));
      return opts.length ? `${e} : ${opts.map(o => o[1]).join(' ou ')}` : null;
    }).filter(Boolean);
    const seuilTexte = r.ref.taux >= 0.5 ? `Avec les talents retenus, ${p.nom} gagne déjà ${pc(r.ref.taux)} de ces duels.`
      : r.seuil && r.seuil.atteint ? `Il faut environ +${fmt(r.seuil.quantite)}${r.seuil.unite} ${r.seuil.nom} pour passer 50 % de victoires (recherche par dichotomie, ${ns} duels par essai).`
      : r.seuil ? `Même +${fmt(r.seuil.max)}${r.seuil.unite} ${r.seuil.nom} ne fait pas passer 50 % : ce duel ne se gagne pas avec une pièce d'équipement.` : '';
    const carteE = el('section', { class: 'carte' },
      el('header', null, el('img', { src: 'icones/inv_gauntlets_04.jpg', alt: '' }), el('h3', { text: 'Équipement' })),
      el('p', { text: `Victoires gagnées avec une dose de chaque statistique, talents retenus, en ${nomF(ap.forme)} (${ns} duels par ligne, même tirage, ${pc(r.ref.taux)} au départ). En gris, l'écart reste sous ±${Math.round(200 * nb)} points.` }),
      poids,
      seuilTexte ? el('p', null, el('b', { text: seuilTexte })) : null,
      pf.faibles.length ? el('h4', { text: 'Pièces à remplacer d\'abord' }) : null,
      pf.faibles.length ? el('ul', { class: 'faibles' }, ...pf.faibles.map(o => el('li', null,
        o.icone ? el('img', { src: o.icone, alt: '' }) : el('span'),
        el('span', null, `${o.emplacement} · ${o.nom}`, el('small', { text: o.raisons.join(', ') }))))) : null,
      pf.vides.length ? el('p', { class: 'discret', text: `Emplacements vides : ${pf.vides.join(', ')}.` }) : null,
      pf.sansEnchant.length ? el('h4', { text: 'Enchantements' }) : null,
      pf.sansEnchant.length ? el('p', { text: `Sans enchantement : ${pf.sansEnchant.join(', ')}.` }) : null,
      enchants.length ? el('ul', null, ...enchants.map(t => el('li', { text: t }))) : null,
      enchants.length ? el('p', { class: 'discret', text: 'Valeurs de Classic 1.12, à vérifier en jeu : les rangs élevés demandent un niveau d\'objet suffisant.' }) : null);

    // --- Héritage
    const carteH = el('section', { class: 'carte' },
      el('header', null, el('img', { src: 'icones/inv_relics_idolofrejuvenation.jpg', alt: '' }), el('h3', { text: 'Points d\'héritage' })),
      el('p', { text: 'L\'armurerie ne montre pas les points d\'héritage du compte, et aucun talent d\'héritage ne change les PV, l\'armure, les dégâts ou le mana : le simulateur ne peut pas les compter. Jusqu\'à 16 points par personnage, répartis en trois branches (Professions, Aventure, Ingéniosité). Autour d\'un duel, voici ce qui compte :' }),
      el('ul', { class: 'heritage' }, ...C.HERITAGE.map(h => {
        const ici = h.contre && h.contre.includes(classe);
        return el('li', { class: ici ? 'utile' : h.neutre ? 'neutre' : '' },
          el('span', null, el('b', { text: h.nom }), ` · ${h.branche}, ${h.rangs} rangs`),
          el('small', { text: h.effet }),
          el('small', { text: (ici ? 'Utile ici. ' : '') + h.utile }));
      })),
      el('p', { class: 'discret', text: 'Effets relevés dans des guides de la communauté, pas dans les notes officielles.' }),
      el('div', { class: 'liens' }, ...C.SOURCES_HERITAGE.map(s => el('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.nom }))));

    $('conseil-res').replaceChildren(bilan, el('div', { class: 'cartes3' }, carteT, carteE, carteH));
  }

  // ---------------------------------------------------------------- guide
  let matriceObsolete = true, matriceRes = null, matriceJeton = 0;
  function lancerMatrice() {
    if (!matriceObsolete) return;
    matriceObsolete = false;
    const jt = ++matriceJeton;
    matriceRes = {};
    const taches = [];
    for (const l of lignesMatrice()) for (const f of ['ours', 'felin']) taches.push([l, f]);
    let i = 0;
    rendreMatrice();
    const suite = () => {
      if (jt !== matriceJeton) return;
      const [l, f] = taches[i];
      const r = M.simulerSerie(config({ adversaire: l.classe, specAdv: l.spec.id, forme: f, graine: 5 }), 100);
      (matriceRes[l.cle] = matriceRes[l.cle] || {})[f] = r;
      i++;
      rendreMatrice();
      if (i < taches.length) setTimeout(suite, 0);
    };
    setTimeout(suite, 0);
  }
  // Une ligne par spécialisation adverse
  function lignesMatrice() {
    const l = [];
    for (const [classe, a] of Object.entries(D.ADVERSAIRES)) for (const sp of a.specs) l.push({ classe, spec: sp, cle: classe + '.' + sp.id });
    return l;
  }
  function rendreMatrice() {
    const lignes = lignesMatrice();
    const fini = lignes.every(l => matriceRes && matriceRes[l.cle] && matriceRes[l.cle].felin);
    $('matrice-etat').textContent = fini ? '' : 'calcul en cours…';
    const cell = (a, f) => {
      const r = matriceRes && matriceRes[a] && matriceRes[a][f];
      if (!r) return el('td', { class: 'cellule discret', text: '…' });
      const autreF = f === 'ours' ? 'felin' : 'ours';
      const o = matriceRes[a][autreF];
      const best = o && meilleureForme({ [f]: r, [autreF]: o }) === f;
      return el('td', { class: 'cellule' + (best ? ' conseil' : '') }, pc(r.tauxVictoire), r.tauxNul > 0.1 ? el('small', { text: ` · ${pc(r.tauxNul)} nuls` }) : null);
    };
    $('matrice').replaceChildren(
      el('thead', null, el('tr', null, el('th', { text: 'Adversaire' }), el('th', { text: 'Spécialisation' }), el('th', { class: 'n', text: 'Ours' }), el('th', { class: 'n', text: 'Félin' }), el('th', { text: 'Guide' }))),
      el('tbody', null, ...lignes.map(l => {
        const d = D.ADVERSAIRES[l.classe];
        const premiere = d.specs[0] === l.spec;
        return el('tr', { class: premiere ? 'debut-classe' : null },
          el('td', null, premiere ? el('b', { text: d.nom }) : null),
          el('td', { class: 'discret', text: nomSpecCourt(l.spec) }),
          cell(l.cle, 'ours'), cell(l.cle, 'felin'),
          el('td', { text: NOMS_FORME[l.spec.conseilForme || G.GUIDE[l.classe].forme] }));
      }))
    );
  }
  function rendreGuide() {
    const id = etat.guideAdv || etat.adversaire;
    $('guide-chips').replaceChildren(...Object.entries(D.ADVERSAIRES).map(([k, a]) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(k === id) }, el('img', { src: I.classe(k), alt: '' }), a.nom);
      b.addEventListener('click', () => { etat.guideAdv = k; rendreGuide(); });
      return b;
    }));
    const g = G.GUIDE[id], a = D.ADVERSAIRES[id];
    const liste = (tag, items) => el(tag, null, ...items.map(t => el('li', { text: t })));
    const sec = (titre, contenu) => el('section', null, el('h3', { text: titre }), contenu);
    const voir = el('button', { type: 'button', class: 'btn', text: `Simuler contre le ${a.nom.toLowerCase()} ${nomSpecCourt(specDe(id))}` });
    voir.addEventListener('click', () => { etat.adversaire = id; memo.ecrire('adversaire', id); rendreAdversaires(); ouvrirOnglet('simulateur'); lancerComparaison(); });
    $('guide-detail').replaceChildren(
      el('div', { class: 'titre-forme' },
        el('h2', { text: a.nom }),
        el('span', { class: 'pastille moyen', style: 'color:var(--accent)', text: `Forme conseillée : ${NOMS_FORME[g.forme].toLowerCase()}` }),
        el('span', { class: 'discret', text: a.categorie })),
      el('p', { class: 'prose', text: g.pourquoi }),
      el('p', { class: 'prose discret', text: 'Outils communs à la classe : ' + a.resume }),
      el('section', { class: 'specs-guide' },
        el('h3', { text: a.specs.length > 1 ? 'Spécialisations jouées en duel' : 'Spécialisation jouée en duel' }),
        el('div', { class: 'specs-liste' }, ...a.specs.map(sp => {
          const choisir = el('button', { type: 'button', class: 'puce', text: 'Simuler celle-ci' });
          choisir.addEventListener('click', () => { choisirSpec(id, sp.id); etat.adversaire = id; memo.ecrire('adversaire', id); rendreAdversaires(); ouvrirOnglet('simulateur'); lancerComparaison(); });
          return el('article', { class: 'spec-carte' + (sp.id === specDe(id).id ? ' choisie' : '') },
            el('h4', { text: sp.nom }),
            el('p', { class: 'spec-meta', text: sp.meta }),
            el('p', { class: 'discret', text: sp.resume }),
            liste('ul', (G.CONSEILS_SPECS[id] && G.CONSEILS_SPECS[id][sp.id]) || []),
            choisir);
        }))),
      el('div', { class: 'colonnes' },
        sec('Ouverture', liste('ol', g.ouverture)),
        sec('Rotation', liste('ul', g.rotation)),
        sec('Sortir du combat pour se soigner', liste('ul', g.soin)),
        sec('Pièges', liste('ul', g.pieges))),
      el('div', { class: 'actions' }, voir)
    );
    $('comparaison').replaceChildren(
      el('thead', null, el('tr', null, el('th', { text: '' }), el('th', { text: 'Ours' }), el('th', { text: 'Félin' }))),
      el('tbody', null, ...G.COMPARAISON_FORMES.map(c => el('tr', null, el('td', null, el('b', { text: c.critere })), el('td', { text: c.ours }), el('td', { text: c.felin }))))
    );
  }

  // -------------------------------------------------------------- talents
  function essaiTalent(id, delta) {
    const t = M.TALENTS[id];
    const n = (etat.talents[id] || 0) + delta;
    if (n < 0 || n > t.max) return false;
    const cand = Object.assign({}, etat.talents, { [id]: n });
    if (!n) delete cand[id];
    const v = M.verifierTalents(cand, plafondTalents());
    if (!v.ok) return false;
    etat.talents = cand;
    memo.ecrire('talents', etat.talents);
    return true;
  }
  function rendreTalents() {
    const plafond = plafondTalents();
    const v = M.verifierTalents(etat.talents, plafond);
    $('compteur').textContent = `${v.total} / ${plafond}`;
    $('compteur').classList.toggle('trop', v.total > plafond);
    $('talents-erreurs').replaceChildren(...v.erreurs.map(e => el('span', { text: e })));
    $('arbres').replaceChildren(...D.ARBRES.map(arbre => {
      const depense = v.parArbre[arbre.id] || 0;
      const cases = el('div', { class: 'cases' });
      for (let palier = 1; palier <= 7; palier++) {
        for (let col = 1; col <= 4; col++) {
          const t = arbre.talents.find(x => x.palier === palier && x.col === col);
          if (!t) { cases.append(el('div', { 'aria-hidden': 'true' })); continue; }
          const rg = etat.talents[t.id] || 0;
          const dispo = depense >= (palier - 1) * 5 && (!t.requis || (etat.talents[t.requis] || 0) > 0);
          const b = el('button', {
            type: 'button', class: 'talent' + (dispo ? ' dispo' : '') + (rg ? ' pris' : '') + (rg === t.max ? ' max' : ''),
            'aria-label': `${t.nom}, ${rg} sur ${t.max}`, 'aria-current': String(etat.talentSel === t.id), title: t.desc
          }, t.nom, el('span', { class: 'rg', text: `${rg}/${t.max}` }), t.sim ? el('span', { class: 'sim', title: 'Pris en compte par le simulateur' }) : null,
            t.nouveau || t.change ? el('span', { class: 'neuf', title: t.nouveau ? 'Nouveau dans Forever' : 'Modifié dans Forever', text: t.nouveau ? 'N' : 'M' }) : null);
          b.addEventListener('click', ev => { etat.talentSel = t.id; essaiTalent(t.id, ev.shiftKey ? -1 : 1); apresTalent(); });
          b.addEventListener('contextmenu', ev => { ev.preventDefault(); etat.talentSel = t.id; essaiTalent(t.id, -1); apresTalent(); });
          cases.append(b);
        }
      }
      return el('div', { class: 'arbre' }, el('header', null, el('h3', { text: arbre.nom }), el('span', { class: 'num', text: String(depense) })), cases);
    }));
    rendreFiche();
  }
  function rendreFiche() {
    const id = etat.talentSel;
    if (!id) { $('fiche').replaceChildren(el('p', { class: 'discret', text: 'Touchez un talent pour voir sa description.' })); return; }
    const t = M.TALENTS[id];
    const rg = etat.talents[id] || 0;
    const moins = el('button', { type: 'button', class: 'btn', 'aria-label': 'Retirer un point', text: '−' });
    const plus = el('button', { type: 'button', class: 'btn', 'aria-label': 'Ajouter un point', text: '+' });
    moins.addEventListener('click', () => { essaiTalent(id, -1); apresTalent(); });
    plus.addEventListener('click', () => { essaiTalent(id, 1); apresTalent(); });
    $('fiche').replaceChildren(
      el('div', { class: 'titre-forme' }, el('h3', { text: t.nom }), el('span', { class: 'num', text: `${rg} / ${t.max}` }),
        t.nouveau || t.change ? el('span', { class: 'pastille moyen', style: 'color:var(--accent)', text: t.nouveau ? 'Nouveau dans Forever' : 'Modifié dans Forever' }) : null,
        el('span', { class: 'discret', text: t.sim ? 'Pris en compte par le simulateur' : 'Sans effet dans le simulateur' })),
      el('p', { class: 'prose', text: t.desc }),
      el('div', { class: 'ctrl' }, moins, plus)
    );
  }
  function apresTalent() { rendreTalents(); changementProfil(); }
  $('talents-vider').addEventListener('click', () => { etat.talents = {}; memo.ecrire('talents', etat.talents); apresTalent(); });

  // ------------------------------------------------------- mécaniques
  const NOMS_FIAB = { sur: 'Sûr', divergent: 'Divergent', suppose: 'Supposé' };
  function rendreChangements() {
    $('changements').replaceChildren(
      el('thead', null, el('tr', null, ...['Sujet', 'Classic 1.12', 'Forever', 'Fiabilité', 'Note'].map(t => el('th', { text: t })))),
      el('tbody', null, ...D.CHANGEMENTS_FOREVER.map(c => el('tr', null,
        el('td', null, el('b', { text: c.sujet })), el('td', { text: c.avant }), el('td', { text: c.apres }),
        el('td', null, el('span', { class: 'fiab ' + c.fiab, text: NOMS_FIAB[c.fiab] || c.fiab })),
        el('td', { class: 'discret', text: c.note || '' }))))
    );
    $('sources').replaceChildren(...D.SOURCES.map(src => el('li', null, el('a', { href: src.url, target: '_blank', rel: 'noopener', text: src.nom }))));
  }

  // ----------------------------------------------------------- démarrage
  remplirSelects();
  rendreStats();
  rendreProfil();
  rendrePersoCharge();
  rendreAdversaires();
  rendreChangements();
  ouvrirOnglet(location.hash.slice(1) || 'simulateur', true);
  lancerComparaison();
})();
