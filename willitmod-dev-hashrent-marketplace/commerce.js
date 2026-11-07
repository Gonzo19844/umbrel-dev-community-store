const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createCommerce(deps) {
  const { DATA_DIR, json, readJson, sameOrigin, mrrGet, mrrPut, getMarket, makeQuote, saveCredentials, getCredentials } = deps;
  const adminFile = path.join(DATA_DIR, 'admin.json');
  const offersFile = path.join(DATA_DIR, 'offers.json');
  const ordersFile = path.join(DATA_DIR, 'orders.json');
  const sessions = new Map();
  let busyOrders = new Set();

  function readFile(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
  }
  function writeFile(file, value) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
    try { fs.chmodSync(file, 0o600); } catch (_) {}
  }
  function admin() { return readFile(adminFile, null); }
  function offers() { return readFile(offersFile, []); }
  function orders() { return readFile(ordersFile, []); }
  function saveOrders(rows) { writeFile(ordersFile, rows); }
  function token() { return crypto.randomBytes(24).toString('hex'); }
  function cookie(req) {
    const raw = String(req.headers.cookie || '');
    const match = raw.match(/(?:^|;\s*)hashrent_admin=([a-f0-9]{48})/);
    return match ? match[1] : '';
  }
  function isAdmin(req) {
    const id = cookie(req);
    const expires = sessions.get(id);
    if (!id || !expires || expires < Date.now()) { sessions.delete(id); return false; }
    return true;
  }
  function sessionCookie(res, value, maxAge) {
    res.setHeader('set-cookie', 'hashrent_admin=' + value + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + maxAge);
  }
  function sortDeep(value) {
    if (Array.isArray(value)) return value.map(sortDeep);
    if (value && typeof value === 'object') return Object.keys(value).sort().reduce((out, key) => { out[key] = sortDeep(value[key]); return out; }, {});
    return value;
  }
  function verifyIpn(body, signature, secret) {
    if (!signature || !secret) return false;
    const digest = crypto.createHmac('sha512', secret).update(JSON.stringify(sortDeep(body))).digest('hex');
    try { return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(String(signature), 'hex')); } catch (_) { return false; }
  }
  async function nowRequest(endpoint, method, body, apiKey) {
    const response = await fetch('https://api.nowpayments.io/v1' + endpoint, {
      method,
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || ('NOWPayments HTTP ' + response.status));
    return data;
  }
  function safeOffer(offer) {
    return { id: offer.id, name: offer.name, description: offer.description, minPH: offer.minPH, maxPH: offer.maxPH, minHours: offer.minHours, maxHours: offer.maxHours, enabled: offer.enabled === true };
  }
  async function provision(order) {
    if (busyOrders.has(order.id)) return;
    busyOrders.add(order.id);
    try {
      const rows = orders();
      const current = rows.find(x => x.id === order.id);
      if (!current || current.status !== 'paid') return;
      current.status = 'provisioning';
      current.updatedAt = new Date().toISOString();
      saveOrders(rows);

      const cfg = getCredentials();
      const profileId = String(cfg.defaultProfileId || '');
      if (!profileId) throw new Error('Im HASHRENT-Admin wurde noch kein SHA-256-ASICBoost-Poolprofil festgelegt.');
      const account = await mrrGet('/whoami');
      if (String(account?.permissions?.rent || '').toLowerCase() !== 'yes') throw new Error('Der MRR-API-Key besitzt keine Mietberechtigung.');
      const profiles = await mrrGet('/account/profile', 'algo=sha256ab');
      const profile = (Array.isArray(profiles) ? profiles : []).find(p => String(p.id) === profileId && String(p.algo?.name || '').toLowerCase() === 'sha256ab');
      if (!profile) throw new Error('Das konfigurierte MRR-Poolprofil ist nicht mehr verfügbar oder kein SHA-256-ASICBoost-Profil.');

      const live = await getMarket(true);
      const selectedRigs = (current.privateRigs || []).map(saved => live.find(r => String(r.id) === String(saved.id))).filter(Boolean);
      const supplied = selectedRigs.reduce((sum, r) => sum + Number(r.hashratePH || 0), 0);
      if (selectedRigs.length !== (current.privateRigs || []).length || supplied + 1e-9 < Number(current.targetPH)) throw new Error('Die ursprünglich kalkulierte Hashrate ist nach Zahlung nicht mehr vollständig verfügbar.');
      const liveCostBTC = selectedRigs.reduce((sum, rig) => sum + Number(rig.hashratePH) * Number(rig.baseBTCPerPHDay) * Number(current.hours) / 24, 0);
      if (liveCostBTC > Number(current.baseBTC) * 1.000001) throw new Error('Der MRR-Einkaufspreis ist seit der Kundenrechnung gestiegen. Die Bestellung wurde zur manuellen Prüfung gestoppt, damit deine Marge nicht aufgezehrt wird.');
      const createdIds = [];
      for (const selected of selectedRigs) {
        const raw = await mrrGet('/rig/' + encodeURIComponent(String(selected.id)));
        const rig = Array.isArray(raw) ? raw[0] : raw;
        if (!rig || String(rig.type || '').toLowerCase() !== 'sha256ab' ||
            String(rig.available_status || rig.status?.status || '').toLowerCase() !== 'available' ||
            rig.online === false || rig.status?.rented === true) {
          throw new Error('Ein benötigtes SHA-256-ASICBoost-Rig ist inzwischen nicht mehr verfügbar.');
        }
        const priceType = String(rig.price?.type || rig.hashrate?.advertised?.type || 'th').toLowerCase();
        const ratePrice = Number(rig.price?.BTC?.price || 0);
        if (!(ratePrice > 0) || Number(current.hours) < Math.max(3, Number(rig.minhours || 3)) ||
            (Number(rig.maxhours) > 0 && Number(current.hours) > Number(rig.maxhours))) {
          throw new Error('Preis oder Mietfenster eines benötigten Rigs hat sich geändert.');
        }
        const created = await mrrPut('/rental', {
          rig: String(selected.id), length: Number(current.hours), profile: profileId, currency: 'BTC',
          'rate[type]': priceType, 'rate[price]': ratePrice
        });
        const rentalId = String(created?.id || created?.rentalid || '');
        if (!rentalId) throw new Error('MRR hat für Rig ' + selected.id + ' keine bestätigte Miet-ID zurückgegeben.');
        createdIds.push(rentalId);
        const latest = orders();
        const row = latest.find(x => x.id === order.id);
        if (row) { row.privateRentalIds = createdIds; row.updatedAt = new Date().toISOString(); saveOrders(latest); }
      }
      const latest = orders();
      const row = latest.find(x => x.id === order.id);
      if (row) {
        row.status = 'active';
        row.privateRentalIds = createdIds;
        row.completedAt = new Date().toISOString();
        row.updatedAt = row.completedAt;
        saveOrders(latest);
      }
    } catch (error) {
      const rows = orders();
      const row = rows.find(x => x.id === order.id);
      if (row) {
        row.status = 'provisioning_attention';
        row.errorInternal = String(error.message || error);
        row.updatedAt = new Date().toISOString();
        saveOrders(rows);
      }
    } finally { busyOrders.delete(order.id); }
  }

  return async function handleCommerce(req, res, pathname, url) {
    if (['/api/market','/api/quote','/api/account','/api/rentals','/api/settings'].includes(pathname)) return json(res, 404, { error: 'Diese internen MRR-Endpunkte sind nicht öffentlich verfügbar.' });
    if (pathname === '/api/admin/status' && req.method === 'GET') {
      const cfg = getCredentials();
      return json(res, 200, { setupRequired: !admin(), authenticated: isAdmin(req), nowPaymentsConfigured: Boolean(cfg.nowPaymentsKey && cfg.nowPaymentsIpnSecret), mrrConfigured: Boolean(cfg.key && cfg.secret) });
    }
    if (pathname === '/api/admin/setup' && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Ungültige Herkunft der Anfrage.' });
      if (admin()) return json(res, 409, { error: 'Die Admin-Ersteinrichtung wurde bereits abgeschlossen.' });
      try {
        const body = await readJson(req);
        const password = String(body.password || '');
        if (password.length < 14 || password.length > 256) return json(res, 400, { error: 'Das Admin-Passwort muss mindestens 14 Zeichen lang sein.' });
        const salt = crypto.randomBytes(16);
        const hash = crypto.scryptSync(password, salt, 64);
        writeFile(adminFile, { salt: salt.toString('hex'), hash: hash.toString('hex'), createdAt: new Date().toISOString() });
        const id = token(); sessions.set(id, Date.now() + 12 * 60 * 60 * 1000); sessionCookie(res, id, 43200);
        return json(res, 201, { ok: true });
      } catch (error) { return json(res, 400, { error: error.message || 'Admin-Einrichtung fehlgeschlagen.' }); }
    }
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Ungültige Herkunft der Anfrage.' });
      try {
        const body = await readJson(req);
        const saved = admin();
        if (!saved) return json(res, 409, { error: 'Bitte zuerst das Admin-Konto einrichten.' });
        const hash = crypto.scryptSync(String(body.password || ''), Buffer.from(saved.salt, 'hex'), 64);
        if (!crypto.timingSafeEqual(hash, Buffer.from(saved.hash, 'hex'))) return json(res, 401, { error: 'Admin-Passwort ist falsch.' });
        const id = token(); sessions.set(id, Date.now() + 12 * 60 * 60 * 1000); sessionCookie(res, id, 43200);
        return json(res, 200, { ok: true });
      } catch (error) { return json(res, 400, { error: error.message || 'Anmeldung fehlgeschlagen.' }); }
    }
    if (pathname === '/api/admin/logout' && req.method === 'POST') {
      const id = cookie(req); sessions.delete(id); sessionCookie(res, '', 0);
      return json(res, 200, { ok: true });
    }
    if (pathname.startsWith('/api/admin/') && !['/api/admin/status','/api/admin/setup','/api/admin/login','/api/admin/logout'].includes(pathname)) {
      if (!isAdmin(req)) return json(res, 401, { error: 'Admin-Anmeldung erforderlich.' });
    }
    if (pathname === '/api/admin/config' && req.method === 'GET') {
      const cfg = getCredentials();
      return json(res, 200, { mrrConfigured: Boolean(cfg.key && cfg.secret), nowPaymentsConfigured: Boolean(cfg.nowPaymentsKey && cfg.nowPaymentsIpnSecret), defaultProfileId: cfg.defaultProfileId || '', publicBaseUrl: cfg.publicBaseUrl || '' });
    }
    if (pathname === '/api/admin/config' && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Ungültige Herkunft der Anfrage.' });
      try {
        const body = await readJson(req);
        const old = getCredentials();
        const next = { ...old };
        for (const key of ['key','secret','nowPaymentsKey','nowPaymentsIpnSecret']) {
          if (body[key] !== undefined && String(body[key]).trim()) next[key] = String(body[key]).trim();
        }
        if (body.defaultProfileId !== undefined) next.defaultProfileId = String(body.defaultProfileId).trim();
        if (body.publicBaseUrl !== undefined) {
          const base = String(body.publicBaseUrl).trim().replace(/\/+$/, '');
          if (base && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(base)) return json(res, 400, { error: 'Die öffentliche Callback-Adresse muss eine gültige HTTPS-Basisadresse sein.' });
          next.publicBaseUrl = base;
        }
        if (next.nowPaymentsKey && next.nowPaymentsIpnSecret) {
          await nowRequest('/status', 'GET', null, next.nowPaymentsKey);
        }
        saveCredentials(next);
        return json(res, 200, { ok: true, message: 'Einstellungen verschlüsselt gespeichert.' });
      } catch (error) { return json(res, 502, { error: error.message || 'Einstellungen konnten nicht gespeichert werden.' }); }
    }
    if (pathname === '/api/admin/profiles' && req.method === 'GET') {
      try {
        const profiles = await mrrGet('/account/profile', 'algo=sha256ab');
        return json(res, 200, { profiles: (Array.isArray(profiles) ? profiles : []).filter(p => String(p.algo?.name || '').toLowerCase() === 'sha256ab').map(p => ({ id: String(p.id), name: String(p.name || ('Profil ' + p.id)) })) });
      } catch (error) { return json(res, 502, { error: error.message }); }
    }
    if (pathname === '/api/offers' && req.method === 'GET') {
      return json(res, 200, { offers: offers().filter(x => x.enabled === true).map(safeOffer) });
    }
    if (pathname === '/api/admin/offers' && req.method === 'GET') return json(res, 200, { offers: offers() });
    if (pathname === '/api/admin/offers' && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Ungültige Herkunft der Anfrage.' });
      try {
        const body = await readJson(req);
        const name = String(body.name || '').trim();
        const minPH = Number(body.minPH), maxPH = Number(body.maxPH);
        const minHours = Number(body.minHours), maxHours = Number(body.maxHours);
        if (!name || name.length > 64 || !Number.isFinite(minPH) || !Number.isFinite(maxPH) || minPH < 1 || maxPH > 100 || minPH > maxPH || minHours < 3 || maxHours > 720 || minHours > maxHours) return json(res, 400, { error: 'Bitte Name, Hashrate 1–100 PH/s und Mietdauer 3–720 Stunden korrekt angeben.' });
        const rows = offers();
        const offer = { id: String(body.id || token().slice(0, 12)), name, description: String(body.description || '').slice(0, 300), minPH, maxPH, minHours, maxHours, enabled: body.enabled !== false, updatedAt: new Date().toISOString() };
        const index = rows.findIndex(x => x.id === offer.id);
        if (index >= 0) rows[index] = offer; else rows.push(offer);
        writeFile(offersFile, rows);
        return json(res, 200, { ok: true, offer });
      } catch (error) { return json(res, 400, { error: error.message || 'Angebot konnte nicht gespeichert werden.' }); }
    }
    if (pathname.startsWith('/api/admin/offers/') && req.method === 'DELETE') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Ungültige Herkunft der Anfrage.' });
      const id = decodeURIComponent(pathname.slice('/api/admin/offers/'.length));
      writeFile(offersFile, offers().filter(x => x.id !== id));
      return json(res, 200, { ok: true });
    }
    if (pathname === '/api/orders' && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Ungültige Herkunft der Anfrage.' });
      try {
        const body = await readJson(req);
        const offer = offers().find(x => x.id === String(body.offerId) && x.enabled === true);
        if (!offer) return json(res, 404, { error: 'Dieses HASHRENT-Angebot ist nicht verfügbar.' });
        const targetPH = Number(body.targetPH), hours = Number(body.hours);
        const currency = String(body.currency || '').toLowerCase();
        if (!['btc','ltc','doge','bch'].includes(currency)) return json(res, 400, { error: 'Bitte BTC, LTC, DOGE oder BCH auswählen.' });
        if (!Number.isFinite(targetPH) || targetPH < offer.minPH || targetPH > offer.maxPH || !Number.isInteger(hours) || hours < offer.minHours || hours > offer.maxHours) return json(res, 400, { error: 'Hashrate oder Mietdauer liegt außerhalb dieses Angebots.' });
        const cfg = getCredentials();
        if (!cfg.nowPaymentsKey || !cfg.nowPaymentsIpnSecret || !cfg.publicBaseUrl) return json(res, 503, { error: 'NOWPayments ist noch nicht vollständig im HASHRENT-Admin konfiguriert.' });
        const quote = makeQuote(await getMarket(true), targetPH, hours);
        if (!quote.complete) return json(res, 409, { error: 'Aktuell ist nicht genug passende SHA-256-ASICBoost-Hashrate verfügbar.' });
        const customerBTC = Number(quote.baseBTC) * 1.05;
        const estimate = await nowRequest('/estimate?amount=' + encodeURIComponent(customerBTC) + '&currency_from=btc&currency_to=eur', 'GET', null, cfg.nowPaymentsKey);
        const priceEUR = Number(estimate.estimated_amount);
        if (!(priceEUR > 0)) return json(res, 502, { error: 'NOWPayments konnte den aktuellen BTC/EUR-Preis nicht ermitteln.' });
        const id = 'HR-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const accessToken = token();
        const invoice = await nowRequest('/invoice', 'POST', {
          price_amount: Number(priceEUR.toFixed(2)), price_currency: 'eur', pay_currency: currency,
          ipn_callback_url: cfg.publicBaseUrl + '/api/payments/nowpayments/ipn',
          order_id: id, order_description: offer.name + ' · ' + targetPH + ' PH/s · ' + hours + ' Stunden',
          success_url: cfg.publicBaseUrl + '/order/' + accessToken,
          cancel_url: cfg.publicBaseUrl + '/order/' + accessToken
        }, cfg.nowPaymentsKey);
        if (!invoice.invoice_url || !invoice.id) throw new Error('NOWPayments hat keine gültige Rechnungs-URL zurückgegeben.');
        const rows = orders();
        rows.push({ id, accessToken, offerName: offer.name, targetPH, hours, currency, priceEUR: Number(priceEUR.toFixed(2)), customerBTC, baseBTC: Number(quote.baseBTC), markupBTC: Number(customerBTC - Number(quote.baseBTC)), privateRigs: quote.rigs, paymentInvoiceId: String(invoice.id), paymentStatus: 'waiting', status: 'pending_payment', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        saveOrders(rows);
        return json(res, 201, { ok: true, orderId: id, statusToken: accessToken, invoiceUrl: invoice.invoice_url, priceEUR: Number(priceEUR.toFixed(2)), currency });
      } catch (error) { return json(res, 502, { error: error.message || 'Checkout konnte nicht erstellt werden.' }); }
    }
    if (pathname === '/api/payments/nowpayments/ipn' && req.method === 'POST') {
      try {
        const body = await readJson(req);
        const cfg = getCredentials();
        if (!verifyIpn(body, req.headers['x-nowpayments-sig'], cfg.nowPaymentsIpnSecret)) return json(res, 401, { error: 'Ungültige Zahlungs-Signatur.' });
        const rows = orders();
        const order = rows.find(x => x.id === String(body.order_id || '') && x.paymentInvoiceId === String(body.invoice_id || x.paymentInvoiceId));
        if (!order) return json(res, 404, { error: 'Bestellung nicht gefunden.' });
        order.paymentStatus = String(body.payment_status || 'unknown');
        order.updatedAt = new Date().toISOString();
        if (order.status === 'pending_payment' && order.paymentStatus === 'finished') {
          order.status = 'paid';
          saveOrders(rows);
          await provision(order);
        } else saveOrders(rows);
        return json(res, 200, { ok: true });
      } catch (error) { return json(res, 400, { error: error.message || 'IPN konnte nicht verarbeitet werden.' }); }
    }
    const orderMatch = pathname.match(/^\/api\/orders\/([a-f0-9]{48})$/);
    if (orderMatch && req.method === 'GET') {
      const order = orders().find(x => x.accessToken === orderMatch[1]);
      if (!order) return json(res, 404, { error: 'Bestellung nicht gefunden.' });
      return json(res, 200, { orderId: order.id, offerName: order.offerName, targetPH: order.targetPH, hours: order.hours, priceEUR: order.priceEUR, paymentStatus: order.paymentStatus, status: order.status, createdAt: order.createdAt });
    }
    if (pathname === '/api/admin/orders' && req.method === 'GET') {
      return json(res, 200, { orders: orders().map(x => ({ ...x, accessToken: undefined, privateRigs: x.privateRigs?.map(r => ({ id: r.id, allocatedPH: r.allocatedPH, baseBTC: r.baseBTC })), privateRentalIds: x.privateRentalIds || [] })) });
    }
    return false;
  };
}

module.exports = { createCommerce };
