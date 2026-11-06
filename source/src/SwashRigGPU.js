/* Pure-GPU 512x256 Ping-Pong Coastal Memory Simulator (Swash, Wet Sand, Water Film & Foam).
 * Tuned so surf water stays crystal-clear translucent between wave crests, while breaking lips,
 * rock collars, receding water film, and delicate strandline lace look crisp and natural!
 * Channels of swashStateMap (RGBA16F, hardware LinearFilter):
 *   R = wet      : sand moisture saturation (0..1, slow 18s drying after wave retreat)
 *   G = film     : thin mirror-like receding water sheet on wet sand (0..1, ~3.2s drainage)
 *   B = foamAdv  : advected surf & rock foam trail (drives translucent lacy foam, NOT solid white blanket!)
 *   A = strand   : delicate high-water strandline bubble residue deposited at peak run-up retreat
 */
export function createSwashRigGPU(THREE, renderer, bathymetryTexture, detailTexture) {
  const W = 512, H = 256;
  const makeRT = () => {
    const rt = new THREE.WebGLRenderTarget(W, H, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false
    });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return rt;
  };

  let rtRead = makeRT();
  let rtWrite = makeRT();

  // Fallback 1x1 zero impact foam map & neutral rock contact map until subsystems bind live textures
  const emptyImpactData = new Uint8Array(4);
  const emptyImpactTex = new THREE.DataTexture(emptyImpactData, 1, 1, THREE.RGBAFormat);
  emptyImpactTex.needsUpdate = true;

  const emptyContactData = new Uint8Array([0, 128, 128, 0]);
  const emptyContactTex = new THREE.DataTexture(emptyContactData, 1, 1, THREE.RGBAFormat);
  emptyContactTex.needsUpdate = true;

  const uniforms = {
    prevState: { value: rtRead.texture },
    bathymetryMap: { value: bathymetryTexture },
    terrainProfile: terrainUniforms.terrainProfile,
    detailMap: { value: detailTexture },
    impactFoamMap: { value: emptyImpactTex },
    coastalContactMap: { value: emptyContactTex },
    time: { value: 0 },
    dt: { value: 0.016 },
    amplitude: { value: 0.6 },
    foamBoost: { value: 1.0 },
    initPass: { value: 1 }
  };

  const simMaterial = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms,
    vertexShader: `varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
    fragmentShader: `precision highp float;
varying vec2 vUv;
uniform sampler2D prevState, detailMap, impactFoamMap, coastalContactMap;
uniform float time, dt, amplitude, foamBoost, initPass;
${terrainGLSL}
${coastalWavesGLSL}

void main(){
  vec2 worldP = vec2(-180.0, -90.0) + vUv * vec2(360.0, 150.0);
  vec4 bathy = sampleBathymetry(worldP);
  float bed = bathy.r;
  float rockWake = bathy.a;
  vec4 contactData = texture2D(coastalContactMap, vUv);
  float tightRockProx = contactData.a;

  vec4 hydro = evaluateCoastalHydro(worldP, time, amplitude);
  float eta = hydro.x;
  float breaker = hydro.y;
  float swashLip = hydro.z;
  float crossVel = hydro.w;
  float depth = eta - bed;

  if (initPass > 0.5) {
    float amp = clamp(amplitude / 0.6, 0.25, 2.0);
    float lobeReach = 1.0 + 0.11 * sin(worldP.x * 0.135 + 0.6) + 0.055 * cos(worldP.x * 0.24 - 1.05);
    float grainVar = (texture2D(detailMap, worldP * 0.11).r - 0.5) * 0.06;
    float maxReach = 0.34 * amp * lobeReach * (1.0 - 0.28 * rockWake) + grainVar;
    float wetInit = max(1.0 - smoothstep(maxReach - 0.09, maxReach + 0.10, bed), tightRockProx * smoothstep(0.45, -0.05, bed));
    float filmInit = depth > 0.002 ? 1.0 : 0.60 * (1.0 - smoothstep(-0.02, maxReach * 0.82, bed));
    vec4 impInit = texture2D(impactFoamMap, vUv);
    gl_FragColor = vec4(wetInit, filmInit, clamp(breaker * 0.44 + (impInit.r + impInit.g + impInit.a * 0.35) * 0.65, 0.0, 1.0), 0.0);
    return;
  }

  float stepDt = clamp(dt, 0.001, 0.25);

  // Coupled 2D potential-flow tangential slip around sculpted 3D rock normals + far-field bathymetry refraction
  float eps = 0.85;
  float rpR = sampleBathymetry(worldP + vec2(eps, 0.0)).b;
  float rpL = sampleBathymetry(worldP - vec2(eps, 0.0)).b;
  float lateralDeflect = -(rpR - rpL) / (2.0 * eps) * 2.1 * max(0.25, abs(crossVel));

  vec2 vel = vec2(lateralDeflect + 0.12 * sin(worldP.x * 0.05 + time * 0.28), crossVel);
  if (tightRockProx > 0.03) {
    vec2 rawN = contactData.gb * 2.0 - 1.0;
    float nLen = length(rawN);
    vec2 rockOutN = nLen > 0.04 ? (rawN / nLen) : vec2(0.0, -1.0);
    float intoWall = max(0.0, -dot(vel, rockOutN));
    vec2 tangDir = vec2(-rockOutN.y, rockOutN.x);
    float tangSign = dot(vel, tangDir) >= 0.0 ? 1.0 : -1.0;
    vel += rockOutN * (intoWall * 0.92 * tightRockProx) + tangDir * (tangSign * intoWall * 0.58 * tightRockProx);
  }
  vec2 backWorld = worldP - vel * stepDt;
  vec2 backUv = clamp((backWorld - vec2(-180.0, -90.0)) / vec2(360.0, 150.0), 0.0, 1.0);

  vec4 here = texture2D(prevState, vUv);
  vec4 adv = texture2D(prevState, backUv);

  // Spatial sand porosity variation so drainage & drying form organic grain-scale fingers instead of uniform bands
  float porosity = texture2D(detailMap, worldP * 0.14 + vec2(1.7, 3.1)).r;

  // Read all 4 channels of Sobolev-PINN impact & gravity-draining rock wash sheet
  vec4 impactData = texture2D(impactFoamMap, vUv);
  float rockRunoff = impactData.a * smoothstep(0.06, 0.52, max(tightRockProx, bathy.b * 0.72));

  // 1. Wet sand & basal rock-collar saturation (R): saturates on wave contact or PINN rock wash runoff
  float submerged = smoothstep(-0.003, 0.012, depth);
  float dryTau = mix(13.5, 22.0, porosity);
  float wet = mix(here.r * exp(-stepDt / dryTau), 1.0, 1.0 - pow(1.0 - submerged, 1.0 + stepDt * 24.0));
  wet = max(wet, max(submerged, clamp(rockRunoff * 0.90, 0.0, 1.0)));

  // 2. Thin mirror-gloss receding water film (G): lingers ~3.0-5.4s behind retreating water tongue & rock drainage!
  float filmTau = mix(5.4, 2.7, clamp(bed / 0.44, 0.0, 1.0)) * (0.80 + 0.42 * porosity);
  float film = max(max(submerged, clamp(rockRunoff * 0.76, 0.0, 0.88)), here.g * exp(-stepDt / filmTau));

  // 3. Patchy turbulent foam advection + isotropic eddy diffusion + continuous rock collar boil (B):
  vec2 texel = 1.0 / vec2(512.0, 256.0);
  float lapFoam = 0.25 * (
    texture2D(prevState, clamp(backUv + vec2(texel.x * 1.6, 0.0), 0.0, 1.0)).b +
    texture2D(prevState, clamp(backUv - vec2(texel.x * 1.6, 0.0), 0.0, 1.0)).b +
    texture2D(prevState, clamp(backUv + vec2(0.0, texel.y * 1.6), 0.0, 1.0)).b +
    texture2D(prevState, clamp(backUv - vec2(0.0, texel.y * 1.6), 0.0, 1.0)).b
  );
  float patchMacro = texture2D(detailMap, worldP * 0.035 + vec2(time * 0.007, -time * 0.011)).g;
  float patchFine  = texture2D(detailMap, worldP * 0.115 - vec2(time * 0.013, time * 0.016)).b;
  float patchy = smoothstep(0.16, 0.88, 0.56 * patchMacro + 0.44 * patchFine);
  float boilScour = smoothstep(0.62, 0.90, texture2D(detailMap, worldP * 0.068 + vec2(-time * 0.009, time * 0.012)).r);

  float rockProx = max(bathy.b, tightRockProx * 0.88);
  float waveActivity = clamp(abs(crossVel) * 0.52 + breaker * 0.88, 0.0, 1.6);
  // Continuous live windward & flanking rock-wave collar + draining PINN wash runoff
  float liveRockCollar = rockProx * smoothstep(0.12, 0.95, waveActivity) * (0.46 + 0.70 * patchy) * smoothstep(-0.03, 0.14, depth);
  float dynRockImpact  = (impactData.r * (0.95 + 0.65 * patchy) + impactData.g * (0.85 + 0.65 * patchy) + rockRunoff * 0.38 * patchy)
                       * smoothstep(-0.04, 0.12, depth);
  float wakeShear      = rockWake * max(adv.b, 0.35 * waveActivity) * waveActivity * 0.65 * patchy * smoothstep(0.01, 0.18, depth);

  // Softened, patchy breaker & swash injection (zero uniform band wall!)
  float softBreakerSrc = breaker * (0.28 + 1.15 * patchy * patchy);
  float softSwashSrc   = swashLip * (0.24 + 0.92 * patchy * patchy);
  float foamSrc = (softBreakerSrc + softSwashSrc + dynRockImpact * 1.85 + liveRockCollar * 1.32 + wakeShear) * foamBoost;
  float foamTau = mix(mix(0.65, 1.55, film), 2.55 * (1.0 - 0.36 * boilScour), submerged);
  float advBlended = mix(adv.b, lapFoam, 0.34);
  float baseFoam = mix(here.b, advBlended, mix(0.28, 0.92, max(submerged, film * 0.58))) * exp(-stepDt / max(0.25, foamTau));
  float foamAdv = clamp(baseFoam + foamSrc * stepDt * 1.58, 0.0, 1.0);

  // 4. Scalloped high-water strandline bubble residue (A): deposited along curved lobe turnaround arcs!
  float turnaround = max(0.0, here.g - submerged) * smoothstep(0.01, 0.38, bed) * (0.32 + 0.98 * patchy);
  float washedClean = 1.0 - 0.88 * submerged;
  float strand = clamp(here.a * exp(-stepDt / 6.2) * washedClean + turnaround * 2.35 * foamBoost, 0.0, 1.0);

  gl_FragColor = vec4(wet, film, foamAdv, strand);
}`
  });

  const quadScene = new THREE.Scene();
  const quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial);
  quadScene.add(quadMesh);
  const quadCam = new THREE.PerspectiveCamera();

  function runPass(simTime, stepDt, isInit = false) {
    uniforms.prevState.value = rtRead.texture;
    uniforms.time.value = simTime;
    uniforms.dt.value = stepDt;
    uniforms.initPass.value = isInit ? 1 : 0;
    renderer.setRenderTarget(rtWrite);
    renderer.render(quadScene, quadCam);
    const tmp = rtRead;
    rtRead = rtWrite;
    rtWrite = tmp;
  }

  function warmup(targetTime = 0, amplitude = 0.6, foamBoost = 1.0, coStepFn = null) {
    const oldTarget = renderer.getRenderTarget();
    const oldTone = renderer.toneMapping;
    const oldAutoClear = renderer.autoClear;
    try {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = true;
      uniforms.amplitude.value = amplitude;
      uniforms.foamBoost.value = foamBoost;
      // Phase A: 10.4s coarse moisture & water-film equilibration (22 steps, dt = 0.47s)
      const coarseSpan = 10.4, coarseSteps = 22, coarseDt = coarseSpan / coarseSteps;
      // Phase B: 3.6s fine co-simulation with 3D wave-rock collision & splashdown foam (32 steps, dt = 0.1125s)
      const fineSpan = 3.6, fineSteps = 32, fineDt = fineSpan / fineSteps;
      const t0 = targetTime - coarseSpan - fineSpan;
      runPass(t0, coarseDt, true);
      for (let i = 1; i <= coarseSteps; i++) {
        runPass(t0 + i * coarseDt, coarseDt, false);
      }
      const tFine0 = targetTime - fineSpan;
      for (let i = 1; i <= fineSteps; i++) {
        const simT = tFine0 + i * fineDt;
        if (coStepFn) coStepFn(simT, fineDt, amplitude, foamBoost);
        runPass(simT, fineDt, false);
      }
    } finally {
      renderer.toneMapping = oldTone;
      renderer.autoClear = oldAutoClear;
      renderer.setRenderTarget(oldTarget);
    }
    return rtRead.texture;
  }

  function step(simTime, dt, amplitude = 0.6, foamBoost = 1.0) {
    if (dt <= 0) return rtRead.texture;
    const oldTarget = renderer.getRenderTarget();
    const oldTone = renderer.toneMapping;
    const oldAutoClear = renderer.autoClear;
    try {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = true;
      uniforms.amplitude.value = amplitude;
      uniforms.foamBoost.value = foamBoost;
      const clamped = Math.min(0.2, dt);
      const substeps = clamped > 0.055 ? 2 : 1;
      const subDt = clamped / substeps;
      for (let s = 0; s < substeps; s++) {
        runPass(simTime - (substeps - 1 - s) * subDt, subDt, false);
      }
    } finally {
      renderer.toneMapping = oldTone;
      renderer.autoClear = oldAutoClear;
      renderer.setRenderTarget(oldTarget);
    }
    return rtRead.texture;
  }

  return {
    get texture() {
      return rtRead.texture;
    },
    setImpactFoamMap(tex) {
      uniforms.impactFoamMap.value = tex || emptyImpactTex;
    },
    setCoastalContactMap(tex) {
      uniforms.coastalContactMap.value = tex || emptyContactTex;
    },
    warmup,
    step,
    getCompileSpecs: () => [{
      label: '淺水湧浪 PDE 流體解算 (SwashRigGPU)',
      scene: quadScene,
      camera: quadCam,
      materials: [simMaterial],
      targetMode: 'hdr'
    }],
    dispose() {
      rtRead.dispose();
      rtWrite.dispose();
      emptyImpactTex.dispose();
      emptyContactTex.dispose();
      quadMesh.geometry.dispose();
      simMaterial.dispose();
    }
  };
}

export const swashStateGLSL = `
#ifndef SWASH_STATE_GLSL
#define SWASH_STATE_GLSL
uniform sampler2D swashStateMap;
vec4 sampleSwashState(vec2 p){
  vec2 uv = (p - vec2(-180.0, -90.0)) / vec2(360.0, 150.0);
  float inside = smoothstep(-180.0, -166.0, p.x) * (1.0 - smoothstep(166.0, 180.0, p.x))
               * smoothstep(-90.0, -76.0, p.y) * (1.0 - smoothstep(52.0, 60.0, p.y));
  return texture2D(swashStateMap, clamp(uv, 0.0, 1.0)) * inside;
}
#endif
`;
