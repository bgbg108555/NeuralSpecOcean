/** Bounded visual foam approximation: source from compression, semi-Lagrangian drift, exponential decay. */
export function createFoamField(THREE, { size = 64, length = 240, lifetime = 3 } = {}) {
  const a = new Float32Array(size * size), b = new Float32Array(size * size);
  let activePixels = new Uint8Array(size * size * 4), stagingPixels = new Uint8Array(size * size * 4);
  let current = a, next = b;
  let labels = new Float32Array(size * size * 2), nextLabels = new Float32Array(size * size * 2);
  let activeLabelPixels = new Float32Array(size * size * 4), stagingLabelPixels = new Float32Array(size * size * 4);

  // Lightweight 1x1 stub for legacy API compatibility (Offshore.js unpacks both current & previous offsets from materialTexture.xyzw!)
  const previousMaterialTexture = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  previousMaterialTexture.needsUpdate = true;

  const materialTexture = new THREE.DataTexture(activeLabelPixels, size, size, THREE.RGBAFormat, THREE.FloatType);
  materialTexture.wrapS = materialTexture.wrapT = THREE.RepeatWrapping;
  materialTexture.minFilter = materialTexture.magFilter = THREE.NearestFilter;
  materialTexture.generateMipmaps = false;
  materialTexture.needsUpdate = true;

  const texture = new THREE.DataTexture(activePixels, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const mask = size - 1;

  function uploadTex(doMat = true, doDen = true) {
    if (doMat) materialTexture.needsUpdate = true;
    if (doDen) texture.needsUpdate = true;
  }

  function updateRows(dt, source, flow, jStart, jEnd) {
    const d = size / length, decay = Math.exp(-dt / lifetime), cellLen = length / size;
    for (let j = jStart; j < jEnd; j++) {
      const wz = (j + 0.5) * cellLen, rowOff = j * size;
      for (let i = 0; i < size; i++) {
        const wx = (i + 0.5) * cellLen, r = source(wx, wz, i, j);
        const isObj = typeof r === 'object' && r !== null;
        const strength = isObj ? r[0] : r, vx = isObj ? r[1] : flow[0], vz = isObj ? r[2] : flow[1];
        const x = i - vx * dt * d, z = j - vz * dt * d;
        const x0 = Math.floor(x), z0 = Math.floor(z), u = x - x0, v = z - z0, omu = 1 - u, omv = 1 - v;
        const ix0 = x0 & mask, ix1 = (x0 + 1) & mask, iz0 = (z0 & mask) * size, iz1 = ((z0 + 1) & mask) * size;
        const i00 = iz0 + ix0, i10 = iz0 + ix1, i01 = iz1 + ix0, i11 = iz1 + ix1;
        const w00 = omu * omv, w10 = u * omv, w01 = omu * v, w11 = u * v;
        const f = current[i00] * w00 + current[i10] * w10 + current[i01] * w01 + current[i11] * w11;
        const idx = rowOff + i, lOff = idx * 2, pOff = idx * 4;
        const l00 = i00 * 2, l10 = i10 * 2, l01 = i01 * 2, l11 = i11 * 2;
        const offX = (labels[l00] * w00 + labels[l10] * w10 + labels[l01] * w01 + labels[l11] * w11) - vx * dt;
        const offZ = (labels[l00 + 1] * w00 + labels[l10 + 1] * w10 + labels[l01 + 1] * w01 + labels[l11 + 1] * w11) - vz * dt;
        nextLabels[lOff] = offX;
        nextLabels[lOff + 1] = offZ;
        stagingLabelPixels[pOff] = offX;
        stagingLabelPixels[pOff + 1] = offZ;
        stagingLabelPixels[pOff + 2] = activeLabelPixels[pOff];
        stagingLabelPixels[pOff + 3] = activeLabelPixels[pOff + 1];
        const s = strength > 0 ? strength : 0;
        const value = Math.min(1, Math.max(0, f * decay + s * dt));
        next[idx] = value;
        const q = (value * 255 + 0.5) | 0;
        stagingPixels[pOff] = q;
        stagingPixels[pOff + 1] = q;
        stagingPixels[pOff + 2] = q;
        stagingPixels[pOff + 3] = 255;
      }
    }
  }

  function commitStaging() {
    const tmpL = activeLabelPixels; activeLabelPixels = stagingLabelPixels; stagingLabelPixels = tmpL;
    const tmpP = activePixels; activePixels = stagingPixels; stagingPixels = tmpP;
    materialTexture.image.data = activeLabelPixels;
    texture.image.data = activePixels;
    uploadTex(true, true);
  }

  function update(dt, source, flow = [0.65, 0.18]) {
    dt = Math.max(0, Math.min(0.2, dt));
    updateRows(dt, source, flow, 0, size);
    [current, next] = [next, current];
    [labels, nextLabels] = [nextLabels, labels];
    commitStaging();
  }

  function updateSlice(dt, source, sliceIdx, totalSlices = 4, flow = [0.65, 0.18]) {
    dt = Math.max(0, Math.min(0.2, dt));
    const rowsPer = size / totalSlices;
    const j0 = Math.round(sliceIdx * rowsPer), j1 = sliceIdx === totalSlices - 1 ? size : Math.round((sliceIdx + 1) * rowsPer);
    updateRows(dt, source, flow, j0, j1);
    if (sliceIdx === totalSlices - 1) {
      [current, next] = [next, current];
      [labels, nextLabels] = [nextLabels, labels];
      commitStaging();
      return true;
    }
    return false;
  }

  return {
    texture,
    materialTexture,
    previousMaterialTexture,
    syncMaterialHistory() {
      for (let k = 0; k < size * size; k++) {
        activeLabelPixels[k * 4 + 2] = activeLabelPixels[k * 4];
        activeLabelPixels[k * 4 + 3] = activeLabelPixels[k * 4 + 1];
      }
      stagingLabelPixels.set(activeLabelPixels);
      uploadTex(true, false);
    },
    update,
    updateSlice,
    get materialOffsets() { return labels; },
    reset() {
      labels.fill(0);
      nextLabels.fill(0);
      activeLabelPixels.fill(0);
      stagingLabelPixels.fill(0);
      current.fill(0);
      next.fill(0);
      activePixels.fill(0);
      stagingPixels.fill(0);
      materialTexture.image.data = activeLabelPixels;
      texture.image.data = activePixels;
      uploadTex(true, true);
    },
    get values() { return current; },
    dispose() {
      texture.dispose();
      materialTexture.dispose();
      previousMaterialTexture.dispose();
    }
  };
}
