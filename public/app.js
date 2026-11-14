'use strict';

const $ = (s) => document.querySelector(s);
const list = $('#list');
const POLL_MS = 60 * 1000;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (iso) => {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleString('fr-FR');
};

function showError(msg) {
  const el = $('#error');
  el.textContent = msg || '';
  el.hidden = !msg;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

function card(c) {
  const p = c.profile;
  const title = `${esc(c.name)} ${esc(c.surname)}`;
  const foot = `
    <div class="foot">
      <span class="grow">${c.refreshing ? '<span class="spin">⟳</span> mise à jour…'
        : `Lu ${ago(c.fetchedAt || c.attemptedAt)}${p?.armoryUpdatedAt ? ` · armurerie ${ago(p.armoryUpdatedAt)}` : ''}`}</span>
      <button data-act="refresh" data-key="${esc(c.key)}" title="Réactualiser">⟳</button>
      <button class="del" data-act="delete" data-key="${esc(c.key)}" title="Retirer">✕</button>
    </div>`;

  if (!p) {
    const msg = c.status === 'pending' ? 'Chargement…' : esc(c.error);
    return `<article class="card">
      <div class="top"><div class="avatar"></div><div class="who">
        <h2><a href="${esc(c.armoryUrl)}" target="_blank" rel="noopener">${title}</a></h2>
        <div class="sub">${esc(c.region.toUpperCase())}</div></div></div>
      <div class="msg ${c.status === 'pending' ? '' : 'err'}">${msg}</div>${foot}</article>`;
  }

  const specs = p.specs.filter((s) => s.points > 0)
    .map((s) => `<span class="chip"><img src="${esc(s.icon)}" alt="">${esc(s.name)} ${s.points}</span>`).join('');
  const profs = p.professions
    .map((x) => `<span class="chip"><img src="${esc(x.icon)}" alt="">${esc(x.name)} ${x.skill ?? 0}/${x.max ?? '?'}</span>`).join('');
  const gear = p.gear
    .map((g) => `<a class="${esc(g.quality)}" style="background-image:url('${esc(g.icon)}')"
      href="https://www.wowhead.com/forever/item=${g.id}" target="_blank" rel="noopener"
      title="${esc(g.slotName)} : ${esc(g.name)}"></a>`).join('');
  const instances = (p.instances || []).map((i) => {
    const d = i.difficulties[0] || {};
    const done = d.total > 0 && d.count >= d.total;
    const bosses = i.difficulties.flatMap((x) => x.bosses)
      .map((b) => `${b.kills > 0 ? '✔' : '✘'} ${b.name}${b.kills > 1 ? ` (×${b.kills})` : ''}`).join('\n');
    return `<li class="${done ? 'done' : ''}" title="${esc(bosses)}">
      ${i.icon ? `<img src="${esc(i.icon)}" alt="">` : ''}<span>${esc(i.name)}</span>
      <b>${d.count ?? 0}/${d.total ?? '?'}</b></li>`;
  }).join('');
  const stale = c.status !== 'ok' ? `<div class="msg err">Dernière lecture en échec : ${esc(c.error)}</div>` : '';

  const horde = p.faction === 'HORDE';
  return `<article class="card cls-${esc(p.classSlug)}">
    <div class="top">
      <div class="avatar" style="background-image:url('${esc(p.avatar)}')"></div>
      <div class="who">
        <h2><a href="${esc(c.armoryUrl)}" target="_blank" rel="noopener">${esc(p.name)} ${esc(p.surname)}</a></h2>
        <div class="sub"><span class="cls-name">${esc(p.class)}</span> · ${esc(p.race)}
          <span class="faction ${horde ? 'horde' : 'alliance'}">${horde ? 'Horde' : 'Alliance'}</span></div>
        <div class="sub">${esc(p.ruleset)} · ${esc(p.region.toUpperCase())} · niv. objets ${p.itemLevel ?? '—'}</div>
      </div>
      <div class="lvl">${p.level}<small>niveau</small></div>
    </div>
    <div class="body">
      <div class="chips">
        <span class="chip">❤ ${p.health ?? '—'}</span>
        ${p.mana ? `<span class="chip">💧 ${p.mana}</span>` : ''}
        ${p.honorableKills ? `<span class="chip">⚔ ${p.honorableKills} VH</span>` : ''}
        ${specs}
      </div>
      ${profs ? `<div class="chips">${profs}</div>` : ''}
      ${gear ? `<div class="gear">${gear}</div>` : ''}
      ${instances ? `<div><div class="label">Donjons et raids</div><ul class="instances">${instances}</ul></div>` : ''}
    </div>
    ${stale}${foot}</article>`;
}

let state = null;
function render() {
  if (!state) return;
  list.innerHTML = state.characters.length
    ? state.characters.map(card).join('')
    : '<p class="msg">Aucun personnage. Ajoutez-en un ci-dessus.</p>';
  $('#status').textContent = `Serveur : toutes les ${state.refreshMinutes} min · dernier passage ${ago(state.lastFullRefresh)}`;
}

async function load() {
  try { state = await api('GET', '/api/characters'); showError(''); render(); }
  catch (e) { showError(`Serveur injoignable : ${e.message}`); }
  // Tant qu'un personnage se met à jour, on réinterroge vite.
  clearTimeout(load.t);
  load.t = setTimeout(load, state?.characters.some((c) => c.refreshing || c.status === 'pending') ? 2000 : POLL_MS);
}

$('#add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    state = await api('POST', '/api/characters', { full: $('#full').value, region: $('#region').value });
    $('#full').value = '';
    showError('');
    render();
  } catch (err) { showError(err.message); }
  finally { btn.disabled = false; }
});

$('#refresh-all').addEventListener('click', async () => {
  try { state = await api('POST', '/api/refresh'); render(); load(); }
  catch (e) { showError(e.message); }
});

list.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const [region, slug] = b.dataset.key.split('/');
  const base = `/api/characters/${region}/${encodeURIComponent(slug)}`;
  try {
    if (b.dataset.act === 'delete') {
      if (!confirm('Retirer ce personnage de la liste ?')) return;
      state = await api('DELETE', base);
    } else {
      b.disabled = true;
      state = await api('POST', `${base}/refresh`);
    }
    showError('');
    render();
  } catch (err) { showError(err.message); b.disabled = false; }
});

setInterval(render, 30 * 1000); // garde les « il y a x min » à jour
load();
