/* OpenStreetMap discovery: one bounded query per area, cached for 24 hours. */
const STORE_CACHE_KEY='ficard.osm.zones.v1',STORE_CACHE_TTL=86400000;
let storeZones=[],storeBusy=false,storeLastRequest=0,storeOnlyFavorites=false,storeInitialSearch=false,storeStatus='',storeMapWasCentered=false,storeMapRenderTimer=null,storeMapSize="",storeMapObserver=null;
try{const raw=JSON.parse(localStorage.getItem(STORE_CACHE_KEY)||'[]');if(Array.isArray(raw))storeZones=raw.filter(z=>Array.isArray(z.bbox)&&z.bbox.length===4&&z.bbox.every(Number.isFinite)&&Array.isArray(z.stores)&&Number.isFinite(z.at)&&Date.now()-z.at<STORE_CACHE_TTL).slice(-12)}catch(e){}
function storeNormalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function storeMatchesBrand(store,key){
 if(!key||key==='altri'||!BRANDS[key])return false;
 const aliases={hm:['hm','hennesmauritz'],maxizoo:['maxizoo','fressnapf'],tigota:['tigota'],dipiù:['dipiu'],ins:['insmercato','ins']};
 const names=(aliases[key]||[key,BRANDS[key].name]).map(storeNormalize).filter(x=>x.length>=2);
 return [store.brand,store.name,store.operator].some(value=>{const n=storeNormalize(value);return names.some(a=>n===a||n.startsWith(a)&&n.length>a.length)})
}
function storeInBounds(l,b){return l.lat>=b[0]&&l.lat<=b[2]&&l.lng>=b[1]&&l.lng<=b[3]}
function storesForCard(c){
 const result=(c.locations||[]).map(l=>({...l})),key=inferredBrandKey(c),seen=new Set();
 for(const z of storeZones)for(const l of z.stores){if(!Number.isFinite(l.lat)||!Number.isFinite(l.lng)||!storeMatchesBrand(l,key)||seen.has(l.osmId))continue;seen.add(l.osmId);if(!result.some(x=>x.osmId===l.osmId||distanceM(x,l)<=25))result.push({...l,source:'osm-auto',favorite:false})}
 return result
}
function parseStoreElements(elements){
 const seen=new Set(),result=[];
 for(const e of elements||[]){const t=e.tags||{},lat=e.lat??e.center?.lat,lng=e.lon??e.center?.lon,id=e.type+'/'+e.id;
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||seen.has(id)||(!t.shop&&!['fuel','pharmacy'].includes(t.amenity)))continue;
 seen.add(id);result.push({osmId:id,lat,lng,name:String(t.name||t.brand||'Negozio').slice(0,200),brand:String(t.brand||'').slice(0,200),operator:String(t.operator||'').slice(0,200),address:[t['addr:street'],t['addr:housenumber'],t['addr:city']].filter(Boolean).join(' ').slice(0,300)})
 }return result
}
function storeRegionAt(p){const d=.045,lon=Math.min(.1,d/Math.max(.5,Math.cos(p.lat*Math.PI/180)));return [Math.max(-90,p.lat-d),Math.max(-180,p.lng-lon),Math.min(90,p.lat+d),Math.min(180,p.lng+lon)]}
function activeStoreBrands(){return [...new Set(cards.map(inferredBrandKey).filter(k=>k&&k!=='altri'))]}
function storeCacheCovers(b){const brands=activeStoreBrands();return storeZones.some(z=>(!z.brands||brands.every(k=>z.brands.includes(k)))&&Date.now()-z.at<STORE_CACHE_TTL&&z.bbox[0]<=b[0]&&z.bbox[1]<=b[1]&&z.bbox[2]>=b[2]&&z.bbox[3]>=b[3])}
function storeUpdateViews(){renderSmartCarousel();renderLocations();if(document.getElementById('mapView').classList.contains('active'))renderOverviewMap();if(document.getElementById('detailModal').classList.contains('show'))renderCardStores(cards.find(c=>c.id===currentCardId))}
function buildStoreQuery(b,brands=activeStoreBrands()){
 const aliases={hm:['H.?M','Hennes.*Mauritz'],maxizoo:['Maxi.?Zoo','Fressnapf'],tigota:['Tigot.'],"dipiù":['Di.?Pi.'],ins:["IN.?S"]};
 const names=brands.flatMap(k=>aliases[k]||[BRANDS[k].name,k]);
 const escaped=names.map(n=>aliases[brands.find(k=>aliases[k]?.includes(n))]?n:String(n).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const pattern='^('+escaped.join('|')+')($|[^a-zA-Z0-9]|[ ]+.*)',box=b.map(n=>n.toFixed(5)).join(','),filter='[~"^(brand|name|operator)$"~'+JSON.stringify(pattern)+',i]';
 return '[out:json][timeout:10];(nwr["shop"]'+filter+'('+box+');nwr["amenity"~"^(fuel|pharmacy)$"]'+filter+'('+box+'););out center tags;'
}
async function requestStoreData(query){
 let lastError;
 for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter']){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetch(endpoint,{method:'POST',body:new URLSearchParams({data:query}),signal:controller.signal});
   if(!response.ok){if(response.status===429||response.status===406)storeLastRequest=Date.now()+20000;throw Error('Servizio momentaneamente occupato.')}
   const data=await response.json();if(data.remark||!Array.isArray(data.elements))throw Error('Ricerca non completata dal servizio.');return data
  }catch(e){lastError=e}finally{clearTimeout(timer)}
 }
 throw lastError||Error('Ricerca non disponibile.')
}
async function discoverStores(b){
 if(!cards.some(c=>inferredBrandKey(c)&&inferredBrandKey(c)!=='altri')){storeStatus='Scegli il marchio di una tessera per trovare i suoi negozi.';updateStoreInfo();return}
 if(!Array.isArray(b)||b.some(x=>!Number.isFinite(x))||b[2]-b[0]>.2||b[3]-b[1]>.3){storeStatus='Avvicina la mappa e premi Cerca in questa zona.';updateStoreInfo();return}
 if(storeCacheCovers(b)){storeStatus='Negozi caricati dai dati salvati sul telefono.';storeUpdateViews();return}
 if(storeBusy)return;
 if(Date.now()-storeLastRequest<10000){storeStatus='Attendi qualche secondo prima di cercare un’altra zona.';updateStoreInfo();return}
 storeBusy=true;storeLastRequest=Date.now();storeStatus='Cerco i punti vendita su OpenStreetMap…';updateStoreInfo();
 try{
 const requestedBrands=activeStoreBrands(),data=await requestStoreData(buildStoreQuery(b,requestedBrands));
 const stores=parseStoreElements(data.elements);if(stores.length>6000)throw Error('Troppi negozi: avvicina la mappa e riprova');
 storeZones=storeZones.filter(z=>Date.now()-z.at<STORE_CACHE_TTL).slice(-11);storeZones.push({bbox:b,at:Date.now(),brands:requestedBrands,stores});
 try{localStorage.setItem(STORE_CACHE_KEY,JSON.stringify(storeZones))}catch(e){storeStatus='Negozi caricati; spazio insufficiente per conservarli offline.'}
 if(!storeStatus.includes('spazio insufficiente'))storeStatus='Ricerca completata. Sono mostrati solo i marchi delle tue tessere.';
 }catch(e){storeStatus=e.name==='AbortError'?'I servizi dei negozi non rispondono. Riprova tra poco; i punti salvati restano disponibili.':navigator.onLine===false?'Sei offline: restano disponibili i negozi già caricati e i preferiti.':(e.message||'Ricerca non disponibile. Riprova tra poco.')}
 finally{storeBusy=false;storeUpdateViews()}
}
function updateStoreInfo(){const el=document.getElementById('storeSearchInfo');if(el)el.textContent=storeStatus||'Carica i negozi della zona oppure mostra solo i tuoi preferiti.';const btn=document.getElementById('storeSearchArea');if(btn){btn.disabled=storeBusy;btn.textContent=storeBusy?'Ricerca in corso…':'Cerca in questa zona'}}
function storeNavigate(c,l){
 document.getElementById('navigationDestination').textContent=(l.name||c.name)+' · '+distanceLabel(currentPos?distanceM(currentPos,l):Infinity);
 document.getElementById('navigationChoices').innerHTML=navigationLinks(l).map(n=>'<a href="'+esc(n.url)+'" target="_blank" rel="noopener noreferrer">↗ '+esc(n.name)+'</a>').join('');
 document.querySelectorAll('#navigationChoices a').forEach(a=>a.onclick=()=>hideModal('navigationModal'));showModal('navigationModal')
}
function toggleStoreFavorite(c,l){
 const existing=(c.locations||[]).find(x=>l.osmId&&x.osmId===l.osmId||distanceM(x,l)<=25);
 if(existing)existing.favorite=!existing.favorite;
 else(c.locations||(c.locations=[])).push({...l,favorite:true,source:'osm-auto',createdAt:Date.now()});
 save();storeUpdateViews()
}
function makeStoreRow(c,l){
 const row=document.createElement('div');row.className='promo locationResult';
 row.innerHTML='<div class="locationBrandIcon" style="background:'+esc(c.color)+'"><span>'+mapBrandInnerHtml(c)+'</span></div><div class="grow"><b>'+esc(l.name||c.name)+'</b><small>'+esc(l.address||c.name)+'</small><small>'+esc(distanceLabel(currentPos?distanceM(currentPos,l):Infinity))+'</small></div><div class="locationActions"><button class="chip" data-action="open">Apri</button><button class="chip storeIconAction" data-action="navigate" aria-label="Naviga al negozio" title="Naviga"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 3-7 18-3-8-8-3 18-7Z"/></svg></button><button class="chip storeIconAction storeFavorite" data-action="favorite" aria-label="'+(l.favorite?'Rimuovi dai preferiti':'Aggiungi ai preferiti')+'" title="'+(l.favorite?'Rimuovi dai preferiti':'Aggiungi ai preferiti')+'" aria-pressed="'+!!l.favorite+'">'+(l.favorite?'★':'☆')+'</button></div>';
 row.querySelector('[data-action="open"]').onclick=()=>openCard(c.id);
 row.querySelector('[data-action="navigate"]').onclick=()=>storeNavigate(c,l);
 row.querySelector('[data-action="favorite"]').onclick=()=>toggleStoreFavorite(c,l);
 const index=(c.locations||[]).findIndex(x=>l.osmId&&x.osmId===l.osmId||distanceM(x,l)<=25);
 if(index>=0){const remove=document.createElement('button');remove.className='chip storeIconAction storeRemove';remove.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';remove.setAttribute('aria-label','Rimuovi punto vendita');remove.title='Rimuovi punto vendita';remove.onclick=()=>{removeLocation(c.id,index);storeUpdateViews()};row.querySelector('.locationActions').append(remove)}return row
}
function renderCardStores(c){
 if(!c)return;let panel=document.getElementById('cardStoreDiscovery');if(!panel){panel=document.createElement('div');panel.id='cardStoreDiscovery';panel.className='panel';panel.style.marginTop='12px';document.getElementById('deleteBtn').before(panel)}
 const all=storesForCard(c).sort((a,b)=>(currentPos?distanceM(currentPos,a)-distanceM(currentPos,b):0));
 panel.innerHTML='<b>Negozi di '+esc(brandFor(c).name)+'</b><p class="hint">'+(currentPos?'In ordine di distanza dalla tua posizione.':'Attiva la posizione per ordinarli per distanza.')+'</p>';
 const button=document.createElement('button');button.className='secondary';button.textContent=storeBusy?'Ricerca in corso…':'Carica negozi in zona';button.disabled=storeBusy;button.onclick=async()=>{try{if(!currentPos)currentPos=await getPosition();await discoverStores(storeRegionAt(currentPos));renderCardStores(c)}catch(e){toast('Posizione non disponibile: puoi cercare una zona dalla Mappa.')}};panel.append(button);
 all.slice(0,12).forEach(l=>panel.append(makeStoreRow(c,l)));
 const note=document.createElement('p');note.className='hint';note.textContent=all.length?'Dati © OpenStreetMap contributors · ODbL. Copertura e accettazione della tessera possono variare.':'Nessun negozio ancora disponibile. Cerca nei dintorni oppure aggiungi un punto manualmente.';panel.append(note)
}
const originalStoreOpenCard=openCard;
openCard=function(id,recordUse=true){originalStoreOpenCard(id,recordUse);const c=cards.find(x=>x.id===id);renderCardStores(c);if(c&&currentPos&&!storeBusy)discoverStores(storeRegionAt(currentPos))};
nearestFor=function(c,pos){if(!pos)return null;let best=null;for(const l of storesForCard(c)){const d=distanceM(pos,l);if(!best||d<best.d)best={...l,d}}return best};
function visibleStoreItems(){
 const items=[];const bounds=overviewMap?.getBounds(),b=bounds?[bounds.getSouth(),bounds.getWest(),bounds.getNorth(),bounds.getEast()]:null;
 cards.forEach(c=>storesForCard(c).forEach(l=>{if(storeOnlyFavorites&&!l.favorite)return;if(!storeOnlyFavorites&&b&&!storeInBounds(l,b))return;items.push({c,l,d:currentPos?distanceM(currentPos,l):Infinity})}));return items.sort((a,b)=>a.d-b.d)
}
renderLocations=function(){const el=document.getElementById('locationsList');if(!el)return;el.replaceChildren();const items=visibleStoreItems();items.slice(0,100).forEach(x=>el.append(makeStoreRow(x.c,x.l)));if(!items.length){el.innerHTML='<div class="panel hint">'+(storeOnlyFavorites?'Nessun negozio preferito. Tocca ☆ su un punto vendita per salvarlo.':'Nessun negozio delle tue tessere nella zona. Avvicina la mappa e premi Cerca in questa zona.')+'</div>'}if(items.length>100){const note=document.createElement('p');note.className='hint';note.textContent='Mostrati i primi 100 risultati. Avvicina la mappa per restringere la zona.';el.append(note)}};
function syncStoreMapSize(){
 const el=document.getElementById('overviewMap');
 if(!overviewMap||!el||!document.getElementById('mapView').classList.contains('active')||!el.clientWidth||!el.clientHeight)return;
 const size=el.clientWidth+'x'+el.clientHeight;if(size!==storeMapSize){storeMapSize=size;overviewMap.invalidateSize({pan:false,animate:false})}
}
renderOverviewMap=function(){
 const el=document.getElementById('overviewMap');if(!el||!window.L||!document.getElementById('mapView').classList.contains('active')||!el.clientWidth||!el.clientHeight)return;
 if(!overviewMap){overviewMap=L.map(el,{zoomControl:true,zoomAnimation:false}).setView(currentPos?[currentPos.lat,currentPos.lng]:[42.2,12.5],currentPos?15:6);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(overviewMap);overviewMap.on('moveend',()=>{clearTimeout(storeMapRenderTimer);storeMapRenderTimer=setTimeout(()=>{renderOverviewMap();renderLocations()},350)});if(typeof ResizeObserver!=='undefined'){storeMapObserver=new ResizeObserver(syncStoreMapSize);storeMapObserver.observe(el)}}
 syncStoreMapSize();
 if(currentPos&&!storeMapWasCentered){storeMapWasCentered=true;overviewMap.setView([currentPos.lat,currentPos.lng],15,{animate:false})}
 if(overviewLayer)overviewLayer.remove();if(currentPosLayer){currentPosLayer.remove();currentPosLayer=null}
 overviewLayer=(L.markerClusterGroup?L.markerClusterGroup({animate:false,maxClusterRadius:45,spiderfyOnMaxZoom:true,zoomToBoundsOnClick:true,showCoverageOnHover:false,spiderfyDistanceMultiplier:2,iconCreateFunction:cluster=>L.divIcon({className:'storeCluster',html:'<div class="storeClusterBadge"><b>'+cluster.getChildCount()+'</b><small>negozi</small></div>',iconSize:[48,48],iconAnchor:[24,24]})}):L.layerGroup()).addTo(overviewMap);
 const items=visibleStoreItems();items.forEach(({c,l})=>{const v=mapBrandVisual(c),icon=L.divIcon({className:'',html:'<div class="brandPin" style="background:'+esc(v.color)+'"><div class="brandPinInner">'+mapBrandInnerHtml(c)+'</div></div>',iconSize:[40,40],iconAnchor:[20,38],popupAnchor:[0,-34]});L.marker([l.lat,l.lng],{icon}).addTo(overviewLayer).bindPopup(makeStoreRow(c,l),{maxWidth:280,minWidth:220,className:'storePopup'})});
 if(currentPos)currentPosLayer=L.circleMarker([currentPos.lat,currentPos.lng],{radius:9,weight:3,fillOpacity:.6}).addTo(overviewMap).bindTooltip('La tua posizione');
 document.getElementById('mapInfo').textContent=items.length+' punti vendita '+(storeOnlyFavorites?'preferiti':'nella zona visualizzata')+'. Avvicina i gruppi per separarli.';updateStoreInfo();
 if(currentPos&&!storeInitialSearch&&!storeOnlyFavorites){storeInitialSearch=true;discoverStores(storeRegionAt(currentPos))}
};
document.getElementById('storeSearchArea').onclick=()=>{if(!overviewMap)return;syncStoreMapSize();if(overviewMap.getZoom()<12){storeStatus='Avvicina la mappa per cercare una zona più piccola.';updateStoreInfo();return}const b=overviewMap.getBounds();discoverStores([b.getSouth(),b.getWest(),b.getNorth(),b.getEast()])};
document.getElementById('storeFavoritesOnly').onchange=e=>{storeOnlyFavorites=e.target.checked;if(storeOnlyFavorites&&overviewMap){const points=cards.flatMap(c=>storesForCard(c).filter(l=>l.favorite).map(l=>[l.lat,l.lng]));if(points.length)overviewMap.fitBounds(points,{padding:[35,35],maxZoom:16})}renderOverviewMap();renderLocations()};
window.addEventListener('resize',syncStoreMapSize);
const originalStoreRefreshPosition=refreshPosition;
refreshPosition=async function(){await originalStoreRefreshPosition();if(currentPos&&!storeBusy&&cards.length)await discoverStores(storeRegionAt(currentPos))};
// The existing map button must use the refreshed function binding.
document.getElementById('mapRefresh').onclick=refreshPosition;
renderSmartCarousel();renderLocations();

