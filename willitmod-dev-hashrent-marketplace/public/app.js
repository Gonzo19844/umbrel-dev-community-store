const $ = id => document.getElementById(id);
function update() {
  const h = Math.max(0, Number($('hashrate').value) || 0);
  const b = Math.max(0, Number($('base').value) || 0);
  const m = Math.max(0, Number($('markup').value) || 0);
  $('total').textContent = (h * (b + m)).toFixed(8) + ' BTC';
  $('profit').textContent = (h * m).toFixed(8) + ' BTC';
}
['hashrate','base','markup'].forEach(id => $(id).addEventListener('input', update));
update();
