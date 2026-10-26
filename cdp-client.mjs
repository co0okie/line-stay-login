// Local JSON-lines CDP bridge. No listener port, credentials file, or telemetry.
// Start: node cdp-client.mjs
// Commands: {"method":"Target.getTargets"}
// Attach: {"method":"Target.attachToTarget","params":{"targetId":"...","flatten":true}}
// Then pass sessionId with Debugger.enable, Network.enable, etc.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {createInterface} from 'node:readline';
import {appendFileSync} from 'node:fs';

const logFile = new URL(`./trace-${new Date().toISOString().replaceAll(':','-')}.jsonl`,import.meta.url);
const print = console.log;
console.log = value => {
  const record=JSON.stringify({time:new Date().toISOString(),...JSON.parse(value)});
  appendFileSync(logFile,record+'\n',{mode:0o600});
  print(record);
};

const file = `${homedir()}/.config/google-chrome/DevToolsActivePort`;
let port, path;
try { [port,path] = (await readFile(file,'utf8')).trim().split('\n'); }
catch { throw new Error('Enable remote debugging at chrome://inspect/#remote-debugging first.'); }
if (!/^\d+$/.test(port) || !path.startsWith('/devtools/browser/'))
  throw new Error('Unexpected DevToolsActivePort format.');
const ws = new WebSocket(`ws://127.0.0.1:${port}${path.trim()}`);
await new Promise((resolve,reject) => {
  const timer = setTimeout(() => reject(new Error('Chrome connection timed out; check its permission dialog.')),30000);
  ws.addEventListener('open',() => {clearTimeout(timer);resolve();},{once:true});
  ws.addEventListener('error',() => {clearTimeout(timer);reject(new Error('Chrome connection failed.'));},{once:true});
});
let id = 0;
// Forward only debugger pauses, lifecycle, and sanitized network metadata.
ws.addEventListener('message',e => {
  const m = JSON.parse(e.data);
  if (m.id) { console.log(JSON.stringify(m)); return; }
  if (m.method==='Debugger.paused') {
    const p=m.params;
    console.log(JSON.stringify({method:m.method,sessionId:m.sessionId,params:{
      reason:p.reason,callFrames:p.callFrames.map(f => ({
        callFrameId:f.callFrameId,functionName:f.functionName,location:f.location,url:f.url
      }))}}));
  } else if (m.method==='Network.requestWillBeSent') {
    const {requestId,request,initiator}=m.params;
    const u=new URL(request.url);
    if(u.hostname==='line-chrome-gw.line-apps.com' && /Auth|login|Profile|EncryptedIdentity|Token/i.test(u.pathname))
      console.log(JSON.stringify({method:m.method,sessionId:m.sessionId,params:{
        requestId,method:request.method,url:u.origin+u.pathname,initiator:{type:initiator?.type,stack:initiator?.stack?.callFrames?.slice(0,8)}
      }}));
  } else if (m.method==='Network.responseReceived') {
    const {requestId,response}=m.params;
    const u=new URL(response.url);
    if(u.hostname==='line-chrome-gw.line-apps.com' && /Auth|login|Profile|EncryptedIdentity|Token/i.test(u.pathname))
      console.log(JSON.stringify({method:m.method,sessionId:m.sessionId,params:{
        requestId,status:response.status,url:u.origin+u.pathname
      }}));
  } else if (['Network.loadingFailed','Target.attachedToTarget','Target.detachedFromTarget','Inspector.detached'].includes(m.method)) {
    console.log(JSON.stringify(m));
  }
});
ws.addEventListener('close',() => {console.log(JSON.stringify({disconnected:true}));process.exit(0);});
console.log(JSON.stringify({ready:true}));
for await (const line of createInterface({input:process.stdin})) {
  if (!line.trim()) continue;
  try {
    const cmd=JSON.parse(line);
    ws.send(JSON.stringify({...cmd,id:++id}));
  } catch(e) {console.log(JSON.stringify({error:e.message}));}
}
ws.close();
