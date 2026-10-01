const CACHE="ficard-2026.10.02-competitor-1";
const CORE=["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./vendor/JsBarcode.all.min.js", "./vendor/bwip-js-min.js", "./vendor/html5-qrcode.min.js", "./logos/adidas.png", "./logos/arcaplanet.png", "./logos/bata.png", "./logos/carrefour.png", "./logos/conad.png", "./logos/decathlon.png", "./logos/douglas.png", "./logos/eni.png", "./logos/esselunga.png", "./logos/eurospin.png", "./logos/hm.png", "./logos/ikea.png", "./logos/leroymerlin.png", "./logos/mediaworld.png", "./logos/nike.png", "./logos/ovs.png", "./logos/q8.png", "./logos/sephora.png", "./logos/starbucks.png", "./logos/tigota.png", "./logos/unieuro.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("ficard-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET"||new URL(e.request.url).origin!==self.location.origin||!e.request.url.startsWith(self.registration.scope))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{})}return r}).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==="navigate"?caches.match("./index.html"):Response.error()))));
});
