/* Shared coastal terrain with smooth offshore bathymetric deepening beyond s < 0
 * so Beer-Lambert optics naturally transition from shallow turquoise to deep sapphire blue. */
let sharedTerrain;
const terrainPixels = new Float32Array(240 * 4);
const terrainTexture = new THREE.DataTexture(terrainPixels, 240, 1, THREE.RGBAFormat, THREE.FloatType);
terrainTexture.minFilter = terrainTexture.magFilter = THREE.NearestFilter;
terrainTexture.wrapS = terrainTexture.wrapT = THREE.ClampToEdgeWrapping;
const terrainUniforms = { terrainProfile: { value: terrainTexture } };

function selectBakedTerrain(kind) {
  sharedTerrain = ShoreTerrain.create(prebakedTerrain[kind]);
  for (let i = 0; i < 240; i++) {
    terrainPixels[4 * i] = sharedTerrain.profile[i];
    terrainPixels[4 * i + 1] = Math.max(0, -sharedTerrain.profile[i]);
    terrainPixels[4 * i + 2] = 0;
    terrainPixels[4 * i + 3] = 1;
  }
  terrainTexture.needsUpdate = true;
}
selectBakedTerrain('baseline');

function shoreBedWithOffshoreSlope(x, z) {
  const s = sharedTerrain.coordinate(x, z);
  const clamped = Math.max(0.25, Math.min(119.75, s));
  const f = clamped / 0.5 - 0.5;
  const i1 = Math.max(0, Math.min(239, Math.floor(f)));
  const t = Math.max(0, Math.min(1, f - i1));
  const i0 = Math.max(0, i1 - 1);
  const i2 = Math.min(239, i1 + 1);
  const i3 = Math.min(239, i1 + 2);
  const p0 = terrainPixels[4 * i0];
  const p1 = terrainPixels[4 * i1];
  const p2 = terrainPixels[4 * i2];
  const p3 = terrainPixels[4 * i3];
  // C1-continuous Catmull-Rom cubic interpolation eliminates piecewise-linear slope creases
  let base = 0.5 * (
    2.0 * p1 +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t * t * t
  );
  if (s < 0.25) {
    // Smooth C1 deepening beyond s < 0.25 down to ~-15m for authentic deep-blue Beer-Lambert optics
    const u = 0.25 - s;
    base -= 0.04 * u + (0.055 * u * u) / (15.0 + u);
  } else if (s > 119.75) {
    base += 0.04 * (s - 119.75);
  }
  return base;
}

const terrainGLSL = `
#ifndef SHARED_TERRAIN_FIELD
#define SHARED_TERRAIN_FIELD
uniform highp sampler2D terrainProfile;
float sharedTerrainCoordinate(vec2 p){
  return p.y - (15.0 + 3.0 * sin(p.x * 0.035) + 1.1 * sin(p.x * 0.11) - 2.0 * sin(p.x * 0.07)) + 50.0;
}
float sharedTerrainBed(vec2 p){
  float s = sharedTerrainCoordinate(p);
  float clamped = clamp(s, 0.25, 119.75);
  float f = clamped / 0.5 - 0.5;
  float i1 = clamp(floor(f), 0.0, 239.0);
  float t = clamp(f - i1, 0.0, 1.0);
  float i0 = max(0.0, i1 - 1.0);
  float i2 = min(239.0, i1 + 1.0);
  float i3 = min(239.0, i1 + 2.0);
  float p0 = textureLod(terrainProfile, vec2((i0 + 0.5) / 240.0, 0.5), 0.0).r;
  float p1 = textureLod(terrainProfile, vec2((i1 + 0.5) / 240.0, 0.5), 0.0).r;
  float p2 = textureLod(terrainProfile, vec2((i2 + 0.5) / 240.0, 0.5), 0.0).r;
  float p3 = textureLod(terrainProfile, vec2((i3 + 0.5) / 240.0, 0.5), 0.0).r;
  float base = 0.5 * (
    2.0 * p1 +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t * t * t
  );
  if (s < 0.25) {
    float u = 0.25 - s;
    base -= 0.04 * u + (0.055 * u * u) / (15.0 + u);
  } else if (s > 119.75) {
    base += 0.04 * (s - 119.75);
  }
  return base;
}
#endif
`;
