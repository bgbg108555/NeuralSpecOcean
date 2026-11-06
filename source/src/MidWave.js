/** Bounded five-component curved-wavefront mid-scale gravity wave group; zero-alloc JS + exact GLSL match.
 * Uses non-orthogonal golden-sector directions + gentle along-crest curvature to eliminate diamond lattice interference!
 */
const MID_K0 = (2 * Math.PI) / 17.5, MID_W0 = Math.sqrt(9.81 * MID_K0);
const MID_K1 = (2 * Math.PI) / 13.2, MID_W1 = Math.sqrt(9.81 * MID_K1);
const MID_K2 = (2 * Math.PI) / 10.1, MID_W2 = Math.sqrt(9.81 * MID_K2);
const MID_K3 = (2 * Math.PI) / 7.9,  MID_W3 = Math.sqrt(9.81 * MID_K3);
const MID_K4 = (2 * Math.PI) / 6.3,  MID_W4 = Math.sqrt(9.81 * MID_K4);

export function mediumWaveOut(x, z, t, out3) {
  const group = 0.68 + 0.22 * Math.sin(0.027 * x + 0.019 * z - 0.075 * t)
                     + 0.14 * Math.cos(0.018 * x - 0.029 * z - 0.055 * t);
  const bendA = 0.34 * Math.sin(-0.085 * x + 0.115 * z + 0.12 * t);
  const bendB = 0.30 * Math.cos(0.105 * x + 0.078 * z - 0.10 * t);

  // 5 non-orthogonal directions fanned organically (no 90-deg crossing pairs!)
  let th = MID_K0 * (0.3420 * x + 0.9397 * z) + bendA - MID_W0 * t + 0.25;
  let a = 0.135 * group, q = -1.04 * a * Math.sin(th);
  let h = a * Math.cos(th), dx = q * 0.3420, dz = q * 0.9397;

  th = MID_K1 * (0.7880 * x + 0.6157 * z) - bendB * 0.8 - MID_W1 * t + 1.85;
  a = 0.105 * group; q = -1.04 * a * Math.sin(th);
  h += a * Math.cos(th); dx += q * 0.7880; dz += q * 0.6157;

  th = MID_K2 * (-0.2250 * x + 0.9744 * z) + bendB - MID_W2 * t + 3.15;
  a = 0.088 * group; q = -1.02 * a * Math.sin(th);
  h += a * Math.cos(th); dx -= q * 0.2250; dz += q * 0.9744;

  th = MID_K3 * (0.9563 * x + 0.2924 * z) - bendA * 0.7 - MID_W3 * t + 4.55;
  a = 0.068 * group; q = -0.98 * a * Math.sin(th);
  h += a * Math.cos(th); dx += q * 0.9563; dz += q * 0.2924;

  th = MID_K4 * (-0.5878 * x + 0.8090 * z) + bendA * 0.6 - MID_W4 * t + 5.40;
  a = 0.054 * group; q = -0.95 * a * Math.sin(th);
  h += a * Math.cos(th); dx -= q * 0.5878; dz += q * 0.8090;

  out3[0] = h;
  out3[1] = dx;
  out3[2] = dz;
  return out3;
}

export function mediumWave(x, z, t) {
  return mediumWaveOut(x, z, t, [0, 0, 0]);
}

export function mediumWaveHeightAndDeriv(x, z, t, out2) {
  const phiG1 = 0.027 * x + 0.019 * z - 0.075 * t;
  const phiG2 = 0.018 * x - 0.029 * z - 0.055 * t;
  const group = 0.68 + 0.22 * Math.sin(phiG1) + 0.14 * Math.cos(phiG2);
  const dGroupDt = -0.0165 * Math.cos(phiG1) + 0.0077 * Math.sin(phiG2);

  const phBA = -0.085 * x + 0.115 * z + 0.12 * t;
  const phBB =  0.105 * x + 0.078 * z - 0.10 * t;
  const bendA = 0.34 * Math.sin(phBA), dBendA = 0.0408 * Math.cos(phBA);
  const bendB = 0.30 * Math.cos(phBB), dBendB = 0.0300 * Math.sin(phBB);

  let th = MID_K0 * (0.3420 * x + 0.9397 * z) + bendA - MID_W0 * t + 0.25;
  let c = Math.cos(th), s = Math.sin(th);
  let h = 0.135 * group * c;
  let dh = 0.135 * (dGroupDt * c - group * s * (dBendA - MID_W0));

  th = MID_K1 * (0.7880 * x + 0.6157 * z) - bendB * 0.8 - MID_W1 * t + 1.85;
  c = Math.cos(th); s = Math.sin(th);
  h += 0.105 * group * c;
  dh += 0.105 * (dGroupDt * c - group * s * (-0.8 * dBendB - MID_W1));

  th = MID_K2 * (-0.2250 * x + 0.9744 * z) + bendB - MID_W2 * t + 3.15;
  c = Math.cos(th); s = Math.sin(th);
  h += 0.088 * group * c;
  dh += 0.088 * (dGroupDt * c - group * s * (dBendB - MID_W2));

  th = MID_K3 * (0.9563 * x + 0.2924 * z) - bendA * 0.7 - MID_W3 * t + 4.55;
  c = Math.cos(th); s = Math.sin(th);
  h += 0.068 * group * c;
  dh += 0.068 * (dGroupDt * c - group * s * (-0.7 * dBendA - MID_W3));

  th = MID_K4 * (-0.5878 * x + 0.8090 * z) + bendA * 0.6 - MID_W4 * t + 5.40;
  c = Math.cos(th); s = Math.sin(th);
  h += 0.054 * group * c;
  dh += 0.054 * (dGroupDt * c - group * s * (0.6 * dBendA - MID_W4));

  out2[0] = h;
  out2[1] = dh;
}

const mediumWaveGLSL = `vec3 mediumWave(vec2 p,float t){
  float group = 0.68 + 0.22 * sin(0.027 * p.x + 0.019 * p.y - 0.075 * t) + 0.14 * cos(0.018 * p.x - 0.029 * p.y - 0.055 * t);
  float bendA = 0.34 * sin(-0.085 * p.x + 0.115 * p.y + 0.12 * t);
  float bendB = 0.30 * cos(0.105 * p.x + 0.078 * p.y - 0.10 * t);
  vec3 outv = vec3(0.0);
  float k = 6.283185307 / 17.5, th = k * dot(p, vec2(0.3420, 0.9397)) + bendA - sqrt(9.81 * k) * t + 0.25, a = 0.135 * group, q = -1.04 * a * sin(th);
  outv += vec3(a * cos(th), q * 0.3420, q * 0.9397);
  k = 6.283185307 / 13.2; th = k * dot(p, vec2(0.7880, 0.6157)) - bendB * 0.8 - sqrt(9.81 * k) * t + 1.85; a = 0.105 * group; q = -1.04 * a * sin(th);
  outv += vec3(a * cos(th), q * 0.7880, q * 0.6157);
  k = 6.283185307 / 10.1; th = k * dot(p, vec2(-0.2250, 0.9744)) + bendB - sqrt(9.81 * k) * t + 3.15; a = 0.088 * group; q = -1.02 * a * sin(th);
  outv += vec3(a * cos(th), -q * 0.2250, q * 0.9744);
  k = 6.283185307 / 7.9; th = k * dot(p, vec2(0.9563, 0.2924)) - bendA * 0.7 - sqrt(9.81 * k) * t + 4.55; a = 0.068 * group; q = -0.98 * a * sin(th);
  outv += vec3(a * cos(th), q * 0.9563, q * 0.2924);
  k = 6.283185307 / 6.3; th = k * dot(p, vec2(-0.5878, 0.8090)) + bendA * 0.6 - sqrt(9.81 * k) * t + 5.40; a = 0.054 * group; q = -0.95 * a * sin(th);
  outv += vec3(a * cos(th), -q * 0.5878, q * 0.8090);
  return outv;
}`;
