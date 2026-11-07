const $ = id => document.getElementById(id);
let marketReady = false;
const btc = value => Number(value || 0).toFixed(8) + ' BTC';
const ph = value => Number(value || 0).toFixed(3) + ' PH/s';

function showMessage(id, message, kind = '') {
  const node = $(id); node.textContent = message; node.className = 'notice ' + kind;
}
async function loadMarket(refresh = false) {
  $('refresh').disabled = true;
  $('market-state').textContent = 'MARKT WIRD GELADEN';
  showMessage('market-message', 'Live-Angebote werden abgerufen …');
  try {
    const response = await fetch('/api/market' + (refresh ? '?refresh=1' : ''));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Marktdaten konnten nicht geladen werden.');
    marketReady = true;
    $('market-state').textContent = 'LIVE-MARKT';
    $('rig-count').textContent = String(data.availableRigs);
    $('market-hash').textContent = ph(data.totalAvailablePH);
    $('market-updated').textContent = 'Letzte Aktualisierung: ' + new Date(data.updatedAt).toLocaleString('de-DE') + ' · Cache: ' + data.cacheSeconds + ' Sekunden';
    showMessage('market-message', data.availableRigs ? 'Live-Angebote erfolgreich geladen.' : 'Aktuell wurden keine passenden freien SHA-256 ASICBoost-Rigs gefunden.', data.availableRigs ? 'success' : '');
    $('offers').innerHTML = data.rigs.map(rig => `
      <article class="offer">
        <div class="offer-top"><span class="chip">SHA-256 ASICBoost</span><span class="status">${escapeHtml(rig.region)}</span></div>
        <h3>${escapeHtml(rig.name)}</h3>
        <p class="muted">Rig #${escapeHtml(rig.id)} · RPI ${Number(rig.rpi).toFixed(1)}</p>
        <div class="price">${btc(rig.customerBTCPerPHDay)} <small>BTC / PH / Tag inkl. 5 %</small></div>
        <div class="line"><span>Hashrate</span><b>${ph(rig.hashratePH)}</b></div>
        <div class="line"><span>Mietfenster</span><b>${rig.minHours}–${rig.maxHours || '–'} h</b></div>
        <a class="rig-link" href="${escapeAttr(rig.url)}" target="_blank" rel="noopener">Angebot bei MRR ansehen ↗</a>
      </article>`).join('');
  } catch (error) {
    marketReady = false;
    $('market-state').textContent = 'API NICHT VERBUNDEN';
    showMessage('market-message', error.message + (error.message.includes('MRR_API_KEY') ? ' API-Zugangsdaten müssen zuerst serverseitig in Umbrel konfiguriert werden.' : ''), 'warning');
    $('offers').innerHTML = '';
    $('rig-count').textContent = '–'; $('market-hash').textContent = '–';
  } finally { $('refresh').disabled = false; }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function escapeAttr(value) { return escapeHtml(value); }

async function calculate() {
  const target = Number($('hashrate').value);
  const hours = Number($('hours').value);
  if (!Number.isFinite(target) || target < 1 || target > 100) return showMessage('quote-message', 'Bitte eine Hashrate zwischen 1 und 100 PH/s eingeben.', 'warning');
  if (!Number.isInteger(hours) || hours < 3) return showMessage('quote-message', 'Bitte mindestens 3 ganze Mietstunden eingeben.', 'warning');
  $('calculate').disabled = true;
  showMessage('quote-message', 'Passende Rigs werden kombiniert …');
  $('quote-result').hidden = true;
  try {
    const response = await fetch('/api/quote?ph=' + encodeURIComponent(target) + '&hours=' + encodeURIComponent(hours));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Kalkulation fehlgeschlagen.');
    $('quote-result').hidden = false;
    $('base-total').textContent = btc(data.baseBTC);
    $('markup-total').textContent = btc(data.markupBTC);
    $('grand-total').textContent = btc(data.totalBTC);
    $('supplied').textContent = ph(data.suppliedPH) + ' von ' + ph(data.targetPH);
    $('rig-selection').innerHTML = data.rigs.map(rig => `
      <div class="selected-rig"><b>${escapeHtml(rig.name)}</b><span>${ph(rig.allocatedPH)} · ${btc(rig.customerBTC)} <a href="${escapeAttr(rig.url)}" target="_blank" rel="noopener">MRR ↗</a></span></div>`).join('');
    showMessage('quote-message', data.complete ? 'Dein Ziel ist vollständig abgedeckt. Die Kalkulation ist unverbindlich.' : 'Nicht genug passende Live-Hashrate verfügbar. Der angezeigte Preis gilt nur für den abgedeckten Anteil.', data.complete ? 'success' : 'warning');
  } catch (error) { showMessage('quote-message', error.message, 'warning'); }
  finally { $('calculate').disabled = false; }
}
$('refresh').addEventListener('click', () => loadMarket(true));
$('calculate').addEventListener('click', calculate);
loadMarket();
