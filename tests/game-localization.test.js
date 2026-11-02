import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gameLocale } from '../scripts/game-locale-data.mjs';
const rows=fs.readFileSync(new URL('../localization/game-ui.tsv',import.meta.url),'utf8').trim().split(/\r?\n/).map(line=>line.split('|'));
test('each English source belongs to exactly one localization key',()=>{
 const aliases=JSON.parse(fs.readFileSync(new URL('../localization/game-ui-aliases.json',import.meta.url),'utf8')),seen=new Set();
 for(const [id,english]of rows.slice(1))for(const source of new Set([english,...(aliases[id]||[])])){
  assert.ok(!seen.has(source),'Ambiguous localization source: '+source);seen.add(source);
 }
});
test('each in-game UI key has ten nonempty translations with the same placeholders',()=>{
 const keys=new Set();for(const [key,...values]of rows.slice(1)){
  assert.ok(!keys.has(key));keys.add(key);assert.equal(values.length,10,key);
  const placeholders=value=>[...value.matchAll(/\{[^}]+\}/g)].map(match=>match[0]).sort();
  for(const value of values){assert.ok(value.trim(),key);assert.deepEqual(placeholders(value),placeholders(values[0]),key);}
 }assert.ok(keys.size>=230);
});
test('dynamic presentation preserves literal map names and translates generator defaults',async()=>{
 const old={window:globalThis.window,document:globalThis.document,Node:globalThis.Node,MutationObserver:globalThis.MutationObserver};
 globalThis.window={revolaGame:true};globalThis.Node={ELEMENT_NODE:1,TEXT_NODE:3};
 globalThis.document={documentElement:{},body:{nodeType:1,closest:()=>false,hasAttribute:()=>false,childNodes:[]},querySelector:()=>null};
 globalThis.MutationObserver=class{observe(){}disconnect(){}};
 try{const {configureGameLocalization,translateGameText:t}=await import('../src/game-localization.js');configureGameLocalization(gameLocale('fi'));
  assert.equal(t('Save'),'Tallenna');assert.equal(t('Opened Save.'),'Avattu Save.');
  assert.equal(t('Generator default (Yes)'),'Generoinnin oletus (Kyllä)');
  assert.equal(t('Saved {0}.{1}','Save',''),'Tallennettu Save.');
  assert.equal(t('Could not open: A vertex is outside the map or is not finite.'),'Avaaminen epäonnistui: Virheelliset karttatiedot. Tarkista geometria ja objektien asetukset.');
 }finally{Object.assign(globalThis,old);}
});
