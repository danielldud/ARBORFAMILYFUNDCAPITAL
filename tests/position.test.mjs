import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const {outputFiles}=await build({entryPoints:['src/lib/position.ts'],bundle:true,format:'esm',platform:'node',write:false});
const p=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

test('crypto purchase converts total rupiah into fractional units',()=>{
  const x=p.calculateOpeningBuy(500000,1000,10000,'coingecko');
  assert.equal(x.units,49.9);
  assert.equal(x.totalCost,500000);
  assert.equal(x.effectiveAverage,500000/49.9);
});

test('IDX purchase is rounded down to board lots',()=>{
  const x=p.calculateOpeningBuy(2022629.4,0,612,'yahoo');
  assert.equal(x.units,3300);
  assert.equal(Math.round(x.effectiveAverage),613);
});

test('average down combines old and new position',()=>{
  const x=p.calculateAverageDown(10,100000,50000,0,4000,'coingecko');
  assert.equal(x.units,22.5);
  assert.equal(x.totalCost,150000);
  assert.equal(x.effectiveAverage,150000/22.5);
});

test('invalid purchase never produces negative or infinite units',()=>{
  assert.equal(p.unitsFromPurchase(500000,500000,10000,'coingecko'),0);
  assert.equal(p.unitsFromPurchase(500000,0,0,'coingecko'),0);
  assert.equal(p.unitsFromPurchase(-1,0,10000,'coingecko'),0);
});
