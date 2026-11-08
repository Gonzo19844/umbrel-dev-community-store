const token=location.pathname.split('/').pop();
const $=id=>document.getElementById(id);
const fmt=(n,d=3)=>Number(n||0).toLocaleString('de-DE',{maximumFractionDigits:d});
const fmtHash=ph=>{const n=Number(ph||0);return n<1?fmt(n*1000,2)+' TH/s':fmt(n,3)+' PH/s';};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function statusText(status,simulated){
  if(simulated||status==='payment_simulated')return 'TESTZAHLUNG · NOCH KEIN MINING';
  return ({draft:'Checkout offen',pending_payment:'Zahlung ausstehend',paid:'Zahlung bestätigt',provisioning:'Rigs werden zugewiesen',provisioning_attention:'Prüfung erforderlich',active:'Mining aktiv',completed:'Auftrag abgeschlossen',failed:'Auftrag fehlgeschlagen'})[status]||String(status||'Status unbekannt').toUpperCase();
}
function renderChart(points,targetPH){
  const root=$('hashrate-chart');
  if(!Array.isArray(points)||points.length<2){
    root.innerHTML='<div class="chart-empty"><span class="empty-symbol">⌁</span><strong>Noch keine Mining-Messwerte</strong><p>Es werden keine Beispieldaten angezeigt. Sobald echte Hashrate-Messwerte von deinen zugewiesenen Rigs vorliegen, erscheint hier der Verlauf.</p></div>';
    return;
  }
  const values=points.map(p=>Number(p.ph||0)).filter(Number.isFinite);
  if(values.length<2||!values.some(v=>v>0)){root.innerHTML='<div class="chart-empty"><strong>Noch keine gültigen Messwerte</strong><p>MiningRigRentals hat bisher keine verwertbare Hashrate geliefert.</p></div>';return;}
  const max=Math.max(...values,targetPH||0)*1.12||1;
  const bars=values.map((v,i)=>{const h=Math.max(2,v/max*100);return '<span class="hash-bar" title="'+esc(fmt(v,4))+' PH/s" style="height:'+h.toFixed(1)+'%"></span>';}).join('');
  const target=targetPH>0?'<div class="target-line" style="bottom:'+Math.min(96,targetPH/max*100).toFixed(1)+'%"><span>Soll '+esc(fmtHash(targetPH))+'</span></div>':'';
  root.innerHTML='<div class="chart-grid"><i></i><i></i><i></i><i></i>'+target+'<div class="bar-row">'+bars+'</div></div>';
}
async function load(){
  try{
    const r=await fetch('/api/orders/'+encodeURIComponent(token),{cache:'no-store'});
    const d=await r.json();if(!r.ok)throw new Error(d.error||'Bestellung nicht gefunden');
    const simulated=d.paymentMode==='simulation'||d.status==='payment_simulated';
    const created=new Date(d.createdAt);
    $('order-id').textContent=d.orderId;
    $('order-created').textContent=Number.isNaN(created.getTime())?'':created.toLocaleString('de-DE');
    $('order-total').textContent=simulated?'TESTMODUS':(d.priceEUR!=null?fmt(d.priceEUR,2)+' EUR':(d.customerBTC?fmt(d.customerBTC,8)+' BTC':'—'));
    $('order-total-sub').textContent=simulated?'Keine echte Zahlung':(d.currency||'BTC').toUpperCase();
    $('order-hashrate').textContent=fmtHash(d.targetPH);
    $('order-duration').textContent=fmt(d.hours,0)+' Stunden';
    $('order-duration-pill').textContent='⌛ '+fmt(d.hours,0)+' h gebucht';
    $('order-state').textContent=statusText(d.status,simulated);
    $('detail-offer').textContent=d.offerName||'HASHRENT';
    $('detail-payment').textContent=simulated?'Simuliert (Testmodus)':(d.paymentStatus||'—');
    const mining=d.mining||{};
    $('detail-rigs').textContent=mining.rentalCount?mining.rentalCount+' zugewiesen':'Noch nicht zugewiesen';
    $('detail-average').textContent=mining.available?fmtHash(mining.averagePH):'Noch keine Messwerte';
    $('chart-average').textContent='Ø Hashrate: '+(mining.available?fmtHash(mining.averagePH):'—');
    $('chart-updated').textContent=mining.updatedAt?'Aktualisiert: '+new Date(mining.updatedAt).toLocaleTimeString('de-DE'):'Noch nicht aktualisiert';
    $('chart-live-label').textContent=mining.available?'Live-Messwerte verfügbar':'Warte auf Mining-Daten';
    $('chart-caption').textContent=mining.available?'Echte MRR-Messwerte deiner zugewiesenen Rigs':'Es werden ausschließlich echte Messwerte angezeigt – keine simulierten Hashrate-Werte.';
    renderChart(mining.points,d.targetPH);
    $('payment-dot').classList.toggle('done',!['not_created','waiting','simulated'].includes(d.paymentStatus));
    $('rig-dot').classList.toggle('done',Number(mining.rentalCount)>0);
    $('mining-dot').classList.toggle('done',d.status==='active'||mining.available);
    const started=!!(mining.rentalCount&&mining.available);
    const elapsed=started?Math.max(0,(Date.now()-created.getTime())/3600000):0;
    const pct=started?Math.min(100,elapsed/Math.max(1,Number(d.hours))*100):0;
    $('runtime-progress').style.width=pct.toFixed(1)+'%';
    $('runtime-percent').textContent=fmt(pct,1)+' %';
    $('runtime-note').textContent=simulated?'Diese Bestellung ist eine Testbestellung. Es wurde keine Zahlung angenommen und keine MRR-Miete gestartet.':(started?'Fortschritt ist eine zeitbasierte Anzeige ab dem gespeicherten Bestellzeitpunkt.':'Die Laufzeit beginnt, sobald echte MRR-Rentals bereitgestellt und Mining-Messwerte verfügbar sind.');
  }catch(e){
    $('order-state').textContent='BESTELLUNG NICHT VERFÜGBAR';
    $('order-state').classList.add('error');
    $('chart-caption').textContent=e.message;
  }
}
load();setInterval(load,30000);