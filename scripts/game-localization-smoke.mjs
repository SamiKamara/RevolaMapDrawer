import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument, addWall } from '../src/model.js';
import { gameLocale } from './game-locale-data.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),packaged=process.argv.includes('--packaged');
const languages=process.argv.includes('--all')?['eng','fi','de','fr','es','pt','ru','zh','jp','ko']:['fi','ru','jp'];
const output=path.join(root,'artifacts',packaged?'game-locale-packaged':'game-locale');await fs.mkdir(output,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
for(const language of languages){
 const locale=gameLocale(language),token=crypto.randomBytes(32).toString('hex');let socket,buffer=Buffer.alloc(0),saved;
 const project=createDocument();project.name='Save';
 project.objects=[{id:'locale-npc',category:'npc',type:'ranged',x:3000,y:2400,rotation:0}];
 const points=[[3739.5,4740],[3739.5,4400],[2000,4400],[2000,1000],[6500,1000],[6500,4400],[4452.5,4400],[4452.5,4740]];
 for(let i=1;i<points.length;i++)addWall(project,{x:points[i-1][0],y:points[i-1][1]},{x:points[i][0],y:points[i][1]},{joinTolerance:0});
 const send=value=>{const body=Buffer.from(JSON.stringify(value)),header=Buffer.alloc(5);header.writeUInt32LE(body.length+1);header[4]=1;socket.write(Buffer.concat([header,body]));};
 const server=net.createServer(connection=>{socket=connection;connection.on('error',error=>{if(error.code!=='ECONNRESET')throw error;});connection.on('data',bytes=>{buffer=Buffer.concat([buffer,bytes]);while(buffer.length>=4&&buffer.length>=buffer.readUInt32LE(0)+4){const n=buffer.readUInt32LE(0),packet=buffer.subarray(4,4+n);buffer=buffer.subarray(4+n);if(packet[0]===2){send({type:'frame-ack'});continue;}const msg=JSON.parse(packet.subarray(1));if(msg.type==='hello'){assert.equal(msg.token,token);send({type:'resize',width:1440,height:960});}if(msg.type!=='request')continue;let payload=null;if(msg.operation==='initial')payload={project:JSON.stringify(project),ui:locale};if(msg.operation==='save'){saved=JSON.parse(msg.project);payload={name:'Save.revola'};}send({type:'response',id:msg.id,payload:JSON.stringify(payload)});}});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const app=await electron.launch({...(packaged?{executablePath:path.join(root,'dist/RevolaMapDrawer-win32-x64/RevolaMapDrawer.exe')}:{args:[root,`--revola-game=${server.address().port}:${token}`]}),...(packaged?{args:[`--revola-game=${server.address().port}:${token}`]}:{}),env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await expect(page.locator('#game-save')).toHaveText(locale.strings.Save);
  await expect(page.locator('#game-launch')).toHaveText(locale.strings['Save and launch']);
  await expect(page.locator('#map-name')).toHaveValue('Save');await expect(page.locator('#document-title')).toHaveText('Save');
  await expect(page.locator('#tool-guide')).not.toHaveText('Click to chain walls, or drag to draw. Nearby ends join automatically. Draw along a wall to extend it or fill an opening. Escape ends the chain.');
  await page.locator('[data-tool="npc"]').click();await expect(page.locator('#object-picker-title')).toHaveText(locale.strings.NPC);
  await expect(page.locator('#object-picker-list button').first()).toHaveText(locale.strings['Melee NPC']);
  await page.locator('#object-picker-close').click();
  for(const tool of ['select','wall','room','rectangle','corridor','hand','eraser','door','doors','crates','barrels','weapons','devices']){
   await page.locator(`[data-tool="${tool}"]`).click();
   const close=page.locator('#object-picker-close');if(await close.isVisible())await close.click();
   if(language!=='eng')assert.notEqual(await page.locator('#tool-guide').textContent(),'Drag to move around the map. Scroll to zoom at your cursor, or press F to fit the whole map.');
  }
  await page.locator('[data-tool="select"]').click();
  const p=await page.locator('#map-canvas').evaluate(element=>{const r=element.getBoundingClientRect(),t=element.getContext('2d').getTransform();return{x:r.x+(3000*t.a+t.e)/(element.width/r.width),y:r.y+(2400*t.d+t.f)/(element.height/r.height)};});
  await page.mouse.move(p.x,p.y);await page.locator('#npc-hover-setup').click();
  await expect(page.locator('[name="canSidestep"] option').first()).toHaveText(locale.strings['Generator default ({0})'].replace('{0}',locale.strings.Yes));
  await page.screenshot({path:path.join(output,language+'-npc.png')});await page.locator('#npc-cancel').click();
  await page.locator('#game-save').click();
  await expect.poll(()=>saved?.name).toBe('Save');assert.deepEqual(saved.vertices,project.vertices);assert.deepEqual(saved.objects,project.objects);
  await page.screenshot({path:path.join(output,language+'.png')});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({language,packaged,localizedControls:true,literalNamePreserved:true,savedSourceUntranslated:true,rendererErrors:errors}));
 }finally{await app.close();socket?.destroy();await new Promise(resolve=>server.close(resolve));}
}
