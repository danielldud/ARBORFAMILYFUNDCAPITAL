import {createClient} from '@supabase/supabase-js';
declare global{interface Window{ARBOR_CONFIG?:{supabaseUrl:string;supabaseAnonKey:string}}}
const config=window.ARBOR_CONFIG;
export const configured=Boolean(config?.supabaseUrl?.startsWith('https://')&&config.supabaseAnonKey&&!config.supabaseUrl.includes('YOUR_'));
export const supabase=configured?createClient(config!.supabaseUrl,config!.supabaseAnonKey,{auth:{persistSession:true,storage:window.sessionStorage,autoRefreshToken:true,detectSessionInUrl:true}}):null;
export type Asset={id:string;symbol:string;name:string;category:string;broker:string;qty:number;cost:number;provider:'coingecko'|'twelve'|'custom'|'manual';provider_id:string;exchange:string;currency:string;note:string;version?:number;manual_price?:number;manual_as_of?:string};
export type Quote={asset_id:string;mapping_key:string;price_idr:number|null;as_of:string|null;fetched_at:string;source:string;status:string;error:string|null;market_open:boolean|null;fx_as_of?:string|null;fx_rate?:number;native_price?:number;currency?:string};
export type Member={user_id:string;email:string;role:string};
export {mappingKey,rp,dateText,quoteFor,label,totals} from './valuation';
export async function callMarket(action:string,extra:object={}){if(!supabase)throw Error('Backend belum dikonfigurasi.');const {data,error}=await supabase.functions.invoke('market-data',{body:{action,...extra}});if(error){let message=error.message;try{const d=await (error as any).context?.json();if(d?.error)message=d.error;}catch{}throw Error(message)}if(data?.error)throw Error(data.error);return data;}
export function download(name:string,data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
