/** Unified Offshore FFT + Bathymetry-Driven Coastal Shoaling, Breaking, Swash & Optical Ocean Shader.
 * Uses 12 fragment samplers and 5 vertex samplers (well within WebGL2's 16-sampler hardware limit).
 */
export function createOffshore(THREE, { size = 350, segments = 320 } = {}) {
  const U = {
    ...terrainUniforms,
    bathymetryMap: { value: null },
    swashStateMap: { value: null },
    foamRelief: { value: 1 },
    foamBoost: { value: 1.0 },
    foamTransportMix: { value: 1 },
    foamTransport: { value: 1 },
    foamMaterialMap: { value: null },
    foamFilamentMode: { value: 1 },
    foamWorldDetail: { value: 1 },
    foamScaleDebug: { value: 0 },
    geometricBoundary: { value: 1 },
    seamDebug: { value: 0 },
    boundaryClosure: { value: 1 },
    boundaryHeightMap: { value: null },
    boundaryMapCenter: { value: new THREE.Vector2() },
    boundaryMapRadius: { value: 96 },
    reflectionResolution: { value: new THREE.Vector2(1, 1) },
    boundaryRepair: { value: 1 },
    kdLighting: { value: 1 },
    kdActive: { value: 0 },
    kdAttenuation: { value: new THREE.Vector3(0.18, 0.062, 0.038) },
    kdSurfaceIrradiance: { value: 2.5 },
    kdBedReflectance: { value: new THREE.Vector3(0.44, 0.36, 0.24) },
    reflectionColor: { value: null },
    reflectionDepth: { value: null },
    reflectionProjection: { value: new THREE.Matrix4() },
    reflectionView: { value: new THREE.Matrix4() },
    reflectionInverseProjection: { value: new THREE.Matrix4() },
    reflectionCameraWorld: { value: new THREE.Matrix4() },
    reflectionEnabled: { value: 0 },
    reflectionDebug: { value: 0 },
    midScale: { value: 1 },
    foamLayers: { value: 1 },
    foamDebug: { value: 0 },
    naturalRevision: { value: 2 },
    refractionMicro: { value: 0 },
    captureResolution: { value: new THREE.Vector2(1, 1) },
    captureScale: { value: 1.05 },
    captureSamples: { value: 0 },
    sceneColor: { value: null },
    waterDepth: { value: null },
    opticalProjection: { value: new THREE.Matrix4() },
    inverseProjection: { value: new THREE.Matrix4() },
    cameraWorld: { value: new THREE.Matrix4() },
    opticsMode: { value: 1 },
    opticsDebug: { value: 0 },
    refractionScale: { value: 1 },
    // Pope & Fry (1997) + Morel & Prieur (1977) Case-1/Case-2 Calibrated Bio-Optical IOPs:
    // Natural warm-sand translucency in 0-1m swash -> luminous aquamarine-emerald shoal -> deep pelagic sapphire!
    absorption: { value: new THREE.Vector3(0.68, 0.148, 0.068) },
    scatterColor: { value: new THREE.Vector3(0.012, 0.192, 0.228) },
    longWave: { value: null },
    longPrevious: { value: null },
    longMix: { value: 0 },
    shortWave: { value: null },
    chopWave: { value: null },
    foamMap: { value: null },
    foamVisible: { value: 1 },
    sceneDepth: { value: null },
    depthResolution: { value: new THREE.Vector2(1, 1) },
    depthNear: { value: 0.1 },
    depthFar: { value: 5000 },
    depthEnabled: { value: 0 },
    depthFadeWidth: { value: 0.085 },
    contactStrength: { value: 1 },
    depthDebug: { value: 0 },
    crestFront: { value: 1 },
    outerMode: { value: 0 },
    beachMode: { value: 1 },
    crestShape: { value: 0.82 },
    detailMap: { value: null },
    skyEnvMap: { value: null },
    skyEnvReady: { value: 0 },
    rockShadowMap: { value: null },
    rockShadowMatrix: { value: new THREE.Matrix4() },
    rockShadowEnabled: { value: 0 },
    time: { value: 0 },
    lengthLong: { value: 240 },
    lengthShort: { value: 28 },
    lengthChop: { value: 11.3 },
    resolutionLong: { value: 128 },
    resolutionShort: { value: 64 },
    amplitude: { value: 0.64 },
    chop: { value: 2.24 },
    gridSpacing: { value: size / segments },
    sunDirection: { value: new THREE.Vector3(-0.44, 0.32, -0.839).normalize() },
    skyTop: { value: new THREE.Vector3(0.018, 0.125, 0.46) },
    skyHorizon: { value: new THREE.Vector3(0.24, 0.45, 0.68) },
    waterDeep: { value: new THREE.Vector3(0.0026, 0.036, 0.124) },
    waterDepthScale: { value: 1.0 },
    uWaveLinear: { value: 0.0 },
    uOceanQuality: { value: 1.0 },
    uNightMix: { value: 0.0 },
    uCelestialSpin: { value: 0.0 },
    windDirection: { value: new THREE.Vector2(0.33, 0.944) },
    roughness: { value: 0.102 }
  };

  const vertex = `
${terrainGLSL}
${coastalWavesGLSL}
uniform sampler2D longWave, longPrevious, shortWave;
uniform float lengthLong, lengthShort, resolutionLong, resolutionShort, amplitude, chop, gridSpacing, longMix, crestShape, time, beachMode, outerMode, midScale, uWaveLinear;
varying vec3 vWorld, vNormal;
varying float vJacobian;
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

vec3 displaced(vec2 p){
  // NVIDIA WaveWorks Nyquist-Matched Vertex Band-Limiting:
  // Inner mesh (outerMode < 0.5) resolves all 3 geometric bands at full strength.
  // Outer OceanRing (outerMode > 0.5, rBox = 175..6000m) smoothly hands off each band to per-pixel
  // spectral slopes BEFORE ring vertex spacing exceeds 0.5 * wavelength (ZERO triangle corduroy aliasing!).
  float rBox = max(abs(p.x), abs(p.y));
  float wShortV = outerMode > 0.5 ? (1.0 - smoothstep(175.5, 185.0, rBox)) : 1.0;
  float wMidV   = outerMode > 0.5 ? (1.0 - smoothstep(178.0, 196.0, rBox)) : 1.0;
  float wLongV  = outerMode > 0.5 ? (1.0 - smoothstep(235.0, 580.0, rBox)) : 1.0;

  vec3 fLong = mix(field(longPrevious, p, lengthLong, resolutionLong), field(longWave, p, lengthLong, resolutionLong), longMix) * wLongV;
  vec3 fShort = wShortV > 0.002 ? field(shortWave, p, lengthShort, resolutionShort) * wShortV : vec3(0.0);
  vec3 f = fLong + fShort;

  float bed0 = sampleBathymetry(p).r;
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
  return vec3(worldP.x, h, worldP.y);
}

 void main(){
  vec2 p = position.xz;
  vRest = p;
  if (beachMode > 0.5 && outerMode < 0.5) {
    float bedFast = sampleBathymetry(p).r;
    // Dry backshore sand (>0.68m): skip 9 FFT fetches + 3 mediumWave + 3 hydro calls & let hardware Early-Z cull!
    if (bedFast > 0.68) {
      vec4 wpDry = modelMatrix * vec4(p.x, bedFast - 0.16, p.y, 1.0);
      vWorld = wpDry.xyz;
      vNormal = vec3(0.0, 1.0, 0.0);
      vJacobian = 1.0;
      gl_Position = projectionMatrix * viewMatrix * wpDry;
      return;
    }
  }
  float rBox = max(abs(p.x), abs(p.y));
  float ex = outerMode > 0.5 ? max(gridSpacing, (rBox - 175.0) * 0.085) : gridSpacing;
  float ez = (beachMode > 0.5 && outerMode < 0.5)
    ? gridSpacing * max(0.32, 1.0 - 0.21 * 3.14159265 * cos(3.14159265 * clamp(p.y / 175.0, -1.0, 1.0)))
    : ex;
  vec3 q = displaced(p);
  vec3 dx = (displaced(p + vec2(ex, 0.0)) - displaced(p - vec2(ex, 0.0))) / (2.0 * ex);
  vec3 dz = (displaced(p + vec2(0.0, ez)) - displaced(p - vec2(0.0, ez))) / (2.0 * ez);
  vec4 wp = modelMatrix * vec4(q, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normalize(cross(dz, dx)));
  vJacobian = dx.x * dz.z - dx.z * dz.x;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

  const fragment = `
${terrainGLSL}
${coastalWavesGLSL}
${swashStateGLSL}
${pbrShadingGLSL}
uniform sampler2D detailMap, longWave, longPrevious, shortWave, chopWave;
uniform float lengthLong, lengthShort, lengthChop, waterDepthScale, longMix, uOceanQuality;
uniform vec2 windDirection;
uniform float foamScaleDebug, foamRelief, foamBoost;
uniform float geometricBoundary, seamDebug, boundaryClosure, boundaryRepair;
uniform vec2 reflectionResolution;
uniform sampler2D reflectionColor, reflectionDepth;
uniform mat4 reflectionProjection, reflectionView, reflectionInverseProjection, reflectionCameraWorld;
uniform float reflectionEnabled, reflectionDebug;
uniform sampler2D sceneColor, waterDepth;
uniform mat4 inverseProjection, cameraWorld, opticalProjection;
uniform vec3 absorption, scatterColor;
uniform float opticsMode, opticsDebug, refractionScale, refractionMicro, naturalRevision;
uniform sampler2D sceneDepth, skyEnvMap, rockShadowMap;
uniform mat4 rockShadowMatrix;
uniform vec3 sunDirection, skyTop, skyHorizon, waterDeep;
uniform vec2 depthResolution, captureResolution;
uniform float captureScale, skyEnvReady, rockShadowEnabled;
uniform float time, roughness, foamVisible, foamLayers, foamDebug, beachMode, outerMode, crestFront, amplitude, depthNear, depthFar, depthEnabled, depthDebug, contactStrength, depthFadeWidth;
varying vec3 vWorld, vNormal;
varying float vJacobian;
varying vec2 vRest;
const float PI = 3.14159265;
${underwaterLightingGLSL}

void opticalMicroV4(vec2 p, float t, float amp, out vec2 slope, out vec3 curvature){
  slope = vec2(0.0); curvature = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 dir; float wavelength, height;
    if (i == 0) { dir = normalize(vec2(0.97, 0.24)); wavelength = 0.65; height = 0.009; }
    else if (i == 1) { dir = normalize(vec2(-0.38, 0.92)); wavelength = 0.91; height = 0.012; }
    else if (i == 2) { dir = normalize(vec2(0.58, 0.81)); wavelength = 1.27; height = 0.010; }
    else { dir = normalize(vec2(-0.86, -0.51)); wavelength = 0.47; height = 0.003; }
    float k = 6.2831853 / wavelength, phase = k * dot(p, dir) - sqrt(9.81 * k) * t + float(i) * 1.73;
    float a = height * clamp(amp / 0.6, 0.0, 2.5);
    slope += a * k * cos(phase) * dir;
    curvature -= a * k * k * sin(phase) * vec3(dir.x * dir.x, dir.y * dir.y, dir.x * dir.y);
  }
}

float opticalHash(float n){ return fract(sin(n * 127.1 + 17.7) * 43758.5453); }

void opticalMicro(vec2 p, float t, float amp, float pxFoot, out vec2 slope, out vec3 curvature){
  if (naturalRevision < 0.5) { opticalMicroV4(p, t, amp, slope, curvature); return; }
  slope = vec2(0.0); curvature = vec3(0.0);
  float ampScale = clamp(amp / 0.6, 0.0, 2.2);
  int maxI = uOceanQuality > 1.5 ? 9 : 6;
  for (int i = 0; i < 9; i++) {
    if (i >= maxI) break;
    float fi = float(i);
    float wavelength = 0.56 + 1.24 * (fi / 8.0) + 0.12 * (opticalHash(fi + 8.0) - 0.5);
    // Per-wavelength Nyquist low-pass filter eliminates high-frequency moire & shimmer before 2.5x pixel footprint!
    float wAA = 1.0 - smoothstep(wavelength * 0.15, wavelength * 0.38, pxFoot);
    if (wAA <= 0.002) continue;
    float angle = fi * 2.3999632 + 0.38 * (opticalHash(fi + 3.0) - 0.5);
    vec2 dir = vec2(cos(angle), sin(angle));
    vec2 q = vec2(-dir.y, dir.x) * (0.48 + 0.32 * opticalHash(fi + 14.0));
    vec2 r = vec2(cos(angle + 1.15), sin(angle + 1.15)) * 0.34;
    float k = 6.2831853 / wavelength;
    float A = 0.0026 * pow(wavelength, 1.22) * (0.86 + 0.28 * opticalHash(fi + 23.0)) * ampScale * wAA;
    float seed = 6.2831853 * opticalHash(fi + 31.0);
    float psi = dot(q, p) - t * 0.19 + seed, chi = dot(r, p) + t * 0.12 + seed * 1.7;
    float phase = k * dot(dir, p) - sqrt(9.81 * k) * t + seed + 1.35 * sin(psi);
    float a = A * (0.64 + 0.36 * sin(chi));
    vec2 ga = A * 0.36 * cos(chi) * r, gp = k * dir + 1.35 * cos(psi) * q;
    vec3 ha = -A * 0.36 * sin(chi) * vec3(r.x * r.x, r.y * r.y, r.x * r.y);
    vec3 hp = -1.35 * sin(psi) * vec3(q.x * q.x, q.y * q.y, q.x * q.y);
    slope += ga * sin(phase) + a * cos(phase) * gp;
    curvature += ha * sin(phase) + cos(phase) * (vec3(2.0 * ga.x * gp.x, 2.0 * ga.y * gp.y, ga.x * gp.y + ga.y * gp.x) + a * hp) - a * sin(phase) * vec3(gp.x * gp.x, gp.y * gp.y, gp.x * gp.y);
  }
}

float diskSpec(vec3 N, vec3 V, vec3 L, float perceptual){
  vec3 H = normalize(V + L);
  float Nv = max(dot(N, V), 0.001), Nl = max(dot(N, L), 0.0), Nh = max(dot(N, H), 0.001), Vh = max(dot(V, H), 0.001);
  float a = perceptual * perceptual, a2 = a * a, den = Nh * Nh * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * den * den), k = (perceptual + 1.0) * (perceptual + 1.0) / 8.0;
  float G = (Nv / (Nv * (1.0 - k) + k)) * (Nl / (Nl * (1.0 - k) + k));
  float F = 0.0204 + 0.9796 * pow(1.0 - Vh, 5.0);
  float wideR = clamp(perceptual * 1.8, 0.1, 0.55), wa = wideR * wideR, wa2 = wa * wa, wden = Nh * Nh * (wa2 - 1.0) + 1.0;
  float wideD = wa2 / (PI * wden * wden);
  return (0.60 * D + 0.40 * wideD) * G * F / (4.0 * Nv);
}

vec3 sky(vec3 d){
  return pbrSampleSkyEnv(skyEnvMap, skyEnvReady, d, sunDirection, skyTop, skyHorizon);
}

vec3 safeSceneColor(vec2 uv){
  vec2 pixel = uv * captureResolution - 0.5, base = floor(pixel), f = fract(pixel);
  vec3 sum = vec3(0.0); float total = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 q = (base + vec2(float(i), float(j)) + 0.5) / captureResolution;
      float sd = textureLod(sceneDepth, q, 0.0).r, wd = textureLod(waterDepth, q, 0.0).r;
      float weight = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
      if (sd < 0.999999 && wd < 0.999999 && sd > wd + 0.0000002) {
        sum += textureLod(sceneColor, q, 0.0).rgb * weight;
        total += weight;
      }
    }
  }
  return total > 0.00001 ? sum / total : textureLod(sceneColor, uv, 0.0).rgb;
}

vec3 reconstruct(vec2 uv, float raw){
  vec4 v = inverseProjection * vec4(uv * 2.0 - 1.0, raw * 2.0 - 1.0, 1.0);
  return (cameraWorld * vec4(v.xyz / v.w, 1.0)).xyz;
}

bool validHit(vec2 uv){
  vec2 guard = vec2(1.5) / captureResolution;
  if (any(lessThan(uv, guard)) || any(greaterThan(uv, 1.0 - guard))) return false;
  float sd = textureLod(sceneDepth, uv, 0.0).r, wd = textureLod(waterDepth, uv, 0.0).r;
  return sd < 0.999999 && wd < 0.999999 && sd > wd + 0.0000002;
}
${underwaterBoundaryGLSL}

void main(){
  vec2 p = vWorld.xz;
  vec4 bathy = sampleBathymetry(p);
  float bed = bathy.r;
  float rockProx = bathy.b;
  float rockWake = bathy.a;
  float depth = vWorld.y - bed;
  if (beachMode > 0.5 && depth <= 0.0005) discard;

  // Per-pixel coastal hydrodynamics & GPU swash state (skipped cleanly outside coastal bay [-182..182, -90..62]!)
  bool nearCoast = beachMode > 0.5 && abs(p.x) < 182.0 && p.y > -90.0 && p.y < 62.0;
  vec4 hydro = nearCoast ? evaluateCoastalHydro(p, time, amplitude) : vec4(0.0);
  vec4 swash = nearCoast ? sampleSwashState(p) : vec4(0.0);

  float dist = length(cameraPosition - vWorld);
  vec2 dPdx = dFdx(p);
  vec2 dPdy = dFdy(p);
  float pxFootprint = max(length(dPdx), length(dPdy));

  // Reconstruct exact 3D opaque substrate/boulder hit from sceneDepth (ZERO extra samplers!):
  // Discriminates 3D sculpted rocks (isRockHit) from smooth beach sand while guarding detached foreground silhouettes.
  vec2 screenUV = (gl_FragCoord.xy / depthResolution - 0.5) / captureScale + 0.5;
  float rawCenter = depthEnabled > 0.5 ? textureLod(sceneDepth, screenUV, 0.0).r : 1.0;
  vec3 exactBedHit = vec3(p.x, bed, p.y);
  float validContact = 0.0;
  float isRockHit = 0.0;
  float trueSubmergence = depth;
  if (depthEnabled > 0.5 && rawCenter < 0.999999) {
    exactBedHit = reconstruct(screenUV, rawCenter);
    float rawRayGap = length(exactBedHit - cameraPosition) - dist;
    validContact = smoothstep(-0.18, -0.04, rawRayGap);
    if (validContact > 0.005) {
      float hitSandBed = beachMode > 0.5 ? sampleBathymetry(exactBedHit.xz).r : -16.0;
      isRockHit = smoothstep(0.005, 0.024, exactBedHit.y - hitSandBed) * smoothstep(0.01, 0.18, rockProx) * validContact;
      float hitSub = max(0.0, vWorld.y - exactBedHit.y);
      trueSubmergence = mix(depth, min(depth, hitSub), validContact);
    }
  }

  float shallowCalm = beachMode > 0.5 ? smoothstep(0.015, 0.28, trueSubmergence) : 1.0;
  // Match seabedMaterial's 3D sand ripples so ultra-thin draining water (< 7cm) gently conforms to sand ridges
  float sandRippleWave = 0.0;
  vec3 rippledMeniscusN = vec3(0.0, 1.0, -0.066);
  if (nearCoast && dist < 56.0 && depth < 0.22 && isRockHit < 0.5) {
    float domRip = texture2D(detailMap, p * 0.16 + vec2(0.7, 1.2)).r;
    float acrossSwash = dot(p, vec2(0.94, 0.34)) + 0.38 * sin(dot(p, vec2(-0.34, 0.94)) * 0.65)
                      + 0.19 * sin(dot(p, vec2(0.61, -0.79)) * 1.07) + 1.1 * (domRip - 0.5)
                      + 0.32 * sin(p.x * 0.41 + p.y * 0.16) + 0.24 * sin(p.y * 0.33 - p.x * 0.27);
    float phiSwash = 6.2831853 * acrossSwash / 0.46;
    sandRippleWave = sin(phiSwash);
    float dPhiSwash = cos(phiSwash) * (1.0 - smoothstep(1.0, 3.14, fwidth(phiSwash))) * (6.2831853 / 0.46);
    vec2 sandRippleSlope = vec2(0.94, 0.34) * dPhiSwash * 0.0042 * (1.0 - smoothstep(12.0, 52.0, dist));
    rippledMeniscusN = normalize(vec3(-sandRippleSlope.x, 1.0, -0.066 - sandRippleSlope.y));
  }

  float meniscusCalm = beachMode > 0.5 ? smoothstep(0.002, mix(0.095, 0.24, isRockHit), trueSubmergence) : 1.0;
  vec3 baseWaterN = (nearCoast && depth < 0.12 && isRockHit < 0.5)
    ? normalize(mix(rippledMeniscusN, normalize(vNormal), smoothstep(0.004, 0.082, depth)))
    : normalize(vNormal);

  // --- NVIDIA WaveWorks / Bruneton, Neyret & Holzschuch (2010, EGSR) 5-Band Bimodal Spectral Ocean Cascade ---
  // Uses dedicated unfiltered Ewans (1998) bimodal wind-chop analytical FFT slopes (chopWave, RMS=0.24)
  // across Phillips k^-4 scale-invariant octaves (37m, 11.3m, 3.4m, 0.96m) + 240m swell handoff,
  // eliminating BOTH distant smooth wax AND narrow-band parallel corduroy stripes!
  float rBox = max(abs(p.x), abs(p.y));
  float wLongVert  = outerMode > 0.5 ? (1.0 - smoothstep(235.0, 580.0, rBox)) : 1.0;
  float wShortVert = outerMode > 0.5 ? (1.0 - smoothstep(175.5, 185.0, rBox)) : 1.0;

  // Marangoni Surfactant Capillary Damping: turbulent whitewater wakes naturally smooth high-frequency capillary ripples!
  float surfactantCalm = nearCoast
    ? (1.0 - 0.54 * clamp(hydro.y * 0.85 + swash.b * 0.95 + hydro.z * 0.55, 0.0, 0.88))
    : 1.0;
  float rippleAtten = (0.10 + 0.90 * meniscusCalm) * (0.38 + 0.62 * shallowCalm);
  float ampChopScale = clamp(amplitude / 0.68, 0.30, 2.05) * rippleAtten;

  float nyq0 = 1.0 - smoothstep(18.0, 72.0, pxFootprint); // Band 0: 240m swell slopes (beyond vertex handoff)
  float nyq1 = 1.0 - smoothstep(2.20, 8.80, pxFootprint); // Band 1: 37m wind-sea chop (active out to ~600m)
  float nyq2 = 1.0 - smoothstep(0.70, 2.80, pxFootprint); // Band 2: 11.3m broad chop (active out to ~220m)
  float nyq3 = (1.0 - smoothstep(0.20, 0.82, pxFootprint)) * mix(0.55, 1.0, surfactantCalm); // Band 3: 3.4m facets
  float nyq4 = (1.0 - smoothstep(0.055, 0.24, pxFootprint)) * surfactantCalm;               // Band 4: 0.96m capillary

  vec2 gradient = vec2(0.0);
  float spectralWhitecap = 0.0;

  // Band 0: Per-pixel 240m swell height-gradient takes over smoothly where OceanRing vertices damp out (235..580m),
  // explicitly blending longPrevious -> longWave via longMix so distant horizon swells have ZERO 30Hz step!
  float w0Px = (1.0 - wLongVert) * nyq0;
  if (w0Px > 0.004) {
    float duL = 1.0 / 128.0;
    vec2 uvL = p / lengthLong;
    float hRx = mix(textureLod(longPrevious, uvL + vec2(duL, 0.0), 0.0).r, textureLod(longWave, uvL + vec2(duL, 0.0), 0.0).r, longMix);
    float hLx0 = mix(textureLod(longPrevious, uvL - vec2(duL, 0.0), 0.0).r, textureLod(longWave, uvL - vec2(duL, 0.0), 0.0).r, longMix);
    float hUz = mix(textureLod(longPrevious, uvL + vec2(0.0, duL), 0.0).r, textureLod(longWave, uvL + vec2(0.0, duL), 0.0).r, longMix);
    float hDz = mix(textureLod(longPrevious, uvL - vec2(0.0, duL), 0.0).r, textureLod(longWave, uvL - vec2(0.0, duL), 0.0).r, longMix);
    float scL = amplitude * (128.0 / (2.0 * lengthLong)) * w0Px;
    gradient += vec2(hRx - hLx0, hUz - hDz) * scL;
    float wc0 = mix(textureLod(longPrevious, uvL, 0.0).a, textureLod(longWave, uvL, 0.0).a, longMix);
    spectralWhitecap += wc0 * w0Px * 0.55;
  }

  // Band 1: 37m intermediate broad wind-sea
  float w1Base = outerMode > 0.5 ? mix(0.68, 1.02, 1.0 - wShortVert) : mix(0.40, 0.64, smoothstep(10.0, 42.0, dist));
  float w1Px = w1Base * nyq1;
  if (w1Px > 0.004) {
    const mat2 R09  = mat2(0.9877, -0.1564, 0.1564, 0.9877);
    const mat2 R09T = mat2(0.9877,  0.1564, -0.1564, 0.9877);
    vec4 c1 = textureLod(chopWave, (R09 * p) / 37.2 + vec2(0.19, 0.43), 0.0);
    gradient += (R09T * c1.gb) * (0.62 * ampChopScale * w1Px);
    float s1a = outerMode > 0.5 ? textureLod(shortWave, p / lengthShort, 0.0).a : c1.a;
    spectralWhitecap += max(c1.a * 0.65, s1a * 0.80) * w1Px;
  }

  // Band 2: 11.3m primary wind-chop (+17 deg orientation)
  if (nyq2 > 0.004) {
    const mat2 R17  = mat2(0.9563, -0.2924, 0.2924, 0.9563);
    const mat2 R17T = mat2(0.9563,  0.2924, -0.2924, 0.9563);
    vec4 c2 = textureLod(chopWave, (R17 * p) / lengthChop + vec2(0.57, 0.13), 0.0);
    gradient += (R17T * c2.gb) * (0.58 * ampChopScale * nyq2);
    spectralWhitecap += c2.a * nyq2 * 0.48;
  }

  // Band 3: Aperiodic golden-ratio dual-tap 3.4m / 5.5m short-crested ripples (eliminates periodic tile & diamond lattice!)
  if (nyq3 > 0.004) {
    const mat2 Rn23  = mat2(0.9205, 0.3907, -0.3907, 0.9205);
    const mat2 Rn23T = mat2(0.9205, -0.3907, 0.3907, 0.9205);
    const mat2 R49   = mat2(0.6561, -0.7547, 0.7547, 0.6561);
    const mat2 R49T  = mat2(0.6561,  0.7547, -0.7547, 0.6561);
    vec4 c3a = textureLod(chopWave, (Rn23 * p) / 3.42 + vec2(0.73, 0.67), 0.0);
    vec4 c3b = textureLod(chopWave, (R49  * p) / 5.53 + vec2(0.29, 0.81), 0.0);
    gradient += ((Rn23T * c3a.gb) * 0.62 + (R49T * c3b.gb) * 0.56) * (0.50 * ampChopScale * nyq3);
  }

  // Band 4: Aperiodic dual-tap 0.96m / 1.55m capillary-gravity facets (single-tap fast path in Low quality!)
  float nyq4Eff = uOceanQuality > 1.5 ? (1.0 - smoothstep(0.068, 0.30, pxFootprint)) * surfactantCalm : nyq4;
  if (nyq4Eff > 0.004) {
    const mat2 R31   = mat2(0.8572, -0.5150, 0.5150, 0.8572);
    const mat2 R31T  = mat2(0.8572,  0.5150, -0.5150, 0.8572);
    vec4 c4a = textureLod(chopWave, (R31  * p) / 1.04 + vec2(0.31, 0.89), 0.0);
    if (uOceanQuality > 0.5) {
      const mat2 Rn61  = mat2(0.4848,  0.8746, -0.8746, 0.4848);
      const mat2 Rn61T = mat2(0.4848, -0.8746,  0.8746, 0.4848);
      vec4 c4b = textureLod(chopWave, (Rn61 * p) / 1.68 + vec2(0.64, 0.22), 0.0);
      gradient += ((R31T * c4a.gb) * 0.58 + (Rn61T * c4b.gb) * 0.58) * (0.42 * ampChopScale * nyq4Eff);
    } else {
      gradient += (R31T * c4a.gb) * (0.44 * ampChopScale * nyq4Eff);
    }
  }

  vec3 legacyN = normalize(baseWaterN + vec3(-gradient.x, 0.0, -gradient.y));
  float microAA = (1.0 - smoothstep(0.06, 0.30, pxFootprint)) * (0.08 + 0.92 * meniscusCalm) * (0.25 + 0.75 * shallowCalm) * surfactantCalm;
  if (uOceanQuality > 0.5 && opticsMode > 0.5 && microAA > 0.004) {
    vec2 microSlope; vec3 microCurvature;
    opticalMicro(p, time, amplitude, pxFootprint, microSlope, microCurvature);
    gradient += microSlope * microAA;
  }

  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(sunDirection);
  vec3 resolvedN = normalize(baseWaterN + vec3(-gradient.x, 0.0, -gradient.y));

  // Young-Laplace Concave Capillary Meniscus Fillet along 3D Rock Contacts:
  // Curves water normal smoothly toward the wet rock clearcoat normal (G^1 continuity across mesh boundary!)
  float rockMeniscusBand = isRockHit * (1.0 - smoothstep(0.0, 0.24, trueSubmergence));
  if (rockMeniscusBand > 0.012) {
    float epsM = 0.65;
    float rpDx = sampleBathymetry(p + vec2(epsM, 0.0)).b - sampleBathymetry(p - vec2(epsM, 0.0)).b;
    float rpDz = sampleBathymetry(p + vec2(0.0, epsM)).b - sampleBathymetry(p - vec2(0.0, epsM)).b;
    vec2 outDir = -vec2(rpDx, rpDz);
    float outLen = length(outDir);
    vec2 rockOutH = outLen > 1e-4 ? (outDir / outLen) : vec2(0.0, -1.0);
    vec3 meniscusTargetN = normalize(vec3(rockOutH.x * 0.36, 1.0, rockOutH.y * 0.36));
    float filletCurve = pow(1.0 - clamp(trueSubmergence / 0.24, 0.0, 1.0), 1.35) * isRockHit;
    resolvedN = normalize(mix(resolvedN, meniscusTargetN, filletCurve * 0.64));
  }

  // --- Exact Sub-Pixel Cox-Munk Slope-Variance Conservation + Kaplanyan (2016) Normal-Variance Anti-Shimmer ---
  vec3 dNdxW = dFdx(resolvedN);
  vec3 dNdyW = dFdy(resolvedN);
  float screenNormalVar = min(0.12, 0.52 * (dot(dNdxW, dNdxW) + dot(dNdyW, dNdyW)));

  float unresolvedVar = (1.0 - microAA * microAA) * 0.0036
                      + (1.0 - nyq4 * nyq4) * 0.0078
                      + (1.0 - nyq3 * nyq3) * 0.0104
                      + (1.0 - nyq2 * nyq2) * 0.0118
                      + (1.0 - nyq1 * nyq1) * 0.0126
                      + (1.0 - nyq0 * nyq0) * 0.0082;
  float roughMod = (roughness / 0.105) * (0.22 + 0.78 * shallowCalm) * clamp(0.65 + 0.52 * amplitude, 0.45, 1.65);
  float sigmaUp2    = max(0.0022, (0.0018 + unresolvedVar * 1.38) * roughMod + screenNormalVar);
  float sigmaCross2 = max(0.0016, (0.0013 + unresolvedVar * 0.58) * roughMod + screenNormalVar * 0.85);
  float alphaUpwind    = clamp(sqrt(2.0 * sigmaUp2), 0.048, 0.48);
  float alphaCrosswind = clamp(sqrt(2.0 * sigmaCross2), 0.042, 0.34);
  float sigmaRMS = sqrt(0.5 * (sigmaUp2 + sigmaCross2));

  // Ross, Dion & Vagle (2005) / Bruneton (2010) Grazing Wave-Front Self-Masking:
  // At low grazing view angles, front wave slopes occlude wave backsides -> visible normal tilts slightly toward viewer!
  float rawNv = clamp(dot(resolvedN, V), 0.0, 1.0);
  vec3 viewHoriz = normalize(vec3(V.x, 0.0, V.z) + vec3(1e-5, 0.0, 0.0));
  float frontMaskTilt = sigmaRMS * pow(1.0 - rawNv, 2.2) * 0.58 * shallowCalm;
  vec3 N = normalize(resolvedN + viewHoriz * frontMaskTilt);
  float Nv = max(dot(N, V), 0.001);

  // Roughness-attenuated Ross-Bruneton Ocean Fresnel: unresolved chop prevents mirror washout at the horizon!
  float maxGrazingF = clamp(1.0 - 1.05 * sigmaRMS, 0.56, 0.95);
  float NvFresnel = max(Nv, 0.032 + 0.58 * sigmaRMS);
  float F = 0.0204 + (maxGrazingF - 0.0204) * pow(1.0 - NvFresnel, 5.0);

  vec3 R = reflect(-V, N);
  R = normalize(vec3(R.x, max(R.y, abs(R.y) * 0.34 + 0.024), R.z));

  // Directional boulder sun shadow across water surface, caustics, SSS & solar glitter (fast AABB-culled!)
  float waterSunShadow = pbrEvaluateSunShadow(
    rockShadowMap,
    rockShadowMatrix,
    rockShadowEnabled,
    vWorld,
    vec3(0.0, 0.05, 0.0),
    gl_FragCoord.xy
  );

  // Bruneton (2010) Sub-Pixel Facet-Filtered Sky Reflection: blurs sharp cloud edges across unresolved chop facets!
  float troughSkyVis = mix(0.72, 1.03, smoothstep(-0.36, 0.40, vWorld.y));
  vec3 reflSky;
  if (sigmaRMS > 0.055) {
    float lobeSpread = clamp((sigmaRMS - 0.04) * 0.52, 0.0, 0.14);
    vec3 Rhi = normalize(vec3(R.x, R.y + lobeSpread, R.z));
    vec3 Rlo = normalize(vec3(R.x, max(0.012, R.y - lobeSpread * 0.65), R.z));
    reflSky = (0.50 * sky(R) + 0.28 * sky(Rhi) + 0.22 * sky(Rlo)) * troughSkyVis;
  } else {
    reflSky = sky(R) * troughSkyVis;
  }
  vec3 color = mix(waterDeep, reflSky, F);

  // Coordinate reflection handoff with ShoreVisual.js so thinning swash has ZERO double-reflection AND ZERO Fresnel step
  float capillaryMatch = nearCoast ? smoothstep(-0.024, 0.008, depth) * 0.80 : 0.0;
  float effectiveSandFilm = max(swash.g, capillaryMatch);
  float existingFilmRefl = nearCoast
    ? (1.0 - smoothstep(0.038, 0.112, depth)) * smoothstep(0.02, 0.44, effectiveSandFilm) * 0.92
    : 0.0;
  float targetMeniscusRefl = beachMode > 0.5
    ? mix(existingFilmRefl, 1.0, smoothstep(0.008, 0.26, depth))
    : 1.0;

  // Deane & Stokes (2002) Subsurface Entrained Bubble-Plume Emulsion (clears smoothly inside shallow 3D rock meniscus!)
  float subBubblePlume = 0.0;
  if (nearCoast && trueSubmergence > 0.08) {
    float bubNoiseA = texture2D(detailMap, p * 0.075 + vec2(time * 0.011, -time * 0.016)).g;
    float bubNoiseB = texture2D(detailMap, p * 0.230 - vec2(time * 0.019, time * 0.014)).b;
    float bubBillow = smoothstep(0.14, 0.88, bubNoiseA * 0.58 + bubNoiseB * 0.42);
    float surfEnergyExtract = clamp(0.35 + 1.25 * max(0.0, -vNormal.z) + 0.85 * max(0.0, 1.0 - vJacobian), 0.25, 1.85);
    float rockWaveAeration = rockProx * smoothstep(0.06, 0.82, abs(hydro.w) * 0.52 + hydro.y * 0.92 + max(0.0, vWorld.y) * 1.35);
    subBubblePlume = clamp(
      (hydro.y * surfEnergyExtract * 0.76 + swash.b * 0.84 + hydro.z * 0.36 + rockWaveAeration * 1.15)
      * (0.42 + 0.78 * bubBillow) * smoothstep(0.10, 0.58, trueSubmergence) * foamVisible * foamBoost,
      0.0,
      0.84
    );
  }
  // Physical solar/lunar + sky hemisphere water illumination (scales cleanly down to dark nocturnal abyss at night!)
  float nightW = clamp(uNightMix, 0.0, 1.0);
  vec3 minDirect = mix(vec3(0.013, 0.015, 0.019), vec3(0.0010, 0.0016, 0.0028), nightW);
  vec3 minShadow = mix(vec3(0.010, 0.012, 0.015), vec3(0.0007, 0.0011, 0.0020), nightW);
  vec3 skyIrrUp = pbrHemisphereIrradiance(vec3(0.0, 1.0, 0.0), skyTop, skyHorizon);
  vec3 sunTintDirect = clamp(pbrSunIrradiance(L) * 0.23 + skyIrrUp * 0.38, minDirect, vec3(1.18));
  vec3 sunTintShadow = clamp(skyIrrUp * 0.62 + pbrSunIrradiance(L) * 0.05, minShadow, vec3(0.75));
  vec3 sunTintNorm   = mix(sunTintShadow, sunTintDirect, waterSunShadow);
  // Terrill, Melville & Stramski (2001) broad-spectrum Mie micro-bubble emulsion under breaking surf
  vec3 foamScatterBase = clamp(mix(scatterColor * 0.72, vec3(0.085, 0.178, 0.196), 0.42), vec3(0.01), vec3(0.24));
  vec3 aeratedEmulsionCol = foamScatterBase * sunTintNorm;
  float aerationFresnelDamp = 1.0 - 0.34 * subBubblePlume;

  // Calibrated intermediate shelf scatter color (bridges shallow aquamarine shoals and deep pelagic sapphire seamlessly)
  vec3 midToneBase = mix(scatterColor * 0.78, waterDeep * 2.45, 0.50);
  float effDepth = max(depth, 0.0) * waterDepthScale;

  if (beachMode > 0.5) {
    float path = min(effDepth / max(Nv, 0.28), 36.0);
    vec3 tr = exp(-absorption * path * 1.16);
    vec3 downKd = clamp(absorption * 0.58 + vec3(0.032, 0.038, 0.016), vec3(0.01), vec3(2.4));
    vec3 downTr = exp(-downKd * effDepth / 0.82);
    float sandGrain = effDepth < 9.0 ? texture2D(detailMap, p * 0.19).r : 0.5;
    vec3 sand = mix(vec3(0.44, 0.365, 0.255), vec3(0.64, 0.54, 0.385), sandGrain) * downTr * sunTintNorm * mix(0.38, 1.0, waterSunShadow);
    vec3 litMalachite = scatterColor * 1.24 * sunTintNorm * mix(0.46, 1.0, waterSunShadow);
    vec3 midPeacock   = midToneBase * sunTintNorm * mix(0.52, 1.0, waterSunShadow);
    vec3 coastalGrad  = mix(litMalachite, midPeacock, smoothstep(0.85, 3.80, path));
    vec3 shallowTurquoise = mix(coastalGrad, waterDeep * sunTintNorm * 1.12, smoothstep(2.60, 12.80, path));
    vec3 under = sand * tr + shallowTurquoise * (1.0 - tr);
    under = mix(under, aeratedEmulsionCol, subBubblePlume * 0.68);
    color = mix(under, reflSky, F * targetMeniscusRefl * aerationFresnelDamp);
  }

  vec2 chosenUV = screenUV;
  float opticalPath = 0.0, rejected = 0.0;
  vec3 transmission = vec3(1.0);
  bool realOptics = opticsMode > 0.5 && depthEnabled > 0.5;

  if (realOptics) {
    float sd = rawCenter;
    vec3 hit = exactBedHit;
    float basePath = sd < 0.999999 ? length(hit - vWorld) : 80.0;
    vec3 interfaceNormal = normalize(mix(vNormal, legacyN, refractionMicro));
    vec3 bent = refract(-V, interfaceNormal, 1.0 / 1.333);
    float refractedTravel = beachMode > 0.5
      ? clamp(max(depth, 0.0) / max(-bent.y, 0.28), 0.0, min(basePath, 8.0))
      : min(basePath, 12.0);
    vec3 estimate = vWorld + bent * refractedTravel;
    vec4 projected = opticalProjection * viewMatrix * vec4(estimate, 1.0);
    vec2 predicted = projected.xy / max(projected.w, 0.001) * 0.5 + 0.5;
    vec2 offset = clamp((predicted - screenUV) * refractionScale, vec2(-0.045 / captureScale), vec2(0.045 / captureScale));
    vec2 edgeDistance = min(screenUV, 1.0 - screenUV) - vec2(2.0) / captureResolution;
    vec2 edgeBand = max(vec2(2.0) / captureResolution, 2.0 * abs(offset));
    float edgeWeight = min(smoothstep(0.0, edgeBand.x, edgeDistance.x), smoothstep(0.0, edgeBand.y, edgeDistance.y));
    offset *= edgeWeight;

    vec2 chosenOffset = vec2(0.0);
    if (validHit(screenUV + offset)) {
      chosenOffset = offset;
    } else if (validHit(screenUV + offset * 0.55)) {
      chosenOffset = offset * 0.55;
      rejected = 0.4;
    } else if (validHit(screenUV + offset * 0.25)) {
      chosenOffset = offset * 0.25;
      rejected = 0.75;
    } else {
      rejected = 1.0;
    }
    chosenUV = screenUV + chosenOffset;

    float d = textureLod(sceneDepth, chosenUV, 0.0).r, wd = textureLod(waterDepth, chosenUV, 0.0).r;
    bool hasBottom = d < 0.999999 && ((wd < 0.999999 && d > wd) || (beachMode > 0.5 && effDepth < 0.18));
    float cosRefracted = sqrt(max(0.44, 1.0 - (1.0 - Nv * Nv) * 0.5626));
    if (beachMode > 0.5) {
      float columnPath = effDepth / cosRefracted;
      if (hasBottom) {
        vec3 hitPos = reconstruct(chosenUV, d);
        vec3 surfPos = reconstruct(chosenUV, wd);
        float submergence = max(0.0, surfPos.y - hitPos.y) * waterDepthScale / cosRefracted;
        opticalPath = clamp(mix(min(columnPath, submergence + 0.08), columnPath, rejected), 0.0, 120.0);
      } else {
        opticalPath = clamp(columnPath, 0.0, 120.0);
      }
    } else {
      opticalPath = (hasBottom ? clamp(length(reconstruct(chosenUV, d) - reconstruct(chosenUV, wd)), 0.0, 120.0) : 80.0) * waterDepthScale;
    }
    transmission = exp(-max(absorption, vec3(0.0)) * opticalPath * (beachMode > 0.5 ? 1.16 : 0.96));
    vec3 deepScatterTarget = (beachMode > 0.5 ? waterDeep * 1.12 : waterDeep) * sunTintNorm;
    vec3 litScatter = scatterColor * 1.26 * sunTintNorm * mix(0.44, 1.0, waterSunShadow);
    vec3 midPeacock = midToneBase * sunTintNorm * mix(0.50, 1.0, waterSunShadow);
    vec3 nearToMid  = beachMode > 0.5 ? mix(litScatter, midPeacock, smoothstep(0.85, 3.85, opticalPath)) : mix(litScatter, midPeacock, smoothstep(1.2, 5.2, opticalPath));
    vec3 columnScatter = mix(nearToMid, deepScatterTarget, smoothstep(2.60, 13.20, opticalPath));
    vec3 bottom = (hasBottom && max(transmission.r, max(transmission.g, transmission.b)) > 0.004)
      ? safeSceneColor(chosenUV)
      : columnScatter;
    if (hasBottom && max(transmission.r, max(transmission.g, transmission.b)) > 0.004) {
      vec3 hitWorld = reconstruct(chosenUV, d);
      if (kdActive > 0.5) {
        bottom *= verticalObjectLight(hitWorld);
      } else if (beachMode > 0.5) {
        float bedSubmergence = max(0.0, vWorld.y - hitWorld.y) * waterDepthScale;
        vec3 downKd = clamp(absorption * 0.58 + vec3(0.032, 0.038, 0.016), vec3(0.01), vec3(2.4));
        bottom *= exp(-downKd * bedSubmergence / 0.82);
      }
    }
    vec3 under = bottom * transmission + columnScatter * (1.0 - transmission);
    under = mix(under, aeratedEmulsionCol, subBubblePlume * 0.70 * smoothstep(0.16, 0.58, opticalPath));
    float addedReflWeight = beachMode > 0.5
      ? clamp((targetMeniscusRefl - existingFilmRefl * 0.96) / max(1.0 - existingFilmRefl * F * 0.92, 0.15), 0.0, 1.0)
      : 1.0;
    float reflFactor = F * addedReflWeight * aerationFresnelDamp;
    color = mix(under, reflSky, clamp(reflFactor, 0.0, 1.0));
  }

  // Aivazovsky Backlit & Oblique Wave-Crest Subsurface Translucency (coupled to dynamic absorption & scatterColor!)
  float crestHeight = max(0.0, vWorld.y - (beachMode > 0.5 ? max(0.0, bed) : 0.0));
  float openCrestMask = (1.0 - rockProx * 0.82) * (beachMode > 0.5 ? smoothstep(0.16, 0.54, depth) : 1.0);
  float slopeMag = length(N.xz);
  float waveSteepness = smoothstep(0.12, 0.44, slopeMag + 0.76 * hydro.y) * openCrestMask;
  float wedgeThinness = clamp(waveSteepness * smoothstep(0.07, 0.44, crestHeight + 0.32 * hydro.y), 0.0, 1.0);
  vec3 wedgeExt = clamp(absorption * vec3(2.35, 0.92, 1.95), vec3(0.04), vec3(3.2));
  vec3 wedgeBeer = exp(-wedgeExt * mix(2.50, 0.42, wedgeThinness));
  float cosFwdCrest = clamp(dot(-V, normalize(vec3(L.x, L.y * 0.38, L.z))), 0.0, 1.0);
  float hgCrest = pow(cosFwdCrest, 1.85);
  float topWedgeSolar = max(L.y, 0.12) * (1.0 - Nv * 0.62);
  float grazeCrest = (0.30 + 0.70 * (1.0 - Nv)) * wedgeThinness;
  vec3 sssTint = clamp(scatterColor * 1.08 + vec3(0.004, 0.035, 0.025), vec3(0.01), vec3(0.42));
  color += sssTint * wedgeBeer * pbrSunIrradiance(L) * (0.68 * mix(0.24, 1.0, waterSunShadow))
         * grazeCrest * (0.38 * topWedgeSolar + 1.18 * hgCrest) * (1.0 - smoothstep(95.0, 340.0, dist)) * meniscusCalm;

  // Distant Per-Pixel Spectral Whitecaps (driven by vertex Jacobian + Riesz FFT orbital convergence out to 950m!)
  float fadeFoam = 1.0 - smoothstep(260.0, 960.0, dist);
  float compressed = max(1.0 - smoothstep(0.56, 0.82, vJacobian), smoothstep(0.34, 0.78, spectralWhitecap));
  float wcMacro = (outerMode > 0.5 && compressed > 0.01) ? texture2D(detailMap, p * 0.065 + vec2(0.012 * time, -0.016 * time)).r : 0.5;
  float wcFine  = (outerMode > 0.5 && compressed > 0.01) ? texture2D(detailMap, p * 0.24 - vec2(0.018 * time, 0.022 * time)).g : 0.5;
  float offshoreCore = compressed * smoothstep(0.36, 0.78, wcMacro * 0.62 + wcFine * 0.38);
  float offshoreLace = compressed * smoothstep(0.28, 0.72, wcFine) * 0.48;
  float deepGateOuter = beachMode > 0.5 ? smoothstep(1.4, 3.2, depth) : 1.0;

  float foamShadow = clamp((offshoreCore + offshoreLace * 0.65 + hydro.y * 1.15 + hydro.z * 1.05 + swash.b * 1.18) * foamVisible * foamBoost, 0.0, 1.0);
  float coreCoverage = outerMode > 0.5 ? clamp(offshoreCore * fadeFoam * deepGateOuter * foamVisible * foamBoost, 0.0, 1.0) : 0.0;
  float laceCoverage = outerMode > 0.5 ? clamp(offshoreLace * fadeFoam * deepGateOuter * foamVisible * foamBoost, 0.0, 1.0) : 0.0;
  float totalFoam = 1.0 - (1.0 - coreCoverage) * (1.0 - laceCoverage);

  // Cox & Munk (1954) / Heitz (2014) Anisotropic Height-Correlated Smith-GGX Solar Glitter Path!
  vec3 sunE = pbrSunIrradiance(L) * waterSunShadow;
  vec3 sunSpec;
  if (uOceanQuality > 0.5) {
    vec3 tangent = normalize(cross(L, vec3(0.0, 1.0, 0.0)));
    sunSpec = 0.58 * pbrSpecularOceanAnisoGGX(N, V, L, windDirection, alphaUpwind, alphaCrosswind, vec3(0.0204))
            + 0.21 * pbrSpecularOceanAnisoGGX(N, V, normalize(L + 0.00465 * tangent), windDirection, alphaUpwind * 1.28, alphaCrosswind * 1.28, vec3(0.0204))
            + 0.21 * pbrSpecularOceanAnisoGGX(N, V, normalize(L - 0.00465 * tangent), windDirection, alphaUpwind * 1.28, alphaCrosswind * 1.28, vec3(0.0204));
  } else {
    sunSpec = pbrSpecularOceanAnisoGGX(N, V, L, windDirection, alphaUpwind * 1.08, alphaCrosswind * 1.08, vec3(0.0204));
  }
  vec3 sunTerm = sunSpec * sunE * (1.0 - existingFilmRefl * 0.85);
  color += sunTerm * (1.0 - clamp(foamShadow * 0.90, 0.0, 0.94));

  if (outerMode > 0.5 && totalFoam > 0.002) {
    vec3 ringFoamCol = vec3(0.92, 0.95, 0.97) * (pbrHemisphereIrradiance(N, skyTop, skyHorizon) * 0.72 + (sunE / PI) * max(dot(N, L), 0.15));
    color = mix(color, ringFoamCol, clamp(totalFoam * 0.82, 0.0, 0.88));
  }

  color = pbrAerialPerspective(color, vWorld, cameraPosition, L, skyTop, skyHorizon);

  // Seamless Shoreline & 3D Rock Soft-Depth Meniscus Feathering + Sand-Ripple-Guided Backwash Dissolution!
  float contact = 1.0;
  if (beachMode > 0.5) {
    float uprushMask = clamp(smoothstep(-0.10, 0.46, hydro.w), 0.0, 1.0);
    float grainEdge = texture2D(detailMap, p * 0.48 + vec2(1.3, 2.7)).r * 0.58
                    + texture2D(detailMap, p * 2.15).r * 0.42;
    float geomDepth = trueSubmergence;
    float sandMeniscusDepth = geomDepth + (-sandRippleWave * 0.010 + (grainEdge - 0.5) * 0.014) * (1.0 - 0.45 * uprushMask) * smoothstep(0.0, 0.03, geomDepth);
    float sandMeniscusWidth = mix(0.125, 0.058, uprushMask) * (0.72 + 0.54 * grainEdge);
    float rockSurgeEnergy   = clamp(swash.b * 0.65 + hydro.y * 0.55 + abs(hydro.w) * 0.35, 0.0, 1.0);
    float rockMeniscusWidth = mix(0.18, 0.11, rockSurgeEnergy) * (0.82 + 0.36 * grainEdge);
    float activeMeniscusDepth = mix(sandMeniscusDepth, geomDepth + (grainEdge - 0.5) * 0.018 * smoothstep(0.0, 0.05, geomDepth), isRockHit);
    float activeMeniscusWidth = mix(sandMeniscusWidth, rockMeniscusWidth, isRockHit);
    float meniscusAlpha = smoothstep(0.0005, activeMeniscusWidth, activeMeniscusDepth);
    contact = meniscusAlpha;

    if (depthEnabled > 0.5) {
      float raw = rawCenter;
      float sceneZ = depthNear * depthFar / (depthFar - (depthFar - depthNear) * raw);
      float waterZ = -(viewMatrix * vec4(vWorld, 1.0)).z;
      float gap = max(sceneZ - waterZ, 0.0);
      float gapGrad = fwidth(gap);
      float baseWidth = mix(max(depthFadeWidth, 0.004), max(depthFadeWidth, 0.22), isRockHit);
      float angleWidth = baseWidth * (1.0 + 0.36 * (1.0 - clamp(Nv, 0.0, 1.0)));
      float adaptiveWidth = min(baseWidth * 1.9, max(angleWidth, 1.45 * gapGrad));
      if (raw < 0.999999 && validContact > 0.01) {
        float depthContact = mix(1.0, smoothstep(0.0, adaptiveWidth, gap), contactStrength * validContact);
        contact = min(contact, depthContact);
      }
      if (depthDebug > 0.5) color = raw >= 0.999999 ? vec3(0.8, 0.1, 0.8) : mix(vec3(1.0, 0.08, 0.02), vec3(0.02, 0.7, 0.8), contact);
    }
    if (contact <= 0.003 && depthDebug < 0.5) discard;
  }

  if (realOptics) {
    if (depthDebug < 0.5) color = mix(textureLod(sceneColor, screenUV, 0.0).rgb, color, contact);
    if (opticsDebug > 0.5 && opticsDebug < 1.5) color = textureLod(sceneColor, screenUV, 0.0).rgb;
    if (opticsDebug > 1.5 && opticsDebug < 2.5) color = vec3(1.0 - exp(-opticalPath * 0.16));
    if (opticsDebug > 2.5 && opticsDebug < 3.5) color = transmission;
    if (opticsDebug > 3.5 && opticsDebug < 4.5) color = mix(vec3(0.02, 0.5, 0.08), vec3(1.0, 0.02, 0.25), rejected);
    if (opticsDebug > 4.5) color = vec3((chosenUV - screenUV) * 12.0 + 0.5, 0.5);
  }

  vec3 rasterNormal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  rasterNormal *= dot(rasterNormal, vNormal) < 0.0 ? -1.0 : 1.0;

  if (foamDebug > 0.5 && foamDebug < 6.5) {
    float d = foamDebug < 1.5 ? coreCoverage : (foamDebug < 2.5 ? laceCoverage : (foamDebug < 3.5 ? totalFoam : (foamDebug < 4.5 ? swash.r : (foamDebug < 5.5 ? swash.g : rockProx))));
    color = vec3(d);
  }

  // Underwater Snell's window & internal reflection when looking up from beneath the waves
  if (!gl_FrontFacing) {
    vec3 wi = normalize(vWorld - cameraPosition);
    vec3 geometricInterface = geometricBoundary > 0.5 ? rasterNormal : normalize(vNormal);
    vec3 opticalInterface = N;
    if (boundaryRepair > 0.5) {
      opticalInterface = normalize(mix(vNormal, legacyN, refractionMicro));
      float facing = smoothstep(0.02, 0.15, dot(wi, opticalInterface));
      opticalInterface = normalize(mix(geometricInterface, opticalInterface, facing));
    }
    vec3 inward = -opticalInterface;
    float ci = clamp(dot(-wi, inward), 0.0, 1.0), eta = 1.333;
    float sin2 = eta * eta * (1.0 - ci * ci), ct = sqrt(max(0.0, 1.0 - sin2));
    float rs = (eta * ci - ct) / max(eta * ci + ct, 0.0001), rp = (ci - eta * ct) / max(ci + eta * ct, 0.0001);
    float f = sin2 >= 1.0 ? 1.0 : 0.5 * (rs * rs + rp * rp);
    vec3 airDir = refract(wi, inward, eta);
    vec3 upSky = sin2 < 1.0 ? sky(airDir) : vec3(0.0);
    vec3 reflected = reflect(wi, inward);
    if (boundaryRepair > 0.5) {
      float outward = dot(reflected, geometricInterface);
      reflected = normalize(reflected - geometricInterface * max(0.0, outward + 0.0001));
    }
    float bedAngle = clamp(-reflected.y, 0.0, 1.0);
    vec3 below = mix(waterDeep, vec3(0.09, 0.125, 0.115), bedAngle * 0.7);
    float reflectedPath = 0.0, reflectionValid = 0.0;
    if (reflectionEnabled > 0.5 && boundaryRepair > 0.5) {
      below = continuousReflection(vWorld, reflected, reflectionValid, reflectedPath);
    } else if (reflectionEnabled > 0.5) {
      float floorY = beachMode > 0.5 ? bed : -16.0;
      float distanceToBed = clamp((vWorld.y - floorY) / max(-reflected.y, 0.035), 0.02, 100.0);
      vec3 hit = vWorld + reflected * distanceToBed;
      if (beachMode > 0.5) {
        for (int ri = 0; ri < 3; ri++) {
          float terrain = sharedTerrainBed(hit.xz);
          distanceToBed = clamp((vWorld.y - terrain) / max(-reflected.y, 0.035), 0.02, 100.0);
          hit = vWorld + reflected * distanceToBed;
        }
      }
      float grain = textureLod(detailMap, hit.xz * 0.19, 0.0).r;
      vec3 reflectedRadiance = mix(vec3(0.30, 0.245, 0.16), vec3(0.50, 0.405, 0.265), grain);
      vec4 projectedReflection = reflectionProjection * reflectionView * vec4(hit, 1.0);
      vec2 reflectionUV = projectedReflection.xy / max(projectedReflection.w, 0.0001) * 0.5 + 0.5;
      if (projectedReflection.w > 0.0 && all(greaterThan(reflectionUV, vec2(0.003))) && all(lessThan(reflectionUV, vec2(0.997)))) {
        float rawReflectionDepth = textureLod(reflectionDepth, reflectionUV, 0.0).r;
        vec4 rpos = reflectionInverseProjection * vec4(reflectionUV * 2.0 - 1.0, rawReflectionDepth * 2.0 - 1.0, 1.0);
        rpos /= rpos.w;
        vec3 realHit = (reflectionCameraWorld * rpos).xyz;
        vec3 toHit = realHit - vWorld;
        float along = dot(toHit, reflected), offRay = length(toHit - reflected * along);
        if (rawReflectionDepth < 0.999999 && along > 0.0 && realHit.y < vWorld.y + 0.12 && offRay < max(0.22, along * 0.12)) {
          reflectedRadiance = textureLod(reflectionColor, reflectionUV, 0.0).rgb;
          distanceToBed = length(toHit);
          if (kdActive > 0.5) hit = realHit;
          reflectionValid = 1.0;
        }
      }
      if (kdActive > 0.5) reflectedRadiance *= verticalObjectLight(hit);
      reflectedPath = distanceToBed;
      vec3 sigmaS = vec3(0.025, 0.035, 0.045), extinction = max(absorption, vec3(0.0)) + sigmaS;
      vec3 reflectedT = exp(-extinction * distanceToBed);
      float meanDepth = max(0.0, vWorld.y - hit.y) * 0.5;
      vec3 reflectedScatter = vec3(0.10, 0.19, 0.23) * exp(-vec3(0.09, 0.045, 0.025) * meanDepth) * sigmaS / extinction;
      below = reflectedRadiance * reflectedT + reflectedScatter * (1.0 - reflectedT);
      if (reflected.y >= -0.035) below = reflectedScatter;
    }
    vec3 c = mix(upSky, below, f);
    c = mix(c, vec3(0.32, 0.42, 0.40), clamp(totalFoam * 0.42, 0.0, 0.36));
    color = c;
    contact = 1.0;
  }

  if (seamDebug > 0.5 && seamDebug < 1.5) color = gl_FrontFacing ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  if (foamScaleDebug > 0.5) color = vec3(fract(p.x * 0.2), fract(p.y * 0.2), 0.5);
  gl_FragColor = vec4(color, realOptics || depthDebug > 0.5 ? 1.0 : contact);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  // Checkerboard alternating diagonal triangulation eliminates directional '/' mesh normal & Jacobian bias!
  if (geo.index) {
    const idx = geo.index.array;
    const cols = segments + 1;
    let ptr = 0;
    for (let iz = 0; iz < segments; iz++) {
      for (let ix = 0; ix < segments; ix++) {
        const a = iz * cols + ix;
        const b = (iz + 1) * cols + ix;
        const c = (iz + 1) * cols + (ix + 1);
        const d = iz * cols + (ix + 1);
        if ((ix + iz) & 1) {
          idx[ptr++] = a; idx[ptr++] = b; idx[ptr++] = c;
          idx[ptr++] = a; idx[ptr++] = c; idx[ptr++] = d;
        } else {
          idx[ptr++] = a; idx[ptr++] = b; idx[ptr++] = d;
          idx[ptr++] = b; idx[ptr++] = c; idx[ptr++] = d;
        }
      }
    }
    geo.index.needsUpdate = true;
  }
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: vertex, fragmentShader: fragment });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    uniforms: U,
    dispose() {
      geo.dispose();
      mat.dispose();
    }
  };
}
