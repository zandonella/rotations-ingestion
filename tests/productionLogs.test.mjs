import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'production-logs-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'bin'));
 fs.copyFileSync(new URL('../scripts/runProductionDirect.sh',import.meta.url),path.join(root,'scripts/runProductionDirect.sh'));
 fs.writeFileSync(path.join(root,'bin/node'),`#!/bin/bash
if [[ "$1" == scripts/productionRun.mjs ]]; then
 case "$2" in
  check|report-status) exit 0 ;;
  direct) echo 'collector output'; echo 'collector stderr' >&2; [[ -f fail-direct ]] && exit 75; exit 0 ;;
  upload-log) cp "$3" uploaded.log; [[ -f fail-upload ]] && exit 1; exit 0 ;;
 esac
fi
exec '${process.execPath}' "$@"
`,{mode:0o700});
 return {root,run:()=>spawnSync('bash',['scripts/runProductionDirect.sh'],{cwd:root,env:{...process.env,PATH:path.join(root,'bin')+':'+process.env.PATH},encoding:'utf8',timeout:10000})};
}
test('sales logs are fully flushed before upload, and success still publishes the email marker',t=>{
 const f=fixture(t);const r=f.run();assert.equal(r.status,0,r.stderr);
 assert.match(fs.readFileSync(path.join(f.root,'uploaded.log'),'utf8'),/collector output[\s\S]*collector stderr[\s\S]*Sales run completed with exit code 0/);
 assert.equal(fs.existsSync(path.join(f.root,'data/run/email-pull.json')),true);
 assert.equal(fs.existsSync(path.join(f.root,'data/run/production-run.pid')),false);
});
test('failed sales runs upload their error logs while preserving failure and never triggering emails',t=>{
 const f=fixture(t);fs.mkdirSync(path.join(f.root,'data/run'),{recursive:true});fs.writeFileSync(path.join(f.root,'data/run/email-pull.json'),JSON.stringify({runId:'old'}));fs.writeFileSync(path.join(f.root,'fail-direct'),'');const r=f.run();assert.equal(r.status,75,r.stderr);
 assert.match(fs.readFileSync(path.join(f.root,'uploaded.log'),'utf8'),/Sales run completed with exit code 75/);
 assert.equal(fs.existsSync(path.join(f.root,'data/run/email-pull.json')),false);
});
test('a log-upload outage retains the local file and does not turn successful ingestion into a failed run',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.root,'fail-upload'),'');const r=f.run();assert.equal(r.status,0);
 assert.match(r.stderr,/Sales log upload failed/);assert.equal(fs.readdirSync(path.join(f.root,'data/logs')).length,1);
});
