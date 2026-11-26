/*
 * Simulateur toutes classes : un personnage de l'armurerie (GET /api/combattants) se compare
 * aux joueurs de son rang (± ECART niveaux), au joueur type de sa spécialisation, et se bat
 * en duel contre chaque spécialisation et contre les autres personnages. Moteur : js/arene.js.
 * Les séries de duels tournent par petits morceaux pour ne pas figer la page.
 */
(function () {
  'use strict';
  const A = window.Arene;
  const E = window.Equipement;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('fr-FR');
  const n1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pc = (x) => `${Math.round(x * 100)} %`;
  const classeTaux = (x) => (x >= 0.55 ? 'bon' : x >= 0.45 ? 'moyen' : 'mauvais');
  const rangTexte = (r) => (r === 1 ? '1er' : `${r}e`);

  const ECART = 3;        // « votre rang » : niveaux à ± 3
  const N_TYPES = 30;     // duels par spécialisation
  const N_JOUEURS = 40;   // duels contre chaque vrai joueur
  const N_RANG = 20;      // duels par spécialisation pour classer les autres joueurs
  const N_CONSEIL = 16;   // duels par spécialisation pour chaque variante (mêmes graines que la base)
  const GRAINE = 11;

  let persos = [];
  let jeton = 0;          // change à chaque nouveau personnage : les calculs en cours s'arrêtent
  let moi = null;
  let res = null;

  // ------------------------------------------------------------ outils
  const icone = (nom, alt) => (nom ? `<img src="icones/${esc(nom)}.jpg" alt="${esc(alt || '')}" width="20" height="20" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span></span>');
  const classeIcone = (classe) => (A.CLASSES[classe] ? A.CLASSES[classe].icone : null);
  const couleur = (classe) => (A.CLASSES[classe] ? A.CLASSES[classe].couleur : 'var(--muted)');
  const specNom = (p) => (p.specs || []).find((s) => s.id === p.spec)?.nom || (p.type ? '' : 'sans spécialisation');
  const nomClasse = (p) => (A.CLASSES[p.classe] ? A.CLASSES[p.classe].nom : p.classeNom || p.classe);
  const pause = () => new Promise((r) => setTimeout(r, 0));
  const moyenne = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

  // Joueur type de la classe et de la spécialisation du personnage, à son niveau
  function typeDe(p) {
    const st = A.SPECS_TYPES.find((x) => x.classe === p.classe && x.spec === p.spec)
      || A.SPECS_TYPES.find((x) => x.classe === p.classe);
    const spec = p.spec || st.spec;
    const nom = (p.specs || []).find((s) => s.id === spec)?.nom || st.nom;
    const t = A.profilType(p.classe, spec, p.niveau, nom, st.spec === spec ? st.mods : undefined);
    t.nom = `${A.CLASSES[p.classe].nom} ${nom} type`;
    return t;
  }

  function qui(p, opts = {}) {
    const portrait = p.portrait ? `<img src="${esc(p.portrait)}" alt="" width="24" height="24" loading="lazy">` : icone(classeIcone(p.classe));
    const lien = opts.lien && !p.type ? `<a class="nom" href="?perso=${encodeURIComponent(p.cle)}">${esc(p.nom)}</a>` : `<span class="nom">${esc(p.nom)}</span>`;
    return `<div class="qui"><span class="pastille" style="--cls:${couleur(p.classe)}"></span>${portrait}<div style="min-width:0">${lien}${opts.sous ? `<div class="discret" style="font-size:12px">${esc(opts.sous)}</div>` : ''}</div></div>`;
  }
  const barre = (x) => (x == null ? '<span class="attente">…</span>'
    : `<div class="${classeTaux(x)}" style="display:flex;gap:8px;align-items:center"><div class="barre" style="flex:1"><i style="width:${Math.round(x * 100)}%"></i></div><span class="taux num">${pc(x)}</span></div>`);

  // ------------------------------------------------------------ calculs par morceaux
  let fait = 0, total = 1;
  function avancer(k) {
    fait += k;
    $('barre').value = Math.min(1, fait / total);
    $('etat').textContent = fait >= total ? `${nf.format(total)} duels simulés.` : `Simulation : ${nf.format(fait)} / ${nf.format(total)} duels…`;
  }
  async function serie(j, a, b, n, graine) {
    await pause();
    if (j !== jeton) throw new Error('annulé');
    const r = A.serie(a, b, n, graine);
    avancer(n);
    return r;
  }

  // ------------------------------------------------------------ chargement
  function charger() {
    fetch('../api/combattants', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        persos = (d.personnages || []).filter((p) => p && A.CLASSES[p.classe] && p.niveau && p.stats && p.stats.pv > 0)
          .sort((a, b) => b.niveau - a.niveau || a.nom.localeCompare(b.nom, 'fr'));
        if (!persos.length) return message('Aucun personnage lisible dans l\'armurerie pour l\'instant. Ajoutez-en un sur <a href="/">la page de l\'armurerie</a> : il apparaît ici après sa première lecture.');
        $('choix').innerHTML = persos.map((p) => `<option value="${esc(p.cle)}">${esc(p.nom)} · ${esc(nomClasse(p))} ${esc(specNom(p))} · niv. ${p.niveau}</option>`).join('');
        const voulu = new URLSearchParams(location.search).get('perso');
        const p = persos.find((x) => x.cle === voulu) || persos[0];
        if (voulu && p.cle !== voulu) message(`Personnage « ${esc(voulu)} » introuvable ou pas encore lu : affichage de ${esc(p.nom)}.`, true);
        choisir(p);
      })
      .catch(() => message('Impossible de lire les personnages de l\'armurerie (GET /api/combattants). Réessayez dans un instant.'));
  }
  function message(html, garder) {
    $('message').innerHTML = html;
    $('message').hidden = false;
    if (!garder) $('contenu').hidden = true;
  }
  $('choix').addEventListener('change', () => {
    const p = persos.find((x) => x.cle === $('choix').value);
    if (!p) return;
    $('message').hidden = true;
    history.replaceState(null, '', `?perso=${encodeURIComponent(p.cle)}`);
    choisir(p);
  });

  // ------------------------------------------------------------ un personnage
  function choisir(p) {
    const j = ++jeton;
    moi = p;
    $('choix').value = p.cle;
    $('contenu').hidden = false;
    document.title = `${p.nom} · Simulateur · Armurerie Forever`;
    const pairs = persos.filter((q) => Math.abs(q.niveau - p.niveau) <= ECART);
    const autres = pairs.filter((q) => q.cle !== p.cle);
    const types = A.adversairesTypes(p.niveau);
    const ref = typeDe(p);
    const variantes = variantesDe(p);
    // Le même personnage rééquipé : meilleur hors donjon et suite épique de donjon
    const equip = E ? E.analyser(p) : null;
    const paliers = equip ? E.PALIERS.filter((x) => x.qualite).map((x) => ({ ...x, profil: E.profilPalier(p, x.id) })) : [];
    res = {
      pairs, autres, types, ref, variantes, equip, paliers,
      vsTypes: {}, vsJoueurs: {}, scores: {}, scoreRef: null, conseils: null, vsPaliers: {}, scoresPaliers: {},
    };

    fait = 0;
    total = types.length * N_TYPES * (1 + paliers.length) + autres.length * N_JOUEURS + (autres.length + 1) * types.length * N_RANG
      + (variantes.length + 1) * types.length * N_CONSEIL;
    avancer(0);

    afficherHeros();
    afficherEquipement();
    afficherFiche();
    afficherTypes();
    afficherJoueurs();
    afficherRang();
    afficherConseils();
    calculer(j).catch((e) => { if (e.message !== 'annulé') { console.error(e); $('etat').textContent = `Erreur de simulation : ${e.message}`; } });
  }

  async function calculer(j) {
    const { types, autres, ref, variantes } = res;
    // 1. Contre chaque spécialisation à votre niveau
    for (const t of types) {
      res.vsTypes[t.cle] = await serie(j, moi, t, N_TYPES, GRAINE);
      afficherTypes();
    }
    res.scores[moi.cle] = moyenne(types.map((t) => res.vsTypes[t.cle].taux));
    afficherHeros(); afficherRang(); afficherFiche();
    // 1 bis. Le même personnage rééquipé à chaque palier, mêmes adversaires et mêmes graines
    for (const pal of res.paliers) {
      const vs = res.vsPaliers[pal.id] = {};
      for (const t of types) {
        vs[t.cle] = await serie(j, pal.profil, t, N_TYPES, GRAINE);
        afficherTypes();
      }
      res.scoresPaliers[pal.id] = moyenne(types.map((t) => vs[t.cle].taux));
      afficherHeros(); afficherRang(); afficherFiche(); afficherEquipement(); afficherConseils();
    }
    // 2. Contre les vrais joueurs de votre rang
    for (const q of autres) {
      res.vsJoueurs[q.cle] = await serie(j, moi, q, N_JOUEURS, GRAINE);
      afficherJoueurs();
    }
    // 3. Classement : chacun contre les spécialisations de son propre niveau
    for (const q of [...autres, ref]) {
      const adv = q === ref ? types : A.adversairesTypes(q.niveau);
      const taux = [];
      for (const t of adv) taux.push((await serie(j, q, t, N_RANG, GRAINE)).taux);
      if (q === ref) { res.scoreRef = moyenne(taux); afficherFiche(); } else res.scores[q.cle] = moyenne(taux);
      afficherRang(); afficherHeros();
    }
    // 4. Conseils : mêmes graines pour la base et chaque variante, l'écart mesure la statistique
    const base = [];
    for (const t of types) base.push((await serie(j, moi, t, N_CONSEIL, GRAINE)).taux);
    const b = moyenne(base);
    const conseils = [];
    for (const v of variantes) {
      const taux = [];
      for (const t of types) taux.push((await serie(j, v.profil, t, N_CONSEIL, GRAINE)).taux);
      conseils.push({ ...v, base: b, taux: moyenne(taux), gain: moyenne(taux) - b });
      res.conseils = conseils.slice().sort((x, y) => y.gain - x.gain);
      afficherConseils();
    }
  }

  // Statistiques testées pour les conseils, selon la classe
  function variantesDe(p) {
    const s = p.stats;
    const melee = ['guerrier', 'paladin', 'voleur', 'chaman', 'druide', 'chasseur'].includes(p.classe);
    const sorts = ['paladin', 'pretre', 'chaman', 'mage', 'demoniste', 'druide'].includes(p.classe);
    const v = [];
    const ajouter = (nom, court, detail, mods, apres) => {
      const profil = A.variante(p, mods);
      if (apres) apres(profil.stats);
      v.push({ nom, court, detail, profil });
    };
    ajouter(`+${nf.format(Math.round(s.pv * 0.1))} points de vie`, 'des points de vie (Endurance)', 'Environ +10 % de PV, soit de l\'Endurance (10 PV par point).', { pv: 1.1 });
    if (melee || s.pa > 100) ajouter(`+${nf.format(Math.round(s.pa * 0.1))} puissance d'attaque`, 'la puissance d\'attaque', '+10 % de PA : Force, Agilité ou bonus d\'attaque de l\'équipement.', { pa: 1.1 }, (st) => {
      // Les dégâts d'arme de la fiche comprennent déjà la PA : on y ajoute la part du bonus (PA / 14 par seconde)
      const d = (st.pa - s.pa) / 14;
      if (st.arme) { st.arme.min += d * st.arme.vitesse; st.arme.max += d * st.arme.vitesse; }
      if (st.distance) { st.distance.min += d * st.distance.vitesse; st.distance.max += d * st.distance.vitesse; }
    });
    // En forme animale, les dégâts du druide ne dépendent pas de son arme
    if (melee && p.classe !== 'druide') ajouter('+10 % de dégâts d\'arme', 'une meilleure arme', 'Une meilleure arme, à vitesse égale.', { arme: 1.1 });
    if (sorts) {
      const plus = s.puissanceSorts > 0 ? Math.max(Math.round(s.puissanceSorts * 0.1), 5) : Math.max(5, Math.round(p.niveau * 0.4));
      ajouter(`+${nf.format(plus)} puissance des sorts`, 'la puissance des sorts', 'Bonus aux dégâts et aux soins des sorts.', {}, (st) => { st.puissanceSorts = (st.puissanceSorts || 0) + plus; });
    }
    ajouter('+2 % de critique', 'le critique', 'Chances de coup critique (Agilité, objets « Vous augmentez vos chances… »).', { critique: 2 });
    ajouter(`+${nf.format(Math.round(s.armure * 0.1))} armure`, 'l\'armure', '+10 % d\'armure : réduit les dégâts physiques subis.', { armure: 1.1 });
    return v;
  }

  // ------------------------------------------------------------ affichage
  function afficherHeros() {
    const p = moi;
    const score = res.scores[p.cle];
    const classement = classer();
    const ma = classement.findIndex((x) => x.p.cle === p.cle);
    const complet = classement.every((x) => x.score != null);
    const druide = p.classe === 'druide'
      ? `<a href="druide.html?perso=${encodeURIComponent(p.cle)}#armurerie">Simulateur détaillé druide farouche (formes, talents)</a>` : '';
    const h = $('heros');
    h.style.setProperty('--cls', couleur(p.classe));
    h.innerHTML = `
      <div class="portrait" style="${p.portrait ? `background-image:url('${esc(p.portrait)}')` : ''}" role="img" aria-label="Portrait de ${esc(p.nom)}"></div>
      <div style="min-width:0">
        <h2>${esc(p.nom)}</h2>
        <p class="sous">${esc(p.race || '')} ${esc(nomClasse(p))} · ${esc(specNom(p))} · niveau ${p.niveau}${p.ilvl ? ` · ilvl ${p.ilvl}` : ''}${p.guilde ? ` · ${esc(p.guilde)}` : ''}</p>
      </div>
      <div class="chiffres">
        <div class="chiffre"><b>${score == null ? '…' : pc(score)}</b><span>victoires${res.paliers.length ? ' · équipement porté' : ` contre les ${res.types.length} spés`}</span></div>
        ${res.paliers.map((pal) => { const x = res.scoresPaliers[pal.id]; return `<div class="chiffre palier"><b>${x == null ? '…' : pc(x)}</b><span>${esc(pal.nom.toLowerCase())}</span></div>`; }).join('')}
        <div class="chiffre"><b>${complet && classement.length > 1 ? `${rangTexte(ma + 1)}<small style="font-size:.9rem"> / ${classement.length}</small>` : classement.length > 1 ? '…' : '—'}</b><span>${classement.length > 1 ? `joueurs de niveau ${p.niveau - ECART} à ${p.niveau + ECART}` : 'seul de son rang'}</span></div>
        <div class="chiffre"><b>${res.scoreRef == null ? '…' : pc(res.scoreRef)}</b><span>${esc(nomClasse(p))} ${esc(specNom(res.ref))} type</span></div>
      </div>
      <div class="liens">${p.urlArmurerie ? `<a href="${esc(p.urlArmurerie)}" rel="noopener" target="_blank">Fiche Blizzard</a>` : ''}${druide}</div>`;
  }

  function classer() {
    return res.pairs.map((p) => ({ p, score: res.scores[p.cle] ?? null }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }

  function afficherRang() {
    const c = classer();
    $('intro-rang').textContent = c.length > 1
      ? `Les ${c.length} personnages de l'armurerie entre les niveaux ${moi.niveau - ECART} et ${moi.niveau + ECART}, classés par taux de victoire moyen contre les ${res.types.length} spécialisations jouées à leur propre niveau. Le joueur type de votre spécialisation sert de repère.`
      : `Aucun autre personnage de l'armurerie entre les niveaux ${moi.niveau - ECART} et ${moi.niveau + ECART} : vous êtes comparé au joueur type de votre spécialisation.`;
    const lignes = c.map((x, i) => `<tr class="${x.p.cle === moi.cle ? 'moi' : ''}">
        <td class="n">${x.score == null ? '' : i + 1}</td>
        <td>${qui(x.p, { lien: x.p.cle !== moi.cle, sous: `${nomClasse(x.p)} ${specNom(x.p)}` })}</td>
        <td class="n">${x.p.niveau}</td>
        <td class="n">${nf.format(x.p.stats.pv)}</td>
        <td style="min-width:150px">${barre(x.score)}</td></tr>`);
    // Repères (joueur type, vous rééquipé) : chacun s'insère à sa place, les lignes sans score à la fin
    const ref = res.ref;
    const reperes = [{ p: ref, score: res.scoreRef, sous: 'repère, équipement de donjon estimé', cls: 'reference' }]
      .concat(res.paliers.map((pal) => ({ p: { ...pal.profil, portrait: moi.portrait }, score: res.scoresPaliers[pal.id] ?? null, sous: `vous, ${pal.texte.split(' : ')[0]}`, cls: 'reference palier' })));
    const ligne = (r) => `<tr class="${r.cls}"><td class="n">·</td><td>${qui(r.p, { sous: r.sous })}</td><td class="n">${r.p.niveau}</td><td class="n">${nf.format(r.p.stats.pv)}</td><td style="min-width:150px">${barre(r.score)}</td></tr>`;
    const tout = c.map((x, i) => ({ score: x.score, html: lignes[i] }))
      .concat(reperes.map((r) => ({ score: r.score, html: ligne(r), repere: true })));
    // Tri stable : à score égal, le vrai joueur passe avant le repère
    tout.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.repere ? 1 : 0) - (b.repere ? 1 : 0));
    lignes.splice(0, lignes.length, ...tout.map((x) => x.html));
    $('t-rang').innerHTML = `<thead><tr><th class="n">Rang</th><th>Personnage</th><th class="n">Niv.</th><th class="n">PV</th><th>Victoires</th></tr></thead><tbody>${lignes.join('')}</tbody>`;
  }

  function afficherFiche() {
    const p = moi, t = res.ref, s = p.stats, ts = t.stats;
    const paliers = res.paliers;
    const dps = (st) => (st.arme && st.arme.vitesse ? (st.arme.min + st.arme.max) / 2 / st.arme.vitesse : 0);
    const lignes = [
      ['Points de vie', (st) => st.pv, nf.format],
      ['Mana', (st) => st.mana, nf.format, (st) => st.mana > 0],
      ['Puissance d\'attaque', (st) => st.pa, nf.format],
      ['Dégâts d\'arme par seconde', dps, (x) => n1.format(x)],
      ['Puissance des sorts', (st) => st.puissanceSorts, nf.format, (st) => st.puissanceSorts > 0 || ts.puissanceSorts > 0],
      ['Critique', (st) => st.critique, (x) => `${n1.format(x)} %`],
      ['Esquive', (st) => st.esquive, (x) => `${n1.format(x)} %`],
      ['Parade', (st) => st.parade, (x) => `${n1.format(x)} %`, (st) => st.parade > 0 || ts.parade > 0],
      ['Armure', (st) => st.armure, nf.format],
    ].filter((l) => !l[3] || l[3](s));
    const typeNom = t.nom.toLowerCase().replace(/ type$/, '');
    $('intro-fiche').textContent = paliers.length
      ? `Vos statistiques (fiche Blizzard, talents compris) avec votre équipement, puis avec le meilleur équipement hors donjon et la suite épique de donjon de votre niveau, face au ${typeNom} type. Les écarts sont donnés par rapport à l'équipement porté.`
      : `Vos statistiques (fiche Blizzard, talents compris) face au ${typeNom} type de niveau ${p.niveau}${res.pairs.length > 1 ? `, et votre place parmi les ${res.pairs.length} joueurs de votre rang` : ''}.`;
    const ecartTxt = (a, b) => {
      if (!b) return '';
      const e = (a - b) / b;
      const cls = Math.abs(e) < 0.05 ? 'discret' : e > 0 ? 'ecart-plus' : 'ecart-moins';
      return `<small class="${cls}">${e > 0 ? '+' : e < 0 ? '−' : ''}${Math.abs(Math.round(e * 100))} %</small>`;
    };
    const rangs = res.pairs.length > 1;
    const html = lignes.map(([nom, f, fmt]) => {
      const a = f(s) || 0, b = f(ts) || 0;
      const valeurs = res.pairs.map((q) => f(q.stats) || 0).sort((x, y) => y - x);
      const cellesPaliers = paliers.map((pal) => { const v = f(pal.profil.stats) || 0; return `<td class="n palier">${fmt(v)}${ecartTxt(v, a)}</td>`; }).join('');
      return `<tr><td>${nom}</td><td class="n"><b>${fmt(a)}</b></td>${cellesPaliers}<td class="n">${fmt(b)}${paliers.length ? '' : ecartTxt(a, b)}</td>
        ${rangs ? `<td class="n">${rangTexte(valeurs.indexOf(a) + 1)} / ${valeurs.length}</td>` : ''}</tr>`;
    });
    // Le bilan : victoires contre les spécialisations pour chaque équipement
    const sc = res.scores[p.cle];
    const pts = (x) => (x == null || sc == null ? '' : (() => { const d = Math.round((x - sc) * 100); return `<small class="${d >= 3 ? 'ecart-plus' : d <= -3 ? 'ecart-moins' : 'discret'}">${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} pt</small>`; })());
    html.push(`<tr class="bilan"><td>Victoires contre les ${res.types.length} spés</td><td class="n"><b>${sc == null ? '…' : pc(sc)}</b></td>${paliers.map((pal) => { const x = res.scoresPaliers[pal.id]; return `<td class="n palier">${x == null ? '…' : pc(x)}${pts(x)}</td>`; }).join('')}<td class="n">${res.scoreRef == null ? '…' : pc(res.scoreRef)}</td>${rangs ? '<td></td>' : ''}</tr>`);
    $('t-fiche').innerHTML = `<thead><tr><th>Statistique</th><th class="n">${paliers.length ? 'Porté' : 'Vous'}</th>${paliers.map((pal) => `<th class="n palier">${esc(pal.court[0].toUpperCase() + pal.court.slice(1))}</th>`).join('')}<th class="n">Type</th>${rangs ? '<th class="n">Rang</th>' : ''}</tr></thead><tbody>${html.join('')}</tbody>`;
  }

  // ------------------------------------------------------------ équipement objet par objet
  const QUALITE_CLS = { POOR: 'q-mediocre', COMMON: 'q-commun', UNCOMMON: 'q-inhabituel', RARE: 'q-rare', EPIC: 'q-epique', LEGENDARY: 'q-legendaire' };
  const jauge = (x) => {
    const cls = x >= 0.95 ? 'bon' : x >= 0.7 ? 'moyen' : 'mauvais';
    return `<div class="${cls}" style="display:flex;gap:8px;align-items:center"><div class="barre jauge" style="flex:1"><i style="width:${Math.min(100, Math.round(x * 100))}%"></i></div><span class="taux num">${pc(x)}</span></div>`;
  };
  // Les emplacements les plus en retard sur le palier hors donjon (en points de caractéristique)
  const enRetard = () => (res.equip ? res.equip.lignes.filter((l) => l.manque >= 1).sort((a, b) => b.manque - a.manque).slice(0, 3) : []);

  function afficherEquipement() {
    const eq = res.equip;
    if (!eq) {
      $('intro-equipement').textContent = 'L\'équipement de ce personnage n\'est pas encore lu par l\'armurerie : il apparaîtra à sa prochaine lecture.';
      $('resume-equipement').innerHTML = '';
      $('t-equipement').innerHTML = '';
      return;
    }
    const [h, d] = res.paliers;
    $('intro-equipement').innerHTML = `Chaque objet porté comparé à deux paliers de votre niveau (${moi.niveau}) : `
      + `<b class="q-rare">meilleur hors donjon</b>, ${esc(h.texte)} ; <b class="q-epique">donjon épique</b>, ${esc(d.texte)}. `
      + 'La fiche ne donne pas le niveau d\'objet : il est estimé par la somme des statistiques de l\'objet (et par son DPS pour une arme). '
      + 'Bijoux et reliques gardent leur effet et ne sont pas comptés ; enchantements, race et talents sont conservés dans les paliers.';
    const sc = res.scores[moi.cle];
    const gain = (id) => { const x = res.scoresPaliers[id]; return x == null || sc == null ? '…' : `${pc(x)} de victoires (${x - sc >= 0 ? '+' : '−'}${Math.abs(Math.round((x - sc) * 100))} pt)`; };
    $('resume-equipement').innerHTML = `
      <div class="chiffre"><b>${pc(eq.horsDonjon)}</b><span>de la valeur du palier hors donjon</span></div>
      <div class="chiffre"><b>${pc(eq.donjon)}</b><span>de la valeur de la suite épique</span></div>
      <div class="chiffre"><b class="q-rare">${gain(h.id)}</b><span>rééquipé hors donjon</span></div>
      <div class="chiffre"><b class="q-epique">${gain(d.id)}</b><span>rééquipé en suite épique</span></div>`;
    const retard = new Set(enRetard().map((l) => l.emplacement));
    const dpsCell = (l) => (l.dps == null ? '<td class="n discret">—</td>'
      : `<td class="n">${l.dps ? n1.format(l.dps) : '—'} <small class="discret">/ ${n1.format(l.dpsHorsDonjon)} / ${n1.format(l.dpsDonjon)}</small></td>`);
    const rows = eq.lignes.map((l) => {
      const o = l.objet;
      const objet = o
        ? `<div class="qui">${o.icone ? `<img src="${esc(o.icone)}" alt="" width="24" height="24" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}<div style="min-width:0"><span class="nom ${QUALITE_CLS[o.qualite] || ''}">${esc(o.nom)}</span><div class="discret" style="font-size:12px">${esc([E.NOMS_QUALITE[o.qualite], o.sousType, l.ilvl ? `niveau d'objet ≈ ${l.ilvl}` : ''].filter(Boolean).join(' · '))}</div></div></div>`
        : '<span class="discret">Emplacement vide</span>';
      return `<tr class="${retard.has(l.emplacement) ? 'retard' : ''}"><td>${esc(l.emplacementNom)}${retard.has(l.emplacement) ? '<div class="etiquette">à remplacer</div>' : ''}</td><td>${objet}</td>
        <td style="min-width:130px">${jauge(l.horsDonjon)}</td><td style="min-width:130px">${jauge(l.donjon)}</td>${dpsCell(l)}</tr>`;
    }).join('');
    $('t-equipement').innerHTML = `<thead><tr><th>Emplacement</th><th>Objet porté</th><th>Vs hors donjon</th><th>Vs donjon épique</th><th class="n">DPS porté / hors donj. / donj.</th></tr></thead><tbody>${rows}</tbody>`;
  }

  function ligneDuel(adv, r, sous, extra = '') {
    return `<tr><td>${qui(adv, { sous, lien: !adv.type })}</td>
      <td style="min-width:150px">${barre(r ? r.taux : null)}</td>${extra}
      <td class="n">${r ? `${n1.format(r.duree)} s` : ''}</td>
      <td class="n">${r ? `<button type="button" class="voir" data-adv="${esc(adv.cle)}">Voir le duel</button>` : ''}</td></tr>`;
  }
  const enteteDuels = '<thead><tr><th>Adversaire</th><th>Vos victoires</th><th class="n">Durée</th><th></th></tr></thead>';

  function afficherTypes() {
    $('intro-types').textContent = `${N_TYPES} duels contre chacune des ${res.types.length} spécialisations jouées en duel, au niveau ${moi.niveau}, avec un équipement de donjon estimé.${res.paliers.length ? ' Les colonnes de droite rejouent les mêmes duels avec vous rééquipé (écart en points avec votre équipement).' : ''}`;
    const rows = res.types.map((t) => ({ t, r: res.vsTypes[t.cle] }));
    if (rows.every((x) => x.r)) rows.sort((a, b) => b.r.taux - a.r.taux);
    // Le même duel avec l'équipement de chaque palier
    const extra = (t, r) => res.paliers.map((pal) => {
      const x = (res.vsPaliers[pal.id] || {})[t.cle];
      if (!x) return '<td class="n palier"><span class="attente">…</span></td>';
      const d = r ? Math.round((x.taux - r.taux) * 100) : 0;
      return `<td class="n palier"><span class="${classeTaux(x.taux)}">${pc(x.taux)}</span>${r && Math.abs(d) >= 3 ? `<small class="${d > 0 ? 'ecart-plus' : 'ecart-moins'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</small>` : ''}</td>`;
    }).join('');
    const entete = res.paliers.length
      ? `<thead><tr><th>Adversaire</th><th>Porté</th>${res.paliers.map((pal) => `<th class="n palier">${esc(pal.court[0].toUpperCase() + pal.court.slice(1))}</th>`).join('')}<th class="n">Durée</th><th></th></tr></thead>`
      : enteteDuels;
    $('t-types').innerHTML = entete + `<tbody>${rows.map(({ t, r }) => ligneDuel(t, r, undefined, extra(t, r))).join('')}</tbody>`;
  }

  function afficherJoueurs() {
    const autres = res.autres;
    $('intro-joueurs').textContent = autres.length
      ? `${N_JOUEURS} duels contre chaque personnage de l'armurerie entre les niveaux ${moi.niveau - ECART} et ${moi.niveau + ECART}, avec leur vraie fiche.`
      : `Aucun autre personnage de l'armurerie entre les niveaux ${moi.niveau - ECART} et ${moi.niveau + ECART}. Ajoutez des joueurs de ce niveau sur l'armurerie pour vous mesurer à eux.`;
    const rows = autres.map((q) => ({ q, r: res.vsJoueurs[q.cle] }));
    if (rows.length && rows.every((x) => x.r)) rows.sort((a, b) => b.r.taux - a.r.taux);
    $('t-joueurs').innerHTML = rows.length
      ? enteteDuels + `<tbody>${rows.map(({ q, r }) => ligneDuel(q, r, `${nomClasse(q)} ${specNom(q)} · niv. ${q.niveau}`)).join('')}</tbody>` : '';
  }

  function afficherConseils() {
    const c = res.conseils;
    if (!c) {
      $('conseils').innerHTML = res.variantes.map((v) => `<li><span>${esc(v.nom)}</span><span class="attente">…</span></li>`).join('');
      $('conseils-texte').innerHTML = '';
      return;
    }
    const restants = res.variantes.filter((v) => !c.some((x) => x.nom === v.nom));
    $('conseils').innerHTML = c.map((x) => {
      const pts = Math.round(x.gain * 1000) / 10;
      const cls = pts >= 1 ? 'ecart-plus' : pts <= -1 ? 'ecart-moins' : 'discret';
      return `<li><span>${esc(x.nom)}</span><b class="n ${cls}">${pts > 0 ? '+' : pts < 0 ? '−' : ''}${n1.format(Math.abs(pts))} pt</b><span class="detail">${esc(x.detail)}</span></li>`;
    }).join('') + restants.map((v) => `<li><span>${esc(v.nom)}</span><span class="attente">…</span></li>`).join('');

    if (restants.length) return;
    const t = [];
    const meilleur = c[0];
    if (meilleur.gain >= 0.01) t.push(`<p><b>Priorité :</b> ${esc(meilleur.court)}. C'est ce qui augmente le plus vos victoires (+${n1.format(Math.round(meilleur.gain * 1000) / 10)} points de taux de victoire).</p>`);
    else t.push('<p>Aucune statistique ne change nettement vos résultats : vos duels se jouent surtout sur les capacités de votre classe.</p>');
    const types = res.types.map((x) => ({ x, r: res.vsTypes[x.cle] })).filter((y) => y.r);
    const durs = types.filter((y) => y.r.taux < 0.35).sort((a, b) => a.r.taux - b.r.taux).slice(0, 3);
    const faciles = types.filter((y) => y.r.taux > 0.7).sort((a, b) => b.r.taux - a.r.taux).slice(0, 3);
    if (durs.length) t.push(`<p><b>Adversaires difficiles :</b> ${durs.map((y) => `${esc(y.x.nom)} (${pc(y.r.taux)})`).join(', ')}. Ouvrez « Voir le duel » pour repérer quand le combat bascule.</p>`);
    if (faciles.length) t.push(`<p><b>Vos meilleurs duels :</b> ${faciles.map((y) => `${esc(y.x.nom)} (${pc(y.r.taux)})`).join(', ')}.</p>`);
    if (res.equip && res.paliers.every((pal) => res.scoresPaliers[pal.id] != null)) {
      const sc = res.scores[moi.cle];
      const [h, d] = res.paliers.map((pal) => res.scoresPaliers[pal.id] - sc);
      const signe = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))} pt`;
      const retard = enRetard();
      const objets = retard.map((l) => `${esc(l.emplacementNom.toLowerCase())} (${l.objet ? `${esc(l.objet.nom)}, ${pc(l.horsDonjon)}` : 'vide'})`).join(', ');
      t.push(`<p><b>Équipement :</b> ${h > 0.02
        ? `passer au meilleur équipement hors donjon vous ferait gagner ${signe(h)} de victoires, la suite épique de donjon ${signe(d)}.`
        : `votre équipement vaut déjà le meilleur hors donjon (${signe(h)} en le remplaçant) ; la suite épique de donjon change ${signe(d)}.`}${retard.length ? ` Remplacez d'abord : ${objets}.` : ''}</p>`);
    }
    if (res.scoreRef != null && res.scores[moi.cle] != null) {
      const d = res.scores[moi.cle] - res.scoreRef;
      t.push(`<p>${Math.abs(d) < 0.03 ? 'Vous êtes au niveau' : d > 0 ? `Vous faites <b>mieux</b> (+${Math.round(d * 100)} pt) que` : `Vous êtes <b>en dessous</b> (−${Math.round(-d * 100)} pt) du`} joueur type de votre spécialisation${d < -0.03 ? ' : votre équipement a sans doute du retard pour votre niveau' : ''}.</p>`);
    }
    $('conseils-texte').innerHTML = t.join('');
  }

  // ------------------------------------------------------------ duel raconté
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button.voir');
    if (!b) return;
    const cle = b.dataset.adv;
    const adv = res.types.find((t) => t.cle === cle) || res.autres.find((q) => q.cle === cle);
    if (!adv) return;
    const s = res.vsTypes[cle] || res.vsJoueurs[cle];
    // Le duel montré finit comme la majorité de la série
    const r = A.duelRaconte(moi, adv, s && s.taux >= 0.5 ? 0 : 1, GRAINE);
    montrerDuel(adv, r, s);
  });
  $('duel-fermer').addEventListener('click', () => $('duel').close());
  $('duel').addEventListener('click', (e) => { if (e.target === $('duel')) $('duel').close(); });

  function montrerDuel(adv, r, s) {
    const issue = r.vainqueur === 0 ? 'Victoire' : r.vainqueur === 1 ? 'Défaite' : 'Match nul';
    $('duel-titre').textContent = `${moi.nom} contre ${adv.nom}`;
    $('duel-sous').textContent = `${issue} en ${n1.format(r.duree)} s${r.vainqueur != null ? `, il reste ${pc(r.pv[r.vainqueur])} des PV au vainqueur` : ''}. Duel typique d'une série gagnée à ${s ? pc(s.taux) : '—'}.`;

    const bilan = (b, nom) => {
      const lignes = Object.entries(b.degats).sort((x, y) => y[1].total - x[1].total).slice(0, 6);
      const totalD = lignes.reduce((s2, [, x]) => s2 + x.total, 0);
      const soins = Object.values(b.soins || {}).reduce((s2, x) => s2 + x.total, 0);
      return `<div><h3>${esc(nom)}</h3><table><tbody>${lignes.map(([n, x]) => `<tr><td><div class="qui">${icone(x.icone)}<span class="nom">${esc(n)}</span></div></td><td class="n">${nf.format(Math.round(x.total))}</td><td class="n discret">${totalD ? Math.round(x.total / totalD * 100) : 0} %</td></tr>`).join('')}
        ${soins ? `<tr><td>Soins</td><td class="n ecart-plus">${nf.format(Math.round(soins))}</td><td></td></tr>` : ''}</tbody></table></div>`;
    };
    $('duel-bilans').innerHTML = bilan(r.bilans[0], `Dégâts de ${moi.nom}`) + bilan(r.bilans[1], `Dégâts de ${adv.nom}`);
    $('duel-journal').innerHTML = r.journal.map((l) => `<li class="c${l.cote} ${esc(l.type)}"><span class="num discret">${n1.format(l.t)} s</span>${icone(l.icone)}<span>${esc(l.texte)}</span></li>`).join('');
    $('duel').showModal();
    // La courbe se dessine à la largeur réelle de la fenêtre : le texte garde sa taille sur téléphone
    $('duel-courbe').innerHTML = courbe(r, adv, $('duel-courbe').clientWidth);
    $('duel-journal').parentNode.scrollTop = 0;
  }

  function courbe(r, adv, largeur) {
    const W = Math.max(280, Math.round(largeur || 640)), H = W < 500 ? 160 : 190, g = 40, d = 10, h = 14, bas = 22;
    const T = Math.max(r.duree, 1);
    const x = (t) => g + (t / T) * (W - g - d);
    const y = (v) => h + (1 - v) * (H - h - bas);
    const pts = (i) => r.courbe.map((c) => `${x(c[0]).toFixed(1)},${y(c[i + 1]).toFixed(1)}`).join(' ');
    const pas = T > 60 ? 20 : T > 25 ? 10 : 5;
    let ticks = '';
    for (let t = 0; t <= T; t += pas) ticks += `<text x="${x(t)}" y="${H - 6}" text-anchor="middle">${t} s</text>`;
    const grille = [0, 0.5, 1].map((v) => `<line x1="${g}" x2="${W - d}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${g - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100} %</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Points de vie des deux combattants au fil du duel">${grille}${ticks}
      <polyline points="${pts(1)}" fill="none" stroke="var(--adv)" stroke-width="2" stroke-linejoin="round"/>
      <polyline points="${pts(0)}" fill="none" stroke="var(--vous)" stroke-width="2.5" stroke-linejoin="round"/></svg>
      <div class="legende"><span style="--c:var(--vous)">${esc(moi.nom)}</span><span style="--c:var(--adv)">${esc(adv.nom)}</span></div>`;
  }

  charger();
})();
