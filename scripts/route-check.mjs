import {readFile,writeFile,mkdir} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('data/route-manifest.json','utf8'));
const queue=Object.keys(manifest),results=[];
async function worker(){while(queue.length){const route=queue.shift();const response=await fetch(`http://127.0.0.1:${process.env.PORT||3100}${route}`);const html=await response.text();results.push({route,status:response.status,ok:response.ok&&html.includes('wapper')&&!html.includes('NEXT_HTTP_ERROR_FALLBACK;500')});}}
await Promise.all(Array.from({length:4},worker));
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/route-report.json',JSON.stringify(results,null,2));
const failed=results.filter(r=>!r.ok);console.log(JSON.stringify({checked:results.length,failed},null,2));if(failed.length)process.exitCode=1;
