const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exportsForTest={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/map-camera.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText,{exports:exportsForTest});
const camera=exportsForTest.createMapCameraPolicy;

test('Patient view frames an arriving ambulance once, without refitting on every GPS update',()=>{
 const c=camera();assert.equal(c.initialView(false,1,0),'center');
 assert.equal(c.initialView(true,5,1),'fit');
 for(let i=0;i<20;i++)assert.equal(c.initialView(true,5,1),'none');
});
test('Marker selection and manual zoom preserve the chosen view when markers and routes refresh',()=>{
 const c=camera();assert.equal(c.initialView(true,4,2),'fit');c.interact();
 assert.equal(c.initialView(true,8,3),'none');assert.equal(c.initialView(false,1,0),'none');
});
test('An icon clicked before the first location arrives cannot cause a later zoom reset',()=>{
 const c=camera();assert.equal(c.initialView(false,0,0),'none');c.interact();
 assert.equal(c.initialView(true,3,1),'none');assert.equal(c.initialView(false,1,0),'none');
 c.reset();assert.equal(c.initialView(true,3,1),'fit');
});
