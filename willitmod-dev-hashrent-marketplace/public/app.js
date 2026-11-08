const $ = (id) => document.getElementById(id);
let offers = [];

const formatHash = (value) => {
  const hash = Number(value);
  return hash < 1
    ? (hash * 1000).toLocaleString('de-DE', { maximumFractionDigits: 3 }) + ' TH/s'
    : hash.toLocaleString('de-DE') + ' PH/s';
};

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);

function msg(id, message, kind = '') {
  const element = $(id);
  element.textContent = message;
  element.className = 'notice compact ' + kind;
}

async function loadOffers() {
  try {
    const response = await fetch('/api/offers');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Angebote konnten nicht geladen werden.');
    }

    offers = data.offers || [];
    $('offer-id').innerHTML =
      '<option value="">Angebot auswählen …</option>' +
      offers.map((offer) =>
        '<option value="' + esc(offer.id) + '">' + esc(offer.name) + '</option>'
      ).join('');

    $('offers').innerHTML = offers.length
      ? offers.map((offer) => `
          <article class="offer">
            <img class="offer-image" src="${esc(offer.imageUrl || '/images/miner-power.svg')}" alt="ASIC Miner für ${esc(offer.name)}" loading="lazy">
            <div class="offer-top">
              <span class="chip">SHA-256 ASICBoost</span>
              <span class="status">${formatHash(offer.minPH)}–${formatHash(offer.maxPH)}</span>
            </div>
            <h3>${esc(offer.name)}</h3>
            <p class="muted">${esc(offer.description || 'HASHRENT Hashrate-Angebot')}</p>
            <div class="line"><span>Hashrate</span><b>${formatHash(offer.minPH)}–${formatHash(offer.maxPH)}</b></div>
            <div class="line"><span>Mietdauer</span><b>${offer.minHours}–${offer.maxHours} Stunden</b></div>
            <button class="secondary choose-offer" data-id="${esc(offer.id)}">Angebot auswählen</button>
          </article>
        `).join('')
      : '';

    msg('offers-message', offers.length
      ? 'Aktuelle HASHRENT-Angebote.'
      : 'Noch keine öffentlichen Angebote verfügbar.');
  } catch (error) {
    msg('offers-message', error.message, 'warning');
  }
}

async function selectOffer(id) {
  $('offer-id').value = id;
  const offer = offers.find((item) => item.id === id);
  if (offer) {
    $('target-ph').min = offer.minPH;
    $('target-ph').max = offer.maxPH;
    $('target-ph').value = offer.minPH;
    $('hours').min = offer.minHours;
    $('hours').max = offer.maxHours;
    $('hours').value = Math.max(offer.minHours, 24);
  }
  const buttons = document.querySelectorAll('.choose-offer');
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const response = await fetch('/api/orders/draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offerId: id }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Persönlicher Checkout konnte nicht erstellt werden.');
    window.location.assign(data.checkoutUrl);
  } catch (error) {
    msg('offers-message', error.message, 'warning');
    buttons.forEach((button) => { button.disabled = false; });
  }
}

$('offers').addEventListener('click', (event) => {
  const button = event.target.closest('.choose-offer');
  if (button) selectOffer(button.dataset.id);
});

$('offer-id').addEventListener('change', () => {
  selectOffer($('offer-id').value);
});

$('order-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('checkout-button').disabled = true;
  $('invoice-result').hidden = true;
  msg('checkout-message', 'Live-Verfügbarkeit und Preis werden geprüft …');

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        offerId: $('offer-id').value,
        targetPH: Number($('target-ph').value),
        hours: Number($('hours').value),
        currency: $('currency').value,
        poolHost: $('pool-host').value,
        poolPort: Number($('pool-port').value),
        poolUser: $('pool-user').value,
        poolPass: $('pool-pass').value,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Checkout fehlgeschlagen.');
    }

    $('invoice-link').href = data.invoiceUrl;
    $('order-reference').textContent =
      'Bestellnummer: ' + data.orderId + ' · Preis: ' + data.priceEUR.toFixed(2) + ' EUR';
    $('invoice-result').hidden = false;
    msg(
      'checkout-message',
      'Rechnung erstellt. Nach bestätigter Zahlung wird deine Hashrate bereitgestellt.',
      'success'
    );
  } catch (error) {
    msg('checkout-message', error.message, 'warning');
  } finally {
    $('checkout-button').disabled = false;
  }
});

loadOffers();
