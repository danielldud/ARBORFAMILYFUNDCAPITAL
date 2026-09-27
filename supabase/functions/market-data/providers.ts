export type Instrument={id:string;provider:string;provider_id:string;exchange:string;currency:string};
export type Price={price_idr:number;native_price:number;currency:string;fx_rate:number;fx_as_of:string|null;as_of:string;source:string;status:string;market_open:boolean|null};
export const mappingKey=(a:Instrument)=>[a.provider,a.provider_id,a.exchange,a.currency].join('|');
export function positive(value:unknown){const n=typeof value==='string'&&value.trim()!==''?Number(value):value;if(typeof n!=='number'||!Number.isFinite(n)||n<=0)throw Error('Harga tidak valid dari penyedia.');return n;}
export function timestamp(value:unknown){const ms=typeof value==='number'?value*1000:Date.parse(String(value));if(!Number.isFinite(ms)||ms>Date.now()+300000)throw Error('Waktu harga tidak valid.');return new Date(ms).toISOString();}
export function parseCoin(row:any):Price{if(!row)throw Error('CoinGecko ID tidak ditemukan.');const price=positive(row.idr);return {price_idr:price,native_price:price,currency:'IDR',fx_rate:1,fx_as_of:null,as_of:timestamp(row.last_updated_at),source:'CoinGecko',status:'automatic',market_open:true};}
export function yahooSymbol(value:string){
 const symbol=String(value||'').trim().toUpperCase();
 if(!/^[A-Z0-9]{1,12}(?:\.JK)?$/.test(symbol))throw Error('Kode saham IDX tidak valid. Contoh: BBCA atau PACK.');
 return symbol.endsWith('.JK')?symbol:`${symbol}.JK`;
}
export function parseYahoo(row:any,asset:Instrument):Price{
 const result=row?.chart?.result?.[0],meta=result?.meta;
 if(!meta||row?.chart?.error)throw Error('Saham tidak ditemukan di Yahoo Finance.');
 const expected=yahooSymbol(asset.provider_id),actual=String(meta.symbol||'').toUpperCase();
 if(actual!==expected)throw Error('Simbol respons Yahoo tidak cocok.');
 if(String(meta.currency||'').toUpperCase()!=='IDR')throw Error('Mata uang saham IDX tidak cocok.');
 const price=positive(meta.regularMarketPrice),asOf=timestamp(meta.regularMarketTime);
 const state=String(meta.marketState||'').toUpperCase();
 return {price_idr:price,native_price:price,currency:'IDR',fx_rate:1,fx_as_of:null,as_of:asOf,source:'Yahoo Finance',status:'delayed',market_open:state?state==='REGULAR':null};
}
export function parseTwelve(row:any,fx:any,asset:Instrument):Price{
 if(!row||row.status==='error'||row.code)throw Error('Simbol tidak tersedia atau paket Twelve Data belum mendukungnya.');
 if(String(row.symbol).toUpperCase()!==asset.provider_id.toUpperCase())throw Error('Simbol respons tidak cocok.');
 if(row.currency!==asset.currency)throw Error('Mata uang tidak cocok; pilih ulang instrumen.');
 const native=positive(row.close);const rate=asset.currency==='IDR'?1:positive(fx?.rate);const asOf=timestamp(row.timestamp);
 const exchange=String(row.exchange||'').toUpperCase();if(asset.exchange&&exchange!==asset.exchange.toUpperCase())throw Error('Bursa respons tidak cocok; periksa pemetaan instrumen.');
 return {price_idr:positive(native*rate),native_price:native,currency:asset.currency,fx_rate:rate,fx_as_of:asset.currency==='IDR'?null:timestamp(fx.timestamp),as_of:asOf,source:'Twelve Data',status:['IDX','XIDX'].includes(asset.exchange.toUpperCase())?'eod':'provider',market_open:typeof row.is_market_open==='boolean'?row.is_market_open:null};
}
export function parseCustom(row:any,id:string):Price{if(!row||row.id!==id||!['automatic','delayed','eod','nav'].includes(row.status)||typeof row.source!=='string')throw Error('Feed kustom tidak cocok atau formatnya tidak valid.');return {price_idr:positive(row.price_idr),native_price:positive(row.price_idr),currency:'IDR',fx_rate:1,fx_as_of:null,as_of:timestamp(row.as_of),source:row.source.slice(0,120),status:row.status,market_open:typeof row.market_open==='boolean'?row.market_open:null};}
export async function fetchJson(url:string,headers:Record<string,string>={},fetcher:typeof fetch=fetch){
 let res:Response;try{res=await fetcher(url,{headers,signal:AbortSignal.timeout(12000),redirect:'error'});}catch{throw Error('Koneksi penyedia gagal atau timeout.');}
 if(!res.ok)throw Error(res.status===429?'Batas API tercapai; menunggu pembaruan berikutnya.':`Penyedia tidak tersedia (HTTP ${res.status}).`);
 const text=await res.text();if(text.length>2000000)throw Error('Respons penyedia terlalu besar.');try{return JSON.parse(text);}catch{throw Error('Format respons penyedia tidak valid.');}
}
export function isDue(quote:any,asset:Instrument,now=Date.now()){
 if(!quote||quote.mapping_key!==mappingKey(asset))return true;
 const age=now-Date.parse(quote.fetched_at||'');
 const ttl=asset.provider==='manual'?Infinity:quote.error?60000:asset.provider==='yahoo'?300000:['IDX','XIDX'].includes(asset.exchange.toUpperCase())?3600000:60000;
 return !Number.isFinite(age)||age>=ttl;
}
