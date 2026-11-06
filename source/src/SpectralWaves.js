export function createSpectralWaves(THREE, {
  size = 64,
  length = 100,
  wind = 18,
  seed = 1234,
  band = 'full',
  geometrySpacing = 0,
  linearFilter = false
} = {}) {
  if (size < 2 || (size & (size - 1))) throw Error('size must be a power of two');
  if (!['full', 'long', 'short', 'chop'].includes(band)) throw Error('unknown band');
  const isChop = band === 'chop';

  let state = seed >>> 0;
  const rand = () => ((state = (1664525 * state + 1013904223) >>> 0) + 1) / 4294967297;
  const gaussian = () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());

  const directionalPower = new Float64Array(36);
  const n = size, N = n * n, g = 9.81, L = (wind * wind) / g;
  const re0 = new Float32Array(N), im0 = new Float32Array(N);
  const kx = new Float32Array(N), kz = new Float32Array(N), omega = new Float32Array(N);
  // Precomputed conjugate indices & Riesz/analytical-slope wavevectors (Float32 halves CPU cache footprint & RAM!)
  const conjIdx = new Int32Array(N);
  const fxArr = new Float32Array(N), fzArr = new Float32Array(N);

  // Packed Hermitian 2-in-1 complex IFFT buffers: Z = dx + i*dz solves BOTH spatial axes in 1 IFFT instead of 2!
  const re = new Float32Array(N), im = new Float32Array(N);
  const dxr = new Float32Array(N), dxi = new Float32Array(N);
  const pixels = new Float32Array(N * 4);

  let chopSlopeVarSum = 0;
  let dispJacobianVarSum = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      conjIdx[i] = ((n - y) % n) * n + ((n - x) % n);
      const kxx = ((x <= n / 2 ? x : x - n) * 2 * Math.PI) / length;
      const kzz = ((y <= n / 2 ? y : y - n) * 2 * Math.PI) / length;
      const k = Math.hypot(kxx, kzz);
      kx[i] = kxx;
      kz[i] = kzz;
      // Gravity-capillary dispersion omega^2 = g*k*(1 + k^2/k_m^2) for crisp high-wavenumber chop evolution
      omega[i] = Math.sqrt(g * k * (1 + (isChop ? k * k * 0.00075 : 0)));
      if (isChop) {
        // Exact analytical height gradient (dH/dx, dH/dz) = i * (kx, kz) * H (scales by k so full k^-4 slope tail is preserved!)
        fxArr[i] = k > 0 && x !== n / 2 ? kxx : 0;
        fzArr[i] = k > 0 && y !== n / 2 ? kzz : 0;
      } else {
        fxArr[i] = k > 0 && x !== n / 2 ? kxx / k : 0;
        fzArr[i] = k > 0 && y !== n / 2 ? kzz / k : 0;
      }
      if (k > 0) {
        let a = 0;
        if (isChop) {
          // Continuous Mitsuyasu–Donelan–Banner Broad Directional Wind-Sea Spectrum:
          // Smoothly distributes capillary-gravity energy across a wide natural fan (eliminates X-shaped diamond lattice!)
          const cMain  = (0.3300 * kxx + 0.9440 * kzz) / k;
          const cSkew  = (-0.2800 * kxx + 0.9600 * kzz) / k;
          const cBroad = (0.7600 * kxx + 0.6499 * kzz) / k;
          const halfMain = 0.5 + 0.5 * cMain;
          const broadDir = 0.26
            + 0.48 * (halfMain * halfMain)
            + 0.20 * (cMain * cMain)
            + 0.14 * Math.max(0, cSkew) * Math.max(0, cSkew)
            + 0.12 * Math.max(0, cBroad) * Math.max(0, cBroad);
          // Smooth radial circular Nyquist taper (prevents square grid-corner anisotropy!)
          const kNyq = (Math.PI * n) / length;
          const uNyq = Math.max(0, Math.min(1, (kNyq * 0.92 - k) / (kNyq * 0.30)));
          const radialTaper = uNyq * uNyq * (3 - 2 * uNyq);
          const phChop = (Math.exp(-0.26 / (k * k)) * broadDir * radialTaper * Math.exp(-k * k * 0.0011)) / (k * k * k * k);
          a = Math.sqrt(phChop * 0.5);
        } else {
          // Broad continuous Mitsuyasu directional spreading (replaces narrow cos^12 crossing beams that formed diamond grids!)
          const cMain = (0.35 * kxx + 0.93675 * kzz) / k;
          const cSub  = (-0.31 * kxx + 0.95074 * kzz) / k;
          const cObl  = (0.82 * kxx + 0.5724 * kzz) / k;
          const dirSpread = band === 'short'
            ? (0.24 + 0.72 * (cMain * cMain) + 0.26 * (cSub * cSub) + 0.18 * (cObl * cObl))
            : (0.11 + 1.06 * Math.pow(Math.abs(cMain), 4) + 0.38 * Math.pow(Math.abs(cSub), 4) + 0.18 * (cObl * cObl));
          const ph =
            (Math.exp(-1 / (k * k * L * L)) *
              dirSpread *
              Math.exp(-k * k * 0.08)) /
            (k * k * k * k);
          let blend = Math.max(0, Math.min(1, (k - 0.3) / 0.4));
          blend = blend * blend * (3 - 2 * blend);
          const bandWeight = band === 'long' ? 1 - blend : band === 'short' ? blend : 1;
          const wavelength = (2 * Math.PI) / k;
          let f = geometrySpacing > 0
            ? Math.max(0, Math.min(1, (wavelength - 4 * geometrySpacing) / (4 * geometrySpacing)))
            : 1;
          f = f * f * (3 - 2 * f);
          a = Math.sqrt((ph * bandWeight * f) / 2) * (band === 'short' ? 0.0024 : 0.00032);
        }
        const gr = gaussian() * a, gi = gaussian() * a;
        re0[i] = gr;
        im0[i] = gi;
        if (isChop) {
          chopSlopeVarSum += 2.0 * (gr * gr + gi * gi) * (fxArr[i] * fxArr[i] + fzArr[i] * fzArr[i]);
        } else {
          // Parseval stationary variance of horizontal displacement gradients (dDx/dx, dDx/dz, dDz/dx, dDz/dz)
          const ampSq = 2.0 * (gr * gr + gi * gi);
          const dxxK = fxArr[i] * kxx, dxzK = fxArr[i] * kzz, dzxK = fzArr[i] * kxx, dzzK = fzArr[i] * kzz;
          dispJacobianVarSum += ampSq * (dxxK * dxxK + dxzK * dxzK + dzxK * dzxK + dzzK * dzzK);
        }
        const angle = (Math.atan2(kzz, kxx) + Math.PI) % Math.PI;
        directionalPower[Math.min(35, Math.floor((angle / Math.PI) * 36))] += gr * gr + gi * gi;
      }
    }
  }
  // Calibrate smooth physical 2D RMS slope = 0.205 for continuous broad wind-chop cascade (eliminates harsh facet shimmer)
  if (isChop && chopSlopeVarSum > 1e-12) {
    const scaleChop = 0.205 / Math.sqrt(chopSlopeVarSum);
    for (let i = 0; i < N; i++) {
      re0[i] *= scaleChop;
      im0[i] *= scaleChop;
    }
  }

  // Precompute bit-reversal swap pairs & radix-2 inverse FFT twiddle tables ONCE at startup (~4x faster CPU FFT!)
  const swapA = [], swapB = [];
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      swapA.push(i);
      swapB.push(j);
    }
  }
  const swapCount = swapA.length;
  const swapArrA = new Int32Array(swapA);
  const swapArrB = new Int32Array(swapB);

  const stages = Math.round(Math.log2(n));
  const twiddleRe = new Float32Array(stages * (n >> 1));
  const twiddleIm = new Float32Array(stages * (n >> 1));
  for (let s = 0, len = 2; s < stages; s++, len <<= 1) {
    const half = len >> 1;
    const base = s * (n >> 1);
    const stepAng = (2 * Math.PI) / len;
    for (let j = 0; j < half; j++) {
      twiddleRe[base + j] = Math.cos(stepAng * j);
      twiddleIm[base + j] = Math.sin(stepAng * j);
    }
  }
  const invN = 1.0 / n;

  function ifft1D(rArr, iArr, offset, stride) {
    for (let s = 0; s < swapCount; s++) {
      const a = offset + swapArrA[s] * stride;
      const b = offset + swapArrB[s] * stride;
      const tr = rArr[a]; rArr[a] = rArr[b]; rArr[b] = tr;
      const ti = iArr[a]; iArr[a] = iArr[b]; iArr[b] = ti;
    }
    const lastStage = stages - 1;
    for (let s = 0, len = 2; s < stages; s++, len <<= 1) {
      const half = len >> 1;
      const halfStride = half * stride;
      const twBase = s * (n >> 1);
      const scale = s === lastStage ? invN : 1.0;
      for (let i = 0; i < n; i += len) {
        let a = offset + i * stride;
        let b = a + halfStride;
        for (let j = 0; j < half; j++) {
          const wr = twiddleRe[twBase + j];
          const wi = twiddleIm[twBase + j];
          const rb = rArr[b], ib = iArr[b];
          const tr = wr * rb - wi * ib;
          const ti = wr * ib + wi * rb;
          const ra = rArr[a], ia = iArr[a];
          rArr[b] = (ra - tr) * scale;
          iArr[b] = (ia - ti) * scale;
          rArr[a] = (ra + tr) * scale;
          iArr[a] = (ia + ti) * scale;
          a += stride;
          b += stride;
        }
      }
    }
  }

  const filterMode = linearFilter ? THREE.LinearFilter : THREE.NearestFilter;
  const texture = new THREE.DataTexture(pixels, n, n, THREE.RGBAFormat, THREE.FloatType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = filterMode;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const fixedHeightBound = 2 * re0.reduce((acc, r, i) => acc + Math.hypot(r, im0[i]), 0);
  // Time-invariant Parseval 3.1-sigma spectral gradient bound: eliminates frame-to-frame chop & midScale jumps!
  const spectralGradientBound = isChop ? 0 : 3.15 * Math.sqrt(dispJacobianVarSum);
  let lastMaxImaginary = 0, lastSpectrum = null, maxGradient = 0, maxHeight = 0;
  const invDs = (N * n) / length;

  function flushGpuTexture() {
    texture.needsUpdate = true;
  }

  function update(t) {
    for (let i = 0; i < N; i++) {
      const j = conjIdx[i];
      const w = omega[i] * t;
      const c = Math.cos(w), s = Math.sin(w);
      const r0i = re0[i], i0i = im0[i], r0j = re0[j], i0j = im0[j];
      const r = (r0i + r0j) * c - (i0i + i0j) * s;
      const q = (r0i - r0j) * s + (i0i - i0j) * c;
      const fx = fxArr[i], fz = fzArr[i];
      if (!isChop) {
        re[i] = r;
        im[i] = q;
      }
      // Hermitian 2-in-1 complex packing: Z_hat = D_x_hat + i * D_z_hat -> Re(IFFT(Z)) = dx, Im(IFFT(Z)) = dz!
      dxr[i] = -q * fx - r * fz;
      dxi[i] =  r * fx - q * fz;
    }
    if (n <= 8 && !isChop) lastSpectrum = { re: re.slice(), im: im.slice() };

    if (isChop) {
      for (let y = 0; y < n; y++) ifft1D(dxr, dxi, y * n, 1);
      for (let x = 0; x < n; x++) ifft1D(dxr, dxi, x, n);
    } else {
      for (let y = 0; y < n; y++) {
        const row = y * n;
        ifft1D(re, im, row, 1);
        ifft1D(dxr, dxi, row, 1);
      }
      for (let x = 0; x < n; x++) {
        ifft1D(re, im, x, n);
        ifft1D(dxr, dxi, x, n);
      }
    }

    lastMaxImaginary = 0;
    maxHeight = 0;
    let xx = 0, xz = 0, zx = 0, zz = 0;
    const mask = n - 1;

    if (isChop) {
      for (let y = 0; y < n; y++) {
        const row = y * n;
        const nextRow = ((y + 1) & mask) * n;
        for (let x = 0; x < n; x++) {
          const i = row + x;
          const ix = row + ((x + 1) & mask);
          const iz = nextRow + x;
          const sxVal = dxr[i] * N;
          const szVal = dxi[i] * N;
          const conv = -((dxr[ix] - dxr[i]) + (dxi[iz] - dxi[i])) * N;
          const crestSharp = Math.max(0.0, Math.min(1.0, conv * 0.85));
          const pOff = i * 4;
          pixels[pOff] = 0.0;
          pixels[pOff + 1] = sxVal;
          pixels[pOff + 2] = szVal;
          pixels[pOff + 3] = crestSharp;
        }
      }
      flushGpuTexture();
      return;
    }

    for (let y = 0; y < n; y++) {
      const row = y * n;
      const nextRow = ((y + 1) & mask) * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        const ix = row + ((x + 1) & mask);
        const iz = nextRow + x;

        const imMax = Math.abs(im[i]) * N;
        if (imMax > lastMaxImaginary) lastMaxImaginary = imMax;

        const hVal = re[i] * N;
        const absH = Math.abs(hVal);
        if (absH > maxHeight) maxHeight = absH;

        const dxVal = dxr[i] * N;
        const dzVal = dxi[i] * N;

        const dxx = (dxr[ix] - dxr[i]) * invDs;
        const dxz = (dxr[iz] - dxr[i]) * invDs;
        const dzx = (dxi[ix] - dxi[i]) * invDs;
        const dzz = (dxi[iz] - dxi[i]) * invDs;

        const axx = Math.abs(dxx), axz = Math.abs(dxz), azx = Math.abs(dzx), azz = Math.abs(dzz);
        if (axx > xx) xx = axx;
        if (axz > xz) xz = axz;
        if (azx > zx) zx = azx;
        if (azz > zz) zz = azz;

        // Pack normalized crest orbital convergence into .a so distant ocean fragments have real per-pixel FFT whitecap energy!
        const crestConv = Math.max(0.0, Math.min(1.0, -(dxx + dzz) * 0.55));
        const pOff = i * 4;
        pixels[pOff] = hVal;
        pixels[pOff + 1] = dxVal;
        pixels[pOff + 2] = dzVal;
        pixels[pOff + 3] = crestConv;
      }
    }
    maxGradient = Math.hypot(xx, xz, zx, zz);
    flushGpuTexture();
  }

  update(0);

  function sampleHeight(x, z, channel = 0, source = pixels) {
    const fx = (((x / length) % 1 + 1) % 1) * n - 0.5;
    const fz = (((z / length) % 1 + 1) % 1) * n - 0.5;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const u = fx - x0, v = fz - z0;
    const mask = n - 1;
    const ax = x0 & mask, bx = (x0 + 1) & mask;
    const az = (z0 & mask) * n, bz = ((z0 + 1) & mask) * n;
    return (
      (source[(az + ax) * 4 + channel] * (1 - u) + source[(az + bx) * 4 + channel] * u) * (1 - v) +
      (source[(bz + ax) * 4 + channel] * (1 - u) + source[(bz + bx) * 4 + channel] * u) * v
    );
  }

  return {
    couplingModes: Array.from(re0, (r, i) => ({ re: r, im: im0[i], kx: kx[i], kz: kz[i], omega: omega[i] })),
    texture,
    update,
    sampleHeight,
    setLinearFilter(enabled) {
      const fMode = enabled ? THREE.LinearFilter : THREE.NearestFilter;
      if (texture.minFilter !== fMode) {
        texture.minFilter = texture.magFilter = fMode;
        texture.needsUpdate = true;
      }
    },
    dispose() {
      texture.dispose();
    },
    get directionalPower() {
      return directionalPower.slice();
    },
    get fixedHeightBound() {
      return fixedHeightBound;
    },
    get maxHeight() {
      return maxHeight;
    },
    get maxGradient() {
      return maxGradient;
    },
    get spectralGradientBound() {
      return spectralGradientBound;
    },
    get maxImaginary() {
      return lastMaxImaginary;
    },
    get debugSpectrum() {
      return lastSpectrum;
    },
    size,
    length
  };
}
