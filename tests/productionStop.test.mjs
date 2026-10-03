import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
test('service stop terminates the runner and its child process group', async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'production-stop-'));
 fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'data/run'),{recursive:true});
 fs.writeFileSync(path.join(root,'scripts/runProductionDirect.sh'),'echo $$ > data/run/production-run.pid\nsleep 60 &\necho $! > child.pid\nwait\n');
 const child=spawn('setsid',['--wait','bash','scripts/runProductionDirect.sh'],{cwd:root,stdio:'ignore'});
 const closed=once(child,'exit');
 try {
  for(let i=0;i<100&&!fs.existsSync(path.join(root,'child.pid'));i++) await new Promise(r=>setTimeout(r,10));
  assert.ok(fs.existsSync(path.join(root,'child.pid')));
  const result=spawnSync(process.execPath,[new URL('../scripts/stopProductionRun.mjs',import.meta.url).pathname],{cwd:root});
  assert.equal(result.status,0,result.stderr.toString());
  const outcome=await Promise.race([closed,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Runner did not stop')),2000).unref())]);
  assert.ok(outcome[0]===143||outcome[1]==='SIGTERM');
  const sleeper=Number(fs.readFileSync(path.join(root,'child.pid'),'utf8'));
  let running=false;
  try { const stat=fs.readFileSync(`/proc/${sleeper}/stat`,'utf8');running=!stat.includes(') Z '); } catch {}
  assert.equal(running,false,'Runner child is still alive');
 } finally {child.kill('SIGKILL');fs.rmSync(root,{recursive:true,force:true});}
});
