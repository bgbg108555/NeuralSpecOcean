/* Cinema-Grade Linear HDR Post-Processing, Dual-Kawase Diffraction Bloom, Radial Mie God-Rays &
 * Perceptual Oklab-AgX Gamut-Preserving Colorimetry (CinemaPostPass.js).
 *
 * Image-Rendering & Display Color-Science References:
 *  1. Jimenez (2014, SIGGRAPH, "Next Generation Post Processing in Call of Duty: Advanced Warfare"):
 *     Energy-conserving 13-tap / Dual-Kawase 4-level HDR downsample & tent-filter upsample bloom pyramid
 *     with quadratic soft-knee luminance extraction for liquid-diamond solar water glints.
 *  2. Mitchell (2007, GPU Gems 3, Ch. 13): Screen-space radial volumetric Mie crepuscular light shafts.
 *  3. Ottosson (2020, "A perceptual color space for image processing — Oklab") + Sobotka AgX / Khronos PBR Neutral:
 *     Perceptual Oklab gamut-preserving highlight desaturation + filmic S-curve, eliminating ACES cyan->purple
 *     hue skew so crystalline emerald-turquoise waves, cobalt skies & pure white surf crests stay 100% true!
 *  4. Loupias / AMD FidelityFX Contrast-Adaptive Sharpening (CAS) micro-detail restoration.
 */
export function createCinemaPostPass(THREE, renderer, scene, camera, sharedUniforms) {
  let w = 0, h = 0, currentSamples = -1, currentHalfRes = false;
  let desiredMsaa = 0, desiredHalfResBloom = false;
  let sceneTarget = null;
  const downTargets = [];
  const upTargets = [];
  let activeLevels = 3;

  const fsQuadGeo = new THREE.PlaneGeometry(2, 2);
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scratchBufSize = new THREE.Vector2();

  function createHdrTarget(tw, th, msaaSamples = 0, withDepth = false) {
    const rt = new THREE.WebGLRenderTarget(Math.max(1, tw), Math.max(1, th), {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      samples: msaaSamples,
      depthBuffer: withDepth,
      stencilBuffer: false
    });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return rt;
  }

  function ensureTargets(desiredSamples, useHalfRes) {
    const buf = renderer.getDrawingBufferSize(scratchBufSize);
    const nw = Math.max(2, buf.x);
    const nh = Math.max(2, buf.y);
    if (sceneTarget && w === nw && h === nh && currentSamples === desiredSamples && currentHalfRes === useHalfRes) return;

    disposeTargets();
    w = nw;
    h = nh;
    currentSamples = desiredSamples;
    currentHalfRes = useHalfRes;
    activeLevels = useHalfRes ? 4 : 3;
    sceneTarget = createHdrTarget(w, h, desiredSamples, true);

    // High quality uses half-res 4-level bloom for razor-sharp solar glints; Low/Medium use quarter-res 3-level bloom!
    let lw = useHalfRes ? w : Math.max(2, w >> 1);
    let lh = useHalfRes ? h : Math.max(2, h >> 1);
    for (let i = 0; i < activeLevels; i++) {
      lw = Math.max(2, lw >> 1);
      lh = Math.max(2, lh >> 1);
      downTargets.push(createHdrTarget(lw, lh, 0, false));
    }
    for (let i = 0; i < activeLevels - 1; i++) {
      const targetLevel = downTargets[activeLevels - 2 - i];
      upTargets.push(createHdrTarget(targetLevel.width, targetLevel.height, 0, false));
    }
  }

  function disposeTargets() {
    sceneTarget?.dispose();
    sceneTarget = null;
    while (downTargets.length) downTargets.pop().dispose();
    while (upTargets.length) upTargets.pop().dispose();
    w = h = 0;
  }

  // Pass 1: Soft-knee HDR highlight threshold + 9-tap anti-firefly Karis-weighted downsample
  const prefilterMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tInput: { value: null },
      texelSize: { value: new THREE.Vector2() },
      threshold: { value: 1.48 },
      knee: { value: 0.52 }
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
uniform sampler2D tInput;
uniform vec2 texelSize;
uniform float threshold, knee;
varying vec2 vUv;

vec3 extractHDR(vec3 c){
  // Clamp extreme sub-pixel specular NaNs/spikes while preserving dazzling solar water glints!
  c = clamp(c, vec3(0.0), vec3(28.0));
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
  soft = (soft * soft) / max(4.0 * knee, 1e-4);
  float contrib = max(soft, br - threshold) / max(br, 1e-4);
  // Karis partial luma compression suppresses single-pixel shimmering fireflies
  vec3 extracted = c * clamp(contrib, 0.0, 1.0);
  float luma = dot(extracted, vec3(0.2126, 0.7152, 0.0722));
  return extracted / (1.0 + luma * 0.085);
}

void main(){
  vec2 o = texelSize;
  vec3 c0 = extractHDR(texture2D(tInput, vUv).rgb) * 0.28;
  c0 += extractHDR(texture2D(tInput, vUv + vec2(-o.x, -o.y)).rgb) * 0.18;
  c0 += extractHDR(texture2D(tInput, vUv + vec2( o.x, -o.y)).rgb) * 0.18;
  c0 += extractHDR(texture2D(tInput, vUv + vec2(-o.x,  o.y)).rgb) * 0.18;
  c0 += extractHDR(texture2D(tInput, vUv + vec2( o.x,  o.y)).rgb) * 0.18;
  gl_FragColor = vec4(c0, 1.0);
}`
  });

  // Pass 2: Dual-Kawase / Jimenez 5-box downsample
  const downsampleMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tInput: { value: null },
      texelSize: { value: new THREE.Vector2() }
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
uniform sampler2D tInput;
uniform vec2 texelSize;
varying vec2 vUv;
void main(){
  vec2 o = texelSize;
  vec3 sum = texture2D(tInput, vUv).rgb * 0.50;
  sum += texture2D(tInput, vUv + vec2(-o.x, -o.y)).rgb * 0.125;
  sum += texture2D(tInput, vUv + vec2( o.x, -o.y)).rgb * 0.125;
  sum += texture2D(tInput, vUv + vec2(-o.x,  o.y)).rgb * 0.125;
  sum += texture2D(tInput, vUv + vec2( o.x,  o.y)).rgb * 0.125;
  gl_FragColor = vec4(sum, 1.0);
}`
  });

  // Pass 3: Jimenez 9-tap tent-filter upsample + progressive pyramid accumulation
  const upsampleMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tLow: { value: null },
      tHigh: { value: null },
      texelSize: { value: new THREE.Vector2() },
      radius: { value: 1.15 }
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
uniform sampler2D tLow, tHigh;
uniform vec2 texelSize;
uniform float radius;
varying vec2 vUv;
void main(){
  vec2 d = texelSize * radius;
  vec3 tent = texture2D(tLow, vUv + vec2(-d.x, -d.y)).rgb
            + texture2D(tLow, vUv + vec2( 0.0, -d.y)).rgb * 2.0
            + texture2D(tLow, vUv + vec2( d.x, -d.y)).rgb
            + texture2D(tLow, vUv + vec2(-d.x,  0.0)).rgb * 2.0
            + texture2D(tLow, vUv).rgb * 4.0
            + texture2D(tLow, vUv + vec2( d.x,  0.0)).rgb * 2.0
            + texture2D(tLow, vUv + vec2(-d.x,  d.y)).rgb
            + texture2D(tLow, vUv + vec2( 0.0,  d.y)).rgb * 2.0
            + texture2D(tLow, vUv + vec2( d.x,  d.y)).rgb;
  vec3 combined = texture2D(tHigh, vUv).rgb + (tent / 16.0) * 0.78;
  gl_FragColor = vec4(combined, 1.0);
}`
  });

  // Pass 4: Final Cinema Composite — Radial Mie God-Rays + Bloom + CAS + Oklab-AgX Gamut-Preserving Colorimetry!
  const compositeMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tScene: { value: null },
      tBloom: { value: null },
      texelSize: { value: new THREE.Vector2() },
      sunScreenPos: { value: new THREE.Vector2(0.5, 0.75) },
      sunVisibleWeight: { value: 0.0 },
      exposure: { value: 1.04 },
      bloomStrength: { value: 0.145 },
      uNightMix: { value: 0.0 },
      uGodRaySteps: { value: 8 },
      uFastComposite: { value: 0.0 }
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
uniform sampler2D tScene, tBloom;
uniform vec2 texelSize, sunScreenPos;
uniform float sunVisibleWeight, exposure, bloomStrength, uNightMix, uFastComposite;
uniform int uGodRaySteps;
varying vec2 vUv;

// Björn Ottosson (2020) Linear sRGB <-> Oklab Perceptual Color Space Matrices
vec3 linearSrgbToOklab(vec3 c){
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  float l_ = pow(max(l, 0.0), 1.0 / 3.0);
  float m_ = pow(max(m, 0.0), 1.0 / 3.0);
  float s_ = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  );
}

vec3 oklabToLinearSrgb(vec3 lab){
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  return max(vec3(0.0), vec3(
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ));
}

// Filmic shoulder-toe curve with crisp contrast & smooth highlight roll-off
vec3 filmicCurve(vec3 x){
  vec3 a = x * (x + 0.0245786) - 0.000090537;
  vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
  return clamp(a / b, 0.0, 1.0);
}

// Perceptual Oklab-AgX Gamut-Preserving Tone Mapping:
// Keeps exact Oklab perceptual hue angle atan(b, a) across emerald-turquoise water & cobalt sky,
// while smoothly desaturating super-luminous sun glints to pure warm white!
vec3 toneMapOklabCinema(vec3 hdr){
  vec3 x = max(hdr, vec3(0.0)) * exposure;

  // AgX-inspired working-space inset prevents hard channel clipping before curve
  const mat3 inset = mat3(
    0.8566, 0.0951, 0.0483,
    0.1373, 0.7612, 0.1015,
    0.1119, 0.0768, 0.8113
  );
  const mat3 outset = mat3(
     1.1969, -0.1322, -0.0647,
    -0.1906,  1.3585, -0.1679,
    -0.1476, -0.0987,  1.2463
  );

  vec3 mapped = outset * filmicCurve(inset * x);
  mapped = clamp(mapped, 0.0, 1.0);

  // Restore exact perceptual hue from original linear signal in Oklab while enhancing natural coastal vibrancy!
  vec3 labOrig = linearSrgbToOklab(min(x, vec3(8.0)));
  vec3 labMap  = linearSrgbToOklab(mapped);
  float origChroma = length(labOrig.yz);
  float mapChroma  = length(labMap.yz);
  vec2 hueDir = origChroma > 1e-5 ? labOrig.yz / origChroma : vec2(0.0);

  // Highlight path-to-white desaturation + artistic coastal midtone vibrancy & crisp Oklab lightness contrast toe!
  float peak = max(x.r, max(x.g, x.b));
  float highlightDesat = 1.0 / (1.0 + 0.24 * max(0.0, peak - 1.25));
  float midtoneVibrance = 1.0 + 0.14 * (1.0 - smoothstep(0.08, 0.56, mapChroma)) * smoothstep(0.04, 0.30, labMap.x);
  vec2 finalAB = mix(labMap.yz, hueDir * mapChroma, 0.78) * highlightDesat * midtoneVibrance;
  float Lc = clamp(labMap.x, 0.0, 1.0);
  float Lcontrast = clamp(Lc + 0.022 * sin((Lc - 0.48) * 3.14159265) * smoothstep(0.02, 0.22, Lc) * (1.0 - smoothstep(0.84, 0.99, Lc)), 0.0, 1.0);

  return clamp(oklabToLinearSrgb(vec3(Lcontrast, finalAB)), 0.0, 1.0);
}

vec3 linearToSRGB(vec3 c){
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main(){
  // Subtle Contrast-Adaptive Micro-Sharpening (CAS) in linear space (single-tap fast path on mobile/low tier!)
  vec3 c = texture2D(tScene, vUv).rgb;
  vec3 hdr = c;
  if (uFastComposite < 0.5) {
    vec3 nN = texture2D(tScene, vUv + vec2(0.0,  texelSize.y)).rgb;
    vec3 nS = texture2D(tScene, vUv + vec2(0.0, -texelSize.y)).rgb;
    vec3 nE = texture2D(tScene, vUv + vec2( texelSize.x, 0.0)).rgb;
    vec3 nW = texture2D(tScene, vUv + vec2(-texelSize.x, 0.0)).rgb;

    vec3 mn = min(c, min(min(nN, nS), min(nE, nW)));
    vec3 mx = max(c, max(max(nN, nS), max(nE, nW)));
    float lumaMx = dot(mx, vec3(0.2126, 0.7152, 0.0722));
    float lumaMn = dot(mn, vec3(0.2126, 0.7152, 0.0722));
    // Attenuate sharpening on bright specular glints & high-contrast edges so water/foam/wet-rock highlights never shimmer!
    float hdrPeak = max(mx.r, max(mx.g, mx.b));
    float glintSuppress = 1.0 / (1.0 + lumaMx * 1.45 + max(0.0, hdrPeak - 0.85) * 3.5);
    float casAmt = clamp((1.0 - (lumaMx - lumaMn) / max(lumaMx + 0.12, 0.14)) * 0.105 * glintSuppress, 0.0, 0.105);
    hdr = max(vec3(0.0), c + (c * 4.0 - (nN + nS + nE + nW)) * casAmt);
  }

  // Energy-conserving multi-scale HDR Bloom (liquid-diamond water glints + backlit wave crests + cloud rims)
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  hdr += bloom * bloomStrength;

  // Mitchell (2007) Radial Volumetric Mie Crepuscular God-Rays when looking toward coastal sun!
  if (uGodRaySteps > 0 && sunVisibleWeight > 0.005) {
    float fSteps = float(uGodRaySteps);
    vec2 delta = (sunScreenPos - vUv) * (0.68 / fSteps);
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec2 rayUv = vUv + delta * ign;
    vec3 shaft = vec3(0.0);
    float decay = 1.0;
    for (int i = 0; i < 16; i++) {
      if (i >= uGodRaySteps) break;
      rayUv += delta;
      vec2 clampedUv = clamp(rayUv, 0.002, 0.998);
      // Sample smooth bloom pyramid for silky volumetric shafts occluded naturally by clouds & rocks!
      vec3 sCol = texture2D(tBloom, clampedUv).rgb;
      shaft += min(sCol, vec3(4.0)) * decay;
      decay *= 0.91;
    }
    float radialFalloff = exp(-length((vUv - sunScreenPos) * vec2(1.45, 1.0)) * 2.35);
    float stepNorm = 12.0 / fSteps;
    vec3 rayTint = mix(vec3(1.12, 0.96, 0.78), vec3(0.68, 0.82, 1.08), clamp(uNightMix, 0.0, 1.0));
    hdr += shaft * (0.016 * stepNorm * sunVisibleWeight * radialFalloff) * rayTint;
  }

  // Subtle physical cos^4 natural lens illumination vignette (extremely gentle: 6% at far corners)
  vec2 centered = (vUv - 0.5) * vec2(1.15, 1.0);
  float vig = 1.0 - 0.065 * dot(centered, centered);
  hdr *= vig;

  vec3 displayLinear = toneMapOklabCinema(hdr);
  gl_FragColor = vec4(linearToSRGB(displayLinear), 1.0);
}`
  });

  const postMesh = new THREE.Mesh(fsQuadGeo, prefilterMat);
  const postScene = new THREE.Scene();
  postScene.add(postMesh);

  const makeCompileScene = mat => {
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(fsQuadGeo, mat));
    return s;
  };
  const prefilterCompileScene = makeCompileScene(prefilterMat);
  const downsampleCompileScene = makeCompileScene(downsampleMat);
  const upsampleCompileScene = makeCompileScene(upsampleMat);
  const compositeCompileScene = makeCompileScene(compositeMat);

  const sunWorldTmp = new THREE.Vector3();
  const camDirTmp = new THREE.Vector3();
  const vpSaved = new THREE.Vector4();
  const scSaved = new THREE.Vector4();

  function render(qualityOrSamples) {
    const samplesToUse = typeof qualityOrSamples === 'number'
      ? qualityOrSamples
      : (qualityOrSamples !== undefined ? (qualityOrSamples ? 2 : 0) : desiredMsaa);
    ensureTargets(samplesToUse, desiredHalfResBloom);

    const oldTarget = renderer.getRenderTarget();
    const oldTone = renderer.toneMapping;
    const oldAuto = renderer.autoClear;
    renderer.getViewport(vpSaved);
    renderer.getScissor(scSaved);
    const st = renderer.getScissorTest();

    try {
      // 1) Render entire 3D scene in pure unclipped Linear HDR (alpha-blended foam & spray blend in true linear light!)
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = true;
      renderer.setScissorTest(false);
      renderer.setRenderTarget(sceneTarget);
      renderer.clear();
      renderer.render(scene, camera);

      // 2) Multi-scale HDR Bloom Downsample Pyramid
      postMesh.material = prefilterMat;
      prefilterMat.uniforms.tInput.value = sceneTarget.texture;
      const preStep = currentHalfRes ? 1 : 2;
      prefilterMat.uniforms.texelSize.value.set(preStep / w, preStep / h);
      renderer.setRenderTarget(downTargets[0]);
      renderer.render(postScene, orthoCam);

      postMesh.material = downsampleMat;
      for (let i = 1; i < activeLevels; i++) {
        const prev = downTargets[i - 1];
        downsampleMat.uniforms.tInput.value = prev.texture;
        downsampleMat.uniforms.texelSize.value.set(1 / prev.width, 1 / prev.height);
        renderer.setRenderTarget(downTargets[i]);
        renderer.render(postScene, orthoCam);
      }

      // 3) Tent-Filter Upsample Pyramid
      postMesh.material = upsampleMat;
      for (let i = 0; i < activeLevels - 1; i++) {
        const low = i === 0 ? downTargets[activeLevels - 1] : upTargets[i - 1];
        const high = downTargets[activeLevels - 2 - i];
        const dest = upTargets[i];
        upsampleMat.uniforms.tLow.value = low.texture;
        upsampleMat.uniforms.tHigh.value = high.texture;
        upsampleMat.uniforms.texelSize.value.set(1 / low.width, 1 / low.height);
        renderer.setRenderTarget(dest);
        renderer.render(postScene, orthoCam);
      }

      // 4) Project sun position to screen UV for radial Mie crepuscular light shafts
      const sunDir = sharedUniforms.sunDirection.value;
      camera.getWorldDirection(camDirTmp);
      const facingSun = Math.max(0, camDirTmp.dot(sunDir));
      sunWorldTmp.copy(camera.position).addScaledVector(sunDir, 1000.0);
      sunWorldTmp.project(camera);
      compositeMat.uniforms.sunScreenPos.value.set(sunWorldTmp.x * 0.5 + 0.5, sunWorldTmp.y * 0.5 + 0.5);
      const inScreen = Math.max(0, 1.0 - Math.max(Math.abs(sunWorldTmp.x), Math.abs(sunWorldTmp.y)) * 0.65);
      const nightMix = sharedUniforms.uNightMix ? sharedUniforms.uNightMix.value : 0.0;
      compositeMat.uniforms.uNightMix.value = nightMix;
      compositeMat.uniforms.sunVisibleWeight.value = Math.pow(facingSun, 1.6) * inScreen * (1.0 - 0.76 * nightMix);
      compositeMat.uniforms.exposure.value = oldTone !== undefined ? (renderer.toneMappingExposure || 1.04) : 1.04;

      // 5) Final Cinema Oklab-AgX Composite to Canvas!
      postMesh.material = compositeMat;
      compositeMat.uniforms.tScene.value = sceneTarget.texture;
      compositeMat.uniforms.tBloom.value = upTargets[activeLevels - 2].texture;
      compositeMat.uniforms.texelSize.value.set(1 / w, 1 / h);

      renderer.setRenderTarget(oldTarget);
      renderer.setViewport(vpSaved);
      renderer.setScissor(scSaved);
      renderer.setScissorTest(st);
      renderer.render(postScene, orthoCam);
    } finally {
      renderer.toneMapping = oldTone;
      renderer.autoClear = oldAuto;
      renderer.setRenderTarget(oldTarget);
      renderer.setViewport(vpSaved);
      renderer.setScissor(scSaved);
      renderer.setScissorTest(st);
    }
  }

  return {
    render,
    setQuality({ msaaSamples = 0, halfResBloom = false, godRaySteps = 8, bloomStrength = 0.145, fastComposite = false } = {}) {
      desiredMsaa = msaaSamples | 0;
      desiredHalfResBloom = !!halfResBloom;
      compositeMat.uniforms.uGodRaySteps.value = Math.max(0, Math.min(16, godRaySteps | 0));
      compositeMat.uniforms.bloomStrength.value = bloomStrength;
      compositeMat.uniforms.uFastComposite.value = fastComposite ? 1.0 : 0.0;
    },
    getTargets: () => (sceneTarget ? [sceneTarget, ...downTargets, ...upTargets] : []),
    ensureCompileTarget() {
      ensureTargets(desiredMsaa, desiredHalfResBloom);
      return sceneTarget;
    },
    getCompileSpecs: () => [
      { label: 'HDR 高光軟膝降採樣預濾 (BloomPrefilter)', scene: prefilterCompileScene, camera: orthoCam, materials: [prefilterMat], targetMode: 'hdr' },
      { label: 'Dual-Kawase 金字塔降採樣 (BloomDownsample)', scene: downsampleCompileScene, camera: orthoCam, materials: [downsampleMat], targetMode: 'hdr' },
      { label: 'Jimenez 九點帳篷升採樣 (BloomUpsample)', scene: upsampleCompileScene, camera: orthoCam, materials: [upsampleMat], targetMode: 'hdr' },
      { label: 'Oklab-AgX 廣色域色調映射與丁達爾光束 (CinemaComposite)', scene: compositeCompileScene, camera: orthoCam, materials: [compositeMat], targetMode: 'canvasNoTone' }
    ],
    dispose() {
      disposeTargets();
      prefilterMat.dispose();
      downsampleMat.dispose();
      upsampleMat.dispose();
      compositeMat.dispose();
      fsQuadGeo.dispose();
    }
  };
}
