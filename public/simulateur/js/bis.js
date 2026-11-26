/*
 * Page BiS et pré-BiS : pour une classe, une spécialisation, un niveau et une faction, le meilleur
 * objet de chaque emplacement sans donjon (pré-BiS) et donjons compris (BiS). Les listes viennent de
 * data/bis/<classe>.json (outils/bis.js) ; le choix est celui du simulateur (Equipement.choixBis).
 * L'adresse garde la sélection : bis.html?classe=druide&spec=farouche&niveau=60&faction=horde
 */
(function () {
  'use strict';
  const A = window.Arene;
  const E = window.Equipement;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const SPECS = {
    guerrier: { armes: 'Armes', fureur: 'Fureur', protection: 'Protection' },
    paladin: { sacre: 'Sacré', protection: 'Protection', vindicte: 'Vindicte' },
    chasseur: { maitrise: 'Maîtrise des bêtes', precision: 'Précision', survie: 'Survie' },
    voleur: { assassinat: 'Assassinat', combat: 'Combat', finesse: 'Finesse' },
    pretre: { discipline: 'Discipline', sacre: 'Sacré', ombre: 'Ombre' },
    chaman: { elementaire: 'Élémentaire', amelioration: 'Amélioration', restauration: 'Restauration' },
    mage: { arcanes: 'Arcanes', feu: 'Feu', givre: 'Givre' },
    demoniste: { affliction: 'Affliction', demonologie: 'Démonologie', destruction: 'Destruction' },
    druide: { equilibre: 'Équilibre', farouche: 'Combat farouche (félin)', 'farouche-tank': 'Combat farouche (ours, tank)', restauration: 'Restauration' },
  };
  const STATS = [
    ['STAMINA', 'Endurance'], ['STRENGTH', 'Force'], ['AGILITY', 'Agilité'], ['INTELLECT', 'Intelligence'], ['SPIRIT', 'Esprit'],
    ['ATTACK_POWER', 'PA'], ['SPELL_DAMAGE_DONE', 'dégâts des sorts'], ['SPELL_HEALING_DONE', 'soins'],
    ['FIRE_SPELL_DAMAGE', 'dégâts de feu'], ['FROST_SPELL_DAMAGE', 'dégâts de givre'], ['SHADOW_SPELL_DAMAGE', "dégâts d'ombre"],
    ['ARCANE_SPELL_DAMAGE', "dégâts d'arcanes"], ['NATURE_SPELL_DAMAGE', 'dégâts de nature'],
    ['MANA_REGENERATION', 'mana/5 s'], ['HEALTH_REGEN', 'vie/5 s'], ['DEFENSE_SKILL_RATING', 'défense'],
    ['BLOCK_VALUE', 'blocage'], ['SPELL_PENETRATION', 'pénétration des sorts'],
  ];
  const PCT = { crit: 'critique', toucher: 'toucher', esquive: 'esquive', critSorts: 'critique des sorts', toucherSorts: 'toucher des sorts' };
  const QUALITE_CLS = { POOR: 'q-mediocre', COMMON: 'q-commun', UNCOMMON: 'q-inhabituel', RARE: 'q-rare', EPIC: 'q-epique', LEGENDARY: 'q-legendaire' };

  const cache = {};
  const charger = (classe) => (cache[classe] = cache[classe] || fetch(`data/bis/${encodeURIComponent(classe)}.json`)
    .then((r) => { if (!r.ok) throw new Error(`listes introuvables (${r.status})`); return r.json(); }));

  // ------------------------------------------------------------ sélection
  const q = new URLSearchParams(location.search);
  const classes = Object.keys(SPECS).filter((c) => A.CLASSES[c]);
  $('classe').innerHTML = classes.map((c) => `<option value="${c}">${esc(A.CLASSES[c].nom)}</option>`).join('');
  $('classe').value = classes.includes(q.get('classe')) ? q.get('classe') : 'druide';
  function remplirSpecs(voulue) {
    const s = SPECS[$('classe').value];
    $('spec').innerHTML = Object.entries(s).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    $('spec').value = voulue in s ? voulue : Object.keys(s)[0];
  }
  remplirSpecs(q.get('spec'));
  if (/horde/i.test(q.get('faction') || '')) $('faction').value = 'horde';
  const niv = Number(q.get('niveau'));
  if (niv >= 10 && niv <= 60) $('niveau').value = Math.round(niv);
  $('tranches').innerHTML = E.TRANCHES.map((t) => `<button type="button" data-n="${t}">${t === 60 ? '60' : `${t - 9}-${t}`}</button>`).join('');

  const niveau = () => Math.max(10, Math.min(60, Math.round(Number($('niveau').value) || 60)));

  // ------------------------------------------------------------ affichage
  function statsTexte(o) {
    const t = [];
    if (o.arme) t.push(`${n1.format(o.arme.dps)} DPS (${o.arme.min}-${o.arme.max}, ${n1.format(o.arme.vitesse)} s)`);
    if (o.armure) t.push(`${o.armure} armure`);
    for (const [k, nom] of STATS) if (o.stats && o.stats[k]) t.push(`+${o.stats[k]} ${nom}`);
    for (const [k, v] of Object.entries(o.pct || {})) t.push(`+${v} % ${PCT[k] || k}`);
    return t.join(' · ');
  }

  function cellule(c, quoi) {
    if (!c) return `<td class="vide" data-l="${quoi}">${quoi === 'Pré-BiS' ? 'aucun objet hors donjon dans les listes' : '—'}</td>`;
    const o = c.objet;
    const marques = [
      c.conseille ? '<span class="marque liste" title="Objet de la liste BiS JcJ de la tranche">liste JcJ</span>' : '',
      c.raid ? '<span class="marque donjon">raid</span>' : c.donjon ? '<span class="marque donjon">donjon</span>' : '',
      c.rang > 6 ? `<span class="marque donjon">rang JcJ ${c.rang}</span>` : '',
      c.classic ? '<span class="marque classic" title="Objet repris de Classic : sa présence dans Forever n\'est pas confirmée">classique</span>' : '',
    ].join('');
    const info = [o.sousType, o.niveauRequis ? `niveau ${o.niveauRequis}` : '', o.ilvl ? `ilvl ${o.ilvl}` : ''].filter(Boolean).join(' · ');
    return `<td data-l="${quoi}"><div class="objet">
      ${o.icone ? `<img src="${esc(o.icone)}" alt="" width="32" height="32" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span></span>'}
      <div><a class="${QUALITE_CLS[o.qualite] || ''}" href="https://www.wowhead.com/forever/item=${o.id}" target="_blank" rel="noopener">${esc(o.nom)}</a> <span class="discret" style="font-size:12px">${esc(info)}</span></div>
      <div class="stats">${esc(statsTexte(o))}</div>
      <div class="source">${marques}${esc((c.source || '').replace(/\s*Classic\s*$/, ''))}${c.origine && / \(autre spé\)/.test(c.origine) ? ' · liste d\'une autre spé' : ''}</div>
    </div></td>`;
  }

  let jeton = 0;
  async function afficher() {
    const j = ++jeton;
    const classe = $('classe').value, spec = $('spec').value, n = niveau(), faction = $('faction').value;
    history.replaceState(null, '', `?classe=${classe}&spec=${encodeURIComponent(spec)}&niveau=${n}&faction=${faction}`);
    for (const b of $('tranches').children) b.setAttribute('aria-pressed', String(E.TRANCHES.find((t) => t >= n) === Number(b.dataset.n)));
    let d;
    try { d = await charger(classe); } catch (e) {
      if (j === jeton) { $('intro').textContent = `Impossible de charger les listes : ${e.message}.`; $('liste').innerHTML = ''; }
      return;
    }
    if (j !== jeton) return;
    const c = E.choixBis({ classe, spec, niveau: n, faction }, d);
    if (!c) { $('intro').textContent = 'Pas de liste pour cette spécialisation.'; $('liste').innerHTML = ''; return; }
    const nomSpec = SPECS[classe][spec];
    document.title = `BiS ${A.CLASSES[classe].nom} ${nomSpec} ${n} · Armurerie Forever`;
    const tranche = c.tranche === 60 ? 'niveau 60' : `tranche ${c.tranche - 9}-${c.tranche}`;
    $('intro').innerHTML = `<b>${esc(A.CLASSES[classe].nom)} ${esc(nomSpec)}</b>, niveau ${n}, ${faction === 'horde' ? 'Horde' : 'Alliance'} : `
      + `liste JcJ ${c.tranche === 60 ? 'du niveau 60' : `de la ${esc(tranche)}`}. ${c.lignes.filter((l) => l.pre && l.bis && l.pre.objet.id === l.bis.objet.id).length} emplacements sur ${c.lignes.length} ont déjà leur meilleur objet hors donjon.`;
    const rows = c.lignes.map((l) => `<tr><td class="slot">${esc(l.emplacementNom)}</td>${cellule(l.pre, 'Pré-BiS')}${l.pre && l.bis && l.pre.objet.id === l.bis.objet.id ? '<td class="vide" data-l="BiS">identique au pré-BiS</td>' : cellule(l.bis, 'BiS')}</tr>`).join('');
    $('liste').innerHTML = `<thead><tr><th>Emplacement</th><th class="pre">Pré-BiS</th><th class="bis">BiS</th></tr></thead><tbody>${rows}</tbody>`;
    const s = c.sources || {};
    $('sources').innerHTML = `Sources : ${[s.bis && `<a href="${esc(s.bis)}" target="_blank" rel="noopener">ForeverBattlegrounds</a> (BiS JcJ par tranche)`,
      s.montee && `<a href="${esc(s.montee)}" target="_blank" rel="noopener">Timesaver</a> (équipement de montée et pré-raid)`,
      '<a href="https://www.wowhead.com/forever" target="_blank" rel="noopener">Wowhead</a> (statistiques Forever des objets)'].filter(Boolean).join(', ')}. Listes mises à jour le ${esc(new Date(c.maj || d.maj).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))}.`;
  }

  $('classe').addEventListener('change', () => { remplirSpecs(''); afficher(); });
  $('spec').addEventListener('change', afficher);
  $('faction').addEventListener('change', afficher);
  $('niveau').addEventListener('change', afficher);
  $('tranches').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { $('niveau').value = b.dataset.n; afficher(); } });
  afficher();
}());
