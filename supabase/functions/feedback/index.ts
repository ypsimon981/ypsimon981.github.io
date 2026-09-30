import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://ypsimon981.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

function headers(origin: string | null){
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://ypsimon981.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "apikey, authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(body: unknown, status=200, origin: string | null=null){
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function serverKey(){
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy) return legacy;
  try{
    const all=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
    return all.default || Object.values(all)[0] || "";
  }catch{
    return "";
  }
}

Deno.serve(async (req: Request) => {
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS") return new Response("ok",{headers:headers(origin)});
  if(origin && !ALLOWED_ORIGINS.has(origin)) return json({error:"origin_not_allowed"},403,origin);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const key=serverKey();
  if(!url || !key) return json({error:"backend_not_configured"},503,origin);

  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});

  if(req.method==="GET"){
    const {data,error}=await db
      .from("feedback_messages")
      .select("id,name,message,created_at")
      .order("created_at",{ascending:false})
      .limit(30);

    if(error){
      console.error("feedback_list_error",error);
      return json({error:"list_failed"},500,origin);
    }
    return json({ok:true,messages:data||[]},200,origin);
  }

  if(req.method==="POST"){
    const body=await req.json().catch(()=>null);
    if(!body || typeof body!=="object") return json({error:"invalid_body"},400,origin);

    const name=String((body as any).name||"Anonimo").trim().slice(0,80) || "Anonimo";
    const email=String((body as any).email||"").trim().slice(0,120);
    const message=String((body as any).message||"").trim().slice(0,3000);
    const page=String((body as any).page||"").trim().slice(0,500);
    const honey=String((body as any).company||"").trim();

    if(honey) return json({ok:true},200,origin);
    if(message.length<3) return json({error:"message_required"},400,origin);

    const {data,error}=await db
      .from("feedback_messages")
      .insert({name,email:email||null,message,page:page||null})
      .select("id,name,message,created_at")
      .single();

    if(error){
      console.error("feedback_insert_error",error);
      return json({error:"save_failed"},500,origin);
    }
    return json({ok:true,message:data},201,origin);
  }

  if(req.method==="DELETE"){
    const body=await req.json().catch(()=>null);
    const id=String((body as any)?.id||"").trim();
    const code=String((body as any)?.code||"").trim();
    if(!id || !code) return json({error:"missing_delete_data"},400,origin);

    const {data,error}=await db.rpc("delete_feedback_message_admin",{
      p_id:id,
      p_code:code
    });

    if(error){
      console.error("feedback_delete_error",error);
      return json({error:"delete_failed"},500,origin);
    }
    if(data!==true) return json({error:"invalid_code"},403,origin);
    return json({ok:true},200,origin);
  }

  return json({error:"method_not_allowed"},405,origin);
});
