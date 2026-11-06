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

vec3 evaluateBeachSand(vec3 baseSandAlbedo, vec3 world, vec3 normal, float underwaterWeight, float rippleRidge){
  vec4 swash = sampleSwashState(world.xz);
  vec4 bathy = sampleBathymetry(world.xz);
  float bed = bathy.r;

  // Evaluate local water column depth so submerged sand doesn't double-reflect the sky!
  vec4 hydro = evaluateCoastalHydro(world.xz, time, amplitude);
  float swashWaterDepth = hydro.x - bed;
  float airExposure = (1.0 - smoothstep(0.038, 0.112, swashWaterDepth)) * (1.0 - underwaterWeight);

  // Porous grain-level capillary seepage softens both the waterline capillary fringe & upper wet-sand margin
  float grainMacro = texture2D(detailMap, world.xz * 0.22 + vec2(3.1, 0.9)).r;
  float grainFine  = texture2D(detailMap, world.xz * 1.35 + vec2(0.4, 2.7)).r;
  float seepage = (grainMacro - 0.5) * 0.18 + (grainFine - 0.5) * 0.09 - rippleRidge * 0.06;

  float capillaryWet  = smoothstep(-0.045, 0.006, swashWaterDepth + seepage * 0.028);
  float capillaryFilm = smoothstep(-0.024, 0.008, swashWaterDepth + seepage * 0.016 - rippleRidge * 0.007) * 0.80;

  float rawWet = max(swash.r, capillaryWet);
  float wet = smoothstep(0.05, 0.86, rawWet + seepage * smoothstep(0.02, 0.38, rawWet) * (1.0 - smoothstep(0.72, 0.98, rawWet)));

  // Receding water film pools visibly inside 3D sand-ripple troughs (-rippleRidge) while crests drain to satin damp first!
  float baseFilm = max(clamp(swash.g, 0.0, 1.0), capillaryFilm);
  float troughPool = clamp(
    baseFilm + 0.32 * (-rippleRidge) * smoothstep(0.05, 0.55, baseFilm) * (1.0 - baseFilm * 0.65)
    + (grainFine - 0.5) * 0.07 * baseFilm,
    0.0,
    1.0
  );
  float film = troughPool * airExposure;

  vec3 N = normalize(normal);
  vec3 V = normalize(cameraPosition - world);
  vec3 L = normalize(sunDirection);

  // Soft 2048x2048 directional sun shadow + basal rock contact ambient occlusion!
  float sunShadow = pbrEvaluateSunShadow(
    rockShadowMap,
    rockShadowMatrix,
    rockShadowEnabled,
    world,
    vec3(0.0, 0.035, 0.0),
    gl_FragCoord.xy
  );
  vec2 contactUv = clamp((world.xz - vec2(-180.0, -90.0)) / vec2(360.0, 150.0), 0.0, 1.0);
  float basalRockAO = 1.0 - 0.42 * texture2D(coastalContactMap, contactUv).r;

  // 1. Lekner & Dorf (1988) internal pore reflection darkening + rich golden-amber chroma enrichment!
  vec3 sandAlbedo = pbrWetPorousAlbedo(baseSandAlbedo, smoothstep(0.02, 0.78, wet), 0.42);

  // 2. Oren-Nayar rough quartz-grain diffuse + damp capillary GGX microfacet sheen
  float sandRough = mix(0.85, 0.16, max(wet * 0.70, film * 0.88));
  vec3 sunE = pbrSunIrradiance(L) * sunShadow;
  vec3 hemiE = pbrHemisphereIrradiance(N, skyTop, skyHorizon) * basalRockAO;

  float diffON = pbrDiffuseOrenNayar(N, V, L, sandRough);
  vec3 dampSpec = pbrSpecularGGX(N, V, L, sandRough, vec3(0.030)) * mix(0.04, 0.78, wet) * (1.0 - film * 0.78) * airExposure;

  vec3 color = (sandAlbedo * diffON + dampSpec) * sunE + (sandAlbedo / PBR_PI) * hemiE * 1.15;

  // 3. Zero-Seam Clearcoat Liquid Water Film reflecting 3D Volumetric Clouds (skyEnvMap) + Solar Glitter!
  if (film > 0.005) {
    vec2 filmMicro = vec2(
      texture2D(detailMap, world.xz * 0.85 + vec2(0.0, time * 0.042)).r - 0.5,
      texture2D(detailMap, world.xz * 0.85 + vec2(4.1, time * 0.052)).r - 0.5
    ) * 0.011 * (1.0 - film * 0.35);
    vec3 flatBeachN = normalize(mix(N, normalize(vec3(0.0, 1.0, -0.066)), smoothstep(0.14, 0.80, film) * 0.72));
    vec3 filmN = normalize(flatBeachN + vec3(filmMicro.x, 0.0, filmMicro.y));
    vec3 R = reflect(-V, filmN);
    R.y = max(R.y, abs(R.y) * 0.25 + 0.012);
    vec3 filmSky = pbrSampleSkyEnv(skyEnvMap, skyEnvReady, R, L, skyTop, skyHorizon) * mix(0.68, 1.0, basalRockAO);
    float fresnelFilm = pbrFresnelScalar(max(dot(filmN, V), 0.001), 0.0204);
    float filmWeight = smoothstep(0.02, 0.44, film) * 0.92;
    color = mix(color, filmSky, clamp(fresnelFilm * filmWeight, 0.0, 0.86));
    vec3 filmSunSpec = pbrSpecularGGX(filmN, V, L, 0.062, vec3(0.0204)) * sunE * filmWeight;
    color += filmSunSpec;
  }

  return color;
}

vec3 shoreDebugColor(vec3 world, float naturalWeight){
  vec4 s = sampleSwashState(world.xz);
  return vec3(s.r, s.g, s.b);
}
`;
