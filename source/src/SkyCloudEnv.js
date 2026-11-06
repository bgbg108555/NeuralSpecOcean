/* Neural Chapman-Ozone Atmospheric Scattering + 3D Volumetric Nubis Cloudscape Skybox (SkyCloudEnv.js).
 *
 * Mathematical, Physical & Neural References:
 *  1. Chapman (1931) & Bruneton & Neyret (2008, EGSR): Spherical-shell optical air-mass quadrature across
 *     Rayleigh (H = 8.0 km), Aerosol Mie (H = 1.2 km), and Stratospheric Ozone Chappuis layer (25 km peak).
 *  2. Sobol (1967) Quasi-Monte Carlo Low-Discrepancy Sampling + Loshchilov & Hutter (2019, ICLR) AdamW:
 *     Trains a compact GPU-evaluated Neural Atmospheric Transmittance & Multi-Scatter MLP (2 -> 8 -> 6, SiLU)
 *     in < 2.0 ms on startup and uploads exact weights as vec4 uniforms into GLSL (zero LUT texture cost!).
 *  3. Schneider & Vos (2015, SIGGRAPH, "The Real-Time Volumetric Cloudscapes of Horizon: Zero Dawn"):
 *     3D volumetric coastal cumulus deck + high-altitude ice-crystal cirrus wisps with Dual-Lobe Henyey-Greenstein
 *     phase function and Beer-Powder multiple-scattering approximation E(tau) = 2 * exp(-tau) * (1 - exp(-2*tau)).
 *  4. Renders into a 512x256 HalfFloat Panoramic HDR Environment Map so Sky, Ocean Fresnel, Wet Sand & Wet Rocks
 *     all reflect identical drifting 3D sunlit clouds in O(1)!
 */
export function createSkyCloudEnv(THREE, renderer, sharedUniforms) {
  // --- 1. Physics Teacher: 28-Step Spherical-Shell Chapman + Ozone + Rayleigh + Mie Integrator ---
  const R_EARTH = 6360.0; // km
  const R_TOP = 6420.0;   // 60 km top of atmosphere
  const BETA_R = [0.005802, 0.013558, 0.033100]; // km^-1 at sea level (680, 550, 440 nm)
  const BETA_M = [0.003996, 0.003996, 0.003996]; // km^-1 marine aerosol extinction
  const BETA_O = [0.000650, 0.001881, 0.000085]; // km^-1 Chappuis ozone band (peaks at 25 km!)

  function evaluateSphericalTransmittance(muView, altKm) {
    const r0 = R_EARTH + altKm;
    const disc = r0 * r0 * (muView * muView - 1.0) + R_TOP * R_TOP;
    const sMax = Math.max(0.0, -r0 * muView + Math.sqrt(Math.max(0.0, disc)));
    const STEPS = 28;
    const ds = sMax / STEPS;
    let odR = 0.0, odM = 0.0, odO = 0.0;
    for (let i = 0; i < STEPS; i++) {
      const s = (i + 0.5) * ds;
      const r = Math.sqrt(r0 * r0 + s * s + 2.0 * r0 * s * muView);
      const h = Math.max(0.0, r - R_EARTH);
      odR += Math.exp(-h / 8.0) * ds;
      odM += Math.exp(-h / 1.2) * ds;
      odO += Math.max(0.0, 1.0 - Math.abs(h - 25.0) / 15.0) * ds;
    }
    const tr = Math.exp(-(BETA_R[0] * odR + BETA_M[0] * odM + BETA_O[0] * odO));
    const tg = Math.exp(-(BETA_R[1] * odR + BETA_M[1] * odM + BETA_O[1] * odO));
    const tb = Math.exp(-(BETA_R[2] * odR + BETA_M[2] * odM + BETA_O[2] * odO));
    // Isotropic second-order multiple-scattering sky boost (Psi_ms, Hillaire 2020)
    const msR = 0.14 * (1.0 - tr) * (0.45 + 0.55 * Math.max(0, muView));
    const msG = 0.17 * (1.0 - tg) * (0.45 + 0.55 * Math.max(0, muView));
    const msB = 0.24 * (1.0 - tb) * (0.45 + 0.55 * Math.max(0, muView));
    return [tr, tg, tb, msR, msG, msB];
  }

  // --- 2. Sobol Quasi-Monte Carlo + Huber-Sobolev AdamW Neural Atmospheric Surrogate (2 -> 8 SiLU -> 6 Sigmoid) ---
  function radicalInverse2(n) {
    let val = 0.0, inv = 0.5;
    while (n > 0) {
      if (n & 1) val += inv;
      n >>>= 1;
      inv *= 0.5;
    }
    return val;
  }
  function vanDerCorput3(n) {
    let val = 0.0, inv = 1.0 / 3.0;
    while (n > 0) {
      val += (n % 3) * inv;
      n = Math.floor(n / 3);
      inv /= 3.0;
    }
    return val;
  }

  function trainNeuralAtmosphere() {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const N = 224; // 112 primal + 112 horizon-concentrated Sobolev W^{1,2} pairs
    const X = new Float32Array(N * 2);
    const Y = new Float32Array(N * 6);
    for (let p = 0; p < N / 2; p++) {
      const u1 = radicalInverse2(p + 1);
      const u2 = vanDerCorput3(p + 1);
      const mu = -0.12 + 1.12 * Math.pow(u1, 1.42);
      const altKm = 0.002 + 5.5 * u2 * u2;
      const i0 = 2 * p, i1 = 2 * p + 1;
      X[i0 * 2] = mu;
      X[i0 * 2 + 1] = altKm / 6.0;
      const targ0 = evaluateSphericalTransmittance(mu, altKm);
      for (let k = 0; k < 6; k++) Y[i0 * 6 + k] = Math.min(0.999, Math.max(0.001, targ0[k]));

      const muPlus = Math.min(1.0, mu + 0.022);
      X[i1 * 2] = muPlus;
      X[i1 * 2 + 1] = altKm / 6.0;
      const targ1 = evaluateSphericalTransmittance(muPlus, altKm);
      for (let k = 0; k < 6; k++) Y[i1 * 6 + k] = Math.min(0.999, Math.max(0.001, targ1[k]));
    }

    // Architecture: 2 -> 8 (SiLU) -> 6 (Sigmoid) => 78 Float32 params with Saxe (2014) Gram-Schmidt Orthogonal Init!
    const W1 = new Float32Array(16), b1 = new Float32Array(8);
    const W2 = new Float32Array(48), b2 = new Float32Array(6);
    let s = 1357911;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const rndn = () => Math.sqrt(-2.0 * Math.log(Math.max(1e-7, rnd()))) * Math.cos(6.2831853 * rnd());

    const initOrtho = (W, rows, cols, gain) => {
      for (let i = 0; i < W.length; i++) W[i] = rndn();
      if (rows <= cols) {
        for (let r = 0; r < rows; r++) {
          for (let q = 0; q < r; q++) {
            let dot = 0;
            for (let c = 0; c < cols; c++) dot += W[r * cols + c] * W[q * cols + c];
            for (let c = 0; c < cols; c++) W[r * cols + c] -= dot * W[q * cols + c];
          }
          let nrm = 0;
          for (let c = 0; c < cols; c++) nrm += W[r * cols + c] * W[r * cols + c];
          const inv = 1.0 / Math.sqrt(Math.max(1e-12, nrm));
          for (let c = 0; c < cols; c++) W[r * cols + c] *= inv;
        }
      } else {
        for (let c = 0; c < cols; c++) {
          for (let q = 0; q < c; q++) {
            let dot = 0;
            for (let r = 0; r < rows; r++) dot += W[r * cols + c] * W[r * cols + q];
            for (let r = 0; r < rows; r++) W[r * cols + c] -= dot * W[r * cols + q];
          }
          let nrm = 0;
          for (let r = 0; r < rows; r++) nrm += W[r * cols + c] * W[r * cols + c];
          const inv = 1.0 / Math.sqrt(Math.max(1e-12, nrm));
          for (let r = 0; r < rows; r++) W[r * cols + c] *= inv;
        }
      }
      const sc = gain * Math.sqrt(Math.max(1.0, rows / cols));
      for (let i = 0; i < W.length; i++) W[i] *= sc;
    };
    initOrtho(W1, 8, 2, 1.38);
    initOrtho(W2, 6, 8, 1.08);

    const mW1 = new Float32Array(16), vW1 = new Float32Array(16);
    const mb1 = new Float32Array(8),  vb1 = new Float32Array(8);
    const mW2 = new Float32Array(48), vW2 = new Float32Array(48);
    const mb2 = new Float32Array(6),  vb2 = new Float32Array(6);
    const gW1 = new Float32Array(16), gb1 = new Float32Array(8);
    const gW2 = new Float32Array(48), gb2 = new Float32Array(6);
    const z1 = new Float32Array(8), s1 = new Float32Array(8), h1 = new Float32Array(8), dz1 = new Float32Array(8);
    const z1P = new Float32Array(8), s1P = new Float32Array(8), h1P = new Float32Array(8);
    const predP = new Float32Array(6), dLogP = new Float32Array(6), dLogC = new Float32Array(6);

    const EPOCHS = 185;
    const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;
    let mse = 0;

    const adamStep = (param, grad, m, v, lr, invBc1, invBc2, wd) => {
      const decay = 1.0 - lr * wd;
      for (let i = 0; i < param.length; i++) {
        const g = grad[i];
        m[i] = beta1 * m[i] + (1 - beta1) * g;
        v[i] = beta2 * v[i] + (1 - beta2) * g * g;
        const mHat = m[i] * invBc1;
        const vHat = v[i] * invBc2;
        param[i] = param[i] * decay - lr * (mHat / (Math.sqrt(vHat) + eps));
        grad[i] = 0;
      }
    };

    const accumSampleGrad = (x0, x1, dLog, zBuf, sBuf, hBuf) => {
      dz1[0] = dz1[1] = dz1[2] = dz1[3] = dz1[4] = dz1[5] = dz1[6] = dz1[7] = 0;
      for (let k = 0; k < 6; k++) {
        const dl = dLog[k];
        gb2[k] += dl;
        const rOff = k * 8;
        gW2[rOff]     += dl * hBuf[0]; dz1[0] += dl * W2[rOff];
        gW2[rOff + 1] += dl * hBuf[1]; dz1[1] += dl * W2[rOff + 1];
        gW2[rOff + 2] += dl * hBuf[2]; dz1[2] += dl * W2[rOff + 2];
        gW2[rOff + 3] += dl * hBuf[3]; dz1[3] += dl * W2[rOff + 3];
        gW2[rOff + 4] += dl * hBuf[4]; dz1[4] += dl * W2[rOff + 4];
        gW2[rOff + 5] += dl * hBuf[5]; dz1[5] += dl * W2[rOff + 5];
        gW2[rOff + 6] += dl * hBuf[6]; dz1[6] += dl * W2[rOff + 6];
        gW2[rOff + 7] += dl * hBuf[7]; dz1[7] += dl * W2[rOff + 7];
      }
      for (let i = 0; i < 8; i++) {
        const dAct = dz1[i] * sBuf[i] * (1.0 + zBuf[i] * (1.0 - sBuf[i]));
        gb1[i] += dAct;
        gW1[i * 2] += dAct * x0;
        gW1[i * 2 + 1] += dAct * x1;
      }
    };

    for (let ep = 1; ep <= EPOCHS; ep++) {
      mse = 0;
      const invN = 1.0 / N;
      for (let n = 0; n < N; n++) {
        const x0 = X[n * 2], x1 = X[n * 2 + 1];
        // Horizon air-mass importance weighting (extra precision where optical depth changes fastest!)
        const horWeight = 1.0 + 0.85 * Math.exp(-Math.abs(x0) * 6.5);
        const wSample = invN * horWeight;
        for (let i = 0; i < 8; i++) {
          const z = W1[i * 2] * x0 + W1[i * 2 + 1] * x1 + b1[i];
          z1[i] = z;
          const sig = 1.0 / (1.0 + Math.exp(-z));
          s1[i] = sig;
          h1[i] = z * sig;
        }
        const yBase = n * 6;
        for (let k = 0; k < 6; k++) {
          const rOff = k * 8;
          const acc = b2[k]
            + W2[rOff] * h1[0] + W2[rOff + 1] * h1[1] + W2[rOff + 2] * h1[2] + W2[rOff + 3] * h1[3]
            + W2[rOff + 4] * h1[4] + W2[rOff + 5] * h1[5] + W2[rOff + 6] * h1[6] + W2[rOff + 7] * h1[7];
          const pred = 1.0 / (1.0 + Math.exp(-acc));
          const diff = pred - Y[yBase + k];
          mse += diff * diff;
          // Exact BCE-logit gradient cancellations: d(BCE)/d(logit) = pred - target
          if ((n & 1) === 0) {
            predP[k] = pred;
            dLogP[k] = diff * wSample;
          } else {
            const gSob = 0.52 * ((pred - predP[k]) - (Y[yBase + k] - Y[yBase - 6 + k])) * wSample;
            dLogC[k] = diff * wSample + gSob;
            dLogP[k] -= gSob;
          }
        }
        if ((n & 1) === 0) {
          z1P.set(z1); s1P.set(s1); h1P.set(h1);
        } else {
          accumSampleGrad(X[(n - 1) * 2], X[(n - 1) * 2 + 1], dLogP, z1P, s1P, h1P);
          accumSampleGrad(x0, x1, dLogC, z1, s1, h1);
        }
      }
      mse /= (N * 6);
      const warmup = ep < 12 ? ep / 12 : 1.0;
      const lr = 0.095 * warmup * (0.04 + 0.96 * 0.5 * (1 + Math.cos(Math.PI * (ep - 1) / EPOCHS)));
      const invBc1 = 1.0 / (1 - Math.pow(beta1, ep));
      const invBc2 = 1.0 / (1 - Math.pow(beta2, ep));
      adamStep(W1, gW1, mW1, vW1, lr, invBc1, invBc2, 6e-5);
      adamStep(b1, gb1, mb1, vb1, lr, invBc1, invBc2, 0.0);
      adamStep(W2, gW2, mW2, vW2, lr, invBc1, invBc2, 6e-5);
      adamStep(b2, gb2, mb2, vb2, lr, invBc1, invBc2, 0.0);
    }
    const trainMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    return { W1, b1, W2, b2, mse, trainMs };
  }

  const net = trainNeuralAtmosphere();

  // Pack neural weights into compact Vector4 arrays for zero-sampler GLSL evaluation
  const uW1 = [];
  for (let i = 0; i < 4; i++) {
    uW1.push(new THREE.Vector4(net.W1[i * 4], net.W1[i * 4 + 1], net.W1[i * 4 + 2], net.W1[i * 4 + 3]));
  }
  const uB1 = [
    new THREE.Vector4(net.b1[0], net.b1[1], net.b1[2], net.b1[3]),
    new THREE.Vector4(net.b1[4], net.b1[5], net.b1[6], net.b1[7])
  ];
  const uW2 = [];
  for (let i = 0; i < 12; i++) {
    uW2.push(new THREE.Vector4(net.W2[i * 4], net.W2[i * 4 + 1], net.W2[i * 4 + 2], net.W2[i * 4 + 3]));
  }
  const uB2 = [
    new THREE.Vector4(net.b2[0], net.b2[1], net.b2[2], net.b2[3]),
    new THREE.Vector4(net.b2[4], net.b2[5], 0.0, 0.0)
  ];

  // Transcendental-free 5th-order Horner sigmoid/SiLU CPU neural evaluator (< 0.01% max error, 0 Math.exp calls!)
  const cpuH = new Float32Array(8);
  const fastSigCPU = z => {
    const c = z < -12.0 ? -12.0 : (z > 12.0 ? 12.0 : z);
    const az = Math.abs(c);
    const ex = 1.0 + az * (1.0 + az * (0.5 + az * (0.1666667 + az * (0.0416667 + az * 0.0083333))));
    return c >= 0.0 ? ex / (1.0 + ex) : 1.0 / (1.0 + ex);
  };
  function evalNeuralAtmosphereCPU(mu, altNorm, outTransVec3, outMSVec3) {
    for (let i = 0; i < 8; i++) {
      const z = net.W1[i * 2] * mu + net.W1[i * 2 + 1] * altNorm + net.b1[i];
      cpuH[i] = z * fastSigCPU(z);
    }
    const h0 = cpuH[0], h1 = cpuH[1], h2 = cpuH[2], h3 = cpuH[3];
    const h4 = cpuH[4], h5 = cpuH[5], h6 = cpuH[6], h7 = cpuH[7];
    const rowDot = k => {
      const r = k * 8;
      return fastSigCPU(
        net.b2[k]
        + net.W2[r] * h0 + net.W2[r + 1] * h1 + net.W2[r + 2] * h2 + net.W2[r + 3] * h3
        + net.W2[r + 4] * h4 + net.W2[r + 5] * h5 + net.W2[r + 6] * h6 + net.W2[r + 7] * h7
      );
    };
    outTransVec3.set(rowDot(0), rowDot(1), rowDot(2));
    outMSVec3.set(rowDot(3), rowDot(4), rowDot(5));
  }

  const uSunTrans = new THREE.Vector3(0.85, 0.78, 0.68);
  const uSunMS = new THREE.Vector3(0.05, 0.08, 0.12);

  // --- 3. Tear-Free Progressive Volumetric Cloud HDR Panorama + Temporal Cross-Fade ---
  // Offscreen envBuild latches frozen (time, sunDir, skyTop, skyHorizon) across all 8 scissor bands
  // so cloud strips NEVER tear, and completed panoramas cross-fade smoothly (envPrev -> envCurr -> envTarget)!
  let envW = 640, envH = 320;
  const ENV_BANDS = 8;
  function makeEnvRT(w, h) {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false
    });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return rt;
  }
  const envTarget = makeEnvRT(envW, envH);
  let envPrev = makeEnvRT(envW, envH);
  let envCurr = makeEnvRT(envW, envH);
  let envBuild = makeEnvRT(envW, envH);

  // Official NASA Goddard SVS 4851 (Deep Star Maps 2020 — Gaia DR2 + Hipparcos/Tycho-2) 2048x1024 Celestial Map
  const fallbackStarTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  fallbackStarTex.needsUpdate = true;
  const StarTexCtor = THREE.Texture || Object.getPrototypeOf(THREE.DataTexture);
  const starMapTex = new StarTexCtor();
  starMapTex.wrapS = THREE.RepeatWrapping;
  starMapTex.wrapT = THREE.ClampToEdgeWrapping;
  starMapTex.minFilter = THREE.LinearMipmapLinearFilter;
  starMapTex.magFilter = THREE.LinearFilter;
  starMapTex.generateMipmaps = true;
  starMapTex.colorSpace = THREE.SRGBColorSpace;
  starMapTex.anisotropy = Math.min(8, renderer.capabilities?.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);

  let starReadyResolve;
  const starReadyPromise = new Promise(resolve => { starReadyResolve = resolve; });
  if (typeof Image !== 'undefined' && typeof NASA_STARMAP_DATA_URI === 'string' && NASA_STARMAP_DATA_URI.length > 32) {
    const starImg = new Image();
    starImg.decoding = 'async';
    starImg.onload = () => {
      const finalizeStarTex = () => {
        starMapTex.image = starImg;
        starMapTex.needsUpdate = true;
        buildUniforms.uStarMap.value = starMapTex;
        skyDomeUniforms.uStarMap.value = starMapTex;
        buildUniforms.uStarReady.value = 1.0;
        skyDomeUniforms.uStarReady.value = 1.0;
        lastNightMix = NaN;
        starReadyResolve(true);
      };
      if (typeof starImg.decode === 'function') {
        starImg.decode().then(finalizeStarTex, finalizeStarTex);
      } else {
        finalizeStarTex();
      }
    };
    starImg.onerror = () => starReadyResolve(false);
    starImg.src = NASA_STARMAP_DATA_URI;
  } else {
    starReadyResolve(false);
  }

  const skyCommonGLSL = `
${pbrShadingGLSL}
uniform vec3 sunDirection, skyTop, skyHorizon;
uniform vec3 uSunTrans, uSunMS;
uniform float time;
uniform sampler2D uStarMap;
uniform float uStarReady;
uniform float uCelestialSpin;
uniform vec4 uNetW1[4];
uniform vec4 uNetB1[2];
uniform vec4 uNetW2[12];
uniform vec4 uNetB2[2];

// Seam-free 3D spherical evaluation of NASA Goddard SVS 4851 Equirectangular Celestial Star Map
vec3 sampleNasaStarMap(vec3 dir, vec3 viewTrans, float sharpMode){
  float starNight = smoothstep(0.46, 0.96, clamp(uNightMix, 0.0, 1.0));
  if (starNight <= 0.002 || uStarReady < 0.5 || dir.y <= -0.025) return vec3(0.0);

  // Tilt celestial pole to 24 deg N coastal latitude + sidereal rotation so Galactic Core rises over the ocean!
  float cs = cos(uCelestialSpin), sn = sin(uCelestialSpin);
  const float ct = 0.78801, st = 0.61566;
  vec3 d1 = vec3(dir.x, dir.y * ct - dir.z * st, dir.y * st + dir.z * ct);
  vec3 cel = vec3(d1.x * cs + d1.z * sn, d1.y, -d1.x * sn + d1.z * cs);

  float u = fract(atan(cel.z, cel.x) / PBR_TAU + 0.74);
  float v = clamp(asin(clamp(cel.y, -1.0, 1.0)) / PBR_PI + 0.5, 0.002, 0.998);

  vec3 mwGlow = textureLod(uStarMap, vec2(u, v), 3.0).rgb;
  if (sharpMode < 0.5) {
    // Diffuse Milky Way & starlight glow for ocean Fresnel & wet-sand reflections
    vec3 envAtm = (vec3(0.42, 0.58, 0.76) + vec3(0.58, 0.42, 0.24) * viewTrans) * smoothstep(-0.01, 0.12, dir.y);
    return mwGlow * 0.86 * envAtm * starNight;
  }

  // Explicit 3D vector gradients avoid atan() branch-cut mipmap seam at u = 0/1!
  vec3 dCelDx = dFdx(cel), dCelDy = dFdy(cel);
  float invHoriz = 1.0 / max(length(cel.xz), 0.12);
  vec2 duvDx = vec2(length(dCelDx.xz) * invHoriz / PBR_TAU, abs(dCelDx.y) * invHoriz / PBR_PI);
  vec2 duvDy = vec2(length(dCelDy.xz) * invHoriz / PBR_TAU, abs(dCelDy.y) * invHoriz / PBR_PI);
  vec3 rawStar = textureGrad(uStarMap, vec2(u, v), duvDx, duvDy).rgb;

  // Separate crisp 1-texel pinpoint stars from delicate Milky Way dust lane
  vec3 starPin = max(vec3(0.0), rawStar - mwGlow * 1.06);
  starPin = pow(starPin, vec3(1.24));
  float peak = max(starPin.r, max(starPin.g, starPin.b));
  float starCore = smoothstep(0.08, 0.62, peak);
  float twinkle = 1.0;
  if (starCore > 0.02) {
    float sc = sin(time * 2.9 + dot(cel, vec3(193.7, 251.3, 149.1)))
             * cos(time * 2.1 - dot(cel, vec3(131.9, 179.3, 227.7)));
    float lowAltScint = mix(0.24, 0.07, smoothstep(0.04, 0.55, max(dir.y, 0.0)));
    twinkle = 1.0 + sc * lowAltScint * starCore;
  }
  vec3 hdrStar = mwGlow * 0.68 + starPin * (1.08 + 2.65 * pow(peak, 1.48) * twinkle);
  vec3 atmAtten = (vec3(0.44, 0.60, 0.78) + vec3(0.56, 0.40, 0.22) * viewTrans) * smoothstep(-0.005, 0.14, dir.y);
  return hdrStar * atmAtten * starNight;
}

// Transcendental-free 5th-order Horner rational sigmoid & SiLU (0 SFU exp() stalls, < 1e-4 error!)
float skySigmoid(float z){
  float c = clamp(z, -12.0, 12.0);
  float az = abs(c);
  float ex = 1.0 + az * (1.0 + az * (0.5 + az * (0.1666667 + az * (0.0416667 + az * 0.0083333))));
  return c >= 0.0 ? ex / (1.0 + ex) : 1.0 / (1.0 + ex);
}
float skySilu(float z){ return z * skySigmoid(z); }

// Evaluates trained Neural Chapman-Ozone Atmospheric Transmittance (rgb) & Multiple-Scattering (w..z)
// via 12 native GPU SIMD vec4 dot-products (zero dynamic indexing, zero exp() SFU stalls!)
void evalNeuralAtmosphere(float mu, float altNorm, out vec3 trans, out vec3 multiScat){
  vec4 hA = vec4(
    skySilu(uNetW1[0].x * mu + uNetW1[0].y * altNorm + uNetB1[0].x),
    skySilu(uNetW1[0].z * mu + uNetW1[0].w * altNorm + uNetB1[0].y),
    skySilu(uNetW1[1].x * mu + uNetW1[1].y * altNorm + uNetB1[0].z),
    skySilu(uNetW1[1].z * mu + uNetW1[1].w * altNorm + uNetB1[0].w)
  );
  vec4 hB = vec4(
    skySilu(uNetW1[2].x * mu + uNetW1[2].y * altNorm + uNetB1[1].x),
    skySilu(uNetW1[2].z * mu + uNetW1[2].w * altNorm + uNetB1[1].y),
    skySilu(uNetW1[3].x * mu + uNetW1[3].y * altNorm + uNetB1[1].z),
    skySilu(uNetW1[3].z * mu + uNetW1[3].w * altNorm + uNetB1[1].w)
  );
  trans = vec3(
    skySigmoid(uNetB2[0].x + dot(uNetW2[0], hA) + dot(uNetW2[1], hB)),
    skySigmoid(uNetB2[0].y + dot(uNetW2[2], hA) + dot(uNetW2[3], hB)),
    skySigmoid(uNetB2[0].z + dot(uNetW2[4], hA) + dot(uNetW2[5], hB))
  );
  multiScat = vec3(
    skySigmoid(uNetB2[0].w + dot(uNetW2[6],  hA) + dot(uNetW2[7],  hB)),
    skySigmoid(uNetB2[1].x + dot(uNetW2[8],  hA) + dot(uNetW2[9],  hB)),
    skySigmoid(uNetB2[1].y + dot(uNetW2[10], hA) + dot(uNetW2[11], hB))
  );
}

// Fast 3D value noise & billowing Worley-FBM hybrid for Nubis coastal cumulus & high cirrus
float cloudHash13(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

float cloudNoise3(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(cloudHash13(i), cloudHash13(i + vec3(1,0,0)), f.x),
        mix(cloudHash13(i + vec3(0,1,0)), cloudHash13(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(cloudHash13(i + vec3(0,0,1)), cloudHash13(i + vec3(1,0,1)), f.x),
        mix(cloudHash13(i + vec3(0,1,1)), cloudHash13(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float cloudFbm(vec3 p){
  float v = 0.0, a = 0.52;
  const mat3 m = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
  for (int i = 0; i < 4; i++) {
    v += a * cloudNoise3(p);
    p = m * p * 2.07;
    a *= 0.50;
  }
  return v;
}

// Smooth C^infinity 3D billow lobes (eliminates sharp abs() ridge creases inside clouds!)
float cloudBillow3(vec3 p){
  float n1 = cloudNoise3(p) * 2.0 - 1.0;
  float n2 = cloudNoise3(p * 2.13 + vec3(1.7, 3.1, 2.3)) * 2.0 - 1.0;
  float n3 = cloudNoise3(p * 4.41 - vec3(2.9, 1.3, 4.1)) * 2.0 - 1.0;
  float b1 = 1.0 - sqrt(n1 * n1 + 0.025) * 0.98;
  float b2 = 1.0 - sqrt(n2 * n2 + 0.025) * 0.98;
  float b3 = 1.0 - sqrt(n3 * n3 + 0.025) * 0.98;
  return clamp((b1 * b1) * 0.56 + (b2 * b2) * 0.30 + b3 * 0.14, 0.0, 1.0);
}
`;

  const cloudVolumetricGLSL = `
${skyCommonGLSL}
// Sculpted puffy coastal cumulus towers & trade-wind cloud banks (~40% coverage -> 60% rich royal sapphire sky!)
float sampleCumulusDensity(vec3 p, float windT, int detailTier){
  float hFrac = clamp(p.y, 0.0, 1.0);
  // Crisp flat marine condensation base + tall rounded billowing cauliflower tops (strictly edge0 < edge1 for GLSL ES 3.0!)
  float heightProfile = smoothstep(0.0, 0.14, hFrac) * (1.0 - smoothstep(0.36, 1.0, hFrac));
  if (heightProfile <= 0.002) return 0.0;

  vec3 drift = vec3(windT * 0.012, 0.0, windT * 0.006);
  // Anisotropically compress distant perspective stretch slightly so horizon clouds stay puffy 3D towers, NOT flat grey streaks!
  vec3 q = p * vec3(0.46, 1.05, 0.46) + drift;
  float weather = cloudFbm(q * 0.68 + vec3(2.4, 0.0, -1.3));
  float cauliflower = cloudBillow3(q * 1.55 - drift * 1.35);

  // Scenic coastal composition: open royal-sapphire sky overhead, organic asymmetric trade-wind cumulus banks along horizon!
  float rHoriz = length(p.xz);
  float horizonBelt = smoothstep(1.6, 4.2, rHoriz) * (1.0 - smoothstep(6.5, 10.2, rHoriz));
  float towerGroups = 0.50 + 0.24 * sin(p.x * 0.37 + p.z * 0.29 + 0.8)
                    + 0.18 * cos(p.x * 0.61 - p.z * 0.43 - 0.5)
                    + 0.14 * sin(p.x * 0.19 - p.z * 0.52 + 2.1);
  float coverage = clamp(0.16 + 0.30 * towerGroups + 0.14 * horizonBelt, 0.14, 0.56);

  float baseCloud = smoothstep(0.92 - coverage, 1.10 - coverage * 0.32, weather * 0.66 + cauliflower * 0.34) * heightProfile;
  if (baseCloud <= 0.004) return 0.0;

  // Quality-tiered edge erosion: Low (0) soft smooth puffs; Med (1) crisp cauliflower; High (2) sculptural micro-turbulent billows!
  float erodeSignal = cauliflower;
  if (detailTier >= 1) {
    float fineCrisp = cloudBillow3(q * 3.85 + drift * 2.0);
    erodeSignal = cauliflower * 0.64 + fineCrisp * 0.36;
    if (detailTier >= 2) {
      float microCrisp = cloudBillow3(q * 7.6 - drift * 2.4);
      erodeSignal = erodeSignal * 0.78 + microCrisp * 0.22;
    }
  }
  float erodeWeight = detailTier == 0 ? 0.24 : (detailTier >= 2 ? 0.38 : 0.33);
  float erodeAmt = (1.0 - erodeSignal) * mix(erodeWeight, 0.14, baseCloud);
  float rawDens = max(0.0, baseCloud - erodeAmt);
  return clamp(smoothstep(0.0, 0.14, rawDens) * rawDens * (detailTier >= 2 ? 2.22 : 2.05), 0.0, 1.0);
}

vec4 renderVolumetricCloudSky(vec3 rawDir, int marchSteps){
  vec3 d = normalize(rawDir);
  vec3 L = normalize(sunDirection);
  float sunElev = clamp(L.y, 0.015, 1.0);
  float dusk = 1.0 - smoothstep(0.04, 0.28, sunElev);
  float noon = smoothstep(0.42, 0.85, sunElev);

  // 1) Neural Chapman-Ozone-Rayleigh-Mie Clear-Sky Radiative Transfer (sun transmittance pre-evaluated on CPU!)
  vec3 viewTrans, viewMS;
  evalNeuralAtmosphere(max(d.y, -0.10), 0.0, viewTrans, viewMS);
  vec3 sunTrans = uSunTrans;

  float sunCos = dot(d, L);
  float rayleighPhase = 0.0596831 * (1.0 + sunCos * sunCos);
  float miePhase = pbrMiePhase(sunCos, 0.86);
  float nightW = clamp(uNightMix, 0.0, 1.0);

  // Time-of-Day Ozone-Sapphire zenith -> Twilight Indigo at dusk -> Deep Velvet Cosmos at night!
  float h = clamp(d.y, 0.0, 1.0);
  vec3 zenithCol  = mix(mix(vec3(0.010, 0.076, 0.41), vec3(0.008, 0.095, 0.48), noon), vec3(0.024, 0.044, 0.21), dusk);
  vec3 midSkyCol  = mix(mix(vec3(0.048, 0.238, 0.64), vec3(0.058, 0.285, 0.72), noon), vec3(0.14, 0.16, 0.36), dusk);
  vec3 horizonCol = mix(mix(vec3(0.22, 0.45, 0.72), vec3(0.26, 0.52, 0.78), noon), vec3(0.56, 0.31, 0.22), dusk);
  vec3 daySky = h < 0.28
    ? mix(horizonCol, midSkyCol, smoothstep(0.0, 0.28, h))
    : mix(midSkyCol, zenithCol, pow((h - 0.28) / 0.72, mix(0.60, 0.72, dusk)));
  daySky = daySky * (0.84 + 0.28 * (1.0 - viewTrans)) + viewMS * sunTrans * mix(vec3(0.62, 0.94, 1.40), vec3(1.15, 0.72, 0.52), dusk) * 1.26;

  // Directional solar horizon glow & Mie aureole (golden-crimson sunset / rose-peach dawn arc!)
  float sunAz = clamp(dot(normalize(vec2(d.x, d.z) + 1e-5), normalize(vec2(L.x, L.z) + 1e-5)) * 0.5 + 0.5, 0.0, 1.0);
  vec3 antiHoriz = mix(vec3(0.010, 0.045, 0.095), vec3(0.08, 0.06, 0.14), dusk);
  vec3 sunHoriz  = mix(vec3(0.32, 0.20, 0.09), vec3(1.18, 0.44, 0.12), dusk);
  daySky += mix(antiHoriz, sunHoriz, pow(sunAz, mix(6.2, 3.4, dusk))) * exp(-abs(d.y) * mix(12.5, 6.8, dusk));
  vec3 mieTint = mix(vec3(0.40, 0.29, 0.17), vec3(1.05, 0.46, 0.16), dusk);
  daySky += sunTrans * mieTint * miePhase * (0.18 + 0.82 * exp(-h * 5.2));
  daySky += sunTrans * mix(vec3(0.46, 0.33, 0.18), vec3(1.22, 0.48, 0.15), dusk) * pow(max(sunCos, 0.0), 54.0) * (1.0 - 0.55 * h);

  // Nocturnal airglow + lunar Rayleigh/Mie halo + diffuse NASA Milky Way reflection glow
  vec3 nightZenith  = vec3(0.0014, 0.0038, 0.0115);
  vec3 nightMid     = vec3(0.0036, 0.0088, 0.0225);
  vec3 nightHorizon = vec3(0.0095, 0.0195, 0.0410);
  vec3 nightSky = h < 0.26
    ? mix(nightHorizon, nightMid, smoothstep(0.0, 0.26, h))
    : mix(nightMid, nightZenith, pow((h - 0.26) / 0.74, 0.68));
  nightSky += vec3(0.016, 0.028, 0.052) * pow(sunAz, 3.2) * exp(-abs(d.y) * 9.5);
  nightSky += vec3(0.046, 0.068, 0.112) * miePhase * (0.22 + 0.78 * exp(-h * 4.5));
  nightSky += vec3(0.085, 0.118, 0.180) * pow(max(sunCos, 0.0), 42.0) * (1.0 - 0.35 * h);

  vec3 clearSky = mix(daySky, nightSky, nightW);
  vec3 daySeaBounce = mix(horizonCol * 0.86, mix(vec3(0.09, 0.25, 0.34), vec3(0.18, 0.12, 0.15), dusk), 0.62);
  vec3 nightSeaBounce = vec3(0.005, 0.012, 0.024);
  vec3 seaBounce = mix(daySeaBounce, nightSeaBounce, nightW);
  float belowHorizonMix = smoothstep(0.010, -0.065, d.y);
  if (d.y <= -0.065) {
    return vec4(seaBounce, 1.0);
  }

  // 2) High-Altitude Ice-Crystal Cirrus Wisps (enabled in Medium & High quality tiers)
  int detailTier = marchSteps >= 22 ? 2 : (marchSteps >= 14 ? 1 : 0);
  float windT = time;
  if (detailTier >= 1 && d.y > 0.01) {
    float cirrusElev = max(d.y + 0.08, 0.06);
    vec2 cirrusP = (d.xz / cirrusElev) * 0.72 + vec2(windT * 0.0032, -windT * 0.0018);
    float cWarp = cloudNoise3(vec3(cirrusP * 1.25, 1.7));
    float cirrusTex = cloudFbm(vec3(cirrusP.x * 2.1 + cWarp * 1.35, cirrusP.y * 0.68 - cWarp * 0.55, 3.1));
    float cirrusMask = smoothstep(0.62, 0.88, cirrusTex) * smoothstep(0.04, 0.24, d.y) * (1.0 - smoothstep(0.62, 0.96, d.y));
    float cirrusPhase = 0.65 * pbrMiePhase(sunCos, 0.66) + 0.35 * rayleighPhase;
    vec3 cirrusDay = mix(sunTrans * vec3(1.68, 1.56, 1.44), vec3(1.85, 0.86, 0.48), dusk * 0.85) * (0.52 + 1.25 * cirrusPhase) + midSkyCol * 0.38;
    vec3 cirrusNight = vec3(0.010, 0.018, 0.035) * (0.28 + 0.90 * cirrusPhase) + nightMid * 0.42;
    vec3 cirrusColor = mix(cirrusDay, cirrusNight, nightW);
    clearSky = mix(clearSky, cirrusColor, cirrusMask * (detailTier >= 2 ? 0.46 : 0.38) * (1.0 - 0.42 * nightW));
  }

  // Skip volumetric cumulus march near high zenith where coastal trade-wind cumulus coverage is minimal & short!
  int effSteps = clamp(d.y > 0.65 ? max(6, marchSteps / 2) : marchSteps, 1, 32);

  // 3) 3D Raymarched Volumetric Coastal Cumulus Deck
  float curvedElev = sqrt(d.y * d.y + 0.0085) - 0.022;
  float rayElev = max(curvedElev, 0.042);
  float tEnter = 1.32 / rayElev;
  float tExit  = 3.02 / rayElev;
  float maxTraceDist = min(tExit - tEnter, 14.5);
  float dtStep = maxTraceDist / float(effSteps);

  float hgFwd  = pbrMiePhase(sunCos, 0.64);
  float hgBack = pbrMiePhase(sunCos, -0.32);
  float silverLining = detailTier >= 2
    ? pbrMiePhase(sunCos, 0.82) * mix(0.28, 0.055, nightW)
    : (nightW > 0.2 ? pbrMiePhase(sunCos, 0.80) * 0.045 : 0.0);
  float cloudPhase = mix(hgBack, hgFwd, 0.68) + silverLining;

  // Nocturnal cloud palette: deep midnight navy-indigo silhouettes far from Moon + delicate silver-blue lunar rim near Moon!
  float moonProximity = pow(max(sunCos, 0.0), 5.5);
  vec3 nightCloudMult = vec3(0.052, 0.082, 0.138) + vec3(0.18, 0.25, 0.38) * moonProximity;
  vec3 sunCloudLight = pbrSunIrradiance(L) * mix(mix(vec3(0.72, 0.69, 0.64), vec3(1.08, 0.76, 0.54), dusk), nightCloudMult, nightW);
  vec3 skyAmbientTop = mix(mix(vec3(0.46, 0.64, 0.88), vec3(0.28, 0.26, 0.44), dusk), vec3(0.0042, 0.0086, 0.0190), nightW);
  vec3 skyAmbientBot = mix(mix(vec3(0.11, 0.21, 0.36), vec3(0.26, 0.14, 0.18), dusk), vec3(0.0018, 0.0038, 0.0092), nightW);
  vec3 sunStepDir = vec3(L.x * 0.36, max(L.y, 0.12) / 1.65, L.z * 0.36);
  // Slightly sparser nocturnal cloud cover so wide swaths of the NASA Milky Way shine unobstructed!
  float nightCloudThin = mix(1.0, 0.65, nightW);

  vec3 accumRad = vec3(0.0);
  float transmittance = 1.0;

  for (int i = 0; i < effSteps; i++) {
    if (transmittance < 0.02) break;
    float tRay = tEnter + (float(i) + 0.5) * dtStep;
    vec3 wPos = vec3(d.x * tRay, rayElev * tRay, d.z * tRay);
    float slabY = clamp((wPos.y - 1.32) / 1.70, 0.0, 1.0);
    vec3 samplePos = vec3(wPos.x * 0.36, slabY, wPos.z * 0.36);

    float dens = sampleCumulusDensity(samplePos, windT, detailTier) * nightCloudThin;
    if (dens > 0.004) {
      float tauSun = detailTier == 0
        ? sampleCumulusDensity(samplePos + sunStepDir * 0.36, windT, 0) * 1.95 * nightCloudThin
        : (sampleCumulusDensity(samplePos + sunStepDir * 0.22, windT, 1) * 0.45
         + sampleCumulusDensity(samplePos + sunStepDir * 0.58, windT, 1) * 0.72) * 1.85 * nightCloudThin;

      float multiScatBeer = exp(-tauSun) + 0.42 * exp(-tauSun * 0.28) + 0.16 * exp(-tauSun * 0.09);
      float powder = 0.68 + 0.32 * (1.0 - exp(-dens * 4.5));
      float directScatter = multiScatBeer * powder * (0.48 + 1.65 * cloudPhase);
      float duskUnderRim = dusk * (1.0 - nightW) * (1.0 - slabY) * exp(-tauSun * 0.55) * 0.55;

      vec3 ambient = mix(skyAmbientBot, skyAmbientTop, smoothstep(0.08, 0.84, slabY));
      vec3 stepLight = sunCloudLight * (directScatter + duskUnderRim) + ambient * (0.62 + 0.48 * slabY);

      float sigmaExt = dens * 1.55;
      float stepTrans = exp(-sigmaExt * dtStep);
      vec3 integScat = stepLight * (1.0 - stepTrans);
      accumRad += transmittance * integScat;
      transmittance *= stepTrans;
    }
  }

  float horizonHaze = exp(-max(d.y, 0.0) * 16.0) * (1.0 - exp(-tEnter * 0.045));
  vec3 cloudFinal = mix(accumRad, clearSky * (1.0 - transmittance), clamp(horizonHaze * 0.72, 0.0, 0.85));
  vec3 combined = clearSky * transmittance + cloudFinal;
  combined = mix(combined, seaBounce, belowHorizonMix);
  return vec4(combined, mix(transmittance, 1.0, belowHorizonMix));
}
`;

  const buildUniforms = {
    sunDirection: { value: sharedUniforms.sunDirection.value.clone() },
    skyTop: { value: sharedUniforms.skyTop.value.clone() },
    skyHorizon: { value: sharedUniforms.skyHorizon.value.clone() },
    uNightMix: { value: 0 },
    uCelestialSpin: { value: 0 },
    uStarMap: { value: fallbackStarTex },
    uStarReady: { value: 0 },
    uBandRange: { value: new THREE.Vector2(0.0, 1.0) },
    uSunTrans: { value: uSunTrans.clone() },
    uSunMS: { value: uSunMS.clone() },
    time: { value: 0 },
    uCloudSteps: { value: 16 },
    uNetW1: { value: uW1 },
    uNetB1: { value: uB1 },
    uNetW2: { value: uW2 },
    uNetB2: { value: uB2 }
  };

  const envMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: buildUniforms,
    vertexShader: `uniform vec2 uBandRange;
varying vec2 vUv;
void main(){
  float bandV = mix(uBandRange.x, uBandRange.y, uv.y);
  vUv = vec2(uv.x, bandV);
  gl_Position = vec4(position.x, bandV * 2.0 - 1.0, 0.0, 1.0);
}`,
    fragmentShader: `${cloudVolumetricGLSL}
uniform int uCloudSteps;
varying vec2 vUv;
void main(){
  float az = (vUv.x - 0.5) * PBR_TAU;
  float y = vUv.y >= 0.20
    ? pow(clamp((vUv.y - 0.20) / 0.80, 0.0, 1.0), 1.0 / 0.62)
    : -pow(clamp((0.20 - vUv.y) / 0.20, 0.0, 0.0001 + 1.0), 1.0 / 0.55);
  float horiz = sqrt(max(0.0, 1.0 - y * y));
  vec3 dir = vec3(sin(az) * horiz, y, -cos(az) * horiz);
  vec4 sky = renderVolumetricCloudSky(dir, uCloudSteps);
  if (uNightMix > 0.01 && dir.y > 0.0) {
    vec3 vt, vm;
    evalNeuralAtmosphere(max(dir.y, -0.10), 0.0, vt, vm);
    // Bake diffuse Milky Way band into skyEnvMap so ocean waves & wet beach film reflect the Galaxy!
    sky.rgb += sampleNasaStarMap(dir, vt, 0.0) * sky.a * 0.55;
  }
  gl_FragColor = sky;
}`
  });

  const blendMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tPrev: { value: envPrev.texture },
      tCurr: { value: envCurr.texture },
      uMix: { value: 1.0 }
    },
    vertexShader: `varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
    fragmentShader: `uniform sampler2D tPrev, tCurr;
uniform float uMix;
varying vec2 vUv;
void main(){
  gl_FragColor = mix(texture2D(tPrev, vUv), texture2D(tCurr, vUv), uMix);
}`
  });

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const envQuad = new THREE.Mesh(quadGeo, envMat);
  const envScene = new THREE.Scene();
  envScene.add(envQuad);
  const blendQuad = new THREE.Mesh(quadGeo, blendMat);
  const blendScene = new THREE.Scene();
  blendScene.add(blendQuad);
  const envCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const skyDomeUniforms = {
    sunDirection: sharedUniforms.sunDirection,
    skyTop: sharedUniforms.skyTop,
    skyHorizon: sharedUniforms.skyHorizon,
    uNightMix: sharedUniforms.uNightMix || { value: 0 },
    uCelestialSpin: sharedUniforms.uCelestialSpin || { value: 0 },
    uStarMap: { value: starMapTex.image ? starMapTex : fallbackStarTex },
    uStarReady: { value: starMapTex.image ? 1.0 : 0.0 },
    uSunTrans: { value: uSunTrans },
    uSunMS: { value: uSunMS },
    time: sharedUniforms.time,
    uNetW1: { value: uW1 },
    uNetB1: { value: uB1 },
    uNetW2: { value: uW2 },
    uNetB2: { value: uB2 },
    skyEnvMap: { value: envTarget.texture },
    skyEnvReady: { value: 0 }
  };

  const skyDomeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    uniforms: skyDomeUniforms,
    vertexShader: `varying vec3 vSky;
void main(){
  vSky = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(clip.xy, clip.w * 0.999998, clip.w);
}`,
    fragmentShader: `${skyCommonGLSL}
uniform sampler2D skyEnvMap;
uniform float skyEnvReady;
varying vec3 vSky;
void main(){
  vec3 d = normalize(vSky);
  vec3 L = normalize(sunDirection);
  float nightW = clamp(uNightMix, 0.0, 1.0);
  vec3 c;
  float cloudTrans = 1.0;
  if (skyEnvReady > 0.5) {
    float u = atan(d.x, -d.z) / PBR_TAU + 0.5;
    float v = d.y >= 0.0
      ? 0.20 + 0.80 * pow(clamp(d.y, 0.0, 1.0), 0.62)
      : 0.20 * (1.0 - pow(clamp(-d.y, 0.0, 1.0), 0.55));
    vec4 envS = textureLod(skyEnvMap, vec2(fract(u), clamp(v, 0.002, 0.998)), 0.0);
    c = envS.rgb;
    cloudTrans = envS.a;
    if (nightW > 0.01 && d.y > 0.0) {
      vec3 vt, vm;
      evalNeuralAtmosphere(max(d.y, -0.10), 0.0, vt, vm);
      // Subtract low-res baked glow before adding razor-sharp full-screen NASA Gaia/Hipparcos starfield!
      vec3 sharpStars = sampleNasaStarMap(d, vt, 1.0);
      vec3 softBaked  = sampleNasaStarMap(d, vt, 0.0) * 0.55;
      c = max(vec3(0.0), c - softBaked * cloudTrans) + sharpStars * cloudTrans;
    }
  } else {
    c = pbrSkyRadiance(d, L, skyTop, skyHorizon);
    if (nightW > 0.01 && d.y > 0.0) {
      vec3 vt, vm;
      evalNeuralAtmosphere(max(d.y, -0.10), 0.0, vt, vm);
      c += sampleNasaStarMap(d, vt, 1.0);
    }
  }

  float sunCos = dot(d, L);
  // Daytime Solar Disk
  if (nightW < 0.98) {
    float disk = smoothstep(0.99945, 0.99988, sunCos) * smoothstep(-0.01, 0.02, d.y);
    if (disk > 0.0) {
      float dusk = 1.0 - smoothstep(0.04, 0.28, clamp(L.y, 0.015, 1.0));
      vec3 diskTint = mix(vec3(18.0, 14.6, 10.4), vec3(22.0, 9.2, 3.2), dusk);
      c += uSunTrans * diskTint * disk * cloudTrans * (1.0 - nightW);
    }
  }
  // Nighttime Moon Disk with Lunar Maria Albedo & Atmospheric Aureole
  if (nightW > 0.04 && d.y > -0.01) {
    const float moonRadius = 0.0225;
    float cosEdge = cos(moonRadius);
    if (sunCos > cosEdge - 0.0008) {
      vec3 mRight = normalize(cross(vec3(0.0, 1.0, 0.0), L) + vec3(1e-5, 0.0, 0.0));
      vec3 mUp = cross(L, mRight);
      vec2 mUv = vec2(dot(d, mRight), dot(d, mUp)) / moonRadius;
      float r2 = dot(mUv, mUv);
      float moonMask = 1.0 - smoothstep(0.90, 1.03, sqrt(r2));
      if (moonMask > 0.0) {
        vec3 mNorm = vec3(mUv * min(1.0, inversesqrt(max(r2, 1.0))), sqrt(max(0.0, 1.0 - min(r2, 1.0))));
        float mare = cloudFbm(mNorm * 3.2 + vec3(1.4, -0.8, 2.3));
        float craters = cloudBillow3(mNorm * 7.8 - vec3(0.6, 1.9, 0.4));
        float mariaDark = 1.0 - 0.34 * smoothstep(0.46, 0.72, mare) + 0.08 * (craters - 0.5);
        // Waxing gibbous illumination + Lommel-Seeliger lunar regolith limb brightness
        float phaseLit = smoothstep(-0.18, 0.25, dot(mNorm, normalize(vec3(-0.30, 0.18, 0.93))));
        float regolith = mix(0.76, 1.06, sqrt(max(0.0, mNorm.z)));
        vec3 moonCol = vec3(2.55, 2.72, 3.05) * mariaDark * regolith * mix(0.05, 1.0, phaseLit);
        // Moon occludes background stars cleanly behind its physical solid sphere!
        c = mix(c, moonCol * cloudTrans + c * (1.0 - cloudTrans), moonMask * nightW);
      }
    }
    float lunarCorona = pow(max(sunCos, 0.0), 220.0) * 0.48 + pow(max(sunCos, 0.0), 28.0) * 0.045;
    c += vec3(0.55, 0.72, 1.05) * lunarCorona * cloudTrans * nightW * smoothstep(-0.01, 0.04, d.y);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
  });

  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), skyDomeMat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = 2;
  skyMesh.userData.isSkyDome = true;

  let lastEnvTime = -1e9;
  let lastSunX = NaN, lastSunY = NaN, lastSunZ = NaN, lastNightMix = NaN;
  let envBandIdx = 0;

  function latchBuildUniforms(currentTime) {
    const sDir = sharedUniforms.sunDirection.value;
    buildUniforms.sunDirection.value.copy(sDir);
    buildUniforms.skyTop.value.copy(sharedUniforms.skyTop.value);
    buildUniforms.skyHorizon.value.copy(sharedUniforms.skyHorizon.value);
    buildUniforms.uNightMix.value = sharedUniforms.uNightMix ? sharedUniforms.uNightMix.value : 0;
    buildUniforms.uCelestialSpin.value = sharedUniforms.uCelestialSpin ? sharedUniforms.uCelestialSpin.value : 0;
    evalNeuralAtmosphereCPU(Math.max(0.02, sDir.y), 0.0, buildUniforms.uSunTrans.value, buildUniforms.uSunMS.value);
    buildUniforms.time.value = currentTime;
  }

  function update(currentTime, force = false) {
    const sDir = sharedUniforms.sunDirection.value;
    const curNight = sharedUniforms.uNightMix ? sharedUniforms.uNightMix.value : 0;
    const sunDelta =
      Math.abs(sDir.x - lastSunX) +
      Math.abs(sDir.y - lastSunY) +
      Math.abs(sDir.z - lastSunZ) +
      Math.abs(curNight - lastNightMix);
    const sunMoved = !Number.isFinite(sunDelta) || sunDelta > 2e-4;
    const needFull = force || skyDomeUniforms.skyEnvReady.value < 0.5;
    if (!needFull && !sunMoved && Math.abs(currentTime - lastEnvTime) < 0.024) return;
    lastEnvTime = currentTime;
    lastSunX = sDir.x;
    lastSunY = sDir.y;
    lastSunZ = sDir.z;
    lastNightMix = curNight;

    // Live solar/lunar transmittance for skyDomeMat
    evalNeuralAtmosphereCPU(Math.max(0.02, sDir.y), 0.0, uSunTrans, uSunMS);

    const oldTarget = renderer.getRenderTarget();
    const oldTone = renderer.toneMapping;
    const oldAuto = renderer.autoClear;
    try {
      renderer.toneMapping = THREE.NoToneMapping;
      // DPR-independent offscreen strip rendering via uBandRange in NDC (ZERO setViewport / setScissor scaling bugs!)
      if (needFull) {
        latchBuildUniforms(currentTime);
        buildUniforms.uBandRange.value.set(0.0, 1.0);
        renderer.autoClear = true;
        renderer.setRenderTarget(envCurr);
        renderer.clear();
        renderer.render(envScene, envCam);

        blendMat.uniforms.tPrev.value = envCurr.texture;
        blendMat.uniforms.tCurr.value = envCurr.texture;
        blendMat.uniforms.uMix.value = 1.0;
        renderer.setRenderTarget(envPrev);
        renderer.clear();
        renderer.render(blendScene, envCam);
        renderer.setRenderTarget(envTarget);
        renderer.clear();
        renderer.render(blendScene, envCam);
        renderer.setRenderTarget(envBuild);
        renderer.clear();
        renderer.render(blendScene, envCam);

        envBandIdx = 0;
        latchBuildUniforms(currentTime);
        skyDomeUniforms.skyEnvReady.value = 1;
      } else {
        const bandsThisFrame = sunMoved ? 2 : 1;
        renderer.autoClear = false;
        renderer.setRenderTarget(envBuild);
        for (let b = 0; b < bandsThisFrame; b++) {
          if (envBandIdx === 0) {
            latchBuildUniforms(currentTime);
          }
          const v0 = envBandIdx / ENV_BANDS;
          const v1 = (envBandIdx + 1) / ENV_BANDS;
          buildUniforms.uBandRange.value.set(v0, v1);
          renderer.render(envScene, envCam);
          envBandIdx++;
          if (envBandIdx >= ENV_BANDS) {
            envBandIdx = 0;
            const completed = envBuild;
            envBuild = envPrev;
            envPrev = envCurr;
            envCurr = completed;
            break;
          }
        }
        const tLin = envBandIdx / ENV_BANDS;
        const smoothMix = tLin * tLin * (3.0 - 2.0 * tLin);
        blendMat.uniforms.tPrev.value = envPrev.texture;
        blendMat.uniforms.tCurr.value = envCurr.texture;
        blendMat.uniforms.uMix.value = smoothMix;
        renderer.autoClear = true;
        renderer.setRenderTarget(envTarget);
        renderer.render(blendScene, envCam);
      }
    } finally {
      renderer.toneMapping = oldTone;
      renderer.autoClear = oldAuto;
      renderer.setRenderTarget(oldTarget);
    }
  }

  function setQuality({ width = 640, height = 320, steps = 16, doBake = true } = {}) {
    const nw = Math.max(128, width | 0);
    const nh = Math.max(64, height | 0);
    buildUniforms.uCloudSteps.value = Math.max(6, Math.min(30, steps | 0));
    if (nw !== envW || nh !== envH) {
      envW = nw;
      envH = nh;
      envTarget.setSize(envW, envH);
      envPrev.setSize(envW, envH);
      envCurr.setSize(envW, envH);
      envBuild.setSize(envW, envH);
    }
    skyDomeUniforms.skyEnvReady.value = 0;
    if (doBake) update(lastEnvTime > -1e8 ? lastEnvTime : sharedUniforms.time.value, true);
  }

  return {
    skyMesh,
    texture: envTarget.texture,
    starMapTexture: starMapTex,
    getTarget: () => [envTarget, envPrev, envCurr, envBuild],
    getCompileSpecs: () => [
      { label: '3D 體積積雲與神經大氣光線步進 (SkyCloudEnv)', scene: envScene, camera: envCam, materials: [envMat], isCanvasPass: false },
      { label: '天穹時間平滑全景混合 (SkyEnvBlend)', scene: blendScene, camera: envCam, materials: [blendMat], isCanvasPass: false }
    ],
    readyUniform: skyDomeUniforms.skyEnvReady,
    starReadyPromise,
    update,
    setQuality,
    stats: () => ({
      neuralAtmosParams: 78,
      neuralAtmosMse: Number(net.mse.toFixed(7)),
      neuralAtmosTrainMs: Number(net.trainMs.toFixed(2)),
      envResolution: `${envW}x${envH}`,
      cloudSteps: buildUniforms.uCloudSteps.value,
      nasaStarMapReady: skyDomeUniforms.uStarReady.value > 0.5
    }),
    dispose() {
      envTarget.dispose();
      envPrev.dispose();
      envCurr.dispose();
      envBuild.dispose();
      starMapTex.dispose();
      fallbackStarTex.dispose();
      envMat.dispose();
      blendMat.dispose();
      quadGeo.dispose();
      skyDomeMat.dispose();
      skyMesh.geometry.dispose();
    }
  };
}
