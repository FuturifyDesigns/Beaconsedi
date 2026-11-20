const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function compile(file, context = {}) {
 let source = fs.readFileSync(file, 'utf8').replace(/import\.meta\.env\.[A-Z_]+/g, '"test-browser-key"');
 const exports = {};
 vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, ...context });
 return exports;
}
test('Encoded routes render without loading an extra Google library', () => {
 const { decodePolyline } = compile('src/lib/polyline.ts');
 assert.deepEqual(JSON.parse(JSON.stringify(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'))), [{lat:38.5,lng:-120.2},{lat:40.7,lng:-120.95},{lat:43.252,lng:-126.453}]);
 for(const malformed of ['_', '~~~~~~', '\u0000', '????~~~~~~']) assert.equal(decodePolyline(malformed).length,0);
});
function loader() {
 const scripts=[], timers=[];
 const window = { setTimeout(fn,ms){timers.push({fn,ms});return timers.length;}, clearTimeout(){} };
 const api = compile('src/lib/google-maps-loader.ts', { window, navigator:{onLine:true}, document:{createElement(){return {remove(){this.removed=true}}},head:{appendChild(script){scripts.push(script)}}} });
 return {api,window,scripts,timers};
}
test('Concurrent maps wait for one complete SDK callback, even if its namespace appears early', async () => {
 const {api,window,scripts}=loader();
 const first=api.loadGoogleMaps();window.google={maps:{Map:function(){}}};
 const second=api.loadGoogleMaps();assert.equal(first,second);assert.equal(scripts.length,1);
 let complete=false;first.then(()=>complete=true);await Promise.resolve();assert.equal(complete,false);
 window[new URL(scripts[0].src).searchParams.get('callback')]();await first;assert.equal(complete,true);
 await api.loadGoogleMaps();assert.equal(scripts.length,1);
});
test('Network failure is bounded and a later retry can load successfully', async () => {
 const {api,window,scripts,timers}=loader();const pending=api.loadGoogleMaps();
 const failure=assert.rejects(pending,/could not be reached/);scripts[0].onerror();
 timers.find(t=>t.ms===400).fn();assert.equal(scripts.length,2);scripts[1].onerror();await failure;
 const retry=api.loadGoogleMaps();assert.equal(scripts.length,3);window.google={maps:{Map:function(){}}};window[new URL(scripts[2].src).searchParams.get('callback')]();await retry;
});
