import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))), unity=path.resolve(root,'../Revola');
const lines=fs.readFileSync(path.join(root,'localization/game-ui.tsv'),'utf8').trim().split(/\r?\n/);
const languages=lines.shift().split('|').slice(1), aliases=JSON.parse(fs.readFileSync(path.join(root,'localization/game-ui-aliases.json'),'utf8'));
const entries=[], translations=Object.fromEntries(languages.map(language=>[language,[]]));
const seen=new Set(), seenSources=new Set();
for(const line of lines){
 const [id,...values]=line.split('|'); if(values.length!==languages.length||values.some(v=>!v.trim())||seen.has(id))throw new Error('Invalid Drawer translation row: '+id);seen.add(id);
 const key=id==='dead_shop'?'mp_dead_shop':'drawer_'+id;
 const sources=[...new Set([values[0],...(aliases[id]||[])])]; entries.push({key,sources});
 for(const source of sources){if(seenSources.has(source))throw new Error('Ambiguous source text: '+source);seenSources.add(source);}
 for(let i=0;i<languages.length;i++)translations[languages[i]].push(key+'\t'+values[i]+'\t\tIn-game Map Drawer');
}
for(const key of Object.keys(aliases))if(!seen.has(key))throw new Error('Unknown alias: '+key);
const resource=path.join(unity,'Assets/RevolaMapManager/Runtime/Resources/RevolaMapDrawerLocalization.json');
fs.writeFileSync(resource,JSON.stringify({entries},null,2)+'\n');
for(const [language,rows]of Object.entries(translations)){
 const file=path.join(unity,'Assets/StreamingAssets/Localization/revola_'+language+'.tsv');
 const text=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line&&!line.startsWith('drawer_')&&!line.startsWith('mp_dead_shop\t'));
 fs.writeFileSync(file,[...text,...rows,''].join('\r\n'));
}
console.log(`Synchronized ${entries.length} in-game Drawer keys across ${languages.length} game languages.`);
