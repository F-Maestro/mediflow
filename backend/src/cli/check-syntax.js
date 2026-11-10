import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
async function files(directory){const entries=await readdir(directory,{withFileTypes:true});const found=[];for(const entry of entries){const path=join(directory,entry.name);if(entry.isDirectory())found.push(...await files(path));else if(entry.isFile()&&entry.name.endsWith('.js'))found.push(path);}return found;}
let failed=false;
for(const file of await files(root)){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)failed=true;}
if(failed)process.exitCode=1;else console.log('Backend JavaScript syntax is valid.');
