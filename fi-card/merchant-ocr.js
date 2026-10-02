/* OCR stays on the device. Only the recognition engine/language are downloaded. */
let merchantOcrWorker=null,merchantOcrLoading=null;
function merchantFromOcr(text,confidence){
 const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const lines=String(text||'').split(/\n/).map(l=>l.replace(/\bDettagli\b/ig,'').replace(/^[^\p{L}\p{N}]+/u,'').trim()).filter(Boolean);
 if(confidence<40)return null;
 const hits=Object.entries(BRANDS).filter(([key,b])=>!['altri','locale','farmacia'].includes(key)&&norm(b.name).length>=4&&lines.some(l=>norm(l).includes(norm(b.name))));
 if(hits.length===1)return {key:hits[0][0],name:hits[0][1].name};
 if(hits.length>1)return null;
 const names=lines.filter(l=>l.length>=4&&l.length<=65&&/[\p{L}]{3}/u.test(l)&&!/^\d/.test(l)&&!/(klarna|paga|offert|richied|ottieni|negozio|barcode|codice|tessera|fedelt|dettagli|chiudi|indietro)/i.test(l));
 return confidence>=55&&names.length===1?{key:'',name:names[0]}:null;
}
async function getMerchantOcrWorker(){
 if(merchantOcrWorker)return merchantOcrWorker;
 if(merchantOcrLoading)return merchantOcrLoading;
 merchantOcrLoading=(async()=>{
  if(!window.Tesseract)await new Promise((resolve,reject)=>{
   const s=document.createElement('script'),timer=setTimeout(()=>{s.remove();reject(Error('Download OCR scaduto'))},20000);
   s.src='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
   s.onload=()=>{clearTimeout(timer);resolve()};s.onerror=()=>{clearTimeout(timer);s.remove();reject(Error('OCR non disponibile'))};document.head.append(s);
  });
  const pending=Tesseract.createWorker('eng',1,{
   workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
   corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
   langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int'
  });
  let timer,timedOut=false;
  try{merchantOcrWorker=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(Error('Avvio OCR scaduto'))},45000)})])}
  finally{clearTimeout(timer);if(timedOut)pending.then(w=>w.terminate()).catch(()=>{})}
  await merchantOcrWorker.setParameters({tessedit_pageseg_mode:'11'});
  return merchantOcrWorker;
 })();
 try{return await merchantOcrLoading}finally{merchantOcrLoading=null}
}
async function merchantHeaderImage(file){
 const url=URL.createObjectURL(file),img=new Image();
 try{
  img.src=url;await img.decode();
  const sample=document.createElement('canvas'),scale=Math.min(1,900/img.naturalWidth);
  sample.width=Math.round(img.naturalWidth*scale);sample.height=Math.round(img.naturalHeight*scale);
  const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,sample.width,sample.height);
  const pixels=ctx.getImageData(0,0,sample.width,sample.height).data,w=sample.width,h=sample.height;
  let start=-1,band=null;
  for(let y=Math.floor(h*.06);y<Math.floor(h*.85);y++){
   let last=-1,transitions=0,black=0,white=0,n=0;
   for(let x=Math.floor(w*.06);x<Math.floor(w*.94);x++){
    const i=(y*w+x)*4,v=(pixels[i]+pixels[i+1]+pixels[i+2])/3,s=v<100?0:v>190?1:-1;
    if(s===0)black++;if(s===1)white++;if(s>=0){if(last>=0&&last!==s)transitions++;last=s}n++;
   }
   const isBarcode=transitions>=35&&black/n>.1&&white/n>.28;
   if(isBarcode&&start<0)start=y;
   if(!isBarcode&&start>=0){if(y-start>=Math.max(8,h*.012)){band=start/h;break}start=-1}
  }
  const top=band===null?0:Math.max(0,band-.15),bottom=band===null?.40:Math.max(top+.03,band-.025);
  const out=document.createElement('canvas');out.width=Math.min(1800,img.naturalWidth);out.height=Math.max(1,Math.round(img.naturalHeight*(bottom-top)*out.width/img.naturalWidth));
  const oc=out.getContext('2d',{willReadFrequently:true});oc.drawImage(img,0,img.naturalHeight*top,img.naturalWidth,img.naturalHeight*(bottom-top),0,0,out.width,out.height);
  const data=oc.getImageData(0,0,out.width,out.height);let sum=0;
  for(let i=0;i<data.data.length;i+=4)sum+=(data.data[i]+data.data[i+1]+data.data[i+2])/3;
  const invert=sum/(out.width*out.height)<128;
  for(let i=0;i<data.data.length;i+=4){let v=(data.data[i]+data.data[i+1]+data.data[i+2])/3;if(invert)v=255-v;data.data[i]=data.data[i+1]=data.data[i+2]=v}
  oc.putImageData(data,0,0);return out;
 }finally{URL.revokeObjectURL(url)}
}
async function fillMerchantFromImage(file,draft){
 if(draft.brandKey||draft.name)return;
 try{
  const header=await merchantHeaderImage(file),worker=await getMerchantOcrWorker();let timer;
  let data;
  try{data=(await Promise.race([worker.recognize(header),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Lettura OCR scaduta')),30000)})])).data}
  catch(e){await releaseMerchantOcr();throw e}finally{clearTimeout(timer)}
  const result=merchantFromOcr(data.text,data.confidence);
  if(!result){draft.merchantNote='Negozio non riconosciuto con certezza: scegli il marchio o inserisci il nome.';return}
  const brand=BRANDS[result.key];draft.name=result.name;draft.brandKey=result.key;
  draft.category=brand?.category||(/scarpe|calzature|abbigliamento/i.test(result.name)?'abbigliamento':'altro');
  draft.color=brand?.color||'#5B3DF5';
  draft.merchantNote='Negozio riconosciuto dalla foto. Verifica i dati prima di salvare.';
 }catch(e){draft.merchantNote='OCR non disponibile: puoi comunque importare il codice e compilare il negozio.'}
}
async function releaseMerchantOcr(){const worker=merchantOcrWorker;merchantOcrWorker=null;if(worker)try{await worker.terminate()}catch(e){}}
