import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { output } from './perf-dom-ab-builds.mjs';
const read = async name => JSON.parse(await readFile(resolve(output, name), 'utf8'));
const protocol = await read('protocol.json'), directory = resolve(output, 'runs');
const files = await readdir(directory), stages = [];
const mean = values => values.reduce((a,b) => a+b,0) / Math.max(1,values.length);
const median = values => { const a=[...values].sort((a,b)=>a-b); return a.length ? (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2 : null; };
const percentile = (values,p) => { const a=[...values].sort((a,b)=>a-b); return a.length ? a[Math.max(0,Math.ceil(a.length*p)-1)] : null; };
function background(samples) {
  // Boundary ticks can be shorter than 1s. Integrate ALL counter deltas into
  // approximately 1s windows, merge the final short tail; never drop CPU bursts.
  const windows=[]; let active=[];
  for (const sample of samples) { active.push(sample); if (active.reduce((sum,x)=>sum+x.totalCpuMs,0)>=protocol.environment.logicalCPUs*800) { windows.push(active); active=[]; } }
  if (active.length) { if(windows.length) windows[windows.length-1].push(...active); else windows.push(active); }
  const values = windows.map(rows => {
    const total = rows.reduce((sum,x)=>sum+x.totalCpuMs,0), tracked = rows.reduce((sum,x)=>sum+x.trackedCpuMs,0);
    const busy = rows.reduce((sum,x)=>sum+x.hostBusy*x.totalCpuMs,0);
    return { total, host:busy/Math.max(1,total), raw:(busy-tracked)/Math.max(1,total), external:Math.max(0,Math.min(1,(busy-tracked)/Math.max(1,total))) };
  });
  const total = values.reduce((sum,x)=>sum+x.total,0);
  return { samples:samples.length, windows:values.length, cpuWindowMs:total,
    backgroundMean:values.reduce((sum,x)=>sum+x.external*x.total,0)/Math.max(1,total),
    backgroundP95:percentile(values.map(x=>x.external),.95), backgroundPeak:Math.max(0,...values.map(x=>x.external)),
    hostMean:values.reduce((sum,x)=>sum+x.host*x.total,0)/Math.max(1,total),
    negativeFraction:values.filter(x=>x.raw<-.05).length/Math.max(1,values.length),
    missingFraction:samples.filter(x=>x.missing>0).length/Math.max(1,samples.length) };
}
// Validate subtraction and short boundary integration without benchmark data.
const synthetic = background([{totalCpuMs:3990,trackedCpuMs:0,hostBusy:.1,missing:0}, {totalCpuMs:10,trackedCpuMs:0,hostBusy:.9,missing:0}]);
assert(Math.abs(synthetic.backgroundMean-.102)<1e-9); assert.equal(synthetic.windows,1);
assert(Math.abs(background([{totalCpuMs:4000,trackedCpuMs:400,hostBusy:.3,missing:0}]).backgroundMean-.2)<1e-9);
for (const file of files.filter(name=>name.endsWith('-phase.json')).sort()) {
  const phase=await read(`runs/${file}`), key=file.replace('-phase.json',''), k6=await read(`runs/${key}-k6.json`);
  const events=(await readFile(resolve(directory,`${key}-perf.jsonl`),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  const rows=new Map();
  for (const event of events) for (const row of event.rows) {
    const key=`${event.role}:${row.metric}:${row.label}`, merged=rows.get(key)||{count:0,sumMs:0,errors:0,status429:0,status503:0,maxWindowP95Ms:0};
    for(const name of ['count','sumMs','errors','status429','status503'])merged[name]+=row[name];
    merged.maxWindowP95Ms=Math.max(merged.maxWindowP95Ms,row.p95Ms);rows.set(key,merged);
  }
  const row=(metric,label)=>rows.get(`web:${metric}:${label}`), web=events.filter(x=>x.role==='web');
  const span=web.reduce((sum,x)=>sum+x.windowMs,0), count=k6.metrics.http_reqs.count;
  const home=row('ssr.prepare','home')?.count||0,listing=row('ssr.prepare','listing')?.count||0;
  const fetched=[...rows].filter(([key])=>key.startsWith('web:api.fetch:')).reduce((sum,[,row])=>sum+row.count,0);
  const errors=[...rows].filter(([key])=>key.startsWith('web:api.read:')).reduce((sum,[,row])=>sum+row.errors,0);
  const cpu=Object.fromEntries(['pre','during','post'].map(name=>[name,background(phase.host.samples.filter(x=>x.phase===name))]));
  const flags=[];
  if(Object.values(cpu).some(x=>x.backgroundMean>protocol.noise.highBackgroundMean))flags.push('high-background');
  const bg=Object.values(cpu).map(x=>x.backgroundMean);
  if(Math.max(...bg)-Math.min(...bg)>protocol.noise.maxBackgroundMeanDrift)flags.push('background-drift');
  if(cpu.during.backgroundP95>protocol.noise.duringBackgroundP95)flags.push('background-bursts-p95');
  if(Object.values(cpu).some(x=>x.backgroundPeak>protocol.noise.backgroundPeak))flags.push('background-peak');
  if(Object.values(cpu).some(x=>x.negativeFraction>protocol.noise.maxMissingFraction||x.missingFraction>protocol.noise.maxMissingFraction)
    ||phase.host.skipped/Math.max(1,phase.host.samples.length)>protocol.noise.maxMissingFraction)flags.push('cpu-coverage');
  if(cpu.pre.samples<12||cpu.post.samples<12||cpu.during.samples<(Date.parse(phase.finished)-Date.parse(phase.started))/1000*.8)flags.push('cpu-samples-missing');
  const dropped=k6.metrics.dropped_iterations?.count||0;
  const assertions={ssrCount:home+listing===count,readCount:fetched===home*25+listing*20,compositionOff:!row('api.read','home-content'),
    concurrency:Math.max(...events.map(x=>x.peaks['api.active']||0))<=8,
    metricsComplete:events.every(x=>!x.dropped&&x.rows.every(row=>!row.clipped)),
    // k6 2.2 can dispatch the slot at the exact deadline (timer vs context select).
    // Keep nominal deviations visible; allow at most ONE boundary slot/scenario.
    fixedArrivalBoundary:phase.executor!=='arrival'||(phase.workload==='mixed'
      ? home>=60&&home<=61&&listing>=60&&listing<=61&&count===home+listing
      : count>=120&&count<=121)};
  const failed=!!phase.failed||k6.metrics.http_req_failed.value!==0||k6.metrics.checks.fails!==0||errors!==0||dropped!==0||Object.values(assertions).some(x=>!x);
  stages.push({key,number:phase.number,executor:phase.executor,workload:phase.workload,variant:phase.variant,pair:phase.pair,buildId:phase.buildId,
    requests:count,home,listing,fetched,nominalArrivalCountMatches:phase.executor!=='arrival'||(count===120&&(phase.workload!=='mixed'||home===60&&listing===60)),
    httpP95Ms:k6.metrics.http_req_duration['p(95)'],rps:k6.metrics.http_reqs.rate,
    errorRate:k6.metrics.http_req_failed.value,checksFailed:k6.metrics.checks.fails,droppedIterations:dropped,exitCode:phase.exitCode,
    cpuMsPerRequest:web.reduce((sum,x)=>sum+x.runtime.cpuMs,0)/count,
    avgELU:web.reduce((sum,x)=>sum+x.runtime.eventLoopUtilization*x.windowMs,0)/Math.max(1,span),
    queue:Object.fromEntries(['content','cars','accessories'].map(label=>[label,row('api.queue',label)?.maxWindowP95Ms??null])),
    dom:Object.fromEntries(['public-home','home-component','legacy-page'].map(label=>{const item=row('cheerio.transform',label);return[label,item?item.sumMs/item.count:null];})),
    waitingPeak:Math.max(...events.map(x=>x.peaks['api.waiting']||0)),cpu,noiseFlags:flags,noisy:flags.length>0,failed,assertions,
    status429:events.reduce((sum,x)=>sum+x.rows.reduce((sum,row)=>sum+row.status429,0),0),
    status503:events.reduce((sum,x)=>sum+x.rows.reduce((sum,row)=>sum+row.status503,0),0) });
}
const pairs=[];
for(const executor of protocol.executors)for(const workload of protocol.workloads)for(let pair=1;pair<=3;pair++){
  const cell=stages.filter(x=>x.executor===executor&&x.workload===workload&&x.pair===pair),a=cell.find(x=>x.variant==='A'),b=cell.find(x=>x.variant==='B');
  if(!a||!b)continue;
  const drift=Math.abs(a.cpu.during.backgroundMean-b.cpu.during.backgroundMean);
  pairs.push({executor,workload,pair,A:a.key,B:b.key,clean:!a.noisy&&!b.noisy&&!a.failed&&!b.failed&&drift<=protocol.noise.pairedBackgroundMeanDifference,
    pairBackgroundDifference:drift,cpuChangePercent:(b.cpuMsPerRequest/a.cpuMsPerRequest-1)*100,
    p95ChangePercent:(b.httpP95Ms/a.httpP95Ms-1)*100,p95ChangeMs:b.httpP95Ms-a.httpP95Ms,
    rpsChangePercent:(b.rps/a.rps-1)*100,eluChange:b.avgELU-a.avgELU});
}
const summary=[];
for(const executor of protocol.executors)for(const workload of protocol.workloads){
  const cell=pairs.filter(x=>x.executor===executor&&x.workload===workload),clean=cell.filter(x=>x.clean);
  const describe=list=>({pairs:list.length,medianCpuChangePercent:median(list.map(x=>x.cpuChangePercent)),medianP95ChangePercent:median(list.map(x=>x.p95ChangePercent)),
    medianP95ChangeMs:median(list.map(x=>x.p95ChangeMs)),medianRpsChangePercent:median(list.map(x=>x.rpsChangePercent)),cpuImprovingPairs:list.filter(x=>x.cpuChangePercent<0).length});
  summary.push({executor,workload,all:describe(cell),clean:describe(clean)});
}
const incomplete=files.filter(name=>name.endsWith('-incomplete.json'));
const complete=stages.length===36&&incomplete.length===0;
const sufficient=complete&&summary.every(x=>x.clean.pairs>=protocol.decision.minCleanPairsPerCell);
const latencyOk=summary.every(x=>x.clean.pairs&&!(x.clean.medianP95ChangePercent>10&&x.clean.medianP95ChangeMs>20))
  &&pairs.filter(x=>x.clean).every(x=>!(x.p95ChangePercent>20&&x.p95ChangeMs>30));
const cpuOk=summary.filter(x=>x.workload!=='listing').every(x=>x.clean.medianCpuChangePercent<=-protocol.decision.minimumMedianCpuReductionPercent
  &&x.clean.cpuImprovingPairs>=protocol.decision.requiredCpuImprovingPairs);
const controlOk=summary.filter(x=>x.workload==='listing').every(x=>x.clean.pairs&&Math.abs(x.clean.medianCpuChangePercent)<=5);
const decision=sufficient&&latencyOk&&cpuOk&&controlOk&&!stages.some(x=>x.failed)?'propose-keep':'continue-rollback';
const result={complete,stages,pairs,summary,incomplete,decision,gates:{sufficient,latencyOk,cpuOk,controlOk},
  note:'All runs retained. Clean subset defined by pre-registered protocol. Median paired changes, not pooled percentiles. CPU background estimated by subtracting benchmark-owned process CPU from host counters; all raw deltas integrated.'};
if(!process.argv.includes('--partial'))assert(complete,'Expected 36 runs; incomplete/failing attempts remain recorded');
await writeFile(resolve(output,'analysis.json'),JSON.stringify(result,null,2));
const fixed=(value,decimals=2)=>value===null||value===undefined?'-':value.toFixed(decimals);
const runTable=['# All paired benchmark runs','',
  'Background CPU is estimated external CPU after subtracting benchmark-owned processes. Before/during/after means integrate all raw counter deltas; short boundary intervals are combined into approximately 1s windows. CPU = Next process ms per request. Queue = maximum diagnostic-window p95 in ms. No noisy or failed run deleted.','',
  '| Run | Requests | p95 ms | RPS | CPU ms/req | ELU | Queue content/cars/accessories ms | Background pre/during/post % | Host during % | Flags | HTTP errors % |',
  '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- | ---: |'];
for(const x of stages)runTable.push(`| ${x.key} | ${x.requests} | ${fixed(x.httpP95Ms)} | ${fixed(x.rps,3)} | ${fixed(x.cpuMsPerRequest)} | ${fixed(x.avgELU,3)} | ${Object.values(x.queue).map(v=>fixed(v)).join(' / ')} | ${['pre','during','post'].map(k=>fixed(x.cpu[k].backgroundMean*100,1)).join(' / ')} | ${fixed(x.cpu.during.hostMean*100,1)} | ${[...x.noiseFlags,...x.failed?['FAILED']:[]].join(', ')||'clean'} | ${fixed(x.errorRate*100)} |`);
await writeFile(resolve(output,'runs.md'),runTable.join('\n')+'\n');
const pairTable=['# All adjacent A/B pairs','',
  '| Mode | Workload | Pair | Comparable | CPU B vs A % | p95 B vs A % | p95 delta ms | Background difference pp |',
  '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |'];
for(const x of pairs)pairTable.push(`| ${x.executor} | ${x.workload} | ${x.pair} | ${x.clean?'clean':'noisy/failed'} | ${fixed(x.cpuChangePercent)} | ${fixed(x.p95ChangePercent)} | ${fixed(x.p95ChangeMs)} | ${fixed(x.pairBackgroundDifference*100)} |`);
await writeFile(resolve(output,'pairs.md'),pairTable.join('\n')+'\n');
for(const cell of summary)console.log(JSON.stringify(cell));
console.log(JSON.stringify({complete,runs:stages.length,noisy:stages.filter(x=>x.noisy).length,failed:stages.filter(x=>x.failed).length,decision}));
