import fs from 'node:fs';
import https from 'node:https';
const lab='/home/zando/rotations-linux-lab';
const lock=`${lab}/wine/prefix/drive_c/users/zando/AppData/Local/Riot Games/Riot Client/Config/lockfile`;
const [,,port,password]=fs.readFileSync(lock,'utf8').trim().split(':');
for (const endpoint of ['/rso-auth/v1/login-session','/product-launcher/v1/products/league_of_legends/patchlines/live/eligibility','/data-store/v1/install-settings/hardware-acceleration']) {
 await new Promise(resolve=>{
 const req=https.get({hostname:'127.0.0.1',port,path:endpoint,rejectUnauthorized:false,headers:{Authorization:`Basic ${Buffer.from(`riot:${password}`).toString('base64')}`},signal:AbortSignal.timeout(5000)},res=>{
 let raw='';res.on('data',c=>raw+=c);res.on('end',()=>{
 let summary;try {const d=JSON.parse(raw);summary=typeof d==='boolean'?d:{type:d?.type,state:d?.state,errorCode:d?.errorCode};}catch {summary='non-JSON'}
 console.log(endpoint,res.statusCode,JSON.stringify(summary));resolve();});});
 req.on('error',()=>{console.log(endpoint,'unreachable');resolve();});
 });
}
