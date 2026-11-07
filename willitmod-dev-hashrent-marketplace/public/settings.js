const $ = id => document.getElementById(id);
async function refreshStatus() {
  try {
    const response = await fetch('/api/settings', { cache: 'no-store' });
    const data = await response.json();
    $('settings-status').textContent = data.configured
      ? 'MRR-Zugangsdaten sind konfiguriert. Neue Zugangsdaten eingeben, um sie zu ersetzen.'
      : 'Noch keine MRR-Zugangsdaten hinterlegt. Bitte beide Felder ausfüllen.';
    $('settings-status').className = 'notice settings-status ' + (data.configured ? 'success' : '');
  } catch (error) {
    $('settings-status').textContent = 'Status konnte nicht geladen werden: ' + error.message;
    $('settings-status').className = 'notice settings-status warning';
  }
}
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('save-settings');
  const key = $('mrr-key').value.trim();
  const secret = $('mrr-secret').value.trim();
  if (!key || !secret) {
    $('settings-status').textContent = 'Bitte API-Key und API-Secret eingeben.';
    $('settings-status').className = 'notice settings-status warning';
    return;
  }
  button.disabled = true;
  button.textContent = 'Verbindung wird geprüft …';
  $('settings-status').textContent = 'HASHRENT verbindet sich sicher mit der MiningRigRentals API …';
  $('settings-status').className = 'notice settings-status';
  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, secret })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Speichern fehlgeschlagen.');
    $('settings-form').reset();
    $('settings-status').textContent = data.message;
    $('settings-status').className = 'notice settings-status success';
  } catch (error) {
    $('settings-status').textContent = error.message;
    $('settings-status').className = 'notice settings-status warning';
  } finally {
    button.disabled = false;
    button.textContent = 'Verbindung testen & speichern';
  }
});
refreshStatus();