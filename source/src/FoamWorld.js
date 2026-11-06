/* Fine, organic multi-scale ocean froth, turbulent filaments & cellular bubble lace.
 * Uses fine natural world scales (10cm-35cm bubbles, NOT 1.5m polygon tiles!) eroded by
 * multi-octave organic cluster masks so clear turquoise water shines through between foam webs.
 */
const foamWorldGLSL = `
uniform float foamWorldDetail, foamFilamentMode, foamTransport, foamTransportMix, foamBoost;
uniform sampler2D foamMaterialMap;

vec4 foamOffsetSample(sampler2D field, vec2 p){
  vec2 g = fract(p / 240.0) * 64.0 - 0.5, i = floor(g), f = fract(g);
  vec4 a = texture2D(field, (i + 0.5) / 64.0);
  vec4 b = texture2D(field, (i + vec2(1.5, 0.5)) / 64.0);
  vec4 c = texture2D(field, (i + vec2(0.5, 1.5)) / 64.0);
  vec4 d = texture2D(field, (i + 1.5) / 64.0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec2 foamWetCoordinates(vec2 p){
  vec4 offsets = foamOffsetSample(foamMaterialMap, p);
  return p + mix(offsets.ba, offsets.rg, foamTransportMix) * foamTransport;
}

vec2 foamHash2(vec2 p){
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

// Fine-scale cellular bubble web (~18-30cm cells) with derivative anti-aliasing
float voronoiBubbleWeb(vec2 p, float thickness){
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = foamHash2(n + g);
      vec2 r = g + (0.12 + 0.76 * o) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  float border = sqrt(d2) - sqrt(d1);
  float aa = max(length(fwidth(p)) * 0.9, 0.02);
  return 1.0 - smoothstep(thickness, thickness + aa, border);
}

// Returns vec3(rollerMask, laceWebMask, microBubbleDetail)
vec3 evaluateFoamStructure(vec2 p, float timeVal){
  float pxSize = max(length(dFdx(p)), length(dFdy(p)));
  float fineVis = 1.0 - smoothstep(0.05, 0.28, pxSize);
  float medVis = 1.0 - smoothstep(0.14, 0.75, pxSize);

  // Turbulent domain warp at two scales so foam forms wispy streaks & arcs rather than regular grids
  vec2 warp1 = vec2(
    texture2D(detailMap, p * 0.065 + vec2(0.0, -timeVal * 0.014)).r - 0.5,
    texture2D(detailMap, p * 0.065 + vec2(3.7, timeVal * 0.011)).r - 0.5
  ) * 1.65;
  vec2 warp2 = vec2(
    texture2D(detailMap, p * 0.29 - vec2(timeVal * 0.018, 1.3)).r - 0.5,
    texture2D(detailMap, p * 0.29 + vec2(2.1, -timeVal * 0.016)).r - 0.5
  ) * 0.42;
  vec2 q = p + warp1 + warp2;

  // Multi-octave organic foam cluster masks baked in detailMap.gba
  vec4 macroCluster = texture2D(detailMap, q * 0.055);
  vec4 medCluster = texture2D(detailMap, (q * mat2(0.8, -0.6, 0.6, 0.8)) * 0.19);
  vec4 fineCluster = texture2D(detailMap, (q * mat2(0.6, 0.8, -0.8, 0.6)) * 0.62);

  // Fine bubble webs (~30cm & ~11cm cells, fading cleanly into organic froth at distance)
  vec2 flowStretch = vec2(q.x * 1.18, q.y * 0.76);
  float webMed = voronoiBubbleWeb(flowStretch * 2.85, 0.12);
  float webFine = voronoiBubbleWeb((flowStretch * mat2(0.86, 0.5, -0.5, 0.86)) * 6.8 + warp2 * 2.0, 0.15);

  float patchErosion = smoothstep(0.24, 0.76, macroCluster.g * 0.62 + medCluster.a * 0.48);
  float microPores = mix(0.68, fineCluster.b * medCluster.b * 1.35, medVis);

  float cellular = mix(0.42, webMed, medVis) * 0.62 + mix(0.32, webFine, fineVis) * 0.48;
  float rollerTex = clamp((0.55 + 0.55 * medCluster.g) * (0.65 + 0.45 * fineCluster.b), 0.0, 1.0);
  // Eroded wispy lace: clear water holes between frothy filaments!
  float laceTex = clamp(cellular * patchErosion * (0.45 + 0.85 * medCluster.g), 0.0, 1.0);

  return vec3(rollerTex, laceTex, clamp(microPores, 0.0, 1.0));
}

vec3 shadeCoastalFoam(vec3 waterColor, float coreCoverage, float laceCoverage, float microDetail, vec3 N, vec3 L, vec3 V){
  float core = clamp(coreCoverage, 0.0, 1.0);
  float lace = clamp(laceCoverage, 0.0, 1.0);

  vec3 foamN = normalize(N + vec3(0.0, 0.38, 0.22) * core);
  float nl = max(dot(foamN, L), 0.0);
  float wrapLight = 0.56 + 0.44 * clamp(dot(foamN, L) * 0.65 + 0.35, 0.0, 1.0);

  // Translucent frothy lace picks up turquoise subsurface water tint; active roller lip is crisp sunlit white
  vec3 laceAlbedo = mix(vec3(0.70, 0.84, 0.85), vec3(0.93, 0.96, 0.97), microDetail) * (0.76 + 0.32 * nl);
  vec3 coreAlbedo = mix(vec3(0.82, 0.90, 0.92), vec3(0.98, 0.985, 0.98), wrapLight) * (0.88 + 0.42 * nl);

  vec3 withLace = mix(waterColor, laceAlbedo, lace * 0.78);
  return mix(withLace, coreAlbedo, core);
}

float foamWorldShape(vec2 p){
  vec4 d = texture2D(detailMap, p * 0.22);
  return clamp(0.45 + 0.75 * d.g * d.b, 0.0, 1.0);
}
float foamWorldDiagnostic(vec2 p, float mode){ return foamWorldShape(p); }
`;
