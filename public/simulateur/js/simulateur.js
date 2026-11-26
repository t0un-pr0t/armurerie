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
  async function serie(j, a, b, n, graine, options) {
    await pause();
    if (j !== jeton) throw new Error('annulé');
    const r = A.serie(a, b, n, graine, options);
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
  // Listes BiS et pré-BiS de la classe (data/bis/<classe>.json, produites par outils/bis.js)
  const listesBis = {};
  function chargerBis(classe) {
    if (!E || !E.choixBis) return Promise.resolve(null);
    if (!(classe in listesBis)) {
      listesBis[classe] = fetch(`data/bis/${encodeURIComponent(classe)}.json`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    }
    return listesBis[classe];
  }
  const TEXTES_REELS = {
    horsDonjon: { texte: 'le meilleur objet de chaque emplacement obtenable sans donjon, raid ni haut rang JcJ : quêtes, réputations, artisanat, hôtel des ventes', sous: 'vous, rééquipé en pré-BiS' },
    donjon: { texte: 'la liste BiS JcJ de votre tranche de champ de bataille, donjons compris', sous: 'vous, rééquipé en BiS' },
  };

  function choisir(p) {
    const j = ++jeton;
    moi = p;
    $('choix').value = p.cle;
    $('contenu').hidden = false;
    document.title = `${p.nom} · Simulateur · Armurerie Forever`;
    $('etat').textContent = 'Chargement des listes BiS…';
    chargerBis(p.classe).then((donnees) => { if (j === jeton) demarrer(p, j, donnees); });
  }

  function demarrer(p, j, donnees) {
    const pairs = persos.filter((q) => Math.abs(q.niveau - p.niveau) <= ECART);
    const autres = pairs.filter((q) => q.cle !== p.cle);
    const types = A.adversairesTypes(p.niveau);
    const ref = typeDe(p);
    const variantes = variantesDe(p);
    // Le même personnage rééquipé : pré-BiS (avant donjon) et BiS. Avec les listes de la classe, objets réels ;
    // sans elles, estimation par niveau d'objet (profilPalier)
    const choix = donnees && Array.isArray(p.equipement) ? E.choixBis(p, donnees) : null;
    const equip = E ? (choix && E.analyserBis(p, choix)) || E.analyser(p) : null;
    const paliers = equip ? E.PALIERS.filter((x) => x.qualite).map((x) => (choix
      ? { ...x, ...TEXTES_REELS[x.id], profil: E.profilObjets(p, choix, x.id) }
      : { ...x, profil: E.profilPalier(p, x.id) })) : [];
    res = {
      pairs, autres, types, ref, variantes, equip, paliers, choix,
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
    afficherEnchainements();
    afficherJoueurs();
    afficherRang();
    afficherConseils();
    calculer(j).catch((e) => { if (e.message !== 'annulé') { console.error(e); $('etat').textContent = `Erreur de simulation : ${e.message}`; } });
  }

  async function calculer(j) {
    const { types, autres, ref, variantes } = res;
    // 1. Contre chaque spécialisation à votre niveau
    for (const t of types) {
      res.vsTypes[t.cle] = await serie(j, moi, t, N_TYPES, GRAINE, { enchainement: true });
      afficherTypes();
      afficherEnchainements();
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
      <div class="liens">${p.urlArmurerie ? `<a href="${esc(p.urlArmurerie)}" rel="noopener" target="_blank">Fiche Blizzard</a>` : ''}</div>`;
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
      .concat(res.paliers.map((pal) => ({ p: { ...pal.profil, portrait: moi.portrait }, score: res.scoresPaliers[pal.id] ?? null, sous: pal.sous || `vous, ${pal.texte.split(' : ')[0]}`, cls: 'reference palier' })));
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
      ? `Vos statistiques (fiche Blizzard, talents compris) avec votre équipement, puis en pré-BiS (meilleur équipement avant les donjons) et en BiS (suite épique de donjon) de votre niveau, face au ${typeNom} type. Les écarts sont donnés par rapport à l'équipement porté.`
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
  // Les emplacements les plus en retard sur le pré-BiS (en points de caractéristique)
  const enRetard = () => (res.equip ? res.equip.lignes.filter((l) => l.manque >= 1).sort((a, b) => b.manque - a.manque).slice(0, 3) : []);

  function afficherEquipement() {
    const eq = res.equip;
    if (!eq) {
      $('intro-equipement').textContent = 'L\'équipement de ce personnage n\'est pas encore lu par l\'armurerie : il apparaîtra à sa prochaine lecture.';
      $('resume-equipement').innerHTML = '';
      $('t-equipement').innerHTML = '';
      return;
    }
    if (eq.reel) return afficherEquipementReel(eq);
    const [h, d] = res.paliers;
    $('intro-equipement').innerHTML = `Chaque objet porté comparé à deux paliers de votre niveau (${moi.niveau}) : `
      + `<b class="q-rare">pré-BiS</b> (le meilleur avant les donjons), ${esc(h.texte)} ; <b class="q-epique">BiS</b> (le meilleur en donjon), ${esc(d.texte)}. `
      + 'La fiche ne donne pas le niveau d\'objet : il est estimé par la somme des statistiques de l\'objet (et par son DPS pour une arme). '
      + 'Bijoux et reliques gardent leur effet et ne sont pas comptés ; enchantements, race et talents sont conservés dans les paliers.';
    const sc = res.scores[moi.cle];
    const gain = (id) => { const x = res.scoresPaliers[id]; return x == null || sc == null ? '…' : `${pc(x)} de victoires (${x - sc >= 0 ? '+' : '−'}${Math.abs(Math.round((x - sc) * 100))} pt)`; };
    $('resume-equipement').innerHTML = `
      <div class="chiffre"><b>${pc(eq.horsDonjon)}</b><span>de la valeur du pré-BiS</span></div>
      <div class="chiffre"><b>${pc(eq.donjon)}</b><span>de la valeur du BiS</span></div>
      <div class="chiffre"><b class="q-rare">${gain(h.id)}</b><span>rééquipé en pré-BiS</span></div>
      <div class="chiffre"><b class="q-epique">${gain(d.id)}</b><span>rééquipé en BiS</span></div>`;
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
    $('t-equipement').innerHTML = `<thead><tr><th>Emplacement</th><th>Objet porté</th><th>Vs pré-BiS</th><th>Vs BiS</th><th class="n">DPS porté / pré-BiS / BiS</th></tr></thead><tbody>${rows}</tbody>`;
  }

  // Une cellule d'objet des listes : icône, nom (lien Wowhead), d'où il vient
  function celluleObjet(c, porte) {
    if (!c) return '<td><span class="discret">—</span></td>';
    const o = c.objet;
    const quoi = [(c.source || '').replace(/\s*Classic\s*$/, ''), c.classic ? 'objet Classic, présence dans Forever non confirmée' : ''].filter(Boolean).join(' · ');
    return `<td><div class="qui">${o.icone ? `<img src="${esc(o.icone)}" alt="" width="24" height="24" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}<div style="min-width:0">`
      + `<a class="nom ${QUALITE_CLS[o.qualite] || ''}" href="https://www.wowhead.com/forever/item=${o.id}" target="_blank" rel="noopener">${esc(o.nom)}</a>${porte ? ' <span class="deja">porté</span>' : ''}`
      + `<div class="discret source" title="${esc(quoi)}">${esc(quoi)}</div></div></div></td>`;
  }
  function afficherEquipementReel(eq) {
    const c = eq.choix;
    const sc = res.scores[moi.cle];
    const [h, d] = res.paliers;
    const lien = `bis.html?classe=${encodeURIComponent(moi.classe)}&spec=${encodeURIComponent(c.spec)}&niveau=${c.niveau}&faction=${c.horde ? 'horde' : 'alliance'}`;
    $('intro-equipement').innerHTML = `Chaque objet porté comparé, pour votre spécialisation au niveau ${c.niveau} (${c.horde ? 'Horde' : 'Alliance'}), au `
      + `<b class="q-rare">pré-BiS</b> (${esc(h.texte)}) et au <b class="q-epique">BiS</b> (${esc(d.texte)} : tranche ${c.tranche === 60 ? '60' : `${c.tranche - 9}-${c.tranche}`}). `
      + 'La valeur d\'un objet additionne ses statistiques Forever pondérées pour votre spécialisation, DPS de l\'arme compris. '
      + 'Bijoux et reliques sont indiqués mais gardent leur effet dans la simulation ; enchantements, race et talents sont conservés. '
      + `<a href="${esc(lien)}">Listes complètes de toutes les spécialisations</a>.`;
    const gain = (id) => { const x = res.scoresPaliers[id]; return x == null || sc == null ? '…' : `${pc(x)} de victoires (${x - sc >= 0 ? '+' : '−'}${Math.abs(Math.round((x - sc) * 100))} pt)`; };
    $('resume-equipement').innerHTML = `
      <div class="chiffre"><b>${eq.horsDonjon == null ? '—' : pc(eq.horsDonjon)}</b><span>de la valeur du pré-BiS</span></div>
      <div class="chiffre"><b>${eq.donjon == null ? '—' : pc(eq.donjon)}</b><span>de la valeur du BiS</span></div>
      <div class="chiffre"><b class="q-rare">${gain(h.id)}</b><span>rééquipé en pré-BiS</span></div>
      <div class="chiffre"><b class="q-epique">${gain(d.id)}</b><span>rééquipé en BiS</span></div>`;
    const retard = new Set(enRetard().map((l) => l.emplacement));
    const rows = eq.lignes.map((l) => {
      const o = l.objet;
      const objet = o
        ? `<div class="qui">${o.icone ? `<img src="${esc(o.icone)}" alt="" width="24" height="24" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}<div style="min-width:0"><span class="nom ${QUALITE_CLS[o.qualite] || ''}">${esc(o.nom)}</span><div class="discret source">${esc([E.NOMS_QUALITE[o.qualite], o.sousType, o.arme ? `${n1.format(o.arme.dps)} DPS` : ''].filter(Boolean).join(' · '))}</div></div></div>`
        : '<span class="discret">Emplacement vide</span>';
      const j = (x, nom) => `<div class="mini"><small>${nom}</small>${x == null ? '<span class="discret">—</span>' : jauge(x)}</div>`;
      const jauges = l.garde ? '<td class="discret">non simulé</td>' : `<td style="min-width:140px">${j(l.horsDonjon, 'vs pré-BiS')}${j(l.donjon, 'vs BiS')}</td>`;
      return `<tr class="${retard.has(l.emplacement) ? 'retard' : ''}"><td>${esc(l.emplacementNom)}${retard.has(l.emplacement) ? '<div class="etiquette">à remplacer</div>' : ''}</td><td>${objet}</td>`
        + `${celluleObjet(l.pre, l.identiquePre)}${l.pre && l.bis && l.pre.objet.id === l.bis.objet.id ? '<td class="discret">identique au pré-BiS</td>' : celluleObjet(l.bis, l.identiqueBis)}${jauges}</tr>`;
    }).join('');
    $('t-equipement').innerHTML = `<thead><tr><th>Emplacement</th><th>Porté</th><th>Pré-BiS</th><th>BiS</th><th>Valeur du porté</th></tr></thead><tbody>${rows}</tbody>`;
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

  // Meilleur enchaînement d'ouverture contre chaque spécialisation, groupé par classe adverse
  function afficherEnchainements() {
    $('intro-enchainements').textContent = `Les sorts et techniques que vous lancez en début de duel, dans l'ordre, contre chaque spécialisation : `
      + `à chaque étape, celui qui suit le plus souvent dans vos victoires (sur ${N_TYPES} duels). Sans victoire, l'enchaînement de vos duels les plus serrés. `
      + `Les répétitions sont regroupées (×2) ; le temps indique le moment moyen de l'étape.`
      + (moi.classe === 'druide' ? ' Un duel sur deux commence sans camouflage (saignement ou malédiction en cours, combat déjà engagé) : chaque ouverture a son enchaînement.' : '');
    const etape = (e) => `<li><span class="etape${e.forme ? ' forme' : ''}" title="${esc(e.nom)}, vers ${n1.format(e.t)} s">`
      + `${e.icone ? `<img src="icones/${esc(e.icone)}.jpg" alt="" width="26" height="26" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}`
      + `<span><b>${esc(e.nom)}</b>${e.fois > 1 ? ` <span class="fois">×${e.fois}</span>` : ''}<small>${n1.format(e.t)} s</small></span></span></li>`;
    const groupes = Object.keys(A.CLASSES).map((c) => ({ c, types: res.types.filter((t) => t.classe === c) })).filter((g) => g.types.length);
    $('enchainements').innerHTML = groupes.map(({ c, types }) => `<div class="classe-groupe">
      <h3><span class="pastille" style="--cls:${couleur(c)}"></span>${icone(classeIcone(c))}Contre un ${esc(A.CLASSES[c].nom.toLowerCase())}</h3>
      ${types.map((t) => {
        const r = res.vsTypes[t.cle];
        const spec = t.nom.replace(`${A.CLASSES[c].nom} `, '');
        const tete = `<div class="ench-tete"><b>${esc(spec)}</b>${r ? `<span class="taux ${classeTaux(r.taux)}">${pc(r.taux)} de victoires</span>` : ''}</div>`;
        if (!r || !r.enchainement) return `<div class="enchainement">${tete}<span class="attente">…</span></div>`;
        const note = (e) => (e.base === 'victoire'
          ? `${e.appui} de vos ${e.groupe} victoires commencent ainsi. Quand vous ouvrez ainsi : ${pc(e.tauxOuverture)} de victoires (${e.ouvrent} duels sur ${e.n}).`
          : `Aucune victoire sur ${e.n} duels : enchaînement de vos ${e.groupe} duels les plus serrés (${e.appui} le suivent).`);
        const chaine = (e) => `<ol class="chaine" aria-label="${esc(`Enchaînement contre ${t.nom}`)}">${e.etapes.map(etape).join('')}</ol>`;
        const voir = `<button type="button" class="voir" data-adv="${esc(t.cle)}">Voir le duel</button>`;
        // Druide : une ligne depuis le camouflage, une à découvert (saignements, malédictions)
        if (r.ouvertures) {
          return `<div class="enchainement">${tete}<div class="ouvertures">${r.ouvertures.map((e) => `<div class="ouverture">
            <p class="ouv-titre">${e.ouverture === 'camouflage' ? 'Depuis le camouflage' : 'Sans camouflage, déjà en félin'}
              <span class="${classeTaux(e.taux)}">${pc(e.taux)} de victoires</span>${e.ouverture === 'combat' ? '<span class="discret"> · camouflage impossible : saignement, malédiction, combat engagé</span>' : ''}</p>
            ${chaine(e)}<p class="note">${esc(note(e))}</p></div>`).join('')}</div>${voir}</div>`;
        }
        const e = r.enchainement;
        return `<div class="enchainement">${tete}${chaine(e)}${voir}<p class="note">${esc(note(e))}</p></div>`;
      }).join('')}</div>`).join('');
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
      const objets = retard.map((l) => `${esc(l.emplacementNom.toLowerCase())} (${l.objet ? `${esc(l.objet.nom)}, ${pc(l.horsDonjon)}` : 'vide'}${l.pre ? ` → ${esc(l.pre.objet.nom)}` : ''})`).join(', ');
      t.push(`<p><b>Équipement :</b> ${h > 0.02
        ? `passer en pré-BiS vous ferait gagner ${signe(h)} de victoires, en BiS ${signe(d)}.`
        : `votre équipement vaut déjà le pré-BiS (${signe(h)} en le remplaçant) ; le BiS change ${signe(d)}.`}${retard.length ? ` Remplacez d'abord : ${objets}.` : ''}</p>`);
    }
    if (res.scoreRef != null && res.scores[moi.cle] != null) {
      const d = res.scores[moi.cle] - res.scoreRef;
      t.push(`<p>${Math.abs(d) < 0.03 ? 'Vous êtes au niveau' : d > 0 ? `Vous faites <b>mieux</b> (+${Math.round(d * 100)} pt) que` : `Vous êtes <b>en dessous</b> (−${Math.round(-d * 100)} pt) du`} joueur type de votre spécialisation${d < -0.03 ? ' : votre équipement a sans doute du retard pour votre niveau' : ''}.</p>`);
    }
    $('conseils-texte').innerHTML = t.join('');
  }

  // ------------------------------------------------------------ duel raconté
  // Les duels de la série (mêmes graines) sont regroupés par issue ; chaque issue se rejoue en
  // cinématique avec son duel le plus typique, l'issue la plus fréquente d'abord.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button.voir');
    if (!b) return;
    const cle = b.dataset.adv;
    const adv = res.types.find((t) => t.cle === cle) || res.autres.find((q) => q.cle === cle);
    if (!adv) return;
    const s = res.vsTypes[cle] || res.vsJoueurs[cle];
    const n = res.vsTypes[cle] ? N_TYPES : N_JOUEURS;
    $('duel-titre').textContent = `${moi.nom} contre ${adv.nom}`;
    $('duel-sous').textContent = '';
    $('duel-attente').hidden = false;
    $('cine').hidden = true;
    $('duel').showModal();
    // On laisse le dialog s'afficher avant de rejouer la série
    setTimeout(() => {
      const scenarios = A.scenarios(moi, adv, n, GRAINE);
      $('duel-attente').hidden = true;
      $('cine').hidden = false;
      window.Cinematique.montrer({
        moi: { nom: moi.nom, classe: moi.classe, sous: specNom(moi) || nomClasse(moi) },
        adv: { nom: adv.nom, classe: adv.classe, sous: adv.type ? nomClasse(adv) : specNom(adv) || nomClasse(adv) },
        scenarios,
        rejouer: (sc) => A.rejouer(moi, adv, sc),
        surDuel: (r, sc) => montrerDuel(adv, r, sc, s),
        surTemps: (t) => teteCourbe(t),
      });
    }, 30);
  });
  $('duel-fermer').addEventListener('click', () => $('duel').close());
  $('duel').addEventListener('click', (e) => { if (e.target === $('duel')) $('duel').close(); });
  $('duel').addEventListener('close', () => window.Cinematique.arreter());

  // Sous-titre, courbe, bilans et journal du duel rejoué ; r.moi : côté du personnage dans ce duel
  function montrerDuel(adv, r, sc, s) {
    const m = r.moi, a = 1 - m;
    const issue = r.vainqueur == null ? 'Match nul' : r.vainqueur === m ? 'Victoire' : 'Défaite';
    $('duel-sous').textContent = `${issue} en ${n1.format(r.duree)} s${r.vainqueur != null ? `, il reste ${pc(r.pv[r.vainqueur])} des PV au vainqueur` : ''}. `
      + `Duel le plus typique de cette issue (${sc.n} duels sur ${s ? s.n : sc.n}) ; série gagnée à ${s ? pc(s.taux) : '—'}.`
      + (r.ouvertures && r.ouvertures[m] ? ` Ouverture ${r.ouvertures[m] === 'camouflage' ? 'depuis le camouflage' : 'sans camouflage, déjà en félin'}.` : '');

    const bilan = (b, nom) => {
      const lignes = Object.entries(b.degats).sort((x, y) => y[1].total - x[1].total).slice(0, 6);
      const totalD = lignes.reduce((s2, [, x]) => s2 + x.total, 0);
      const soins = Object.values(b.soins || {}).reduce((s2, x) => s2 + x.total, 0);
      return `<div><h3>${esc(nom)}</h3><table><tbody>${lignes.map(([n, x]) => `<tr><td><div class="qui">${icone(x.icone)}<span class="nom">${esc(n)}</span></div></td><td class="n">${nf.format(Math.round(x.total))}</td><td class="n discret">${totalD ? Math.round(x.total / totalD * 100) : 0} %</td></tr>`).join('')}
        ${soins ? `<tr><td>Soins</td><td class="n ecart-plus">${nf.format(Math.round(soins))}</td><td></td></tr>` : ''}</tbody></table></div>`;
    };
    $('duel-bilans').innerHTML = bilan(r.bilans[m], `Dégâts de ${moi.nom}`) + bilan(r.bilans[a], `Dégâts de ${adv.nom}`);
    // Couleurs du journal : c0 pour le personnage, c1 pour l'adversaire, quel que soit le côté de départ
    $('duel-journal').innerHTML = r.journal.map((l) => `<li class="c${l.cote == null ? '' : l.cote === m ? 0 : 1} ${esc(l.type)}"><span class="num discret">${n1.format(l.t)} s</span>${icone(l.icone)}<span>${esc(l.texte)}</span></li>`).join('');
    // La courbe se dessine à la largeur réelle de la fenêtre : le texte garde sa taille sur téléphone
    $('duel-courbe').innerHTML = courbe(r, adv, $('duel-courbe').clientWidth);
    $('duel-journal').parentNode.scrollTop = 0;
  }
  let echelleCourbe = null;
  function teteCourbe(t) {
    const l = document.getElementById('tete-courbe');
    if (!l || !echelleCourbe) return;
    const x = echelleCourbe(t).toFixed(1);
    l.setAttribute('x1', x); l.setAttribute('x2', x);
  }

  function courbe(r, adv, largeur) {
    const W = Math.max(280, Math.round(largeur || 640)), H = W < 500 ? 160 : 190, g = 40, d = 10, h = 14, bas = 22;
    const T = Math.max(r.duree, 1);
    const x = (t) => g + (Math.min(t, T) / T) * (W - g - d);
    echelleCourbe = x;
    const m = r.moi || 0;
    const y = (v) => h + (1 - v) * (H - h - bas);
    const pts = (i) => r.courbe.map((c) => `${x(c[0]).toFixed(1)},${y(c[i + 1]).toFixed(1)}`).join(' ');
    const pas = T > 60 ? 20 : T > 25 ? 10 : 5;
    let ticks = '';
    for (let t = 0; t <= T; t += pas) ticks += `<text x="${x(t)}" y="${H - 6}" text-anchor="middle">${t} s</text>`;
    const grille = [0, 0.5, 1].map((v) => `<line x1="${g}" x2="${W - d}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${g - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100} %</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Points de vie des deux combattants au fil du duel">${grille}${ticks}
      <polyline points="${pts(1 - m)}" fill="none" stroke="var(--adv)" stroke-width="2" stroke-linejoin="round"/>
      <polyline points="${pts(m)}" fill="none" stroke="var(--vous)" stroke-width="2.5" stroke-linejoin="round"/>
      <line id="tete-courbe" class="tete-courbe" x1="${g}" x2="${g}" y1="${h}" y2="${H - bas}"/></svg>
      <div class="legende"><span style="--c:var(--vous)">${esc(moi.nom)}</span><span style="--c:var(--adv)">${esc(adv.nom)}</span></div>`;
  }

  charger();
})();
