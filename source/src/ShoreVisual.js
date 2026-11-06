/* Physically-Based Wet/Dry Golden Quartz Sand, Volumetric Cloud Mirror & Soft Boulder Sun Shadows (ShoreVisual.js).
 * Coordinates air-water reflection handoff with Offshore.js using identical skyEnvMap & Fresnel laws
 * so thinning seawater dissolves onto wet rippled beach sand with ZERO brightness or reflection discontinuity!
 */
const shoreVisualGLSL = `
${terrainGLSL}
${coastalWavesGLSL}
${swashStateGLSL}
${foamWorldGLSL}
${pbrShadingGLSL}

uniform float time, skyEnvReady, rockShadowEnabled;
uniform vec3 sunDirection, skyTop, skyHorizon;
uniform sampler2D skyEnvMap, rockShadowMap, coastalContactMap;
uniform mat4 rockShadowMatrix;

vec3 evaluateBeachSandDirect(vec3 baseSandAlbedo, vec3 world, vec3 normal, float underwaterWeight, float rippleRidge, float swashWaterDepth, float sunShadow){
  float airExposure = (1.0 - smoothstep(0.042, 0.125, swashWaterDepth)) * (1.0 - underwaterWeight);
  float wet = 0.0;
  float film = 0.0;

  // High dry backshore & coastal cliffs (>1.25m above MSL): swash & capillary moisture are identically zero!
  if (world.y < 1.25 && world.z < 36.0) {
    vec4 swash = sampleSwashState(world.xz);
    // Multi-scale porous grain capillary seepage + 3D sand-ripple trough fingering (-rippleRidge):
    // Moisture naturally fingers further landward inside ripple valleys while ripple crests drain first!
    float grainBroad = texture2D(detailMap, world.xz * 0.085 + vec2(1.9, 4.3)).r;
    float grainMacro = texture2D(detailMap, world.xz * 0.24 + vec2(3.1, 0.9)).r;
    float grainFine  = texture2D(detailMap, world.xz * 1.35 + vec2(0.4, 2.7)).r;
    float troughBias = -rippleRidge;
    float seepage = (grainBroad - 0.5) * 0.15 + (grainMacro - 0.5) * 0.11 + (grainFine - 0.5) * 0.06 + troughBias * 0.090;

    float capillaryWet  = smoothstep(-0.038, 0.008, swashWaterDepth + seepage * 0.028);
    float capillaryFilm = smoothstep(-0.014, 0.009, swashWaterDepth + seepage * 0.012 + troughBias * 0.007) * 0.78;

    // Smooth C^2 bicubic moisture field + wide capillary fringe (eliminates polygonal cutoff & dark-chocolate stain!)
    float rawWet = max(swash.r, capillaryWet);
    float fringeMod = smoothstep(0.02, 0.48, rawWet) * (1.0 - smoothstep(0.68, 0.98, rawWet));
    wet = clamp(smoothstep(0.025, 0.94, rawWet + seepage * 1.15 * fringeMod), 0.0, 1.0);

    // Receding water film pools visibly inside 3D sand-ripple troughs while crests drain to satin damp first!
    float baseFilm = max(clamp(swash.g, 0.0, 1.0), capillaryFilm);
    float troughPool = clamp(
      baseFilm + 0.30 * troughBias * smoothstep(0.04, 0.54, baseFilm) * (1.0 - baseFilm * 0.62)
      + (grainFine - 0.5) * 0.06 * baseFilm,
      0.0,
      1.0
    );
    film = troughPool * airExposure;
  }

  vec3 N = normalize(normal);
  vec3 V = normalize(cameraPosition - world);
  vec3 L = normalize(sunDirection);

  float basalRockAO = 1.0;
  if (world.z > -88.0 && world.z < 58.0 && abs(world.x) < 178.0) {
    vec2 contactUv = clamp((world.xz - vec2(-180.0, -90.0)) / vec2(360.0, 150.0), 0.0, 1.0);
    basalRockAO = 1.0 - 0.40 * texture2D(coastalContactMap, contactUv).r;
  }

  // 1. 3-Zone Coastal Quartz Sand Moisture Optics (Lekner & Dorf 1988):
  //    Dry sunlit tan -> soft warm damp capillary fringe -> saturated wet golden-umber under water film!
  float porousDarkW = clamp(pow(wet, 1.18) * 0.82 + film * 0.22, 0.0, 1.0);
  vec3 sandAlbedo = pbrWetPorousAlbedo(baseSandAlbedo, porousDarkW, 0.54);

  // 2. Oren-Nayar rough quartz-grain diffuse + damp capillary GGX microfacet sheen
  float sandRough = mix(0.86, 0.17, clamp(max(wet * 0.64, film * 0.90), 0.0, 1.0));
  vec3 sunE = pbrSunIrradiance(L) * sunShadow;
  vec3 hemiE = pbrHemisphereIrradiance(N, skyTop, skyHorizon) * basalRockAO;

  float diffON = pbrDiffuseOrenNayar(N, V, L, sandRough);
  vec3 dampSpec = pbrSpecularGGX(N, V, L, sandRough, vec3(0.028)) * mix(0.03, 0.74, wet * wet) * (1.0 - film * 0.80) * airExposure;

  vec3 color = (sandAlbedo * diffON + dampSpec) * sunE + (sandAlbedo / PBR_PI) * hemiE * 1.15;

  // 3. Zero-Seam Clearcoat Liquid Water Film reflecting 3D Volumetric Clouds (skyEnvMap) + Solar Glitter!
  if (film > 0.005) {
    vec2 filmMicro = vec2(
      texture2D(detailMap, world.xz * 0.85 + vec2(0.0, time * 0.042)).r - 0.5,
      texture2D(detailMap, world.xz * 0.85 + vec2(4.1, time * 0.052)).r - 0.5
    ) * 0.010 * (1.0 - film * 0.35);
    vec3 flatBeachN = normalize(mix(N, normalize(vec3(0.0, 1.0, -0.066)), smoothstep(0.12, 0.78, film) * 0.74));
    vec3 filmN = normalize(flatBeachN + vec3(filmMicro.x, 0.0, filmMicro.y));
    vec3 R = reflect(-V, filmN);
    R.y = max(R.y, abs(R.y) * 0.25 + 0.012);
    vec3 filmSky = pbrSampleSkyEnv(skyEnvMap, skyEnvReady, R, L, skyTop, skyHorizon) * mix(0.68, 1.0, basalRockAO);
    float fresnelFilm = pbrFresnelScalar(max(dot(filmN, V), 0.001), 0.0204);
    float filmWeight = pow(smoothstep(0.01, 0.78, film), 0.85) * 0.88;
    color = mix(color, filmSky, clamp(fresnelFilm * filmWeight, 0.0, 0.85));
    vec3 filmSunSpec = pbrSpecularGGX(filmN, V, L, 0.062, vec3(0.0204)) * sunE * filmWeight;
    color += filmSunSpec;
  }

  return color;
}

vec3 evaluateBeachSand(vec3 baseSandAlbedo, vec3 world, vec3 normal, float underwaterWeight, float rippleRidge, float extraWaveH){
  float bed = sampleBathymetry(world.xz).r;
  float hydroX = bed > -5.3 ? evaluateCoastalHydro(world.xz, time, amplitude).x : 0.0;
  float sunShadow = pbrEvaluateSunShadow(
    rockShadowMap,
    rockShadowMatrix,
    rockShadowEnabled,
    world,
    vec3(0.0, 0.035, 0.0),
    gl_FragCoord.xy
  );
  return evaluateBeachSandDirect(baseSandAlbedo, world, normal, underwaterWeight, rippleRidge, extraWaveH + hydroX - bed, sunShadow);
}

vec3 evaluateBeachSand(vec3 baseSandAlbedo, vec3 world, vec3 normal, float underwaterWeight, float rippleRidge){
  return evaluateBeachSand(baseSandAlbedo, world, normal, underwaterWeight, rippleRidge, 0.0);
}

vec3 shoreDebugColor(vec3 world, float naturalWeight){
  vec4 s = sampleSwashState(world.xz);
  return vec3(s.r, s.g, s.b);
}
`;
