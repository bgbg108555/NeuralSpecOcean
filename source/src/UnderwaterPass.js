/** Homogeneous single-scattering approximation, with per-pixel depth reconstruction.
 * 16-step per-ray integration of a cached 256-square displaced wave height field.
 */
export function createUnderwaterPass(THREE, renderer, scene, camera, U) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true
  });
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);

  const uniforms = {
    colorMap: { value: target.texture },
    depthMap: { value: target.depthTexture },
    invProjection: { value: new THREE.Matrix4() },
    worldMatrix: { value: new THREE.Matrix4() },
    eye: { value: new THREE.Vector3() },
    surfaceY: { value: 0 },
    pathDebug: { value: 0 },
    ...U,
    sigmaA: U.absorption,
    sigmaS: { value: new THREE.Vector3(0.024, 0.042, 0.052) },
    source: { value: new THREE.Vector3(0.09, 0.22, 0.27) }
  };

  const waveCode = scene.children
    .find(o => o.material?.uniforms === U)
    .material.vertexShader.split(/\bvoid\s+main\s*\(\s*\)/)[0]
    .replace(/varying\s+[^;]+;/g, '')
    .replaceAll('texture2D(tex,fract(', 'textureLod(tex,fract(')
    .replaceAll(')/n)).rgb', ')/n),0.).rgb');

  const heightTarget = new THREE.WebGLRenderTarget(256, 256, {
    format: THREE.RedFormat,
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false
  });
  heightTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
  U.boundaryHeightMap.value = heightTarget.texture;
  const heightUniforms = { ...U, mapCenter: U.boundaryMapCenter, mapRadius: U.boundaryMapRadius };

  const heightMaterial = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    uniforms: heightUniforms,
    vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `varying vec2 v;uniform vec2 mapCenter;uniform float mapRadius;
${waveCode}
void main(){
  vec2 world=mapCenter+(v*2.-1.)*mapRadius,q=world;
  for(int j=0;j<3;j++){vec3 d=displaced(q);q+=world-d.xz;}
  float h=displaced(q).y;
  gl_FragColor=vec4(h,0.,0.,1.);
}`
  });
  const heightScene = new THREE.Scene();
  heightScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), heightMaterial));
  uniforms.heightMap = { value: heightTarget.texture };
  uniforms.mapCenter = heightUniforms.mapCenter;
  uniforms.mapRadius = heightUniforms.mapRadius;

  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms,
    vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `varying vec2 v;uniform sampler2D colorMap,depthMap;uniform mat4 invProjection,worldMatrix;uniform vec3 eye,sigmaA,sigmaS,source;uniform float surfaceY,pathDebug;
uniform sampler2D heightMap,waterDepth;uniform vec2 mapCenter;uniform float mapRadius,captureScale,beachMode;uniform mat4 inverseProjection,cameraWorld;
${underwaterLightingGLSL}
float waveHeight(vec2 world){return textureLod(heightMap,(world-mapCenter)/(2.*mapRadius)+.5,0.).r;}
void main(){
  float depth=texture2D(depthMap,v).r;vec4 p=invProjection*vec4(v*2.-1.,depth*2.-1.,1.);p/=p.w;vec3 end=(worldMatrix*p).xyz;vec3 ray=end-eye;float distanceToHit=length(ray);
  vec3 extinction=max(sigmaA,vec3(0.))+sigmaS;vec3 integratedScatter=vec3(0.),prefixT=vec3(1.);float rayLength=min(distanceToHit,80.),travel=0.,depthSum=0.;vec3 direction=ray/max(distanceToHit,.0001);
  for(int i=0;i<16;i++){float t=(float(i)+.5)/16.;vec3 samplePoint=eye+direction*(t*rayLength);float below=waveHeight(samplePoint.xz)-samplePoint.y;float wet=smoothstep(-.06,.06,below);float segment=rayLength/16.;travel+=wet*segment;depthSum+=max(0.,below)*wet*segment;if(kdActive>.5){vec3 segT=exp(-extinction*(wet*segment));vec3 sourceRadiance=depthIrradiance(samplePoint)/(4.*3.14159265);integratedScatter+=prefixT*(sigmaS/extinction)*sourceRadiance*(1.-segT);prefixT*=segT;}}
  vec3 T=exp(-extinction*travel);float meanDepth=depthSum/max(travel,.001);vec3 ambient=source*exp(-vec3(.09,.045,.025)*meanDepth);vec3 scatter=ambient*sigmaS/max(extinction,vec3(.0001));vec3 surfaceColor=texture2D(colorMap,v).rgb;vec3 c=surfaceColor*T+scatter*(1.-T);
  vec2 maskUV=(v-.5)/captureScale+.5;float wd=textureLod(waterDepth,maskUV,0.).r;vec4 waterPoint=inverseProjection*vec4(maskUV*2.-1.,wd*2.-1.,1.);waterPoint/=waterPoint.w;float waterDistance=length((cameraWorld*waterPoint).xyz-eye);bool isInterface=wd<.999999&&abs(waterDistance-distanceToHit)<max(.025,.002*distanceToHit);vec3 objectLight=depth<.999999&&!isInterface?verticalObjectLight(end):vec3(1.);if(kdActive>.5)c=surfaceColor*objectLight*T+integratedScatter;
  if(pathDebug>.5&&pathDebug<1.5)c=vec3(1.-exp(-travel*.10));
  else if(pathDebug>1.5&&pathDebug<2.5)c=T;
  else if(pathDebug>2.5&&pathDebug<3.5)c=surfaceColor;
  else if(pathDebug>3.5&&pathDebug<4.5)c=isInterface?vec3(1.,0.,0.):(depth<.999999?vec3(0.,1.,0.):vec3(0.,0.,1.));
  else if(pathDebug>4.5&&pathDebug<5.5)c=vec3(log2(1.+distanceToHit)/10.);
  else if(pathDebug>5.5&&pathDebug<6.5)c=integratedScatter;
  else if(pathDebug>6.5)c=objectLight;
  else c=c/(vec3(1.)+c*.22);
  gl_FragColor=vec4(max(c,vec3(0.)),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
  });
  const postScene = new THREE.Scene();
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const postCamera = new THREE.PerspectiveCamera();
  const scratchSize = new THREE.Vector2();
  const scratchVp = new THREE.Vector4();
  const scratchSc = new THREE.Vector4();
  let width = 0, height = 0, lastTravel = 0;

  return {
    setDebug(n) { uniforms.pathDebug.value = n; },
    getCompileSpecs: () => [
      { label: '水下海面位移高度場解算 (UnderwaterHeight)', scene: heightScene, camera: postCamera, materials: [heightMaterial], targetMode: 'hdr' },
      { label: '水下比爾-朗伯體積散射合成 (UnderwaterPost)', scene: postScene, camera: postCamera, materials: [material], targetMode: 'canvasTone' }
    ],
    render(surface) {
      const size = renderer.getDrawingBufferSize(scratchSize);
      if (width !== size.x || height !== size.y) {
        width = size.x;
        height = size.y;
        target.setSize(width, height);
      }
      uniforms.invProjection.value.copy(camera.projectionMatrixInverse);
      uniforms.worldMatrix.value.copy(camera.matrixWorld);
      uniforms.eye.value.copy(camera.position);
      uniforms.surfaceY.value = surface;
      lastTravel = surface - camera.position.y;
      const old = renderer.getRenderTarget(), tone = renderer.toneMapping, auto = renderer.autoClear;
      renderer.getViewport(scratchVp);
      renderer.getScissor(scratchSc);
      const st = renderer.getScissorTest();
      try {
        renderer.autoClear = true;
        renderer.setScissorTest(false);
        renderer.toneMapping = THREE.NoToneMapping;
        heightUniforms.mapCenter.value.set(camera.position.x, camera.position.z);
        renderer.setRenderTarget(heightTarget);
        renderer.clear();
        renderer.render(heightScene, postCamera);
        renderer.setRenderTarget(target);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.toneMapping = tone;
        renderer.setRenderTarget(old);
        renderer.setViewport(scratchVp);
        renderer.render(postScene, postCamera);
      } finally {
        renderer.toneMapping = tone;
        renderer.autoClear = auto;
        renderer.setRenderTarget(old);
        renderer.setViewport(scratchVp);
        renderer.setScissor(scratchSc);
        renderer.setScissorTest(st);
      }
      const el = document.getElementById('underwaterStatus');
      if (el) el.textContent = (lastTravel > 0 ? '水下' : '水上') + '｜局部水深 ' + Math.max(0, lastTravel).toFixed(2) + ' m';
    },
    release() {
      if (width > 1 || height > 1) {
        width = 1;
        height = 1;
        target.setSize(1, 1);
      }
    },
    getTargets: () => [target, heightTarget],
    status() { return { width, height, submersion: lastTravel, targetRestored: renderer.getRenderTarget() !== target }; },
    dispose() {
      heightTarget.dispose();
      heightMaterial.dispose();
      heightScene.children[0].geometry.dispose();
      target.dispose();
      material.dispose();
      postScene.children[0].geometry.dispose();
    }
  };
}
