/* GPU-Baked 2048x2048 (8x8 = 64 Frames) Multiphase Splash, Liquid-Web & Volumetric Sea-Mist Flipbook Atlas.
 *
 * Physical & VFX Foundations:
 *  - Simulates 64 continuous frames (u in [0, 1]) of a 3D wave-impact & breaking-crest plume so neither
 *    rock splashes nor surf rollers ever look like a static cutout texture ("一整塊貼圖"):
 *      * Frames 00..11 : Pressurized hydraulic root wedge surging UPWARD from the sea surface (v = 0 -> 0.85)
 *      * Frames 12..31 : Savart-Taylor-Culick liquid sheet expansion + nucleating & growing capillary holes
 *      * Frames 32..49 : Plateau-Rayleigh ligament breakup into branching water fingers + billowing mist cloud
 *      * Frames 50..63 : Polydisperse ballistic droplet dispersion + feathered turbulent sea-spray mist decay
 *
 *  - Hybrid 4-Channel Encoding per 256x256 Frame:
 *      R = Crisp Evolving Liquid Mass (surging sheet -> expanding perforated web -> ligaments -> water droplets)
 *      G = Soft Volumetric Aerated Spume & Sea-Spray Mist Cloud ("煙霧狀體積水霧貼圖" — lush, billowing, feathered!)
 *      B = Packed 3D Horizontal Plume Normal nx (0.5 + 0.5 * nx) for self-shadowed billowing relief
 *      A = Packed 3D Vertical Plume Normal ny / Optical Cushion Thickness for 3-value tonal shading (NEVER flat white!)
 */
export function createSplashFlipbook(THREE, renderer, { size = 2048, deferBake = false } = {}) {
  const GRID = 8; // 8x8 = 64 temporal evolution frames (256x256 texels per frame at 2048x2048)

  const rt = new THREE.WebGLRenderTarget(size, size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    generateMipmaps: true,
    depthBuffer: false,
    stencilBuffer: false
  });
  rt.texture.colorSpace = THREE.NoColorSpace ?? '';
  const maxAniso = renderer.capabilities?.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 8;
  rt.texture.anisotropy = Math.min(16, Math.max(4, maxAniso));

  const bakeMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    vertexShader: `varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
    fragmentShader: `precision highp float;
varying vec2 vUv;

float fbHash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 fbHash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float fbNoise(vec2 x){
  vec2 i = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(fbHash12(i), fbHash12(i + vec2(1.0, 0.0)), u.x),
    mix(fbHash12(i + vec2(0.0, 1.0)), fbHash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbFbm(vec2 p){
  float v = 0.0, a = 0.52;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    v += a * fbNoise(p);
    p = rot * p * 2.04 + vec2(1.7, 3.1);
    a *= 0.50;
  }
  return v;
}

// Billowing turbulent cloud/spume puffs (soft volumetric mist lobes!)
float fbBillow(vec2 p){
  float v = 0.0, a = 0.54;
  mat2 rot = mat2(0.82, 0.57, -0.57, 0.82);
  for (int i = 0; i < 4; i++) {
    float n = fbNoise(p) * 2.0 - 1.0;
    float lobe = 1.0 - sqrt(n * n + 0.035) * 0.96;
    v += a * lobe * lobe;
    p = rot * p * 2.08 + vec2(2.3, 1.4);
    a *= 0.50;
  }
  return clamp(v, 0.0, 1.0);
}

// Time-evolving Savart-Taylor-Culick capillary hole network (holes nucleate and GROW across frames t!)
vec2 expandingTaylorHoles(vec2 p, float t){
  float holeMask = 0.0;
  float rimAccum = 0.0;
  for (int oct = 0; oct < 2; oct++) {
    float freq = oct == 0 ? 4.6 : 8.8;
    vec2 x = p * freq + float(oct) * vec2(3.7, 1.9);
    vec2 n = floor(x);
    vec2 f = fract(x);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 rnd = fbHash22(n + g);
        float tBirth = -0.08 + 0.42 * rnd.x;
        float growth = clamp((t - tBirth) / (0.62 - 0.20 * rnd.y), 0.0, 1.28);
        if (growth <= 0.001) continue;
        vec2 center = g + 0.16 + 0.68 * rnd;
        vec2 diff = (center - f) * vec2(1.15, 0.82);
        float rMax = 0.26 + 0.35 * fbHash12(n + g + vec2(9.0, 4.0));
        float rad = rMax * pow(growth, 0.74);
        float d = length(diff);
        float hole = 1.0 - smoothstep(rad * 0.68, rad * 1.05, d);
        // Delicate Taylor-Culick liquid rim around each expanding hole (crisp & airy, never thick cartoon ropes!)
        float rim = exp(-pow((d - rad * 0.96) / max(0.032, rad * 0.18), 2.0)) * smoothstep(0.0, 0.24, growth);
        float wOct = oct == 0 ? 1.0 : 0.74;
        holeMask = max(holeMask, hole * wOct);
        rimAccum += rim * 0.38 * wOct;
      }
    }
  }
  return vec2(clamp(holeMask, 0.0, 1.0), clamp(rimAccum, 0.0, 1.35));
}

// Polydisperse ballistic droplets pinching off and dispersing outward across frames t!
float evolvingDropletSpray(vec2 uvLocal, float t){
  vec2 centered = vec2(uvLocal.x * 2.0 - 1.0, uvLocal.y);
  float acc = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float scale = layer == 0 ? 11.0 : 21.0;
    // Advect coordinates downward in Lagrangian frame == droplets flying UPWARD & fanning OUTWARD!
    float spread = 1.0 / (1.0 + t * (layer == 0 ? 0.58 : 0.74));
    vec2 p = vec2(centered.x * spread * 0.5 + 0.5, centered.y - t * (layer == 0 ? 0.62 : 0.82)) * scale;
    vec2 n = floor(p);
    vec2 f = fract(p);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 rnd = fbHash22(n + g + float(layer) * 17.0);
        float keep = step(0.32 + 0.22 * t, rnd.x);
        vec2 center = g + 0.14 + 0.72 * rnd;
        vec2 diff = (center - f) * vec2(1.0, 0.72); // Slight vertical velocity elongation
        float rDrop = mix(0.08, 0.30, pow(fbHash12(n + g + vec2(5.0, 13.0)), 2.4)) * (1.0 - 0.32 * t);
        float d = length(diff);
        float bead = 1.0 - smoothstep(rDrop * 0.45, rDrop * 1.05, d);
        acc = max(acc, bead * keep * (layer == 0 ? 1.0 : 0.78));
      }
    }
  }
  return clamp(acc, 0.0, 1.0);
}

// Evaluates vec2(liquidMassR, softMistG) at local frame UV [0,1]^2 and normalized frame time t in [0,1]
vec2 evaluatePlumeState(vec2 uv, float t){
  // Guard 3-texel border per cell so linear filtering NEVER bleeds across 8x8 atlas neighbors!
  float edgeGuard = smoothstep(0.015, 0.095, uv.x) * (1.0 - smoothstep(0.905, 0.985, uv.x))
                  * smoothstep(0.004, 0.045, uv.y) * (1.0 - smoothstep(0.915, 0.990, uv.y));
  if (edgeGuard <= 0.001) return vec2(0.0);

  float xSym = (uv.x - 0.5) * 2.0; // [-1, 1]
  float yUp  = uv.y;               // [0 = sea-surface root, 1 = crown apex]

  // 1) Upward Erupting Front Trajectory:
  // At t=0, plume surges from bottom root (y=0..0.38); rapidly shoots to y=0.96 by t=0.45, then arches/disperses!
  float riseFront = mix(0.34, 1.02, 1.0 - pow(1.0 - clamp(t * 1.65, 0.0, 1.0), 2.3));
  // Root detachment only late in life (frames 42..63) so early/mid frames stay 100% anchored to the sea surface!
  float rootBase = smoothstep(0.58, 0.98, t) * 0.28;

  // Fanning crown width: narrow pressurized root at y=0, flaring outward into a dramatic splash fan above!
  float fanWidth = mix(0.46, 0.88, pow(clamp(yUp, 0.0, 1.0), 0.65)) * (0.76 + 0.30 * sin(t * 2.1));
  float crownWarp = (fbFbm(vec2(xSym * 2.4, yUp * 2.8 - t * 1.6)) - 0.5) * 0.34;
  float crownTop = riseFront + crownWarp * (0.35 + 0.65 * yUp) - 0.22 * (xSym * xSym);

  float vertEnv = smoothstep(rootBase - 0.05, rootBase + 0.14, yUp)
                * (1.0 - smoothstep(crownTop - 0.22, crownTop + 0.05, yUp));
  float horizEnv = 1.0 - smoothstep(fanWidth * 0.58, fanWidth * 1.04, abs(xSym) + crownWarp * 0.28);
  float plumeHull = clamp(vertEnv * horizEnv, 0.0, 1.0) * edgeGuard;

  // Lagrangian advected coordinate moving UPWARD & fanning OUTWARD across the 64 frames!
  float fanScale = 1.0 / (1.0 + 0.52 * yUp * (0.35 + 0.65 * t));
  vec2 lagUv = vec2(0.5 + (uv.x - 0.5) * fanScale, yUp - t * 0.58);
  vec2 curlShift = vec2(
    fbNoise(lagUv * 4.5 + vec2(0.0, t * 1.4)) - 0.5,
    fbNoise(lagUv * 4.5 + vec2(3.7, -t * 1.2)) - 0.5
  ) * (0.08 + 0.14 * t);
  vec2 pFluid = lagUv + curlShift;

  // --- Channel R: Crisp Evolving Spray Jets -> Taylor-Culick Web -> Fine Ligaments -> Polydisperse Droplets ---
  float fingerAngle1 = xSym * mix(9.5, 6.2, yUp) + (fbNoise(pFluid * 5.6) - 0.5) * 3.8;
  float fingerAngle2 = xSym * mix(19.0, 12.5, yUp) - (fbNoise(pFluid * 9.4 + 2.1) - 0.5) * 4.2;
  float fingerRidges = (0.52 + 0.48 * cos(fingerAngle1)) * (0.62 + 0.38 * cos(fingerAngle2));
  // Fray crown & lateral edges into ragged liquid spray fingers even on frame 0 (ZERO solid plaster paddle!)
  float edgeFray = smoothstep(0.18, 0.68, plumeHull + (fingerRidges - 0.45) * 0.42);
  float sheetMass = (0.48 * fbBillow(pFluid * 4.2) + 0.52 * fingerRidges) * plumeHull * edgeFray * 1.48;

  vec2 holes = expandingTaylorHoles(pFluid, t);
  float intactSheet = max(0.0, sheetMass - holes.x * (0.56 + 0.58 * smoothstep(0.04, 0.58, yUp))) + holes.y * plumeHull * edgeFray * 0.36;
  float sheetCutoff = mix(0.36, 0.72, pow(t, 0.70));
  float crispLigaments = smoothstep(sheetCutoff, sheetCutoff + 0.14, intactSheet) * (1.0 - 0.42 * smoothstep(0.62, 0.98, t));

  // Flying droplets emerge right from early crown fingers & dominate mid-to-late frames!
  float dropGate = smoothstep(0.06, 0.58, yUp + 0.38 * t) * (0.52 + 0.68 * smoothstep(0.06, 0.68, t));
  float drops = evolvingDropletSpray(uv, t) * smoothstep(0.02, 0.44, plumeHull + 0.24 * horizEnv * vertEnv) * (0.48 + 0.68 * smoothstep(0.04, 0.55, t));
  float liquidR = clamp(max(crispLigaments, drops * (0.68 + 0.32 * dropGate)), 0.0, 1.0) * edgeGuard;

  // --- Channel G: Soft Volumetric Aerated Spume & Sea-Spray Mist Cloud ("煙霧狀體積水霧貼圖") ---
  // Lush, billowing, multi-octave cloud-like spume that binds the splash core & feathers softly into the air!
  vec2 pMist = vec2(0.5 + (uv.x - 0.5) * (0.82 * fanScale), yUp - t * 0.42) + curlShift * 1.55;
  float billowCore = fbBillow(pMist * 2.9 + vec2(1.1, 0.7));
  float fineMist   = fbFbm(pMist * 6.8 - vec2(0.5, t * 0.95));
  float softRadial = (1.0 - smoothstep(0.12, fanWidth * 1.12, abs(xSym)))
                   * smoothstep(rootBase - 0.06, rootBase + 0.20, yUp)
                   * (1.0 - smoothstep(crownTop - 0.30, crownTop + 0.10, yUp));
  float mistDecay  = 1.0 - 0.52 * pow(clamp((t - 0.45) / 0.55, 0.0, 1.0), 1.30);
  float rawMist    = (0.60 * billowCore + 0.40 * fineMist) * softRadial * mistDecay * 1.46;
  float softMistG  = clamp(smoothstep(0.09, 0.74, rawMist) * edgeGuard, 0.0, 1.0);

  return vec2(liquidR, softMistG);
}

void main(){
  float grid = 8.0;
  vec2 scaled = vUv * grid;
  vec2 cell = floor(scaled);
  vec2 localUv = fract(scaled);

  // Row 0 = top or bottom? Standard UV: row 0 at bottom -> frameIdx = row * 8 + col (0..63)
  float frameIdx = cell.y * grid + cell.x;
  float t = clamp(frameIdx / 63.0, 0.0, 1.0);

  vec2 centerState = evaluatePlumeState(localUv, t);
  float hCenter = centerState.x * 0.62 + centerState.y * 0.58;

  // Compute true 3D billowing + liquid normal map per frame for volumetric self-shadowed lighting!
  float eps = 0.014;
  vec2 stR = evaluatePlumeState(clamp(localUv + vec2(eps, 0.0), 0.002, 0.998), t);
  vec2 stL = evaluatePlumeState(clamp(localUv - vec2(eps, 0.0), 0.002, 0.998), t);
  vec2 stU = evaluatePlumeState(clamp(localUv + vec2(0.0, eps), 0.002, 0.998), t);
  vec2 stD = evaluatePlumeState(clamp(localUv - vec2(0.0, eps), 0.002, 0.998), t);

  float hR = stR.x * 0.62 + stR.y * 0.58;
  float hL = stL.x * 0.62 + stL.y * 0.58;
  float hU = stU.x * 0.62 + stU.y * 0.58;
  float hD = stD.x * 0.62 + stD.y * 0.58;

  // Combine macro dome curvature + detailed billow/ligament normal relief!
  float domeNx = (localUv.x - 0.5) * 1.15;
  float domeNy = (localUv.y - 0.38) * 0.95;
  float nx = clamp(-(hR - hL) * 3.2 + domeNx * 0.55, -1.0, 1.0);
  float ny = clamp(-(hU - hD) * 3.0 + domeNy * 0.55, -1.0, 1.0);

  gl_FragColor = vec4(
    centerState.x,
    centerState.y,
    0.5 + 0.5 * nx,
    0.5 + 0.5 * ny
  );
}`
  });

  const bakeScene = new THREE.Scene();
  const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat);
  bakeScene.add(bakeQuad);
  const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let baked = false;

  function bake() {
    if (baked) return;
    baked = true;
    const prevTarget = renderer.getRenderTarget();
    const prevTone = renderer.toneMapping;
    const prevAutoClear = renderer.autoClear;
    try {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = true;
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(bakeScene, bakeCam);
    } finally {
      renderer.toneMapping = prevTone;
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget);
    }
    bakeQuad.geometry.dispose();
    bakeMat.dispose();
  }

  if (!deferBake) bake();

  return {
    texture: rt.texture,
    gridSize: GRID,
    frameCount: GRID * GRID,
    bake,
    getCompileSpecs: () => (baked ? [] : [{
      label: '64 幀多相飛沫流體翻頁圖集 (SplashFlipbook)',
      scene: bakeScene,
      camera: bakeCam,
      materials: [bakeMat],
      targetMode: 'hdr'
    }]),
    dispose() {
      if (!baked) {
        bakeQuad.geometry.dispose();
        bakeMat.dispose();
        baked = true;
      }
      rt.dispose();
    }
  };
}
