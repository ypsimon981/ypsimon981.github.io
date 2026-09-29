const allowedOrigins = new Set([
  "https://ypsimon981.github.io",
  "http://localhost",
  "http://127.0.0.1"
]);

function cors(origin:string|null){
  const allow=origin && allowedOrigins.has(origin) ? origin : "https://ypsimon981.github.io";
  return {
    "Access-Control-Allow-Origin":allow,
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Vary":"Origin"
  };
}

function json(body:unknown,status:number,origin:string|null){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8"}
  });
}

const languages:Record<string,string>={
  it:"it", en:"en", fr:"fr", es:"es", de:"de", pt:"pt", nl:"nl", pl:"pl", ro:"ro",
  ru:"ru", uk:"uk", ar:"ar", tr:"tr", ja:"ja", ko:"ko", "zh-CN":"zh-CN"
};

function chunks(text:string,max=430){
  const clean=text.trim();
  if(clean.length<=max) return [clean];
  const out:string[]=[];
  let rest=clean;
  while(rest.length>max){
    let cut=rest.lastIndexOf(". ",max);
    if(cut<Math.floor(max*.55)) cut=rest.lastIndexOf("! ",max);
    if(cut<Math.floor(max*.55)) cut=rest.lastIndexOf("? ",max);
    if(cut<Math.floor(max*.55)) cut=rest.lastIndexOf(", ",max);
    if(cut<Math.floor(max*.55)) cut=rest.lastIndexOf(" ",max);
    if(cut<Math.floor(max*.55)) cut=max;
    else cut+=1;
    out.push(rest.slice(0,cut).trim());
    rest=rest.slice(cut).trim();
  }
  if(rest) out.push(rest);
  return out;
}

async function translatePiece(text:string,from:string,to:string){
  const url="https://api.mymemory.translated.net/get?q="+encodeURIComponent(text)+
    "&langpair="+encodeURIComponent(from+"|"+to);
  const res=await fetch(url,{
    headers:{
      "Accept":"application/json",
      "User-Agent":"SteerWill/0.1 translator prototype (+https://ypsimon981.github.io/)"
    }
  });
  if(!res.ok) throw new Error("provider_"+res.status);
  const data=await res.json();
  if(!data || Number(data.responseStatus||200)>=400){
    throw new Error(String(data&&data.responseDetails||"translation_failed"));
  }
  const translated=String(data.responseData&&data.responseData.translatedText||"").trim();
  if(!translated) throw new Error("empty_translation");
  return {text:translated,match:Number(data.responseData&&data.responseData.match||0)};
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST") return json({error:"method_not_allowed"},405,origin);

  try{
    const body=await req.json().catch(()=>null);
    const text=String(body&&body.text||"").trim();
    const from=String(body&&body.from||"it");
    const to=String(body&&body.to||"en");

    if(!text) return json({error:"missing_text"},400,origin);
    if(text.length>3000) return json({error:"text_too_long",max:3000},400,origin);
    if(!languages[from]||!languages[to]) return json({error:"unsupported_language"},400,origin);
    if(from===to) return json({translated_text:text,from,to,provider:"MyMemory",match:1},200,origin);

    const parts=chunks(text);
    const translated:string[]=[];
    const matches:number[]=[];
    for(const part of parts){
      const result=await translatePiece(part,languages[from],languages[to]);
      translated.push(result.text);
      if(result.match) matches.push(result.match);
    }

    return json({
      translated_text:translated.join(" "),
      from,
      to,
      provider:"MyMemory",
      match:matches.length?matches.reduce((a,b)=>a+b,0)/matches.length:null
    },200,origin);
  }catch(e){
    return json({error:"translation_unavailable",detail:String(e&&e.message||e)},502,origin);
  }
});