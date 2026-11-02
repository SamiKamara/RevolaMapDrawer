import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export function gameLocale(language) {
  const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
  const lines=fs.readFileSync(path.join(root,'localization/game-ui.tsv'),'utf8').trim().split(/\r?\n/);
  const column=lines.shift().split('|').indexOf(language); if(column<1)throw new Error('Unknown test language');
  const aliases=JSON.parse(fs.readFileSync(path.join(root,'localization/game-ui-aliases.json'),'utf8')),strings={};
  for(const line of lines){const parts=line.split('|');for(const source of [parts[1],...(aliases[parts[0]]||[])])strings[source]=parts[column];}
  return {language,strings};
}
