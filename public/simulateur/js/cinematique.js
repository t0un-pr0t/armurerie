/*
 * Cinématique d'un duel, pour toutes les classes : cadres d'unité, arène vue de côté (caméra,
 * distance, chiffres flottants), frise des sorts et décomptes. Elle lit ce que js/arene.js
 * enregistre en mode journal : une image toutes les 0,1 s, les sorts lancés (actions) et les coups.
 * Le personnage choisi est toujours le camp 0 (« vous »), quel que soit son côté de départ.
 *
 * Cinematique.montrer({ moi, adv, scenarios, rejouer, surDuel, surTemps })
 *   moi, adv : { nom, classe, sous } ; scenarios : Arene.scenarios(...) ;
 *   rejouer(sc) → duel enregistré (Arene.rejouer) ; surDuel(r, sc) et surTemps(t) : rappels de la page.
 */
(function () {
  'use strict';
  const A = window.Arene;
  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat('fr-FR');
  const fmt = (x) => nf.format(Math.round(x));
  const pc = (x) => `${Math.round(x * 100)} %`;
  const fmtT = (t) => t.toFixed(1).replace('.', ',');
  const srcIcone = (nom) => (nom ? `icones/${nom}.jpg` : null);

  function el(tag, attrs, ...enfants) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const e of enfants) if (e != null) n.append(e);
    return n;
  }
  // Icône de sort décorative (le nom est écrit à côté), d'où alt vide
  const ico = (nom, taille) => {
    const s = srcIcone(nom);
    if (!s) return el('span', { class: 'ico vide', style: `width:${taille}px;height:${taille}px` });
    const i = el('img', { class: 'ico', src: s, alt: '', width: taille, height: taille, decoding: 'async' });
    i.addEventListener('error', () => { i.style.visibility = 'hidden'; });
    return i;
  };

  const ETATS_CC = { etourdi: 'étourdi', peur: 'apeuré', incap: 'neutralisé', horreur: 'horrifié', bloc: 'insensible', racine: 'enraciné' };
  const COULEUR_RES = { mana: 'var(--mana)', rage: 'var(--rage)', energie: 'var(--energie)' };
  const NOMS_FORME = { felin: 'félin', ours: 'ours' };
  const VIE_FLOTTANT = 1.4;   // s de duel pendant lesquelles un chiffre reste affiché
  const VIE_LEGENDE = 2.5;
  const mouvementReduit = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  const memo = {
    lire(k, d) { try { const v = localStorage.getItem('cine.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    ecrire(k, v) { try { localStorage.setItem('cine.' + k, JSON.stringify(v)); } catch (e) { /* stockage refusé */ } },
  };
  const vitesseLue = memo.lire('vitesse', 2);

  // Silhouettes du druide en forme animale, de profil et tournées vers la droite, posées sur le sol
  const SILHOUETTES = {
    felin: { titre: 'félin', l: 64, h: 39, svg: `<svg viewBox="0 0 72 44" aria-hidden="true">
      <path class="loin" d="M50.2 32 L48.4 43.6 L53.6 43.6 L54.4 33 Z M26.6 32 L30.6 43.6 L35.6 43.6 L31.8 32.4 Z"/>
      <path class="corps" d="M17 20 C24 18.2 36 18 46 18.4 C50 18.6 53 17.4 55 15.4 C55 13.5 55.2 11.6 55.8 10 L57.4 3.2 L59.6 7 L62.2 2.2 L64.2 7.6 C65.6 8.4 66.6 10 67 11.8 L68.8 13.6 C69.2 14.4 68.8 15.2 68 15.4 L66.4 16.4 C65.8 17.6 64.6 18.2 63.4 18.4 L62.6 20.2 L61 19.8 L60.6 22 L59 21.8 L58.8 24.2 L57.2 24.2 L57 26.4 L55.6 26.8 L56.4 41.6 C56.6 42.8 57.8 43 58.8 43.2 C59.4 43.4 59.2 43.8 58.6 43.8 L51.6 43.8 L51 33.2 L48.5 33.6 L47 32.6 L45 33.6 L43 32.6 L41 33.4 L39 32.6 L37 33.4 L35 32.6 L33 33.2 L30.5 32.4 C29.4 35 29 37.6 29.6 40 L30.8 42.6 C31.2 43.4 30.6 43.8 29.8 43.8 L24.4 43.8 C23.4 41.4 22.2 39 20.6 37.2 C17.6 35.4 15.4 32.6 14.6 29 C9 28 4 23 2.6 16 C1.6 10.6 3 5.4 6.6 2.6 C8 1.6 9.6 2.8 8.8 4.4 C7.4 7.6 7.4 11.6 9 15 C10.6 18 13.4 20 17 20 Z"/>
      <circle class="oeil" cx="64.4" cy="11.8" r="1"/>
      <path class="trait" d="M57.4 3.2 L57 0.4 M62.2 2.2 L62.6 0.4 M34 19 L33.2 23.6 M39 18.8 L38.4 23 M44 19.2 L43.6 22.6 M28.4 19.6 L27.6 24 M60.2 19.2 C59 21 58.4 23 58.4 25 M4.6 12 L7.6 12.8 M4.2 7.6 L7 8.6"/>
      <path class="trait" style="stroke-opacity:.25;stroke-width:.6" d="M67 15.8 L71.6 14.8 M67 16.4 L71.4 17.4"/></svg>` },
    ours: { titre: 'ours', l: 66, h: 40, svg: `<svg viewBox="0 0 72 44" aria-hidden="true">
      <path class="loin" d="M46.4 32 L44.6 43.6 L50.8 43.6 L51.6 33 Z M23.6 32 L27.2 43.6 L33 43.6 L29.4 33 Z"/>
      <path class="corps" d="M7 23 C5 15 11 10.5 19 10 C27 9.5 33 5.5 41 5.5 C46.5 5.5 50 8 52.5 11 C53.5 8.8 55.5 7.6 57.5 8.6 C58.6 9.3 58.6 10.6 58.2 11.6 C60.5 12.5 62.5 14 64 15.6 L69.2 17.4 C71 18 71.2 20.6 69.6 21.6 L64.6 24.2 C62 25.4 59.5 26.2 57.6 28.2 L58.8 41.4 C59 43 57.8 43.6 56.2 43.6 L49.6 43.6 L48.4 35 C40 36.6 31 36.6 25 35.2 L24.6 43.6 L17.4 43.6 C15.6 43.6 15 42.4 14.8 41 C12 37.4 8.6 31.6 7 23 Z"/>
      <circle class="oeil" cx="62.4" cy="17.2" r="1.15"/>
      <path class="trait" d="M57.6 28.2 C55.5 26 54.5 22 55.5 18.5 M25 35.2 C22 31 22.5 25 25 21.5 M64.4 16 C65.6 18 65.6 21 64.6 24"/>
      <circle class="truffe" cx="70" cy="19.4" r="1.2"/></svg>` },
  };

  const cine = {
    duel: null, t: 0, T: 0, lecture: false, raf: 0, dernier: 0, largeur: 0,
    vitesse: [1, 2, 4, 8].includes(vitesseLue) ? vitesseLue : 2,
    flottants: new Map(), decompte: [], tetes: [], choix: 0, opts: null,
  };

  function ecrireTexte(n, v) { if (n._t !== v) { n._t = v; n.textContent = v; } }
  function ecrireStyle(n, k, v) { const c = '_s' + k; if (n[c] !== v) { n[c] = v; n.style[k] = v; } }
  function basculer(n, cl, v) { if (n.classList.contains(cl) !== v) n.classList.toggle(cl, v); }
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

  // Camp de l'interface (0 : vous, 1 : l'adversaire) → côté dans le moteur
  const cote = (k) => (k === 0 ? cine.duel.moi : 1 - cine.duel.moi);

  // Caméra : centrée sur les deux combattants, lissée, sans jamais en laisser sortir un
  function camera(im) {
    const largeurVisee = (a, b) => Math.min(90, Math.max(28, Math.abs(b - a) * 1.6 + 12));
    const c = new Float64Array(im.length), w = new Float64Array(im.length);
    let cc = (im[0].c[0].x + im[0].c[1].x) / 2, ww = largeurVisee(im[0].c[0].x, im[0].c[1].x);
    for (let i = 0; i < im.length; i++) {
      const a = im[i].c[0].x, b = im[i].c[1].x;
      cc += ((a + b) / 2 - cc) * 0.06;
      ww += (largeurVisee(a, b) - ww) * 0.04;
      let lo = cc - ww / 2, hi = cc + ww / 2;
      lo = Math.min(lo, Math.min(a, b) - 3);
      hi = Math.max(hi, Math.max(a, b) + 3);
      cc = (lo + hi) / 2; ww = hi - lo;
      c[i] = cc; w[i] = ww;
    }
    return { c, w };
  }

  // ------------------------------------------------------------ construction
  function construireCadre(boite, qui, k) {
    const r = { classe: qui.classe };
    const cl = A.CLASSES[qui.classe];
    r.ico = ico(cl ? cl.icone : null, 24);
    r.sous = el('span', { class: 'sous-nom', text: qui.sous || '' });
    r.cc = el('span', { class: 'cc', hidden: true });
    r.pv = el('span'); r.pvCur = el('span'); r.pvMax = el('span', { class: 'max' });
    r.res = el('span'); r.resVal = el('span', { class: 'val' });
    r.mana = el('span', { style: 'background:var(--mana)' }); r.manaVal = el('span', { class: 'val' });
    r.rgMana = el('div', { class: 'rangee', title: 'Mana' }, el('div', { class: 'jauge fine' }, r.mana), r.manaVal);
    r.pips = el('div', { class: 'pips', title: 'Points de combo' }, ...Array.from({ length: 5 }, () => el('i')));
    r.incBarre = el('i'); r.incNom = el('b'); r.incIco = el('img', { class: 'ico', alt: '', width: 18, height: 18 });
    r.incant = el('div', { class: 'incant' }, r.incBarre, r.incIco, r.incNom);
    r.fil = el('div', { class: 'fil' });
    boite.className = 'cadre camp' + k;
    boite.replaceChildren(
      el('div', { class: 'tete' }, r.ico, el('b', { text: qui.nom }), r.sous, r.cc),
      el('div', { class: 'rangee', title: 'Points de vie' }, el('div', { class: 'jauge' }, r.pv), el('span', { class: 'val' }, r.pvCur, r.pvMax)),
      el('div', { class: 'rangee' }, el('div', { class: 'jauge fine' }, r.res), r.resVal),
      r.rgMana, r.pips, r.fil);
    return r;
  }

  function construireFig(qui, k) {
    const cl = A.CLASSES[qui.classe];
    const f = { fig: el('span', { class: 'fig camp' + k, title: qui.nom }), sils: el('span', { class: 'sils' }), sil: {}, forme: undefined };
    f.jeton = el('span', { class: 'jeton', style: cl ? `background-image:url("icones/${cl.icone}.jpg")` : '' });
    if (qui.classe === 'druide') {
      for (const [forme, s] of Object.entries(SILHOUETTES)) {
        const n = el('span', { class: 'silhouette', 'data-forme': forme, style: `width:${s.l}px;height:${s.h}px` });
        n.innerHTML = s.svg;
        f.sil[forme] = n;
        f.sils.append(n);
      }
    }
    f.fig.append(f.jeton, f.sils);
    f.nom = el('span', { class: 'nom-jeton' });
    f.fam = el('span', { class: 'familier camp' + k, hidden: true });
    return f;
  }

  function construireArene() {
    const [m, a] = [cine.opts.moi, cine.opts.adv];
    cine.reperes = Array.from({ length: 24 }, () => el('span', { class: 'repere' }));
    cine.lien = el('span', { class: 'lien' });
    cine.ecart = el('span', { class: 'ecart' });
    cine.figs = [construireFig(m, 0), construireFig(a, 1)];
    for (const [k, f] of cine.figs.entries()) {
      const fam = cine.duel.familiers[cote(k)];
      if (fam) { f.fam.style.backgroundImage = `url("${srcIcone(fam.icone)}")`; f.fam.title = fam.nom; }
    }
    const [f0, f1] = cine.figs;
    $('cine-monde').replaceChildren(...cine.reperes, cine.lien, cine.ecart, f1.fam, f0.fam, f1.fig, f0.fig, f1.nom, f0.nom);
  }

  function construireFrise() {
    for (const k of [0, 1]) {
      const tete = el('span', { class: 'tete-lecture' });
      $('cine-piste' + k).replaceChildren(...cine.actions[k].map((a) =>
        el('i', { class: a.genre === 'forme' ? 'forme' : '', style: `left:${(100 * a.t / (cine.T || 1)).toFixed(2)}%`, title: `${fmtT(a.t)} s · ${a.nom}` })), tete);
      cine.tetes[k] = tete;
    }
    $('cine-etiq0').textContent = cine.opts.moi.nom;
    $('cine-etiq1').textContent = cine.opts.adv.nom;
  }

  function construireDecomptes() {
    for (const k of [0, 1]) {
      const items = new Map();
      for (const a of cine.actions[k]) {
        if (!items.has(a.nom)) items.set(a.nom, el('li', { class: 'avenir' }, ico(a.icone, 20), el('span', { text: a.nom }), el('span', { class: 'n', text: '–' })));
      }
      cine.decompte[k] = { items, cle: null };
      $('cine-decompte' + k).replaceChildren(...(items.size ? items.values() : [el('li', { class: 'avenir seul', text: 'Attaques automatiques seulement.' })]));
    }
    $('cine-titre-dc0').textContent = `Sorts et techniques de ${cine.opts.moi.nom}`;
    $('cine-titre-dc1').textContent = `Sorts et techniques de ${cine.opts.adv.nom}`;
  }

  // ------------------------------------------------------------ scénarios
  const LIBELLES_ISSUE = { victoire: 'Victoire', defaite: 'Défaite', nul: 'Match nul' };
  function rendreScenarios() {
    const o = cine.opts;
    const total = o.scenarios.reduce((s, x) => s + x.n, 0);
    $('cine-scenarios').replaceChildren(...o.scenarios.slice(0, 3).map((x, i) => {
      const b = el('button', { type: 'button', class: 'scenario ' + x.issue, 'aria-pressed': String(i === cine.choix) },
        el('b', null, el('i'), LIBELLES_ISSUE[x.issue]),
        el('small', { text: x.issue === 'nul' ? 'personne ne tombe' : `en ${Math.round(x.dureeMediane)} s environ` }),
        el('span', { class: 'num', text: `${x.n} duels sur ${total} · ${pc(x.part)}` }));
      b.addEventListener('click', () => { if (cine.choix !== i) { cine.choix = i; rendreScenarios(); charger(); } });
      return b;
    }));
  }

  function charger() {
    const o = cine.opts;
    const sc = o.scenarios[cine.choix];
    pause();
    const d = o.rejouer(sc);
    cine.duel = d;
    const im = d.images;
    // Le dernier pas peut tomber après la dernière image : la lecture va jusqu'à la fin du duel
    cine.T = Math.max(im[im.length - 1].t, d.duree);
    cine.t = 0;
    cine.cam = camera(im);
    cine.actions = [0, 1].map((k) => d.actions.filter((a) => a.camp === cote(k)));
    cine.coups = d.coups.map((h) => Object.assign({}, h, { k: h.cible === d.moi ? 0 : 1 }));
    const nomDe = (c) => (c === d.moi ? o.moi.nom : o.adv.nom);
    cine.legendes = d.evenements.map((e) => ({ t: e.t, texte: `${nomDe(e.cote)} : ${e.texte}` }));
    const fin = d.vainqueur == null ? `${fmtT(cine.T)} s écoulées : match nul`
      : `${nomDe(d.vainqueur)} l'emporte avec ${pc(d.pv[d.vainqueur])} de ses PV`;
    cine.legendes.push({ t: cine.T, texte: fin, fin: true });
    cine.cadres = [construireCadre($('cine-cadre0'), o.moi, 0), construireCadre($('cine-cadre1'), o.adv, 1)];
    for (const n of cine.flottants.values()) n.remove();
    cine.flottants.clear();
    construireArene();
    construireFrise();
    construireDecomptes();
    $('cine-temps').max = String(cine.T);
    $('cine-arene').setAttribute('aria-label', `${o.moi.nom} contre ${o.adv.nom}, vus de côté : duel de ${Math.round(cine.T)} secondes`);
    cine.largeur = $('cine-monde').clientWidth;
    if (o.surDuel) o.surDuel(d, sc);
    dessiner();
    if (!mouvementReduit) jouer(); else majBoutonLecture();
  }

  // ------------------------------------------------------------ dessin
  function majCadre(r, p, k, t) {
    ecrireStyle(r.pv, 'transform', `scaleX(${(p.pv / p.pvMax).toFixed(3)})`);
    ecrireTexte(r.pvCur, fmt(p.pv));
    ecrireTexte(r.pvMax, ' / ' + fmt(p.pvMax));
    ecrireStyle(r.res, 'transform', `scaleX(${p.r.toFixed(3)})`);
    ecrireStyle(r.res, 'background', COULEUR_RES[p.res] || 'var(--mana)');
    ecrireTexte(r.resVal, p.res === 'mana' ? pc(p.r) : String(p.rv));
    r.resVal.parentNode.title = p.res === 'mana' ? 'Mana' : p.res === 'rage' ? 'Rage' : 'Énergie';
    ecrireStyle(r.rgMana, 'visibility', p.mana == null ? 'hidden' : 'visible');
    if (p.mana != null) { ecrireStyle(r.mana, 'transform', `scaleX(${p.mana.toFixed(3)})`); ecrireTexte(r.manaVal, pc(p.mana)); }
    const pips = r.classe === 'voleur' || p.forme === 'felin';
    ecrireStyle(r.pips, 'visibility', pips ? 'visible' : 'hidden');
    if (r.cp !== p.cp) { r.cp = p.cp; [...r.pips.children].forEach((x, i) => { x.className = i < p.cp ? 'on' : ''; }); }
    if (r.classe === 'druide') ecrireTexte(r.sous, [cine.opts[k ? 'adv' : 'moi'].sous, NOMS_FORME[p.forme]].filter(Boolean).join(' · '));
    const etat = p.cc ? (ETATS_CC[p.cc.id] || p.cc.id) + (p.cc.nom && p.cc.nom !== p.cc.id ? ` · ${p.cc.nom}` : '') : p.furtif ? 'camouflé' : '';
    ecrireTexte(r.cc, etat);
    if (r.cc.hidden !== !etat) r.cc.hidden = !etat;
    // Incantation en cours, sinon les trois derniers sorts (le plus récent en premier)
    const acts = cine.actions[k];
    const n = nbJusqua(acts, t);
    const neuf = n > 0 && t - acts[n - 1].t < 1.5;
    const inc = p.inc;
    const cle = inc ? 'i' + inc.nom : 'a' + n + (neuf ? 'n' : '');
    if (r.filCle !== cle) {
      r.filCle = cle;
      if (inc) {
        ecrireTexte(r.incNom, inc.canal ? `${inc.nom} (canalisé)` : inc.nom);
        r.incIco.hidden = !inc.icone;
        if (inc.icone) r.incIco.src = srcIcone(inc.icone);
        r.fil.replaceChildren(r.incant);
      } else {
        r.fil.replaceChildren(...acts.slice(Math.max(0, n - 3), n).reverse().map((a, i) =>
          el('span', { class: i === 0 && neuf ? 'neuf' : '' }, ico(a.icone, 18), a.nom)));
      }
    }
    if (inc) ecrireStyle(r.incBarre, 'transform', `scaleX(${inc.p.toFixed(3)})`);
  }

  function majDecompte(k, t) {
    const acts = cine.actions[k], dc = cine.decompte[k];
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
      const x = comptes.get(nom) || 0;
      li.className = x ? (recents.has(nom) ? 'recent' : '') : 'avenir';
      li.lastChild.textContent = x ? '×' + x : '–';
    }
  }

  function creerFlottant(h) {
    const touche = h.genre === 'degat' || h.genre === 'crit' || h.genre === 'soin';
    const cl = 'flottant ' + (h.genre === 'soin' ? 'soin' : touche ? 'sur' + h.k : 'rate') + (h.genre === 'crit' ? ' crit' : '');
    const texte = h.genre === 'soin' ? '+' + fmt(h.m) : touche ? fmt(h.m) + (h.genre === 'crit' ? ' !' : '') : h.genre;
    return el('div', { class: cl, 'aria-hidden': 'true' },
      el('span', { class: 'ligne' }, h.icone ? ico(h.icone, 16) : null, texte),
      h.nom === 'Attaque' ? null : el('small', { text: h.nom }));
  }

  function dessiner() {
    const d = cine.duel;
    if (!d) return;
    const im = d.images, t = cine.t;
    const i = indice(im, t), j = Math.min(im.length - 1, i + 1);
    const p = im[i], q = im[j];
    const f = j > i ? Math.max(0, Math.min(1, (t - p.t) / (q.t - p.t))) : 0;
    const lerp = (a, b) => a + (b - a) * f;
    const P = [p.c[cote(0)], p.c[cote(1)]], Q = [q.c[cote(0)], q.c[cote(1)]];
    majCadre(cine.cadres[0], P[0], 0, t);
    majCadre(cine.cadres[1], P[1], 1, t);
    // arène
    const ww = lerp(cine.cam.w[i], cine.cam.w[j]);
    const lo = lerp(cine.cam.c[i], cine.cam.c[j]) - ww / 2;
    const ecran = (x) => (x - lo) / ww * 100;
    const xs = [lerp(P[0].x, Q[0].x), lerp(P[1].x, Q[1].x)];
    const sx = xs.map(ecran);
    // un repère tous les 5, 10, 20 ou 50 m, assez espacés pour que les chiffres ne se touchent pas
    const pasRepere = cine.largeur ? ([5, 10, 20].find((m) => m * cine.largeur / ww >= 46) || 50) : (ww > 50 ? 10 : 5);
    let x = Math.ceil((lo - ww * 0.1) / pasRepere) * pasRepere;
    for (const rp of cine.reperes) {
      const s = ecran(x);
      const vu = s <= 110;
      if (rp.hidden === vu) rp.hidden = !vu;
      if (vu) { ecrireStyle(rp, 'left', s.toFixed(2) + '%'); ecrireTexte(rp, x + ' m'); }
      x += pasRepere;
    }
    ecrireStyle(cine.lien, 'left', Math.min(sx[0], sx[1]).toFixed(2) + '%');
    ecrireStyle(cine.lien, 'width', Math.abs(sx[1] - sx[0]).toFixed(2) + '%');
    const ecartPx = Math.abs(sx[1] - sx[0]) / 100 * cine.largeur;
    if (cine.ecart.hidden !== ecartPx < 90) cine.ecart.hidden = ecartPx < 90;
    ecrireStyle(cine.ecart, 'left', ((sx[0] + sx[1]) / 2).toFixed(2) + '%');
    ecrireTexte(cine.ecart, Math.round(Math.abs(xs[1] - xs[0])) + ' m');
    // Combattants : jeton de classe, ou silhouette du druide en forme animale tournée vers l'adversaire
    const debord = Math.round(Math.max(-14, Math.min(14, ecartPx / 2 - 5)));
    for (const k of [0, 1]) {
      const g = cine.figs[k], st = P[k];
      const aGauche = xs[k] <= xs[1 - k];
      const forme = g.sil[st.forme] ? st.forme : null;
      if (g.forme !== forme) {
        g.forme = forme;
        basculer(g.jeton, 'off', !!forme);
        for (const [nom, n] of Object.entries(g.sil)) basculer(n, 'on', nom === forme);
      }
      ecrireStyle(g.fig, 'left', sx[k].toFixed(2) + '%');
      ecrireStyle(g.sils, 'transform', aGauche ? 'none' : 'scaleX(-1)');
      basculer(g.fig, 'controle', !!st.cc);
      basculer(g.fig, 'cache', st.furtif);
      // Noms sous les combattants, tournés vers l'extérieur pour ne pas se chevaucher
      const qui = cine.opts[k ? 'adv' : 'moi'];
      ecrireTexte(g.nom, qui.nom + (NOMS_FORME[st.forme] ? ' · ' + NOMS_FORME[st.forme] : ''));
      ecrireStyle(g.nom, 'left', sx[k].toFixed(2) + '%');
      ecrireStyle(g.nom, 'transform', aGauche ? `translateX(calc(-100% + ${debord}px))` : `translateX(${-debord}px)`);
      // Familier : à côté de son maître, du côté opposé à l'adversaire
      if (g.fam.hidden !== !st.fam) g.fam.hidden = !st.fam;
      if (st.fam) ecrireStyle(g.fam, 'left', `calc(${sx[k].toFixed(2)}% ${aGauche ? '-' : '+'} 30px)`);
    }
    // chiffres flottants au-dessus de la cible
    const coups = cine.coups, actifs = new Set();
    for (let k = nbJusqua(coups, t - VIE_FLOTTANT); k < coups.length && coups[k].t <= t + 1e-6; k++) {
      const h = coups[k];
      actifs.add(k);
      let n = cine.flottants.get(k);
      if (!n) { n = creerFlottant(h); cine.flottants.set(k, n); $('cine-monde').append(n); }
      const age = Math.max(0, t - h.t) / VIE_FLOTTANT;
      n.style.left = sx[h.k].toFixed(2) + '%';
      // trois couloirs : au centre (plus haut), à gauche, à droite, pour que les chiffres ne se chevauchent pas
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
    for (const tete of cine.tetes) ecrireStyle(tete, 'left', pos);
    const curseur = $('cine-temps');
    if (Math.abs(+curseur.value - t) > 0.05) curseur.value = t.toFixed(1);
    majDecompte(0, t);
    majDecompte(1, t);
    if (cine.opts.surTemps) cine.opts.surTemps(t);
  }

  // ------------------------------------------------------------ lecture
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
    if (cine.duel) majBoutonLecture();
  }
  function allerA(t) {
    if (!cine.duel) return;
    cine.t = Math.max(0, Math.min(cine.T, t));
    cine.dernier = 0;
    dessiner();
    majBoutonLecture();
  }

  let branche = false;
  function brancher() {
    if (branche) return;
    branche = true;
    $('cine-lecture').addEventListener('click', () => { if (cine.lecture) pause(); else jouer(); });
    $('cine-debut').addEventListener('click', () => { allerA(0); jouer(); });
    $('cine-temps').addEventListener('input', (e) => allerA(+e.target.value));
    const segs = $('cine-vitesse');
    for (const x of segs.children) x.setAttribute('aria-pressed', String(+x.dataset.v === cine.vitesse));
    segs.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      cine.vitesse = +b.dataset.v;
      memo.ecrire('vitesse', cine.vitesse);
      for (const x of segs.children) x.setAttribute('aria-pressed', String(x === b));
    });
    for (const k of [0, 1]) {
      const piste = $('cine-piste' + k);
      const viser = (ev) => { const b = piste.getBoundingClientRect(); if (b.width) allerA((ev.clientX - b.left) / b.width * cine.T); };
      piste.addEventListener('pointerdown', (ev) => {
        try { piste.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        piste._glisse = true; viser(ev);
      });
      piste.addEventListener('pointermove', (ev) => { if (piste._glisse) viser(ev); });
      for (const fin of ['pointerup', 'pointercancel']) piste.addEventListener(fin, () => { piste._glisse = false; });
    }
    const mesurer = () => { const l = $('cine-monde').clientWidth; if (l && l !== cine.largeur) { cine.largeur = l; dessiner(); } };
    if ('ResizeObserver' in window) new ResizeObserver(mesurer).observe($('cine-monde'));
    else window.addEventListener('resize', mesurer);
  }

  function montrer(opts) {
    brancher();
    cine.opts = opts;
    cine.choix = 0;
    rendreScenarios();
    charger();
  }

  window.Cinematique = { montrer, arreter: pause, allerA };
})();
