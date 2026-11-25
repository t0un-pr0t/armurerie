// Gestionnaire de personnages WoW Forever — lit l'armurerie officielle Blizzard.
// Aucune dépendance : Node >= 18 (fetch natif).
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { convertirDruide } = require('./druide.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const REFRESH_MINUTES = Number(process.env.REFRESH_MINUTES) || 15;
const LOCALE = process.env.LOCALE || 'fr-fr';
const ARMORY = 'https://worldofwarcraft.blizzard.com';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const LIST_FILE = path.join(DATA_DIR, 'characters.json');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const REGIONS = ['eu', 'us', 'kr', 'tw'];

// ---------- stockage ----------

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

let characters = readJson(LIST_FILE, []); // [{ region, name, surname }]
let cache = readJson(CACHE_FILE, {});     // key -> { status, error, fetchedAt, profile }

const slugOf = (c) => `${c.name}-${c.surname}`.toLowerCase().replace(/\s+/g, '');
const keyOf = (c) => `${c.region}/${slugOf(c)}`;
const armoryUrl = (c) =>
  `${ARMORY}/${LOCALE}/forever/${c.region}/armory/character/${encodeURIComponent(slugOf(c))}`;

// ---------- lecture de l'armurerie ----------

function extractState(html) {
  const marker = 'var characterProfileInitialState = ';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const end = html.indexOf('</script>', start);
  const raw = html.slice(start + marker.length, end).trim().replace(/;\s*$/, '');
  return JSON.parse(raw);
}

const icon = (o) => o?.media?.content?.assets?.find((a) => a.key === 'icon')?.value;

// Ne garde que ce que l'interface affiche.
function simplify(c) {
  const gear = Object.entries(c.gear || {}).map(([slot, it]) => ({
    slot,
    slotName: it.slot?.name || slot,
    id: it.id,
    name: it.name,
    quality: it.quality?.type,
    icon: icon(it),
  }));
  const prof = (p) => ({
    name: p.name,
    icon: p.icon?.url,
    skill: p.tiers?.[0]?.skillPoints,
    max: p.tiers?.[0]?.maxSkillPoints,
  });
  const stat = (e) => c.stats?.overview?.find((s) => s.enum === e)?.value?.value;
  return {
    name: c.name,
    surname: c.surname,
    region: c.region,
    level: c.level,
    race: c.race?.name,
    class: c.class?.name,
    classSlug: c.class?.slug,
    faction: c.faction?.enum,
    gender: c.gender?.name,
    ruleset: c.ruleset?.name,
    itemLevel: c.averageItemLevel,
    avatar: c.avatar?.url,
    render: c.render?.foreground?.url,
    specs: (c.specs || []).map((s) => ({ name: s.name, points: s.spentPoints, icon: s.icon?.url })),
    professions: [
      ...(c.professions?.primaries || []).map(prof),
      ...(c.professions?.secondaries || []).map(prof),
    ],
    health: stat('HEALTH'),
    mana: stat('MANA'),
    honorableKills: c.pvp?.honorableKills?.value,
    gear,
    armoryUpdatedAt: c.lastUpdatedTimestamp?.iso8601,
    isOutdated: c.isOutdated,
  };
}

// Donjons et raids terminés : même format que l'onglet « Donjons et raids » de l'armurerie.
// Pour Forever, Blizzard renvoie pour l'instant toujours {"expansions":[]}.
function simplifyInstances(data) {
  return (data?.expansions || []).flatMap((exp) =>
    (exp.raids || []).map((r) => ({
      expansion: exp.name,
      id: r.id,
      name: r.name,
      level: r.level,
      icon: r.icon?.url,
      difficulties: (r.difficulties || []).map((d) => ({
        name: d.name,
        count: d.count,
        total: d.total,
        bosses: (d.bosses || []).map((b) => ({ name: b.name, kills: b.killCount || 0 })),
      })),
    })));
}

const armoryFetch = (url) => fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (armurerie-forever)', 'Accept-Language': LOCALE },
  signal: AbortSignal.timeout(20000),
});

async function fetchInstances(c) {
  const res = await armoryFetch(`${armoryUrl(c)}/pve/raids.json`);
  if (!res.ok) throw new Error(`Donjons : HTTP ${res.status}`);
  return simplifyInstances(await res.json());
}

async function fetchCharacter(c) {
  const res = await armoryFetch(armoryUrl(c));
  if (res.status === 404 || res.status === 500) {
    // L'armurerie renvoie 500 pour un personnage inconnu ou pas encore indexé.
    const err = new Error("Personnage introuvable dans l'armurerie (pas encore indexé ?)");
    err.notFound = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Armurerie : HTTP ${res.status}`);
  const state = extractState(await res.text());
  if (!state?.character) throw new Error('Format de page inattendu');
  return state.character;
}

// Druide converti pour le simulateur ; une erreur de conversion ne bloque pas la fiche.
function druideDe(c, raw) {
  if (raw.class?.slug !== 'druid') return null;
  try { return convertirDruide({ key: keyOf(c), region: c.region, armoryUrl: armoryUrl(c) }, raw); }
  catch (e) { console.error(`Simulateur : ${keyOf(c)} non converti (${e.message})`); return null; }
}

const refreshing = new Set();

async function refreshOne(c) {
  const key = keyOf(c);
  if (refreshing.has(key)) return;
  refreshing.add(key);
  const prev = cache[key] || {};
  try {
    const raw = await fetchCharacter(c);
    const profile = simplify(raw);
    // Un échec sur les donjons ne bloque pas la fiche : on garde la dernière liste connue.
    profile.instances = await fetchInstances(c).catch(() => prev.profile?.instances || []);
    cache[key] = { status: 'ok', fetchedAt: new Date().toISOString(), profile, druide: druideDe(c, raw) };
  } catch (e) {
    cache[key] = {
      ...prev,
      status: e.notFound ? 'notfound' : 'error',
      error: e.message,
      attemptedAt: new Date().toISOString(),
    };
  } finally {
    refreshing.delete(key);
    writeJson(CACHE_FILE, cache);
  }
}

let lastFullRefresh = null;
async function refreshAll() {
  for (const c of characters) {
    await refreshOne(c);
    await new Promise((r) => setTimeout(r, 500)); // reste poli avec le site
  }
  lastFullRefresh = new Date().toISOString();
}

// ---------- API ----------

function view() {
  return {
    refreshMinutes: REFRESH_MINUTES,
    lastFullRefresh,
    characters: characters.map((c) => ({
      key: keyOf(c),
      ...c,
      armoryUrl: armoryUrl(c),
      refreshing: refreshing.has(keyOf(c)),
      ...sansDruide(cache[keyOf(c)] || { status: 'pending' }),
    })),
  };
}
const sansDruide = ({ druide, ...reste }) => reste;

// Druides au format du simulateur (public/simulateur/js/interface.js lit window.PERSONNAGES).
function druides() {
  return {
    source: '/',
    capture: lastFullRefresh,
    personnages: characters.map((c) => cache[keyOf(c)]?.druide).filter(Boolean),
  };
}

function send(res, code, body, type = 'application/json; charset=utf-8', cacheControl = 'no-store') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': cacheControl });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (d) => { data += d; if (data.length > 1e4) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// Accepte « Ohm Let », « ohm-let » ou { name, surname }.
function parseCharacter(body) {
  let { name, surname, full } = body;
  const region = String(body.region || 'eu').toLowerCase();
  if (full && !surname) [name, surname] = String(full).trim().split(/[\s-]+/);
  name = String(name || '').trim();
  surname = String(surname || '').trim();
  if (!name || !surname) throw new Error('Il faut un prénom et un nom (ex. « Ohm Let »).');
  if (!REGIONS.includes(region)) throw new Error(`Région inconnue : ${region}`);
  const cap = (s) => s.charAt(0).toLocaleUpperCase('fr') + s.slice(1).toLocaleLowerCase('fr');
  return { region, name: cap(name), surname: cap(surname) };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/characters' && req.method === 'GET') return send(res, 200, view());
    if (p === '/api/druides' && req.method === 'GET') return send(res, 200, druides());

    if (p === '/api/characters' && req.method === 'POST') {
      const c = parseCharacter(await readBody(req));
      if (characters.some((x) => keyOf(x) === keyOf(c))) return send(res, 409, { error: 'Déjà dans la liste.' });
      characters.push(c);
      writeJson(LIST_FILE, characters);
      await refreshOne(c);
      return send(res, 201, view());
    }

    let m = p.match(/^\/api\/characters\/([a-z]{2})\/([^/]+)(\/refresh)?$/);
    if (m) {
      const key = `${m[1]}/${decodeURIComponent(m[2])}`;
      const c = characters.find((x) => keyOf(x) === key);
      if (!c) return send(res, 404, { error: 'Personnage absent de la liste.' });
      if (m[3] && req.method === 'POST') { await refreshOne(c); return send(res, 200, view()); }
      if (!m[3] && req.method === 'DELETE') {
        characters = characters.filter((x) => x !== c);
        delete cache[key];
        writeJson(LIST_FILE, characters);
        writeJson(CACHE_FILE, cache);
        return send(res, 200, view());
      }
    }

    if (p === '/api/refresh' && req.method === 'POST') {
      refreshAll(); // en tâche de fond ; l'interface interroge /api/characters
      await new Promise((r) => setTimeout(r, 50));
      return send(res, 202, view());
    }

    if (req.method === 'GET' && !p.startsWith('/api/')) {
      if (p === '/simulateur') { res.writeHead(301, { Location: '/simulateur/' + url.search }); return res.end(); }
      const file = path.join(PUBLIC_DIR, p.endsWith('/') ? path.normalize(p) + 'index.html' : path.normalize(p));
      if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Interdit', 'text/plain');
      const ext = path.extname(file);
      // Les icônes ne changent pas : le navigateur les garde un jour.
      const cacheControl = ext === '.jpg' || ext === '.png' ? 'public, max-age=86400' : 'no-store';
      return fs.readFile(file, (err, buf) =>
        err ? send(res, 404, 'Introuvable', 'text/plain')
            : send(res, 200, buf, MIME[ext] || 'application/octet-stream', cacheControl));
    }
    send(res, 404, { error: 'Route inconnue' });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Armurerie Forever : http://localhost:${PORT} (réactualisation toutes les ${REFRESH_MINUTES} min)`);
  refreshAll();
  setInterval(refreshAll, REFRESH_MINUTES * 60 * 1000);
});
