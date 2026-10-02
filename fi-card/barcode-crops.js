function findImportBarcodeBand(pixels,w,h){
 let start=-1;
 for(let y=Math.floor(h*.06);y<Math.floor(h*.85);y++){
  let last=-1,transitions=0,black=0,white=0,n=0;
  for(let x=Math.floor(w*.06);x<Math.floor(w*.94);x++){
   const i=(y*w+x)*4,v=(pixels[i]+pixels[i+1]+pixels[i+2])/3,s=v<100?0:v>190?1:-1;
   if(s===0)black++;if(s===1)white++;if(s>=0){if(last>=0&&last!==s)transitions++;last=s}n++;
  }
  const valid=transitions>=35&&black/n>.1&&white/n>.28;
  if(valid&&start<0)start=y;
  if(!valid&&start>=0){if(y-start>=Math.max(8,h*.012))return {top:start/h,bottom:y/h};start=-1}
 }
 return null;
}
async function barcodeScanCandidates(file){
 const url=URL.createObjectURL(file),image=new Image(),out=[];
 try{
  image.src=url;await image.decode();
  const iw=image.naturalWidth,ih=image.naturalHeight,sample=document.createElement('canvas'),scale=Math.min(1,900/iw);
  sample.width=Math.round(iw*scale);sample.height=Math.round(ih*scale);
  const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,sample.width,sample.height);
  const band=findImportBarcodeBand(ctx.getImageData(0,0,sample.width,sample.height).data,sample.width,sample.height);
  if(!band)return out;
  const x=Math.round(iw*.06),y=Math.floor(ih*Math.max(0,band.top-.02)),w=Math.round(iw*.88),h=Math.ceil(ih*Math.min(1,band.bottom+.03))-y;
  for(const width of [600,900,1200]){
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.max(1,Math.round(h*width/w));
   const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
   c.drawImage(image,x,y,w,h,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(blob)out.push(new File([blob],'ficard-barcode-'+width+'.png',{type:'image/png'}));
  }
 }catch(e){}finally{URL.revokeObjectURL(url)}
 return out;
}
