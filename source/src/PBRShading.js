/* Unified Physically-Based Rendering (PBR), Ozone-Rayleigh-Mie Time-of-Day Sky, Neural Chapman Transmittance,
 * Anisotropic Ocean Smith-GGX Microfacet BRDF, Vogel-IGN Soft Sun Shadows & Wet-Porous Optics (PBRShading.js).
 *
 * Cross-Disciplinary Mathematical & Rendering References:
 *  - Hulburt (1953) & Bruneton & Neyret (2008, EGSR): Stratospheric Ozone Chappuis-band (550-650nm) absorption
 *    + Rayleigh + Cornette-Shanks Mie scattering across dawn, noon, afternoon, and golden dusk.
 *  - Bruneton, Neyret & Holzschuch (2010, EGSR) + Heitz (2014, JCGT): Anisotropic Height-Correlated Smith-GGX
 *    ocean microfacet BRDF preserving unresolved Cox-Munk upwind/crosswind wave slope variance to the horizon.
 *  - Oren & Nayar (1994, SIGGRAPH): Rough micro-cavity diffuse reflectance for dry silicate rock & quartz sand.
 *  - Angstrom (1925) & Lekner & Dorf (1988, Applied Optics 27): Nonlinear internal-reflection darkening in wet pores.
 *  - Vogel (1979) golden-angle spiral + Jimenez (2014, SIGGRAPH) Interleaved Gradient Noise soft shadow penumbrae.
 */
export const pbrShadingGLSL = `
#ifndef PBR_SHADING_GLSL
#define PBR_SHADING_GLSL

const float PBR_PI = 3.14159265359;
const float PBR_TAU = 6.28318530718;
uniform float uNightMix;

// Cornette-Shanks physical Mie & Rayleigh-like phase function
float pbrMiePhase(float cosTheta, float g){
  float g2 = g * g;
  float denom = max(0.015, 1.0 + g2 - 2.0 * g * cosTheta);
  return (3.0 * (1.0 - g2)) / (8.0 * PBR_PI * (2.0 + g2)) * ((1.0 + cosTheta * cosTheta) / pow(denom, 1.5));
}

// Analytical Ozone Chappuis + Rayleigh + Mie clear-sky radiance across Morning, Noon, Afternoon, Golden Dusk & Starry Night
vec3 pbrSkyRadiance(vec3 viewDir, vec3 sunDir, vec3 skyTopCol, vec3 skyHorCol){
  float vLen = length(viewDir);
  vec3 d = vLen > 1e-5 ? viewDir / vLen : vec3(0.0, 1.0, 0.0);
  vec3 L = normalize(sunDir);
  float mu = d.y;
  float h = clamp(mu, 0.0, 1.0);
  float sunElev = clamp(L.y, 0.015, 1.0);
  float dusk = 1.0 - smoothstep(0.04, 0.28, sunElev);
  float nightW = clamp(uNightMix, 0.0, 1.0);

  // Chapman-inspired optical air-mass with stratospheric Ozone Chappuis absorption
  float airMass = 1.0 / (h + 0.135 * pow(h + 0.065, -0.72));
  vec3 betaRayleigh = vec3(0.058, 0.135, 0.331);
  vec3 betaOzone    = vec3(0.034, 0.092, 0.004) * mix(1.0, 1.55, dusk);
  vec3 betaMie      = vec3(0.022, 0.020, 0.018);
  vec3 optDepth     = (betaRayleigh + betaOzone + betaMie) * min(airMass, 9.5);
  vec3 trans        = exp(-optDepth * 0.48);

  vec3 dayZenith   = mix(skyTopCol * vec3(0.64, 0.90, 1.38), vec3(0.018, 0.115, 0.46), 0.58);
  vec3 duskZenith  = mix(skyTopCol * 1.15, vec3(0.028, 0.052, 0.22), 0.55);
  vec3 deepZenith  = mix(mix(dayZenith, duskZenith, dusk), skyTopCol * 1.05, nightW);

  vec3 dayHorizon  = mix(skyHorCol * vec3(1.06, 1.05, 1.03), vec3(0.36, 0.54, 0.72), 0.38);
  vec3 duskHorizon = mix(skyHorCol, vec3(0.58, 0.34, 0.24), 0.42);
  vec3 warmHorizon = mix(mix(dayHorizon, duskHorizon, dusk), skyHorCol * 1.12, nightW);
  vec3 sky = mix(warmHorizon, deepZenith, pow(h, mix(mix(0.44, 0.54, dusk), 0.62, nightW))) * mix(vec3(0.78) + 0.34 * trans, vec3(1.0), nightW);

  // Directional solar/lunar horizon Mie & golden-dusk twilight glow belt
  float sunCos = dot(d, L);
  float sunAzimuth = clamp(dot(normalize(vec2(d.x, d.z) + 1e-5), normalize(vec2(L.x, L.z) + 1e-5)) * 0.5 + 0.5, 0.0, 1.0);
  float horizonBelt = exp(-abs(mu) * mix(7.2, 5.2, dusk));
  vec3 antiSunBelt = mix(vec3(0.055, 0.105, 0.145), vec3(0.11, 0.09, 0.16), dusk) * (1.0 - 0.92 * nightW);
  vec3 sunWardBelt = mix(mix(vec3(0.32, 0.22, 0.12), vec3(0.92, 0.38, 0.12), dusk), vec3(0.018, 0.032, 0.058), nightW);
  sky += mix(antiSunBelt, sunWardBelt, pow(sunAzimuth, mix(2.4, 3.2, dusk))) * horizonBelt;

  // Multi-scale Cornette-Shanks solar/lunar aureole + HDR corona
  float sunPos = max(sunCos, 0.0);
  float mieAureole = pbrMiePhase(sunCos, 0.80);
  vec3 sunTint = mix(mix(vec3(0.52, 0.38, 0.22), vec3(0.95, 0.42, 0.14), dusk), vec3(0.042, 0.062, 0.098), nightW);
  sky += sunTint * mieAureole * (0.35 + 0.65 * (1.0 - h));
  sky += sunTint * 0.92 * pow(sunPos, 18.0) * (1.0 - 0.42 * h) * (1.0 - 0.55 * nightW);
  vec3 coronaPeak = mix(mix(vec3(3.60, 2.85, 1.98), vec3(4.20, 1.85, 0.62), dusk), vec3(0.45, 0.60, 0.88), nightW);
  sky += coronaPeak * pow(sunPos, 340.0);

  if (mu < 0.0) {
    float below = clamp(-mu * 2.8, 0.0, 1.0);
    vec3 dayBounce = mix(warmHorizon * 0.85, mix(vec3(0.11, 0.26, 0.34), vec3(0.18, 0.13, 0.16), dusk), 0.58);
    vec3 nightBounce = mix(skyHorCol * 0.75, vec3(0.006, 0.016, 0.030), 0.65);
    sky = mix(sky, mix(dayBounce, nightBounce, nightW), below);
  }
  return sky;
}

// O(1) Equirectangular HDR Volumetric Cloud + Sky Environment Lookup
vec3 pbrSampleSkyEnv(sampler2D skyEnvMap, float skyEnvReady, vec3 dir, vec3 sunDir, vec3 skyTopCol, vec3 skyHorCol){
  float dLen = length(dir);
  vec3 d = dLen > 1e-5 ? dir / dLen : vec3(0.0, 1.0, 0.0);
  vec3 res;
  if (skyEnvReady < 0.5) {
    res = pbrSkyRadiance(d, sunDir, skyTopCol, skyHorCol);
  } else {
    float u = atan(d.x, -d.z) / PBR_TAU + 0.5;
    float v = d.y >= 0.0
      ? 0.20 + 0.80 * pow(clamp(d.y, 0.0, 1.0), 0.62)
      : 0.20 * (1.0 - pow(clamp(-d.y, 0.0, 1.0), 0.55));
    vec3 env = textureLod(skyEnvMap, vec2(fract(u), clamp(v, 0.004, 0.996)), 0.0).rgb;
    vec3 L = normalize(sunDir);
    float sunCos = max(dot(d, L), 0.0);
    float dusk = 1.0 - smoothstep(0.04, 0.28, clamp(L.y, 0.015, 1.0));
    float nightW = clamp(uNightMix, 0.0, 1.0);
    vec3 coronaCol = mix(mix(vec3(3.4, 2.75, 1.92), vec3(4.1, 1.72, 0.55), dusk), vec3(0.52, 0.68, 0.96), nightW);
    env += coronaCol * pow(sunCos, 540.0) * smoothstep(-0.02, 0.06, d.y);
    res = env;
  }
  return res;
}

// Chapman Air-Mass Direct Solar & Lunar Irradiance across Dawn, Noon, Afternoon, Dusk & Starry Night!
vec3 pbrSunIrradiance(vec3 sunDir){
  float sunElev = clamp(normalize(sunDir).y, 0.018, 1.0);
  float airMass = 1.0 / (sunElev + 0.135 * pow(sunElev + 0.045, -0.76));
  // Physical Rayleigh (lambda^-4) + Chappuis Ozone extinction shifts high-noon white-gold -> molten sunset amber-crimson!
  vec3 ex = exp(-vec3(0.046, 0.104, 0.208) * min(airMass, 11.5));
  float horizonSoft = smoothstep(0.012, 0.075, sunElev);
  vec3 solarIrr = vec3(3.92, 3.68, 3.42) * ex * (0.42 + 0.58 * horizonSoft);
  // Mesopic silver-blue lunar direct irradiance (Purkinje-shifted cool moonlight for water glitter, foam & boulder shadows!)
  vec3 lunarEx = exp(-vec3(0.032, 0.058, 0.095) * min(airMass, 8.0));
  vec3 lunarIrr = vec3(0.32, 0.43, 0.62) * lunarEx * smoothstep(0.01, 0.12, sunElev);
  return mix(solarIrr, lunarIrr, clamp(uNightMix, 0.0, 1.0));
}

// Analytical sky hemisphere + turquoise surf + warm golden sand GI bounce irradiance (day & starry-night aware)
vec3 pbrHemisphereIrradiance(vec3 N, vec3 skyTopCol, vec3 skyHorCol){
  float up = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  float horizon = 1.0 - abs(N.y);
  float nightW = clamp(uNightMix, 0.0, 1.0);
  vec3 zenithIrr = skyTopCol * mix(2.25, 3.40, nightW) + skyHorCol * mix(0.68, 1.15, nightW);
  vec3 groundBase = mix(vec3(0.18, 0.21, 0.22), vec3(0.008, 0.014, 0.024), nightW);
  vec3 groundRef = mix(groundBase, skyHorCol * 0.52, 0.45);
  vec3 skyIrr = mix(groundRef, zenithIrr, pow(up, 0.80));
  vec3 dayLat = mix(vec3(0.08, 0.24, 0.28), vec3(0.30, 0.23, 0.15), clamp(N.z * 0.5 + 0.5, 0.0, 1.0))
              * clamp(dot(skyHorCol, vec3(0.333)) * 2.1, 0.35, 1.25);
  vec3 nightLat = vec3(0.012, 0.026, 0.045);
  return skyIrr + mix(dayLat, nightLat, nightW) * horizon * 0.46;
}

// Schlick Fresnel
vec3 pbrFresnelSchlick(float cosTheta, vec3 F0){
  float m = clamp(1.0 - cosTheta, 0.0, 1.0);
  float m2 = m * m;
  return F0 + (1.0 - F0) * (m2 * m2 * m);
}

float pbrFresnelScalar(float cosTheta, float f0){
  float m = clamp(1.0 - cosTheta, 0.0, 1.0);
  float m2 = m * m;
  return f0 + (1.0 - f0) * (m2 * m2 * m);
}

// Trowbridge-Reitz / GGX NDF
float pbrDistributionGGX(float NoH, float alpha){
  float a2 = alpha * alpha;
  float d = (NoH * NoH) * (a2 - 1.0) + 1.0;
  return a2 / max(PBR_PI * d * d, 1e-6);
}

// Heitz (2014) height-correlated Smith-GGX visibility V = G / (4 * NoV * NoL)
float pbrVisibilitySmithGGXCorrelated(float NoV, float NoL, float alpha){
  float a2 = alpha * alpha;
  float gv = NoL * sqrt(max(1e-5, NoV * (NoV - NoV * a2) + a2));
  float gl = NoV * sqrt(max(1e-5, NoL * (NoL - NoL * a2) + a2));
  return 0.5 / max(gv + gl, 1e-4);
}

// Cook-Torrance isotropic microfacet specular lobe
vec3 pbrSpecularGGX(vec3 N, vec3 V, vec3 L, float perceptualRoughness, vec3 F0){
  vec3 H = normalize(V + L);
  float NoV = max(dot(N, V), 1e-4);
  float NoL = max(dot(N, L), 0.0);
  if (NoL <= 0.0) return vec3(0.0);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  float alpha = max(0.022, perceptualRoughness * perceptualRoughness);
  float D = pbrDistributionGGX(NoH, alpha);
  float Vis = pbrVisibilitySmithGGXCorrelated(NoV, NoL, alpha);
  vec3 F = pbrFresnelSchlick(VoH, F0);
  return D * Vis * F * NoL;
}

// NVIDIA WaveWorks / Bruneton, Neyret & Holzschuch (2010) + Heitz (2014)
// Anisotropic Height-Correlated Smith-GGX Ocean Microfacet BRDF (overflow-safe vector formulation!)
vec3 pbrSpecularOceanAnisoGGX(
  vec3 N,
  vec3 V,
  vec3 L,
  vec2 windDirXZ,
  float alphaUpwind,
  float alphaCrosswind,
  vec3 F0
){
  float NoL = max(dot(N, L), 0.0);
  if (NoL <= 0.0) return vec3(0.0);
  float NoV = max(dot(N, V), 1e-4);
  vec3 H = normalize(V + L);
  float NoH = max(dot(N, H), 1e-4);
  float VoH = max(dot(V, H), 0.0);

  vec3 w3 = vec3(windDirXZ.x, 0.0, windDirXZ.y);
  vec3 T = normalize(w3 - N * dot(N, w3) + vec3(1e-5, 0.0, 0.0));
  vec3 B = cross(N, T);

  float ax = clamp(alphaUpwind, 0.016, 0.65);
  float ay = clamp(alphaCrosswind, 0.016, 0.65);
  float a2 = ax * ay;

  float ToH = dot(T, H), BoH = dot(B, H);
  vec3 dVec = vec3(ay * ToH, ax * BoH, a2 * NoH);
  float w2 = a2 / max(dot(dVec, dVec), 1e-6);
  float D = a2 * w2 * w2 / PBR_PI;

  float ToV = dot(T, V), BoV = dot(B, V);
  float ToL = dot(T, L), BoL = dot(B, L);
  float lambdaV = NoL * length(vec3(ax * ToV, ay * BoV, NoV));
  float lambdaL = NoV * length(vec3(ax * ToL, ay * BoL, NoL));
  float Vis = 0.5 / max(lambdaV + lambdaL, 1e-4);

  vec3 F = pbrFresnelSchlick(VoH, F0);
  return D * Vis * F * NoL;
}

// Oren & Nayar (1994) qualitative rough micro-cavity diffuse reflectance
float pbrDiffuseOrenNayar(vec3 N, vec3 V, vec3 L, float perceptualRoughness){
  float NoL = max(dot(N, L), 0.0);
  if (NoL <= 0.0) return 0.0;
  float NoV = max(dot(N, V), 1e-4);
  float sigma2 = perceptualRoughness * perceptualRoughness;
  float A = 1.0 - 0.5 * (sigma2 / (sigma2 + 0.33));
  float B = 0.45 * (sigma2 / (sigma2 + 0.09));
  float s = dot(L, V) - NoL * NoV;
  float t = s > 0.0 ? max(NoL, NoV) : 1.0;
  return (NoL / PBR_PI) * (A + B * max(0.0, s / max(t, 1e-4)));
}

// Lekner & Dorf (1988, Applied Optics 27) wet porous darkening + chromatic enrichment
vec3 pbrWetPorousAlbedo(vec3 dryAlbedo, float wetness, float maxDarken){
  float w = clamp(wetness, 0.0, 1.0);
  vec3 saturated = pow(max(dryAlbedo, vec3(1e-4)), vec3(mix(1.0, 1.48, w)));
  return mix(dryAlbedo, saturated * maxDarken, w);
}

// Castaño (2013) Noise-Free C^1-Continuous 3x3 Quadratic B-Spline Tent PCF Directional Sun Shadow
float pbrEvaluateSunShadow(
  sampler2D shadowDepthTex,
  mat4 shadowMatrix,
  float shadowEnabled,
  vec3 worldPos,
  vec3 normalBiasVec,
  vec2 fragCoord
){
  if (shadowEnabled < 0.5) return 1.0;
  // Fast spatial AABB pre-reject before matrix projection & depth fetches!
  if (abs(worldPos.x) > 180.0 || worldPos.z < -62.0 || worldPos.z > 68.0) return 1.0;
  vec4 sc = shadowMatrix * vec4(worldPos + normalBiasVec, 1.0);
  vec3 proj = sc.xyz / max(sc.w, 1e-4) * 0.5 + 0.5;
  if (proj.x <= 0.003 || proj.x >= 0.997 || proj.y <= 0.003 || proj.y >= 0.997 || proj.z >= 0.999) {
    return 1.0;
  }
  float edgeFade = smoothstep(0.003, 0.035, min(min(proj.x, 1.0 - proj.x), min(proj.y, 1.0 - proj.y)));
  vec2 texSize = max(vec2(textureSize(shadowDepthTex, 0)), vec2(1.0));
  vec2 invTex = 1.0 / texSize;
  vec2 st = proj.xy * texSize - 0.5;
  vec2 baseUv = (floor(st) + 0.5) * invTex;
  vec2 f = fract(st);

  // Separable quadratic B-spline weights (sum == 1.0, C^1 smooth across texel boundaries, zero stipple noise!)
  float wx0 = 0.5 * (1.0 - f.x) * (1.0 - f.x);
  float wx1 = 0.75 - (f.x - 0.5) * (f.x - 0.5);
  float wx2 = 0.5 * f.x * f.x;
  float wy0 = 0.5 * (1.0 - f.y) * (1.0 - f.y);
  float wy1 = 0.75 - (f.y - 0.5) * (f.y - 0.5);
  float wy2 = 0.5 * f.y * f.y;

  float refZ = proj.z - 0.0022;
  float r0 = wx0 * step(refZ, textureLod(shadowDepthTex, baseUv + vec2(-invTex.x, -invTex.y), 0.0).r)
           + wx1 * step(refZ, textureLod(shadowDepthTex, baseUv + vec2(0.0,       -invTex.y), 0.0).r)
           + wx2 * step(refZ, textureLod(shadowDepthTex, baseUv + vec2( invTex.x, -invTex.y), 0.0).r);
  float r1 = wx0 * step(refZ, textureLod(shadowDepthTex, baseUv + vec2(-invTex.x, 0.0), 0.0).r)
           + wx1 * step(refZ, textureLod(shadowDepthTex, baseUv,                        0.0).r)
           + wx2 * step(refZ, textureLod(shadowDepthTex, baseUv + vec2( invTex.x, 0.0), 0.0).r);
  float r2 = wx0 * step(refZ, textureLod(shadowDepthTex, baseUv + vec2(-invTex.x,  invTex.y), 0.0).r)
           + wx1 * step(refZ, textureLod(shadowDepthTex, baseUv + vec2(0.0,        invTex.y), 0.0).r)
           + wx2 * step(refZ, textureLod(shadowDepthTex, baseUv + vec2( invTex.x,  invTex.y), 0.0).r);

  float lit = wy0 * r0 + wy1 * r1 + wy2 * r2;
  return mix(1.0, lit, edgeFade);
}

// Directional Rayleigh + golden/dusk solar Mie aerial perspective haze
vec3 pbrAerialPerspective(vec3 surfaceColor, vec3 worldPos, vec3 camPos, vec3 sunDir, vec3 skyTopCol, vec3 skyHorCol){
  vec3 toFrag = worldPos - camPos;
  float dist = length(toFrag);
  if (dist < 0.5) return surfaceColor;
  vec3 viewDir = toFrag / dist;
  float extinction = 1.0 - exp(-dist * 0.00145);
  vec3 inscatter = pbrSkyRadiance(vec3(viewDir.x, max(0.025, viewDir.y * 0.38 + 0.045), viewDir.z), sunDir, skyTopCol, skyHorCol);
  return mix(surfaceColor, inscatter, extinction);
}

#endif
`;
