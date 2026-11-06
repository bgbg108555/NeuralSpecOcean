/** Bounded visual foam approximation: source from compression, semi-Lagrangian drift, exponential decay. */
export function createFoamField(THREE,{size=64,length=240,lifetime=3}={}){
 const a=new Float32Array(size*size),b=new Float32Array(size*size),pixels=new Uint8Array(size*size*4),stagingPixels=new Uint8Array(size*size*4);let current=a,next=b;let labels=new Float32Array(size*size*2),nextLabels=new Float32Array(size*size*2);const labelPixels=new Float32Array(size*size*4),stagingLabelPixels=new Float32Array(size*size*4);const previousPixels=new Float32Array(size*size*4);
 // Lightweight 1x1 stub for legacy API compatibility (Offshore.js unpacks both current & previous offsets from materialTexture.xyzw!)
 const previousMaterialTexture=new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType);previousMaterialTexture.needsUpdate=true;
 const materialTexture=new THREE.DataTexture(labelPixels,size,size,THREE.RGBAFormat,THREE.FloatType);materialTexture.wrapS=materialTexture.wrapT=THREE.RepeatWrapping;materialTexture.minFilter=materialTexture.magFilter=THREE.NearestFilter;materialTexture.generateMipmaps=false;materialTexture.needsUpdate=true;
 const texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 const mask=size-1;
 function labelAt(x,z,c){return labels[((z&mask)*size+(x&mask))*2+c]}
 function at(x,z){return current[(z&mask)*size+(x&mask)]}
 function uploadTex(){
  materialTexture.needsUpdate=true;texture.needsUpdate=true;
 }
 function updateRows(dt,source,flow,jStart,jEnd){
  const d=size/length,decay=Math.exp(-dt/lifetime),cellLen=length/size;
  for(let j=jStart;j<jEnd;j++){
   const wz=(j+.5)*cellLen,rowOff=j*size;
   for(let i=0;i<size;i++){
    const wx=(i+.5)*cellLen,r=source(wx,wz,i,j);
    const isObj=typeof r==='object'&&r!==null;
    const strength=isObj?r[0]:r,vx=isObj?r[1]:flow[0],vz=isObj?r[2]:flow[1];
    const x=i-vx*dt*d,z=j-vz*dt*d,x0=Math.floor(x),z0=Math.floor(z),u=x-x0,v=z-z0;
    const f=(at(x0,z0)*(1-u)+at(x0+1,z0)*u)*(1-v)+(at(x0,z0+1)*(1-u)+at(x0+1,z0+1)*u)*v;
    const idx=rowOff+i,lOff=idx*2,pOff=idx*4;
    for(let c=0;c<2;c++){
     const adv=(labelAt(x0,z0,c)*(1-u)+labelAt(x0+1,z0,c)*u)*(1-v)+(labelAt(x0,z0+1,c)*(1-u)+labelAt(x0+1,z0+1,c)*u)*v;
     const offset=adv-(c===0?vx:vz)*dt;
     nextLabels[lOff+c]=offset;
     stagingLabelPixels[pOff+c]=offset;
     stagingLabelPixels[pOff+c+2]=previousPixels[pOff+c];
    }
    const s=strength>0?strength:0;
    const value=Math.min(1,Math.max(0,f*decay+s*dt));
    next[idx]=value;
    const q=(value*255+0.5)|0;
    stagingPixels[pOff]=q;stagingPixels[pOff+1]=q;stagingPixels[pOff+2]=q;stagingPixels[pOff+3]=255;
   }
  }
 }
 function commitStaging(){
  labelPixels.set(stagingLabelPixels);
  pixels.set(stagingPixels);
  uploadTex();
 }
 function update(dt,source,flow=[.65,.18]){
  previousPixels.set(labelPixels);
  dt=Math.max(0,Math.min(.2,dt));
  updateRows(dt,source,flow,0,size);
  [current,next]=[next,current];[labels,nextLabels]=[nextLabels,labels];
  commitStaging();
 }
 function updateSlice(dt,source,sliceIdx,totalSlices=4,flow=[.65,.18]){
  dt=Math.max(0,Math.min(.2,dt));
  if(sliceIdx===0)previousPixels.set(labelPixels);
  const rowsPer=size/totalSlices;
  const j0=Math.round(sliceIdx*rowsPer),j1=sliceIdx===totalSlices-1?size:Math.round((sliceIdx+1)*rowsPer);
  updateRows(dt,source,flow,j0,j1);
  if(sliceIdx===totalSlices-1){
   [current,next]=[next,current];[labels,nextLabels]=[nextLabels,labels];
   commitStaging();
   return true;
  }
  return false;
 }
 return{texture,materialTexture,previousMaterialTexture,syncMaterialHistory(){for(let k=0;k<size*size;k++){labelPixels[k*4+2]=labelPixels[k*4];labelPixels[k*4+3]=labelPixels[k*4+1];}stagingLabelPixels.set(labelPixels);materialTexture.needsUpdate=true;previousPixels.set(labelPixels)},update,updateSlice,get materialOffsets(){return labels},reset(){previousPixels.fill(0);labels.fill(0);nextLabels.fill(0);labelPixels.fill(0);stagingLabelPixels.fill(0);materialTexture.needsUpdate=true;current.fill(0);next.fill(0);pixels.fill(0);stagingPixels.fill(0);texture.needsUpdate=true},get values(){return current},dispose(){texture.dispose();materialTexture.dispose();previousMaterialTexture.dispose()}};
}
