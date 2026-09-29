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

async function translateViaDatabase(text:string,from:string,to:string){
  const base=Deno.env.get("SUPABASE_URL");
  const key=Deno.env.get("SUPABASE_ANON_KEY");
  if(!base || !key) throw new Error("supabase_env_missing");

  const res=await fetch(base+"/rest/v1/rpc/steerwill_translate_text",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey":key,
      "Authorization":"Bearer "+key
    },
    body:JSON.stringify({p_text:text,p_from:from,p_to:to})
  });

  const raw=await res.text();
  if(!res.ok) throw new Error("rpc_"+res.status+"_"+raw.slice(0,160));

  let data:any;
  try{data=JSON.parse(raw);}catch{throw new Error("rpc_bad_json");}
  const translated=String(data&&data.translated_text||"").trim();
  if(!translated) throw new Error("rpc_empty_translation");

  return {
    text:translated,
    match:data&&data.match!=null?Number(data.match):0,
    provider:String(data&&data.provider||"MyMemory")
  };
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
    if(from===to) return json({translated_text:text,from,to,provider:"identity",match:1},200,origin);

    const parts=chunks(text);
    const translated:string[]=[];
    const matches:number[]=[];
    let provider="MyMemory";

    for(const part of parts){
      const result=await translateViaDatabase(part,languages[from],languages[to]);
      translated.push(result.text);
      provider=result.provider;
      if(result.match) matches.push(result.match);
    }

    return json({
      translated_text:translated.join(" "),
      from,
      to,
      provider,
      match:matches.length?matches.reduce((a,b)=>a+b,0)/matches.length:null
    },200,origin);
  }catch(e){
    console.error("SteerWill translate failure:",e);
    return json({error:"translation_unavailable",detail:String(e&&e.message||e)},502,origin);
  }
});