const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');

function harness(){
 const slots=[],effects=[],maps=[],markers=[],clusters=[];let cursor=0;
 const div={clientWidth:800,clientHeight:400,listeners:{},querySelectorAll:()=>[],addEventListener(name,fn){this.listeners[name]=fn;},removeEventListener(name){delete this.listeners[name];}};
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const react={
  useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
  useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
  useCallback(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,fn};return slots[i].fn;},
  useEffect(fn,deps){const i=cursor++;const previous=slots[i];if(!previous||!same(previous.deps,deps)){slots[i]={deps};effects.push(()=>{previous?.cleanup?.();slots[i].cleanup=fn();});}},
 };
 class MapFake{
  constructor(_element,opts){this.zoom=opts.zoom;this.center=opts.center;this.fits=0;maps.push(this);}
  setOptions(){} getDiv(){return div;} getProjection(){return undefined;}
  setCenter(p){this.center=p;}panTo(p){this.center=p;}setZoom(z){this.zoom=z;}getZoom(){return this.zoom;}
  fitBounds(){this.fits++;this.zoom=4;}addListener(){return{remove(){}};}
 }
 class MarkerFake{
  constructor(opts){Object.assign(this,opts);this.events={};markers.push(this);}
  addListener(name,fn){this.events[name]=fn;}
  setMap(map){this.map=map;}getMap(){return this.map;}
  getPosition(){return{lat:()=>this.position.lat,lng:()=>this.position.lng};}
  setPosition(p){this.position=p;}setIcon(i){this.icon=i;}getIcon(){return this.icon;}
  setTitle(t){this.title=t;}setLabel(l){this.label=l;}setOpacity(){}
 }
 class Bounds{constructor(){this.points=[];}extend(p){this.points.push(p);}isEmpty(){return !this.points.length;}}
 class Overlay{setMap(){}}
 class Pair{constructor(x,y){this.x=x;this.y=y;}}
 const google={maps:{Map:MapFake,Marker:MarkerFake,Size:Pair,Point:Pair,LatLngBounds:Bounds,Circle:Overlay,Polyline:Overlay,TrafficLayer:Overlay,SymbolPath:{CIRCLE:1},Animation:{BOUNCE:1}}};
 const jsx=(_type,props)=>{if(props?.ref)props.ref.current=div;return{props};};
 const compiled=new Map();
 function load(file){if(compiled.has(file))return compiled.get(file);const exports={};compiled.set(file,exports);
  const source=fs.readFileSync(file,'utf8').replace(/import\.meta\.env\.BASE_URL/g,'"/"');
  const requireLocal=name=>{
   if(name==='react')return react;
   if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
   if(name==='@/components/MapFallback')return{MapFallback:()=>null};
   if(name==='@/lib/google-maps-loader')return{loadGoogleMaps:async()=>{},resetGoogleMapsLoader:()=>{}};
   if(name==='@/lib/polyline')return{decodePolyline:()=>[]};
   if(name==='@googlemaps/markerclusterer')return{MarkerClusterer:class{constructor(options){this.options=options;clusters.push(this);}clearMarkers(){}addMarkers(){}}};
   if(name.startsWith('@/lib/'))return load('src/lib/'+name.slice(6)+'.ts');
   throw Error('Unexpected module '+name);
  };
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:requireLocal,window:{google,addEventListener(){},removeEventListener(){}},performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame(){},console});return exports;
 }
 const component=load('src/components/GoogleMap.tsx').GoogleMap;
 return{maps,markers,clusters,div,async render(props){cursor=0;component(props);while(effects.length)effects.shift()();for(let i=0;i<6;i++)await Promise.resolve();},async mount(props){await this.render(props);await this.render(props);}};
}

test('Actual map component preserves zoom on icon selection and subsequent GPS renders; Fit stays explicit',async()=>{
 const h=harness();let selected=0;
 const props={markers:[{id:'patient',lat:-24.65,lng:25.91,image:'patient',onClick:()=>selected++}],vehicles:[{id:'unit',lat:-24.66,lng:25.92}],fitToMarkers:true};
 await h.mount(props);const map=h.maps[0];assert.equal(map.fits,1);map.setZoom(17);
 h.markers.find(m=>m.icon?.url?.includes('patient-beacon-round')).events.click();assert.equal(selected,1);
 await h.render({...props,markers:props.markers.map(m=>({...m,emphasis:true}))});
 for(let i=1;i<=4;i++)await h.render({...props,vehicles:[{...props.vehicles[0],lat:-24.66+i*.001}]});
 assert.equal(map.getZoom(),17);assert.equal(map.fits,1);assert.equal(h.maps.length,1);
 await h.render({...props,fitNonce:1});assert.equal(map.fits,2);
});

test('Vehicle clicks use the latest incident callback, and wheel zoom survives a later first vehicle',async()=>{
 const h=harness();let selected='';const base={markers:[{id:'p',lat:-24.65,lng:25.91}],fitToMarkers:false,vehicles:[]};
 await h.mount(base);const map=h.maps[0];map.setZoom(18);h.div.listeners.wheel();
 const vehicle={id:'unit',lat:-24.66,lng:25.92,onClick:()=>{selected='old';}};
 await h.render({...base,fitToMarkers:true,vehicles:[vehicle]});assert.equal(map.getZoom(),18);assert.equal(map.fits,0);
 await h.render({...base,fitToMarkers:true,vehicles:[{...vehicle,onClick:()=>{selected='current';}}]});
 h.markers.find(m=>m.icon?.url?.endsWith('ambulance.png')).events.click();assert.equal(selected,'current');assert.equal(map.getZoom(),18);
});

test('Clicking a grouped marker only zooms in, and does not trigger a later automatic zoom out',async()=>{
 const h=harness();const props={markers:[{id:'a',lat:-24.65,lng:25.91},{id:'b',lat:-24.651,lng:25.911}],cluster:true,fitToMarkers:true};
 await h.mount(props);const map=h.maps[0];assert.equal(h.clusters.length,1);map.setZoom(17);
 h.clusters[0].options.onClusterClick({}, {position:{lat:()=>-24.65,lng:()=>25.91}});
 assert.equal(map.getZoom(),19);await h.render({...props,markers:props.markers.map(m=>({...m,color:'red'}))});assert.equal(map.getZoom(),19);assert.equal(map.fits,1);
});
