const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {QueryClient}=require('@tanstack/query-core');
function compile(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText,{exports});return exports;}
const labels=compile('src/lib/map-labels.ts');
const control=compile('src/lib/map-request-control.ts');
const live=compile('src/lib/live-query.ts');
const sharing=compile('src/lib/location-sharing.ts');
const layout=compile('src/lib/map-label-layout.ts');
const plain=value=>JSON.parse(JSON.stringify(value));

test('Busy operations labels spread around nearby beacons without overlapping or leaving the map',()=>{
 const input=Array.from({length:6},(_,i)=>({id:String(i),x:300+i*2,y:180,width:180,height:38,priority:i===0?3:1}));
 const placed=layout.arrangeMapLabels(input,800,400);assert.equal(placed.length,6);
 for(const box of placed){assert(box.x-box.width/2>=0);assert(box.x+box.width/2<=800);assert(box.y-box.height/2>=0);assert(box.y+box.height/2<=400);}
 for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
  const a=placed[i],b=placed[j];assert(Math.abs(a.x-b.x)>=(a.width+b.width)/2||Math.abs(a.y-b.y)>=(a.height+b.height)/2,'Labels overlap');
 }
});

test('Map labels distinguish same-name patients and follow current ambulance assignments',()=>{
 const a={id:'a',patient_name:'Alex Doe',incident_code:'SOS-001',assigned_unit_id:'u1',status:'dispatched'};
 const b={...a,id:'b',incident_code:'SOS-002',assigned_unit_id:'u2'};
 const u1={id:'u1',call_sign:'AMB-01',current_alert_id:'b',status:'en_route'};
 const u2={id:'u2',call_sign:'AMB-02',current_alert_id:'b',status:'en_route'};
 assert.equal(labels.patientMapLabel(a,[u1,u2]),'Alex Doe\nAMB-01 · SOS-001');
 assert.equal(labels.vehicleMapLabel(u1,[a,b]),'AMB-01 → Alex Doe\nSOS-001');
 assert.equal(labels.vehicleMapLabel(u2,[a,b]),'AMB-02 → Alex Doe\nSOS-002');
 assert(!labels.vehicleMapLabel(u1,[{...a,status:'resolved'},b]).includes('Alex'));
 assert(labels.patientMapLabel({...a,patient_name:' ',assigned_unit_id:null},[]).includes('Patient SOS-001\nUnassigned'));
 assert(labels.patientMapLabel(a,[]).includes('Assigned ambulance'));
});

test('Frequent GPS changes use the latest position without restarting the route-request clock',async()=>{
 let now=0,position=0;const requested=[];
 const loop=control.createLatestRequestLoop({latest:()=>position,request:async p=>{requested.push(p);return p;},onValue:()=>{},onError:()=>{},onLoading:()=>{},intervalMs:15000,available:()=>true,shouldRefresh:()=>true,now:()=>now});
 await loop.tick();
 for(let i=1;i<=14;i++){now=i*1000;position=i;await loop.tick();}
 assert.deepEqual(requested,[0]);now=15000;position=15;await loop.tick();assert.deepEqual(requested,[0,15]);
 loop.stop();now=30000;await loop.tick();assert.equal(requested.length,2);
});

test('Route refresh avoids overlapping requests, ignores results after leaving, and retries failures',async()=>{
 let now=0,finish;const values=[];let calls=0,errors=0;
 const loop=control.createLatestRequestLoop({latest:()=>({id:'call'}),request:()=>{calls++;return new Promise(resolve=>{finish=resolve;});},onValue:v=>values.push(v),onError:()=>errors++,onLoading:()=>{},intervalMs:10000,available:()=>true,shouldRefresh:()=>true,now:()=>now});
 const first=loop.tick();now=20000;await loop.tick();assert.equal(calls,1);loop.stop();finish('old call');await first;assert.equal(values.length,0);
 const retry=control.createLatestRequestLoop({latest:()=>1,request:async()=>{throw Error('network');},onValue:()=>{},onError:()=>errors++,onLoading:()=>{},intervalMs:10000,available:()=>true,shouldRefresh:()=>false,now:()=>now});
 await retry.tick();await retry.tick();assert.equal(errors,1);now+=10000;await retry.tick();assert.equal(errors,2);
});

test('Hidden/offline route lookups pause, and stationary routes refresh for traffic after one minute',async()=>{
 let now=0,available=true,calls=0;
 const loop=control.createLatestRequestLoop({latest:()=>1,request:async()=>++calls,onValue:()=>{},onError:()=>{},onLoading:()=>{},intervalMs:10000,available:()=>available,shouldRefresh:(_a,_b,elapsed)=>elapsed>=60000,now:()=>now});
 await loop.tick();for(now=10000;now<60000;now+=10000)await loop.tick();assert.equal(calls,1);
 available=false;await loop.tick();assert.equal(calls,1);available=true;await loop.tick();assert.equal(calls,2);
});

test('Simultaneous Google requests share one upstream call and do not retain completed content',async()=>{
 let calls=0,finish;const request=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
 const first=control.coalesceMapRequest('same-route',request),second=control.coalesceMapRequest('same-route',request);
 await Promise.resolve();assert.equal(calls,1);finish('route');assert.deepEqual(await Promise.all([first,second]),['route','route']);
 await control.coalesceMapRequest('same-route',async()=>{calls++;return 'fresh';});assert.equal(calls,2);
 await assert.rejects(control.coalesceMapRequest('retry',async()=>{throw Error('failed');}));assert.equal(await control.coalesceMapRequest('retry',async()=>42),42);
});

test('Stationary patient sharing avoids duplicate writes but moving GPS remains live',()=>{
 let last=null,writes=0;
 for(let at=0;at<=120000;at+=1000){const fix={latitude:-24.65,longitude:25.91,accuracy:5,at};if(sharing.shouldSharePatientFix(last,fix)){last=fix;writes++;}}
 assert.equal(writes,9); // Initial fix plus one heartbeat every 15 seconds.
 assert(sharing.shouldSharePatientFix(last,{...last,latitude:last.latitude+.0001,at:last.at+1000}));
 assert(!sharing.shouldSharePatientFix(last,{...last,latitude:last.latitude+.0001,at:last.at+100}));
});

test('Realtime cache patches update one unit, preserve others, and remove unassigned vehicles',()=>{
 const client=new QueryClient();
 const units=[{id:'u1',call_sign:'A',user_id:'crew1',latitude:1},{id:'u2',call_sign:'B',user_id:'crew2',latitude:2}];client.setQueryData(['ops','units'],units);client.setQueryData(['responder','unit','u1'],units[0]);
 live.applyUnitChange(client,{eventType:'UPDATE',new:{id:'u1',latitude:3},old:{id:'u1'}});
 assert.deepEqual(plain(client.getQueryData(['ops','units'])).map(u=>u.latitude),[3,2]);assert.equal(client.getQueryData(['responder','unit','u1']).latitude,3);
 live.applyUnitChange(client,{eventType:'UPDATE',new:{id:'u1',user_id:null},old:{id:'u1'}});assert.deepEqual(plain(client.getQueryData(['ops','units'])).map(u=>u.id),['u2']);client.clear();
});

test('Realtime events arriving during the initial snapshot are replayed without extra downloads',async()=>{
 const client=new QueryClient();let finish,calls=0;
 const pending=client.fetchQuery({queryKey:['ops','incidents'],queryFn:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 const row={id:'new',created_at:'2026-11-21T11:00:00Z',is_test:false,status:'active'};
 live.applyIncidentChange(client,{eventType:'INSERT',new:row,old:{}});finish([]);await pending;await Promise.resolve();
 assert.equal(client.getQueryData(['ops','incidents'])[0].id,'new');assert.equal(calls,1);
 live.applyIncidentChange(client,{eventType:'UPDATE',new:{...row,status:'resolved'},old:{id:'new'}});assert.equal(client.getQueryData(['ops','incidents'])[0].status,'resolved');
 live.applyIncidentChange(client,{eventType:'DELETE',new:{},old:{id:'new'}});assert.equal(client.getQueryData(['ops','incidents']).length,0);client.clear();
});

test('Shared private subscriptions start once and clean up only after the final consumer leaves',()=>{
 const owner={};let starts=0,stops=0;const start=()=>{starts++;return()=>stops++;};
 const first=live.retainSubscription(owner,'own-roles',start),second=live.retainSubscription(owner,'own-roles',start);
 assert.equal(starts,1);first();first();assert.equal(stops,0);second();assert.equal(stops,1);
 const fresh=live.retainSubscription(owner,'own-roles',start);assert.equal(starts,2);fresh();assert.equal(stops,2);
});
