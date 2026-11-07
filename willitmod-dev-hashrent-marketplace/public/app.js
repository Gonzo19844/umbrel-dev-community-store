const $ = id => document.getElementById(id);
let marketReady = false;
let selectedRig = null;
let accountCanRent = false;
let rentalBusy = false;
const btc = value => Number(value || 0).toFixed(8) + ' BTC';
const ph = value => Number(value || 0).toFixed(3) + ' PH/s';

async function loadSettingsStatus() {
  try {
    const response = await fetch('/api/settings');
    const data = await response.json();
    const link = document.querySelector('.topnav a');
    if (link && data.configured) link.textContent = 'API-Einstellungen · verbunden';
  } catch (_) {}
}

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
    window.hashrentRigs = data.rigs;
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
        <button class="secondary prepare-rental" data-rig-id="${escapeAttr(rig.id)}">Miete vorbereiten</button>
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

async function loadAccountAndRentals() {
  try {
    const response = await fetch('/api/account');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'MRR-Kontodaten konnten nicht geladen werden.');
    accountCanRent = data.authenticated && data.permissions?.rent === true;
    const select = $('pool-profile');
    select.innerHTML = '<option value="">Pool-Profil auswählen …</option>' + data.profiles.map(p => '<option value="' + escapeAttr(p.id) + '">' + escapeHtml(p.name) + ' (#' + escapeHtml(p.id) + ')</option>').join('');
    if (!data.profiles.length) select.innerHTML = '<option value="">Kein SHA-256 ASICBoost-Profil gefunden</option>';
    showMessage('account-message', accountCanRent ? 'MRR verbunden · Mietberechtigung vorhanden · ' + data.profiles.length + ' SHA-256-ASICBoost-Profil(e).' : 'Keine Mietberechtigung für diesen MRR-API-Key.', accountCanRent && data.profiles.length ? 'success' : 'warning');
    $('place-rental').disabled = !(accountCanRent && data.profiles.length);
    await loadRentals();
  } catch (error) {
    showMessage('account-message', error.message, 'warning');
    $('pool-profile').innerHTML = '<option value="">Konto nicht verfügbar</option>';
    $('place-rental').disabled = true;
  }
}
async function loadRentals() {
  try {
    const response = await fetch('/api/rentals');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Mieten konnten nicht geladen werden.');
    $('rentals-list').innerHTML = data.rentals.length ? data.rentals.map(r => '<article class="rental-row"><div><b>Miete #' + escapeHtml(r.id) + '</b><span>' + escapeHtml(r.name) + ' · Rig #' + escapeHtml(r.rigId) + '</span></div><div><b>' + escapeHtml(r.status) + '</b>' + (r.end ? '<span>Ende: ' + escapeHtml(r.end) + '</span>' : '') + '</div>' + (r.url ? '<a href="' + escapeAttr(r.url) + '" target="_blank" rel="noopener">Bei MRR ansehen ↗</a>' : '') + '</article>').join('') : '<div class="notice">Keine aktiven SHA-256 ASICBoost-Mieten gefunden.</div>';
  } catch (error) { $('rentals-list').innerHTML = '<div class="notice warning">' + escapeHtml(error.message) + '</div>'; }
}
function chooseRig(id) {
  const rig = (window.hashrentRigs || []).find(r => String(r.id) === String(id));
  if (!rig) return;
  selectedRig = rig;
  $('selected-rig').textContent = rig.name + ' · Rig #' + rig.id + ' · ' + ph(rig.hashratePH) + ' · ' + btc(rig.customerBTCPerPHDay) + ' pro PH/Tag inkl. 5 %';
  $('rental-confirm').checked = false;
  updateRentalEstimate();
  showMessage('rental-message', 'Bitte Pool-Profil und Mietdauer prüfen. Noch keine Miete ausgelöst.');
  $('rental-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function updateRentalEstimate() {
  const hours = Number($('rental-hours').value);
  const total = selectedRig && Number.isInteger(hours) && hours >= 3 ? selectedRig.hashratePH * selectedRig.customerBTCPerPHDay * hours / 24 : 0;
  $('rental-total').querySelector('strong').textContent = total ? btc(total) : '–';
}
async function submitRental() {
  if (rentalBusy || !selectedRig) return;
  const profileId = $('pool-profile').value;
  const hours = Number($('rental-hours').value);
  if (!profileId) return showMessage('rental-message', 'Bitte ein SHA-256 ASICBoost Pool-Profil auswählen.', 'warning');
  if (!Number.isInteger(hours) || hours < 3 || hours > 720) return showMessage('rental-message', 'Mietdauer muss zwischen 3 und 720 ganzen Stunden liegen.', 'warning');
  if (!$('rental-confirm').checked) return showMessage('rental-message', 'Bitte bestätige die Miete ausdrücklich.', 'warning');
  if (!window.confirm('Rig #' + selectedRig.id + ' für ' + hours + ' Stunden mieten? MRR belastet dein verbundenes MRR-Konto direkt.')) return;
  rentalBusy = true;
  $('place-rental').disabled = true;
  showMessage('rental-message', 'Mietauftrag wird bei MiningRigRentals angefragt …');
  try {
    const response = await fetch('/api/rentals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rigId: selectedRig.id, profileId, hours, confirm: true }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'MRR hat den Mietauftrag abgelehnt.');
    showMessage('rental-message', 'Miete bei MRR angelegt. Auftragsnummer: ' + data.rentalId + '. Bitte Details im MRR-Konto prüfen.', 'success');
    $('rental-confirm').checked = false;
    await loadMarket(true);
    await loadRentals();
  } catch (error) {
    showMessage('rental-message', error.message + ' Bei Zeitüberschreitung bitte zuerst deine MRR-Mieten prüfen, bevor du erneut buchst.', 'warning');
  } finally {
    rentalBusy = false;
    $('place-rental').disabled = !accountCanRent;
  }
}

$('offers').addEventListener('click', event => {
  const button = event.target.closest('.prepare-rental');
  if (button) chooseRig(button.dataset.rigId);
});
$('rental-hours').addEventListener('input', updateRentalEstimate);
$('place-rental').addEventListener('click', submitRental);
$('refresh-rentals').addEventListener('click', loadRentals);
$('refresh').addEventListener('click', () => loadMarket(true));
$('calculate').addEventListener('click', calculate);
loadMarket();
loadSettingsStatus();
loadAccountAndRentals();
