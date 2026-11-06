/* Dedicated Multiphase Turbulent Sea Foam & Volumetric Whitewater Shader (FoamShader.js).
 *
 * Mathematical, Fluid-Dynamical & Optical Foundations:
 *  1. Kraichnan / Kolmogorov 2D Curl-Streamfunction World Warping + Upwelling Vortex Boil Clearings:
 *     Breaks up large-scale surf wakes with rising underwater vortex boils that push surfactant filaments
 *     radially outward into ragged, braided streaks and irregular emerald water windows (ZERO math-grid look!).
 *  2. Lindeberg (1994) Analytical Jacobian Scale-Space LOD + 2048x2048 16x-Anisotropic Fibrous Foam Atlas:
 *     Preserves razor-sharp pinpoint bubble clusters up close and alias-free fibrous streaks to the horizon.
 *  3. Kokhanovsky (2004, J. Geophys. Res. 109) 3-Value Aerated Seawater-Bubble Emulsion Radiative Transfer:
 *     - Tier 1 (Sunlit Domes & Wet Meniscus Glints): Crisp sunlit snow-ivory + Heitz Smith-GGX wet bubble glints
 *     - Tier 2 (Subsurface Emulsion Core): Luminous glacial aquamarine-jade seawater scattering through bubble valleys
 *     - Tier 3 (Directional Self-Shadowed Folds): Cool slate-cerulean optical-depth shadows on leeward froth pillows
 */
export function createCoastalFoamLayer(
  THREE,
  coastGeometry,
  sharedUniforms,
  foamAtlasTexture,
  impactFoamTexture = null,
  splashFlipbookTexture = null
) {
  const fallbackImpact = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  fallbackImpact.needsUpdate = true;

  const fallbackContact = new THREE.DataTexture(new Uint8Array([0, 128, 128, 0]), 1, 1, THREE.RGBAFormat);
  fallbackContact.needsUpdate = true;

  const U = {
    ...terrainUniforms,
    bathymetryMap: sharedUniforms.bathymetryMap,
    swashStateMap: sharedUniforms.swashStateMap,
    coastalContactMap: sharedUniforms.coastalContactMap || { value: fallbackContact },
    impactFoamMap: { value: impactFoamTexture || fallbackImpact },
    foamAtlas: { value: foamAtlasTexture },
    splashFlipbook: { value: splashFlipbookTexture || fallbackImpact },
    detailMap: sharedUniforms.detailMap,
    foamMap: sharedUniforms.foamMap,
    foamMaterialMap: sharedUniforms.foamMaterialMap,
    sceneDepth: sharedUniforms.sceneDepth,
    inverseProjection: sharedUniforms.inverseProjection,
    cameraWorld: sharedUniforms.cameraWorld,
    depthResolution: sharedUniforms.depthResolution,
    captureResolution: sharedUniforms.captureResolution || { value: new THREE.Vector2(1, 1) },
    captureScale: sharedUniforms.captureScale,
    depthEnabled: sharedUniforms.depthEnabled,
    longWave: sharedUniforms.longWave,
    longPrevious: sharedUniforms.longPrevious,
    shortWave: sharedUniforms.shortWave,
    longMix: sharedUniforms.longMix,
    lengthLong: sharedUniforms.lengthLong,
    lengthShort: sharedUniforms.lengthShort,
    resolutionLong: sharedUniforms.resolutionLong,
    resolutionShort: sharedUniforms.resolutionShort,
    amplitude: sharedUniforms.amplitude,
    chop: sharedUniforms.chop,
    crestShape: sharedUniforms.crestShape,
    midScale: sharedUniforms.midScale,
    gridSpacing: sharedUniforms.gridSpacing,
    time: sharedUniforms.time,
    beachMode: sharedUniforms.beachMode,
    foamBoost: sharedUniforms.foamBoost,
    foamVisible: sharedUniforms.foamVisible,
    sunDirection: sharedUniforms.sunDirection,
    skyTop: sharedUniforms.skyTop,
    skyHorizon: sharedUniforms.skyHorizon,
    rockShadowMap: sharedUniforms.rockShadowMap,
    rockShadowMatrix: sharedUniforms.rockShadowMatrix,
    rockShadowEnabled: sharedUniforms.rockShadowEnabled,
    uWaveLinear: sharedUniforms.uWaveLinear,
    uOceanQuality: sharedUniforms.uOceanQuality || { value: 1.0 },
    uNightMix: sharedUniforms.uNightMix || { value: 0.0 }
  };

  const vertexShader = `
${terrainGLSL}
${coastalWavesGLSL}
uniform sampler2D longWave, longPrevious, shortWave, coastalContactMap;
uniform float lengthLong, lengthShort, resolutionLong, resolutionShort, amplitude, chop, gridSpacing, longMix, crestShape, time, beachMode, midScale, uWaveLinear;
varying vec3 vWorld, vNormal;
varying float vJacobian, vWaterSurfY;
varying vec2 vRest;

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

// Matches Offshore.js water surface over water, and conforms smoothly onto wet beach sand above waterline
vec4 displacedFoamSurface(vec2 p, bool isCenter){
  vec3 f = mix(field(longPrevious, p, lengthLong, resolutionLong), field(longWave, p, lengthLong, resolutionLong), longMix)
         + field(shortWave, p, lengthShort, resolutionShort);
  float bed0 = beachMode > 0.5 ? sampleBathymetry(p).r : -16.0;
  float d0 = max(0.0, -bed0);
  float chopAtten = beachMode > 0.5 ? smoothstep(0.04, 0.68, d0) : 1.0;
  float offshoreAtten = beachMode > 0.5 ? smoothstep(0.02, 0.88, d0) : 1.0;

  float h = amplitude * f.x;
  h += crestShape * (sqrt(h * h + 0.09) - 0.3);
  vec3 mid = mediumWave(p, time) * (amplitude * midScale);
  h = (h + mid.x) * offshoreAtten;

  vec2 delta = (f.yz * amplitude * chop + mid.yz) * chopAtten;
  vec2 worldP = p + delta;
  float hWater = h;

  if (beachMode > 0.5 && bed0 > -5.3) {
    vec4 hydro = evaluateCoastalHydro(worldP, time, amplitude);
    float pitchLean = 0.22 * hydro.y * smoothstep(0.08, 0.80, d0);
    worldP.y += pitchLean;
    float rockProxW = sampleBathymetry(worldP).b;
    float rockMeniscusLift = rockProxW * (0.026 + 0.036 * smoothstep(0.05, 0.85, abs(hydro.w) * 0.52 + hydro.y)) * smoothstep(0.01, 0.30, d0);
    h += hydro.x + rockMeniscusLift;
    hWater = h;
    if (isCenter) {
      // Taper vertical pillow cushion cleanly right against sculpted 3D rock faces so foamLayer meets CoastalRocks at exact meniscus waterline!
      vec2 cUvW = clamp((worldP - vec2(-180.0, -90.0)) / vec2(360.0, 150.0), 0.0, 1.0);
      float tightWallProx = textureLod(coastalContactMap, cUvW, 0.0).a;
      float wallCushionTaper = 1.0 - 0.84 * smoothstep(0.25, 0.92, tightWallProx);
      // Non-orthogonal golden-sector organic billow modulation (eliminates sin(x)*cos(z) egg-carton diamond grid!)
      float billowWave = 0.56
        + 0.22 * sin(dot(worldP, vec2(0.82, 0.57)) * 1.08 - time * 2.05)
        + 0.14 * cos(dot(worldP, vec2(-0.53, 0.85)) * 1.48 - time * 2.35)
        + 0.08 * sin(dot(worldP, vec2(0.28, -0.96)) * 1.92 + time * 1.75);
      float rollerCushion = hydro.y * (0.040 + 0.048 * billowWave) * smoothstep(0.06, 0.48, d0) * wallCushionTaper;
      float collarCushion = rockProxW * smoothstep(0.08, 0.85, abs(hydro.w) * 0.52 + hydro.y) * (0.026 + 0.024 * billowWave) * wallCushionTaper;
      h += rollerCushion + collarCushion;
    } else {
      h += hydro.y * 0.066 * smoothstep(0.06, 0.48, d0);
    }
  }

  float bedW = beachMode > 0.5 ? sampleBathymetry(worldP).r : -16.0;
  float waterDepth = hWater - bedW;
  float sandClearance = beachMode > 0.5 ? mix(0.008, 0.026, 1.0 - smoothstep(-0.01, 0.42, waterDepth)) : 0.004;
  float surfaceY = max(h, bedW) + sandClearance;
  return vec4(worldP.x, surfaceY, worldP.y, hWater);
}

void main(){
  vec2 p = position.xz;
  vRest = p;
  if (beachMode > 0.5) {
    float bedFast = sampleBathymetry(p).r;
    // Dry backshore sand (>0.65m): push 0.15m under opaque beach mesh so hardware Early-Z skips 100% of fragments & 2/3 of vertex fetches!
    if (bedFast > 0.65) {
      vec4 wpDry = modelMatrix * vec4(p.x, bedFast - 0.15, p.y, 1.0);
      vWorld = wpDry.xyz;
      vNormal = vec3(0.0, 1.0, 0.0);
      vJacobian = 1.0;
      vWaterSurfY = -0.5;
      gl_Position = projectionMatrix * viewMatrix * wpDry;
      return;
    }
  }
  float ex = gridSpacing;
  float ez = beachMode > 0.5
    ? gridSpacing * max(0.32, 1.0 - 0.21 * 3.14159265 * cos(3.14159265 * clamp(p.y / 175.0, -1.0, 1.0)))
    : ex;
  vec4 q4 = displacedFoamSurface(p, true);
  vec3 q = q4.xyz;
  vWaterSurfY = q4.w;
  vec3 dx = (displacedFoamSurface(p + vec2(ex, 0.0), false).xyz - q) / ex;
  vec3 dz = (displacedFoamSurface(p + vec2(0.0, ez), false).xyz - q) / ez;
  vec4 wp = modelMatrix * vec4(q, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normalize(cross(dz, dx)));
  vJacobian = dx.x * dz.z - dx.z * dz.x;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

  const fragmentShader = `
${terrainGLSL}
${coastalWavesGLSL}
${swashStateGLSL}
${pbrShadingGLSL}
uniform sampler2D foamAtlas, splashFlipbook, detailMap, foamMap, impactFoamMap, rockShadowMap, sceneDepth, coastalContactMap;
uniform mat4 rockShadowMatrix, inverseProjection, cameraWorld;
uniform vec2 depthResolution, captureResolution;
uniform vec3 sunDirection, skyTop, skyHorizon;
uniform float time, amplitude, beachMode, foamBoost, foamVisible, rockShadowEnabled, captureScale, depthEnabled, uOceanQuality;
varying vec3 vWorld, vNormal;
varying float vJacobian, vWaterSurfY;
varying vec2 vRest;

vec2 foamHash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Heitz & Neyret (2018) Variance-Preserving Stochastic Simplex-Triangle Aperiodic Texture Sampler:
// Randomly rotates & offsets every equilateral triangle cell while preserving exact 16x anisotropic textureGrad!
vec4 sampleStochasticFoamGrad(vec2 uv, vec2 gx, vec2 gy){
  vec2 sUv = uv * 0.72;
  const float K1 = 0.366025404;
  const float K2 = 0.211324865;
  vec2 i0 = floor(sUv + (sUv.x + sUv.y) * K1);
  vec2 a = sUv - i0 + (i0.x + i0.y) * K2;
  vec2 o = step(a.yx, a.xy);
  vec2 i1 = i0 + o;
  vec2 i2 = i0 + 1.0;
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;

  vec3 w = pow(max(vec3(0.56) - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0), vec3(3.0));
  w /= max(w.x + w.y + w.z, 1e-5);
  float invRms = clamp(inversesqrt(max(dot(w, w), 0.34)), 1.0, 1.36);

  vec2 h0 = foamHash22(i0);
  vec2 h1 = foamHash22(i1);
  vec2 h2 = foamHash22(i2);

  float ang0 = h0.x * 6.2831853, ang1 = h1.x * 6.2831853, ang2 = h2.x * 6.2831853;
  mat2 R0 = mat2(cos(ang0), -sin(ang0), sin(ang0), cos(ang0));
  mat2 R1 = mat2(cos(ang1), -sin(ang1), sin(ang1), cos(ang1));
  mat2 R2 = mat2(cos(ang2), -sin(ang2), sin(ang2), cos(ang2));

  vec4 s0 = textureGrad(foamAtlas, R0 * uv + h0, R0 * gx, R0 * gy);
  vec4 s1 = textureGrad(foamAtlas, R1 * uv + h1, R1 * gx, R1 * gy);
  vec4 s2 = textureGrad(foamAtlas, R2 * uv + h2, R2 * gx, R2 * gy);

  vec4 blended = s0 * w.x + s1 * w.y + s2 * w.z;
  const vec4 meanEst = vec4(0.42, 0.38, 0.44, 0.48);
  return clamp(meanEst + (blended - meanEst) * invRms, 0.0, 1.0);
}

vec4 sampleFoamAutoGrad(vec2 uvBase, vec2 gx, vec2 gy, float stochWeight){
  vec4 res = textureGrad(foamAtlas, uvBase, gx, gy);
  if (stochWeight > 0.002) {
    vec4 st = sampleStochasticFoamGrad(uvBase, gx, gy);
    res = mix(res, st, clamp(stochWeight, 0.0, 1.0));
  }
  return res;
}

vec4 sampleAdvectedGrad(vec2 rotP, vec2 disp, float freq, vec2 rotDx, vec2 rotDy, vec2 seedOfs, float stochWeight){
  vec2 gx = rotDx * freq;
  vec2 gy = rotDy * freq;
  vec2 uvBase = (rotP - disp) * freq + seedOfs;
  return sampleFoamAutoGrad(uvBase, gx, gy, stochWeight);
}

// Smooth 32-bit C^2 quintic flow noise (eliminates 8-bit detailMap bilinear staircase facets & contour loops!)
float foamQuinticNoise(vec2 x){
  vec2 i = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = foamHash22(i).x;
  float b = foamHash22(i + vec2(1.0, 0.0)).x;
  float c = foamHash22(i + vec2(0.0, 1.0)).x;
  float d = foamHash22(i + vec2(1.0, 1.0)).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Samples the shared 64-frame (8x8) Multiphase Splash & Spume Flipbook so sea rollers & 3D rock splashes are 100% the same species!
vec4 sampleFlipbookDual(vec2 cellUv, float phase01){
  vec2 clampedUv = clamp(cellUv, vec2(0.06), vec2(0.94));
  float fPos = clamp(phase01, 0.0, 0.999) * 63.0;
  float f0 = floor(fPos);
  float f1 = min(63.0, f0 + 1.0);
  float w  = fPos - f0;
  vec2 c0 = vec2(mod(f0, 8.0), floor(f0 / 8.0));
  vec2 c1 = vec2(mod(f1, 8.0), floor(f1 / 8.0));
  vec4 s0 = texture2D(splashFlipbook, (c0 + clampedUv) / 8.0);
  vec4 s1 = texture2D(splashFlipbook, (c1 + clampedUv) / 8.0);
  return mix(s0, s1, w);
}

// Subtractive fractal percolation erosion: outer boundaries ALWAYS break into lacy tendrils & droplets (ZERO straight contour lines!)
float erodePercolation(float density, float signal, float feather){
  float d = clamp(density, 0.0, 1.0);
  float thresh = mix(1.07, 0.095, pow(d, 0.79));
  return smoothstep(thresh - feather, thresh + feather, signal) * smoothstep(0.014, 0.21, d);
}

void main(){
  vec2 p = vWorld.xz;
  vec2 dxP = dFdx(p);
  vec2 dyP = dFdy(p);

  if (foamVisible < 0.01 || foamBoost < 0.01) discard;

  float dist = length(cameraPosition - vWorld);
  float distFade = (1.0 - smoothstep(64.0, 176.0, dist)) * (1.0 - smoothstep(155.0, 173.0, max(abs(p.x), abs(p.y))));
  if (distFade <= 0.004) discard;

  vec4 bathy = beachMode > 0.5 ? sampleBathymetry(p) : vec4(-16.0, 0.0, 0.0, 0.0);
  float bed = bathy.r;
  float rockProx = bathy.b;
  float rockWake = bathy.a;

  bool inSwashBox = beachMode > 0.5 && p.y > -88.0 && p.y < 58.0 && abs(p.x) < 179.0;
  bool inHydroBelt = inSwashBox && bed > -5.3;
  bool inActiveCoast = inSwashBox && (inHydroBelt || rockProx > 0.01 || p.y > -28.0);

  // Multi-scale turbulent surge-tongue domain warping (0.5m, 1.4m, 3.2m) eliminates ALL ruler-straight wave & swash foam edges!
  vec3 wN1 = inActiveCoast ? texture2D(detailMap, p * 0.048 + vec2(time * 0.008, -time * 0.012)).rgb : vec3(0.5);
  vec3 wN2 = inActiveCoast ? texture2D(detailMap, p * 0.155 - vec2(time * 0.015, time * 0.018)).rgb : vec3(0.5);
  vec3 wN3 = inActiveCoast ? texture2D(detailMap, p * 0.420 + vec2(time * 0.024, -time * 0.019)).rgb : vec3(0.5);
  vec2 hydroTongue = vec2(
    (wN1.r - 0.5) * 3.35 + (wN2.g - 0.5) * 1.55 + (wN3.b - 0.5) * 0.62,
    (wN1.g - 0.5) * 2.95 + (wN2.b - 0.5) * 1.42 + (wN3.r - 0.5) * 0.56
  );

  float waterDepth = beachMode > 0.5 ? (vWaterSurfY - bed) : 16.0;
  float onWater = beachMode > 0.5 ? smoothstep(-0.002, 0.022, waterDepth) : 1.0;
  float warpSurfFade = beachMode > 0.5 ? smoothstep(-0.005, 0.38, waterDepth) : 1.0;
  vec2 coastalWarp = hydroTongue * mix(0.055, 1.0, warpSurfFade);

  vec4 hydroRaw = inHydroBelt ? evaluateCoastalHydro(p, time, amplitude) : vec4(0.0);
  vec4 hydroWarp = inHydroBelt ? evaluateCoastalHydro(p + coastalWarp, time, amplitude) : vec4(0.0);
  vec4 hydro = vec4(
    hydroRaw.x,
    mix(hydroRaw.y, hydroWarp.y, 0.84),
    mix(hydroRaw.z, hydroWarp.z, 0.90),
    hydroRaw.w
  );

  vec4 swash = inActiveCoast ? sampleSwashState(p + hydroTongue * (0.16 * warpSurfFade)) : vec4(0.0);
  vec2 bUvBase = clamp((p - vec2(-180.0, -90.0)) / vec2(360.0, 150.0), 0.0, 1.0);
  vec2 impUv = clamp((p + hydroTongue * (0.20 * warpSurfFade) - vec2(-180.0, -90.0)) / vec2(360.0, 150.0), 0.0, 1.0);
  vec4 impactData = inActiveCoast ? texture2D(impactFoamMap, impUv) : vec4(0.0);
  vec2 impactFoam = impactData.rg;
  vec4 contactData = inActiveCoast ? texture2D(coastalContactMap, bUvBase) : vec4(0.0, 0.5, 0.5, 0.0);
  float tightRockProx = contactData.a;
  vec2 rawRockOutN = contactData.gb * 2.0 - 1.0;
  float rockOutLen = length(rawRockOutN);
  vec2 rockOutN = rockOutLen > 0.04 ? (rawRockOutN / rockOutLen) : vec2(0.0, -1.0);

  // Screen-Space 3D Rock Reconstruction & Sand-vs-Rock Discrimination:
  // Snaps NearestFilter sceneDepth to exact texel center (eliminating scanline sawtooth!) and gates strictly on sculpted 3D boulders!
  float isRockHit = 0.0;
  float continuousGap = 1.5;
  if (inSwashBox && depthEnabled > 0.5 && (contactData.r * 0.85 + tightRockProx) > 0.01) {
    vec2 screenUV = (gl_FragCoord.xy / depthResolution - 0.5) / captureScale + 0.5;
    vec2 safeCapRes = max(captureResolution, vec2(1.0));
    vec2 snappedDepthUV = (floor(clamp(screenUV, vec2(0.0), vec2(1.0) - 0.5 / safeCapRes) * safeCapRes) + 0.5) / safeCapRes;
    float rawSceneD = textureLod(sceneDepth, snappedDepthUV, 0.0).r;
    if (rawSceneD < 0.999999) {
      vec4 vHit = inverseProjection * vec4(snappedDepthUV * 2.0 - 1.0, rawSceneD * 2.0 - 1.0, 1.0);
      vec3 hitWorld = (cameraWorld * vec4(vHit.xyz / vHit.w, 1.0)).xyz;
      float rawRayGap = length(hitWorld - cameraPosition) - dist;
      float validRockContact = smoothstep(-0.18, -0.04, rawRayGap);
      float vertClearance = max(0.0, vWorld.y - hitWorld.y);
      float posRayGap = max(0.0, rawRayGap);
      continuousGap = min(vertClearance, posRayGap * 0.84);
      if (validRockContact > 0.005) {
        float hitSandBed = sampleBathymetry(hitWorld.xz).r;
        float rockProtrusion = hitWorld.y - hitSandBed;
        float nearSculptedRock = smoothstep(0.05, 0.34, contactData.r * 0.85 + tightRockProx);
        isRockHit = smoothstep(0.065, 0.165, rockProtrusion) * nearSculptedRock * validRockContact;
      }
    }
  }
  // Evaluate screen-space derivative in uniform control flow BEFORE any non-uniform early discard!
  float continuousGapGrad = fwidth(continuousGap);

  // True 3D Composite Sea-Surface Wave-Energy Extraction (Miche steepness + Lagrangian Jacobian orbital convergence):
  // Whitewater draws its energy directly from where the actual 3D wave surface steepens forward & compresses!
  float forwardSlope = max(0.0, -vNormal.z);
  float totalSlope   = length(vNormal.xz);
  float orbConverge  = max(0.0, 1.0 - vJacobian);
  float crestElev    = max(0.0, vWorld.y - (beachMode > 0.5 ? max(0.0, bed) : 0.0));
  float surfWaveEnergy = clamp(
    0.22 + 1.48 * forwardSlope + 0.62 * totalSlope + 1.12 * orbConverge + 0.74 * crestElev,
    0.16,
    1.95
  );
  float liveRockActivity = rockProx * smoothstep(0.06, 0.88, abs(hydroRaw.w) * 0.56 + hydroRaw.y * 0.95 + crestElev * 1.35);

  float offshoreHist = texture2D(foamMap, fract(vRest / 240.0)).r;
  float openWaveCap = smoothstep(0.28, 0.72, orbConverge + forwardSlope * 0.75) * smoothstep(0.85, 2.20, max(0.0, -bed));
  float shallowLipPot = beachMode > 0.5
    ? (smoothstep(-0.025, 0.006, waterDepth) * (1.0 - smoothstep(0.035, 0.14, waterDepth)) * (abs(hydroRaw.w) + swash.g))
    : 0.0;
  float potential = offshoreHist + openWaveCap + hydro.y * 1.55 + hydro.z + swash.b + swash.a + shallowLipPot
                  + impactFoam.r * 1.75 + impactFoam.g * 1.45 + liveRockActivity * 1.35;
  if (potential <= 0.005) discard;
  if (!inActiveCoast && beachMode > 0.5) {
    wN1 = texture2D(detailMap, p * 0.048 + vec2(time * 0.008, -time * 0.012)).rgb;
    wN2 = texture2D(detailMap, p * 0.155 - vec2(time * 0.015, time * 0.018)).rgb;
  }

  // --- Lindeberg (1994) Continuous Scale-Space Footprint Adaptation ---
  float jacArea = abs(dxP.x * dyP.y - dxP.y * dyP.x);
  float pxAreaLen = sqrt(max(jacArea, 1e-7));
  float pxMinLen = min(length(dxP), length(dyP));
  float pxScale = sqrt(pxAreaLen * max(pxMinLen, 0.28 * pxAreaLen));

  float lodLevel = clamp(log2(max(pxScale, 0.0020) / 0.022), -1.5, 4.0);
  float lodFloor = floor(lodLevel);
  float lodBlend = smoothstep(0.0, 1.0, lodLevel - lodFloor);
  float scale0 = exp2(-lodFloor);
  int baseParity = int(lodFloor) + 8;

  // --- Energy-Gated Non-Periodic C^2 Quintic Flow Meander (bounded vector blend -> ZERO time*mobility derivative jumps!) ---
  float kineticMobility = beachMode > 0.5
    ? clamp(mix(smoothstep(0.08, 0.58, abs(hydro.w) * 0.72 + swash.g * 0.85), 1.0, onWater), 0.0, 1.0)
    : 1.0;
  vec2 qStatA = p * 0.115;
  vec2 qStatB = (p * mat2(0.80, -0.60, 0.60, 0.80)) * 0.275;
  vec2 curlStatic = vec2(
    (foamQuinticNoise(qStatA) - 0.5) * 1.40 + (foamQuinticNoise(qStatB + vec2(3.7, 1.9)) - 0.5) * 0.56,
    (foamQuinticNoise(qStatA + vec2(7.3, 4.1)) - 0.5) * 1.40 + (foamQuinticNoise(qStatB + vec2(9.1, 6.4)) - 0.5) * 0.56
  );
  vec2 curlMoving = curlStatic;
  if (kineticMobility > 0.004) {
    vec2 qMovA = qStatA + vec2(0.036 * time, -0.048 * time);
    vec2 qMovB = qStatB - vec2(0.052 * time, 0.041 * time);
    curlMoving = vec2(
      (foamQuinticNoise(qMovA) - 0.5) * 1.40 + (foamQuinticNoise(qMovB + vec2(3.7, 1.9)) - 0.5) * 0.56,
      (foamQuinticNoise(qMovA + vec2(7.3, 4.1)) - 0.5) * 1.40 + (foamQuinticNoise(qMovB + vec2(9.1, 6.4)) - 0.5) * 0.56
    );
  }
  vec2 curlWarp = mix(curlStatic, curlMoving, kineticMobility);
  vec2 pWarped = p + curlWarp;

  // Live upwelling underwater eddies clear irregular water windows inside trailing surf wakes (constant-rate phase, gated by onWater!)
  vec3 turbA = texture2D(detailMap, p * 0.045 + vec2(time * 0.005, -time * 0.008)).rgb;
  vec3 turbB = texture2D(detailMap, p * 0.115 - vec2(time * 0.009, time * 0.007)).rgb;
  float boilField = turbA.b * 0.58 + turbB.g * 0.42;
  float upwellingHole = smoothstep(0.60, 0.87, boilField);
  float boilRimBoost  = 0.0;

  // Coupled 2D potential-flow tangential slip around sculpted 3D rock normals (co-evolved with SwashRigGPU!)
  float eps = 0.85;
  float dU = eps / 360.0;
  float rpR = beachMode > 0.5 ? textureLod(bathymetryMap, clamp(bUvBase + vec2(dU, 0.0), 0.0, 1.0), 0.0).b : 0.0;
  float rpL = beachMode > 0.5 ? textureLod(bathymetryMap, clamp(bUvBase - vec2(dU, 0.0), 0.0, 1.0), 0.0).b : 0.0;
  float rockDeflectX = clamp(-(rpR - rpL) / (2.0 * eps) * 1.95, -1.25, 1.25);
  float crossVel = hydro.w;
  vec2 worldVel = vec2(rockDeflectX, clamp(crossVel, -1.45, 1.75)) * kineticMobility;
  if (tightRockProx > 0.03) {
    float intoWall = max(0.0, -dot(worldVel, rockOutN));
    vec2 tangDir = vec2(-rockOutN.y, rockOutN.x);
    float tangSign = dot(worldVel, tangDir) >= 0.0 ? 1.0 : -1.0;
    worldVel += rockOutN * (intoWall * 0.90 * tightRockProx) + tangDir * (tangSign * intoWall * 0.62 * tightRockProx);
  }

  // C^infinity wrap-free Lagrangian orbital micro-drift (eliminates 4.545s fract() sawtooth snap forever!)
  float orbS1 = sin(time * 1.12 + dot(p, vec2(0.075, 0.055)));
  float orbS2 = sin(time * 1.83 - dot(p, vec2(0.052, -0.068)) + 1.7);
  vec2 advOsc = worldVel * (0.155 * orbS1 + 0.065 * orbS2);

  // Two non-harmonic rotation bases alternated by dyadic octave parity
  const mat2 REven = mat2(0.94, 0.34, -0.34, 0.94);
  const mat2 ROdd  = mat2(0.81, -0.59, 0.59, 0.81);
  vec2 pEven = REven * pWarped, dxEven = REven * dxP, dyEven = REven * dyP;
  vec2 dEven = REven * advOsc;
  vec2 pOdd  = ROdd * pWarped,  dxOdd  = ROdd * dxP,  dyOdd  = ROdd * dyP;
  vec2 dOdd  = ROdd * advOsc;

  bool p0Odd = ((baseParity) & 1) == 1;
  float stochWeight = uOceanQuality > 1.5
    ? (1.0 - smoothstep(68.0, 108.0, dist))
    : (uOceanQuality > 0.5 ? (1.0 - smoothstep(38.0, 68.0, dist)) : 0.0);
  vec2 ofsEven = vec2(0.13, 0.29), ofsOdd = vec2(0.57, 0.19);

  vec4 macroS = sampleFoamAutoGrad(pWarped * 0.068 - advOsc * 0.022, dxP * 0.068, dyP * 0.068, stochWeight);

  float f0 = 0.145 * scale0, f1 = 0.29 * scale0, f2 = 0.58 * scale0, f3 = 1.16 * scale0;
  vec4 dS0 = p0Odd
    ? sampleAdvectedGrad(pOdd,  dOdd,  f0, dxOdd,  dyOdd,  ofsOdd,  stochWeight)
    : sampleAdvectedGrad(pEven, dEven, f0, dxEven, dyEven, ofsEven, stochWeight);
  vec4 dS1 = p0Odd
    ? sampleAdvectedGrad(pEven, dEven, f1, dxEven, dyEven, ofsEven, stochWeight)
    : sampleAdvectedGrad(pOdd,  dOdd,  f1, dxOdd,  dyOdd,  ofsOdd,  stochWeight);
  vec4 dS2 = p0Odd
    ? sampleAdvectedGrad(pOdd,  dOdd,  f2, dxOdd,  dyOdd,  ofsOdd,  stochWeight)
    : sampleAdvectedGrad(pEven, dEven, f2, dxEven, dyEven, ofsEven, stochWeight);
  vec4 dS3 = p0Odd
    ? sampleAdvectedGrad(pEven, dEven, f3, dxEven, dyEven, ofsEven, stochWeight)
    : sampleAdvectedGrad(pOdd,  dOdd,  f3, dxOdd,  dyOdd,  ofsOdd,  stochWeight);

  vec4 laceS  = mix(dS1, dS0, lodBlend);
  vec4 cellS  = mix(dS2, dS1, lodBlend);
  vec4 microS = mix(dS3, dS2, lodBlend);

  // Pixel-footprint low-pass filter on pinpoint micro-beads prevents salt-and-pepper noise & temporal flicker!
  float microBeadAA = 1.0 - smoothstep(0.014, 0.082, pxScale);
  float streamers  = macroS.b * 0.56 + laceS.b * 0.44;
  float subStream  = cellS.b;
  float fibrousWeb = clamp(laceS.r * 0.66 + cellS.r * 0.34 + 0.22 * boilRimBoost, 0.0, 1.0);
  float fineFibers = clamp(cellS.r * 0.54 + microS.g * 0.46, 0.0, 1.0);
  float rawBeads   = clamp(microS.g * 0.62 + cellS.g * 0.38, 0.0, 1.0);
  float microBeads = mix(0.42, rawBeads, microBeadAA);

  // --- 1. Offshore & Mid-Depth Energy-Driven Whitecap Peaks ---
  float deepOffshoreGate = beachMode > 0.5 ? smoothstep(1.25, 2.85, max(0.0, -bed)) : 1.0;
  float compressed = clamp((1.0 - smoothstep(0.54, 0.84, vJacobian)) + openWaveCap * 0.65, 0.0, 1.2) * deepOffshoreGate;
  float offDensity = compressed * smoothstep(0.08, 0.36, offshoreHist + openWaveCap * 0.45);
  float offCore  = erodePercolation(offDensity * 0.92, streamers * 0.58 + fibrousWeb * 0.42, 0.16);
  float offTrail = deepOffshoreGate * erodePercolation((1.0 - exp(-offshoreHist * 2.6)) * 0.68, streamers * 0.52 + fibrousWeb * 0.48, 0.20)
                 * (1.0 - 0.62 * upwellingHole) * onWater;

  float thickFroth    = offCore * (0.76 + 0.24 * microBeads);
  float porousLace    = offTrail;
  float softSpumeMist = offCore * 0.32;
  float submergedVeil = offTrail * 0.42 * smoothstep(0.15, 0.65, waterDepth);
  vec2 flipNormalAcc  = vec2(0.0);

  if (beachMode > 0.5) {
    // --- 2. Energy-Extracted Plunging Surf Rollers + Smooth Sine-Windowed Flipbook Integration ---
    const vec2 spumeFreq = vec2(0.32, 0.095);
    vec2 spumeUv = (pWarped - advOsc * 1.05) * spumeFreq - vec2(0.0, time * 0.085);
    vec4 spumeS = sampleFoamAutoGrad(spumeUv, dxP * spumeFreq, dyP * spumeFreq, stochWeight);

    // Smooth bell-windowed staggered flipbook cells with C^1 distance & activity fade (ZERO wrap snap & ZERO distance cutoff seams!)
    float flipLiquidWeb = fineFibers;
    float flipSoftMist  = spumeS.b;
    vec2  flipNrm       = vec2(0.0);
    float flipMaxDist   = uOceanQuality > 1.5 ? 64.0 : (uOceanQuality > 0.5 ? 48.0 : 0.0);
    float flipDistFade  = flipMaxDist > 0.0 ? (1.0 - smoothstep(flipMaxDist * 0.60, flipMaxDist, dist)) : 0.0;
    float flipActFade   = smoothstep(0.025, 0.090, hydro.y + impactFoam.r + liveRockActivity);
    float flipGate      = flipDistFade * flipActFade;
    if (flipGate > 0.002) {
      vec2 fbCoordA = pWarped * vec2(0.21, 0.19) - vec2(0.0, time * 0.16);
      vec2 fbCoordB = (pWarped * mat2(0.84, -0.54, 0.54, 0.84)) * vec2(0.29, 0.25) + vec2(0.50, -time * 0.19);
      vec2 fbIdA = floor(fbCoordA), fbIdB = floor(fbCoordB);
      vec2 fbTileA = fract(fbCoordA), fbTileB = fract(fbCoordB);
      float fbPhaseA = fract(time * 0.34 + dot(fbIdA, vec2(0.37, 0.71)) + wN1.b * 0.42);
      float fbPhaseB = fract(time * 0.34 + 0.50 + dot(fbIdB, vec2(0.61, 0.29)) + wN2.r * 0.42);
      float winA = sin(3.14159265 * fbTileA.x) * sin(3.14159265 * fbTileA.y) * sin(3.14159265 * fbPhaseA);
      float winB = sin(3.14159265 * fbTileB.x) * sin(3.14159265 * fbTileB.y) * sin(3.14159265 * fbPhaseB);
      vec4 fbA = sampleFlipbookDual(mix(vec2(0.16), vec2(0.84), fbTileA), fbPhaseA);
      vec4 fbB = sampleFlipbookDual(mix(vec2(0.16), vec2(0.84), fbTileB), fbPhaseB);
      float wSumFb = max(winA + winB, 0.25);
      float fbBlend = min(1.0, (winA + winB) * kineticMobility) * flipGate;
      flipLiquidWeb = clamp(mix(fineFibers, (fbA.r * winA + fbB.r * winB) / wSumFb, fbBlend), 0.0, 1.0);
      flipSoftMist  = clamp(mix(spumeS.b, (fbA.g * winA + fbB.g * winB) / wSumFb, fbBlend), 0.0, 1.0);
      flipNrm       = ((fbA.ba - 0.5) * winA + (fbB.ba - 0.5) * winB) * (1.15 * kineticMobility * flipGate);
    }

    // Coupled 3D wave-steepening energy extraction: strong ONLY where actual 3D wave peaks & pitches forward!
    float billowLobe = streamers * 0.36 + spumeS.b * 0.32 + flipSoftMist * 0.32;
    float breakerEnergy = clamp(hydro.y * surfWaveEnergy * (0.52 + 0.72 * billowLobe), 0.0, 1.45);

    float rollerCore = erodePercolation(
      breakerEnergy * 0.92,
      billowLobe * 0.42 + fibrousWeb * 0.32 + flipLiquidWeb * 0.26,
      0.19
    );
    float rollerFringe = erodePercolation(
      breakerEnergy * 0.78 + swash.b * 0.28 * onWater,
      spumeS.b * 0.44 + fibrousWeb * 0.34 + flipLiquidWeb * 0.22,
      0.22
    ) * (1.0 - 0.48 * upwellingHole) * onWater;

    // --- 3. Continuous Wave-Rock Boiling Collar & Ballistic Splashdown Lace (Bridges 3D Splash to Sea 100%!) ---
    float rockCollarDrive = clamp(
      (impactFoam.r * 1.48 + liveRockActivity * 1.18) * smoothstep(-0.05, 0.14, waterDepth),
      0.0,
      1.35
    );
    float splashLanding = clamp(impactFoam.g * 1.25 * onWater, 0.0, 1.20);
    float impactBoil = erodePercolation(
      rockCollarDrive * 0.96,
      subStream * 0.34 + microBeads * 0.32 + flipLiquidWeb * 0.34,
      0.18
    );
    float rockCollarLace = erodePercolation(
      rockCollarDrive * 0.85 + splashLanding * 0.82,
      streamers * 0.38 + fibrousWeb * 0.38 + fineFibers * 0.24,
      0.22
    );

    float wakeActive = rockWake * (swash.b * 0.85 + 0.35 * liveRockActivity) * onWater;
    float wakeStreaks = erodePercolation(wakeActive * 0.88, spumeS.b * 0.52 + fineFibers * 0.48, 0.20);

    // --- 4. Leading-Edge Swash Bubble Meniscus Lip + Feathered Scalloped Surge Sheet ---
    const vec2 swashStretchFreq = vec2(0.25, 0.105);
    vec2 stretchUv = (pWarped - advOsc * 0.82) * swashStretchFreq + vec2(0.21, 0.47);
    vec4 stretchS = sampleFoamAutoGrad(stretchUv, dxP * swashStretchFreq, dyP * swashStretchFreq, stochWeight);
    float braidedSheet = clamp(stretchS.r * 0.56 + stretchS.b * 0.44, 0.0, 1.0);

    // Co-perturbed with Offshore.js grainEdge & surge-tongue noise so seafoam has organic scalloped fingers (ZERO straight contour lines!):
    float grainEdge = texture2D(detailMap, p * 0.48 + vec2(1.3, 2.7)).r * 0.58
                    + texture2D(detailMap, p * 2.15).r * 0.42;
    float organicWaterD = waterDepth + (wN1.r - 0.5) * 0.032 + (wN2.g - 0.5) * 0.018 + (grainEdge - 0.5) * 0.014;
    float meniscusSupport = smoothstep(-0.016, 0.024, organicWaterD);
    float lipDepth = waterDepth + (grainEdge - 0.5) * 0.016 + (fineFibers - 0.5) * 0.011 + (wN2.r - 0.5) * 0.012;
    float lipBand  = smoothstep(-0.012, 0.0035, lipDepth) * (1.0 - smoothstep(0.012, 0.044, lipDepth));
    float shoreSlopeZone = smoothstep(-0.85, -0.24, bed) * (1.0 - smoothstep(0.42, 0.62, bed));
    float swashKinetic = clamp(abs(hydroRaw.w) * 0.85 + hydro.z * 0.88 + swash.b * 0.65 + swash.g * 0.48, 0.0, 1.15);
    float uprushLipGate = mix(0.24, 1.0, smoothstep(-0.20, 0.22, hydroRaw.w));
    float lipScallop   = 0.46 + 0.54 * smoothstep(0.10, 0.82, streamers * 0.46 + braidedSheet * 0.54);
    float lipEnergy    = mix(0.46, 1.0, smoothstep(0.03, 0.40, swashKinetic)) * uprushLipGate * smoothstep(0.06, 0.24, amplitude);
    float lipDrive     = lipBand * lipEnergy * lipScallop * shoreSlopeZone * (1.0 - isRockHit);
    float swashLipBeads = erodePercolation(lipDrive * 0.96, microBeads * 0.54 + fineFibers * 0.46, 0.19) * 0.86;

    float sheetBand  = smoothstep(-0.018, 0.036, organicWaterD) * (1.0 - smoothstep(0.052, 0.145, lipDepth));
    float sheetDrive = sheetBand * clamp(0.26 + hydro.z * 0.72 + swash.b * 0.64 + abs(hydroRaw.w) * 0.42, 0.0, 1.0)
                     * mix(0.38, 1.0, uprushLipGate) * (0.36 + 0.64 * streamers) * shoreSlopeZone * (1.0 - isRockHit);
    float swashSheetLace = erodePercolation(sheetDrive * 0.88, braidedSheet * 0.50 + fibrousWeb * 0.50, 0.22) * 0.80;

    // Swash surge foam stays strictly on the liquid water sheet & meniscus lip (never stranded up on bare brown sand!)
    float swashDrive   = clamp(hydro.z * (0.34 + 0.88 * streamers) * (0.52 + 0.58 * surfWaveEnergy), 0.0, 1.05) * meniscusSupport;
    float boreTipFroth = max(
      erodePercolation(swashDrive * 0.62, braidedSheet * 0.52 + microBeads * 0.48, 0.18) * 0.52 * onWater,
      swashLipBeads * 0.42 * smoothstep(0.04, 0.38, abs(hydroRaw.w))
    );
    float boreLace = max(
      erodePercolation(swashDrive * 0.90, fibrousWeb * 0.54 + fineFibers * 0.46, 0.22) * 0.76 * meniscusSupport,
      max(swashLipBeads, swashSheetLace)
    );

    // --- 5. Advected Surfactant Wake Filaments & Upwelling Boil Windows (lingers naturally on receding water film!) ---
    float filmFoamSupport = smoothstep(0.14, 0.58, swash.g) * (0.62 + 0.38 * smoothstep(0.04, 0.34, swash.b + swash.a)) * (1.0 - isRockHit);
    float foamRetention = max(meniscusSupport, filmFoamSupport * 0.92);
    float boilTear = mix(0.22, 0.82, onWater) * upwellingHole * (1.0 - smoothstep(0.58, 0.96, swash.b));
    float advDensity = clamp(swash.b * (0.34 + 0.90 * streamers) * (0.60 + 0.54 * braidedSheet) * (1.0 - boilTear), 0.0, 1.0);
    float webSignal = mix(fibrousWeb * 0.52 + braidedSheet * 0.48, fineFibers * 0.48 + flipLiquidWeb * 0.52, clamp(breakerEnergy + rockCollarDrive, 0.0, 1.0));
    float surfWeb = erodePercolation(advDensity * 0.94, webSignal, 0.21) * foamRetention;
    float surfCurdle = erodePercolation(max(0.0, advDensity - 0.30) * 1.08, braidedSheet * 0.58 + microBeads * 0.42, 0.18) * 0.72 * max(onWater, filmFoamSupport * 0.58);

    // --- 6. Delicate Receding-Film Bubble Lace (lingers across active wet water film, zero dry-sand contour line!) ---
    float recedingFilmZone = smoothstep(0.16, 0.60, swash.g) * (1.0 - 0.50 * onWater);
    float strandDensity = clamp((swash.a * 0.95 + swash.b * 0.58) * (0.44 + 0.78 * streamers) * (0.52 + 0.54 * braidedSheet), 0.0, 1.0)
                        * recedingFilmZone * (1.0 - isRockHit);
    float strandWeb = erodePercolation(strandDensity * 0.92, microBeads * 0.52 + fineFibers * 0.48, 0.21) * 0.78;

    // --- 7. Soft Volumetric Sea-Spray Mist Cushion + Submerged Hinze Bubble-Plume Veil ---
    float mistDrive = clamp(breakerEnergy * 0.62 + rockCollarDrive * 0.88 + splashLanding * 0.55, 0.0, 1.0);
    softSpumeMist = max(softSpumeMist, mistDrive * smoothstep(0.14, 0.84, flipSoftMist * 0.68 + macroS.b * 0.32) * 0.68);
    flipNormalAcc = flipNrm * clamp(rollerCore + impactBoil + softSpumeMist, 0.0, 1.0);

    float underwaterPlume = clamp(
      breakerEnergy * 0.78 * (0.45 + 0.55 * billowLobe)
      + rockCollarDrive * 0.96
      + splashLanding * 0.78
      + swashDrive * 0.48
      + swash.b * 0.52 * (0.38 + 0.62 * streamers) * (1.0 - 0.48 * upwellingHole),
      0.0,
      1.0
    ) * smoothstep(0.018, 0.28, waterDepth) * onWater;
    submergedVeil = max(submergedVeil, underwaterPlume * (0.44 + 0.56 * (macroS.b * 0.6 + flipSoftMist * 0.4)) * 0.68);

    thickFroth = max(thickFroth, max(max(rollerCore * 0.96, impactBoil * 0.96), max(boreTipFroth, surfCurdle)));
    porousLace = max(porousLace, max(max(rollerFringe, boreLace), max(max(surfWeb, rockCollarLace), max(wakeStreaks, strandWeb))));
  }

  thickFroth    = clamp(thickFroth * foamBoost, 0.0, 0.92);
  porousLace    = clamp(porousLace * foamBoost, 0.0, 0.84);
  softSpumeMist = clamp(softSpumeMist * foamBoost, 0.0, 0.58);
  submergedVeil = clamp(submergedVeil * foamBoost, 0.0, 0.56);

  // --- Cross-Module Neural + Capillary Meniscus Percolation & Soft-Depth Rock Handoff ---
  // Combines Sobolev-PINN impact/drainage state (impactData.rgba + swash.rgba), fractal bubble pore breakup,
  // and exact 3D screen-space soft-depth feathering so dense seafoam dissolves into lacy micro-bubbles
  // and reaches 0.000 alpha BEFORE hardware Z-clip against 3D rocks (while flat beach swash stays 100% intact!).
  float rockSoftEnvelope = 1.0;
  float rockMeniscusTilt = 0.0;
  if (isRockHit > 0.004) {
    float neuralSurge = clamp(impactData.r * 0.82 + impactData.a * 0.68 + swash.b * 0.56 + hydro.y * 0.48, 0.0, 1.25);
    float breakSpan   = mix(0.32, 0.21, clamp(neuralSurge * 0.65, 0.0, 1.0));
    float poreNoise   = streamers * 0.48 + fibrousWeb * 0.30 + microBeads * 0.22;
    float warpedGap   = continuousGap + (poreNoise - 0.44) * 0.095 * smoothstep(0.0, 0.14, continuousGap);

    // 1. Thick opaque pillows break open FIRST into sheer lacy webs & micro-beads near the rock meniscus
    float thickKeep = smoothstep(0.055, breakSpan * 1.18, warpedGap);
    float laceKeep  = smoothstep(0.008, breakSpan * 0.84, warpedGap + (microBeads - 0.35) * 0.045);
    float mistKeep  = smoothstep(0.015, breakSpan * 0.75, continuousGap);
    float veilKeep  = smoothstep(0.035, 0.26, continuousGap);

    thickFroth    *= mix(1.0, thickKeep, isRockHit);
    porousLace    *= mix(1.0, laceKeep,  isRockHit);
    softSpumeMist *= mix(1.0, mistKeep,  isRockHit);
    submergedVeil *= mix(1.0, veilKeep,  isRockHit);

    // 2. Exact zero-clip screen-space soft-depth envelope with bounded uniform-flow AA floor (ZERO contour artifacts!)
    float aaFloor = clamp(1.55 * continuousGapGrad, 0.032, 0.12);
    float softEdgeWidth = max(aaFloor, mix(0.175, 0.105, clamp(neuralSurge * 0.60, 0.0, 1.0)));
    rockSoftEnvelope = mix(1.0, smoothstep(0.0, softEdgeWidth, continuousGap), isRockHit);
    rockMeniscusTilt = isRockHit * (1.0 - smoothstep(0.0, 0.24, continuousGap));
  }

  float curdleMod  = clamp(macroS.a * 0.36 + laceS.a * 0.38 + microBeads * 0.26, 0.0, 1.0);
  float alphaThick = thickFroth * mix(0.72, 0.90, smoothstep(0.10, 0.80, curdleMod));
  float alphaLace  = porousLace * mix(0.30, 0.81, clamp(fibrousWeb * 0.62 + microBeads * 0.38, 0.0, 1.0));
  float surfaceAlpha = 1.0 - (1.0 - alphaThick) * (1.0 - alphaLace);
  surfaceAlpha = 1.0 - (1.0 - surfaceAlpha) * (1.0 - softSpumeMist * 0.65);
  // Keep liquid emerald-turquoise seawater breathing underneath aerated foam (never chalky lime!)
  float foamAlpha  = clamp(1.0 - (1.0 - surfaceAlpha) * (1.0 - submergedVeil), 0.0, 0.88) * rockSoftEnvelope * distFade * foamVisible;

  if (foamAlpha <= 0.005) discard;

  // --- 3D Churning Foam-Pillow Normal Relief + Directional Solar Self-Shadowing (C^infinity fixed world frequencies, ZERO LOD jump!) ---
  vec3 L = normalize(sunDirection);
  vec3 V = normalize(cameraPosition - vWorld);

  const float fNormC = 0.165;
  const float fNormF = 0.375;
  float fineReliefW = 1.0 - smoothstep(0.026, 0.115, pxScale);
  float worldStep = clamp(pxScale * 2.2, 0.075, 0.38);

  vec2 uvNormC = (pEven - dEven) * fNormC + ofsEven;
  vec2 nGradCx = dxEven * fNormC, nGradCy = dyEven * fNormC;
  float hn0 = textureGrad(foamAtlas, uvNormC, nGradCx, nGradCy).a;
  float hnX = textureGrad(foamAtlas, uvNormC + vec2(worldStep * fNormC, 0.0), nGradCx, nGradCy).a - hn0;
  float hnZ = textureGrad(foamAtlas, uvNormC + vec2(0.0, worldStep * fNormC), nGradCx, nGradCy).a - hn0;
  vec2 reliefWorldGrad = transpose(REven) * vec2(hnX, hnZ);

  if (fineReliefW > 0.005) {
    vec2 uvNormF = (pOdd - dOdd) * fNormF + ofsOdd;
    vec2 nGradFx = dxOdd * fNormF, nGradFy = dyOdd * fNormF;
    float hf0 = textureGrad(foamAtlas, uvNormF, nGradFx, nGradFy).a;
    float hfX = textureGrad(foamAtlas, uvNormF + vec2(worldStep * fNormF, 0.0), nGradFx, nGradFy).a - hf0;
    float hfZ = textureGrad(foamAtlas, uvNormF + vec2(0.0, worldStep * fNormF), nGradFx, nGradFy).a - hf0;
    vec2 fineGrad = transpose(ROdd) * vec2(hfX, hfZ);
    reliefWorldGrad = mix(reliefWorldGrad, reliefWorldGrad * 0.56 + fineGrad * 0.62, fineReliefW);
  }

  // Directional heightfield self-occlusion (samples foam pillow toward light L.xz smoothly!)
  float selfShadowOcc = 0.0;
  if (uOceanQuality > 0.5) {
    vec2 sunHoriz = normalize(L.xz + vec2(1e-5));
    vec2 sunRotDir = REven * sunHoriz;
    float hnSun = textureGrad(foamAtlas, uvNormC + sunRotDir * (worldStep * 2.1 * fNormC), nGradCx, nGradCy).a;
    selfShadowOcc = clamp((hnSun - hn0) * (2.15 * thickFroth + 0.95 * porousLace), 0.0, 0.80);
  }

  float reliefFade = 1.0 - smoothstep(26.0, 96.0, dist);
  vec2 worldGrad = (reliefWorldGrad * 2.05 + flipNormalAcc * 0.72)
                 * (0.42 + 0.82 * thickFroth + 0.36 * porousLace + 0.28 * softSpumeMist) * reliefFade;

  vec3 N = normalize(vNormal + vec3(-worldGrad.x, 0.0, -worldGrad.y) * 1.42);
  if (rockMeniscusTilt > 0.01) {
    vec3 meniscusN = normalize(vec3(rockOutN.x * 0.34, 1.0, rockOutN.y * 0.34));
    N = normalize(mix(N, meniscusN, rockMeniscusTilt * 0.52));
  }

  float nl = max(dot(N, L), 0.0);
  float wrapSun = clamp(dot(N, L) * 0.50 + 0.50, 0.0, 1.0);

  // --- Kokhanovsky (2004, JGR 109) 3-Value Volumetric Whitewater Radiative Transfer ---
  // Real sea foam has wavelength-neutral bubble-interface scattering (omega_0 ~ 0.9995 across RGB),
  // so sky hemiE naturally tints shaded folds cool silver-blue WITHOUT squaring the blue channel into neon cyan!
  float pillowHeight = macroS.a * 0.44 + laceS.a * 0.38 + microBeads * 0.18;
  float surfWeight = clamp(surfaceAlpha / max(surfaceAlpha + submergedVeil * 0.90, 0.001), 0.0, 1.0);
  float thickness  = clamp(thickFroth * 0.88 + porousLace * 0.34 * (0.45 + 0.55 * pillowHeight), 0.0, 1.0);

  float foamSunShadow = pbrEvaluateSunShadow(
    rockShadowMap,
    rockShadowMatrix,
    rockShadowEnabled,
    vWorld,
    vec3(0.0, 0.06, 0.0),
    gl_FragCoord.xy
  );

  float directSunVis = foamSunShadow * (1.0 - 0.68 * selfShadowOcc);
  vec3 sunE  = pbrSunIrradiance(L);
  vec3 hemiE = pbrHemisphereIrradiance(N, skyTop, skyHorizon);

  // Value 3 (Cool Silver-Pearl Shadowed Folds) -> Value 2 (Seafoam-Ivory Subsurface Lace) -> Value 1 (Snow-White Sunlit Crest)
  vec3 shadowFoldAlbedo = vec3(0.80, 0.85, 0.90);
  vec3 seafoamLaceAlbedo = mix(vec3(0.84, 0.94, 0.95), vec3(0.95, 0.97, 0.98), smoothstep(0.10, 0.72, thickness));
  vec3 sunlitCrestAlbedo = vec3(0.995, 0.990, 0.980);

  // Isotropic multiple-scattering diffuse transmission through aerated whitewater rollers:
  // Keeps shoreward (+z) faces of backlit ocean breakers luminous cream-white on top billows with sculpted cool under-curl folds!
  float topSolarEntry = max(L.y, 0.22);
  float multiScatTrans = topSolarEntry * (0.46 + 0.42 * wrapSun) * (0.58 + 0.42 * thickness)
                       * mix(0.28, 1.0, foamSunShadow) * (1.0 - 0.56 * selfShadowOcc);

  vec3 ambientTerm = mix(shadowFoldAlbedo, seafoamLaceAlbedo, smoothstep(0.15, 0.82, pillowHeight))
                   * hemiE * mix(0.88, 1.18, pillowHeight) * (1.0 - 0.28 * selfShadowOcc);
  vec3 directTerm  = mix(seafoamLaceAlbedo, sunlitCrestAlbedo, smoothstep(0.20, 0.82, thickness * 0.58 + pillowHeight * 0.42))
                   * (sunE / PBR_PI) * (0.88 * nl * directSunVis + 0.64 * multiScatTrans);

  vec3 surfaceFoamCol = ambientTerm + directTerm;
  // Subtle warm quartz-sand reflection under damp beach strandline foam + sculpted boulder contact AO inside rock meniscus!
  surfaceFoamCol = mix(surfaceFoamCol * vec3(0.97, 0.95, 0.92), surfaceFoamCol, mix(0.72, 1.0, onWater));
  surfaceFoamCol *= 1.0 - 0.14 * contactData.r * rockMeniscusTilt;

  // Delicate backlit aquamarine-jade subsurface glow through thin breaking wave lips!
  float backTrans = pow(clamp(dot(-V, normalize(vec3(L.x, 0.18, L.z))), 0.0, 1.0), 2.0) * (1.0 - thickness * 0.58) * onWater;
  surfaceFoamCol += vec3(0.012, 0.18, 0.19) * sunE * foamSunShadow * 0.42 * backTrans;

  // Kaplanyan (2016) Normal-Variance Roughness AA on wet micro-bubble glints (silky sheen, ZERO salt-and-pepper shimmer!)
  vec3 dNdxF = dFdx(N), dNdyF = dFdy(N);
  float foamNormVar = min(0.16, 0.65 * (dot(dNdxF, dNdxF) + dot(dNdyF, dNdyF)));
  float baseBubbleRough = mix(0.28, 0.145, microBeads * microBeadAA);
  float bubbleRough = clamp(sqrt(baseBubbleRough * baseBubbleRough + foamNormVar + smoothstep(0.015, 0.10, pxScale) * 0.055), 0.145, 0.52);
  vec3 bubbleSpec = min(
    pbrSpecularGGX(N, V, L, bubbleRough, vec3(0.022)) * sunE * directSunVis * (0.44 + 0.82 * microBeads * microBeadAA) * reliefFade * surfWeight,
    vec3(1.10)
  );
  surfaceFoamCol += bubbleSpec;

  // Tier 2 Underwater Lamarre-Melville Bubble Plume: soft luminous seafoam-aquamarine
  vec3 veilColor = vec3(0.42, 0.76, 0.80) * (hemiE * 0.92 + (sunE / PBR_PI) * foamSunShadow * (0.45 * nl + 0.42 * wrapSun));
  vec3 foamColor = mix(veilColor, surfaceFoamCol, surfWeight);

  foamColor = pbrAerialPerspective(foamColor, vWorld, cameraPosition, L, skyTop, skyHorizon);

  if (!gl_FrontFacing) {
    foamColor = vec3(0.36, 0.68, 0.72) * (hemiE * 0.88 + (sunE / PBR_PI) * 0.36);
    foamAlpha *= 0.45;
  }

  gl_FragColor = vec4(foamColor, foamAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

  const material = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -0.85,
    polygonOffsetUnits: -1.2,
    side: THREE.FrontSide
  });

  const mesh = new THREE.Mesh(coastGeometry, material);
  mesh.name = 'Dedicated coastal sea foam layer';
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;

  return {
    mesh,
    material,
    uniforms: U,
    setImpactFoamMap(tex) {
      U.impactFoamMap.value = tex || fallbackImpact;
    },
    setGeometry(geo, spacing) {
      mesh.geometry = geo;
      U.gridSpacing.value = spacing;
    },
    dispose() {
      fallbackImpact.dispose();
      fallbackContact.dispose();
      material.dispose();
    }
  };
}
