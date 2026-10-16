// Run AFTER SSR measurements. Reproduce k6 deadline counting on a tiny responder.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { output } from './perf-dom-ab-builds.mjs';
const script=resolve(output,'arrival-boundary-probe.k6.js');
await writeFile(script, `import http from 'k6/http';
if(!/^http:\\/\\/127\\.0\\.0\\.1:\\d+$/.test(__ENV.BASE_URL))throw Error('Loopback required');
export const options={scenarios:{probe:{executor:'constant-arrival-rate',rate:2,timeUnit:'1s',duration:'6s',preAllocatedVUs:1,maxVUs:1,gracefulStop:'2s'}}};
export default function(){http.get(__ENV.BASE_URL+'/probe');}
`);
let times=[];
const server=createServer((_request,response)=>{times.push(performance.now());response.writeHead(200,{'Content-Type':'text/plain'});response.end('ok');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const results=[];
try {
  for(let repeat=1;repeat<=3;repeat++){
    times=[];const summary=resolve(output,`arrival-boundary-${repeat}-k6.json`);
    const child=spawn(process.env.K6_BIN||'C:/Program Files/k6/k6.exe',['run','--quiet','--summary-export',summary,'-e',`BASE_URL=http://127.0.0.1:${server.address().port}`,script],{windowsHide:true,stdio:'ignore'});
    const [code]=await once(child,'exit');assert.equal(code,0);
    const k6=JSON.parse(await readFile(summary,'utf8')), count=k6.metrics.http_reqs.count;
    assert.equal(count,times.length);assert(count>=12&&count<=13);assert.equal(k6.metrics.http_req_failed.value,0);
    const offsets=times.map(time=>time-times[0]),intervals=times.slice(1).map((time,index)=>time-times[index]);
    results.push({repeat,count,offsetsMs:offsets,meanIntervalMs:intervals.reduce((a,b)=>a+b,0)/intervals.length,
      finalOffsetMs:offsets.at(-1),extraBoundarySlot:count===13});
  }
} finally {await new Promise(done=>server.close(done));}
const result={passed:true,note:'Independent synthetic responder only; no SSR/API/DB and no overlap with SSR runs. All three probes retained.',results};
await writeFile(resolve(output,'arrival-boundary-check.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
