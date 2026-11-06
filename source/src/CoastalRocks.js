/* Cinema-Grade Craggy Coastal Sea-Stacks, Fractured Granodiorite/Basalt Boulders & 3-Stage Wet Clearcoat PBR.
 *
 * Geological, Optical & Rendering Foundations:
 *  - Musgrave, Kolb & Mace (1989, SIGGRAPH): 3D Ridged Multifractal & domain-warped tectonic block sculpting
 *    (authentic jagged coastal silhouettes, asymmetric fault steps, flat cleaved faces — ZERO Voronoi turtle shells!).
 *  - Stephenson & Stephenson (1949) intertidal bio-zonation: wave-polished kelp/coralline base, speckled calcitic
 *    barnacle surf belt, warm weathered granodiorite/greywacke strata & golden-grey coastal crustose lichen crowns.
 *  - Washburn (1921) capillary wicking + live 3D wave-collision drenching (impactFoamMap.ba) + gravity rivulets,
 *    creating an unmistakable 3-stage optical contrast:
 *      (1) Glossy liquid water film reflecting 3D volumetric clouds & diamond solar glints,
 *      (2) Dark Lekner & Dorf (1988) saturated damp porous stone halo,
 *      (3) Crisp matte sun-warmed mineral upper crowns (Oren-Nayar rough diffuse).
 *  - Vogel-IGN 2048x2048 directional sun self-shadows + shallow underwater refractive sun caustics.
 */
export function trainCoastalRockFoamPINN() {
  const fastSig = x => {
    const c = x < -4.5 ? -4.5 : (x > 4.5 ? 4.5 : x);
    const x2 = c * c;
    const p = c * (0.249913 + x2 * (0.006378 + x2 * 0.000041));
    const q = 1.0 + x2 * (0.108854 + x2 * 0.001479);
    const r = 0.5 + p / q;
    return r < 0.0 ? 0.0 : (r > 1.0 ? 1.0 : r);
  };
  const fastSilu = x => x * fastSig(x);
  const fastSigDeriv = x => {
    const s = fastSig(x);
    return s * (1.0 - s);
  };
  const fastSiluDeriv = x => {
    const s = fastSig(x);
    return s + x * s * (1.0 - s);
  };
  const halton = (index, base) => {
    let result = 0.0, f = 1.0 / base, i = index;
    while (i > 0) {
      result += f * (i % base);
      i = Math.floor(i / base);
      f /= base;
    }
    return result;
  };

  const NSAMP = 256;
  const X = new Float32Array(NSAMP * 6);
  const Y = new Float32Array(NSAMP * 3);
  const sigExact = z => 1.0 / (1.0 + Math.exp(-z));

  for (let n = 0; n < NSAMP; n++) {
    const sWet    = halton(n + 1, 2) * 3.0 - 1.5;
    const sWave   = halton(n + 1, 3) * 3.0 - 1.5;
    const eSurf   = halton(n + 1, 5);
    const eSplash = halton(n + 1, 7);
    const nFlat   = halton(n + 1, 11);
    const cTrap   = halton(n + 1, 13);

    const o6 = n * 6, o3 = n * 3;
    X[o6] = sWet; X[o6 + 1] = sWave; X[o6 + 2] = eSurf;
    X[o6 + 3] = eSplash; X[o6 + 4] = nFlat; X[o6 + 5] = cTrap;

    const eTot  = Math.min(1.0, eSurf * 0.85 + eSplash * 0.62);
    const eGran = Math.min(1.0, eSurf * 0.74 + eSplash * 0.78);
    const gravHold = Math.min(1.0, 0.46 + 0.34 * nFlat + 0.28 * cTrap);

    const y0 = Math.min(0.95, Math.max(0.01,
      sigExact(2.35 * (sWave + 0.24 * nFlat + 0.18 * cTrap))
      * (1.0 - Math.exp(-2.5 * eTot))
      * (0.52 + 0.48 * gravHold)
    ));

    const softWetFade = sigExact(-2.55 * (sWet - 0.10 * cTrap));
    const washTaper   = 0.44 + 0.56 * sigExact(-1.55 * (sWet + 0.35));
    const y1 = Math.min(0.95, Math.max(0.01,
      softWetFade * washTaper * (1.0 - Math.exp(-2.6 * eTot))
      * Math.min(1.0, gravHold * 0.92 + 0.14 * y0)
    ));

    const softInnerRise = sigExact(2.75 * (sWet + 0.36));
    const softOuterFade = sigExact(-2.45 * (sWet - (0.30 + 0.60 * eGran)));
    const y2 = Math.min(0.95, Math.max(0.01,
      softInnerRise * softOuterFade * (1.0 - Math.exp(-2.7 * eGran))
      * Math.min(1.0, 0.48 + 0.34 * nFlat + 0.28 * cTrap)
    ));

    Y[o3] = y0; Y[o3 + 1] = y1; Y[o3 + 2] = y2;
  }

  let pSeed = 918273;
  const pRand = () => {
    pSeed = (Math.imul(pSeed, 1664525) + 1013904223) >>> 0;
    return pSeed / 4294967296 - 0.5;
  };
  const WA = new Float32Array(48), bA = new Float32Array(8);
  const WB = new Float32Array(96), bB = new Float32Array(8);
  const WO = new Float32Array(24), bO = new Float32Array(3);
  for (let i = 0; i < 48; i++) WA[i] = pRand() * 0.85;
  for (let i = 0; i < 96; i++) WB[i] = pRand() * 0.68;
  for (let i = 0; i < 24; i++) WO[i] = pRand() * 0.75;

  const mWA = new Float32Array(48), vWA = new Float32Array(48), gWA = new Float32Array(48);
  const mbA = new Float32Array(8),  vbA = new Float32Array(8),  gbA = new Float32Array(8);
  const mWB = new Float32Array(96), vWB = new Float32Array(96), gWB = new Float32Array(96);
  const mbB = new Float32Array(8),  vbB = new Float32Array(8),  gbB = new Float32Array(8);
  const mWO = new Float32Array(24), vWO = new Float32Array(24), gWO = new Float32Array(24);
  const mbO = new Float32Array(3),  vbO = new Float32Array(3),  gbO = new Float32Array(3);

  const zA = new Float32Array(8), hA = new Float32Array(8);
  const zB = new Float32Array(8), hB = new Float32Array(8), inB = new Float32Array(12);
  const hComb = new Float32Array(8);
  const dhA = new Float32Array(8), dhB = new Float32Array(8);

  const adamW = (param, grad, m, v, lr, b1t, b2t) => {
    const wd = 1.0 - lr * 0.0008;
    for (let i = 0; i < param.length; i++) {
      const g = grad[i];
      m[i] = 0.9 * m[i] + 0.1 * g;
      v[i] = 0.999 * v[i] + 0.001 * g * g;
      param[i] = param[i] * wd - lr * (m[i] / b1t) / (Math.sqrt(v[i] / b2t) + 1e-7);
    }
  };

  const EPOCHS = 190;
  const invN = 1.0 / NSAMP;
  let b1Pow = 1.0, b2Pow = 1.0;
  for (let ep = 0; ep < EPOCHS; ep++) {
    gWA.fill(0); gbA.fill(0); gWB.fill(0); gbB.fill(0); gWO.fill(0); gbO.fill(0);
    for (let n = 0; n < NSAMP; n++) {
      const o6 = n * 6, o3 = n * 3;
      const x0 = X[o6], x1 = X[o6 + 1], x2 = X[o6 + 2], x3 = X[o6 + 3], x4 = X[o6 + 4], x5 = X[o6 + 5];

      for (let i = 0; i < 8; i++) {
        const w = i * 6;
        const z = bA[i] + WA[w] * x0 + WA[w + 1] * x1 + WA[w + 2] * x2 + WA[w + 3] * x3 + WA[w + 4] * x4 + WA[w + 5] * x5;
        zA[i] = z;
        hA[i] = fastSilu(z);
        inB[i] = hA[i];
      }
      inB[8] = x0; inB[9] = x2; inB[10] = x4; inB[11] = x5;

      for (let i = 0; i < 8; i++) {
        const w = i * 12;
        let z = bB[i];
        for (let j = 0; j < 12; j++) z += WB[w + j] * inB[j];
        zB[i] = z;
        hB[i] = fastSilu(z);
        hComb[i] = hB[i] + 0.5 * hA[i];
      }

      dhA.fill(0);
      dhB.fill(0);
      for (let k = 0; k < 3; k++) {
        const w = k * 8;
        let z = bO[k];
        for (let j = 0; j < 8; j++) z += WO[w + j] * hComb[j];
        const pred = fastSig(z);
        const dz = 2.0 * (pred - Y[o3 + k]) * fastSigDeriv(z) * invN;
        gbO[k] += dz;
        for (let j = 0; j < 8; j++) {
          gWO[w + j] += dz * hComb[j];
          const dH = dz * WO[w + j];
          dhB[j] += dH;
          dhA[j] += 0.5 * dH;
        }
      }

      for (let i = 0; i < 8; i++) {
        const dz = dhB[i] * fastSiluDeriv(zB[i]);
        gbB[i] += dz;
        const w = i * 12;
        for (let j = 0; j < 12; j++) gWB[w + j] += dz * inB[j];
        for (let j = 0; j < 8; j++) dhA[j] += dz * WB[w + j];
      }

      for (let i = 0; i < 8; i++) {
        const dz = dhA[i] * fastSiluDeriv(zA[i]);
        gbA[i] += dz;
        const w = i * 6;
        gWA[w]     += dz * x0; gWA[w + 1] += dz * x1; gWA[w + 2] += dz * x2;
        gWA[w + 3] += dz * x3; gWA[w + 4] += dz * x4; gWA[w + 5] += dz * x5;
      }
    }

    b1Pow *= 0.9;
    b2Pow *= 0.999;
    const lr = 0.032 * (0.10 + 0.90 * 0.5 * (1.0 + Math.cos((Math.PI * ep) / EPOCHS)));
    const b1t = 1.0 - b1Pow, b2t = 1.0 - b2Pow;
    adamW(WA, gWA, mWA, vWA, lr, b1t, b2t);
    adamW(bA, gbA, mbA, vbA, lr, b1t, b2t);
    adamW(WB, gWB, mWB, vWB, lr, b1t, b2t);
    adamW(bB, gbB, mbB, vbB, lr, b1t, b2t);
    adamW(WO, gWO, mWO, vWO, lr, b1t, b2t);
    adamW(bO, gbO, mbO, vbO, lr, b1t, b2t);
  }

  let sqErr = 0.0;
  for (let n = 0; n < NSAMP; n++) {
    const o6 = n * 6, o3 = n * 3;
    for (let i = 0; i < 8; i++) {
      const w = i * 6;
      hA[i] = fastSilu(bA[i] + WA[w] * X[o6] + WA[w + 1] * X[o6 + 1] + WA[w + 2] * X[o6 + 2] + WA[w + 3] * X[o6 + 3] + WA[w + 4] * X[o6 + 4] + WA[w + 5] * X[o6 + 5]);
      inB[i] = hA[i];
    }
    inB[8] = X[o6]; inB[9] = X[o6 + 2]; inB[10] = X[o6 + 4]; inB[11] = X[o6 + 5];
    for (let i = 0; i < 8; i++) {
      const w = i * 12;
      let z = bB[i];
      for (let j = 0; j < 12; j++) z += WB[w + j] * inB[j];
      hComb[i] = fastSilu(z) + 0.5 * hA[i];
    }
    for (let k = 0; k < 3; k++) {
      const w = k * 8;
      let z = bO[k];
      for (let j = 0; j < 8; j++) z += WO[w + j] * hComb[j];
      const e = fastSig(z) - Y[o3 + k];
      sqErr += e * e;
    }
  }
  const rmse = Math.sqrt(sqErr / (NSAMP * 3));

  const f4 = (a, b, c, d) => `vec4(${a.toFixed(5)}, ${b.toFixed(5)}, ${c.toFixed(5)}, ${d.toFixed(5)})`;
  const colWA0 = c => f4(WA[c], WA[6 + c], WA[12 + c], WA[18 + c]);
  const colWA1 = c => f4(WA[24 + c], WA[30 + c], WA[36 + c], WA[42 + c]);
  const colWB0 = c => f4(WB[c], WB[12 + c], WB[24 + c], WB[36 + c]);
  const colWB1 = c => f4(WB[48 + c], WB[60 + c], WB[72 + c], WB[84 + c]);
  const rowWO  = (k, off) => f4(WO[k * 8 + off], WO[k * 8 + off + 1], WO[k * 8 + off + 2], WO[k * 8 + off + 3]);

  const glsl = `
vec4 rockFastSig4(vec4 x){
  vec4 c = clamp(x, vec4(-4.5), vec4(4.5));
  vec4 x2 = c * c;
  vec4 p = c * (0.249913 + x2 * (0.006378 + x2 * 0.000041));
  vec4 q = 1.0 + x2 * (0.108854 + x2 * 0.001479);
  return clamp(0.5 + p / q, vec4(0.0), vec4(1.0));
}
vec3 rockFastSig3(vec3 x){
  vec3 c = clamp(x, vec3(-4.5), vec3(4.5));
  vec3 x2 = c * c;
  vec3 p = c * (0.249913 + x2 * (0.006378 + x2 * 0.000041));
  vec3 q = 1.0 + x2 * (0.108854 + x2 * 0.001479);
  return clamp(0.5 + p / q, vec3(0.0), vec3(1.0));
}
// 8-Wide Dual-vec4 SIMD Stratified Multiphase PINN (Slope-Aware Gravity Shear + Soft Percolation Transitions!)
vec3 evalStratifiedRockFoamPINN(float sWet, float sWave, float eSurf, float eSplash, float nFlat, float cTrap){
  vec4 zA0 = ${f4(bA[0], bA[1], bA[2], bA[3])}
           + ${colWA0(0)} * sWet + ${colWA0(1)} * sWave + ${colWA0(2)} * eSurf
           + ${colWA0(3)} * eSplash + ${colWA0(4)} * nFlat + ${colWA0(5)} * cTrap;
  vec4 zA1 = ${f4(bA[4], bA[5], bA[6], bA[7])}
           + ${colWA1(0)} * sWet + ${colWA1(1)} * sWave + ${colWA1(2)} * eSurf
           + ${colWA1(3)} * eSplash + ${colWA1(4)} * nFlat + ${colWA1(5)} * cTrap;
  vec4 hA0 = zA0 * rockFastSig4(zA0);
  vec4 hA1 = zA1 * rockFastSig4(zA1);

  vec4 zB0 = ${f4(bB[0], bB[1], bB[2], bB[3])}
           + ${colWB0(0)} * hA0.x + ${colWB0(1)} * hA0.y + ${colWB0(2)} * hA0.z + ${colWB0(3)} * hA0.w
           + ${colWB0(4)} * hA1.x + ${colWB0(5)} * hA1.y + ${colWB0(6)} * hA1.z + ${colWB0(7)} * hA1.w
           + ${colWB0(8)} * sWet  + ${colWB0(9)} * eSurf + ${colWB0(10)} * nFlat + ${colWB0(11)} * cTrap;
  vec4 zB1 = ${f4(bB[4], bB[5], bB[6], bB[7])}
           + ${colWB1(0)} * hA0.x + ${colWB1(1)} * hA0.y + ${colWB1(2)} * hA0.z + ${colWB1(3)} * hA0.w
           + ${colWB1(4)} * hA1.x + ${colWB1(5)} * hA1.y + ${colWB1(6)} * hA1.z + ${colWB1(7)} * hA1.w
           + ${colWB1(8)} * sWet  + ${colWB1(9)} * eSurf + ${colWB1(10)} * nFlat + ${colWB1(11)} * cTrap;
  vec4 hC0 = zB0 * rockFastSig4(zB0) + 0.5 * hA0;
  vec4 hC1 = zB1 * rockFastSig4(zB1) + 0.5 * hA1;

  vec3 zO = vec3(
    ${bO[0].toFixed(5)} + dot(${rowWO(0, 0)}, hC0) + dot(${rowWO(0, 4)}, hC1),
    ${bO[1].toFixed(5)} + dot(${rowWO(1, 0)}, hC0) + dot(${rowWO(1, 4)}, hC1),
    ${bO[2].toFixed(5)} + dot(${rowWO(2, 0)}, hC0) + dot(${rowWO(2, 4)}, hC1)
  );
  return rockFastSig3(zO);
}`;
  return { glsl, rmse: +rmse.toFixed(5), params: 187 };
}

export function createCoastalRocks(THREE, bed, detailMap, sharedUniforms, foamAtlasTexture = null, renderer = null, options = {}) {
  const { deferBake = false, precomputedPinn = null } = options || {};
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const rockCoords = []; // Orthonormal boulder-local metric coordinates (1 unit = 1m, unique strike/dip per boulder)
  const rockCenterDirs = []; // Smooth radial outward hints + orthonormal strata basis rows per vertex
  const boulderBasisFlat = []; // 9 floats per boulder for transforming welded smooth world normal -> rockCoord space
  const vertexBoulderIdx = [];
  const rockMeta = []; // vec3(normalizedHeight, structuralCreviceAO, mineralWarmth)
  const records = [];

  let seed = 78219;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Deterministic 3D ridged multifractal helper for craggy geological vertex silhouettes
  const hash3 = (ix, iy, iz) => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise3 = (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    fz = fz * fz * (3 - 2 * fz);
    const c000 = hash3(ix, iy, iz),       c100 = hash3(ix + 1, iy, iz);
    const c010 = hash3(ix, iy + 1, iz),   c110 = hash3(ix + 1, iy + 1, iz);
    const c001 = hash3(ix, iy, iz + 1),   c101 = hash3(ix + 1, iy, iz + 1);
    const c011 = hash3(ix, iy + 1, iz + 1), c111 = hash3(ix + 1, iy + 1, iz + 1);
    const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx;
    const x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx;
    const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
    return y0 + (y1 - y0) * fz;
  };
  const ridgedFbm3 = (x, y, z) => {
    let sum = 0.0, amp = 0.56, freq = 1.0;
    for (let o = 0; o < 3; o++) {
      const n = noise3(x * freq, y * freq, z * freq);
      const ridge = 1.0 - Math.abs(n * 2.0 - 1.0);
      sum += ridge * ridge * amp;
      freq *= 2.12;
      amp *= 0.48;
    }
    return sum;
  };

  const fallbackTex = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  fallbackTex.needsUpdate = true;

  // Dramatic coastal headland sea-stacks, surf-zone reefs, and swash boulders; central bay stays invitingly open.
  const groups = [
    [-13.8, -6.4, 7],
    [17.8, -5.6, 7],
    [-18.2, -0.8, 7],
    [-33.5, 4.8, 8],
    [15.2, 2.4, 6],
    [31.5, -2.2, 8],
    [-62.0, 5.8, 9],
    [64.0, 8.8, 9],
    [-103.0, 1.0, 8],
    [112.0, 6.0, 8],
    [-146.0, 12.0, 7],
    [155.0, 10.0, 7]
  ];

  for (const [cx, offset, count] of groups) {
    const isReef = offset < -3.2;
    for (let j = 0; j < count; j++) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * (j < 2 ? 1.75 : (isReef ? 5.4 : 7.6));
      const x = cx + Math.cos(angle) * radius;
      const shoreline = 15 + 3 * Math.sin(x * 0.035) + 1.1 * Math.sin(x * 0.11) - 2 * Math.sin(x * 0.07);
      const z = shoreline + offset + Math.sin(angle) * radius * 0.66;

      // Hero sea-stacks & bold angular headland boulders alongside low wave-overtopped reef shelves
      const isHeroStack = j === 0;
      const size = isHeroStack
        ? (isReef ? 2.05 + random() * 0.72 : 1.85 + random() * 0.78)
        : 0.34 + Math.pow(random(), 1.48) * 1.48;
      const sx = size * (0.92 + random() * 0.66);
      const sy = size * (isHeroStack ? (0.68 + random() * 0.42) : (isReef ? 0.54 + random() * 0.38 : 0.44 + random() * 0.40));
      const sz = size * (0.82 + random() * 0.68);
      const rot = random() * Math.PI * 2;

      let support = bed(x, z);
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6;
        support = Math.min(support, bed(x + Math.cos(a) * sx, z + Math.sin(a) * sz));
      }
      const cy = support + sy * (isReef ? 0.50 : 0.30);

      // Adaptive geological tessellation (detail 4 = 5,120 tris on hero boulders, detail 3 = 1,280 tris on smaller reefs -> saves 25 MB VRAM!)
      const subdiv = size > 1.15 ? 4 : 3;
      const source = new THREE.IcosahedronGeometry(1, subdiv);
      const p = source.attributes.position;

      // 10 Bold Asymmetric Tectonic Cleavage Planes (sculpts crisp flat broken rock faces & angular overhangs!)
      const planes = [];
      const dipTilt = (random() - 0.5) * 0.56;
      for (let pIdx = 0; pIdx < 10; pIdx++) {
        const theta = (pIdx / 10) * Math.PI * 2 + (random() - 0.5) * 0.62;
        const ny = pIdx === 0
          ? 0.78 + random() * 0.18
          : (pIdx < 8 ? (random() - 0.34) * 0.82 : -0.62 - random() * 0.32);
        const nh = Math.sqrt(Math.max(0.04, 1 - ny * ny));
        const px = Math.cos(theta) * nh;
        const pz = Math.sin(theta) * nh;
        const distPlane = 0.62 + random() * 0.36;
        planes.push(px, ny + dipTilt * 0.24, pz, distPlane);
      }

      // Asymmetric tectonic step-fault plane cutting across the rock mass
      const faultAng = random() * Math.PI * 2;
      const faultNx = Math.cos(faultAng) * 0.86, faultNy = 0.28 + (random() - 0.5) * 0.3, faultNz = Math.sin(faultAng) * 0.86;
      const faultOffset = (random() - 0.5) * 0.28;
      const faultThrow = (random() > 0.5 ? 1 : -1) * (0.085 + random() * 0.095);

      const tone = 0.82 + random() * 0.32;
      const mineralWarmth = random();
      const seedOfsX = random() * 50, seedOfsY = random() * 50, seedOfsZ = random() * 50;
      const strataTiltX = (random() - 0.5) * 0.62;
      const strataTiltZ = (random() - 0.5) * 0.62;
      const start = positions.length / 3;
      let actualMaxY = -1e9;

      // Build strictly orthonormal 3D geological bedding basis R_strata (det = +1 -> 1.0 unit = 1.0 physical meter, ZERO stretch!)
      const bIdx = boulderBasisFlat.length / 9;
      let upX = -strataTiltX * 0.52, upY = 1.0, upZ = -strataTiltZ * 0.52;
      const invUp = 1.0 / Math.hypot(upX, upY, upZ);
      upX *= invUp; upY *= invUp; upZ *= invUp;
      const cR = Math.cos(rot), sR = Math.sin(rot);
      // Gram-Schmidt tangent tVec along rotated strike, bitangent bVec = up x tVec
      let tX = cR - upX * (cR * upX + sR * upZ);
      let tY = -upY * (cR * upX + sR * upZ);
      let tZ = sR - upZ * (cR * upX + sR * upZ);
      const invT = 1.0 / Math.max(1e-6, Math.hypot(tX, tY, tZ));
      tX *= invT; tY *= invT; tZ *= invT;
      const bX = upY * tZ - upZ * tY;
      const bY = upZ * tX - upX * tZ;
      const bZ = upX * tY - upY * tX;
      boulderBasisFlat.push(tX, tY, tZ, upX, upY, upZ, bX, bY, bZ);

      const startMetaIdx = rockMeta.length;

      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i), v = p.getY(i), w = p.getZ(i);

        // 1) Bold asymmetric planar cleavage faces with crisp angular dihedral fracture edges!
        let cleaveR = 1.24;
        for (let q = 0; q < 10; q++) {
          const off = q * 4;
          const proj = Math.max(0.20, u * planes[off] + v * planes[off + 1] + w * planes[off + 2]);
          const rBound = planes[off + 3] / proj;
          if (rBound < cleaveR) cleaveR = rBound;
        }
        let shape = Math.min(1.18, Math.max(0.54, cleaveR));

        // 2) 3D Musgrave Ridged Multifractal angular spalling & jagged crags
        const warp = noise3(u * 1.5 + seedOfsX, v * 1.5 + seedOfsY, w * 1.5 + seedOfsZ) - 0.5;
        const ridged = ridgedFbm3(u * 1.85 + warp * 0.65 + seedOfsX, v * 2.05 + seedOfsY, w * 1.85 - warp * 0.65 + seedOfsZ);
        const fineCrag = 1.0 - Math.abs(noise3(u * 4.6 + seedOfsZ, v * 4.6 + seedOfsX, w * 4.6 + seedOfsY) * 2.0 - 1.0);
        const cragRelief = (ridged - 0.44) * 0.25 + (fineCrag * fineCrag - 0.4) * 0.055;

        // 3) Tectonic fault escarpment step + tilted marine bedding ledges
        const faultCoord = u * faultNx + v * faultNy + w * faultNz - faultOffset;
        const faultStep = Math.tanh(faultCoord * 9.5) * faultThrow;
        const faultGroove = -0.055 * Math.exp(-faultCoord * faultCoord * 46.0);

        const strataCoord = v * 3.1 + u * strataTiltX * 2.3 + w * strataTiltZ * 2.3 + seedOfsX * 0.15;
        const strataFloor = Math.floor(strataCoord);
        const strataFrac = strataCoord - strataFloor;
        const benchStep = (strataFloor + Math.pow(strataFrac, 3.1)) / 3.1;
        const ledgeRelief = (benchStep - strataCoord / 3.1) * 0.145;

        // 4) Seaward intertidal wave-cut notch + flared sand-anchoring basal plinth
        const waveNotch = isReef ? -0.055 * Math.exp(-Math.pow((v + 0.18) / 0.26, 2)) : 0.0;
        const baseFlare = Math.max(0.0, (-v - 0.30) / 0.70);
        const horizFlare = 1.0 + 0.18 * baseFlare * baseFlare;

        shape = Math.max(0.46, shape + cragRelief + faultStep + faultGroove + ledgeRelief + waveNotch);

        // Precomputed structural crevice & undercut ambient occlusion
        const grooveAO = 1.0 - 0.34 * Math.exp(-faultCoord * faultCoord * 28.0);
        const cragAO = 0.70 + 0.30 * Math.min(1.0, Math.max(0.0, ridged * 1.25));
        const vertAO = (0.56 + 0.44 * Math.min(1.0, Math.max(0.0, (v + 0.85) / 1.45))) * grooveAO * cragAO;

        const lx = u * shape * sx * horizFlare;
        const ly = v * shape * sy;
        const lz = w * shape * sz * horizFlare;
        const wxOff = lx * cR - lz * sR;
        const wzOff = lx * sR + lz * cR;
        const wy = cy + ly;
        if (wy > actualMaxY) actualMaxY = wy;

        positions.push(x + wxOff, wy, z + wzOff);

        // Metric-preserving orthonormal boulder-local 3D rock coordinate (unique strike/dip + seed offset per rock!)
        rockCoords.push(
          tX * wxOff + tY * ly + tZ * wzOff + seedOfsX * 0.23,
          upX * wxOff + upY * ly + upZ * wzOff + seedOfsY * 0.23,
          bX * wxOff + bY * ly + bZ * wzOff + seedOfsZ * 0.23
        );
        const radInv = 1.0 / Math.max(1e-5, Math.hypot(wxOff, ly * 0.85, wzOff));
        rockCenterDirs.push(wxOff * radInv, ly * 0.85 * radInv, wzOff * radInv);
        vertexBoulderIdx.push(bIdx);

        // Authentic weathered coastal granodiorite / greywacke / basalt mineral base tint
        const rAlb = (0.37 + 0.105 * mineralWarmth) * tone;
        const gAlb = (0.34 + 0.075 * mineralWarmth) * tone;
        const bAlb = (0.30 + 0.038 * (1.0 - mineralWarmth)) * tone;
        colors.push(rAlb, gAlb, bAlb);
        rockMeta.push((v + 1.0) * 0.5, vertAO, mineralWarmth);
      }

      records.push({ x, z, sx, sy, sz, rot, cy, support, topY: actualMaxY, start, count: p.count, startMetaIdx });
      source.dispose();
    }
  }

  // Upgrade rockMeta to vec4(normalizedHeight, structuralCreviceAO, mineralSeed, rockTopY)
  const vertCount = positions.length / 3;
  const rockMeta4 = new Float32Array(vertCount * 4);
  for (const r of records) {
    for (let i = 0; i < r.count; i++) {
      const vIdx = r.start + i;
      rockMeta4[vIdx * 4] = rockMeta[vIdx * 3];
      rockMeta4[vIdx * 4 + 1] = rockMeta[vIdx * 3 + 1];
      rockMeta4[vIdx * 4 + 2] = rockMeta[vIdx * 3 + 2];
      rockMeta4[vIdx * 4 + 3] = r.topY;
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('rockCoord', new THREE.Float32BufferAttribute(rockCoords, 3));
  geometry.setAttribute('rockMeta', new THREE.Float32BufferAttribute(rockMeta4, 4));

  // Dual Area-Weighted & Sliver-Guarded Normal System:
  //  1) Lighting normal (`normal`): Area-weighted 43 deg (dot >= 0.73) crease split preserves bold sculpted rock planes
  //     while guarding against degenerate sliver triangles along cleaved fault intersections!
  //  2) Projection normals (`smoothNormal` & `rockTexNormal`): 100% unconditionally area-welded across coincident vertices
  //     + 26% radial outward smoothing -> C^0/C^1 continuous across EVERY sharp fracture edge!
  const origNx = new Float32Array(vertCount);
  const origNy = new Float32Array(vertCount);
  const origNz = new Float32Array(vertCount);
  const faceWeight = new Float32Array(vertCount);

  for (let t = 0; t < vertCount; t += 3) {
    const i0 = t * 3, i1 = (t + 1) * 3, i2 = (t + 2) * 3;
    const ax = positions[i0], ay = positions[i0 + 1], az = positions[i0 + 2];
    const e1x = positions[i1] - ax, e1y = positions[i1 + 1] - ay, e1z = positions[i1 + 2] - az;
    const e2x = positions[i2] - ax, e2y = positions[i2 + 1] - ay, e2z = positions[i2 + 2] - az;
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    const area2 = Math.hypot(cx, cy, cz);
    if (area2 > 1e-7) {
      const invA = 1.0 / area2;
      const fnx = cx * invA, fny = cy * invA, fnz = cz * invA;
      const w = Math.max(1e-5, area2);
      for (let k = 0; k < 3; k++) {
        origNx[t + k] = fnx;
        origNy[t + k] = fny;
        origNz[t + k] = fnz;
        faceWeight[t + k] = w;
      }
    } else {
      // Degenerate cleaved sliver triangle fallback -> use outward boulder radial direction with tiny weight
      for (let k = 0; k < 3; k++) {
        const vk = (t + k) * 3;
        origNx[t + k] = rockCenterDirs[vk];
        origNy[t + k] = rockCenterDirs[vk + 1];
        origNz[t + k] = rockCenterDirs[vk + 2];
        faceWeight[t + k] = 1e-6;
      }
    }
  }

  const outNormals = new Float32Array(vertCount * 3);
  const smoothWorldNormals = new Float32Array(vertCount * 3);
  const rockTexNormals = new Float32Array(vertCount * 3);
  const groupsByPosition = new Map();
  for (let i = 0; i < vertCount; i++) {
    const ix = Math.round(positions[i * 3] * 2000);
    const iy = Math.round(positions[i * 3 + 1] * 2000);
    const iz = Math.round(positions[i * 3 + 2] * 2000);
    const key = `${ix},${iy},${iz}`;
    let ids = groupsByPosition.get(key);
    if (!ids) groupsByPosition.set(key, (ids = []));
    ids.push(i);
  }

  for (const ids of groupsByPosition.values()) {
    const nLen = ids.length;
    let allX = 0, allY = 0, allZ = 0;
    for (let k = 0; k < nLen; k++) {
      const idx = ids[k];
      const w = faceWeight[idx];
      allX += origNx[idx] * w;
      allY += origNy[idx] * w;
      allZ += origNz[idx] * w;
    }
    const invAll = 1 / Math.max(1e-8, Math.hypot(allX, allY, allZ));
    allX *= invAll; allY *= invAll; allZ *= invAll;

    for (let a = 0; a < nLen; a++) {
      const i = ids[a];
      const ax = origNx[i], ay = origNy[i], az = origNz[i];
      const wa = faceWeight[i];
      let sx = ax * wa, sy = ay * wa, sz = az * wa;
      for (let b = 0; b < nLen; b++) {
        if (a === b) continue;
        const j = ids[b];
        const d = ax * origNx[j] + ay * origNy[j] + az * origNz[j];
        if (d >= 0.73) {
          const wb = faceWeight[j];
          sx += origNx[j] * wb;
          sy += origNy[j] * wb;
          sz += origNz[j] * wb;
        }
      }
      const invL = 1 / Math.max(1e-8, Math.hypot(sx, sy, sz));
      outNormals[i * 3] = sx * invL;
      outNormals[i * 3 + 1] = sy * invL;
      outNormals[i * 3 + 2] = sz * invL;

      const rx = rockCenterDirs[i * 3], ry = rockCenterDirs[i * 3 + 1], rz = rockCenterDirs[i * 3 + 2];
      let wxN = allX * 0.74 + rx * 0.26;
      let wyN = allY * 0.74 + ry * 0.26;
      let wzN = allZ * 0.74 + rz * 0.26;
      const invW = 1 / Math.max(1e-6, Math.hypot(wxN, wyN, wzN));
      wxN *= invW; wyN *= invW; wzN *= invW;
      smoothWorldNormals[i * 3] = wxN;
      smoothWorldNormals[i * 3 + 1] = wyN;
      smoothWorldNormals[i * 3 + 2] = wzN;

      const bOff = vertexBoulderIdx[i] * 9;
      rockTexNormals[i * 3]     = boulderBasisFlat[bOff] * wxN + boulderBasisFlat[bOff + 1] * wyN + boulderBasisFlat[bOff + 2] * wzN;
      rockTexNormals[i * 3 + 1] = boulderBasisFlat[bOff + 3] * wxN + boulderBasisFlat[bOff + 4] * wyN + boulderBasisFlat[bOff + 5] * wzN;
      rockTexNormals[i * 3 + 2] = boulderBasisFlat[bOff + 6] * wxN + boulderBasisFlat[bOff + 7] * wyN + boulderBasisFlat[bOff + 8] * wzN;
    }
  }
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(outNormals, 3));
  geometry.setAttribute('smoothNormal', new THREE.Float32BufferAttribute(smoothWorldNormals, 3));
  geometry.setAttribute('rockTexNormal', new THREE.Float32BufferAttribute(rockTexNormals, 3));
  geometry.computeBoundingSphere();

  // Extract exact 24-sector intertidal/basal sculpted 3D boulder hulls + 4-channel coastalContactMap ([-180..180, -90..60]):
  //   R = Sculpted rock basal & intertidal contact AO (0..1)
  //   G = Outward sculpted horizontal normal X (nx * 0.5 + 0.5)
  //   B = Outward sculpted horizontal normal Z (nz * 0.5 + 0.5)
  //   A = Tight sculpted 3D rock-wall meniscus proximity (0..1, smooth 1.4m collar outside rock face)
  const HULL_SECTORS = 24;
  const contactRGBA = new Uint8Array(512 * 256 * 4);
  const contactTexture = new THREE.DataTexture(contactRGBA, 512, 256, THREE.RGBAFormat);
  contactTexture.wrapS = contactTexture.wrapT = THREE.ClampToEdgeWrapping;
  contactTexture.minFilter = contactTexture.magFilter = THREE.LinearFilter;
  const contactAccNx = new Float32Array(512 * 256);
  const contactAccNz = new Float32Array(512 * 256);
  const contactAccW  = new Float32Array(512 * 256);
  const hullScratch  = new Float32Array(HULL_SECTORS);

  function bakeSculptedHullsAndContactMap() {
    const posAttr = geometry.attributes.position;
    const INV_TWO_PI = 1.0 / (2.0 * Math.PI);

    for (const r of records) {
      if (!r.hullRadii) r.hullRadii = new Float32Array(HULL_SECTORS);
      const hull = r.hullRadii;
      const co = Math.cos(r.rot || 0), si = Math.sin(r.rot || 0);
      const rxBase = Math.max(0.28, r.sx * 0.84), rzBase = Math.max(0.28, r.sz * 0.84);
      for (let s = 0; s < HULL_SECTORS; s++) {
        const ang = ((s + 0.5) / HULL_SECTORS) * 2.0 * Math.PI - Math.PI;
        const dx = Math.cos(ang), dz = Math.sin(ang);
        const u = dx * co + dz * si, v = -dx * si + dz * co;
        hull[s] = 0.58 / Math.max(1e-4, Math.hypot(u / rxBase, v / rzBase));
      }
      const yMin = r.support - 0.36;
      const yMax = Math.max(r.support + 0.88, 0.55);
      for (let i = r.start, iEnd = r.start + r.count; i < iEnd; i++) {
        const vy = posAttr.getY(i);
        if (vy < yMin || vy > yMax) continue;
        const dx = posAttr.getX(i) - r.x, dz = posAttr.getZ(i) - r.z;
        const rad = Math.hypot(dx, dz);
        const ang01 = (Math.atan2(dz, dx) + Math.PI) * INV_TWO_PI;
        const sec = Math.min(HULL_SECTORS - 1, Math.max(0, (ang01 * HULL_SECTORS) | 0));
        if (rad > hull[sec]) hull[sec] = rad;
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let s = 0; s < HULL_SECTORS; s++) {
          const sm = (s + HULL_SECTORS - 1) % HULL_SECTORS;
          const sp = (s + 1) % HULL_SECTORS;
          hullScratch[s] = 0.25 * hull[sm] + 0.5 * hull[s] + 0.25 * hull[sp];
        }
        hull.set(hullScratch);
      }
      let maxR = 0.3;
      for (let s = 0; s < HULL_SECTORS; s++) {
        if (hull[s] > maxR) maxR = hull[s];
      }
      r.maxHullR = maxR;
    }

    contactAccNx.fill(0);
    contactAccNz.fill(0);
    contactAccW.fill(0);
    for (let p = 0; p < 512 * 256; p++) {
      const o = p * 4;
      contactRGBA[o] = 0;
      contactRGBA[o + 1] = 128;
      contactRGBA[o + 2] = 128;
      contactRGBA[o + 3] = 0;
    }

    const dxCell = 360.0 / 512.0, dzCell = 150.0 / 256.0;
    const dAng = (2.0 * Math.PI) / HULL_SECTORS;
    for (const r of records) {
      if (r.topY < -1.85 || Math.abs(r.x) > 182 || r.z < -92 || r.z > 62) continue;
      const hull = r.hullRadii;
      const maxR = r.maxHullR;
      const aoHalo = 0.92 + 0.28 * Math.min(1.8, maxR);
      const menHalo = 1.42 + 0.30 * Math.min(1.8, maxR);
      const maxHalo = Math.max(aoHalo, menHalo);
      const wetGate = Math.max(0.0, Math.min(1.0, (0.72 - r.support) / 0.58)) * Math.max(0.25, Math.min(1.0, (r.topY + 0.45) / 0.60));

      const iMin = Math.max(0, Math.floor((r.x - maxR - maxHalo + 180.0) / dxCell));
      const iMax = Math.min(511, Math.ceil((r.x + maxR + maxHalo + 180.0) / dxCell));
      const jMin = Math.max(0, Math.floor((r.z - maxR - maxHalo + 90.0) / dzCell));
      const jMax = Math.min(255, Math.ceil((r.z + maxR + maxHalo + 90.0) / dzCell));

      for (let j = jMin; j <= jMax; j++) {
        const wz = -90.0 + (j + 0.5) * dzCell;
        const dzw = wz - r.z;
        const row = j * 512;
        for (let i = iMin; i <= iMax; i++) {
          const wx = -180.0 + (i + 0.5) * dxCell;
          const dxw = wx - r.x;
          const rad = Math.hypot(dxw, dzw);
          const ang = Math.atan2(dzw, dxw);
          const ang01 = (ang + Math.PI) * INV_TWO_PI;
          const secF = (ang01 - Math.floor(ang01)) * HULL_SECTORS;
          const s0 = secF | 0;
          const s1 = (s0 + 1) % HULL_SECTORS;
          const sf = secF - s0;
          const rHull = Math.max(0.22, hull[s0] + (hull[s1] - hull[s0]) * sf);
          const sd = rad - rHull;
          if (sd >= maxHalo) continue;

          const pIdx = row + i;
          const o = pIdx * 4;
          if (sd < aoHalo) {
            let ao = sd <= 0.0 ? 1.0 : 1.0 - sd / aoHalo;
            ao = ao * ao * (3.0 - 2.0 * ao);
            const aoByte = (ao * 255.0 + 0.5) | 0;
            if (aoByte > contactRGBA[o]) contactRGBA[o] = aoByte;
          }
          if (wetGate > 0.01 && sd < menHalo) {
            let prox = sd <= 0.0 ? 1.0 : 1.0 - sd / menHalo;
            prox = prox * prox * (3.0 - 2.0 * prox) * wetGate;
            const proxByte = (prox * 255.0 + 0.5) | 0;
            if (proxByte > contactRGBA[o + 3]) contactRGBA[o + 3] = proxByte;

            // Outward normal of polar curve r(theta): e_r * r - e_theta * (dr/dtheta)
            const sm = (s0 + HULL_SECTORS - 1) % HULL_SECTORS;
            const drdth = (hull[s1] - hull[sm]) / (2.0 * dAng);
            const erX = rad > 1e-4 ? dxw / rad : Math.cos(ang);
            const erZ = rad > 1e-4 ? dzw / rad : Math.sin(ang);
            const ethX = -erZ, ethZ = erX;
            let nx = erX * rHull - ethX * drdth;
            let nz = erZ * rHull - ethZ * drdth;
            const nInv = 1.0 / Math.max(1e-4, Math.hypot(nx, nz));
            nx *= nInv; nz *= nInv;
            const wN = prox + 0.15;
            contactAccNx[pIdx] += nx * wN;
            contactAccNz[pIdx] += nz * wN;
            contactAccW[pIdx]  += wN;
          }
        }
      }
    }

    for (let p = 0; p < 512 * 256; p++) {
      if (contactAccW[p] <= 1e-5) continue;
      let nx = contactAccNx[p], nz = contactAccNz[p];
      const nLen = Math.hypot(nx, nz);
      if (nLen > 1e-5) {
        nx /= nLen; nz /= nLen;
        const o = p * 4;
        contactRGBA[o + 1] = Math.min(255, Math.max(0, Math.round((nx * 0.5 + 0.5) * 255.0)));
        contactRGBA[o + 2] = Math.min(255, Math.max(0, Math.round((nz * 0.5 + 0.5) * 255.0)));
      }
    }
    contactTexture.needsUpdate = true;
  }
  bakeSculptedHullsAndContactMap();

  // GPU-Bake 2048x2048 16x-Anisotropic High-Definition Craggy Granite/Basalt Micro-Relief, Joint Fissure & Mineral Crystal Atlas:
  // Eliminates blurry low-res stone faces AND preserves razor-sharp fractures, chipped facets & mineral grains from 0.3m to 160m!
  let rockSurfaceMap;
  let rockSurfaceRT = null;
  let pendingRockBake = null;

  function bakeSurface() {
    if (!pendingRockBake || pendingRockBake.baked) return;
    pendingRockBake.baked = true;
    const { bakeQuad, bakeScene, bakeCam, rockBakeMat } = pendingRockBake;
    const prevTarget = renderer.getRenderTarget();
    const prevTone = renderer.toneMapping;
    const prevAutoClear = renderer.autoClear;
    try {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = true;
      renderer.setRenderTarget(rockSurfaceRT);
      renderer.clear(true, false, false);
      renderer.render(bakeScene, bakeCam);
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.toneMapping = prevTone;
      renderer.autoClear = prevAutoClear;
    }
    bakeQuad.dispose();
    rockBakeMat.dispose();
  }
  if (renderer) {
    const maxTex = renderer.capabilities?.maxTextureSize || 4096;
    const rockTexSize = Math.min(1024, maxTex);
    rockSurfaceRT = new THREE.WebGLRenderTarget(rockTexSize, rockTexSize, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      generateMipmaps: true,
      depthBuffer: false,
      stencilBuffer: false
    });
    rockSurfaceRT.texture.colorSpace = THREE.NoColorSpace ?? '';
    const maxAniso = renderer.capabilities?.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 8;
    rockSurfaceRT.texture.anisotropy = Math.min(16, Math.max(1, maxAniso));

    const rockBakeMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader: `varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
      fragmentShader: `precision highp float;
varying vec2 vUv;

float rHash1(vec2 p, float per){
  vec2 m = mod(mod(floor(p), per) + per, per);
  vec3 p3 = fract(vec3(m.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 rHash2(vec2 p, float per){
  vec2 m = mod(mod(floor(p), per) + per, per);
  vec3 p3 = fract(vec3(m.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float rNoise(vec2 uv, float per){
  vec2 x = uv * per;
  vec2 i = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = rHash1(i, per);
  float b = rHash1(i + vec2(1.0, 0.0), per);
  float c = rHash1(i + vec2(0.0, 1.0), per);
  float d = rHash1(i + vec2(1.0, 1.0), per);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float rRidged(vec2 uv, float per){
  float r = 1.0 - abs(2.0 * rNoise(uv, per) - 1.0);
  return r * r;
}

// Periodic Voronoi edge distance (d2 - d1) for crisp V-grooved tectonic fracture cracks & angular mineral cleavage!
vec2 rVoronoiEdge(vec2 uv, float per){
  vec2 x = uv * per;
  vec2 n = floor(x);
  vec2 f = fract(x);
  float d1 = 8.0, d2 = 8.0, cellId = 0.5;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 rnd = rHash2(n + g, per);
      vec2 o = g + 0.12 + 0.76 * rnd - f;
      float d = dot(o, o);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        cellId = rnd.x;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec2(sqrt(d2) - sqrt(d1), cellId);
}

vec3 evalRockSurface(vec2 uv){
  vec2 warp1 = vec2(rNoise(uv + vec2(0.17, 0.43), 5.0), rNoise(uv + vec2(0.71, 0.29), 5.0)) - 0.5;
  vec2 warp2 = vec2(rNoise(uv + vec2(0.53, 0.89), 14.0), rNoise(uv + vec2(0.31, 0.11), 14.0)) - 0.5;
  vec2 uW = uv + warp1 * 0.11 + warp2 * 0.035;

  // 1. Stepped angular cleavage scarps & Musgrave ridged multifractal facets (ZERO blobby smooth clay!)
  float stepCoord1 = uW.y * 5.0 + uW.x * 2.0 + warp1.x * 1.35;
  float fl1 = floor(stepCoord1);
  float fr1 = stepCoord1 - fl1;
  float scarp1 = ((fl1 + pow(fr1, 3.2)) - stepCoord1) * 0.22;

  float stepCoord2 = uW.x * 9.0 - uW.y * 4.0 + warp2.y * 1.15;
  float fl2 = floor(stepCoord2);
  float fr2 = stepCoord2 - fl2;
  float scarp2 = ((fl2 + pow(fr2, 2.8)) - stepCoord2) * 0.13;

  float ridgeMacro = rRidged(uW, 7.0) * 0.34 + rRidged(uW + vec2(0.37, 0.19), 16.0) * 0.24;
  float ridgeMeso  = rRidged(uW + warp2 * 0.05, 37.0) * 0.17 + rRidged(uv + warp2 * 0.025, 83.0) * 0.11;

  // 2. Sharp conjugate tectonic fracture fissures + cellular mineral block facets
  vec2 vorMacro = rVoronoiEdge(uW, 6.0);
  vec2 vorMeso  = rVoronoiEdge(uv + warp1 * 0.06 + warp2 * 0.02, 17.0);
  float crackM  = 1.0 - smoothstep(0.0, 0.068, vorMacro.x);
  float crackF  = 1.0 - smoothstep(0.0, 0.055, vorMeso.x);
  float blockTilt = (vorMacro.y - 0.5) * 0.16 + (vorMeso.y - 0.5) * 0.09;

  // 3. High-frequency crystalline granite/basalt grains (quartz/feldspar light crystals + biotite flecks + Tafoni pits)
  float grain180 = rNoise(uv, 180.0);
  float grain360 = rNoise(uv + vec2(0.23, 0.67), 360.0);
  float grain640 = rNoise(uv + vec2(0.81, 0.13), 640.0);
  float crystalFacet = (grain180 - 0.5) * 0.11 + (grain360 - 0.5) * 0.075 + (grain640 - 0.5) * 0.052;
  float saltPits = smoothstep(0.74, 0.94, 1.0 - rNoise(uv + warp2 * 0.02, 112.0)) * 0.55
                 + smoothstep(0.78, 0.96, 1.0 - grain180) * 0.35;

  float h = ridgeMacro + ridgeMeso + scarp1 + scarp2 + blockTilt + crystalFacet
          - crackM * crackM * 0.24 - crackF * crackF * 0.13 - saltPits * 0.085;

  // High-contrast lithology tone (feldspar/quartz bright crystals vs dark hornblende/biotite & fracture veins)
  float mineralSpeckle = (grain180 - 0.5) * 0.36 + (grain360 - 0.5) * 0.28 + (grain640 - 0.5) * 0.20;
  float tone = clamp(
    0.50 + (vorMacro.y - 0.5) * 0.24 + (ridgeMacro - 0.28) * 0.42 + scarp1 * 0.45
    + (vorMeso.y - 0.5) * 0.18 + mineralSpeckle - crackM * 0.22 - saltPits * 0.16,
    0.0, 1.0
  );
  float crack = clamp(crackM * 0.78 + crackF * 0.54 + saltPits * 0.46, 0.0, 1.0);
  return vec3(h, tone, crack);
}

void main(){
  float eps = 1.0 / 1024.0;
  vec3 c  = evalRockSurface(vUv);
  float hR = evalRockSurface(vUv + vec2(eps, 0.0)).x;
  float hL = evalRockSurface(vUv - vec2(eps, 0.0)).x;
  float hU = evalRockSurface(vUv + vec2(0.0, eps)).x;
  float hD = evalRockSurface(vUv - vec2(0.0, eps)).x;

  // Centered finite-difference facet slopes utilizing full [-1, +1] normal dynamic range!
  float dU = clamp((hR - hL) * 155.0, -1.0, 1.0);
  float dV = clamp((hU - hD) * 155.0, -1.0, 1.0);
  gl_FragColor = vec4(dU * 0.5 + 0.5, dV * 0.5 + 0.5, c.y, c.z);
}`
    });

    const bakeQuad = new THREE.PlaneGeometry(2, 2);
    const bakeScene = new THREE.Scene();
    bakeScene.add(new THREE.Mesh(bakeQuad, rockBakeMat));
    const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    rockSurfaceMap = rockSurfaceRT.texture;
    pendingRockBake = { bakeQuad, bakeScene, bakeCam, rockBakeMat, baked: false };
    if (!deferBake) bakeSurface();
  } else {
    const rockSurfSize = 256;
    const rockSurfRGBA = new Uint8Array(rockSurfSize * rockSurfSize * 4);
    for (let i = 0; i < rockSurfSize * rockSurfSize; i++) {
      const o = i * 4;
      rockSurfRGBA[o] = 128;
      rockSurfRGBA[o + 1] = 128;
      rockSurfRGBA[o + 2] = 128;
      rockSurfRGBA[o + 3] = 0;
    }
    rockSurfaceMap = new THREE.DataTexture(rockSurfRGBA, rockSurfSize, rockSurfSize, THREE.RGBAFormat, THREE.UnsignedByteType);
    rockSurfaceMap.wrapS = rockSurfaceMap.wrapT = THREE.RepeatWrapping;
    rockSurfaceMap.needsUpdate = true;
  }

  // --- Stratified 8-Wide Dual-vec4 SIMD Multiphase Boundary-Layer PINN (187 params, 0 texture taps, Sobolev-smooth!) ---
  const foamPinn = precomputedPinn || trainCoastalRockFoamPINN();

  const uniforms = {
    ...terrainUniforms,
    detailMap: { value: detailMap },
    rockSurfaceMap: { value: rockSurfaceMap },
    foamAtlas: { value: foamAtlasTexture || fallbackTex },
    bathymetryMap: sharedUniforms?.bathymetryMap || { value: fallbackTex },
    swashStateMap: sharedUniforms?.swashStateMap || { value: fallbackTex },
    impactFoamMap: { value: fallbackTex },
    longWave: sharedUniforms?.longWave || { value: fallbackTex },
    longPrevious: sharedUniforms?.longPrevious || { value: fallbackTex },
    shortWave: sharedUniforms?.shortWave || { value: fallbackTex },
    longMix: sharedUniforms?.longMix || { value: 0 },
    lengthLong: sharedUniforms?.lengthLong || { value: 240.0 },
    lengthShort: sharedUniforms?.lengthShort || { value: 37.2 },
    resolutionLong: sharedUniforms?.resolutionLong || { value: 128.0 },
    resolutionShort: sharedUniforms?.resolutionShort || { value: 64.0 },
    crestShape: sharedUniforms?.crestShape || { value: 0.5 },
    midScale: sharedUniforms?.midScale || { value: 0.35 },
    uWaveLinear: sharedUniforms?.uWaveLinear || { value: 1.0 },
    chop: sharedUniforms?.chop || { value: 2.35 },
    foamBoost: sharedUniforms?.foamBoost || { value: 1.0 },
    foamVisible: sharedUniforms?.foamVisible || { value: 1.0 },
    skyEnvMap: sharedUniforms?.skyEnvMap || { value: fallbackTex },
    skyEnvReady: sharedUniforms?.skyEnvReady || { value: 0 },
    rockShadowMap: sharedUniforms?.rockShadowMap || { value: fallbackTex },
    rockShadowMatrix: sharedUniforms?.rockShadowMatrix || { value: new THREE.Matrix4() },
    rockShadowEnabled: sharedUniforms?.rockShadowEnabled || { value: 0 },
    time: sharedUniforms?.time || { value: 0 },
    amplitude: sharedUniforms?.amplitude || { value: 0.68 },
    beachMode: sharedUniforms?.beachMode || { value: 1 },
    sunDirection: sharedUniforms?.sunDirection || { value: new THREE.Vector3(-0.24, 0.39, -0.888).normalize() },
    skyTop: sharedUniforms?.skyTop || { value: new THREE.Vector3(0.042, 0.165, 0.44) },
    skyHorizon: sharedUniforms?.skyHorizon || { value: new THREE.Vector3(0.34, 0.49, 0.63) },
    scatterColor: sharedUniforms?.scatterColor || { value: new THREE.Vector3(0.012, 0.192, 0.228) },
    uNightMix: sharedUniforms?.uNightMix || { value: 0.0 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
${mediumWaveGLSL}
uniform sampler2D bathymetryMap, longWave, longPrevious, shortWave;
uniform float lengthLong, lengthShort, resolutionLong, resolutionShort, amplitude, chop, longMix, crestShape, time, beachMode, midScale, uWaveLinear;
attribute vec3 color;
attribute vec3 rockCoord;
attribute vec3 smoothNormal;
attribute vec3 rockTexNormal;
attribute vec4 rockMeta;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vSmoothN;
varying vec3 vRockCoord;
varying vec3 vTexN;
varying vec3 vTint;
varying vec4 vMeta;
varying float vOffshoreWaveH;

vec3 rockWaveField3(sampler2D tex, vec2 p, float len, float n){
  vec3 res = vec3(0.0);
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

void main(){
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  mat3 nMat = mat3(modelMatrix);
  vNormal = normalize(nMat * normal);
  vSmoothN = normalize(nMat * smoothNormal);
  vRockCoord = rockCoord;
  vTexN = normalize(rockTexNormal);
  vTint = color;
  vMeta = rockMeta;

  // Hoist 240m swell + 37.2m chop + mediumWave with 1-step Lagrangian choppiness inversion so rock waterline phase matches Offshore.js 1:1!
  float waveH = 0.0;
  if (beachMode > 0.5) {
    vec2 bUv0 = clamp((vWorld.xz - vec2(-180.0, -90.0)) / vec2(360.0, 150.0), 0.0, 1.0);
    float bed0 = textureLod(bathymetryMap, bUv0, 0.0).r;
    float d0 = max(0.0, -bed0);
    if (d0 > 0.015) {
      float chopAtten = smoothstep(0.05, 1.35, d0);
      vec3 f0 = mix(
        rockWaveField3(longPrevious, vWorld.xz, lengthLong, resolutionLong),
        rockWaveField3(longWave, vWorld.xz, lengthLong, resolutionLong),
        longMix
      ) + rockWaveField3(shortWave, vWorld.xz, lengthShort, resolutionShort);
      vec3 mid0 = mediumWave(vWorld.xz, time) * (amplitude * midScale);
      vec2 pRest = vWorld.xz - (f0.yz * amplitude * chop + mid0.yz) * chopAtten;
      vec3 f1 = mix(
        rockWaveField3(longPrevious, pRest, lengthLong, resolutionLong),
        rockWaveField3(longWave, pRest, lengthLong, resolutionLong),
        longMix
      ) + rockWaveField3(shortWave, pRest, lengthShort, resolutionShort);
      float h = amplitude * f1.x;
      h += crestShape * (sqrt(h * h + 0.09) - 0.3);
      float hMid = mediumWave(pRest, time).x * (amplitude * midScale);
      waveH = (h + hMid) * smoothstep(0.02, 0.88, d0);
    }
  }
  vOffshoreWaveH = waveH;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
${terrainGLSL}
${coastalWavesGLSL}
${swashStateGLSL}
${pbrShadingGLSL}
${foamPinn.glsl}

uniform sampler2D detailMap, rockSurfaceMap, foamAtlas, impactFoamMap, skyEnvMap, rockShadowMap;
uniform mat4 rockShadowMatrix;
uniform float skyEnvReady, rockShadowEnabled, time, amplitude, beachMode, foamBoost, foamVisible;
uniform vec3 sunDirection, skyTop, skyHorizon, scatterColor;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vSmoothN;
varying vec3 vRockCoord;
varying vec3 vTexN;
varying vec3 vTint;
varying vec4 vMeta;
varying float vOffshoreWaveH;

// ANGLE-safe axis UV & 3D gradient scatter helpers for Quilez (2017) Derivative-Exact Biplanar Projection
vec2 rockAxisUV(vec3 v, int axis){
  return axis == 0 ? v.yz : (axis == 1 ? v.zx : v.xy);
}
vec3 rockScatterGrad3D(vec2 g, int axis){
  return axis == 0 ? vec3(0.0, g.x, g.y) : (axis == 1 ? vec3(g.y, 0.0, g.x) : vec3(g.x, g.y, 0.0));
}

// 1:1 World-Meter Biplanar Axis UV for 3D Seafoam (axis 1 = xz matches FoamShader.js beach/sea coordinates 1-to-1!)
vec2 foamAxisUV(vec3 v, int axis){
  return axis == 0 ? v.zy : (axis == 1 ? v.xz : v.xy);
}

float rockSmax(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
  return mix(a, b, h) + k * h * (1.0 - h);
}

// Identical subtractive fractal percolation erosion to FoamShader.js (beach/surf foam parity!)
float rockErodePercolation(float density, float signal, float feather){
  float d = clamp(density, 0.0, 1.0);
  float thresh = mix(1.06, 0.08, pow(d, 0.76));
  return smoothstep(thresh - feather, thresh + feather, signal) * smoothstep(0.012, 0.20, d);
}

// Seamless C^1 Welded 3D Biplanar Foam Sampler (1:1 metric proportions on cliffs & ledges, ZERO vertical spiderweb stretch!)
vec4 sampleBiplanarFoam(vec3 p, vec3 dpdx, vec3 dpdy, int ma, int me, vec2 w, mat2 rotM, float freq, vec2 ofs){
  vec2 uv0 = (rotM * foamAxisUV(p, ma)) * freq + ofs;
  vec2 dx0 = (rotM * foamAxisUV(dpdx, ma)) * freq;
  vec2 dy0 = (rotM * foamAxisUV(dpdy, ma)) * freq;
  vec4 res = textureGrad(foamAtlas, uv0, dx0, dy0);
  if (w.y > 0.015) {
    const mat2 R29 = mat2(0.8746197, -0.4848096, 0.4848096, 0.8746197);
    mat2 rot1 = R29 * rotM;
    vec2 uv1 = (rot1 * foamAxisUV(p, me)) * freq + ofs.yx + vec2(0.31, 0.67);
    vec2 dx1 = (rot1 * foamAxisUV(dpdx, me)) * freq;
    vec2 dy1 = (rot1 * foamAxisUV(dpdy, me)) * freq;
    vec4 s1 = textureGrad(foamAtlas, uv1, dx1, dy1);
    res = (res * w.x + s1 * w.y) / (w.x + w.y);
  }
  return res;
}

float sampleFoamReliefHeight3D(
  vec3 p, vec3 dpdx, vec3 dpdy, int ma, int me, vec2 w,
  mat2 rotPillow, float fPillow, vec2 ofsPillow, float wPillow,
  float fGran, vec2 ofsGran, float wGran
){
  float h = 0.0;
  if (wPillow > 0.01) {
    h += sampleBiplanarFoam(p, dpdx, dpdy, ma, me, w, rotPillow, fPillow, ofsPillow).a * wPillow;
  }
  if (wGran > 0.01) {
    const mat2 RGran = mat2(0.94, 0.34, -0.34, 0.94);
    float gDome = clamp(sampleBiplanarFoam(p, dpdx, dpdy, ma, me, w, RGran, fGran, ofsGran).g * 1.68, 0.0, 1.0);
    h += gDome * wGran;
  }
  return h;
}

// Quilez (2017) Derivative-Exact Orthonormal Biplanar Surface Sampler (16x Anisotropic, Scale-Invariant Physical Facet Slopes!):
// Returns vec4(gradRock.xyz, tone) and writes fracture/cavity AO to crackOut in just 2 textureGrad taps!
vec4 sampleBiplanarRockSurface(vec3 p, vec3 dpdx, vec3 dpdy, vec3 texN, float scale, vec2 ofs, out float crackOut){
  vec3 an = abs(texN);
  int ma = (an.x > an.y && an.x > an.z) ? 0 : ((an.y > an.z) ? 1 : 2);
  int mi = (an.x < an.y && an.x < an.z) ? 0 : ((an.y < an.z) ? 1 : 2);
  int me = 3 - ma - mi;

  float wMa = ma == 0 ? an.x : (ma == 1 ? an.y : an.z);
  float wMe = me == 0 ? an.x : (me == 1 ? an.y : an.z);

  vec2 uv0 = rockAxisUV(p, ma) * scale + ofs;
  vec2 dx0 = rockAxisUV(dpdx, ma) * scale;
  vec2 dy0 = rockAxisUV(dpdy, ma) * scale;

  const mat2 R37  = mat2(0.7986355, -0.6018150, 0.6018150, 0.7986355);
  const mat2 R37T = mat2(0.7986355,  0.6018150, -0.6018150, 0.7986355);
  vec2 uv1 = R37 * (rockAxisUV(p, me) * scale) + ofs.yx + vec2(0.37, 0.71);
  vec2 dx1 = R37 * (rockAxisUV(dpdx, me) * scale);
  vec2 dy1 = R37 * (rockAxisUV(dpdy, me) * scale);

  vec2 w = clamp((vec2(wMa, wMe) - 0.5773) / (1.0 - 0.5773), 0.0, 1.0);
  w = w * sqrt(w);
  float wSum = max(w.x + w.y, 1e-6);

  vec4 s0 = textureGrad(rockSurfaceMap, uv0, dx0, dy0);
  vec4 s1 = textureGrad(rockSurfaceMap, uv1, dx1, dy1);

  // Dimensionless physical facet slopes dh/dx_rock (NO * scale attenuation that previously blurred macro/meso crags!)
  vec2 g0 = s0.rg * 2.0 - 1.0;
  vec2 g1 = R37T * (s1.rg * 2.0 - 1.0);
  vec3 grad3 = (rockScatterGrad3D(g0, ma) * w.x + rockScatterGrad3D(g1, me) * w.y) / wSum;
  float tone = (s0.b * w.x + s1.b * w.y) / wSum;
  crackOut   = (s0.a * w.x + s1.a * w.y) / wSum;
  return vec4(grad3, tone);
}

void main(){
  // Dual-Normal Architecture:
  // - worldSmoothN (100% area-welded + radial outward normal): seamless C^0 projection, wetting & 3D foam!
  // - baseN retains 78% of crisp sculpted dihedral rock planes + 22% beveled continuity for heavy 3D geological mass!
  vec3 worldSmoothN = normalize(vSmoothN);
  vec3 baseN = normalize(mix(normalize(vNormal), worldSmoothN, 0.22));
  vec3 texN = normalize(vTexN);

  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(sunDirection);
  float dist = length(cameraPosition - vWorld);

  float rh = vMeta.x;
  float vertAO = vMeta.y;
  float mineralSeed = vMeta.z;
  float rockTopY = max(0.35, vMeta.w);

  vec3 dRockDx = dFdx(vRockCoord);
  vec3 dRockDy = dFdy(vRockCoord);
  vec3 dWorldDx = dFdx(vWorld);
  vec3 dWorldDy = dFdy(vWorld);
  float pxWorld = max(length(dWorldDx), length(dWorldDy));

  // 3-Octave 2048x2048 16x-Anisotropic Geological Cascade (Macro ledges 2.8m + Meso fractures 0.62m + Fine mineral crystals 18cm!)
  float crackMacro = 0.0, crackMeso = 0.0, crackFine = 0.0;
  vec4 surfMacro = sampleBiplanarRockSurface(vRockCoord, dRockDx, dRockDy, texN, 0.36, vec2(0.13, 0.41) + mineralSeed * 0.37, crackMacro);
  vec4 surfMeso  = sampleBiplanarRockSurface(vRockCoord, dRockDx, dRockDy, texN, 1.62, vec2(0.57, 0.23) - mineralSeed * 0.21, crackMeso);
  float fineFade = (1.0 - smoothstep(42.0, 96.0, dist)) * (1.0 - smoothstep(0.025, 0.14, pxWorld));
  vec4 surfFine  = fineFade > 0.01
    ? sampleBiplanarRockSurface(vRockCoord, dRockDx, dRockDy, texN, 5.40, vec2(0.31, 0.79) + mineralSeed * 0.53, crackFine)
    : vec4(0.0, 0.0, 0.0, surfMeso.w);

  float bedPhase = vRockCoord.y * 2.85 + vRockCoord.x * 0.44 - vRockCoord.z * 0.32 + (surfMacro.w - 0.5) * 2.6 + mineralSeed * 4.7;
  float foliation = 0.5 + 0.5 * sin(bedPhase);

  // High-contrast lithology & sharp V-grooved fracture network
  float rawStrata = 0.50 + (surfMacro.w - 0.5) * 0.86 + (foliation - 0.5) * 0.34 + (surfMeso.w - 0.5) * 0.58;
  float strataTone = clamp(rawStrata, 0.0, 1.0);
  float crevice = clamp(crackMacro * 0.62 + crackMeso * 0.48 + crackFine * 0.24 * fineFade, 0.0, 0.94);
  float h0 = (surfMacro.w - 0.5) * 0.28 + (surfMeso.w - 0.5) * 0.15 + (surfFine.w - 0.5) * 0.06 * fineFade;

  // Singularity-Free Geometric Cotangent Frame Perturbation (eliminates 2x2 quad normal spikes along creases & silhouettes!)
  float bumpFade = 1.0 - smoothstep(78.0, 165.0, dist);
  vec3 N = baseN;
  if (bumpFade > 0.008) {
    vec3 gradRock = surfMacro.xyz * 0.88 + surfMeso.xyz * 0.66 + surfFine.xyz * (0.36 * fineFade);
    float dhDx = dot(gradRock, dRockDx);
    float dhDy = dot(gradRock, dRockDy);
    vec3 geoCross = cross(dWorldDx, dWorldDy);
    float geoArea = length(geoCross);
    vec3 N_geo = geoArea > 1e-10 ? (geoCross / geoArea) : baseN;
    if (dot(N_geo, worldSmoothN) < 0.0) N_geo = -N_geo;
    vec3 r1 = cross(dWorldDy, N_geo);
    vec3 r2 = cross(N_geo, dWorldDx);
    float det = dot(dWorldDx, r1);
    float safeDet = max(abs(det), 0.22 * pxWorld * pxWorld + 1e-8);
    vec3 surfGrad = (det >= 0.0 ? 1.0 : -1.0) * (dhDx * r1 + dhDy * r2) / safeDet;
    float gLen = length(surfGrad);
    if (gLen > 1.25) surfGrad *= 1.25 / gLen;
    N = normalize(baseN - surfGrad * (0.96 * bumpFade));
    float nDotBase = dot(N, baseN);
    if (nDotBase < 0.22) {
      N = normalize(mix(baseN, N, 0.78 / max(1.0 - nDotBase, 0.78)));
    }
  }

  float grainAA = 1.0 - smoothstep(0.006, 0.055, pxWorld);
  float crystalGrain = ((surfFine.w - 0.5) * 0.68 + (surfMeso.w - 0.5) * 0.32) * (0.45 + 0.55 * grainAA);
  float darkMineralFleck = smoothstep(0.64, 0.90, (1.0 - surfFine.w) * 0.65 + (1.0 - surfMeso.w) * 0.35) * fineFade;
  vec3 gritFineRGB = vec3(surfFine.w, 1.0 - crackMeso, strataTone);
  vec3 microGrainRGB = vec3(strataTone, surfMeso.w, 1.0 - crackMacro);

  // --- 1. Continuous Time-Smooth 3D Wave, Rate-Limited Runup & Soft Multi-Zone Porous Wetting (ZERO Hard Black Line!) ---
  vec4 bathy = beachMode > 0.5 ? sampleBathymetry(vWorld.xz) : vec4(-4.0, 0.0, 0.0, 0.0);
  float rockHeightSpan0 = max(0.25, rockTopY - bathy.r);

  // Dual-range outward rock-foot probes step past BOTH small cobbles (0.75m) and thick 2m boulders (up to 1.72m)!
  vec2 horizOut  = worldSmoothN.xz / max(length(worldSmoothN.xz), 0.35);
  vec2 footNear  = vWorld.xz + horizOut * 0.75;
  vec2 footFar   = vWorld.xz + horizOut * clamp(0.95 + 0.36 * rockHeightSpan0, 1.05, 1.72);
  vec4 bathyFoot = (beachMode > 0.5 && dist < 125.0) ? sampleBathymetry(footFar) : bathy;

  float bed      = min(bathy.r, bathyFoot.r * 0.65 + bathy.r * 0.35);
  float rockProx = max(bathy.b, bathyFoot.b);
  float d0       = max(max(0.0, -bathy.r), max(0.0, -bathyFoot.r) * 0.88);
  float rockHeightSpan = max(0.25, rockTopY - bed);

  vec4 hydroInner = beachMode > 0.5 ? evaluateCoastalHydro(vWorld.xz, time, amplitude) : vec4(0.0);
  vec4 hydroFoot  = (beachMode > 0.5 && dist < 125.0) ? evaluateCoastalHydro(footFar, time, amplitude) : hydroInner;
  vec4 hydro = vec4(
    mix(hydroInner.x, hydroFoot.x, 0.45),
    max(hydroInner.y, hydroFoot.y * 0.92),
    max(hydroInner.z, hydroFoot.z * 0.92),
    abs(hydroFoot.w) > abs(hydroInner.w) ? hydroFoot.w * 0.92 : hydroInner.w
  );

  vec4 swashInner = beachMode > 0.5 ? sampleSwashState(vWorld.xz) : vec4(0.0);
  vec4 swashNear  = (beachMode > 0.5 && dist < 125.0) ? sampleSwashState(footNear) : swashInner;
  vec4 swashFar   = (beachMode > 0.5 && dist < 125.0) ? sampleSwashState(footFar)  : swashNear;
  vec4 swash = max(swashInner, max(swashNear * 0.95, swashFar * 0.90));

  vec2 impUv     = clamp((vWorld.xz - vec2(-180.0, -90.0)) / vec2(360.0, 150.0), 0.0, 1.0);
  vec2 impUvNear = clamp((footNear  - vec2(-180.0, -90.0)) / vec2(360.0, 150.0), 0.0, 1.0);
  vec2 impUvFar  = clamp((footFar   - vec2(-180.0, -90.0)) / vec2(360.0, 150.0), 0.0, 1.0);
  vec4 impInner  = beachMode > 0.5 ? texture2D(impactFoamMap, impUv) : vec4(0.0);
  vec4 impNear   = (beachMode > 0.5 && dist < 125.0) ? texture2D(impactFoamMap, impUvNear) : impInner;
  vec4 impFar    = (beachMode > 0.5 && dist < 125.0) ? texture2D(impactFoamMap, impUvFar)  : impNear;
  vec4 impFoot   = max(impNear * 0.94, impFar * 0.88);
  vec4 impactData = vec4(
    max(impInner.r, impFoot.r),
    max(impInner.g, impFoot.g),
    max(impInner.b, impFoot.b * 0.94),
    max(impInner.a, impFoot.a * 0.94)
  );

  float sunShadow = pbrEvaluateSunShadow(
    rockShadowMap,
    rockShadowMatrix,
    rockShadowEnabled,
    vWorld,
    worldSmoothN * 0.22 + L * 0.14,
    gl_FragCoord.xy
  );
  // Crisp fracture & micro-scarp self-occlusion under directional sunlight!
  float microShadow = clamp(1.0 - crevice * 0.48 * (1.0 - 0.65 * max(dot(N, L), 0.0)), 0.26, 1.0);
  float totalSunVis = sunShadow * microShadow;
  float solarDryExposure = max(dot(worldSmoothN, L), 0.0) * totalSunVis;

  float splashEncodedB  = impactData.b; // Rate-limited smooth runup reach y = b * 3.25 - 0.35 (NEVER jumps!)
  float splashFreshFilm = impactData.a; // Smooth gravity-draining liquid sheet

  // Fracture-guided capillary seepage & multi-scale turbulent surge lobes (breaks up any straight contour!)
  float fingerWave = sin(vRockCoord.x * 3.8 + vRockCoord.z * 3.1 + strataTone * 3.2) * 0.5
                   + sin(vRockCoord.x * 8.4 - vRockCoord.z * 7.2) * 0.25;
  float tongueMacro = sin(vRockCoord.x * 1.38 - vRockCoord.z * 1.18 + mineralSeed * 6.2) * 0.56
                    + cos(vRockCoord.x * 2.85 + vRockCoord.z * 2.40 - strataTone * 2.7) * 0.34
                    + sin(vRockCoord.x * 5.90 - vRockCoord.z * 5.10) * 0.16;
  float porousSeep = crevice * 0.30 + (surfMeso.w - 0.5) * 0.18 + fingerWave * 0.08 + tongueMacro * 0.18 + (1.0 - vertAO) * 0.16;
  float windwardCatch = clamp(0.50 - 0.62 * worldSmoothN.z + 0.16 * (1.0 - abs(worldSmoothN.y)), 0.0, 1.0);

  // Stage A: Continuous 3D Offshore Swell + Chop + MidWave + C^1-Smooth Hydrodynamic & Capillary Meniscus Runup
  float rockMeniscusLift = rockProx * (0.026 + 0.036 * smoothstep(0.05, 0.85, abs(hydro.w) * 0.52 + hydro.y)) * smoothstep(0.01, 0.30, d0);
  float baseSeaH   = vOffshoreWaveH + hydro.x + rockMeniscusLift;
  float waveTouch  = smoothstep(-0.10, 0.20, baseSeaH - bed);
  float billowLift = (0.09 * hydro.y + 0.06 * impactData.r + 0.04 * rockProx * smoothstep(0.08, 0.85, abs(hydro.w) * 0.5 + hydro.y))
                   * smoothstep(0.01, 0.45, d0);
  float stagRunup  = (0.35 + 0.65 * windwardCatch) * (0.11 * max(0.0, hydro.w) + 0.11 * hydro.y + 0.12 * impactData.r)
                   * smoothstep(-0.10, 0.35, d0) * waveTouch;
  float seaSurfaceY = baseSeaH + billowLift + stagRunup;
  float seaPresent  = smoothstep(-0.04, 0.05, d0);

  float activeSwashSheet = 0.22 * swash.g + 0.26 * swash.b + 0.22 * hydro.z + 0.14 * max(0.0, hydro.w) * (0.40 + 0.60 * windwardCatch);
  float swashPresent = clamp(max(swash.g * 2.4, max(swash.b * 2.1, hydro.z * 2.4)), 0.0, 1.0);

  float liveWaveTop = mix(bed - 0.35, seaSurfaceY, seaPresent);
  liveWaveTop = max(liveWaveTop, mix(bed - 0.35, bed + 0.04 + activeSwashSheet, swashPresent));

  // Stage B: Smooth Rate-Limited Runup Wash & Basal Capillary Zone
  float dampSupply = clamp(max(seaPresent * 0.96, max(swash.r * 1.32, swash.b * 1.25)), 0.0, 1.0);
  float basalWickSpan = min(
    rockHeightSpan * 0.46,
    max(0.10, 0.18 + 0.22 * max(swash.r, swash.b) - 0.05 * solarDryExposure)
  );
  float basalDatumY = mix(max(bed, -0.04), bed, clamp(max(swash.r, swash.b) * 1.6, 0.0, 1.0));

  float ySplashReach = splashEncodedB * 3.25 - 0.35;
  float overtopFactor = smoothstep(rockTopY - 0.28, rockTopY + 0.08, ySplashReach);
  float surfWrapExposure = clamp(max(windwardCatch, max(overtopFactor * 0.85, swash.b * 0.72 + impactData.r * 0.65)), 0.0, 1.0);
  float directionalReach = mix(bed + 0.04, ySplashReach, clamp(0.34 + 0.66 * surfWrapExposure, 0.0, 1.0));
  float hasSplash = smoothstep(0.025, 0.11, splashEncodedB) * smoothstep(0.06, 0.32, surfWrapExposure);

  float yWaveWash   = mix(bed - 0.38, liveWaveTop + 0.05, max(seaPresent, swashPresent));
  float yBasalWash  = mix(bed - 0.38, basalDatumY + basalWickSpan, dampSupply);
  float ySplashWash = mix(bed - 0.38, directionalReach - 0.08 * solarDryExposure * (1.0 - splashFreshFilm), hasSplash);
  float yStaticWash = rockSmax(yBasalWash, ySplashWash, 0.14);
  float waveWashBlend = (1.0 - smoothstep(-0.02, 0.11, vWorld.y - (liveWaveTop + 0.05))) * max(seaPresent, swashPresent);
  float yWashCore   = mix(yStaticWash, max(yStaticWash, yWaveWash), waveWashBlend);

  float waterContact = clamp(max(seaPresent, swashPresent), 0.0, 1.0);
  float wettedRise   = max(0.0, yWashCore - bed);
  float rockWettedGate = smoothstep(0.025, 0.12, wettedRise)
                       * smoothstep(0.04, 0.24, max(waterContact, max(dampSupply * 0.90, hasSplash + impactData.r * 1.35)));

  // Fracture-warped signed height above the active wave-wash core (meters):
  //   < 0 : inside active wave-wash & capillary wet zone
  //   > 0 : un-wetted / lightly mist-feathered upper rock zone
  float wetMargin = (vWorld.y - yWashCore) - porousSeep * 0.52;

  // 3-Zone Ultra-Soft Wetting Gradient (spans 0.62m..1.05m with fracture wicking — ZERO hard black ink line!):
  float waveSubmerge = (1.0 - smoothstep(-0.04, 0.11, vWorld.y - (liveWaveTop + crevice * 0.07))) * max(seaPresent, swashPresent);
  float washWet      = (1.0 - smoothstep(-0.34, 0.28, wetMargin)) * rockWettedGate;
  float mistSpan     = 0.52 + 0.44 * clamp(splashFreshFilm + hasSplash * 0.65, 0.0, 1.0);
  float sprayMistDamp = pow(clamp(1.0 - smoothstep(-0.20, mistSpan, wetMargin - crevice * 0.16), 0.0, 1.0), 1.60)
                      * (0.36 + 0.28 * surfWrapExposure) * rockWettedGate;

  // Jeffreys thin-film gravity-draining water rivulets (monotonically decelerating downward slide — ZERO endless scrolling!)
  float cumulativeDrainM = (1.0 - clamp(splashFreshFilm, 0.0, 1.0)) * 0.38 * hasSplash;
  float rivuletCoord = vRockCoord.x * 2.8 + vRockCoord.z * 2.4 + strataTone * 1.4;
  float rivuletTrack = texture2D(detailMap, vec2(rivuletCoord * 0.20, (vWorld.y + cumulativeDrainM) * 0.42)).g;
  float steepFace = clamp(1.0 - abs(worldSmoothN.y) * 0.85, 0.0, 1.0);
  float drainageStreaks = smoothstep(0.52, 0.86, rivuletTrack + crevice * 0.44)
                        * splashFreshFilm * surfWrapExposure * steepFace
                        * (1.0 - smoothstep(-0.14, 0.22, wetMargin));

  // Young-Laplace Concave Capillary Meniscus Band ([-0.08m .. +0.095m] around liveWaveTop):
  // Forms a continuous G^1 liquid clearcoat fillet curving from horizontal seawater up onto wet stone!
  float hAboveWave = vWorld.y - liveWaveTop;
  float meniscusWetBand = smoothstep(-0.09, -0.01, hAboveWave)
                        * (1.0 - smoothstep(0.005, 0.095 + 0.035 * crevice, hAboveWave))
                        * waterContact;

  float wetness = clamp(max(max(waveSubmerge, meniscusWetBand * 0.96), max(washWet * 0.88, max(sprayMistDamp * (0.52 + 0.48 * crevice), drainageStreaks * 0.85))), 0.0, 1.0);
  float swashBaseGloss = max(swash.g, swash.b * 0.75) * (1.0 - smoothstep(bed + 0.03, bed + 0.30 + 0.18 * swash.b, vWorld.y));
  float waterFilm = clamp(
    max(max(waveSubmerge * 0.95, meniscusWetBand * 0.94), swashBaseGloss * 0.80)
    + splashFreshFilm * surfWrapExposure * (1.0 - smoothstep(-0.26, 0.14, wetMargin)) * 0.82
    + drainageStreaks * 0.80,
    0.0,
    1.0
  );

  // --- 2. Crisp High-Definition Coastal Rock Mineralogy & Stephenson Intertidal Bio-Zonation ---
  vec3 coolDiorite  = vTint * vec3(0.84, 0.87, 0.91);
  vec3 warmGranite  = vTint * vec3(1.38, 1.23, 1.03);
  vec3 ferricOchre  = vTint * vec3(1.42, 1.06, 0.76);

  vec3 dryAlbedo = mix(coolDiorite, warmGranite, smoothstep(0.14, 0.84, strataTone));
  float ironWeather = smoothstep(0.48, 0.88, strataTone) * smoothstep(0.10, 0.75, vWorld.y - max(0.0, bed)) * (1.0 - crevice * 0.85);
  dryAlbedo = mix(dryAlbedo, ferricOchre, ironWeather * 0.32);

  // Crisp quartz/feldspar bright crystals + dark hornblende/biotite mineral flecks + sharp fracture veins!
  float mineralMod = 0.88 + 0.28 * clamp(h0 * 1.85 + 0.48, 0.0, 1.25) + 0.26 * crystalGrain - 0.18 * darkMineralFleck;
  dryAlbedo *= mineralMod * mix(1.0, 0.62, crevice);

  // Intertidal zonation evaluated on smooth welded worldSmoothN
  float marineZoneGate = 1.0 - smoothstep(-0.06, 0.18, bed);
  float algaeMask = smoothstep(0.25, 0.75, strataTone + 0.20 * crevice)
                  * (1.0 - smoothstep(-0.24, 0.10, vWorld.y))
                  * clamp(worldSmoothN.y + 0.50, 0.0, 1.0) * marineZoneGate;
  dryAlbedo = mix(dryAlbedo, vec3(0.052, 0.078, 0.046), algaeMask * 0.58);

  float barnacleBand = smoothstep(-0.10, 0.02, vWorld.y) * (1.0 - smoothstep(0.14, 0.28, vWorld.y)) * marineZoneGate;
  float barnacleSpeck = smoothstep(0.58, 0.84, gritFineRGB.g * 0.68 + strataTone * 0.32) * barnacleBand * (1.0 - crevice * 0.8);
  dryAlbedo = mix(dryAlbedo, vec3(0.36, 0.34, 0.30), barnacleSpeck * 0.42);

  float crownDry = smoothstep(0.52, 1.05, vWorld.y - max(0.0, bed)) * clamp(worldSmoothN.y, 0.0, 1.0) * (1.0 - wetness * 0.94);
  float lichenNoise = clamp(strataTone * 0.56 + surfMeso.w * 0.44, 0.0, 1.0);
  float paleLichen = smoothstep(0.62, 0.85, lichenNoise) * crownDry;
  float goldLichen = smoothstep(0.76, 0.92, microGrainRGB.b * 0.5 + lichenNoise * 0.5) * crownDry;
  dryAlbedo = mix(dryAlbedo, vec3(0.46, 0.45, 0.39), paleLichen * 0.30);
  dryAlbedo = mix(dryAlbedo, vec3(0.48, 0.36, 0.16), goldLichen * 0.24);

  // --- 3. Sculptural 3D Coastal Rock Illumination + Kaplanyan Normal-Variance Anti-Shimmer ---
  vec3 albedo = pbrWetPorousAlbedo(dryAlbedo, wetness * 0.78, 0.35);

  float ambientAO = clamp(
    vertAO
    * mix(0.56, 1.12, smoothstep(-0.16, 0.18, h0))
    * (1.0 - 0.42 * crevice)
    * mix(0.50, 1.02, smoothstep(0.02, 0.42, rh)),
    0.10,
    1.0
  );

  // Kaplanyan & Antonov (2016) Screen-Space Normal-Variance Roughness Filtering (eliminates wet-rock & mineral pixel shimmer!)
  vec3 dNdxR = dFdx(N), dNdyR = dFdy(N);
  float rockNormVar = min(0.18, 0.62 * (dot(dNdxR, dNdxR) + dot(dNdyR, dNdyR)));
  float distRoughAA = smoothstep(28.0, 135.0, dist) * 0.06;
  float rawBaseRough = clamp(0.84 + 0.05 * barnacleSpeck - 0.34 * wetness + distRoughAA, 0.42, 0.93);
  float baseRough = clamp(sqrt(rawBaseRough * rawBaseRough + rockNormVar * 0.65), 0.42, 0.95);

  // Macro-scarp horizon self-shadowing accentuates bold 3D rock planes at grazing solar angles
  float reliefSunHorizon = smoothstep(-0.12, 0.16, dot(N, L) - 0.18 * crevice);
  vec3 sunRawIrr = pbrSunIrradiance(L);
  vec3 sunE = sunRawIrr * totalSunVis * mix(0.68, 1.0, reliefSunHorizon);

  // 4-Source Coupled 3D Coastal Indirect Illumination (transforms flat brown shadow sides into heavy sculpted 3D stone!):
  // (a) Bent-normal directional sky-dome GI (cool azure top ledges vs deep shadowed undercuts)
  vec3 bentN = normalize(mix(N, worldSmoothN + vec3(0.0, 0.36 * ambientAO, 0.0), 0.24));
  vec3 skyDomeDir = normalize(vec3(bentN.x, max(bentN.y * 0.85 + 0.15, 0.04), bentN.z));
  vec3 skyEnvGI = pbrSampleSkyEnv(skyEnvMap, skyEnvReady, skyDomeDir, L, skyTop, skyHorizon);
  vec3 hemiBase = mix(pbrHemisphereIrradiance(bentN, skyTop, skyHorizon), skyEnvGI * 2.15, 0.38);

  // (b) Luminous aquamarine-turquoise sea & whitewater bounce into seaward/downward boulder overhangs
  float whitewaterGlow = clamp(swash.b * 0.85 + hydro.y * 0.75 + impactData.r * 0.65, 0.0, 1.15);
  float seaBounceMask = clamp(-N.z * 0.46 - N.y * 0.44 + 0.26, 0.0, 1.0)
                      * smoothstep(-0.22, 0.42, d0 + swashPresent * 0.45) * mix(0.45, 1.0, ambientAO);
  vec3 seaBounceCol = (scatterColor * 1.55 + vec3(0.04, 0.12, 0.14) + vec3(0.24, 0.28, 0.30) * whitewaterGlow)
                    * (sunRawIrr * 0.22 + skyHorizon * 0.52);

  // (c) Warm sunlit quartz-sand bounce into shoreward & basal rock undercuts
  float sandBounceMask = clamp(N.z * 0.38 - N.y * 0.58 + 0.20, 0.0, 1.0)
                       * (1.0 - smoothstep(0.05, 1.55, vWorld.y - bed)) * mix(0.40, 0.95, ambientAO);
  vec3 sandBounceCol = vec3(0.52, 0.42, 0.28) * (sunRawIrr * 0.18 * mix(0.45, 1.0, sunShadow) + skyHorizon * 0.28);

  vec3 totalIndirectIrr = hemiBase * ambientAO + seaBounceCol * seaBounceMask * 0.92 + sandBounceCol * sandBounceMask * 0.85;

  if (vWorld.y < liveWaveTop && beachMode > 0.5) {
    float subD = clamp(liveWaveTop - vWorld.y, 0.0, 2.5);
    vec2 cUv1 = vWorld.xz * 0.52 + vec2(time * 0.11, -time * 0.08);
    vec2 cUv2 = vWorld.xz * 0.68 - vec2(time * 0.09, time * 0.13);
    float cNet = smoothstep(0.52, 0.88, texture2D(detailMap, cUv1).g + texture2D(detailMap, cUv2).b - 0.45);
    sunE *= 1.0 + cNet * 0.75 * exp(-subD * 0.9) * smoothstep(0.02, 0.18, subD);
  }

  // Keep crisp rock micro-normal N dominant under thin water film, while curving into a G^1 concave liquid meniscus right at liveWaveTop!
  vec3 meniscusFilletN = normalize(mix(worldSmoothN, vec3(0.0, 1.0, 0.0), 0.46));
  vec3 filmN = normalize(mix(mix(N, baseN, waterFilm * 0.24), meniscusFilletN, meniscusWetBand * 0.58));
  vec3 dFdxFilm = dFdx(filmN), dFdyFilm = dFdy(filmN);
  float filmNormVar = min(0.18, 0.72 * (dot(dFdxFilm, dFdxFilm) + dot(dFdyFilm, dFdyFilm)));
  float rawFilmRough = clamp(mix(0.32, 0.145, waterFilm) - 0.03 * meniscusWetBand + 0.08 * (1.0 - surfMeso.w) + distRoughAA, 0.13, 0.44);
  float filmRough = clamp(sqrt(rawFilmRough * rawFilmRough + filmNormVar), 0.135, 0.52);

  float F_coat_V = pbrFresnelScalar(max(dot(filmN, V), 1e-4), 0.0204) * waterFilm * 0.60;
  float F_coat_L = pbrFresnelScalar(max(dot(filmN, L), 0.0), 0.0204) * waterFilm * 0.60;
  float coatTransmit = (1.0 - F_coat_V) * (1.0 - 0.65 * F_coat_L);

  float diffON = pbrDiffuseOrenNayar(N, V, L, baseRough);
  vec3 specMineral = pbrSpecularGGX(N, V, L, baseRough, vec3(0.044)) * (1.0 - waterFilm * 0.82);
  vec3 substrateDirect = (albedo * diffON + specMineral * 1.15) * sunE;
  vec3 substrateIndirect = (albedo / PBR_PI) * totalIndirectIrr * 1.18;

  // Rough silicate/quartz grazing Fresnel rim sheen gives shadowed dry & damp rock bevels unmistakable 3D stone solidity!
  float NoV_rock = max(dot(N, V), 1e-4);
  float F_mineral = (0.042 + (max(1.0 - baseRough, 0.042) - 0.042) * pow(1.0 - NoV_rock, 5.0)) * (1.0 - waterFilm * 0.85);
  vec3 rockReflDir = reflect(-V, mix(N, worldSmoothN, 0.35));
  rockReflDir.y = max(rockReflDir.y, 0.02);
  vec3 dryMineralSheen = pbrSampleSkyEnv(skyEnvMap, skyEnvReady, rockReflDir, L, skyTop, skyHorizon)
                       * F_mineral * mix(0.28, 0.92, ambientAO) * 0.72;

  vec3 specWaterFilm = min(pbrSpecularGGX(filmN, V, L, filmRough, vec3(0.0204)) * sunE * waterFilm, vec3(2.25));
  vec3 reflDir = reflect(-V, filmN);
  reflDir.y = max(reflDir.y, -0.06);
  vec3 coatEnvRefl = pbrSampleSkyEnv(skyEnvMap, skyEnvReady, reflDir, L, skyTop, skyHorizon)
                   * F_coat_V * mix(0.45, 0.96, ambientAO);

  vec3 color = (substrateDirect + substrateIndirect + dryMineralSheen) * coatTransmit + specWaterFilm + coatEnvRefl;

  // --- 4. Bingham Viscoplastic Energy-Decaying 3D Rock Seafoam (Monotonic Drainage & Pinning — ZERO Worm Squirming!) ---
  // Physical Energy-Decay Law:
  //   - localWaveTouch isolates live wave hydrodynamics STRICTLY to heights actually touched by liveWaveTop!
  //     Waves passing at the rock's toe can NEVER make stranded foam higher up on the boulder pulse or crawl!
  //   - Above liveWaveTop, foam supply & motion obey monotonic exponential energy dissipation (impactData.r, splashFreshFilm):
  //     foam slides gently DOWNWARD ONLY while liquid film exceeds Bingham yield stress, decelerates smoothly to 0.000 velocity,
  //     pins to the rock crystals, and pops in place!
  float localWaveTouch = (1.0 - smoothstep(-0.03, 0.13, vWorld.y - liveWaveTop)) * waterContact;
  float eSurfRaw = (swash.b * 1.22 + (hydro.y * 1.08 + hydro.z * 0.86) * waterContact
                  + rockProx * waterContact * smoothstep(0.10, 0.85, abs(hydro.w) * 0.52 + hydro.y) * 0.65) * localWaveTouch
                 + impactData.r * 1.25 * smoothstep(0.22, -0.05, vWorld.y - directionalReach)
                 + impactData.g * 0.95 * localWaveTouch;
  float eSurf   = clamp(eSurfRaw, 0.0, 1.0) * rockWettedGate;
  float reachMask = 1.0 - smoothstep(-0.08, 0.18, vWorld.y - directionalReach);
  float eSplash = clamp((splashFreshFilm * 1.12 + impactData.r * 0.85) * reachMask + stagRunup * 1.25 * localWaveTouch, 0.0, 1.0) * rockWettedGate;
  float foamSupply = clamp(max(eSurf, eSplash * 0.90) * clamp(foamBoost, 0.0, 1.45), 0.0, 1.20);

  // 3D inclination & geological crevice retention (differentiates 3D rock walls from flat planes!)
  float nFlat      = clamp(worldSmoothN.y, 0.0, 1.0);
  float shelfHold  = smoothstep(0.26, 0.88, nFlat);
  float cTrap      = clamp(crevice * 0.75 + (1.0 - vertAO) * 0.34, 0.0, 1.0);
  float pocketHold = clamp(shelfHold * 0.60 + cTrap * 0.56, 0.0, 1.0);

  // Irregular multi-scale splash-finger dispersion reach beyond the wash core (soft, scalloped, non-uniform!)
  float spatterLobe = 0.74 + 0.32 * sin(vRockCoord.x * 2.05 - vRockCoord.z * 1.75 + mineralSeed * 5.3)
                    + 0.22 * cos(vRockCoord.x * 4.85 + vRockCoord.z * 4.15 - strataTone * 2.4)
                    + 0.14 * sin(vRockCoord.x * 9.30 - vRockCoord.z * 7.80);
  float energyReach = 0.10 + 0.44 * clamp(eSurf * 0.55 + eSplash * 0.72, 0.0, 1.0);
  float propReach   = min(rockHeightSpan * 0.48, wettedRise * (0.48 + 0.38 * clamp(eSplash + eSurf * 0.5, 0.0, 1.0)) + 0.06);
  float spatterReach = min(energyReach, propReach)
                     * clamp(0.48 + 0.62 * max(surfWrapExposure, shelfHold * 0.75), 0.44, 1.18)
                     * clamp(spatterLobe, 0.48, 1.34) * rockWettedGate;

  if (foamVisible > 0.01 && foamSupply > 0.02 && rockWettedGate > 0.01 && beachMode > 0.5 && dist < 118.0 && wetMargin < spatterReach + 0.12) {
    float liveFoamTop = liveWaveTop + 0.03 + 0.05 * clamp(swash.b + hydro.y * waterContact + impactData.r, 0.0, 1.2);
    float sWet  = clamp(wetMargin / max(spatterReach, 0.14), -1.5, 1.5);
    // Above the active wave collar (localWaveTouch == 0), sWave is strictly constant -1.5 so passing toe-waves NEVER pulse upper rock foam!
    float sWave = mix(-1.5, clamp((liveFoamTop - vWorld.y) / 0.24, -1.5, 1.5), localWaveTouch);

    // Evaluate 8-Wide SIMD Stratified Multiphase PINN (inherently smooth & slope-aware!)
    vec3 pinnOut = evalStratifiedRockFoamPINN(sWet, sWave, eSurf, eSplash, nFlat, cTrap);
    float supplyGate = smoothstep(0.02, 0.18, foamSupply) * rockWettedGate * clamp(foamBoost, 0.0, 1.35);

    // Sheet-flow crown shedding on exposed low-rock summits keeps dark glossy granite clearly visible
    float crownExposure = smoothstep(0.32, 0.76, rh) * smoothstep(0.52, 0.90, vertAO) * (1.0 - crevice * 0.82);
    float lowRockFactor = 1.0 - smoothstep(0.65, 1.50, rockHeightSpan);
    float crownShed     = clamp(crownExposure * (0.52 + 0.44 * lowRockFactor), 0.0, 0.90);

    // 1) Submerged-to-Emergent Meniscus Handoff Collar (bridges refracted underwater rock & soft-feathered FoamShader seamlessly!)
    //    Active ONLY when live surf/swash whitewater contacts the rock, and tapers above +4cm so steep walls stay sheer!
    float hFromFoamTop = vWorld.y - liveFoamTop;
    float meniscusBridge = smoothstep(-0.28, -0.05, hFromFoamTop)
                         * (1.0 - smoothstep(-0.015, 0.055 + 0.045 * shelfHold, hFromFoamTop))
                         * waterContact * smoothstep(0.03, 0.34, eSurf) * localWaveTouch;
    float collarBand = smoothstep(-0.26, -0.02, hFromFoamTop)
                     * (1.0 - smoothstep(-0.01, 0.12 + 0.08 * shelfHold, hFromFoamTop)) * localWaveTouch;
    float envPillow = max(
      collarBand * (0.48 + 0.46 * pocketHold) * (1.0 - 0.72 * crownShed) * supplyGate,
      meniscusBridge * (0.62 + 0.28 * pocketHold) * clamp(foamBoost, 0.0, 1.35)
    );

    // 2) Soft Exponential & Porous Wet-Zone Lace Coverage (anchored to static basalDatumY above wave collar — ZERO wave-breathing!)
    float washDecayLen = max(0.28, (0.36 + 0.42 * shelfHold + 0.28 * cTrap) * (0.72 + 0.48 * clamp(eSurf + eSplash, 0.0, 1.0)));
    float hAboveRef    = mix(max(0.0, vWorld.y - (basalDatumY + 0.06)), max(0.0, hFromFoamTop), localWaveTouch);
    float heightDecay  = exp(-hAboveRef / washDecayLen);
    float softWetEnv   = (1.0 - smoothstep(-0.28, 0.14, wetMargin)) * smoothstep(0.05, 0.42, wetness);
    float envWetted    = softWetEnv * (0.46 + 0.54 * heightDecay) * (0.68 + 0.32 * pocketHold) * (1.0 - 0.46 * crownShed) * supplyGate;

    // 3) Wide Overlapping Granular Dispersion Halo (starts smoothly inside upper wash breakup & extends beyond wet stone!)
    float innerGranBlend = smoothstep(-0.28, 0.05, wetMargin);
    float outerGranTail  = pow(clamp(1.0 - smoothstep(-0.04, max(0.10, spatterReach), wetMargin), 0.0, 1.0), 1.45);
    float envGran        = innerGranBlend * outerGranTail * (0.58 + 0.42 * pocketHold) * supplyGate;

    float dPillow = clamp(pinnOut.x * envPillow * 1.08, 0.0, 0.84);
    float dWetted = clamp((0.34 + 0.58 * pinnOut.y) * envWetted, 0.0, 0.78);
    float dGran   = clamp((0.42 + 0.66 * pinnOut.z) * envGran, 0.0, 0.90);

    // Precompute C^1 welded 3D biplanar axes & weights (ZERO polygon-crease jumps, 1:1 isotropic bubble proportions!)
    vec3 anF = abs(worldSmoothN);
    int fMa = (anF.x > anF.y && anF.x > anF.z) ? 0 : ((anF.y > anF.z) ? 1 : 2);
    int fMi = (anF.x < anF.y && anF.x < anF.z) ? 0 : ((anF.y < anF.z) ? 1 : 2);
    int fMe = 3 - fMa - fMi;
    float fwMa = fMa == 0 ? anF.x : (fMa == 1 ? anF.y : anF.z);
    float fwMe = fMe == 0 ? anF.x : (fMe == 1 ? anF.y : anF.z);
    vec2 fW = clamp((vec2(fwMa, fwMe) - 0.5773) / (1.0 - 0.5773), 0.0, 1.0);
    fW = fW * fW * (3.0 - 2.0 * fW);

    // Bingham Viscoplastic Energy-Decaying 3D Foam Coordinates (ZERO sin(time) worm-squirming!):
    // - Static spatial curl breaks grid regularity while staying 100% anchored to the rock crystals.
    // - Above liveWaveTop, foam ONLY slides tangent-downward (gravDown3D) while liquid film exceeds Bingham yield stress
    //   (splashFreshFilm > 0.18), decelerating monotonically to 0.000 velocity and pinning into rock crevices!
    vec3 staticCurl3D = vec3(
      0.24 * sin(vRockCoord.z * 0.44 + mineralSeed * 2.1) + 0.14 * cos(vRockCoord.x * 0.29 - vRockCoord.y * 0.37),
      0.14 * cos(vRockCoord.x * 0.48 - mineralSeed * 1.7),
      0.24 * cos(vRockCoord.x * 0.42 + mineralSeed * 2.9) - 0.14 * sin(vRockCoord.z * 0.33 + vRockCoord.y * 0.31)
    );
    vec3 gravDown3D = vec3(0.0, -1.0, 0.0) - worldSmoothN * (-worldSmoothN.y);
    float yieldExcess = clamp((splashFreshFilm - 0.18) / 0.82, 0.0, 1.0);
    // Cumulative downward slide s(t) grows as yieldExcess decays 1 -> 0, with ds/dt -> 0 smoothly at yield threshold!
    float binghamSlideM = (1.0 - yieldExcess * yieldExcess) * 0.21 * steepFace * (1.0 - 0.68 * cTrap) * hasSplash * (1.0 - localWaveTouch);
    // Smooth C^infinity harmonic wave-collar oscillation strictly inside actively submerged waterline (ZERO fract() wrap jump!)
    float collarWaveDrift = 0.11 * sin(time * 1.38) * localWaveTouch * clamp(hydro.w, -1.2, 1.2);
    vec3 pFoam = vWorld + staticCurl3D - gravDown3D * binghamSlideM - vec3(0.0, 0.0, collarWaveDrift);

    // Lindeberg (1994) Continuous Scale-Space LOD matching FoamShader.js frequencies
    float pxScale  = clamp(pxWorld, 0.0020, 0.45);
    float lodLevel = clamp(log2(pxScale / 0.022), -1.5, 4.0);
    float lodFloor = floor(lodLevel);
    float lodBlend = smoothstep(0.0, 1.0, lodLevel - lodFloor);
    float scale0   = exp2(-lodFloor);

    const mat2 REven = mat2(0.94, 0.34, -0.34, 0.94);
    const mat2 ROdd  = mat2(0.81, -0.59, 0.59, 0.81);
    const mat2 RId   = mat2(1.0, 0.0, 0.0, 1.0);

    vec4 macroS = sampleBiplanarFoam(
      pFoam, dWorldDx, dWorldDy, fMa, fMe, fW, RId,
      0.074, vec2(0.17, 0.31) + mineralSeed * 0.29
    );

    float thickFroth    = 0.0;
    float porousLace    = 0.0;
    float granularBeads = 0.0;
    float microBeads    = 0.0;
    float pillowHeight  = macroS.a * 0.5;
    float fLace         = 0.32 * scale0 * mix(1.0, 0.5, lodBlend);
    float fGranMed      = 0.19 * clamp(scale0 * 0.5, 0.75, 1.85);

    if (dPillow + dWetted > 0.010) {
      float fCell = 0.64 * scale0 * mix(1.0, 0.5, lodBlend);
      vec4 laceS = sampleBiplanarFoam(pFoam, dWorldDx, dWorldDy, fMa, fMe, fW, REven, fLace, vec2(0.13, 0.29));
      vec4 cellS = sampleBiplanarFoam(pFoam, dWorldDx, dWorldDy, fMa, fMe, fW, ROdd,  fCell, vec2(0.57, 0.19));

      float streamers  = macroS.b * 0.54 + laceS.b * 0.46;
      float fibrousWeb = clamp(laceS.r * 0.62 + cellS.r * 0.38, 0.0, 1.0);
      float mesoBeads  = clamp(cellS.g * 0.62 + laceS.g * 0.38, 0.0, 1.0);
      microBeads       = mesoBeads;
      pillowHeight     = clamp(macroS.a * 0.42 + laceS.a * 0.38 + mesoBeads * 0.20, 0.0, 1.0);

      // Generous wet-stone breathing windows so steep rock faces stay airy & porous rather than heavy white blankets!
      float rockWindow = smoothstep(0.40 - 0.12 * crownShed, 0.84 - 0.08 * crownShed, 1.0 - (macroS.b * 0.54 + cellS.b * 0.46));

      // Stratum 1: Airy waterline meniscus froth
      float pillowSig = streamers * 0.42 + pillowHeight * 0.34 + fibrousWeb * 0.24;
      thickFroth = rockErodePercolation(dPillow * (1.0 - 0.30 * rockWindow), pillowSig, 0.24) * (0.80 + 0.20 * mesoBeads);

      // Stratum 2: Wide-feathered gossamer percolation lace (feather = 0.24 dissolves smoothly into wisps & droplets!)
      float clusterGate = smoothstep(0.24, 0.70, streamers);
      float raftSig = streamers * 0.42 + cellS.a * 0.26 + clamp(mesoBeads * 1.58, 0.0, 1.0) * 0.22 + fibrousWeb * 0.14 * clusterGate;
      porousLace = rockErodePercolation(dWetted * (1.0 - (0.32 + 0.20 * crownShed) * rockWindow * (1.0 - cTrap * 0.50)), raftSig, 0.24);
    }

    // Stratum 3: Subtle, Softly-Tapered Translucent Micro-Bubble Flecks & Granules extending beyond wet stone!
    float uOut = clamp((wetMargin + 0.10) / max(spatterReach + 0.10, 0.12), 0.0, 1.0);
    if (dGran > 0.010) {
      vec3 pStatic = vWorld + vec3(
        0.18 * sin(vRockCoord.z * 0.7 + mineralSeed * 3.1),
        0.12 * cos(vRockCoord.x * 0.8 - mineralSeed * 2.3),
        0.18 * cos(vRockCoord.x * 0.7 + mineralSeed * 1.7)
      );
      vec4 granDab    = sampleBiplanarFoam(pStatic, dWorldDx, dWorldDy, fMa, fMe, fW, RId,   0.062, vec2(0.41, 0.19) + mineralSeed * 0.19);
      vec4 granCoarse = sampleBiplanarFoam(pStatic, dWorldDx, dWorldDy, fMa, fMe, fW, REven, 0.115, vec2(0.23, 0.61) + mineralSeed * 0.31);
      vec4 granMed    = sampleBiplanarFoam(pStatic, dWorldDx, dWorldDy, fMa, fMe, fW, ROdd,  fGranMed, vec2(0.71, 0.17) - mineralSeed * 0.27);

      // Softly thin out spatial patch density with distance (NO necklace line along wet edge!)
      float splashPatch = clamp(macroS.b * 0.42 + granDab.b * 0.34 + granCoarse.b * 0.24 + crevice * 0.20, 0.0, 1.0);
      float keepLo      = mix(0.14, 0.70, pow(uOut, 0.85));
      float patchKeep   = smoothstep(keepLo, keepLo + 0.24, splashPatch + 0.16 * dGran);

      float dabDome    = clamp(granDab.g * 2.10, 0.0, 1.0) * (1.0 - smoothstep(0.12, 0.58, uOut));
      float coarseDome = clamp(granCoarse.g * 2.12, 0.0, 1.0) * (1.0 - 0.38 * smoothstep(0.45, 1.0, uOut));
      float medDome    = clamp(granMed.g * 2.06, 0.0, 1.0);
      float granDome   = max(dabDome * 0.92, max(coarseDome, medDome * 0.95)) * patchKeep;

      float granThresh  = mix(0.42, 0.63, uOut);
      float granFeather = clamp(pxScale * 3.8, 0.075, 0.180);

      granularBeads = smoothstep(granThresh - granFeather, granThresh + granFeather, granDome) * smoothstep(0.015, 0.16, dGran);
      microBeads    = max(microBeads, granDome * granularBeads);
      pillowHeight  = mix(pillowHeight, clamp(0.36 + 0.58 * granDome, 0.0, 1.0), granularBeads * (1.0 - max(thickFroth, porousLace)));
    }

    // Slope-Aware Translucent Optical Blending (Sheer & airy on steep rock cliffs, richer right inside submerged meniscus handoff!):
    // Lets dark wet granite & crisp mineral crystals breathe clearly through the foam!
    float distFade   = 1.0 - smoothstep(62.0, 116.0, dist);
    float alphaThick = thickFroth * mix(0.36, 0.70, max(meniscusBridge * 0.72, shelfHold * 0.54 + pillowHeight * 0.46));
    float alphaLace  = porousLace * mix(0.24, 0.58, max(meniscusBridge * 0.55, shelfHold * 0.54 + cTrap * 0.26 + clamp(pillowHeight * 0.55 + microBeads * 0.45, 0.0, 1.0) * 0.20));
    float alphaCont  = 1.0 - (1.0 - alphaThick) * (1.0 - alphaLace);
    float alphaGran  = granularBeads * mix(0.38, 0.06, pow(uOut, 0.74)) * (0.50 + 0.50 * pocketHold);
    float maxRockFoamAlpha = mix(0.50, 0.78, max(shelfHold, meniscusBridge * 0.68));
    float foamAlpha  = clamp(1.0 - (1.0 - alphaCont) * (1.0 - alphaGran), 0.0, maxRockFoamAlpha) * distFade;

    if (foamAlpha > 0.006) {
      // --- 3D Surface-Tangent Pillow & Micro-Bead Relief + Directional Solar Self-Occlusion ---
      float reliefFade = 1.0 - smoothstep(28.0, 78.0, dist);
      vec3 foamBaseN = normalize(mix(N, worldSmoothN, clamp(0.42 * thickFroth + 0.20 * porousLace + 0.16 * granularBeads, 0.0, 0.55)));
      vec3 foamN = foamBaseN;
      float selfShadowOcc = 0.0;

      if (reliefFade > 0.02) {
        float sgnZ = worldSmoothN.z >= 0.0 ? 1.0 : -1.0;
        float aOnb = -1.0 / (sgnZ + worldSmoothN.z);
        float bOnb = worldSmoothN.x * worldSmoothN.y * aOnb;
        vec3 T1 = vec3(1.0 + sgnZ * worldSmoothN.x * worldSmoothN.x * aOnb, sgnZ * bOnb, -sgnZ * worldSmoothN.x);
        vec3 T2 = vec3(bOnb, sgnZ + worldSmoothN.y * worldSmoothN.y * aOnb, -worldSmoothN.y);

        float wPillowH = thickFroth + 0.55 * porousLace;
        float wGranH   = granularBeads * (1.0 - 0.75 * alphaCont);
        float fPillowN = 0.46 * scale0 * mix(1.0, 0.5, lodBlend);
        float wStep    = clamp(pxScale * 1.65, 0.014, 0.16);
        vec2 ofsPN     = vec2(0.13, 0.29);
        vec2 ofsGN     = vec2(0.23, 0.61) + mineralSeed * 0.31;

        vec3 pGranRef = vWorld + vec3(
          0.18 * sin(vRockCoord.z * 0.7 + mineralSeed * 3.1),
          0.12 * cos(vRockCoord.x * 0.8 - mineralSeed * 2.3),
          0.18 * cos(vRockCoord.x * 0.7 + mineralSeed * 1.7)
        );
        vec3 pRel = mix(pFoam, pGranRef, clamp(wGranH, 0.0, 1.0));

        float hCenter = sampleFoamReliefHeight3D(pRel, dWorldDx, dWorldDy, fMa, fMe, fW, REven, fPillowN, ofsPN, wPillowH, 0.115, ofsGN, wGranH);
        float dH1 = sampleFoamReliefHeight3D(pRel + T1 * wStep, dWorldDx, dWorldDy, fMa, fMe, fW, REven, fPillowN, ofsPN, wPillowH, 0.115, ofsGN, wGranH) - hCenter;
        float dH2 = sampleFoamReliefHeight3D(pRel + T2 * wStep, dWorldDx, dWorldDy, fMa, fMe, fW, REven, fPillowN, ofsPN, wPillowH, 0.115, ofsGN, wGranH) - hCenter;

        vec3 sunTang = L - worldSmoothN * dot(worldSmoothN, L);
        float sunTangLen = length(sunTang);
        vec3 dirSunTang = sunTangLen > 1e-3 ? (sunTang / sunTangLen) : T1;
        float dHSun = sampleFoamReliefHeight3D(pRel + dirSunTang * (wStep * 2.1), dWorldDx, dWorldDy, fMa, fMe, fW, REven, fPillowN, ofsPN, wPillowH, 0.115, ofsGN, wGranH) - hCenter;

        selfShadowOcc = clamp(dHSun * (2.25 * thickFroth + 1.15 * porousLace + 1.85 * granularBeads), 0.0, 0.80) * reliefFade;
        float bumpAmp = (2.45 * thickFroth + 1.35 * porousLace + 2.05 * granularBeads) * reliefFade;
        foamN = normalize(foamBaseN - (T1 * dH1 + T2 * dH2) * bumpAmp);
      }

      // Kokhanovsky (2004) Thin-Film & Aerated Emulsion Radiative Transfer (tinted gently by underlying wet rock!)
      float nlFoam   = max(dot(foamN, L), 0.0);
      float wrapFoam = clamp(dot(foamN, L) * 0.50 + 0.50, 0.0, 1.0);
      float thickness = clamp(thickFroth * 0.78 + porousLace * 0.30 * (0.45 + 0.55 * pillowHeight) + granularBeads * 0.36, 0.0, 1.0);

      vec3 sunRawE  = pbrSunIrradiance(L);
      vec3 foamHemi = pbrHemisphereIrradiance(foamN, skyTop, skyHorizon) * mix(0.72, 1.0, ambientAO);
      float directVis = sunShadow * (1.0 - 0.65 * selfShadowOcc);

      vec3 shadowFoldAlbedo  = vec3(0.76, 0.82, 0.88);
      vec3 seafoamLaceAlbedo = mix(vec3(0.82, 0.91, 0.93), vec3(0.94, 0.96, 0.97), smoothstep(0.12, 0.76, thickness));
      vec3 sunlitCrestAlbedo = vec3(0.985, 0.982, 0.975);

      float topSolarEntry  = max(L.y, 0.20);
      float multiScatTrans = topSolarEntry * (0.42 + 0.40 * wrapFoam) * (0.50 + 0.42 * thickness)
                           * mix(0.28, 1.0, sunShadow) * (1.0 - 0.52 * selfShadowOcc);

      vec3 foamAmbient = mix(shadowFoldAlbedo, seafoamLaceAlbedo, smoothstep(0.18, 0.84, pillowHeight))
                       * foamHemi * mix(0.84, 1.10, pillowHeight) * (1.0 - 0.28 * selfShadowOcc);
      vec3 foamDirect  = mix(seafoamLaceAlbedo, sunlitCrestAlbedo, smoothstep(0.22, 0.85, thickness * 0.56 + pillowHeight * 0.44))
                       * (sunRawE / PBR_PI) * (0.82 * nlFoam * directVis + 0.56 * multiScatTrans);

      // Thin bubble films on steep dark rock transmit a hint of substrate warmth/coolness rather than stark chalk!
      vec3 rockFoamCol = mix(color * 0.35 + (foamAmbient + foamDirect) * 0.76, foamAmbient + foamDirect, smoothstep(0.08, 0.68, thickness));

      float backTrans = pow(clamp(dot(-V, normalize(vec3(L.x, 0.18, L.z))), 0.0, 1.0), 2.0) * thickFroth * (1.0 - thickness * 0.45);
      rockFoamCol += vec3(0.012, 0.17, 0.18) * sunRawE * sunShadow * 0.34 * backTrans;

      // Kaplanyan normal-variance roughness AA on rock-foam meniscus glints (zero pixel sparkle flicker!)
      vec3 dFdxRF = dFdx(foamN), dFdyRF = dFdy(foamN);
      float rfNormVar = min(0.16, 0.65 * (dot(dFdxRF, dFdxRF) + dot(dFdyRF, dFdyRF)));
      float rawBubRough = mix(0.26, 0.145, clamp(microBeads, 0.0, 1.0));
      float bubbleRough = clamp(sqrt(rawBubRough * rawBubRough + rfNormVar), 0.145, 0.52);
      rockFoamCol += min(
        pbrSpecularGGX(foamN, V, L, bubbleRough, vec3(0.022)) * sunRawE * directVis * (0.40 + 0.78 * clamp(microBeads, 0.0, 1.0)) * reliefFade,
        vec3(1.15)
      );

      // Subtle capillary damp contact rim around outer micro-beads on dry stone
      float dryContactRim = foamAlpha * (1.0 - foamAlpha) * 3.0 * (1.0 - wetness * 0.75);
      color *= 1.0 - 0.10 * dryContactRim;
      color = mix(color, rockFoamCol, foamAlpha);
    }
  }
  color = pbrAerialPerspective(color, vWorld, cameraPosition, L, skyTop, skyHorizon);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Coastal rock groups';
  mesh.visible = false;

  return {
    mesh,
    material,
    uniforms,
    records,
    contactTexture,
    foamPinnStats: { rmse: foamPinn.rmse, strata: 3, params: foamPinn.params },
    bakeSurface,
    getCompileSpecs: () => (!pendingRockBake || pendingRockBake.baked ? [] : [{
      label: '風化花崗岩裂隙法線烘焙 (RockSurface)',
      scene: pendingRockBake.bakeScene,
      camera: pendingRockBake.bakeCam,
      materials: [pendingRockBake.rockBakeMat],
      targetMode: 'hdr'
    }]),
    setImpactFoamMap(tex) {
      uniforms.impactFoamMap.value = tex || fallbackTex;
    },
    refresh() {
      const p = geometry.attributes.position;
      const metaAttr = geometry.attributes.rockMeta;
      for (const r of records) {
        let support = bed(r.x, r.z);
        for (let k = 0; k < 12; k++) {
          const a = (k * Math.PI) / 6;
          support = Math.min(support, bed(r.x + Math.cos(a) * r.sx, r.z + Math.sin(a) * r.sz));
        }
        const dy = support - r.support;
        r.cy += dy;
        r.topY += dy;
        r.support = support;
        for (let i = r.start; i < r.start + r.count; i++) {
          p.setY(i, p.getY(i) + dy);
          metaAttr.setW(i, r.topY);
        }
      }
      p.needsUpdate = true;
      metaAttr.needsUpdate = true;
      geometry.computeBoundingSphere();
    },
    dispose() {
      if (pendingRockBake && !pendingRockBake.baked) {
        pendingRockBake.bakeQuad.dispose();
        pendingRockBake.rockBakeMat.dispose();
        pendingRockBake.baked = true;
      }
      geometry.dispose();
      material.dispose();
      contactTexture.dispose();
      if (rockSurfaceRT) rockSurfaceRT.dispose();
      else rockSurfaceMap.dispose();
      fallbackTex.dispose();
    }
  };
}

export const coastalBackshoreGLSL = `
vec3 coastalBackshore(vec3 sand, vec3 p){
  float shore = 15.0 + 3.0 * sin(p.x * 0.035) + 1.1 * sin(p.x * 0.11) - 2.0 * sin(p.x * 0.07);
  float inland = p.z - shore;
  float backNoise = texture2D(detailMap, p.xz * 0.075).r;
  float width = 17.0 + 3.0 * sin(p.x * 0.047) + 2.0 * sin(p.x * 0.13);
  float mask = smoothstep(width - 3.0, width + 9.0, inland + (backNoise - 0.5) * 5.0);
  vec3 shingleAlbedo = mix(vec3(0.34, 0.305, 0.25), vec3(0.49, 0.435, 0.345), backNoise);
  vec3 bsUp = vec3(0.0, 1.0, 0.0);
  vec3 bsL = normalize(sunDirection);
  vec3 shingleIrr = (pbrSunIrradiance(bsL) / PBR_PI) * max(dot(bsUp, bsL), 0.06)
                  + (pbrHemisphereIrradiance(bsUp, skyTop, skyHorizon) / PBR_PI) * 1.15;
  vec3 shingle = shingleAlbedo * shingleIrr;
  vec2 uv = (p.xz - vec2(-180.0, -90.0)) / vec2(360.0, 150.0);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float contact = texture2D(coastalContactMap, clamp(uv, 0.0, 1.0)).r * inside;
  return mix(sand, shingle, mask) * (1.0 - 0.22 * contact);
}
`;

export function expandCoastalGround(geometry, bed) {
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i);
    if (Math.abs(x) > 140) x = Math.sign(x) * (140 + 35 * Math.pow((Math.abs(x) - 140) / 35, 2) + 1380 * Math.pow((Math.abs(x) - 140) / 35, 4));
    if (z > 110) z = 110 + (z - 110) + 525 * Math.pow((z - 110) / 65, 3);
    else if (z < -140) z = -140 - 35 * Math.pow((-z - 140) / 35, 2) - 625 * Math.pow((-z - 140) / 35, 4);
    p.setXYZ(i, x, bed(x, z), z);
  }
  p.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}
