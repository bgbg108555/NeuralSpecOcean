/* Unified Coastal Bathymetry, Eikonal Wave Travel-Time & Rock Obstacle Field.
 * Inspired by Three.js Water Pro v4's terrain-driven coastal pipeline:
 *   R = terrain bed elevation (m, negative = underwater, positive = beach)
 *   G = 2D refracted wave travel time tau(x, z) from z = -90m to z (seconds)
 *   B = smooth coastal rock obstacle proximity (0 = open water, 1 = rock surface)
 *   A = leeward (+z) rock wake & lateral shear wrap field (0..1)
 */
const BATHY_W = 512;
const BATHY_H = 256;
const BATHY_XMIN = -180.0;
const BATHY_XMAX = 180.0;
const BATHY_ZMIN = -90.0;
const BATHY_ZMAX = 60.0;

export function createBathymetryField(THREE, bedFn, rockRecords = [], floatLinearSupported = true) {
  const data = new Float32Array(BATHY_W * BATHY_H * 4);
  const useHalfFloat = !floatLinearSupported && !!THREE.DataUtils?.toHalfFloat;
  const gpuHalfData = useHalfFloat ? new Uint16Array(BATHY_W * BATHY_H * 4) : null;
  const tauRow = new Float64Array(BATHY_W);
  const tauNext = new Float64Array(BATHY_W);
  const dx = (BATHY_XMAX - BATHY_XMIN) / BATHY_W;
  const dz = (BATHY_ZMAX - BATHY_ZMIN) / BATHY_H;

  const texture = new THREE.DataTexture(
    useHalfFloat ? gpuHalfData : data,
    BATHY_W,
    BATHY_H,
    THREE.RGBAFormat,
    useHalfFloat ? THREE.HalfFloatType : THREE.FloatType
  );
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  function celerity(depth) {
    // Smooth shallow-to-intermediate dispersion speed c(d):
    // ~4.5 m/s offshore -> ~1.75 m/s in shallow surf -> ~2.05 m/s bore run-up speed on beach
    if (depth <= 0.06) return 1.85;
    const d = Math.max(0.08, Math.min(depth, 3.2));
    const kRef = 0.34;
    const cDisp = Math.sqrt((9.81 * Math.tanh(kRef * d)) / kRef);
    return Math.max(1.65, Math.min(4.65, cDisp));
  }

  const scratchBA = new Float32Array(BATHY_W * BATHY_H * 2);

  function smoothRockFields() {
    // 3 separable [0.25, 0.5, 0.25] binomial smoothing passes on B (rockProx) & A (rockWake)
    // so spatial derivatives, meniscus normals, and refracted travel-time tau have zero grid-step artifacts.
    for (let pass = 0; pass < 3; pass++) {
      for (let j = 0; j < BATHY_H; j++) {
        const row = j * BATHY_W;
        for (let i = 0; i < BATHY_W; i++) {
          const im = Math.max(0, i - 1), ip = Math.min(BATHY_W - 1, i + 1);
          const a0 = (row + im) * 4, a1 = (row + i) * 4, a2 = (row + ip) * 4;
          const dst = (row + i) * 2;
          scratchBA[dst] = 0.25 * data[a0 + 2] + 0.5 * data[a1 + 2] + 0.25 * data[a2 + 2];
          scratchBA[dst + 1] = 0.25 * data[a0 + 3] + 0.5 * data[a1 + 3] + 0.25 * data[a2 + 3];
        }
      }
      for (let j = 0; j < BATHY_H; j++) {
        const jm = Math.max(0, j - 1), jp = Math.min(BATHY_H - 1, j + 1);
        for (let i = 0; i < BATHY_W; i++) {
          const b0 = (jm * BATHY_W + i) * 2, b1 = (j * BATHY_W + i) * 2, b2 = (jp * BATHY_W + i) * 2;
          const dst = (j * BATHY_W + i) * 4;
          data[dst + 2] = 0.25 * scratchBA[b0] + 0.5 * scratchBA[b1] + 0.25 * scratchBA[b2];
          data[dst + 3] = 0.25 * scratchBA[b0 + 1] + 0.5 * scratchBA[b1 + 1] + 0.25 * scratchBA[b2 + 1];
        }
      }
    }
  }

  function rebake(records = rockRecords) {
    data.fill(0);
    // 1. Bake exact terrain bed into R
    for (let j = 0; j < BATHY_H; j++) {
      const z = BATHY_ZMIN + (j + 0.5) * dz;
      for (let i = 0; i < BATHY_W; i++) {
        const x = BATHY_XMIN + (i + 0.5) * dx;
        data[(j * BATHY_W + i) * 4] = bedFn(x, z);
      }
    }

    // 2. Splat sculpted 3D coastal rock hulls (those intersecting water/swash, support < 0.58m) into B & A
    const INV_TWO_PI = 1.0 / (2.0 * Math.PI);
    for (const r of records) {
      if (r.support > 0.58 || r.topY < -1.45) continue;
      const wetFactor = Math.max(0, Math.min(1, (0.58 - r.support) / 0.48)) * Math.max(0.25, Math.min(1, (r.topY + 0.35) / 0.55));
      if (wetFactor <= 0.01) continue;
      const rx = Math.max(0.42, r.sx * 0.94);
      const rz = Math.max(0.42, r.sz * 0.94);
      const hull = r.hullRadii;
      const hullN = hull ? hull.length : 0;
      const maxHullR = r.maxHullR || Math.max(rx, rz);
      const co = Math.cos(r.rot || 0), si = Math.sin(r.rot || 0);
      const reach = 3.3 + 0.58 * maxHullR;
      const wakeLen = 3.2 + 3.4 * Math.min(1.65, maxHullR);

      const iMin = Math.max(0, Math.floor((r.x - maxHullR - reach - BATHY_XMIN) / dx));
      const iMax = Math.min(BATHY_W - 1, Math.ceil((r.x + maxHullR + reach - BATHY_XMIN) / dx));
      const jMin = Math.max(0, Math.floor((r.z - maxHullR - reach - BATHY_ZMIN) / dz));
      const jMax = Math.min(BATHY_H - 1, Math.ceil((r.z + maxHullR + wakeLen - BATHY_ZMIN) / dz));

      const meanR = Math.sqrt(rx * rz);
      const proxRange = 2.45 + 0.44 * meanR;
      for (let j = jMin; j <= jMax; j++) {
        const z = BATHY_ZMIN + (j + 0.5) * dz;
        const dzw = z - r.z;
        for (let i = iMin; i <= iMax; i++) {
          const x = BATHY_XMIN + (i + 0.5) * dx;
          const dxw = x - r.x;
          let distMeters, ell;
          if (hullN > 0) {
            const rad = Math.hypot(dxw, dzw);
            const ang01 = (Math.atan2(dzw, dxw) + Math.PI) * INV_TWO_PI;
            const secF = (ang01 - Math.floor(ang01)) * hullN;
            const s0 = secF | 0;
            const s1 = (s0 + 1) % hullN;
            const sf = secF - s0;
            const rHull = Math.max(0.24, hull[s0] + (hull[s1] - hull[s0]) * sf);
            distMeters = Math.max(0, rad - rHull);
            ell = rad / rHull;
          } else {
            const u = dxw * co + dzw * si;
            const v = -dxw * si + dzw * co;
            ell = Math.hypot(u / rx, v / rz);
            distMeters = Math.max(0, (ell - 1.0) * meanR);
          }
          if (distMeters < proxRange) {
            let q = 1.0 - distMeters / proxRange;
            q = q * q * (3 - 2 * q) * wetFactor;
            const idx = (j * BATHY_W + i) * 4;
            if (q > data[idx + 2]) data[idx + 2] = q;
          }
          // Leeward (+z) V-wake & wrap-around shear lobes behind sculpted rock
          if (dzw > -0.3 * rz && dzw < wakeLen) {
            const along = Math.max(0, (dzw + 0.3 * rz) / wakeLen);
            const spread = rx * (0.85 + 1.35 * along);
            const sideNorm = Math.abs(dxw) / Math.max(0.35, spread);
            const lobe = Math.exp(-Math.pow((sideNorm - 0.58) / 0.48, 2));
            const core = Math.exp(-sideNorm * sideNorm * 1.6) * 0.55;
            const wake = Math.max(lobe, core) * (1 - along) * (1 - along * 0.35) * wetFactor * (ell > 0.82 ? 1.0 : ell);
            const idx = (j * BATHY_W + i) * 4;
            if (wake > data[idx + 3]) data[idx + 3] = Math.min(1, wake);
          }
        }
      }
    }

    smoothRockFields();

    // 3. March 2D refracted wave travel time tau(x, z) from offshore (j=0) shoreward (+z)
    tauRow.fill(0);
    for (let i = 0; i < BATHY_W; i++) {
      data[i * 4 + 1] = 0;
    }
    for (let j = 1; j < BATHY_H; j++) {
      for (let i = 0; i < BATHY_W; i++) {
        const idx = (j * BATHY_W + i) * 4;
        const bed = data[idx];
        const rockProx = data[idx + 2];
        const depth = Math.max(0, -bed);
        // Waves slow down slightly around shallow sculpted rock reefs, refracting naturally around boulders
        const rockSlow = 1.0 - 0.22 * rockProx;
        const speed = celerity(depth) * rockSlow;
        tauNext[i] = tauRow[i] + dz / speed;
      }
      // Lateral Huygens smoothing so wave fronts bend smoothly without caustics cusps
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < BATHY_W; i++) {
          const im = Math.max(0, i - 1), ip = Math.min(BATHY_W - 1, i + 1);
          tauRow[i] = 0.68 * tauNext[i] + 0.16 * (tauNext[im] + tauNext[ip]);
        }
        tauNext.set(tauRow);
      }
      for (let i = 0; i < BATHY_W; i++) {
        data[(j * BATHY_W + i) * 4 + 1] = tauRow[i];
      }
    }

    if (useHalfFloat) {
      const toHalf = THREE.DataUtils.toHalfFloat;
      for (let k = 0, n = data.length; k < n; k++) {
        gpuHalfData[k] = toHalf(data[k]);
      }
    }
    texture.needsUpdate = true;
  }

  function sample(x, z) {
    const fx = Math.max(0, Math.min(BATHY_W - 1.0001, ((x - BATHY_XMIN) / (BATHY_XMAX - BATHY_XMIN)) * BATHY_W - 0.5));
    const fz = Math.max(0, Math.min(BATHY_H - 1.0001, ((z - BATHY_ZMIN) / (BATHY_ZMAX - BATHY_ZMIN)) * BATHY_H - 0.5));
    const i0 = Math.floor(fx), j0 = Math.floor(fz);
    const i1 = Math.min(BATHY_W - 1, i0 + 1), j1 = Math.min(BATHY_H - 1, j0 + 1);
    const u = fx - i0, v = fz - j0;
    const a = (j0 * BATHY_W + i0) * 4, b = (j0 * BATHY_W + i1) * 4;
    const c = (j1 * BATHY_W + i0) * 4, d = (j1 * BATHY_W + i1) * 4;
    const lerpChannel = k =>
      (data[a + k] * (1 - u) + data[b + k] * u) * (1 - v) +
      (data[c + k] * (1 - u) + data[d + k] * u) * v;
    return {
      bed: bedFn(x, z),
      tau: lerpChannel(1),
      rockProx: lerpChannel(2),
      rockWake: lerpChannel(3)
    };
  }

  rebake(rockRecords);

  return {
    texture,
    rebake,
    sample,
    dispose() {
      texture.dispose();
    }
  };
}

export const bathymetryGLSL = `
#ifndef COASTAL_BATHYMETRY_GLSL
#define COASTAL_BATHYMETRY_GLSL
uniform highp sampler2D bathymetryMap;
vec4 sampleBathymetry(vec2 p){
  float exactBed=sharedTerrainBed(p);
  float fallbackTau=clamp((p.y+90.)/4.2,0.,42.);
  if(abs(p.x)>=180.||p.y<=-90.||p.y>=60.)return vec4(exactBed,fallbackTau,0.,0.);
  vec2 uv=clamp((p-vec2(-180.,-90.))/vec2(360.,150.),0.,1.);
  vec4 s=textureLod(bathymetryMap,uv,0.);
  float inside=smoothstep(-180.,-166.,p.x)*(1.-smoothstep(166.,180.,p.x))*smoothstep(-90.,-76.,p.y)*(1.-smoothstep(52.,60.,p.y));
  return vec4(exactBed,mix(fallbackTau,s.g,inside),s.b*inside,s.a*inside);
}
#endif
`;
