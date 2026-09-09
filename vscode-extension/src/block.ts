/**
 * The self-contained JS injected into the agent webview bundle. It watches the
 * agent's spinner row and, while the agent is busy, overwrites the spinner text
 * with a labeled sponsor line fetched from the local loopback — rotating on a
 * fixed cadence and reporting on-screen dwell time. Wrapped in LATENT markers so
 * the patcher can find/replace/remove it precisely.
 */
export const MARK_START = "/* LATENT-START */";
export const MARK_END = "/* LATENT-END */";

export function buildBlock(baseUrl: string, rotateSeconds: number, category: string): string {
  const cfg = JSON.stringify({ base: baseUrl, rotate: rotateSeconds * 1000, cat: category });
  // NOTE: body runs in the webview. No imports, no external hosts — only the
  // 127.0.0.1 loopback (allowed via the CSP relaxation the patcher applies).
  return `${MARK_START}
(function(){
  try {
    if (window.__latentActive) return; window.__latentActive = true;
    var CFG = ${cfg};
    var cur = null, shownAt = 0, lastAdId = "";
    function spinner(){
      return document.querySelector('[class*="spinnerRow_"]')
          || document.querySelector('[class*="statusRow_"]')
          || document.querySelector('[data-latent-spinner]');
    }
    function busy(){ var s = spinner(); return !!(s && s.offsetParent !== null); }
    async function fetchAd(){
      try {
        var r = await fetch(CFG.base + '/ad?cat=' + encodeURIComponent(CFG.cat));
        var j = await r.json(); return j && j.ad ? j.ad : null;
      } catch(e){ return null; }
    }
    async function report(ms){
      if(!cur || !cur.adId) return;
      try { await fetch(CFG.base + '/impression', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adId: cur.adId, token: cur.token, displayedMs: ms }) }); } catch(e){}
    }
    function clean(v){ return String(v == null ? '' : v).replace(/[\\u0000-\\u001f\\u007f-\\u009f\\u202a-\\u202e\\u2066-\\u2069]/g,'').slice(0,200); }
    function paint(){
      var s = spinner(); if(!s || !cur) return;
      var label = s.querySelector('[data-latent-label]');
      if(!label){ label = document.createElement('span'); label.setAttribute('data-latent-label','1');
        label.style.opacity='0.85'; s.appendChild(label); }
      var url = /^https:\\/\\//i.test(cur.url || '') ? clean(cur.url) : '';
      label.textContent = '  💡 Sponsored: ' + clean(cur.text) + (url ? '  (' + url + ')' : '');
    }
    async function tick(){
      if(busy()){
        if(!cur){ cur = await fetchAd(); if(cur){ shownAt = Date.now(); lastAdId = cur.adId; } }
        paint();
      } else if(cur){
        await report(Date.now() - shownAt); cur = null;
      }
    }
    setInterval(tick, CFG.rotate);
    // Rotate the creative itself on the same cadence when still busy.
    setInterval(async function(){ if(busy() && cur){ await report(Date.now()-shownAt);
      var next = await fetchAd(); if(next){ cur = next; shownAt = Date.now(); paint(); } } }, CFG.rotate);
    new MutationObserver(function(){ if(cur) paint(); }).observe(document.body, {childList:true,subtree:true});
  } catch(e) { /* fail open — never break the host webview */ }
})();
${MARK_END}`;
}
