/* Static 1D shore-coordinate bed, replicated along a curved shore.
 * This coordinate is NOT signed Euclidean distance or 2D hydrodynamics. */
(function(root){
'use strict';
const mapping=Object.freeze({baseZ:15,offset:50,terms:Object.freeze([[3,.035],[1.1,.11],[-2,.07]].map(Object.freeze))});
const presets=Object.freeze({baseline:Object.freeze({amplitude:0,center:32,halfWidth:10}),sandbar:Object.freeze({amplitude:.28,center:32,halfWidth:10})});
function finite(v,label){if(!Number.isFinite(v))throw Error(label+' must be finite');return v;}
function shorelineZ(x){finite(x,'x');let z=mapping.baseZ;for(const [a,k] of mapping.terms)z+=a*Math.sin(k*x);return z;}
function coordinate(x,z){return finite(z,'z')-shorelineZ(x)+mapping.offset;}
function worldZ(x,s){return finite(s,'s')+shorelineZ(x)-mapping.offset;}
function baseline(s){return -2+.04*s;}
function bump(s,p){const t=(s-p.center)/p.halfWidth;if(Math.abs(t)>=1)return 0;return p.amplitude*Math.cos(Math.PI*t/2)**4;}
function bake(options={}){
 const {variant='baseline',n=240,dx=.5}=typeof options==='string'?{variant:options}:options;
 if(!presets[variant])throw Error('unknown terrain variant');if(n!==240||dx!==.5)throw Error('prototype requires n=240 and dx=.5');
 const profile=presets[variant],bed=Array.from({length:n},(_,i)=>{const s=(i+.5)*dx;return baseline(s)+bump(s,profile);});
 return {schema:'shared-shore-terrain-v1',variant,n,dx,length:n*dx,cellCenterOffset:.5,units:'meters',mapping:{baseZ:mapping.baseZ,offset:mapping.offset,terms:mapping.terms.map(t=>Array.from(t))},profile:{baseElevation:-2,slope:.04,...profile},outside:'linear-endpoint-extrapolation',bed};
}
function create(input={}){
 const data=input.schema?JSON.parse(JSON.stringify(input)):bake(input);
 if(data.schema!=='shared-shore-terrain-v1'||data.n!==240||data.dx!==.5||data.length!==120||data.cellCenterOffset!==.5||data.outside!=='linear-endpoint-extrapolation'||data.units!=='meters'||JSON.stringify(data.mapping)!==JSON.stringify(bake().mapping))throw Error('unsupported terrain schema, grid or mapping');
 if(!Array.isArray(data.bed)||data.bed.length!==data.n||!data.bed.every(Number.isFinite))throw Error('invalid baked bed');
 const bedArray=Float64Array.from(data.bed),n=data.n,dx=data.dx;
 function sampleS(s){finite(s,'s');const f=s/dx-.5,i=Math.max(0,Math.min(n-2,Math.floor(f))),w=f-i;return bedArray[i]*(1-w)+bedArray[i+1]*w;}
 function sample(x,z){return sampleS(coordinate(x,z));}
 function sampleIndex(s){const f=Math.max(0,Math.min(n-1,finite(s,'s')/dx-.5)),i=Math.min(n-2,Math.floor(f));return {i,w:f-i};}
 // Independent copies protect sampler and serialized bake from consumer mutation.
 return {variant:data.variant,n,dx,length:data.length,get data(){return JSON.parse(JSON.stringify(data));},get profile(){return bedArray.slice();},coordinate,worldZ,shorelineZ,sampleS,sample,bed:sample,sampleIndex,get bedArray(){return bedArray.slice();},serialize(){return JSON.parse(JSON.stringify(data));}};
}
const api=Object.freeze({bake,create,coordinate,worldZ,shorelineZ,presets});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.ShoreTerrain=api;
root.SharedShoreTerrain=api;
})(typeof globalThis!=='undefined'?globalThis:this);
