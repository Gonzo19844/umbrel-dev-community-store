const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createCommerce } = require('./commerce');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const CONFIG_FILE = path.join(DATA_DIR, 'mrr-credentials.enc');
const KEY_FILE = path.join(DATA_DIR, 'config.key');
const MRR_BASE = (process.env.MRR_API_BASE || 'https://www.miningrigrentals.com/api/v2').replace(/\/$/, '');
const CACHE_MS = Math.max(15000, Number(process.env.MARKET_CACHE_MS || 60000));
const MARKUP = 0.05;
const MIN_HOURS = 3;
const MIN_PH = 0.005; // 5 TH/s
const MAX_PH = 100;
let credentials = { key: process.env.MRR_API_KEY || '', secret: process.env.MRR_API_SECRET || '' };
let cache = { at: 0, rigs: null };
let lastNonce = 0;
const handleCommerce = createCommerce({ DATA_DIR, json, readJson, sameOrigin, mrrGet, mrrPut, getMarket, makeQuote, saveCredentials, getCredentials: () => credentials });

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}
function contentType(file) {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'text/html; charset=utf-8';
}
function unitToPH(unit) {
  return ({ h: 1e-15, kh: 1e-12, mh: 1e-9, gh: 1e-6, th: 1e-3, ph: 1, eh: 1000 })[String(unit || '').toLowerCase()] || 0;
}
function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function safeWrite(file, data) {
  const temp = file + '.tmp';
  fs.writeFileSync(temp, data, { mode: 0o600 });
  fs.renameSync(temp, file);
  try { fs.chmodSync(file, 0o600); } catch (_) {}
}
function encryptionKey() {
  if (!fs.existsSync(KEY_FILE)) safeWrite(KEY_FILE, crypto.randomBytes(32));
  const key = fs.readFileSync(KEY_FILE);
  if (key.length !== 32) throw new Error('HASHRENT-Konfigurationsschlüssel ist ungültig. Bitte KEY_FILE sichern/wiederherstellen.');
  return key;
}
function saveCredentials(next) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(next), 'utf8'), cipher.final()]);
  const record = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
  safeWrite(CONFIG_FILE, record);
  credentials = next;
  cache = { at: 0, rigs: null };
}
function loadCredentials() {
  if (!fs.existsSync(CONFIG_FILE)) return;
  try {
    const record = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (record.version !== 1) throw new Error('Unbekannte Konfigurationsversion.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()]);
    const saved = JSON.parse(plain.toString('utf8'));
    if (typeof saved.key !== 'string' || typeof saved.secret !== 'string') throw new Error('Ungültige Zugangsdaten.');
    credentials = saved;
  } catch (error) {
    console.error('HASHRENT konnte die gespeicherten MRR-Zugangsdaten nicht laden:', error.message);
    credentials = { key: '', secret: '' };
  }
}
async function mrrRequestWith(endpoint, method, params, auth) {
  if (!auth?.key || !auth?.secret) {
    const error = new Error('MRR_API_KEY und MRR_API_SECRET sind nicht konfiguriert.');
    error.code = 'MRR_NOT_CONFIGURED';
    throw error;
  }
  const nonce = String(Math.max(Date.now(), lastNonce + 1));
  lastNonce = Number(nonce);
  const signature = crypto.createHmac('sha1', auth.secret)
    .update(auth.key + nonce + endpoint)
    .digest('hex');
  const isRead = method === 'GET';
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) form.set(key, String(value));
  const query = isRead ? form.toString() : '';
  const url = MRR_BASE + endpoint + (query ? '?' + query : '');
  const response = await fetch(url, {
    method,
    headers: {
      'x-api-key': auth.key,
      'x-api-nonce': nonce,
      'x-api-sign': signature,
      'accept': 'application/json',
      ...(isRead ? {} : { 'content-type': 'application/x-www-form-urlencoded' }),
      'user-agent': 'HASHRENT-Umbrel/0.4.0'
    },
    ...(!isRead ? { body: form.toString() } : {}),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('MiningRigRentals API antwortete mit HTTP ' + response.status);
  const payload = await response.json();
  if (!payload || payload.success !== true) {
    throw new Error(payload?.data?.message || 'MiningRigRentals hat die Zugangsdaten oder Anfrage abgelehnt.');
  }
  return payload.data;
}
async function mrrGetWith(endpoint, query, auth) {
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return mrrRequestWith(endpoint, 'GET', params, auth);
}
async function mrrGet(endpoint, query = '') {
  return mrrGetWith(endpoint, query, credentials);
}
async function mrrPut(endpoint, params) {
  return mrrRequestWith(endpoint, 'PUT', params, credentials);
}
function normalizeRig(rig) {
  const algo = String(rig.type || '').toLowerCase();
  if (algo !== 'sha256ab') return null;
  const availability = String(rig.available_status || rig.status?.status || '').toLowerCase();
  if (availability !== 'available') return null;
  if (rig.online === false || rig.status?.online === false || rig.status?.rented === true) return null;

  const hash = number(rig.hashrate?.advertised?.hash);
  const hashUnit = rig.hashrate?.advertised?.type;
  const rigPH = hash * unitToPH(hashUnit);
  const priceType = rig.price?.type || hashUnit;
  const priceUnitPH = unitToPH(priceType);
  const btc = rig.price?.BTC;
  const basePrice = number(btc?.price);
  if (!(rigPH > 0 && priceUnitPH > 0 && btc?.enabled !== false && basePrice > 0)) return null;

  return {
    id: String(rig.id),
    name: String(rig.name || ('ASIC Rig ' + rig.id)),
    region: String(rig.region || 'unbekannt'),
    hashratePH: rigPH,
    baseBTCPerPHDay: basePrice / priceUnitPH,
    customerBTCPerPHDay: (basePrice / priceUnitPH) * (1 + MARKUP),
    minHours: Math.max(MIN_HOURS, number(rig.minhours) || MIN_HOURS),
    maxHours: number(rig.maxhours) > 0 ? number(rig.maxhours) : 0,
    rpi: number(rig.rpi),
    url: String(rig.shorturl || ('https://www.miningrigrentals.com/rigs/' + rig.id))
  };
}
async function getMarket(force = false) {
  if (!force && cache.rigs && Date.now() - cache.at < CACHE_MS) return cache.rigs;
  const data = await mrrGet('/rig', 'type=sha256ab&currency=BTC&count=100&offset=0&orderby=price&orderdir=asc');
  const rows = Array.isArray(data) ? data : (Array.isArray(data?.records) ? data.records : (Array.isArray(data?.rigs) ? data.rigs : []));
  const rigs = rows.map(normalizeRig).filter(Boolean).sort((a, b) => a.customerBTCPerPHDay - b.customerBTCPerPHDay);
  cache = { at: Date.now(), rigs };
  return rigs;
}
function makeQuote(rigs, targetPH, hours) {
  if (!Number.isFinite(targetPH) || targetPH < MIN_PH || targetPH > MAX_PH) {
    const error = new Error('Hashrate muss zwischen 5 TH/s und 100 PH/s liegen.');
    error.status = 400; throw error;
  }
  if (!Number.isFinite(hours) || hours < MIN_HOURS) {
    const error = new Error('Mietdauer muss mindestens 3 Stunden betragen.');
    error.status = 400; throw error;
  }
  let remaining = targetPH;
  let totalBase = 0;
  let totalCustomer = 0;
  const selected = [];
  for (const rig of rigs) {
    if (remaining <= 0) break;
    if (rig.maxHours && hours > rig.maxHours) continue;
    if (hours < rig.minHours) continue;
    const allocatedPH = rig.hashratePH;
    const base = allocatedPH * rig.baseBTCPerPHDay * hours / 24;
    const customer = base * (1 + MARKUP);
    selected.push({
      id: rig.id, name: rig.name, region: rig.region,
      allocatedPH, rigHashratePH: rig.hashratePH,
      baseBTC: base, customerBTC: customer, url: rig.url
    });
    totalBase += base;
    totalCustomer += customer;
    remaining -= allocatedPH;
  }
  return {
    algorithm: 'SHA-256 ASICBoost',
    targetPH, suppliedPH: targetPH - remaining, missingPH: Math.max(0, remaining),
    hours, markupPercent: 5, baseBTC: totalBase, markupBTC: totalCustomer - totalBase,
    totalBTC: totalCustomer, complete: remaining <= 1e-9, rigs: selected,
    note: 'Unverbindliche Live-Kalkulation. Es wurde keine Miete ausgelöst.'
  };
}
async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16384) throw new Error('Anfrage ist zu groß.');
  }
  return JSON.parse(body || '{}');
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (_) { return false; }
}

loadCredentials();
fs.mkdirSync(DATA_DIR, { recursive: true });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const commerceHandled = await handleCommerce(req, res, pathname, url);
  if (commerceHandled !== false) return;
  if (pathname === '/health') return json(res, 200, { ok: true, app: 'HASHRENT', version: '0.5.3' });
  if (pathname === '/api/settings' && req.method === 'GET') {
    return json(res, 200, { configured: Boolean(credentials.key && credentials.secret), source: fs.existsSync(CONFIG_FILE) ? 'encrypted-file' : (credentials.key ? 'environment' : 'none') });
  }
  if (pathname === '/api/settings' && req.method === 'POST') {
    if (!sameOrigin(req)) return json(res, 403, { error: 'Ungültige Herkunft der Anfrage.' });
    if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'JSON wird erwartet.' });
    try {
      const body = await readJson(req);
      const key = String(body.key || '').trim();
      const secret = String(body.secret || '').trim();
      if (!key || !secret || key.length > 512 || secret.length > 512) return json(res, 400, { error: 'Bitte API-Key und API-Secret vollständig eingeben.' });
      await mrrGetWith('/rig', 'type=sha256ab&currency=BTC&count=1&offset=0', { key, secret });
      saveCredentials({ key, secret });
      return json(res, 200, { ok: true, configured: true, message: 'Verbindung erfolgreich. Zugangsdaten verschlüsselt gespeichert.' });
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : 502;
      return json(res, status, { error: error.message || 'Einstellungen konnten nicht gespeichert werden.' });
    }
  }
  if (pathname === '/api/account' && req.method === 'GET') {
    try {
      const [account, profiles] = await Promise.all([
        mrrGet('/whoami'),
        mrrGet('/account/profile', 'algo=sha256ab')
      ]);
      const list = Array.isArray(profiles) ? profiles : [];
      const safeProfiles = list.filter(p => String(p.algo?.name || '').toLowerCase() === 'sha256ab')
        .map(p => ({ id: String(p.id), name: String(p.name || ('Pool-Profil ' + p.id)), algorithm: 'SHA-256 ASICBoost' }));
      return json(res, 200, {
        authenticated: account?.authed === true,
        permissions: { rent: String(account?.permissions?.rent || 'no').toLowerCase() === 'yes' },
        profiles: safeProfiles
      });
    } catch (error) {
      return json(res, error.code === 'MRR_NOT_CONFIGURED' ? 503 : 502, { error: error.message, code: error.code || 'MRR_ACCOUNT_ERROR' });
    }
  }
  if (pathname === '/api/rentals' && req.method === 'GET') {
    try {
      const data = await mrrGet('/rental', 'type=renter&algo=sha256ab&history=false&limit=50');
      const rows = Array.isArray(data) ? data : (Array.isArray(data?.rentals) ? data.rentals : []);
      const safeRentals = rows.map(r => ({
        id: String(r.id || r.rentalid || ''),
        rigId: String(r.rig || r.rigid || ''),
        name: String(r.rig_name || r.name || ('Rig #' + (r.rig || r.rigid || '?'))),
        status: String(r.status || r.rental_status || 'active'),
        start: r.start || r.time_start || null,
        end: r.end || r.time_end || null,
        hashrate: r.hashrate?.advertised?.nice || r.hashrate?.nice || null,
        url: r.id ? 'https://www.miningrigrentals.com/rentals/' + encodeURIComponent(String(r.id)) : null
      }));
      return json(res, 200, { rentals: safeRentals });
    } catch (error) {
      return json(res, error.code === 'MRR_NOT_CONFIGURED' ? 503 : 502, { error: error.message, code: error.code || 'MRR_RENTALS_ERROR' });
    }
  }
  if (pathname === '/api/rentals' && req.method === 'POST') {
    if (!sameOrigin(req)) return json(res, 403, { error: 'Ungültige Herkunft der Anfrage.' });
    if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'JSON wird erwartet.' });
    try {
      const body = await readJson(req);
      if (body.confirm !== true) return json(res, 400, { error: 'Die Mietbestätigung fehlt.' });
      const rigId = String(body.rigId || '');
      const profileId = String(body.profileId || '');
      const hours = Number(body.hours);
      if (!/^\d{1,12}$/.test(rigId) || !/^\d{1,12}$/.test(profileId)) return json(res, 400, { error: 'Ungültige Rig- oder Profil-ID.' });
      if (!Number.isInteger(hours) || hours < MIN_HOURS || hours > 720) return json(res, 400, { error: 'Mietdauer muss zwischen 3 und 720 ganzen Stunden liegen.' });
      const [account, profiles, rawRig] = await Promise.all([
        mrrGet('/whoami'),
        mrrGet('/account/profile', 'algo=sha256ab'),
        mrrGet('/rig/' + rigId)
      ]);
      if (String(account?.permissions?.rent || '').toLowerCase() !== 'yes') return json(res, 403, { error: 'Dein MRR-API-Key besitzt keine Mietberechtigung (rent).' });
      const profileList = Array.isArray(profiles) ? profiles : [];
      const profile = profileList.find(p => String(p.id) === profileId && String(p.algo?.name || '').toLowerCase() === 'sha256ab');
      if (!profile) return json(res, 400, { error: 'Das ausgewählte Pool-Profil ist kein SHA-256-ASICBoost-Profil.' });
      const rigRows = Array.isArray(rawRig) ? rawRig : [rawRig];
      const rig = normalizeRig(rigRows[0] || {});
      if (!rig || rig.id !== rigId) return json(res, 409, { error: 'Das ausgewählte Rig ist nicht mehr verfügbar oder kein SHA-256-ASICBoost-Rig.' });
      if (hours < rig.minHours || (rig.maxHours && hours > rig.maxHours)) return json(res, 409, { error: 'Die Mietdauer liegt außerhalb des aktuellen Mietfensters dieses Rigs.' });
      const priceType = String(rigRows[0].price?.type || rigRows[0].hashrate?.advertised?.type || 'th').toLowerCase();
      const ratePrice = number(rigRows[0].price?.BTC?.price);
      if (!(ratePrice > 0)) return json(res, 409, { error: 'Für dieses Rig ist aktuell kein BTC-Preis verfügbar.' });
      const created = await mrrPut('/rental', {
        rig: rigId, length: hours, profile: profileId, currency: 'BTC',
        'rate[type]': priceType, 'rate[price]': ratePrice
      });
      if (created?.success === false || !(created?.id || created?.rentalid)) {
        return json(res, 502, { error: created?.message || 'MRR hat keinen bestätigten Mietauftrag zurückgegeben.' });
      }
      cache = { at: 0, rigs: null };
      return json(res, 201, {
        ok: true, rentalId: String(created.id || created.rentalid),
        rigId, rigName: rig.name, hours, profileName: String(profile.name || ''),
        hashratePH: rig.hashratePH,
        mrrUrl: 'https://www.miningrigrentals.com/rentals/' + encodeURIComponent(String(created.id || created.rentalid)),
        message: 'MRR hat den Mietauftrag bestätigt.'
      });
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : (error.code === 'MRR_NOT_CONFIGURED' ? 503 : 502);
      return json(res, status, { error: error.message || 'Mietauftrag konnte nicht erstellt werden.', code: error.code || 'RENTAL_CREATE_ERROR' });
    }
  }
  if (pathname === '/api/market') {
    try {
      const rigs = await getMarket(url.searchParams.get('refresh') === '1');
      return json(res, 200, {
        algorithm: 'SHA-256 ASICBoost', source: 'MiningRigRentals API v2',
        updatedAt: new Date(cache.at).toISOString(), cacheSeconds: Math.round(CACHE_MS / 1000),
        markupPercent: 5, availableRigs: rigs.length,
        totalAvailablePH: rigs.reduce((sum, rig) => sum + rig.hashratePH, 0),
        rigs: rigs.slice(0, 30)
      });
    } catch (error) {
      const status = error.code === 'MRR_NOT_CONFIGURED' ? 503 : 502;
      return json(res, status, { error: error.message, code: error.code || 'MRR_API_ERROR' });
    }
  }
  if (pathname === '/api/quote') {
    try {
      const targetPH = Number(url.searchParams.get('ph'));
      const hours = Number(url.searchParams.get('hours'));
      const rigs = await getMarket();
      return json(res, 200, makeQuote(rigs, targetPH, hours));
    } catch (error) {
      return json(res, error.status || (error.code === 'MRR_NOT_CONFIGURED' ? 503 : 502), { error: error.message, code: error.code || 'QUOTE_ERROR' });
    }
  }

  const requested = pathname === '/' ? 'index.html' : (pathname === '/admin' || pathname === '/settings' ? 'admin.html' : (pathname.startsWith('/order/') ? 'order.html' : (pathname.startsWith('/checkout/') ? 'checkout.html' : pathname.replace(/^\/+/, ''))));
  const file = path.resolve(PUBLIC_DIR, requested);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(data);
  });
});
server.listen(PORT, '0.0.0.0', () => console.log('HASHRENT 0.5.3 listening on ' + PORT));
