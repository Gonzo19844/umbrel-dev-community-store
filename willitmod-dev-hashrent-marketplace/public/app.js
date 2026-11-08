const $ = (id) => document.getElementById(id);
let offers = [];
const formatHash = (value) => { const hash=Number(value); return hash<1?(hash*1000).toLocaleString('de-DE',{maximumFractionDigits:3})+' TH/s':hash.toLocaleString('de-DE')+' PH/s'; };
const esc = (value) => String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function msg(id,message,kind=''){const el=$(id);if(!el)return;el.textContent=message;el.className='notice compact '+kind;}
async function createCheckout(offerId,button){
  if(button.disabled)return;
  button.disabled=true;button.textContent='Persönlichen Checkout erstellen …';
  try{
    const response=await fetch('/api/orders/draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({offerId})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Persönlicher Checkout konnte nicht erstellt werden.');
    window.location.assign(data.checkoutUrl);
  }catch(error){msg('offers-message',error.message,'warning');button.disabled=false;button.textContent='Angebot auswählen';}
}
async function loadOffers(){
  try{
    const response=await fetch('/api/offers');const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Angebote konnten nicht geladen werden.');
    offers=data.offers||[];
    $('offers').innerHTML=offers.length?offers.map(offer=>`
      <article class="offer">
        <img class="offer-image" src="${esc(offer.imageUrl||'/images/miner-power.svg')}" alt="ASIC Miner für ${esc(offer.name)}" loading="lazy">
        <div class="offer-top"><span class="chip">SHA-256 ASICBoost</span><span class="status">${formatHash(offer.minPH)}–${formatHash(offer.maxPH)}</span></div>
        <h3>${esc(offer.name)}</h3><p class="muted">${esc(offer.description||'HASHRENT Hashrate-Angebot')}</p>
        <div class="line"><span>Hashrate</span><b>${formatHash(offer.minPH)}–${formatHash(offer.maxPH)}</b></div>
        <div class="line"><span>Mietdauer</span><b>${offer.minHours}–${offer.maxHours} Stunden</b></div>
        <button class="secondary choose-offer" data-id="${esc(offer.id)}">Angebot auswählen</button>
      </article>`).join(''):'';
    msg('offers-message',offers.length?'Wähle ein Angebot. HASHRENT erstellt danach automatisch deinen persönlichen Checkout-Link.':'Noch keine öffentlichen Angebote verfügbar.');
  }catch(error){msg('offers-message',error.message,'warning');}
}
$('offers').addEventListener('click',event=>{const button=event.target.closest('.choose-offer');if(button)createCheckout(button.dataset.id,button);});
loadOffers();
