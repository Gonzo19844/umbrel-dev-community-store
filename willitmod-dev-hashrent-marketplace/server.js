const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const MRR_BASE = (process.env.MRR_API_BASE || 'https://www.miningrigrentals.com/api/v2').replace(/\/+$/, '');
const ALGO = 'sha256ab';
const MARKUP = 0.05;
const CACHE_TTL_MS = 60_000;
const MAX_RIGS = 100;
let marketCache = { data: null, fetchedAt: 0 };
let lastNonce = 0;

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function contentType(file) {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'text/html; charset=utf-8';
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const UNIT_HPS = { hash: 1, kh: 1e3, mh: 1e6, gh: 1e9, th: 1e12, ph: 1e15, eh: 1e18 };

function normalizeRig(rig) {
  const hash = rig.hashrate && rig.hashrate.advertised;
  const price = rig.price || {};
  const currency = price.BTC || {};
  const hashUnit = String(hash && hash.type || '').toLowerCase();
  const priceUnit = String(price.type || '').toLowerCase();
  const hashFactor = UNIT_HPS[hashUnit];
  const priceFactor = UNIT_HPS[priceUnit];
  const hashrateHps = number(hash && hash.hash, NaN);
  const pricePerUnit = number(currency.price, NaN);
  const status = rig.status || {};
  const available = status.status === 'available' || rig.available_status === 'available';
  if (!rig.id || !Number.isFinite(hashrateHps) || !hashFactor || !priceFactor ||
      !Number.isFinite(pricePerUnit) || pricePerUnit <= 0 || currency.enabled === false ||
      !available || status.rented === true || rig.online === false || status.online === false) return null;

  const hashratePH = hashrateHps * hashFactor / 1e15;
  const pricePerPHDayBTC = pricePerUnit * (1e15 / priceFactor);
  const minHours = number(rig.minhours, 3);
  const maxHours = number(rig.maxhours, 0);
  if (hashratePH <= 0 || pricePerPHDayBTC <= 0 || maxHours < 3 || minHours > maxHours) return null;

  return {
    id: String(rig.id),
    name: String(rig.name || 'MRR Rig'),
    region: String(rig.region || 'Unbekannt'),
    hashratePH,
    pricePerPHDayBTC,
    minHours,
    maxHours,
    rpi: rig.rpi == null ? null : number(rig.rpi, null),
    url: rig.shorturl && /^https?:\/\//i.test(rig.shorturl)
      ? rig.shorturl : 'https://www.miningrigrentals.com/rigs/' + encodeURIComponent(rig.id)
  };
}

function extractRecords(payload) {
  if (!payload || payload.success === false) {
    throw new Error((payload && payload.message) || 'MRR hat die Anfrage abgelehnt.');
  }
  const data = payload.data || payload;
  const records = Array.isArray(data) ? data : data.records;
  if (!Array.isArray(records)) throw new Error('Unerwartetes Antwortformat der MRR-API.');
  return records;
}

async function mrrGet(endpoint, params = {}) {
  const url = new URL(MRR_BASE + endpoint);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  const headers = { accept: 'application/json', 'user-agent': 'HASHRENT-Umbrel/0.2' };
  const apiKey = process.env.MRR_API_KEY;
  const apiSecret = process.env.MRR_API_SECRET;
  if (apiKey && apiSecret) {
    const nonce = String(Math.max(Date.now(), lastNonce + 1));
    lastNonce = Number(nonce);
    const signature = crypto.createHmac('sha1', apiSecret)
      .update(apiKey + nonce + endpoint)
      .digest('hex');
    headers['x-api-key'] = apiKey;
    headers['x-api-nonce'] = nonce;
    headers['x-api-sign'] = signature;
  }

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const detail = response.status === 401 || response.status === 403
      ? 'MRR verlangt für diesen API-Aufruf eine gültige API-Anmeldung. Hinterlege MRR_API_KEY und MRR_API_SECRET serverseitig.'
      : 'MRR API antwortete mit HTTP ' + response.status + '.';
    throw new Error(detail);
  }
  return response.json();
}

async function getMarket(force = false) {
  if (!force && marketCache.data && Date.now() - marketCache.fetchedAt < CACHE_TTL_MS) {
    return { ...marketCache, cached: true };
  }
  try {
    const payload = await mrrGet('/rig', {
      type: ALGO,
      currency: 'BTC',
      count: MAX_RIGS,
      offset: 0,
      orderby: 'price',
      orderdir: 'asc',
      offline: 'false',
      rented: 'false'
    });
    const rigs = extractRecords(payload).map(normalizeRig).filter(Boolean);
    rigs.sort((a, b) => a.pricePerPHDayBTC - b.pricePerPHDayBTC);
    marketCache = { data: rigs, fetchedAt: Date.now() };
    return { ...marketCache, cached: false };
  } catch (error) {
    if (marketCache.data && Date.now() - marketCache.fetchedAt < 10 * 60_000) {
      return { ...marketCache, cached: true, stale: true, warning: error.message };
    }
    throw error;
  }
}

function buildBasket(rigs, targetPH, hours) {
  const candidates = rigs
    .filter(rig => rig.minHours <= hours && rig.maxHours >= hours)
    .slice()
    .sort((a, b) => a.pricePerPHDayBTC - b.pricePerPHDayBTC);

  const selected = [];
  let deliveredPH = 0;
  let acquisitionBTC = 0;
  for (const rig of candidates) {
    if (deliveredPH >= targetPH) break;
    selected.push(rig);
    deliveredPH += rig.hashratePH;
    acquisitionBTC += rig.pricePerPHDayBTC * rig.hashratePH * hours / 24;
  }
  if (deliveredPH + 1e-9 < targetPH) return null;
  return { selected, deliveredPH, acquisitionBTC };
}

function maxHoursFor(rigs, targetPH) {
  const ceiling = Math.min(480, Math.max(3, ...rigs.map(rig => rig.maxHours)));
  for (let hours = ceiling; hours >= 3; hours -= 1) {
    if (buildBasket(rigs, targetPH, hours)) return hours;
  }
  return 0;
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === '/api/market' && req.method === 'GET') {
      const market = await getMarket(url.searchParams.get('refresh') === '1');
      return send(res, 200, {
        ok: true,
        algorithm: 'SHA256 Asicboost',
        algorithmId: ALGO,
        currency: 'BTC',
        markupPercent: MARKUP * 100,
        fetchedAt: market.fetchedAt,
        cached: market.cached,
        stale: Boolean(market.stale),
        warning: market.warning || null,
        totalOffers: market.data.length,
        offers: market.data.slice(0, 20)
      });
    }

    if (url.pathname === '/api/quote' && req.method === 'GET') {
      const targetPH = number(url.searchParams.get('hashratePH'), NaN);
      const hours = number(url.searchParams.get('hours'), NaN);
      if (!Number.isFinite(targetPH) || targetPH < 1 || targetPH > 100) {
        return send(res, 400, { ok: false, error: 'Hashrate muss zwischen 1 und 100 PH/s liegen.' });
      }
      if (!Number.isInteger(hours) || hours < 3 || hours > 480) {
        return send(res, 400, { ok: false, error: 'Die Mietdauer muss zwischen 3 und 480 Stunden liegen.' });
      }
      const market = await getMarket();
      const basket = buildBasket(market.data, targetPH, hours);
      const maxSupportedHours = maxHoursFor(market.data, targetPH);
      if (!basket) {
        return send(res, 200, {
          ok: false,
          error: 'Für diese Hashrate und Mietdauer ist aktuell keine vollständige Rig-Kombination verfügbar.',
          requestedHashratePH: targetPH,
          hours,
          maxSupportedHours,
          availableHashratePH: market.data
            .filter(rig => rig.minHours <= hours && rig.maxHours >= hours)
            .reduce((sum, rig) => sum + rig.hashratePH, 0)
        });
      }
      const markupBTC = basket.acquisitionBTC * MARKUP;
      return send(res, 200, {
        ok: true,
        algorithm: 'SHA256 Asicboost',
        currency: 'BTC',
        requestedHashratePH: targetPH,
        deliveredHashratePH: Number(basket.deliveredPH.toFixed(6)),
        hours,
        maxSupportedHours,
        rigCount: basket.selected.length,
        acquisitionBTC: basket.acquisitionBTC,
        markupBTC,
        customerTotalBTC: basket.acquisitionBTC + markupBTC,
        markupPercent: MARKUP * 100,
        rigs: basket.selected.map(rig => ({
          id: rig.id, name: rig.name, region: rig.region,
          hashratePH: rig.hashratePH, pricePerPHDayBTC: rig.pricePerPHDayBTC,
          minHours: rig.minHours, maxHours: rig.maxHours, url: rig.url
        })),
        fetchedAt: market.fetchedAt
      });
    }
    return send(res, 404, { ok: false, error: 'API-Endpunkt nicht gefunden.' });
  } catch (error) {
    return send(res, 502, { ok: false, error: error.message || 'MRR-Verbindung fehlgeschlagen.' });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (url.pathname === '/health') {
    return send(res, 200, { ok: true, app: 'HASHRENT', mode: 'mrr-market', algorithm: ALGO });
  }
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, requested);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
    res.end(data);
  });
});

fs.mkdirSync(DATA_DIR, { recursive: true });
server.listen(PORT, '0.0.0.0', () => console.log('HASHRENT MRR market listening on ' + PORT));
