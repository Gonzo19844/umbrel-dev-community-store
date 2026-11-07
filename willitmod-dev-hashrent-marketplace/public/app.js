const $ = id => document.getElementById(id);
const btc = value => Number(value).toFixed(8) + ' BTC';
const number = value => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(value);

async function api(path) {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Serveranfrage fehlgeschlagen.');
  return data;
}

function setStatus(text, state = '') {
  $('market-status').textContent = text;
  $('market-status').className = 'live-pill ' + state;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function renderOffers(data) {
  const rows = data.offers || [];
  $('market-message').textContent = rows.length
    ? data.totalOffers + ' verfügbare und preislich auswertbare SHA256-Asicboost-Rigs · Stand ' + new Date(data.fetchedAt).toLocaleTimeString('de-DE') + (data.stale ? ' · zwischengespeicherte Daten' : '')
    : 'MRR hat aktuell keine passenden Angebote zurückgegeben.';
  $('offers').innerHTML = rows.length ? rows.map(rig =>
    '<tr><td><a href="' + escapeHtml(rig.url) + '" target="_blank" rel="noopener">' + escapeHtml(rig.name) + '</a><small>#' + escapeHtml(rig.id) + '</small></td>' +
    '<td>' + escapeHtml(rig.region) + '</td><td>' + number(rig.hashratePH) + ' PH/s</td>' +
    '<td>' + Number(rig.pricePerPHDayBTC).toFixed(8) + ' BTC</td><td>' + number(rig.minHours) + '–' + number(rig.maxHours) + ' h</td></tr>'
  ).join('') : '<tr><td colspan="5">Keine passenden Angebote gefunden.</td></tr>';
  setStatus(data.stale ? 'MRR-Daten zwischengespeichert' : 'MRR-Marktdaten aktuell', data.stale ? 'warning' : 'success');
  if (data.warning) $('market-message').textContent += ' · ' + data.warning;
}

async function loadMarket(refresh = false) {
  setStatus('MRR wird abgefragt …');
  $('market-message').textContent = 'Verbindung zu MiningRigRentals wird hergestellt …';
  try {
    const data = await api('/api/market' + (refresh ? '?refresh=1' : ''));
    renderOffers(data);
    await calculateQuote();
  } catch (error) {
    setStatus('MRR nicht erreichbar', 'error');
    $('market-message').textContent = error.message;
    $('offers').innerHTML = '<tr><td colspan="5">Keine Live-Marktdaten verfügbar. Bitte API-Verbindung prüfen und erneut versuchen.</td></tr>';
    $('quote-status').textContent = 'Preisberechnung nicht möglich, solange keine aktuellen MRR-Angebote vorliegen.';
  }
}

async function calculateQuote() {
  const hashrate = Number($('hashrate').value);
  const hours = Number($('hours').value);
  if (!Number.isFinite(hashrate) || hashrate < 1 || hashrate > 100) {
    $('quote-status').textContent = 'Bitte eine Hashrate zwischen 1 und 100 PH/s eingeben.';
    return;
  }
  if (!Number.isInteger(hours) || hours < 3 || hours > 480) {
    $('quote-status').textContent = 'Bitte eine Mietdauer zwischen 3 und 480 Stunden eingeben.';
    return;
  }
  $('quote-status').textContent = 'Passende Rigs werden kombiniert und der Preis wird berechnet …';
  $('calculate').disabled = true;
  try {
    const data = await api('/api/quote?hashratePH=' + encodeURIComponent(hashrate) + '&hours=' + encodeURIComponent(hours));
    if (!data.ok) {
      $('quote-status').textContent = data.error + (data.maxSupportedHours ? ' Maximal aktuell möglich: ' + data.maxSupportedHours + ' Stunden.' : '');
      $('max-hours').textContent = data.maxSupportedHours ? data.maxSupportedHours + ' h' : 'Nicht verfügbar';
      $('acquisition').textContent = '– BTC';
      $('markup').textContent = '– BTC';
      $('total').textContent = '– BTC';
      $('delivered').textContent = '– PH/s';
      $('rig-count').textContent = '–';
      $('selected-rigs').innerHTML = '';
      if (data.maxSupportedHours) $('hours').max = String(data.maxSupportedHours);
      return;
    }
    $('quote-status').textContent = 'Preisangebot für ' + number(data.requestedHashratePH) + ' PH/s über ' + data.hours + ' Stunden.';
    $('acquisition').textContent = btc(data.acquisitionBTC);
    $('markup').textContent = btc(data.markupBTC);
    $('total').textContent = btc(data.customerTotalBTC);
    $('delivered').textContent = number(data.deliveredHashratePH) + ' PH/s';
    $('rig-count').textContent = String(data.rigCount);
    $('max-hours').textContent = data.maxSupportedHours + ' h';
    $('hours').max = String(Math.max(3, data.maxSupportedHours));
    $('selected-rigs').innerHTML = '<h3>Automatisch ausgewählte Rigs</h3>' + data.rigs.map(rig =>
      '<div class="selected-rig"><span><a href="' + escapeHtml(rig.url) + '" target="_blank" rel="noopener">' + escapeHtml(rig.name) + '</a><small>' + escapeHtml(rig.region) + ' · ' + number(rig.hashratePH) + ' PH/s</small></span><b>' + Number(rig.pricePerPHDayBTC).toFixed(8) + ' BTC/PH/Tag</b></div>'
    ).join('');
  } catch (error) {
    $('quote-status').textContent = error.message;
  } finally {
    $('calculate').disabled = false;
  }
}

$('refresh-market').addEventListener('click', () => loadMarket(true));
$('calculate').addEventListener('click', calculateQuote);
$('hashrate').addEventListener('change', calculateQuote);
$('hours').addEventListener('change', calculateQuote);
loadMarket();