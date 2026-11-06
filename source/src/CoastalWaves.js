/* Multiphase CFD Short-Crested Directional Wave Packets, Rip-Current Vorticity Channels & Cnoidal Breakers.
 * Grounded in:
 *  - Hasselmann et al. (1973, JONSWAP) & Longuet-Higgins (1957, Phil. Trans. R. Soc. A 249):
 *    Short-crested directional wave-packet interference (crossing oblique swells form 18-38m 3D A-frame peaks,
 *    completely eliminating artificial infinite ruler-straight parallel wave lines and single-sine corduroy stripes).
 *  - Korteweg & de Vries (1895) / Fenton (1979): Nonlinear cnoidal shoaling peaking & McCowan (H/h ~ 0.78) breaking limit.
 *  - Dalrymple (1978, JGR) & Peregrine (1998, Annu. Rev. Fluid Mech. 30): Surf-zone rip-current channels & macro-vortices.
 *  - Svendsen (1984, Coastal Eng. 8) & Guza & Inman (1975, JGR 80): Roller momentum flux & edge-wave swash cusps.
 */
export const coastalWavesGLSL = `
#ifndef COASTAL_WAVES_GLSL
#define COASTAL_WAVES_GLSL
${bathymetryGLSL}

// Nonlinear cnoidal-Stokes shoaling waveform + Asymmetric long-tail roller envelope (ZERO narrow tape-strip cutoffs!)
vec2 skewedBreakerWave(float phase, float skew){
  float warped = phase + skew * sin(phase) + 0.34 * skew * skew * sin(2.0 * phase);
  float s = sin(warped);
  float cnoidalSharp = 0.33 * skew * (s * s - 0.5) + 0.12 * skew * skew * (s * s * s - 0.75 * s);
  float elev = s + cnoidalSharp;
  // uCyc in [0,1): 0..0.25 is advancing shoreward front face, 0.25 is crest peak, 0.25..0.85 is seaward trailing roller wake!
  float uCyc = fract(warped / 6.2831853);
  float frontRamp = smoothstep(0.03, 0.22, uCyc);
  float wakeTail  = pow(1.0 - smoothstep(0.21, 0.84, uCyc), 1.75);
  float crestLip  = frontRamp * wakeTail * (0.45 + 0.55 * smoothstep(-0.18, 0.58, elev));
  return vec2(elev, crestLip);
}

// Asymmetric swash run-up envelope: C^1-periodic smooth bore uprush pulse + gravity backwash (ZERO u=0 velocity jump!)
vec2 swashEnvelopeFromPhase(float ph){
  float u = fract((ph - 0.16) / 6.2831853);
  float rise = smoothstep(0.0, 0.19, u);
  float drain = pow(1.0 - smoothstep(0.17, 0.99, u), 1.78);
  float level = rise * drain;
  float upPulse = smoothstep(0.0, 0.055, u) * (1.0 - smoothstep(0.065, 0.215, u));
  float backPulse = smoothstep(0.20, 0.52, u) * (1.0 - smoothstep(0.76, 1.0, u));
  float uprushVel = 2.65 * upPulse - 1.28 * backPulse;
  return vec2(level, uprushVel);
}

// Evaluates short-crested directional coastal hydrodynamics at world xz and time t:
// Returns vec4(surfaceY, breakerCrestLip, uprushSwashLip, crossShoreVel)
vec4 evaluateCoastalHydro(vec2 p, float t, float ampScale){
  vec4 bathy = sampleBathymetry(p);
  float bed = bathy.r;
  float tau = bathy.g;
  float rockProx = bathy.b;
  float rockWake = bathy.a;
  float d0 = max(0.0, -bed);

  float amp = clamp(ampScale / 0.6, 0.25, 2.2);
  float shoreCoord = sharedTerrainCoordinate(p);
  float coastZone = smoothstep(-28.0, 8.0, shoreCoord) * smoothstep(-180.0, -162.0, p.x) * (1.0 - smoothstep(162.0, 180.0, p.x));

  // Green's law h^(-1/4) shoaling + Snell directional refraction factor (obliquity decreases as sqrt(d0) near shore)
  float shoalGain = clamp(pow(1.98 / max(d0, 0.24), 0.28), 1.0, 1.90);
  float depthLimit = clamp(d0 / 0.42, 0.0, 1.0);
  float skew = mix(0.24, 0.88, 1.0 - smoothstep(0.16, 2.45, d0));
  float refractOblique = mix(0.42, 1.0, smoothstep(0.08, 2.20, d0));

  // Dalrymple (1978) quasi-steady + slowly migrating surf-zone rip-current channels:
  // Rip channels create natural 22-38m wide corridors where outgoing flow locally suppresses uniform line-breaking!
  float ripField = 0.52 * sin(p.x * 0.078 + 0.045 * t + 0.9) + 0.48 * cos(p.x * 0.145 - 0.038 * t - 0.6);
  float ripChannel = smoothstep(0.38, 0.88, ripField);

  // --- Primary Crossing Swell Packet + Multi-Scale Alongshore Scalloping (3.5m/8m/18m organic crest undulation!) ---
  float tWave = t + 3.05;
  float w1a = 6.2831853 / 7.10;
  float w1b = 6.2831853 / 6.55;
  float bend1 = 0.75 * sin(p.x * 0.031 + 0.5) + 0.42 * cos(p.x * 0.074 - 0.3)
              + 0.28 * sin(p.x * 0.165 + 1.1) + 0.18 * cos(p.x * 0.39 - 0.35 * t)
              + 0.11 * sin(p.x * 0.82 + p.y * 0.12 + 0.55 * t);
  float ph1a = w1a * (tWave - tau) + 0.058 * refractOblique * p.x + bend1;
  float ph1b = w1b * (tWave - tau * 0.985) - 0.068 * refractOblique * p.x - bend1 * 0.65 + 1.35;

  // 2D wave-packet envelope modulation (varies from 0.28 in calm lulls up to 1.28 in big set peaks!)
  float pktEnv1a = 0.68 + 0.34 * sin(0.21 * tWave - 0.16 * tau + p.x * 0.046 + 0.85)
                        + 0.22 * cos(0.13 * tWave - 0.11 * tau - p.x * 0.082);
  float pktEnv1b = 0.60 + 0.36 * cos(0.25 * tWave - 0.18 * tau - p.x * 0.058 + 1.55)
                        + 0.20 * sin(0.16 * tWave - 0.09 * tau + p.x * 0.095);
  pktEnv1a = clamp(pktEnv1a, 0.22, 1.30);
  pktEnv1b = clamp(pktEnv1b, 0.18, 1.24);

  vec2 bw1a = skewedBreakerWave(ph1a, skew);
  vec2 bw1b = skewedBreakerWave(ph1b, skew * 0.94);

  // --- Secondary Oblique Wind-Swell Packet (T2 = 4.75s, staggered phase & broken crest segments) ---
  float w2 = 6.2831853 / 4.75;
  float bend2 = 0.62 * cos(p.x * 0.089 - 1.2) + 0.34 * sin(p.x * 0.195 + 0.7);
  float ph2 = w2 * (tWave - tau * 1.045) + 0.094 * refractOblique * p.x + bend2;
  float pktEnv2 = clamp(0.56 + 0.44 * sin(0.29 * tWave - 0.21 * tau - p.x * 0.072 - 0.8), 0.15, 1.18);
  vec2 bw2 = skewedBreakerWave(ph2, skew * 0.88);

  // --- 3-Directional Non-Collinear Short-Crested Chop Triad (ZERO parallel diagonal corduroy stripes!) ---
  float chopFade = smoothstep(0.14, 1.05, d0);
  float cA = sin((6.2831853 / 3.45) * (t - tau * 1.06) + 0.145 * p.x + 0.45 * sin(p.y * 0.18));
  float cB = sin((6.2831853 / 2.85) * (t - tau * 1.09) - 0.185 * p.x + 0.38 * cos(p.x * 0.22 + p.y * 0.14));
  float cC = sin((6.2831853 / 2.30) * t + dot(p, vec2(0.24, -0.31)) + 1.7);
  float chopTriad = (0.46 * cA + 0.36 * cB + 0.18 * cC) * chopFade;

  float surfElev = (
    (0.245 * pktEnv1a * bw1a.x + 0.175 * pktEnv1b * bw1b.x + 0.145 * pktEnv2 * bw2.x) * shoalGain * depthLimit
    + 0.052 * chopTriad
  ) * amp * (1.0 - 0.26 * rockWake) * (1.0 - 0.18 * ripChannel);
  float surfEta = max(surfElev, -0.44 * d0);

  // --- Irregular Multi-Cusp Beach Swash Sheet (Guza & Inman 1975 subharmonic edge waves) ---
  float cusp1 = 0.52 * sin(p.x * 0.125 + 0.6) + 0.31 * sin(p.x * 0.26 - 1.1) + 0.18 * cos(p.x * 0.44 + 0.3);
  float cusp2 = 0.46 * cos(p.x * 0.155 - 0.8) + 0.28 * sin(p.x * 0.31 + 1.5);
  float lobeReach = 1.0 + 0.16 * sin(p.x * 0.125 + 0.6) + 0.10 * cos(p.x * 0.26 - 1.05) - 0.14 * ripChannel;
  float rockShadow = 1.0 - 0.30 * rockWake;

  vec2 sw1a = swashEnvelopeFromPhase(ph1a + cusp1);
  vec2 sw1b = swashEnvelopeFromPhase(ph1b - cusp1 * 0.7);
  vec2 sw2  = swashEnvelopeFromPhase(ph2 + cusp2);
  float swLevel = 0.235 * sw1a.x * pktEnv1a + 0.165 * sw1b.x * pktEnv1b + 0.135 * sw2.x * pktEnv2;
  float runupLevel = (-0.022 + swLevel * lobeReach * rockShadow) * amp;

  float rawSwashDepth = runupLevel - bed;
  float uSwash = 0.48 * sw1a.y + 0.32 * sw1b.y + 0.20 * sw2.y;
  float uprushPos = clamp(uSwash, 0.0, 2.4);
  float uprushRatio = smoothstep(-0.22, 0.36, uSwash);
  float beachFade = smoothstep(-0.24, 0.02, bed);
  float slopeSheetFactor = mix(1.0, mix(0.42, 1.0, uprushRatio), beachFade);
  float posBlend = smoothstep(-0.055, 0.075, rawSwashDepth);
  float shapedSwashDepth = rawSwashDepth * mix(1.0, slopeSheetFactor, posBlend);
  float boreNose = 0.028 * amp * uprushPos * smoothstep(-0.025, 0.085, rawSwashDepth) * (1.0 - smoothstep(0.09, 0.42, rawSwashDepth));
  float swashEta = bed + shapedSwashDepth + boreNose;

  float landBlend = smoothstep(-0.68, 0.04, bed);
  float combinedEta = mix(surfEta, swashEta, landBlend);
  if (bed < -0.035) {
    combinedEta = max(combinedEta, bed + 0.028 * (1.0 - smoothstep(-0.14, -0.035, bed)));
  }

  // Full-depth 3D windward & flanking hydraulic wave run-up collar around ALL boulders (bed from -4.2m to +0.38m!):
  // Visually mounds the sea surface UP into the base of every rock splash so splashes grow directly out of the surging sea!
  float waveCrest = max(0.0, 0.58 * bw1a.x * pktEnv1a + 0.44 * bw1b.x * pktEnv1b + 0.36 * bw2.x * pktEnv2);
  float rockSurgePulse = 0.26 + 0.74 * waveCrest * waveCrest;
  float wetHere = smoothstep(0.02, 0.22, combinedEta - bed);
  float dynamicRockRunup = rockProx * (0.38 * amp * rockSurgePulse) * smoothstep(-4.20, -2.40, bed) * (1.0 - smoothstep(0.24, 0.68, bed));
  combinedEta += dynamicRockRunup * wetHere;

  // --- Battjes-Janssen (1978) & Svendsen (1984) Wave-Breaking Energy Dissipation & Roller Reservoir ---
  // Extracts energy directly where local 3D shoaling wave height H_local approaches/exceeds Miche-McCowan depth limit!
  float dzUp = (bed - sampleBathymetry(p - vec2(0.0, 4.5)).r) / 4.5;
  float dzDown = (sampleBathymetry(p + vec2(0.0, 4.5)).r - bed) / 4.5;
  float shoalRamp = smoothstep(0.048, 0.082, dzUp);
  float barCrest = (1.0 - smoothstep(-0.018, -0.002, dzDown)) * smoothstep(0.24, 0.38, d0) * (1.0 - smoothstep(0.58, 0.88, d0));
  float barBreak = clamp(shoalRamp * 0.90 + barCrest * 1.45, 0.0, 1.45) * smoothstep(0.22, 0.36, d0) * (1.0 - smoothstep(0.64, 0.98, d0));

  float dEffBreak = max(0.26, d0 + 0.35 * max(0.0, surfElev));
  float localWaveH = max(0.0, surfElev * 2.15) + 0.14 * amp * (pktEnv1a * max(0.0, bw1a.y) + pktEnv1b * max(0.0, bw1b.y));
  float micheRatio = localWaveH / (0.64 * dEffBreak);
  float energySteepGate = smoothstep(0.32, 1.08, micheRatio);

  // Local instantaneous crest & long-tail Svendsen roller envelope + multi-scale alongshore peak breakup
  float crestFocus = max(0.0, pktEnv1a * bw1a.y * 0.76 + pktEnv1b * bw1b.y * 0.62 + pktEnv2 * bw2.y * 0.56);
  float packetSuperpos = clamp((pktEnv1a * 0.55 + pktEnv1b * 0.45) * (1.0 - 0.58 * ripChannel), 0.0, 1.35);
  float dWarp = d0 * max(0.0, 1.0 + 0.32 * sin(p.x * 0.19 + 0.38 * t) + 0.24 * cos(p.x * 0.49 - 0.52 * t) + 0.16 * sin(p.x * 1.08 + p.y * 0.26));
  float surfOuterD = mix(0.42, 1.48, smoothstep(0.34, 1.12, packetSuperpos));
  float surfZoneBreak = smoothstep(0.03, 0.24, dWarp) * (1.0 - smoothstep(surfOuterD * 0.42, surfOuterD * 1.35, dWarp));

  // Multi-scale crescentic & spilling-lobe modulation breaks long crests into rich overlapping surf peaks (ZERO ruler-straight lines!)
  float crescentMod = clamp(0.76 + 0.28 * sin(p.x * 0.15 + 0.44 * t) + 0.22 * cos(p.x * 0.36 - 0.62 * t) + 0.16 * sin(p.x * 0.83 + 0.85 * t), 0.24, 1.32);
  float rollerDrive = crestFocus * crescentMod * max(surfZoneBreak * (0.42 + 0.78 * energySteepGate), barBreak) * (0.72 + 0.58 * packetSuperpos);
  float mcCowanGate = smoothstep(0.03, 0.78, rollerDrive);
  float breakerLip = clamp(mcCowanGate * (0.28 + 0.72 * crestFocus) * (0.65 + 0.55 * energySteepGate) * amp * 1.72 * (1.0 - 0.52 * ripChannel), 0.0, 1.35);

  // Energy-flux driven, lobe-scalloped shallow swash sheet (wide feathered decay -> ZERO 1-meter contour tape stripe!)
  float localDepth = combinedEta - bed;
  float swashTongueWarp = 0.055 * sin(p.x * 0.38 + p.y * 0.18 + 0.65 * t)
                        + 0.038 * cos(p.x * 0.94 - p.y * 0.31 - 0.92 * t)
                        + 0.024 * sin(p.x * 2.05 + p.y * 0.62 + 0.4 * t);
  float warpedSwashD = localDepth + swashTongueWarp * smoothstep(0.0, 0.08, localDepth);
  float swashBand = smoothstep(-0.95, -0.18, bed) * (1.0 - smoothstep(0.42, 0.85, bed));
  float swashKinetic = smoothstep(0.02, 0.95, uprushPos * uprushPos * (0.45 + 0.55 * packetSuperpos));
  float cuspPockets = clamp(0.54 + 0.34 * sin(p.x * 0.27 - 0.35 * t + 1.2) + 0.24 * cos(p.x * 0.68 + 0.48 * t), 0.12, 1.15);
  float swashEdge = smoothstep(0.002, 0.065, warpedSwashD) * pow(1.0 - smoothstep(0.035, 0.52, warpedSwashD), 1.85)
                  * swashBand * swashKinetic * cuspPockets * 0.82;

  float uSurf = (1.32 * bw1a.x * pktEnv1a + 0.96 * bw1b.x * pktEnv1b + 0.82 * bw2.x * pktEnv2 - 0.38 * ripChannel)
              * smoothstep(0.02, 0.42, d0);
  float crossVel = mix(uSurf, uSwash, landBlend);

  return vec4(combinedEta * coastZone, breakerLip * coastZone, swashEdge * coastZone, crossVel * coastZone);
}
#endif
`;

export function evaluateCoastalSurfaceJS(bathySample, x, z, t, amplitude = 0.68) {
  const { bed, tau, rockProx, rockWake } = bathySample;
  const d0 = Math.max(0, -bed);
  const smoothstep = (a, b, v) => {
    const q = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return q * q * (3 - 2 * q);
  };
  const fract = v => v - Math.floor(v);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const amp = clamp(amplitude / 0.6, 0.25, 2.2);

  const shoreCoord = z - (15 + 3 * Math.sin(x * 0.035) + 1.1 * Math.sin(x * 0.11) - 2 * Math.sin(x * 0.07)) + 50;
  const coastZone = smoothstep(-28, 8, shoreCoord) * smoothstep(-180, -162, x) * (1 - smoothstep(162, 180, x));
  if (coastZone <= 1e-4) return 0;

  const shoalGain = clamp(Math.pow(1.98 / Math.max(d0, 0.24), 0.28), 1.0, 1.90);
  const depthLimit = clamp(d0 / 0.42, 0.0, 1.0);
  const skew = 0.24 + (0.88 - 0.24) * (1 - smoothstep(0.16, 2.45, d0));
  const refractOblique = 0.42 + 0.58 * smoothstep(0.08, 2.20, d0);

  const ripField = 0.52 * Math.sin(x * 0.078 + 0.045 * t + 0.9) + 0.48 * Math.cos(x * 0.145 - 0.038 * t - 0.6);
  const ripChannel = smoothstep(0.38, 0.88, ripField);

  const skewedElev = (ph, sk) => {
    const warped = ph + sk * Math.sin(ph) + 0.34 * sk * sk * Math.sin(2 * ph);
    const s = Math.sin(warped);
    return s + 0.33 * sk * (s * s - 0.5) + 0.12 * sk * sk * (s * s * s - 0.75 * s);
  };
  const swashEnv = ph => {
    const u = fract((ph - 0.16) / (2 * Math.PI));
    const rise = smoothstep(0.0, 0.19, u);
    const drain = Math.pow(1 - smoothstep(0.17, 0.99, u), 1.78);
    const upPulse = smoothstep(0.0, 0.055, u) * (1 - smoothstep(0.065, 0.215, u));
    const backPulse = smoothstep(0.20, 0.52, u) * (1 - smoothstep(0.76, 1.0, u));
    const vel = 2.65 * upPulse - 1.28 * backPulse;
    return [rise * drain, vel];
  };

  const tWave = t + 3.05;
  const w1a = (2 * Math.PI) / 7.10;
  const w1b = (2 * Math.PI) / 6.55;
  const bend1 = 0.75 * Math.sin(x * 0.031 + 0.5) + 0.42 * Math.cos(x * 0.074 - 0.3)
              + 0.28 * Math.sin(x * 0.165 + 1.1) + 0.18 * Math.cos(x * 0.39 - 0.35 * t)
              + 0.11 * Math.sin(x * 0.82 + z * 0.12 + 0.55 * t);
  const ph1a = w1a * (tWave - tau) + 0.058 * refractOblique * x + bend1;
  const ph1b = w1b * (tWave - tau * 0.985) - 0.068 * refractOblique * x - bend1 * 0.65 + 1.35;

  const pktEnv1a = clamp(0.68 + 0.34 * Math.sin(0.21 * tWave - 0.16 * tau + x * 0.046 + 0.85) + 0.22 * Math.cos(0.13 * tWave - 0.11 * tau - x * 0.082), 0.22, 1.30);
  const pktEnv1b = clamp(0.60 + 0.36 * Math.cos(0.25 * tWave - 0.18 * tau - x * 0.058 + 1.55) + 0.20 * Math.sin(0.16 * tWave - 0.09 * tau + x * 0.095), 0.18, 1.24);
  const bw1aX = skewedElev(ph1a, skew);
  const bw1bX = skewedElev(ph1b, skew * 0.94);

  const w2 = (2 * Math.PI) / 4.75;
  const bend2 = 0.62 * Math.cos(x * 0.089 - 1.2) + 0.34 * Math.sin(x * 0.195 + 0.7);
  const ph2 = w2 * (tWave - tau * 1.045) + 0.094 * refractOblique * x + bend2;
  const pktEnv2 = clamp(0.56 + 0.44 * Math.sin(0.29 * tWave - 0.21 * tau - x * 0.072 - 0.8), 0.15, 1.18);
  const bw2X = skewedElev(ph2, skew * 0.88);

  const chopFade = smoothstep(0.14, 1.05, d0);
  const cA = Math.sin(((2 * Math.PI) / 3.45) * (t - tau * 1.06) + 0.145 * x + 0.45 * Math.sin(z * 0.18));
  const cB = Math.sin(((2 * Math.PI) / 2.85) * (t - tau * 1.09) - 0.185 * x + 0.38 * Math.cos(x * 0.22 + z * 0.14));
  const cC = Math.sin(((2 * Math.PI) / 2.30) * t + (0.24 * x - 0.31 * z) + 1.7);
  const chopTriad = (0.46 * cA + 0.36 * cB + 0.18 * cC) * chopFade;

  const surfElev = (
    (0.245 * pktEnv1a * bw1aX + 0.175 * pktEnv1b * bw1bX + 0.145 * pktEnv2 * bw2X) * shoalGain * depthLimit
    + 0.052 * chopTriad
  ) * amp * (1 - 0.26 * rockWake) * (1 - 0.18 * ripChannel);
  const surfEta = Math.max(surfElev, -0.44 * d0);

  const cusp1 = 0.52 * Math.sin(x * 0.125 + 0.6) + 0.31 * Math.sin(x * 0.26 - 1.1) + 0.18 * Math.cos(x * 0.44 + 0.3);
  const cusp2 = 0.46 * Math.cos(x * 0.155 - 0.8) + 0.28 * Math.sin(x * 0.31 + 1.5);
  const lobeReach = 1.0 + 0.16 * Math.sin(x * 0.125 + 0.6) + 0.10 * Math.cos(x * 0.26 - 1.05) - 0.14 * ripChannel;
  const rockShadow = 1.0 - 0.30 * rockWake;

  const [sw1aL, sw1aV] = swashEnv(ph1a + cusp1);
  const [sw1bL, sw1bV] = swashEnv(ph1b - cusp1 * 0.7);
  const [sw2L, sw2V] = swashEnv(ph2 + cusp2);
  const swLevel = 0.235 * sw1aL * pktEnv1a + 0.165 * sw1bL * pktEnv1b + 0.135 * sw2L * pktEnv2;
  const runupLevel = (-0.022 + swLevel * lobeReach * rockShadow) * amp;

  const rawSwashDepth = runupLevel - bed;
  const uSwash = 0.48 * sw1aV + 0.32 * sw1bV + 0.20 * sw2V;
  const uprushPos = clamp(uSwash, 0, 2.4);
  const uprushRatio = smoothstep(-0.22, 0.36, uSwash);
  const beachFade = smoothstep(-0.24, 0.02, bed);
  const slopeSheetFactor = 1.0 - beachFade * (1.0 - (0.42 + 0.58 * uprushRatio));
  const posBlend = smoothstep(-0.055, 0.075, rawSwashDepth);
  const shapedSwashDepth = rawSwashDepth * (1.0 + (slopeSheetFactor - 1.0) * posBlend);
  const boreNose = 0.028 * amp * uprushPos * smoothstep(-0.025, 0.085, rawSwashDepth) * (1 - smoothstep(0.09, 0.42, rawSwashDepth));
  const swashEta = bed + shapedSwashDepth + boreNose;

  const landBlend = smoothstep(-0.68, 0.04, bed);
  let combinedEta = surfEta * (1 - landBlend) + swashEta * landBlend;
  if (bed < -0.035) {
    combinedEta = Math.max(combinedEta, bed + 0.028 * (1 - smoothstep(-0.14, -0.035, bed)));
  }

  const waveCrest = Math.max(0, 0.58 * bw1aX * pktEnv1a + 0.44 * bw1bX * pktEnv1b + 0.36 * bw2X * pktEnv2);
  const rockSurgePulse = 0.26 + 0.74 * waveCrest * waveCrest;
  const wetHere = smoothstep(0.02, 0.22, combinedEta - bed);
  const dynamicRockRunup = rockProx * (0.38 * amp * rockSurgePulse) * smoothstep(-4.20, -2.40, bed) * (1 - smoothstep(0.24, 0.68, bed));
  combinedEta += dynamicRockRunup * wetHere;

  return combinedEta * coastZone;
}

/* Zero-allocation, zero-closure, scalar-register 2D wave-packet + Svendsen bore kinematics evaluator.
 * Eliminates ~28,000 JS array/closure allocations per frame and skips temporal finite-differences on calm/receding sites!
 * Writes into out[0..5]: [eta, dEtaDt, ux, uz, breakerFront, localDepth] */
const KW_TAU = 2.0 * Math.PI;
const KW_INV_TAU = 1.0 / KW_TAU;
const KW_W1A = KW_TAU / 7.10;
const KW_W1B = KW_TAU / 6.55;
const KW_W2  = KW_TAU / 4.75;
const KW_WCA = KW_TAU / 3.45;
const KW_WCB = KW_TAU / 2.85;
const KW_WCC = KW_TAU / 2.30;

function kwSmooth(a, b, v) {
  const q = v <= a ? 0.0 : (v >= b ? 1.0 : (v - a) / (b - a));
  return q * q * (3.0 - 2.0 * q);
}

function kwClamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function kwFract(v) {
  return v - Math.floor(v);
}

export function evaluateCoastalKinematicsJS(bed, tau, rockProx, rockWake, rayX, rayZ, x, z, t, amplitude, out, minEtaForDeriv = -999.0) {
  const shoreCoord = z - (15.0 + 3.0 * Math.sin(x * 0.035) + 1.1 * Math.sin(x * 0.11) - 2.0 * Math.sin(x * 0.07)) + 50.0;
  const coastZone = kwSmooth(-28.0, 8.0, shoreCoord) * kwSmooth(-180.0, -162.0, x) * (1.0 - kwSmooth(162.0, 180.0, x));
  if (coastZone <= 1e-4) {
    out[0] = out[1] = out[2] = out[3] = out[4] = out[5] = 0.0;
    return out;
  }

  const d0 = bed < 0.0 ? -bed : 0.0;
  const amp = kwClamp(amplitude / 0.6, 0.25, 2.2);
  const shoalGain = kwClamp(Math.pow(1.98 / (d0 > 0.24 ? d0 : 0.24), 0.28), 1.0, 1.90);
  const depthLimit = kwClamp(d0 / 0.42, 0.0, 1.0);
  const skew = 0.24 + 0.64 * (1.0 - kwSmooth(0.16, 2.45, d0));
  const skewB = skew * 0.94;
  const skewC = skew * 0.88;
  const refractOblique = 0.42 + 0.58 * kwSmooth(0.08, 2.20, d0);

  const bend1Static = 0.75 * Math.sin(x * 0.031 + 0.5) + 0.42 * Math.cos(x * 0.074 - 0.3) + 0.28 * Math.sin(x * 0.165 + 1.1);
  const bend2 = 0.62 * Math.cos(x * 0.089 - 1.2) + 0.34 * Math.sin(x * 0.195 + 0.7);
  const cusp1 = 0.52 * Math.sin(x * 0.125 + 0.6) + 0.31 * Math.sin(x * 0.26 - 1.1) + 0.18 * Math.cos(x * 0.44 + 0.3);
  const cusp2 = 0.46 * Math.cos(x * 0.155 - 0.8) + 0.28 * Math.sin(x * 0.31 + 1.5);
  const lobeStatic = 1.0 + 0.16 * Math.sin(x * 0.125 + 0.6) + 0.10 * Math.cos(x * 0.26 - 1.05);
  const chopPhaseZ = 0.45 * Math.sin(z * 0.18);
  const chopPhaseXZ = 0.38 * Math.cos(x * 0.22 + z * 0.14);

  const rockShadow = 1.0 - 0.30 * rockWake;
  const landBlend = kwSmooth(-0.68, 0.04, bed);
  const beachFade = kwSmooth(-0.24, 0.02, bed);
  const chopFade = kwSmooth(0.14, 1.05, d0);
  const rockRunupBand = rockProx * (0.38 * amp) * kwSmooth(-4.20, -2.40, bed) * (1.0 - kwSmooth(0.24, 0.68, bed));
  const minSubBed = bed < -0.035 ? bed + 0.028 * (1.0 - kwSmooth(-0.14, -0.035, bed)) : -1e9;

  // --- Primary evaluation at time t (zero array/closure allocations!) ---
  const ripField = 0.52 * Math.sin(x * 0.078 + 0.045 * t + 0.9) + 0.48 * Math.cos(x * 0.145 - 0.038 * t - 0.6);
  const ripChannel = kwSmooth(0.38, 0.88, ripField);
  const lobeReach = lobeStatic - 0.14 * ripChannel;

  const bendDyn = bend1Static + 0.18 * Math.cos(x * 0.39 - 0.35 * t) + 0.11 * Math.sin(x * 0.82 + z * 0.12 + 0.55 * t);
  const tWave = t + 3.05;
  const ph1a = KW_W1A * (tWave - tau) + 0.058 * refractOblique * x + bendDyn;
  const ph1b = KW_W1B * (tWave - tau * 0.985) - 0.068 * refractOblique * x - bendDyn * 0.65 + 1.35;
  const ph2  = KW_W2  * (tWave - tau * 1.045) + 0.094 * refractOblique * x + bend2;

  const pktEnv1a = kwClamp(0.68 + 0.34 * Math.sin(0.21 * tWave - 0.16 * tau + x * 0.046 + 0.85) + 0.22 * Math.cos(0.13 * tWave - 0.11 * tau - x * 0.082), 0.22, 1.30);
  const pktEnv1b = kwClamp(0.60 + 0.36 * Math.cos(0.25 * tWave - 0.18 * tau - x * 0.058 + 1.55) + 0.20 * Math.sin(0.16 * tWave - 0.09 * tau + x * 0.095), 0.18, 1.24);
  const pktEnv2  = kwClamp(0.56 + 0.44 * Math.sin(0.29 * tWave - 0.21 * tau - x * 0.072 - 0.8), 0.15, 1.18);

  // Skewed wave 1a
  const wp1a = ph1a + skew * Math.sin(ph1a) + 0.34 * skew * skew * Math.sin(2.0 * ph1a);
  const s1a = Math.sin(wp1a);
  const bw1aX = s1a + 0.33 * skew * (s1a * s1a - 0.5) + 0.12 * skew * skew * (s1a * s1a * s1a - 0.75 * s1a);
  const uC1a = kwFract(wp1a * KW_INV_TAU);
  const bw1aY = kwSmooth(0.03, 0.22, uC1a) * Math.pow(1.0 - kwSmooth(0.21, 0.84, uC1a), 1.75) * (0.45 + 0.55 * kwSmooth(-0.18, 0.58, bw1aX));

  // Skewed wave 1b
  const wp1b = ph1b + skewB * Math.sin(ph1b) + 0.34 * skewB * skewB * Math.sin(2.0 * ph1b);
  const s1b = Math.sin(wp1b);
  const bw1bX = s1b + 0.33 * skewB * (s1b * s1b - 0.5) + 0.12 * skewB * skewB * (s1b * s1b * s1b - 0.75 * s1b);
  const uC1b = kwFract(wp1b * KW_INV_TAU);
  const bw1bY = kwSmooth(0.03, 0.22, uC1b) * Math.pow(1.0 - kwSmooth(0.21, 0.84, uC1b), 1.75) * (0.45 + 0.55 * kwSmooth(-0.18, 0.58, bw1bX));

  // Skewed wave 2
  const wp2 = ph2 + skewC * Math.sin(ph2) + 0.34 * skewC * skewC * Math.sin(2.0 * ph2);
  const s2 = Math.sin(wp2);
  const bw2X = s2 + 0.33 * skewC * (s2 * s2 - 0.5) + 0.12 * skewC * skewC * (s2 * s2 * s2 - 0.75 * s2);
  const uC2 = kwFract(wp2 * KW_INV_TAU);
  const bw2Y = kwSmooth(0.03, 0.22, uC2) * Math.pow(1.0 - kwSmooth(0.21, 0.84, uC2), 1.75) * (0.45 + 0.55 * kwSmooth(-0.18, 0.58, bw2X));

  const chopTriad = chopFade > 1e-4
    ? (0.46 * Math.sin(KW_WCA * (t - tau * 1.06) + 0.145 * x + chopPhaseZ)
      + 0.36 * Math.sin(KW_WCB * (t - tau * 1.09) - 0.185 * x + chopPhaseXZ)
      + 0.18 * Math.sin(KW_WCC * t + (0.24 * x - 0.31 * z) + 1.7)) * chopFade
    : 0.0;

  const surfScale = amp * (1.0 - 0.26 * rockWake) * (1.0 - 0.18 * ripChannel);
  const surfElev = ((0.245 * pktEnv1a * bw1aX + 0.175 * pktEnv1b * bw1bX + 0.145 * pktEnv2 * bw2X) * shoalGain * depthLimit + 0.052 * chopTriad) * surfScale;
  const surfEta = surfElev > -0.44 * d0 ? surfElev : -0.44 * d0;

  const uSw1a = kwFract((ph1a + cusp1 - 0.16) * KW_INV_TAU);
  const sw1aL = kwSmooth(0.0, 0.19, uSw1a) * Math.pow(1.0 - kwSmooth(0.17, 0.99, uSw1a), 1.78);
  const sw1aV = 2.65 * kwSmooth(0.0, 0.055, uSw1a) * (1.0 - kwSmooth(0.065, 0.215, uSw1a))
              - 1.28 * kwSmooth(0.20, 0.52, uSw1a) * (1.0 - kwSmooth(0.76, 1.0, uSw1a));

  const uSw1b = kwFract((ph1b - cusp1 * 0.7 - 0.16) * KW_INV_TAU);
  const sw1bL = kwSmooth(0.0, 0.19, uSw1b) * Math.pow(1.0 - kwSmooth(0.17, 0.99, uSw1b), 1.78);
  const sw1bV = 2.65 * kwSmooth(0.0, 0.055, uSw1b) * (1.0 - kwSmooth(0.065, 0.215, uSw1b))
              - 1.28 * kwSmooth(0.20, 0.52, uSw1b) * (1.0 - kwSmooth(0.76, 1.0, uSw1b));

  const uSw2 = kwFract((ph2 + cusp2 - 0.16) * KW_INV_TAU);
  const sw2L = kwSmooth(0.0, 0.19, uSw2) * Math.pow(1.0 - kwSmooth(0.17, 0.99, uSw2), 1.78);
  const sw2V = 2.65 * kwSmooth(0.0, 0.055, uSw2) * (1.0 - kwSmooth(0.065, 0.215, uSw2))
             - 1.28 * kwSmooth(0.20, 0.52, uSw2) * (1.0 - kwSmooth(0.76, 1.0, uSw2));

  const swLevel = 0.235 * sw1aL * pktEnv1a + 0.165 * sw1bL * pktEnv1b + 0.135 * sw2L * pktEnv2;
  const rawSwashDepth = (-0.022 + swLevel * lobeReach * rockShadow) * amp - bed;
  const uSwash = 0.48 * sw1aV + 0.32 * sw1bV + 0.20 * sw2V;
  const uprushPos = kwClamp(uSwash, 0.0, 2.4);
  const slopeSheet = 1.0 - beachFade * (1.0 - (0.42 + 0.58 * kwSmooth(-0.22, 0.36, uSwash)));
  const shapedSwashDepth = rawSwashDepth * (1.0 + (slopeSheet - 1.0) * kwSmooth(-0.055, 0.075, rawSwashDepth));
  const boreNose = 0.028 * amp * uprushPos * kwSmooth(-0.025, 0.085, rawSwashDepth) * (1.0 - kwSmooth(0.09, 0.42, rawSwashDepth));
  const swashEta = bed + shapedSwashDepth + boreNose;

  let eta = surfEta * (1.0 - landBlend) + swashEta * landBlend;
  if (eta < minSubBed) eta = minSubBed;
  const waveCrest = Math.max(0.0, 0.58 * bw1aX * pktEnv1a + 0.44 * bw1bX * pktEnv1b + 0.36 * bw2X * pktEnv2);
  eta += rockRunupBand * (0.26 + 0.74 * waveCrest * waveCrest) * kwSmooth(0.02, 0.22, eta - bed);
  eta *= coastZone;

  const dEffBreak = Math.max(0.26, d0 + 0.35 * Math.max(0.0, surfElev));
  const localWaveH = Math.max(0.0, surfElev * 2.15) + 0.14 * amp * (pktEnv1a * Math.max(0.0, bw1aY) + pktEnv1b * Math.max(0.0, bw1bY));
  const energySteepGate = kwSmooth(0.32, 1.08, localWaveH / (0.64 * dEffBreak));

  const crestFocus = Math.max(0.0, pktEnv1a * bw1aY * 0.76 + pktEnv1b * bw1bY * 0.62 + pktEnv2 * bw2Y * 0.56);
  const packetSuperpos = kwClamp((pktEnv1a * 0.55 + pktEnv1b * 0.45) * (1.0 - 0.58 * ripChannel), 0.0, 1.35);
  const dWarp = d0 * Math.max(0.0, 1.0 + 0.32 * Math.sin(x * 0.19 + 0.38 * t) + 0.24 * Math.cos(x * 0.49 - 0.52 * t) + 0.16 * Math.sin(x * 1.08 + z * 0.26));
  const surfOuterD = 0.42 + 1.06 * kwSmooth(0.34, 1.12, packetSuperpos);
  const surfZone = kwSmooth(0.03, 0.24, dWarp) * (1.0 - kwSmooth(surfOuterD * 0.42, surfOuterD * 1.35, dWarp));
  const crescentMod = kwClamp(0.76 + 0.28 * Math.sin(x * 0.15 + 0.44 * t) + 0.22 * Math.cos(x * 0.36 - 0.62 * t) + 0.16 * Math.sin(x * 0.83 + 0.85 * t), 0.24, 1.32);
  const rollerDrive = crestFocus * crescentMod * surfZone * (0.42 + 0.78 * energySteepGate) * (0.72 + 0.58 * packetSuperpos);
  const breakerFront = kwClamp(kwSmooth(0.03, 0.78, rollerDrive) * (0.28 + 0.72 * crestFocus) * (0.65 + 0.55 * energySteepGate) * amp * 1.72 * (1.0 - 0.52 * ripChannel), 0.0, 1.35) * coastZone;

  const localDepth = Math.max(0.0, eta - bed);
  const hEff = Math.max(0.18, d0 + Math.max(0.0, eta) * 0.68);
  const cBore = Math.sqrt(9.81 * hEff);
  const uSurfMag = (cBore * (eta / Math.max(0.26, hEff)) + 0.484 * cBore * breakerFront) * (1.0 - 0.20 * rockWake);
  const latOblique = (0.14 * pktEnv1a * bw1aX - 0.16 * pktEnv1b * bw1bX + 0.19 * pktEnv2 * bw2X) * refractOblique;

  const ux = ((rayX * uSurfMag + latOblique * cBore * 0.42) * (1.0 - landBlend) + rayX * uSwash * 0.35 * landBlend) * coastZone;
  const uz = (rayZ * uSurfMag * (1.0 - landBlend) + uSwash * landBlend) * coastZone;

  out[0] = eta;
  out[2] = ux;
  out[3] = uz;
  out[4] = breakerFront;
  out[5] = localDepth;

  // Fast analytical + single-step forward derivative ONLY when site is active (saves 67% trig work on inactive sites!)
  if (uz <= 0.10 || eta < minEtaForDeriv) {
    out[1] = 0.0;
    return out;
  }

  const dtEps = 0.032;
  const t2 = t + dtEps;
  const tW2 = t2 + 3.05;
  const bDyn2 = bend1Static + 0.18 * Math.cos(x * 0.39 - 0.35 * t2) + 0.11 * Math.sin(x * 0.82 + z * 0.12 + 0.55 * t2);
  const p1aN = KW_W1A * (tW2 - tau) + 0.058 * refractOblique * x + bDyn2;
  const p1bN = KW_W1B * (tW2 - tau * 0.985) - 0.068 * refractOblique * x - bDyn2 * 0.65 + 1.35;
  const p2N  = KW_W2  * (tW2 - tau * 1.045) + 0.094 * refractOblique * x + bend2;

  const wN1a = p1aN + skew * Math.sin(p1aN) + 0.34 * skew * skew * Math.sin(2.0 * p1aN);
  const sn1a = Math.sin(wN1a);
  const bN1aX = sn1a + 0.33 * skew * (sn1a * sn1a - 0.5) + 0.12 * skew * skew * (sn1a * sn1a * sn1a - 0.75 * sn1a);

  const wN1b = p1bN + skewB * Math.sin(p1bN) + 0.34 * skewB * skewB * Math.sin(2.0 * p1bN);
  const sn1b = Math.sin(wN1b);
  const bN1bX = sn1b + 0.33 * skewB * (sn1b * sn1b - 0.5) + 0.12 * skewB * skewB * (sn1b * sn1b * sn1b - 0.75 * sn1b);

  const wN2 = p2N + skewC * Math.sin(p2N) + 0.34 * skewC * skewC * Math.sin(2.0 * p2N);
  const sn2 = Math.sin(wN2);
  const bN2X = sn2 + 0.33 * skewC * (sn2 * sn2 - 0.5) + 0.12 * skewC * skewC * (sn2 * sn2 * sn2 - 0.75 * sn2);

  const cTri2 = chopFade > 1e-4
    ? (0.46 * Math.sin(KW_WCA * (t2 - tau * 1.06) + 0.145 * x + chopPhaseZ)
      + 0.36 * Math.sin(KW_WCB * (t2 - tau * 1.09) - 0.185 * x + chopPhaseXZ)
      + 0.18 * Math.sin(KW_WCC * t2 + (0.24 * x - 0.31 * z) + 1.7)) * chopFade
    : 0.0;

  const sEl2 = ((0.245 * pktEnv1a * bN1aX + 0.175 * pktEnv1b * bN1bX + 0.145 * pktEnv2 * bN2X) * shoalGain * depthLimit + 0.052 * cTri2) * surfScale;
  const sEt2 = sEl2 > -0.44 * d0 ? sEl2 : -0.44 * d0;

  const uS1aN = kwFract((p1aN + cusp1 - 0.16) * KW_INV_TAU);
  const sw1aLN = kwSmooth(0.0, 0.19, uS1aN) * Math.pow(1.0 - kwSmooth(0.17, 0.99, uS1aN), 1.78);
  const uS1bN = kwFract((p1bN - cusp1 * 0.7 - 0.16) * KW_INV_TAU);
  const sw1bLN = kwSmooth(0.0, 0.19, uS1bN) * Math.pow(1.0 - kwSmooth(0.17, 0.99, uS1bN), 1.78);
  const uS2N = kwFract((p2N + cusp2 - 0.16) * KW_INV_TAU);
  const sw2LN = kwSmooth(0.0, 0.19, uS2N) * Math.pow(1.0 - kwSmooth(0.17, 0.99, uS2N), 1.78);

  const rawSwD2 = (-0.022 + (0.235 * sw1aLN * pktEnv1a + 0.165 * sw1bLN * pktEnv1b + 0.135 * sw2LN * pktEnv2) * lobeReach * rockShadow) * amp - bed;
  const shSwD2 = rawSwD2 * (1.0 + (slopeSheet - 1.0) * kwSmooth(-0.055, 0.075, rawSwD2));
  const bNose2 = 0.028 * amp * uprushPos * kwSmooth(-0.025, 0.085, rawSwD2) * (1.0 - kwSmooth(0.09, 0.42, rawSwD2));
  let eta2 = sEt2 * (1.0 - landBlend) + (bed + shSwD2 + bNose2) * landBlend;
  if (eta2 < minSubBed) eta2 = minSubBed;
  const wCr2 = Math.max(0.0, 0.58 * bN1aX * pktEnv1a + 0.44 * bN1bX * pktEnv1b + 0.36 * bN2X * pktEnv2);
  eta2 += rockRunupBand * (0.26 + 0.74 * wCr2 * wCr2) * kwSmooth(0.02, 0.22, eta2 - bed);
  eta2 *= coastZone;

  out[1] = (eta2 - eta) / dtEps;
  return out;
}
