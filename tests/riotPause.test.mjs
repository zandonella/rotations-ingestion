import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RiotPause, checkRiotResponse, assertRiotNotPaused, saveRiotPause } from '../lib/riotPause.js';
test('rate limits honor seconds, HTTP dates, and conservative fallback', () => {
 const now=Date.UTC(2026,9,3);
 assert.equal(new RiotPause(429,'7200',now).resumeAt,now+7200000);
 assert.equal(new RiotPause(429,new Date(now+7200000).toUTCString(),now).resumeAt,now+7200000);
 assert.equal(new RiotPause(429,undefined,now).resumeAt,now+3600000);
 assert.throws(()=>checkRiotResponse(403),RiotPause);
 checkRiotResponse(500);
});
test('pauses survive separate attempts; denied access requires manual clearance', () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'riot-pause-')); const file=path.join(dir,'state');
 try {
  assertRiotNotPaused(file,100);
  saveRiotPause(file,new RiotPause(429,'120',100));
  assert.throws(()=>assertRiotNotPaused(file,101),RiotPause);
  assertRiotNotPaused(file,120100);
  saveRiotPause(file,new RiotPause(401,undefined,100));
  assert.throws(()=>assertRiotNotPaused(file,9999999999999),RiotPause);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
