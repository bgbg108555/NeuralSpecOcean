/** Linear HDR opaque scene + displaced water depth. No feedback textures are drawn into themselves. */
export function createDepthCapture(THREE, renderer, scene, camera, hidden, U) {
  let target = null, waterTarget = null, w = 0, h = 0, samples = -1, failed = false, lastError = '';
  const captureCamera = camera.clone();
  // Single-evaluation depth-only water vertex shader (cuts waterTarget vertex texture & hydro cost by 67% vs 3-tap finite-diff!)
  const waterDepthVertexShader = `
${terrainGLSL}
${coastalWavesGLSL}
uniform sampler2D longWave, longPrevious, shortWave;
uniform float lengthLong, lengthShort, resolutionLong, resolutionShort, amplitude, chop, longMix, crestShape, time, beachMode, outerMode, midScale, uWaveLinear;
varying vec3 vWorld;

vec3 field(sampler2D tex, vec2 p, float len, float n){
  vec3 res;
  if (uWaveLinear > 0.5) {
    res = textureLod(tex, p / len, 0.0).rgb;
  } else {
    vec2 xy = fract(p / len) * n - 0.5, i = floor(xy), f = fract(xy);
    vec3 a = textureLod(tex, fract((i + vec2(0.5, 0.5)) / n), 0.0).rgb;
    vec3 b = textureLod(tex, fract((i + vec2(1.5, 0.5)) / n), 0.0).rgb;
    vec3 c = textureLod(tex, fract((i + vec2(0.5, 1.5)) / n), 0.0).rgb;
    vec3 d = textureLod(tex, fract((i + vec2(1.5, 1.5)) / n), 0.0).rgb;
    res = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  return res;
}
${mediumWaveGLSL}

void main(){
  vec2 p = position.xz;
  float bed0 = sampleBathymetry(p).r;
  if (beachMode > 0.5 && outerMode < 0.5 && bed0 > 0.65) {
    vec4 wpDry = modelMatrix * vec4(p.x, bed0 - 0.15, p.y, 1.0);
    vWorld = wpDry.xyz;
    gl_Position = projectionMatrix * viewMatrix * wpDry;
    return;
  }
  float rBox = max(abs(p.x), abs(p.y));
  float wShortV = outerMode > 0.5 ? (1.0 - smoothstep(175.5, 185.0, rBox)) : 1.0;
  float wMidV   = outerMode > 0.5 ? (1.0 - smoothstep(178.0, 196.0, rBox)) : 1.0;
  float wLongV  = outerMode > 0.5 ? (1.0 - smoothstep(235.0, 580.0, rBox)) : 1.0;

  vec3 fLong = mix(field(longPrevious, p, lengthLong, resolutionLong), field(longWave, p, lengthLong, resolutionLong), longMix) * wLongV;
  vec3 fShort = wShortV > 0.002 ? field(shortWave, p, lengthShort, resolutionShort) * wShortV : vec3(0.0);
  vec3 f = fLong + fShort;

  float d0 = max(0.0, -bed0);
  float chopAtten = beachMode > 0.5 ? smoothstep(0.04, 0.68, d0) : 1.0;
  float offshoreAtten = beachMode > 0.5 ? smoothstep(0.02, 0.88, d0) : 1.0;

  float h = amplitude * f.x;
  h += crestShape * wLongV * (sqrt(h * h + 0.09) - 0.3);
  vec3 mid = wMidV > 0.002 ? mediumWave(p, time) * (amplitude * midScale * wMidV) : vec3(0.0);
  h = (h + mid.x) * offshoreAtten;

  vec2 delta = (f.yz * amplitude * chop + mid.yz) * chopAtten;
  vec2 worldP = p + delta;

  if (beachMode > 0.5 && outerMode < 0.5) {
    vec4 hydro = evaluateCoastalHydro(worldP, time, amplitude);
    float pitchLean = 0.22 * hydro.y * smoothstep(0.08, 0.80, d0);
    worldP.y += pitchLean;
    float rockProxW = sampleBathymetry(worldP).b;
    float rockMeniscusLift = rockProxW * (0.026 + 0.036 * smoothstep(0.05, 0.85, abs(hydro.w) * 0.52 + hydro.y)) * smoothstep(0.01, 0.30, d0);
    h += hydro.x + rockMeniscusLift;
  }
  vec4 wp = modelMatrix * vec4(worldP.x, h, worldP.y, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

  const hiddenSet = new Set(hidden);
  const scratchDrawSize = new THREE.Vector2();
  const scratchViewport = new THREE.Vector4();
  const scratchScissor = new THREE.Vector4();
  const visObjs = [];
  const visStates = [];

  let capturePixelScale = 0.60;

  const waterScene = new THREE.Scene(), sources = hidden.slice(0, 2), copies = sources.map(source => {
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      colorWrite: false,
      uniforms: source.material.uniforms,
      vertexShader: waterDepthVertexShader,
      fragmentShader: `
${terrainGLSL}
${bathymetryGLSL}
uniform float beachMode;varying vec3 vWorld;
void main(){
  float bed = sampleBathymetry(vWorld.xz).r;
  if (beachMode > 0.5 && vWorld.y - bed <= 0.0005) discard;
  gl_FragColor = vec4(0.0);
}`
    });
    const mesh = new THREE.Mesh(source.geometry, material);
    mesh.frustumCulled = false;
    waterScene.add(mesh);
    return mesh;
  });

  function makeTarget(nw, nh, color = false) {
    const depthTex = new THREE.DepthTexture(nw, nh, THREE.UnsignedIntType);
    const t = new THREE.WebGLRenderTarget(nw, nh, {
      format: color ? THREE.RGBAFormat : THREE.RedFormat,
      type: color ? THREE.HalfFloatType : THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      samples: 0,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture: depthTex
    });
    t.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return t;
  }

  function ensure() {
    const size = renderer.getDrawingBufferSize(scratchDrawSize);
    const nw = Math.max(1, Math.ceil(size.x * U.captureScale.value * capturePixelScale));
    const nh = Math.max(1, Math.ceil(size.y * U.captureScale.value * capturePixelScale));
    if (target && w === nw && h === nh && samples === (U.captureSamples?.value ?? 4)) return;
    disposeTargets();
    target = makeTarget(nw, nh, true);
    waterTarget = makeTarget(nw, nh);
    w = nw;
    h = nh;
    samples = U.captureSamples?.value ?? 4;
    U.sceneDepth.value = target.depthTexture;
    U.sceneColor.value = target.texture;
    U.waterDepth.value = waterTarget.depthTexture;
    U.captureResolution.value.set(w, h);

    // Validate FBO completeness ONCE upon allocation/resize (eliminates 2 synchronous GPU-CPU stalls per frame!)
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    check();
    renderer.setRenderTarget(waterTarget);
    check();
    renderer.setRenderTarget(prevTarget);
  }

  function disposeTargets() {
    target?.dispose();
    waterTarget?.dispose();
    target = waterTarget = null;
    U.sceneDepth.value = U.sceneColor.value = U.waterDepth.value = null;
    w = h = 0;
  }

  function check() {
    const gl = renderer.getContext();
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw Error('Optics framebuffer incomplete');
    }
  }

  function capture() {
    const oldTarget = renderer.getRenderTarget();
    renderer.getViewport(scratchViewport);
    renderer.getScissor(scratchScissor);
    const scissorTest = renderer.getScissorTest();
    const tone = renderer.toneMapping;
    const autoClear = renderer.autoClear;
    let visCount = 0;
    try {
      ensure();
      renderer.getDrawingBufferSize(U.depthResolution.value);
      camera.updateMatrixWorld();
      captureCamera.copy(camera);
      captureCamera.projectionMatrix.copy(camera.projectionMatrix);
      captureCamera.projectionMatrix.elements[0] /= U.captureScale.value;
      captureCamera.projectionMatrix.elements[5] /= U.captureScale.value;
      captureCamera.projectionMatrixInverse.copy(captureCamera.projectionMatrix).invert();
      scene.traverse(o => {
        const mat = o.material;
        const isTransp = mat && (Array.isArray(mat) ? mat.some(m => m.transparent) : mat.transparent);
        if (hiddenSet.has(o) || o.userData?.isSkyDome || isTransp) {
          visObjs[visCount] = o;
          visStates[visCount] = o.visible;
          visCount++;
          o.visible = false;
        }
      });
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = true;
      renderer.setScissorTest(false);
      renderer.setRenderTarget(target);
      renderer.clear();
      if (U.uIsDepthCapture) U.uIsDepthCapture.value = 1.0;
      renderer.render(scene, captureCamera);
      if (U.uIsDepthCapture) U.uIsDepthCapture.value = 0.0;

      for (let i = 0; i < copies.length; i++) {
        const mesh = copies[i];
        mesh.geometry = sources[i].geometry;
        mesh.matrix.copy(sources[i].matrix);
        mesh.matrixAutoUpdate = false;
      }
      renderer.setRenderTarget(waterTarget);
      renderer.clear();
      renderer.render(waterScene, captureCamera);

      U.inverseProjection.value.copy(captureCamera.projectionMatrixInverse);
      U.opticalProjection.value.copy(captureCamera.projectionMatrix);
      U.cameraWorld.value.copy(camera.matrixWorld);
      U.depthNear.value = camera.near;
      U.depthFar.value = camera.far;
      U.depthEnabled.value = 1;
      failed = false;
      lastError = '';
      return true;
    } catch (e) {
      U.depthEnabled.value = 0;
      failed = true;
      lastError = String(e);
      return false;
    } finally {
      if (U.uIsDepthCapture) U.uIsDepthCapture.value = 0.0;
      for (let i = 0; i < visCount; i++) {
        visObjs[i].visible = visStates[i];
        visObjs[i] = null;
      }
      renderer.toneMapping = tone;
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(oldTarget);
      renderer.setViewport(scratchViewport);
      renderer.setScissor(scratchScissor);
      renderer.setScissorTest(scissorTest);
      if (failed) disposeTargets();
    }
  }

  return {
    capture,
    setPixelScale(scale) {
      const clamped = Math.max(0.30, Math.min(1.0, Number(scale) || 0.60));
      if (Math.abs(clamped - capturePixelScale) > 1e-4) {
        capturePixelScale = clamped;
      }
      return capturePixelScale;
    },
    get pixelScale() { return capturePixelScale; },
    ensureTargets: ensure,
    getCompileSpecs: () => [{
      label: '雙層水深光學折射擷取 (DepthCapture)',
      scene: waterScene,
      camera: captureCamera,
      materials: copies.map(m => m.material),
      targetMode: 'hdr'
    }],
    getTargets: () => (target && waterTarget ? [target, waterTarget] : []),
    dispose() {
      disposeTargets();
      copies.forEach(m => m.material.dispose());
      U.depthEnabled.value = 0;
    },
    get failed() { return failed; },
    get lastError() { return lastError; },
    get width() { return w; },
    get height() { return h; }
  };
}
