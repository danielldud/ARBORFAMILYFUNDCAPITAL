import {fetchJson,isDue,mappingKey,parseCoin,parseCustom,parseTwelve,type Instrument} from './providers.ts';
const env=(key:string)=>Deno.env.get(key)||'';
const sbUrl=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY');
async function db(path:string,options:RequestInit={}){
 const r=await fetch(`${sbUrl}/rest/v1/${path}`,{...options,headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',...(options.headers||{})}});
 if(!r.ok){console.error('Database request failed',r.status,path.split('?')[0]);throw Error('Database tidak tersedia.');}
 return r.status===204?null:await r.json();
}
async function rpc(name:string,payload:object){return db(`rpc/${name}`,{method:'POST',body:JSON.stringify(payload)});}
function publicError(e:unknown){return e instanceof Error?e.message.slice(0,180):'Penyedia tidak tersedia.';}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin')||'';const allowed=env('ALLOWED_ORIGINS').split(',').map(x=>x.trim()).filter(Boolean);
 const cors={'Access-Control-Allow-Origin':allowed.includes(origin)?origin:'null','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
 const answer=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(origin&&!allowed.includes(origin))return answer({error:'Origin tidak diizinkan.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return answer({error:'Method tidak didukung.'},405);
 try{
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return answer({error:'Silakan login.'},401);
  const auth=await fetch(`${sbUrl}/auth/v1/user`,{headers:{apikey:env('SUPABASE_ANON_KEY'),Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
  if(!auth.ok)return answer({error:'Sesi berakhir. Silakan login lagi.'},401);
  const user=await auth.json();if(!user.id||!user.email_confirmed_at)return answer({error:'Verifikasi email diperlukan.'},403);
  const members=await db(`memberships?user_id=eq.${encodeURIComponent(user.id)}&select=role`);
  if(!['admin','editor','viewer'].includes(members?.[0]?.role))return answer({error:'Akun belum disetujui atau telah diblokir.'},403);
  const raw=await req.text();if(raw.length>5000)return answer({error:'Permintaan terlalu besar.'},400);const body=JSON.parse(raw||'{}');
  if(body.action==='search'){
   if(!['admin','editor'].includes(members[0].role))return answer({error:'Hanya editor/admin yang dapat mencari aset.'},403);
   if(!await rpc('allow_market_search',{limit_key:`search:${user.id}`}))return answer({error:'Maksimal 10 pencarian per menit.'},429);
   const q=String(body.query||'').trim();if(q.length<2||q.length>60)return answer({error:'Masukkan 2–60 karakter.'},400);
   if(body.provider==='coingecko'){
    if(!env('COINGECKO_DEMO_API_KEY'))return answer({error:'Admin perlu mengaktifkan CoinGecko API key.'},503);
    const d=await fetchJson(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`,{'x-cg-demo-api-key':env('COINGECKO_DEMO_API_KEY')});
    return answer({results:(d.coins||[]).slice(0,20).map((c:any)=>({provider:'coingecko',provider_id:c.id,symbol:String(c.symbol).toUpperCase(),name:c.name,currency:'IDR',exchange:'',category:'Aset digital'}))});
   }
   if(body.provider==='twelve'){
    if(!env('TWELVE_DATA_API_KEY'))return answer({error:'Admin perlu mengaktifkan Twelve Data API key.'},503);
    const d=await fetchJson(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(q)}&apikey=${encodeURIComponent(env('TWELVE_DATA_API_KEY'))}`);
    if(d.status==='error')throw Error('Pencarian Twelve Data gagal atau kuota habis.');
    return answer({results:(d.data||[]).filter((c:any)=>c.currency&&c.symbol&&c.exchange).slice(0,20).map((c:any)=>({provider:'twelve',provider_id:c.symbol,symbol:c.symbol,name:c.instrument_name,currency:c.currency,exchange:c.exchange,category:c.instrument_type||'Saham / ETF'}))});
   }return answer({error:'Provider pencarian tidak didukung.'},400);
  }
  if(body.action!=='refresh')return answer({error:'Aksi tidak dikenal.'},400);
  const interval=Math.max(60,Math.min(Number(env('REFRESH_SECONDS'))||60,3600));
  if(!await rpc('claim_market_refresh',{seconds:interval}))return answer({cached:true,next_check_seconds:interval});
  const assets:Instrument[]=await db('assets?select=id,provider,provider_id,exchange,currency');const quotes=await db('quotes?select=*');
  const due=assets.filter(a=>a.provider!=='manual'&&isDue(quotes.find((q:any)=>q.asset_id===a.id),a)).sort((a,b)=>Date.parse(quotes.find((q:any)=>q.asset_id===a.id)?.fetched_at||'1970-01-01')-Date.parse(quotes.find((q:any)=>q.asset_id===b.id)?.fetched_at||'1970-01-01')).slice(0,20);
  let coins:any=null,coinError='';const crypto=due.filter(a=>a.provider==='coingecko');
  if(crypto.length)try{if(!env('COINGECKO_DEMO_API_KEY'))throw Error('CoinGecko API key belum dikonfigurasi.');coins=await fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent([...new Set(crypto.map(a=>a.provider_id))].join(','))}&vs_currencies=idr&include_last_updated_at=true&precision=full`,{'x-cg-demo-api-key':env('COINGECKO_DEMO_API_KEY')});}catch(e){coinError=publicError(e);}
  const fx=new Map<string,Promise<any>>();let updated=0,failed=0;
  // Bound concurrent I/O; all requests use per-request timeouts and a shared refresh lock.
  const queue=[...due];async function run(){for(;;){const a=queue.shift();if(!a)return;const old=quotes.find((q:any)=>q.asset_id===a.id&&q.mapping_key===mappingKey(a));let patch:any;
   try{let price:any;
    if(a.provider==='coingecko'){if(coinError)throw Error(coinError);price=parseCoin(coins?.[a.provider_id]);}
    else if(a.provider==='twelve'){
     const key=env('TWELVE_DATA_API_KEY');if(!key)throw Error('Twelve Data API key belum dikonfigurasi.');
     const data=await fetchJson(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(a.provider_id)}&exchange=${encodeURIComponent(a.exchange)}&apikey=${encodeURIComponent(key)}`);
     let rate:any=null;if(a.currency!=='IDR'){if(!fx.has(a.currency))fx.set(a.currency,fetchJson(`https://api.twelvedata.com/exchange_rate?symbol=${encodeURIComponent(a.currency+'/IDR')}&apikey=${encodeURIComponent(key)}`));rate=await fx.get(a.currency);}
     price=parseTwelve(data,rate,a);
    }else if(a.provider==='custom'){
     if(!env('CUSTOM_MARKET_URL'))throw Error('Feed NAV/IDX belum dikonfigurasi. Gunakan harga manual sementara.');
     const url=new URL(env('CUSTOM_MARKET_URL'));if(url.protocol!=='https:')throw Error('Feed harus HTTPS.');url.searchParams.set('id',a.provider_id);
     price=parseCustom(await fetchJson(url.toString(),env('CUSTOM_MARKET_TOKEN')?{Authorization:`Bearer ${env('CUSTOM_MARKET_TOKEN')}`} : {}),a.provider_id);
    }else throw Error('Provider tidak didukung.');
    patch={...price,error:null};updated++;
   }catch(e){failed++;patch={price_idr:old?.price_idr??null,native_price:old?.native_price??null,currency:old?.currency??a.currency,fx_rate:old?.fx_rate??null,fx_as_of:old?.fx_as_of??null,as_of:old?.as_of??null,source:old?.source??a.provider,status:old?.price_idr?'stale':'unavailable',error:publicError(e),market_open:old?.market_open??null};}
   await db('quotes?on_conflict=asset_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({asset_id:a.id,mapping_key:mappingKey(a),...patch,fetched_at:new Date().toISOString()})});
  }}await Promise.all([run(),run(),run()]);
  return answer({updated,failed,next_check_seconds:interval});
 }catch(e){console.error('Market request failed',e instanceof Error?e.name:'error');return answer({error:publicError(e)},503);}
});
