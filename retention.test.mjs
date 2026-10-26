import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRetainer, HOST, DAYS} from './companion-extension/retention.js';

const now = 1800000000;
const sample = (extra = {}) => ({name:'lct',value:'test-token',domain:HOST,
  path:'/',storeId:'0',hostOnly:true,secure:true,httpOnly:true,
  sameSite:'no_restriction',session:true,...extra});

function fixture(initial = []) {
  let cookies = structuredClone(initial);
  const writes = [];
  let listener = () => {};
  const api = {cookies:{
    getAll: async q => structuredClone(cookies.filter(c =>
      (!q.name || q.name===c.name) && (!q.storeId || q.storeId===c.storeId) &&
      (!q.domain || c.domain.replace(/^\./,'').endsWith(q.domain)) &&
      JSON.stringify(q.partitionKey)===JSON.stringify(c.partitionKey))),
    set: async d => {
      writes.push(structuredClone(d));
      const updated = sample({...d,domain:d.domain ?? HOST,hostOnly:!d.domain,session:false});
      cookies = cookies.filter(c => c.storeId!==updated.storeId || c.path!==updated.path ||
        c.name!==updated.name || JSON.stringify(c.partitionKey)!==JSON.stringify(updated.partitionKey));
      cookies.push(updated);
      // Chrome emits a set event for writes made by the extension itself.
      void listener({removed:false,cookie:structuredClone(updated)});
      return structuredClone(updated);
    },
  }};
  const keeper = createRetainer(api, () => now);
  listener = keeper.onChanged;
  return {api, keeper, writes, replace:c => {cookies=structuredClone(c);}};
}

test('fresh session cookie becomes persistent without changing its security attributes', async () => {
  const original=sample();const f=fixture([original]);
  await f.keeper.onChanged({removed:false,cookie:original});
  await f.keeper.sweep();
  assert.equal(f.writes.length,1); // Own event must not cause an infinite write loop.
  assert.equal(f.writes[0].expirationDate,now+DAYS*86400);
  for(const prop of ['value','secure','httpOnly','sameSite','path','storeId'])
    assert.equal(f.writes[0][prop],original[prop]);
  assert.equal(Object.hasOwn(f.writes[0],'domain'),false);
});

test('logout deletion and subsequent sweeps never recreate the removed cookie',async()=>{
  const original=sample();const f=fixture([]);
  await f.keeper.onChanged({removed:true,cookie:original,cause:'explicit'});
  await f.keeper.sweep();assert.equal(f.writes.length,0);
});

test('logout while a queued cookie lookup is in flight cancels the pending renewal',async()=>{
  const original=sample();const f=fixture([original]);let resolveLookup;
  f.api.cookies.getAll=()=>new Promise(resolve=>{resolveLookup=resolve;});
  const work=f.keeper.onChanged({removed:false,cookie:original});
  await Promise.resolve();
  await f.keeper.onChanged({removed:true,cookie:original,cause:'explicit'});
  resolveLookup([original]);await work;assert.equal(f.writes.length,0);
});

test('a stale change event never writes an old token over a newer login',async()=>{
  const old=sample();const current=sample({value:'replacement-token'});
  const f=fixture([current]);
  await f.keeper.onChanged({removed:false,cookie:old});
  assert.equal(f.writes.length,0);
  await f.keeper.onChanged({removed:false,cookie:current});
  assert.equal(f.writes[0].value,current.value);
});

test('periodic sweep rolls forward a cookie approaching the renewal threshold',async()=>{
  const f=fixture([sample({session:false,expirationDate:now+394*86400})]);
  await f.keeper.sweep();assert.equal(f.writes[0].expirationDate,now+400*86400);
});

test('cookies from other domains, subdomains or with other names are untouched',async()=>{
  const cookies=[sample({domain:'example.com'}),sample({domain:`other.${HOST}`}),sample({name:'other'})];
  const f=fixture(cookies);
  for(const cookie of cookies)await f.keeper.onChanged({removed:false,cookie});
  await f.keeper.sweep();assert.equal(f.writes.length,0);
});

test('domain, partition, and cookie-store scope survive renewal',async()=>{
  const original=sample({domain:'.'+HOST,hostOnly:false,storeId:'1',
    partitionKey:{topLevelSite:'https://line.me',hasCrossSiteAncestor:true}});
  const f=fixture([original]);
  await f.keeper.onChanged({removed:false,cookie:original});
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].domain,original.domain);
  assert.equal(f.writes[0].storeId,'1');
  assert.deepEqual(f.writes[0].partitionKey,original.partitionKey);
});

test('API failure does not poison subsequent renewals',async()=>{
  const original=sample();const f=fixture([original]);
  const get=f.api.cookies.getAll;f.api.cookies.getAll=async()=>{throw Error('test failure');};
  await assert.rejects(f.keeper.onChanged({removed:false,cookie:original}));
  f.api.cookies.getAll=get;
  await f.keeper.onChanged({removed:false,cookie:original});
  assert.equal(f.writes.length,1);
});
