import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/lib/valuation.ts'],bundle:true,write:false,platform:'node',format:'esm'});const v=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const a={id:'a',provider:'coingecko',provider_id:'bitcoin',exchange:'',currency:'IDR',qty:2,cost:100};
const b={...a,id:'b',provider_id:'solana',qty:3,cost:900};
const q={asset_id:'a',mapping_key:v.mappingKey(a),price_idr:60,status:'automatic',as_of:new Date().toISOString(),error:null};
test('missing price means partial total, not fictitious loss',()=>{const t=v.totals([a,b],[q]);assert.deepEqual(t,{value:120,pricedCost:100,cost:1000,gain:20,missing:1})});
test('changed mapping invalidates price immediately',()=>{assert.equal(v.totals([{...a,provider_id:'ethereum'}],[q]).missing,1)});
test('cached failed quote is visibly stale but retains last value',()=>{assert.match(v.label({...q,error:'429'}),/gagal/);assert.equal(v.totals([a],[{...q,error:'429'}]).value,120)});
test('manual/EOD/FX freshness cannot masquerade as live',()=>{assert.equal(v.label({...q,status:'manual'}),'Manual');assert.equal(v.label({...q,status:'eod'}),'Akhir hari');assert.equal(v.label({...q,fx_as_of:'2000-01-01'}),'Kurs lama')});
