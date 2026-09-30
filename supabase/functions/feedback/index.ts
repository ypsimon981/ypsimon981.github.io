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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(body: unknown, status=200, origin: string | null=null){
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function esc(v: unknown){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

Deno.serve(async (req: Request) => {
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS") return new Response("ok",{headers:headers(origin)});
  if(req.method!=="POST") return json({error:"method_not_allowed"},405,origin);
  if(origin && !ALLOWED_ORIGINS.has(origin)) return json({error:"origin_not_allowed"},403,origin);

  const apiKey=Deno.env.get("RESEND_API_KEY");
  if(!apiKey) return json({error:"email_not_configured"},503,origin);

  const body=await req.json().catch(()=>null);
  if(!body || typeof body!=="object") return json({error:"invalid_body"},400,origin);

  const name=String((body as any).name||"Anonimo").trim().slice(0,80) || "Anonimo";
  const email=String((body as any).email||"").trim().slice(0,120);
  const message=String((body as any).message||"").trim().slice(0,3000);
  const page=String((body as any).page||"").trim().slice(0,500);
  const honey=String((body as any).company||"").trim();

  if(honey) return json({ok:true},200,origin);
  if(message.length<3) return json({error:"message_required"},400,origin);

  const replyTo=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:undefined;
  const now=new Intl.DateTimeFormat("it-IT",{
    timeZone:"Europe/Rome",
    dateStyle:"medium",
    timeStyle:"short"
  }).format(new Date());

  const html=[
    "<h2>Nuovo consiglio SteerWill</h2>",
    "<p><strong>Nome:</strong> "+esc(name)+"</p>",
    "<p><strong>Email:</strong> "+esc(email||"Non indicata")+"</p>",
    "<p><strong>Data:</strong> "+esc(now)+"</p>",
    "<p><strong>Pagina:</strong> "+esc(page||"—")+"</p>",
    "<hr>",
    "<p style=\"white-space:pre-wrap\">"+esc(message)+"</p>"
  ].join("");

  const payload:any={
    from:"SteerWill <onboarding@resend.dev>",
    to:["letitviral@gmail.com"],
    subject:"SteerWill · Nuovo consiglio da un driver",
    html
  };
  if(replyTo) payload.reply_to=replyTo;

  const res=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      "Authorization":"Bearer "+apiKey,
      "Content-Type":"application/json"
    },
    body:JSON.stringify(payload)
  });

  const data=await res.json().catch(()=>({}));
  if(!res.ok){
    console.error("resend_error",res.status,data);
    return json({error:"email_send_failed"},502,origin);
  }

  return json({ok:true,id:(data as any)?.id||null},200,origin);
});
