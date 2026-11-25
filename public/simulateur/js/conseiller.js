/*
 * Conseiller : cherche ce qui ferait gagner un druide de l'armurerie contre un adversaire donné.
 *  - talents : préréglages ramenés au plafond du niveau, puis échanges de points un par un ;
 *  - équipement : gain simulé de chaque statistique, quantité nécessaire pour passer 50 % ;
 *  - points faibles de l'équipement lus dans la fiche (niveau d'objet, qualité, enchantements).
 * Le calcul est un générateur : l'interface l'avance par tranches, les tests d'une traite.
 * Utilisable dans le navigateur (window.Conseiller) et dans Node (require).
 */
(function (racine) {
  'use strict';

  const D = racine.DONNEES || (typeof require !== 'undefined' ? require('./donnees.js') : null);
  const M = racine.Moteur || (typeof require !== 'undefined' ? require('./moteur.js') : null);

  const FORMES = ['ours', 'felin'];
  const ORDRE = [];             // talents dans l'ordre des arbres, palier par palier
  for (const a of D.ARBRES) for (const t of a.talents.slice().sort((x, y) => x.palier - y.palier || x.col - y.col)) ORDRE.push(Object.assign({ arbre: a.id }, t));
  const TALENT = Object.fromEntries(ORDRE.map(t => [t.id, t]));

  // Gain d'une « dose » de chaque statistique, de l'ordre d'un objet ou d'un enchantement
  const DOSES = [
    { stat: 'agilite', dose: 15, nom: 'Agilité', unite: '' },
    { stat: 'force', dose: 15, nom: 'Force', unite: '' },
    { stat: 'endurance', dose: 15, nom: 'Endurance', unite: '' },
    { stat: 'pa', dose: 30, nom: 'Puissance d\'attaque', unite: '' },
    { stat: 'armure', dose: 150, nom: 'Armure', unite: '' },
    { stat: 'crit', dose: 1, nom: 'Critique', unite: ' %' },
    { stat: 'toucher', dose: 1, nom: 'Toucher', unite: ' %' },
    { stat: 'intelligence', dose: 15, nom: 'Intelligence', unite: '' }
  ];

  const total = pts => Object.values(pts).reduce((s, v) => s + v, 0);
  const cle = pts => Object.keys(pts).filter(k => pts[k]).sort().map(k => k + pts[k]).join(',');
  const valide = (pts, plafond) => M.verifierTalents(pts, plafond).ok;
  function avec(pts, id, delta) {
    const c = Object.assign({}, pts);
    c[id] = (c[id] || 0) + delta;
    if (c[id] <= 0) delete c[id];
    return c;
  }

  // Ramène un build au plafond : l'arbre principal d'abord, palier par palier, puis les autres.
  // Chaque point ajouté garde le build valide (paliers et prérequis).
  function tronquer(points, plafond) {
    const parArbre = {};
    for (const t of ORDRE) if (points[t.id]) parArbre[t.arbre] = (parArbre[t.arbre] || 0) + points[t.id];
    const arbres = Object.keys(parArbre).sort((a, b) => parArbre[b] - parArbre[a]);
    const res = {};
    let n = 0;
    for (const a of arbres) for (const t of ORDRE) {
      if (t.arbre !== a || !points[t.id]) continue;
      for (let r = 0; r < points[t.id] && n < plafond; r++) {
        const c = avec(res, t.id, 1);
        if (!valide(c, plafond)) break;
        Object.assign(res, c); n++;
      }
    }
    return res;
  }

  // Note d'une série : taux de victoire, départagé par l'écart de PV en fin de duel (moins bruité)
  function noter(r) {
    const marge = r.resumes.reduce((s, x) => s + x.pvDruide - x.pvAdv, 0) / r.resumes.length;
    return r.tauxVictoire + 0.5 * r.tauxNul + 0.25 * marge;
  }

  // Différence entre deux builds : [{id, nom, avant, apres}]
  function ecarts(a, b) {
    return ORDRE.filter(t => (a[t.id] || 0) !== (b[t.id] || 0))
      .map(t => ({ id: t.id, nom: t.nom, arbre: t.arbre, avant: a[t.id] || 0, apres: b[t.id] || 0 }));
  }

  /*
   * base : config du duel sans talents ni forme ni graine (stats, base, niveau, adversaire, specAdv, réglages).
   * opts : { talents, plafond, graine, nCrible, nConfirme, nStats, maxEssais }.
   * Rend { builds, actuel, meilleur, echanges, stats, ref, seuil, duels, plafond }.
   * Le bruit d'une série de n duels est d'environ ±(100 / √n) points : 100 duels ±10, 300 duels ±6.
   */
  function* conseiller(base, opts) {
    const o = Object.assign({ graine: 11, nCrible: 100, nConfirme: 300, nStats: 200, maxEssais: 6 }, opts);
    const plafond = o.plafond;
    let duels = 0;
    const serie = (talents, forme, n, graine, stats) => {
      duels += n;
      return M.simulerSerie(Object.assign({}, base, { talents, forme, graine, stats: stats || base.stats }), n);
    };
    const prevu = 2 * (2 + D.PRESETS_TALENTS.length) * o.nCrible + o.maxEssais * o.nCrible + 4 * o.nConfirme + (DOSES.length + 5) * o.nStats;
    const etape = texte => ({ texte, duels, prevu });
    const nomF = f => (f === 'ours' ? 'ours' : 'félin');

    // 1. Builds candidats dans les deux formes, mêmes graines pour tous :
    //    vos talents, vos talents sans les points perdus en duel, les préréglages ramenés au plafond
    const actuel = Object.assign({}, o.talents);
    const cands = [{ id: 'actuel', nom: 'Vos talents', points: actuel }];
    const utiles = Object.fromEntries(Object.entries(actuel).filter(([id]) => TALENT[id] && TALENT[id].sim));
    const tronques = D.PRESETS_TALENTS.map(p => ({ id: p.id, nom: p.nom.split(' (')[0], points: tronquer(p.points, plafond) }));
    if (total(utiles) < total(actuel) && tronques.length) {
      // On complète avec l'ordre du préréglage le plus proche
      const proche = tronques.slice().sort((a, b) => ecarts(utiles, b.points).length - ecarts(utiles, a.points).length)[0];
      cands.push({ id: 'reaffecte', nom: 'Vos talents, points réaffectés', points: completer(utiles, D.PRESETS_TALENTS.find(p => p.id === proche.id).points, plafond) });
    }
    cands.push(...tronques);
    const vus = new Set();
    const builds = [];
    for (const c of cands) {
      const k = cle(c.points);
      if (vus.has(k)) continue;
      vus.add(k);
      c.res = {};
      for (const f of FORMES) {
        yield etape(`Talents : ${c.nom}, ${nomF(f)}`);
        const r = serie(c.points, f, o.nCrible, o.graine);
        c.res[f] = { taux: r.tauxVictoire, nul: r.tauxNul, note: noter(r) };
      }
      c.forme = c.res.felin.note >= c.res.ours.note ? 'felin' : 'ours';
      c.note = c.res[c.forme].note;
      builds.push(c);
    }
    builds.sort((a, b) => b.note - a.note);

    // 2. Échanges d'un point à partir du meilleur build : on retire d'un talent sans effet en duel
    //    ou absent des préréglages, on ajoute à un talent simulé que les préréglages prennent
    const tete = builds[0];
    let points = tete.points, note = tete.note;
    const forme = tete.forme;
    const freq = {};
    for (const p of D.PRESETS_TALENTS) for (const id in p.points) freq[id] = (freq[id] || 0) + 1;
    const sources = ORDRE.filter(t => points[t.id] && (!t.sim || !freq[t.id])).map(t => t.id);
    const cibles = ORDRE.filter(t => t.sim && freq[t.id] && (points[t.id] || 0) < t.max)
      .sort((a, b) => freq[b.id] - freq[a.id] || b.palier - a.palier).map(t => t.id);
    const echanges = [];
    let essais = 0;
    for (const de of sources) for (const vers of cibles) {
      if (essais >= o.maxEssais || !points[de] || (points[vers] || 0) >= TALENT[vers].max) continue;
      const c = avec(avec(points, de, -1), vers, 1);
      if (!valide(c, plafond)) continue;
      essais++;
      yield etape(`Essai : ${TALENT[de].nom} → ${TALENT[vers].nom}`);
      const n2 = noter(serie(c, forme, o.nCrible, o.graine));
      if (n2 > note) { echanges.push({ de, vers, gain: n2 - note }); points = c; note = n2; }
    }
    const retenu = echanges.length ? { id: 'ajuste', nom: tete.nom + ', ajusté', points, forme, note } : tete;

    // 3. Confirmation sur des duels neufs : vos talents et le meilleur candidat, dans les deux formes.
    //    Si l'écart ne tient pas, on garde vos talents.
    const g2 = o.graine + 1000;
    const confirmer = function* (pts, nom) {
      const res = {};
      for (const f of FORMES) {
        yield etape(`Confirmation : ${nom}, ${nomF(f)}`);
        const r = serie(pts, f, o.nConfirme, g2);
        res[f] = { taux: r.tauxVictoire, nul: r.tauxNul, note: noter(r), duree: r.dureeMoyenne };
      }
      const fm = res.felin.note >= res.ours.note ? 'felin' : 'ours';
      return { points: pts, res, forme: fm, taux: res[fm].taux, note: res[fm].note };
    };
    const conf0 = yield* confirmer(actuel, 'vos talents');
    const conf1 = cle(retenu.points) === cle(actuel) ? conf0 : yield* confirmer(retenu.points, retenu.nom.toLowerCase());
    const meilleur = conf1.note >= conf0.note ? conf1 : conf0;
    meilleur.nom = meilleur === conf0 ? 'Vos talents' : retenu.nom;
    meilleur.ecarts = ecarts(actuel, meilleur.points);
    meilleur.confirme = conf1 !== conf0 && meilleur === conf1;
    const candidat = conf1 === conf0 ? null : conf1;

    // 4. Statistiques : une dose de chaque, avec les meilleurs talents et la meilleure forme
    const g3 = o.graine + 2000;
    yield etape('Statistiques : référence');
    const ref = serie(meilleur.points, meilleur.forme, o.nStats, g3);
    const avecStat = (stat, q) => Object.assign({}, base.stats, { [stat]: (base.stats[stat] || 0) + q });
    const stats = [];
    for (const d of DOSES) {
      yield etape(`Statistiques : +${d.dose}${d.unite} ${d.nom}`);
      const r = serie(meilleur.points, meilleur.forme, o.nStats, g3, avecStat(d.stat, d.dose));
      stats.push(Object.assign({}, d, { taux: r.tauxVictoire, gain: r.tauxVictoire - ref.tauxVictoire, gainNote: noter(r) - noter(ref) }));
    }
    stats.sort((a, b) => b.gainNote - a.gainNote);

    // 5. Combien de la meilleure statistique pour passer 50 % ? (dichotomie, 6 doses au plus)
    let seuil = null;
    const top = stats[0];
    if (ref.tauxVictoire < 0.5 && top && top.gainNote > 0) {
      const taux = k => serie(meilleur.points, meilleur.forme, o.nStats, g3, avecStat(top.stat, k * top.dose)).tauxVictoire;
      yield etape(`Seuil : ${top.nom}`);
      if (taux(6) < 0.5) seuil = { stat: top.stat, nom: top.nom, unite: top.unite, atteint: false, max: 6 * top.dose };
      else {
        let bas = 0, haut = 6;
        while (haut - bas > 1) {
          const mi = Math.round((bas + haut) / 2);
          yield etape(`Seuil : +${mi * top.dose}${top.unite} ${top.nom}`);
          if (taux(mi) >= 0.5) haut = mi; else bas = mi;
        }
        seuil = { stat: top.stat, nom: top.nom, unite: top.unite, atteint: true, quantite: haut * top.dose };
      }
    }

    return { builds, actuel: conf0, candidat, meilleur, echanges, stats, ref: { taux: ref.tauxVictoire, n: o.nStats }, seuil, duels, plafond, n: { crible: o.nCrible, confirme: o.nConfirme, stats: o.nStats } };
  }

  // Complète un build jusqu'au plafond en suivant l'ordre d'un préréglage (arbre principal d'abord)
  function completer(points, modele, plafond) {
    const res = Object.assign({}, points);
    const parArbre = {};
    for (const t of ORDRE) if (modele[t.id]) parArbre[t.arbre] = (parArbre[t.arbre] || 0) + modele[t.id];
    const arbres = Object.keys(parArbre).sort((a, b) => parArbre[b] - parArbre[a]);
    for (const a of arbres) for (const t of ORDRE) {
      if (t.arbre !== a || !modele[t.id]) continue;
      while ((res[t.id] || 0) < modele[t.id] && total(res) < plafond) {
        const c = avec(res, t.id, 1);
        if (!valide(c, plafond)) break;
        Object.assign(res, c);
      }
    }
    return res;
  }

  // Fait tourner le générateur d'une traite (tests, Node)
  function conseillerSync(base, opts) {
    const it = conseiller(base, opts);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }

  // Points faibles de l'équipement d'un personnage de l'armurerie, sans simulation
  const ENCHANTABLES = ['Tête', 'Épaules', 'Dos', 'Torse', 'Poignets', 'Mains', 'Jambes', 'Pieds', 'Arme'];
  const ATTENDUS = ['Tête', 'Cou', 'Épaules', 'Dos', 'Torse', 'Poignets', 'Mains', 'Taille', 'Jambes', 'Pieds', 'Doigt', 'Bijou', 'Arme'];
  const RANG_QUALITE = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5 };
  function pointsFaibles(p) {
    const eq = p.equipement || [];
    const vides = ATTENDUS.filter(e => !eq.some(o => o.emplacement === e));
    if (eq.filter(o => o.emplacement === 'Doigt').length < 2 && !vides.includes('Doigt')) vides.push('Doigt (second)');
    if (eq.filter(o => o.emplacement === 'Bijou').length < 2 && !vides.includes('Bijou')) vides.push('Bijou (second)');
    if (!eq.some(o => /relique|idole/i.test(o.emplacement))) vides.push('Relique');
    const n = p.niveau;
    const objets = eq.map(o => {
      const raisons = [];
      if (o.ilvl && o.ilvl <= n - 8) raisons.push(`niveau d'objet ${o.ilvl}, ${n - o.ilvl} sous votre niveau`);
      if ((RANG_QUALITE[o.qualite] ?? 2) < 2) raisons.push('qualité commune');
      if (!(o.stats && o.stats.length) && !o.arme) raisons.push('aucune statistique');
      const sansEnchant = ENCHANTABLES.includes(o.emplacement) && !o.enchantement;
      return { emplacement: o.emplacement, nom: o.nom, ilvl: o.ilvl, qualite: o.qualite, icone: o.icone, raisons, sansEnchant };
    });
    const faibles = objets.filter(o => o.raisons.length).sort((a, b) => b.raisons.length - a.raisons.length || a.ilvl - b.ilvl);
    const sansEnchant = objets.filter(o => o.sansEnchant).map(o => o.emplacement);
    return { faibles, sansEnchant, vides };
  }

  /*
   * Points d'héritage (Legacy) de WoW Forever. Aucun ne change les statistiques du personnage
   * et l'armurerie ne les expose pas : ils ne sont ni lus ni simulés, seulement signalés.
   */
  const HERITAGE = [
    { nom: 'High Alert', rangs: 2, branche: 'Aventure', effet: '+1 / +2 niveaux de détection du camouflage (voleur, druide). Sans effet en champ de bataille.', contre: ['voleur'], utile: 'Voit venir le voleur avant son ouverture.' },
    { nom: 'Gourmand', rangs: 3, branche: 'Aventure', effet: 'Buffs de nourriture prolongés de 33 / 67 / 100 %.', utile: 'Le buff de nourriture (Agilité, Endurance) tient entre deux duels.' },
    { nom: 'Permanence', rangs: 2, branche: 'Aventure', effet: 'Buffs de classe longs prolongés de 50 / 100 %. Demande Gourmand 3/3.', utile: 'Marque du fauve et Épines durent plus longtemps.' },
    { nom: 'Field Medicine', rangs: 2, branche: 'Aventure', effet: '« Récemment bandé » réduit de 5 / 10 s, hors instances.', utile: 'Bandage plus fréquent entre deux duels ; le simulateur n\'en utilise pas en duel.' },
    { nom: 'Talented', rangs: 5, branche: 'Ingéniosité', effet: 'Premier point de talent au niveau 9, puis jusqu\'au niveau 5. Demande Well Rested 5/5.', utile: 'Aucun effet au niveau 60, ni une fois le plafond de talents rattrapé.', neutre: true },
    { nom: 'Thrill of Adventure', rangs: 5, branche: 'Aventure', effet: '1 à 5 % des PV et du mana rendus à chaque coup fatal sur un ennemi non trivial.', utile: 'Un duel s\'arrête avant le coup fatal : sans effet.', neutre: true }
  ];
  const SOURCES_HERITAGE = [
    { nom: 'Space4Games, Legacy points', url: 'https://space4games.com/en/games-en/wow-forever-legacy-points/' },
    { nom: 'Sportskeeda, meilleurs talents d\'héritage', url: 'https://www.sportskeeda.com/mmo/best-legacy-points-talents-wow-forever' },
    { nom: 'Kami Labs, points d\'héritage', url: 'https://kami-labs.fr/en/wow-forever/points-d-heritage-wow-forever-alts/' },
    { nom: 'Overgear, Legacy system', url: 'https://overgear.com/guides/wow-forever/legacy-system/' },
    { nom: 'Conquest Capped, Legacy points', url: 'https://conquestcapped.com/guides/wow-forever/wow-forever-legacy-points/' }
  ];

  const Conseiller = { conseiller, conseillerSync, tronquer, completer, ecarts, noter, pointsFaibles, DOSES, HERITAGE, SOURCES_HERITAGE };
  racine.Conseiller = Conseiller;
  if (typeof module !== 'undefined' && module.exports) module.exports = Conseiller;
})(typeof window !== 'undefined' ? window : globalThis);
