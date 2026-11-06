/* Procedural Physics-Driven Coastal Ocean & 3D Wave-Rock Acoustic Engine (OceanAudio.js).
 *
 * Physical Acoustics Foundations:
 *  - Minnaert (1933, Phil. Mag. 16): Monopole air-bubble radial resonance f_0 = (1 / 2*pi*R_0)*sqrt(3*gamma*P_0 / rho_w) ~ 3.26 / R_0.
 *  - Prosperetti (1988, JASA 84) & Lu, Prosperetti & Yoon (1990): Collective low-frequency bubble-plume eigenmodes (75-280 Hz surf roar).
 *  - Stokes & Deane (1999, JASA) & Deane & Stokes (2002, Nature 418): Surf-zone Hinze-scale turbulent shear & fragmentation noise.
 *  - Leighton (1994, The Acoustic Bubble): High-frequency strandline foam effervescence & porous sand percolation hiss (2.5-6.8 kHz).
 *  - Cooker & Peregrine (1995) + Villermaux (2007): 3D stereo-spatialized rock pressure-impulse booms, spray jets & delayed splashdowns.
 *
 * 100% Web Audio API synthesis on the browser audio thread (zero external audio files, ~0.02 ms main-thread overhead).
 */
export function createOceanAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let noiseBufL = null;
  let noiseBufR = null;

  let masterGain = null;
  let underwaterLPF = null;
  let subHydroGain = null, subHydroFilter = null;
  let surfLowHPF = null, surfLowGain = null, surfLowFilter = null;
  let surfMidGain = null, surfMidFilter = null, surfPan = null;
  let swashHissGain = null, swashHissFilter = null;
  let windGain = null, windFilter = null;

  let enabled = true;
  let userVolume = 0.72;
  let isPlaying = true;
  let lastImpactTime = 0;
  let lastSplashdownTime = 0;
  let lastBubblePingTime = 0;
  let activeVoices = 0;
  const MAX_VOICES = 12;

  let camPos = { x: 0, y: 8, z: 32 };
  let camRight = { x: 1, y: 0, z: 0 };

  function buildNoiseBuffers(context) {
    const len = context.sampleRate * 4;
    const makePinkish = seedInit => {
      const buf = context.createBuffer(1, len, context.sampleRate);
      const ch = buf.getChannelData(0);
      let s = seedInit >>> 0;
      // Paul Kellet 6-pole pinking filter for natural 1/f ocean turbulence spectrum
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const white = (s / 2147483648.0) - 1.0;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
        // Smooth 0.15s cross-fade at loop seam so 4s loop has ZERO seam click
        ch[i] = Math.max(-0.98, Math.min(0.98, pink));
      }
      const fadeSamples = Math.floor(context.sampleRate * 0.15);
      for (let i = 0; i < fadeSamples; i++) {
        const w = i / fadeSamples;
        const endIdx = len - fadeSamples + i;
        const blended = ch[endIdx] * (1 - w) + ch[i] * w;
        ch[endIdx] = blended;
      }
      return buf;
    };
    noiseBufL = makePinkish(135792468);
    noiseBufR = makePinkish(975318642);
  }

  function ensureGraph() {
    if (ctx || !AudioCtx) return !!ctx;
    try {
      ctx = new AudioCtx();
    } catch {
      return false;
    }
    buildNoiseBuffers(ctx);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 14;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.008;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.0001;
    masterGain.connect(comp);

    underwaterLPF = ctx.createBiquadFilter();
    underwaterLPF.type = 'lowpass';
    underwaterLPF.frequency.value = 16500;
    underwaterLPF.Q.value = 0.65;
    underwaterLPF.connect(masterGain);

    // 1. Prosperetti (1988) Collective Bubble-Cloud Surf Wash (105-260 Hz, sub-bass rumble cleanly rolled off!)
    const srcLow = ctx.createBufferSource();
    srcLow.buffer = noiseBufL;
    srcLow.loop = true;
    surfLowHPF = ctx.createBiquadFilter();
    surfLowHPF.type = 'highpass';
    surfLowHPF.frequency.value = 105;
    surfLowHPF.Q.value = 0.50;
    surfLowFilter = ctx.createBiquadFilter();
    surfLowFilter.type = 'lowpass';
    surfLowFilter.frequency.value = 215;
    surfLowFilter.Q.value = 0.52;
    surfLowGain = ctx.createGain();
    surfLowGain.gain.value = 0.19;
    srcLow.connect(surfLowHPF);
    surfLowHPF.connect(surfLowFilter);
    surfLowFilter.connect(surfLowGain);
    surfLowGain.connect(underwaterLPF);
    srcLow.start();

    // 2. Deane & Stokes (2002) Breaking Roller Shear & Crest Wash (320-1350 Hz stereo-swept)
    const srcMid = ctx.createBufferSource();
    srcMid.buffer = noiseBufR;
    srcMid.loop = true;
    surfMidFilter = ctx.createBiquadFilter();
    surfMidFilter.type = 'bandpass';
    surfMidFilter.frequency.value = 620;
    surfMidFilter.Q.value = 0.72;
    surfMidGain = ctx.createGain();
    surfMidGain.gain.value = 0.16;
    surfPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    srcMid.connect(surfMidFilter);
    surfMidFilter.connect(surfMidGain);
    if (surfPan) {
      surfMidGain.connect(surfPan);
      surfPan.connect(underwaterLPF);
    } else {
      surfMidGain.connect(underwaterLPF);
    }
    srcMid.start();

    // 3. Leighton (1994) Swash Bore & Receding Wet-Sand Bubble Effervescence ("shhhhh" 2.2-6.2 kHz)
    const srcHiss = ctx.createBufferSource();
    srcHiss.buffer = noiseBufL;
    srcHiss.loop = true;
    srcHiss.playbackRate.value = 1.18;
    swashHissFilter = ctx.createBiquadFilter();
    swashHissFilter.type = 'bandpass';
    swashHissFilter.frequency.value = 2800;
    swashHissFilter.Q.value = 0.65;
    swashHissGain = ctx.createGain();
    swashHissGain.gain.value = 0.06;
    srcHiss.connect(swashHissFilter);
    swashHissFilter.connect(swashHissGain);
    swashHissGain.connect(underwaterLPF);
    srcHiss.start();

    // 4. Coastal Marine Breeze & Underwater Hydrophone Sub-Swell Rumble
    const srcWind = ctx.createBufferSource();
    srcWind.buffer = noiseBufR;
    srcWind.loop = true;
    srcWind.playbackRate.value = 0.76;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 410;
    windFilter.Q.value = 1.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0.035;
    srcWind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(underwaterLPF);
    srcWind.start();

    // Filtered broadband hydrophone water-flow ambience (only audible in underwater diveMode; zero tonal sine!)
    const srcHydro = ctx.createBufferSource();
    srcHydro.buffer = noiseBufL;
    srcHydro.loop = true;
    srcHydro.playbackRate.value = 0.68;
    subHydroFilter = ctx.createBiquadFilter();
    subHydroFilter.type = 'bandpass';
    subHydroFilter.frequency.value = 165;
    subHydroFilter.Q.value = 0.65;
    subHydroGain = ctx.createGain();
    subHydroGain.gain.value = 0.0;
    srcHydro.connect(subHydroFilter);
    subHydroFilter.connect(subHydroGain);
    subHydroGain.connect(masterGain);
    srcHydro.start();

    return true;
  }

  function unlock() {
    if (!enabled) return;
    if (!ensureGraph()) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function computeSpatial(wx, wy, wz) {
    const dx = wx - camPos.x;
    const dy = wy - camPos.y;
    const dz = wz - camPos.z;
    const dist = Math.max(1.5, Math.hypot(dx, dy, dz));
    const invD = 1.0 / dist;
    const pan = Math.max(-0.90, Math.min(0.90, (dx * camRight.x + dz * camRight.z) * invD * 0.92));
    const atten = 1.0 / (1.0 + 0.048 * dist + 0.00055 * dist * dist);
    return { dist, pan, atten };
  }

  // Triggered by RockSplashSystem neural-network wave-rock surge (pure broadband water wash, ZERO synthetic drum oscillators!)
  function onImpact(wx, wy, wz, gate, jetNorm, sprayAtom, focusKappa, overtopBlend) {
    if (!enabled || !isPlaying || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - lastImpactTime < 0.24 || activeVoices >= MAX_VOICES) return;

    const { dist, pan, atten } = computeSpatial(wx, wy, wz);
    const strength = Math.min(1.10, gate * (0.72 + 0.28 * (focusKappa - 1.0)) * atten * 1.85);
    if (strength < 0.065) return;

    lastImpactTime = now;
    activeVoices += 2;

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const outNode = panner || underwaterLPF;
    if (panner) {
      panner.pan.setValueAtTime(pan, now);
      panner.connect(underwaterLPF);
    }

    // Layer A: Natural Broadband Aerated Wave-Surge Wash (140-360 Hz filtered pink noise with soft liquid swell attack)
    const surgeSrc = ctx.createBufferSource();
    surgeSrc.buffer = Math.random() > 0.5 ? noiseBufR : noiseBufL;
    const surgeOffset = Math.random() * 2.5;
    surgeSrc.playbackRate.value = 0.84 + 0.16 * Math.random();

    const surgeHPF = ctx.createBiquadFilter();
    surgeHPF.type = 'highpass';
    surgeHPF.frequency.setValueAtTime(135, now);
    surgeHPF.Q.value = 0.50;

    const surgeBPF = ctx.createBiquadFilter();
    surgeBPF.type = 'bandpass';
    const surgeHz = 250 + 110 * Math.min(1.0, jetNorm);
    surgeBPF.frequency.setValueAtTime(surgeHz, now);
    surgeBPF.frequency.exponentialRampToValueAtTime(195, now + 0.58);
    surgeBPF.Q.value = 0.55;

    const surgeDur = 0.62 + 0.28 * gate;
    const surgeGain = ctx.createGain();
    const surgePeak = Math.min(0.19, 0.135 * strength);
    surgeGain.gain.setValueAtTime(0.0001, now);
    surgeGain.gain.linearRampToValueAtTime(surgePeak, now + 0.085);
    surgeGain.gain.exponentialRampToValueAtTime(0.0006, now + surgeDur);

    surgeSrc.connect(surgeHPF);
    surgeHPF.connect(surgeBPF);
    surgeBPF.connect(surgeGain);
    surgeGain.connect(outNode);
    surgeSrc.start(now, surgeOffset, surgeDur + 0.04);

    // Layer B: Villermaux (2007) Perforating Liquid-Sheet & Spray Jet Wash (air-absorption filtered with distance)
    const spraySrc = ctx.createBufferSource();
    spraySrc.buffer = Math.random() > 0.5 ? noiseBufL : noiseBufR;
    const offset = Math.random() * 2.6;
    spraySrc.playbackRate.value = 0.96 + 0.28 * sprayAtom;

    const sprayBPF = ctx.createBiquadFilter();
    sprayBPF.type = 'bandpass';
    const airRoll = Math.max(0.42, Math.exp(-dist * 0.012));
    const startHz = (1050 + 1350 * jetNorm + 650 * sprayAtom) * airRoll;
    sprayBPF.frequency.setValueAtTime(startHz, now);
    sprayBPF.frequency.exponentialRampToValueAtTime(Math.max(460, startHz * 0.48), now + 0.72);
    sprayBPF.Q.value = 0.62;

    const sprayGain = ctx.createGain();
    const dur = Math.max(surgeDur, 0.58 + 0.36 * gate + 0.22 * overtopBlend);
    const sprayPeak = Math.min(0.24, 0.17 * strength * (0.65 + 0.55 * jetNorm));
    sprayGain.gain.setValueAtTime(0.0001, now);
    sprayGain.gain.linearRampToValueAtTime(sprayPeak, now + 0.068);
    sprayGain.gain.exponentialRampToValueAtTime(0.0006, now + dur);

    spraySrc.connect(sprayBPF);
    sprayBPF.connect(sprayGain);
    sprayGain.connect(outNode);
    spraySrc.start(now, offset, dur + 0.05);

    spraySrc.onended = () => {
      activeVoices = Math.max(0, activeVoices - 2);
      if (panner) {
        try { panner.disconnect(); } catch {}
      }
    };
  }

  // Triggered when airborne 3D splash droplets crash back onto the water surface!
  function onSplashdown(wx, wz, landStrength) {
    if (!enabled || !isPlaying || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - lastSplashdownTime < 0.14 || activeVoices >= MAX_VOICES) return;

    const { dist, pan, atten } = computeSpatial(wx, 0.0, wz);
    const level = Math.min(1.0, landStrength * atten * 1.75);
    if (level < 0.05) return;

    lastSplashdownTime = now;
    activeVoices += 1;

    const src = ctx.createBufferSource();
    src.buffer = noiseBufR;
    src.playbackRate.value = 1.22 + 0.24 * Math.random();

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    const fCenter = (1550 + 950 * Math.random()) * Math.max(0.45, Math.exp(-dist * 0.014));
    bpf.frequency.setValueAtTime(fCenter, now);
    bpf.frequency.exponentialRampToValueAtTime(760, now + 0.42);
    bpf.Q.value = 0.72;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.min(0.14, 0.11 * level), now + 0.042);
    gain.gain.exponentialRampToValueAtTime(0.0006, now + 0.46);

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(bpf);
    bpf.connect(gain);
    if (panner) {
      panner.pan.setValueAtTime(pan, now);
      gain.connect(panner);
      panner.connect(underwaterLPF);
    } else {
      gain.connect(underwaterLPF);
    }
    src.start(now, Math.random() * 2.8, 0.48);
    src.onended = () => {
      activeVoices = Math.max(0, activeVoices - 1);
      if (panner) {
        try { panner.disconnect(); } catch {}
      }
    };
  }

  // Minnaert (1933) monopole bubble chirp f_0 ~ 3.26 / R_0 (1150 - 2950 Hz delicate foam effervescence)
  function triggerMinnaertBubblePing(now, gainScale) {
    if (activeVoices >= MAX_VOICES) return;
    activeVoices += 1;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const radiusMm = 1.10 + Math.random() * 1.75; // 1.10..2.85 mm surf bubble (>= 1140 Hz, never low-freq!)
    const fMinnaert = 3260 / radiusMm;
    osc.frequency.setValueAtTime(fMinnaert * 0.94, now);
    osc.frequency.exponentialRampToValueAtTime(fMinnaert * 1.14, now + 0.052);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.013 * gainScale, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0002, now + 0.072);

    osc.connect(g);
    g.connect(underwaterLPF);
    osc.start(now);
    osc.stop(now + 0.076);
    osc.onended = () => { activeVoices = Math.max(0, activeVoices - 1); };
  }

  function update(simTime, camera, opts) {
    if (!ctx) return;
    const {
      playing = true,
      diveMode = false,
      beachMode = 1,
      amplitude = 0.6,
      foamBoost = 1.0
    } = opts || {};
    isPlaying = playing;

    if (camera) {
      camPos.x = camera.position.x;
      camPos.y = camera.position.y;
      camPos.z = camera.position.z;
      const e = camera.matrixWorld.elements;
      camRight.x = e[0];
      camRight.y = e[1];
      camRight.z = e[2];
    }

    const now = ctx.currentTime;
    const active = enabled && playing && ctx.state === 'running';
    const targetMaster = active ? userVolume : 0.0001;
    masterGain.gain.setTargetAtTime(targetMaster, now, 0.08);
    if (!active) return;

    const ampNorm = Math.max(0.3, Math.min(2.0, amplitude / 0.6));
    const shoreLineZ = 15.0 + 3.0 * Math.sin(camPos.x * 0.035);
    const distToSurf = Math.hypot(camPos.z - (shoreLineZ - 6.0), Math.max(0, camPos.y - 0.5));
    const surfProximity = beachMode > 0.5 ? 1.0 / (1.0 + 0.026 * distToSurf) : 0.38;
    const swashProximity = beachMode > 0.5
      ? 1.0 / (1.0 + 0.045 * Math.hypot(camPos.z - (shoreLineZ + 2.5), Math.max(0, camPos.y - 0.3)))
      : 0.0;

    // Real-time wave-set modulation matching CoastalWaves.js 7.1s & 5.1s swell periods!
    const w1 = (2 * Math.PI) / 7.1;
    const w2 = (2 * Math.PI) / 5.1;
    const swell1 = Math.sin(w1 * simTime - 2.4);
    const swell2 = Math.sin(w2 * simTime - 1.7);
    const crestPulse = Math.max(0.0, 0.68 * swell1 + 0.38 * swell2);
    const backwashPhase = Math.max(0.0, -0.72 * Math.sin(w1 * simTime - 3.1) - 0.28 * Math.sin(w2 * simTime - 2.3));

    // Underwater hydrophone transition vs open-air coastal acoustics
    const targetCutoff = diveMode ? 340 : 16200;
    underwaterLPF.frequency.setTargetAtTime(targetCutoff, now, 0.09);
    subHydroGain.gain.setTargetAtTime(diveMode ? 0.14 * ampNorm * (0.7 + 0.3 * crestPulse) : 0.0, now, 0.10);

    // Modulate continuous surf wash & breaker sweep (airy natural broadband spectrum, zero sub-bass boom!)
    const lowLevel = (0.10 + 0.16 * surfProximity * (0.52 + 0.62 * crestPulse)) * ampNorm;
    surfLowFilter.frequency.setTargetAtTime(175 + 90 * crestPulse * ampNorm, now, 0.14);
    surfLowGain.gain.setTargetAtTime(Math.min(0.34, lowLevel), now, 0.14);

    const midLevel = (0.07 + 0.22 * surfProximity * (0.35 + 0.85 * crestPulse)) * ampNorm * Math.min(1.35, 0.65 + 0.35 * foamBoost);
    surfMidFilter.frequency.setTargetAtTime(480 + 460 * crestPulse, now, 0.10);
    surfMidGain.gain.setTargetAtTime(Math.min(0.38, midLevel), now, 0.10);
    if (surfPan) {
      surfPan.pan.setTargetAtTime(0.28 * Math.sin(simTime * 0.31), now, 0.18);
    }

    // Leighton receding sand percolation & strandline foam bubble effervescence!
    const hissLevel = swashProximity * (0.04 + 0.14 * backwashPhase + 0.06 * crestPulse) * Math.min(1.4, foamBoost);
    swashHissFilter.frequency.setTargetAtTime(2200 + 2100 * backwashPhase, now, 0.12);
    swashHissGain.gain.setTargetAtTime(Math.min(0.24, hissLevel), now, 0.12);

    // Gentle marine breeze (stronger higher above the water)
    const elevFactor = diveMode ? 0.0 : Math.min(1.0, Math.max(0.15, camPos.y / 18.0));
    windFilter.frequency.setTargetAtTime(360 + 140 * Math.sin(simTime * 0.23), now, 0.20);
    windGain.gain.setTargetAtTime(0.028 * elevFactor * ampNorm, now, 0.20);

    // Subtle Minnaert individual bubble pings when underwater or very close (< 11m) to surf/swash!
    if ((diveMode || distToSurf < 11.5) && now - lastBubblePingTime > (diveMode ? 0.11 : 0.26)) {
      if (Math.random() < (diveMode ? 0.65 : 0.32 * backwashPhase)) {
        lastBubblePingTime = now;
        triggerMinnaertBubblePing(now, diveMode ? 1.0 : 0.45 * swashProximity);
      }
    }
  }

  return {
    unlock,
    onImpact,
    onSplashdown,
    update,
    setEnabled(on) {
      enabled = !!on;
      if (enabled) unlock();
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      if (enabled) unlock();
      return enabled;
    },
    setVolume(v) {
      userVolume = Math.max(0, Math.min(1.2, Number(v) || 0));
      if (userVolume > 0 && enabled) unlock();
    },
    status() {
      return {
        supported: !!AudioCtx,
        enabled,
        contextState: ctx ? ctx.state : 'uninitialized',
        volume: userVolume,
        activeTransientVoices: activeVoices,
        hasLowFreqOscillators: false
      };
    }
  };
}
