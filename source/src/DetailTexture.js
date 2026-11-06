export function createDetailTexture(THREE, { size = 256, seed = 4321 } = {}) {
  let state = seed >>> 0;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) >>> 8) / 16777216;
  const out = new Float32Array(size * size);
  let weight = 0;
  for (const [grid, amp] of [[4, 1], [8, 0.6], [16, 0.32], [32, 0.16], [64, 0.08]]) {
    const values = Float32Array.from({ length: grid * grid }, random);
    weight += amp;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * grid, fy = (y / size) * grid;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        let u = fx - ix, v = fy - iy;
        u = u * u * (3 - 2 * u);
        v = v * v * (3 - 2 * v);
        const at = (a, b) => values[(b % grid) * grid + (a % grid)];
        const lo = at(ix, iy) * (1 - u) + at(ix + 1, iy) * u;
        const hi = at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u;
        out[y * size + x] += (lo * (1 - v) + hi * v) * amp;
      }
    }
  }
  const bytes = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((255 * out[i]) / weight);
    bytes[i * 4] = v;
    bytes[i * 4 + 1] = v;
    bytes[i * 4 + 2] = v;
    bytes[i * 4 + 3] = 255;
  }
  // Bake organic multi-scale foam cluster & bubble pore masks into G, B, A while keeping R unchanged.
  bakeFoamMask(bytes, size, 91827);

  const tex = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function bakeFoamMask(bytes, size, seed) {
  let state = seed >>> 0;
  const rnd = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) >>> 8) / 16777216;
  const density = new Float32Array(size * size);
  const pores = new Float32Array(size * size);

  function splat(dst, x, y, rx, ry, angle, weight) {
    const co = Math.cos(angle), si = Math.sin(angle);
    const r = Math.ceil(Math.max(rx, ry) * 2.3);
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const dx = i * co + j * si;
        const dy = -i * si + j * co;
        const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (d > 5.3) continue;
        const xx = (((Math.floor(x) + i) % size) + size) % size;
        const yy = (((Math.floor(y) + j) % size) + size) % size;
        dst[yy * size + xx] += Math.exp(-d * 1.45) * weight;
      }
    }
  }

  const scale = size / 256;
  for (let cluster = 0; cluster < 42; cluster++) {
    const cx = rnd() * size, cy = rnd() * size;
    const a = rnd() * Math.PI * 2, co = Math.cos(a), si = Math.sin(a);
    const rx = (8 + rnd() * 14) * scale, ry = (4.5 + rnd() * 8.5) * scale;
    const strength = 0.45 + rnd() * 0.65;
    for (let j = 0; j < 24; j++) {
      const r = Math.sqrt(rnd()), theta = rnd() * Math.PI * 2;
      const dx = Math.cos(theta) * r * rx, dy = Math.sin(theta) * r * ry;
      const x = cx + co * dx - si * dy, y = cy + si * dx + co * dy;
      splat(density, x, y, (1.8 + rnd() * 4.2) * scale, (1.5 + rnd() * 3.0) * scale, a + (rnd() - 0.5) * 2, strength);
    }
  }

  for (let i = 0; i < 950; i++) {
    splat(pores, rnd() * size, rnd() * size, (0.55 + rnd() * 1.9) * scale, (0.45 + rnd() * 1.2) * scale, rnd() * 6.28, 0.35 + rnd() * 0.7);
  }
  const finePores = new Float32Array(size * size);
  for (let i = 0; i < 1150; i++) {
    splat(finePores, rnd() * size, rnd() * size, (0.9 + rnd() * 4.4) * scale, (0.75 + rnd() * 2.7) * scale, rnd() * 6.28, 0.55 + rnd() * 0.75);
  }
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < size * size; i++) {
    bytes[i * 4 + 2] = Math.round(255 * (1 - smooth(0.36, 0.94, finePores[i])));
    const body = 1 - Math.exp(-density[i] * 1.45);
    const pore = 1 - Math.min(0.88, pores[i]) * Math.max(0, (body - 0.28) / 0.72);
    const v = Math.max(0, Math.min(1, Math.pow(body * pore, 1.18)));
    bytes[4 * i + 1] = Math.round(v * 255);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = (size - 1 - y + 71) % size;
      const sy = (x + 109) % size;
      bytes[(y * size + x) * 4 + 3] = bytes[(sy * size + sx) * 4 + 1];
    }
  }
}
