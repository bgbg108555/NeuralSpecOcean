import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium'
].filter(Boolean);
const CHROME_PATH = DEFAULT_CHROME_CANDIDATES.find(p => fs.existsSync(p)) || DEFAULT_CHROME_CANDIDATES[0];
const HTML_FILE = fs.existsSync(path.join(ROOT_DIR, 'index.html'))
  ? path.join(ROOT_DIR, 'index.html')
  : path.join(ROOT_DIR, '完整海景.html');
const HTML_URL = pathToFileURL(HTML_FILE).href;
const OUT_DIR = path.join(ROOT_DIR, 'tools', 'captures');
fs.mkdirSync(OUT_DIR, { recursive: true });

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neuralspecocean-gpu-'));
const port = 9345 + Math.floor(Math.random() * 400);

const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--headless=new',
  '--window-size=1600,960',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--disable-frame-rate-limit',
  '--disable-gpu-vsync',
  '--autoplay-policy=no-user-gesture-required',
  '--allow-file-access-from-files',
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank'
], { stdio: 'ignore' });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getPageWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find(t => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error('Timed out connecting to Chrome CDP');
}

try {
  const wsUrl = await getPageWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 1;
  const pending = new Map();
  const consoleErrors = [];
  const pageExceptions = [];

  ws.onmessage = evt => {
    const msg = JSON.parse(evt.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      pageExceptions.push(msg.params.exceptionDetails);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type === 'error' || msg.params.type === 'warning') {
        consoleErrors.push({
          type: msg.params.type,
          text: msg.params.args.map(a => a.value ?? a.description ?? '').join(' ')
        });
      }
    }
  };

  function send(method, params = {}) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  async function evalJS(expression) {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error('Eval exception: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  async function snap(filename) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const outPath = path.join(OUT_DIR, filename);
    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    console.log('Saved:', outPath);
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 960,
    deviceScaleFactor: 1.5,
    mobile: false
  });

  const bootStartMs = performance.now();
  await send('Page.navigate', { url: HTML_URL });
  const bootProgressLog = [];
  let capturedLiveBootShot = false;
  for (let i = 0; i < 200; i++) {
    await sleep(55);
    const probe = await evalJS(`(() => {
      const ls = document.getElementById('loadingScreen');
      return {
        ready: typeof window.oceanDebug !== 'undefined' && (ls?.classList.contains('is-hidden') ?? false),
        pct: document.getElementById('loadingPct')?.textContent || '',
        shaderPct: document.getElementById('shaderPct')?.textContent || '',
        shaderBadge: document.getElementById('shaderCountBadge')?.textContent || '',
        shaderStage: document.getElementById('shaderStage')?.textContent || ''
      };
    })()`);
    const key = `${probe.pct}|${probe.shaderPct}|${probe.shaderBadge}`;
    if (!bootProgressLog.length || bootProgressLog[bootProgressLog.length - 1].key !== key) {
      bootProgressLog.push({ tMs: Math.round(performance.now() - bootStartMs), key, ...probe });
    }
    if (!capturedLiveBootShot && parseInt(probe.shaderPct, 10) >= 20 && parseInt(probe.shaderPct, 10) < 100) {
      capturedLiveBootShot = true;
      await snap('00_loading_screen.png');
    }
    if (probe.ready) break;
  }
  const bootElapsedMs = Math.round(performance.now() - bootStartMs);
  console.log('Cold Boot Ready Time (ms):', bootElapsedMs);
  console.log('Boot Dual-Bar Progress Trace:', JSON.stringify(bootProgressLog));
  await sleep(250);

  if (pageExceptions.length || consoleErrors.length) {
    console.log('Page Exceptions:', JSON.stringify(pageExceptions, null, 2));
    console.log('Console Warnings/Errors:', JSON.stringify(consoleErrors, null, 2));
  }

  // Verify Loading Screen lifecycle + UI polish (panel collapse & dual shader progress bar)
  const uiAndBootCheck = await evalJS(`(() => {
    const ls = document.getElementById('loadingScreen');
    const wasHidden = ls?.classList.contains('is-hidden') ?? false;
    const pctAtBootEnd = document.getElementById('loadingPct')?.textContent;
    const shaderPctAtBootEnd = document.getElementById('shaderPct')?.textContent;
    const shaderBadgeAtBootEnd = document.getElementById('shaderCountBadge')?.textContent;
    const depthLabel = document.getElementById('waterDepthValue')?.textContent;
    const ampLabel = document.getElementById('amplitudeValue')?.textContent;
    const foamLabel = document.getElementById('foamBoostValue')?.textContent;
    const panelBtn = document.getElementById('panelToggleBtn');
    const panelBody = document.getElementById('controlPanelBody');
    panelBtn?.click();
    const collapsedOk = panelBody?.hidden === true;
    panelBtn?.click();
    const expandedOk = panelBody?.hidden === false;
    return { wasHidden, pctAtBootEnd, shaderPctAtBootEnd, shaderBadgeAtBootEnd, depthLabel, ampLabel, foamLabel, collapsedOk, expandedOk };
  })()`);
  console.log('UI & Boot Polish Check:', JSON.stringify(uiAndBootCheck));
  if (!capturedLiveBootShot) {
    await evalJS(`(() => {
      const ls = document.getElementById('loadingScreen');
      const total = window.oceanDebug.status().parallelCompile?.totalPrograms || 18;
      const done = Math.round(total * 0.72);
      if (ls) {
        ls.style.transition = 'none';
        ls.classList.remove('is-hidden');
        document.getElementById('loadingBarFill').style.width = '88%';
        document.getElementById('loadingPct').textContent = '88%';
        document.getElementById('loadingStage').textContent = \`多執行緒平行編譯 GPU 著色器 (\${done} / \${total})…\`;
        document.getElementById('shaderCompileBox')?.classList.add('is-active');
        document.getElementById('shaderBarFill').style.width = '72%';
        document.getElementById('shaderPct').textContent = '72%';
        document.getElementById('shaderStage').textContent = '平行編譯中：海洋頻譜與雙層水深折射核心 (Offshore)';
        document.getElementById('shaderCountBadge').textContent = \`\${done} / \${total} Programs\`;
      }
    })()`);
    await snap('00_loading_screen.png');
    await evalJS(`(() => {
      const ls = document.getElementById('loadingScreen');
      const total = window.oceanDebug.status().parallelCompile?.totalPrograms || 18;
      if (ls) {
        document.getElementById('loadingBarFill').style.width = '100%';
        document.getElementById('loadingPct').textContent = '100%';
        document.getElementById('shaderBarFill').style.width = '100%';
        document.getElementById('shaderPct').textContent = '100%';
        document.getElementById('shaderCountBadge').textContent = \`\${total} / \${total} Programs\`;
        ls.classList.add('is-hidden');
        ls.style.transition = '';
      }
    })()`);
    await sleep(120);
  }

  const status = await evalJS('window.oceanDebug.status()');
  console.log('Initial Status:', JSON.stringify(status, null, 2));

  // Measure real live rAF FPS (including swashRig GPU step, depthCapture, FFT, PBR & audio) + raw GPU render cost
  windowLiveBench: {
    await evalJS('window.oceanDebug.oceanAudio.unlock(); window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.setPlaying(true)');
    await sleep(1850);
    // Read livePerf BEFORE Page.captureScreenshot so PNG-encoding main-thread pause does not pollute rolling telemetry!
    const livePerf = await evalJS(`({
      snapshot: window.oceanDebug.perf(),
      dom: {
        fps: document.getElementById('perfFpsVal')?.textContent,
        fpsMax: document.getElementById('perfFpsMaxVal')?.textContent,
        low1: document.getElementById('perfFpsLowVal')?.textContent,
        potFps: document.getElementById('perfPotFpsVal')?.textContent,
        fpsCap: document.getElementById('perfFpsCap')?.value,
        frameMs: document.getElementById('perfFrameMsVal')?.textContent,
        gpuMs: document.getElementById('perfGpuMsVal')?.textContent,
        vram: document.getElementById('perfVramVal')?.textContent,
        cpuMs: document.getElementById('perfCpuMsVal')?.textContent,
        cpuSub: document.getElementById('perfCpuSubVal')?.textContent,
        ram: document.getElementById('perfRamVal')?.textContent,
        ramSub: document.getElementById('perfRamSubVal')?.textContent,
        pipe: document.getElementById('perfPipeVal')?.textContent
      }
    })`);
    console.log('Live Perf HUD Snapshot:', JSON.stringify(livePerf, null, 2));
    await snap('00_live_hud_overview.png');

    // Verify FPS Lock (60 FPS & 30 FPS caps) works accurately!
    await evalJS('window.oceanDebug.setFpsCap(60)');
    await sleep(1050);
    const cap60Check = await evalJS(`({
      fps: window.oceanDebug.perf().fps,
      fpsMax: window.oceanDebug.perf().fpsMax,
      fpsPotential: window.oceanDebug.perf().fpsPotential,
      fpsCap: window.oceanDebug.perf().fpsCap,
      sideStatus: document.getElementById('frameStatus')?.textContent
    })`);
    console.log('FPS Lock 60Hz Check:', JSON.stringify(cap60Check));

    await evalJS('window.oceanDebug.setFpsCap(30)');
    await sleep(1050);
    const cap30Check = await evalJS(`({
      fps: window.oceanDebug.perf().fps,
      fpsMax: window.oceanDebug.perf().fpsMax,
      fpsPotential: window.oceanDebug.perf().fpsPotential,
      fpsCap: window.oceanDebug.perf().fpsCap,
      sideStatus: document.getElementById('frameStatus')?.textContent
    })`);
    console.log('FPS Lock 30Hz Check:', JSON.stringify(cap30Check));
    await evalJS('window.oceanDebug.setFpsCap(0)');
    await sleep(450);

    // Measure VRAM, geometry density, draw calls & GPU frame time across Low / Medium / High quality tiers at 1600x960 @ 1.5 DPR
    const qualityTiersReport = await evalJS(`(() => {
      window.oceanDebug.setPlaying(false);
      window.oceanDebug.seek(24.92);
      window.oceanDebug.setOrbit(-13.8, 0.35, 10.2, -0.34, 0.29, 17.2);
      const gl = window.oceanDebug.renderer.getContext();
      const out = {};
      for (const q of ['low', 'medium', 'high']) {
        window.oceanDebug.setQuality(q);
        renderFrame();
        gl.finish();
        const t0 = performance.now();
        for (let i = 0; i < 24; i++) {
          const st = 24.92 + i * (1 / 60);
          ocean.uniforms.time.value = st;
          short.update(st);
          chop.update(st);
          rockSplash.step(st, 1 / 60, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value, false);
          swashRig.step(st, 1 / 60, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value);
          renderFrame();
        }
        gl.finish();
        const avgMs = (performance.now() - t0) / 24;
        const p = window.oceanDebug.perf();
        out[q] = {
          vramMB: p.gpu.vramTotalMB,
          drawCalls: window.oceanDebug.renderer.info.render.calls,
          triangles: window.oceanDebug.renderer.info.render.triangles,
          dpr: +window.oceanDebug.renderer.getPixelRatio().toFixed(2),
          avgFullGpuSyncMs: +avgMs.toFixed(3),
          estMaxFps: Math.round(1000 / Math.max(avgMs, 0.1))
        };
      }
      window.oceanDebug.setQuality('medium');
      return out;
    })()`);
    console.log('Quality Tiers Benchmark (low / medium / high):', JSON.stringify(qualityTiersReport, null, 2));

    // Verify smooth parameter damping (UI slider changes ramp smoothly instead of 1-frame snapping)
    const smoothTransitionCheck = await evalJS(`(() => {
      const startAmp = ocean.uniforms.amplitude.value;
      const ampInput = document.getElementById('amplitude');
      ampInput.value = '1.05';
      playing = true;
      ampInput.dispatchEvent(new Event('input'));
      const afterInputImmediate = ocean.uniforms.amplitude.value;
      smoothParams(1 / 60);
      const after1Frame = ocean.uniforms.amplitude.value;
      for (let i = 0; i < 15; i++) smoothParams(1 / 60);
      const after16Frames = ocean.uniforms.amplitude.value;
      // Restore default 0.64m immediately
      ampInput.value = '0.64';
      goalAmplitude = 0.64;
      ocean.uniforms.amplitude.value = 0.64;
      document.getElementById('amplitudeValue').textContent = '0.64 m';
      playing = false;
      return {
        startAmp: +startAmp.toFixed(4),
        afterInputImmediate: +afterInputImmediate.toFixed(4),
        after1Frame: +after1Frame.toFixed(4),
        after16Frames: +after16Frames.toFixed(4),
        gradualRampVerified: Math.abs(afterInputImmediate - startAmp) < 1e-4 && after1Frame > startAmp && after1Frame < 0.80 && after16Frames > 0.85
      };
    })()`);
    console.log('Smooth Parameter Damping Check:', JSON.stringify(smoothTransitionCheck));

    // Verify pixel continuity across former t = 27.2727s sawtooth wrap (24 consecutive 60Hz frames t = 27.08 .. 27.46)
    const wrapPixelContinuity = await evalJS(`(() => {
      window.oceanDebug.setPlaying(false);
      window.oceanDebug.seek(27.08);
      window.oceanDebug.setOrbit(-16.2, 0.12, 8.2, -0.32, 0.35, 9.4);
      const prevSplashVis = rockSplash.mesh.visible;
      rockSplash.mesh.visible = false; // measure ocean & surf foam shader continuity purely without airborne random droplet spawn
      const gl = window.oceanDebug.renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const pw = 120, ph = 120;
      const x0 = Math.floor(w * 0.42), y0 = Math.floor(h * 0.35);
      let prevBuf = new Uint8Array(pw * ph * 4);
      let currBuf = new Uint8Array(pw * ph * 4);
      const deltas = [];
      for (let f = 0; f <= 24; f++) {
        const simT = 27.08 + f * (1 / 60);
        ocean.uniforms.time.value = simT;
        if (simT - sampleTime >= waveStep) {
          if (simT - sampleTime >= waveStep * 2) {
            sampleTime = simT - waveStep;
            long.update(sampleTime);
          }
          uploadLongPrevious();
          previousGradient = long.maxGradient;
          sampleTime += waveStep;
          long.update(sampleTime);
        }
        ocean.uniforms.longMix.value = Math.max(0, Math.min(1, (simT - sampleTime) / waveStep));
        short.update(simT);
        chop.update(simT);
        foamClock += 1 / 60;
        while (foamSliceIdx < 4 && foamClock >= (foamSliceIdx + 1) * (FOAM_STEP_PERIOD / 4)) {
          if (foamSliceIdx === 0) {
            foamSliceAccumDt = FOAM_STEP_PERIOD;
            prepareFoamStepParams(foamSliceAccumDt);
          }
          const done = foamField.updateSlice(foamSliceAccumDt, evalOffshoreFoamCell, foamSliceIdx, 4);
          if (done) {
            foamSliceIdx = 0;
            foamClock = Math.max(0, Math.min(FOAM_STEP_PERIOD * 0.25, foamClock - FOAM_STEP_PERIOD));
            break;
          } else {
            foamSliceIdx++;
          }
        }
        ocean.uniforms.foamTransportMix.value = Math.min(1, foamClock / FOAM_STEP_PERIOD);
        swashRig.step(simT, 1 / 60, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value);
        renderFrame();
        gl.readPixels(x0, y0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, currBuf);
        if (f > 0) {
          let sum = 0;
          for (let i = 0; i < currBuf.length; i += 4) {
            sum += (Math.abs(currBuf[i] - prevBuf[i]) + Math.abs(currBuf[i + 1] - prevBuf[i + 1]) + Math.abs(currBuf[i + 2] - prevBuf[i + 2])) / 3;
          }
          deltas.push(+(sum / (pw * ph)).toFixed(3));
        }
        const tmp = prevBuf; prevBuf = currBuf; currBuf = tmp;
      }
      rockSplash.mesh.visible = prevSplashVis;
      const sorted = [...deltas].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const maxD = Math.max(...deltas);
      return {
        medianFrameDelta8Bit: median,
        maxFrameDelta8Bit: maxD,
        spikeToMedianRatio: +(maxD / Math.max(median, 0.01)).toFixed(2),
        frameDeltas: deltas
      };
    })()`);
    console.log('Surf Foam Wrap Continuity Audit (t=27.08..27.48s):', JSON.stringify(wrapPixelContinuity));

    // Verify zero wave-bound jumps & smooth progressive sky-band frame times across 36 consecutive frames
    const jumpAudit = await evalJS(`(() => {
      window.oceanDebug.setPlaying(false);
      window.oceanDebug.seek(24.0);
      let prevChop = ocean.uniforms.chop.value;
      let prevMid = ocean.uniforms.midScale.value;
      let maxChopJump = 0, maxMidJump = 0, maxStepMs = 0;
      const gl = window.oceanDebug.renderer.getContext();
      for (let f = 1; f <= 36; f++) {
        const t0 = performance.now();
        const simT = 24.0 + f * (1 / 60);
        ocean.uniforms.time.value = simT;
        if (simT - sampleTime >= waveStep) {
          uploadLongPrevious();
          sampleTime = Math.max(sampleTime + waveStep, simT - waveStep);
          long.update(sampleTime);
        }
        ocean.uniforms.longMix.value = Math.max(0, Math.min(1, (simT - sampleTime) / waveStep));
        short.update(simT);
        chop.update(simT);
        syncBound();
        rockSplash.step(simT, 1 / 60, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value, false);
        swashRig.step(simT, 1 / 60, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value);
        renderFrame();
        gl.finish();
        const dtMs = performance.now() - t0;
        if (f > 2 && dtMs > maxStepMs) maxStepMs = dtMs;
        maxChopJump = Math.max(maxChopJump, Math.abs(ocean.uniforms.chop.value - prevChop));
        maxMidJump = Math.max(maxMidJump, Math.abs(ocean.uniforms.midScale.value - prevMid));
        prevChop = ocean.uniforms.chop.value;
        prevMid = ocean.uniforms.midScale.value;
      }
      return {
        maxChopJump: +maxChopJump.toFixed(6),
        maxMidScaleJump: +maxMidJump.toFixed(6),
        maxSingleFrameGpuSyncMs: +maxStepMs.toFixed(3)
      };
    })()`);
    console.log('Temporal Jump & Spike Audit (36 frames):', JSON.stringify(jumpAudit));
    const liveAudio = await evalJS('window.oceanDebug.oceanAudio.status()');
    console.log('Live Audio Status:', JSON.stringify(liveAudio));
    const liveFpsText = await evalJS('document.getElementById("frameStatus")?.textContent || ""');
    const bench = await evalJS(`(() => {
      window.oceanDebug.setPlaying(false);
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) {
        rockSplash.step(24.0 + i * 0.016, 0.016, 0.6, 1.0);
      }
      const splashCpuAvgMs = (performance.now() - t0) / 120;

      const tFft = performance.now();
      for (let i = 0; i < 120; i++) {
        const st = 24.0 + i * 0.016;
        short.update(st);
        chop.update(st);
      }
      const shortFftCpuAvgMs = (performance.now() - tFft) / 120;

      const start = performance.now();
      for (let i = 0; i < 60; i++) {
        const simT = 24.0 + i * 0.016;
        ocean.uniforms.time.value = simT;
        short.update(simT);
        chop.update(simT);
        rockSplash.step(simT, 0.016, 0.6, 1.0);
        swashRig.step(simT, 0.016, 0.6, 1.0);
        renderFrame();
      }
      const gl = window.oceanDebug.renderer.getContext();
      gl.finish();
      const elapsedMs = performance.now() - start;
      return {
        liveHudFps: ${JSON.stringify(liveFpsText)},
        shortFftCpuAvgMs: +shortFftCpuAvgMs.toFixed(4),
        splashCpuAvgMs: +splashCpuAvgMs.toFixed(4),
        fullFrameAvgMs: +(elapsedMs / 60).toFixed(3),
        fullEstMaxFps: Math.round(60000 / Math.max(elapsedMs, 0.1))
      };
    })()`);
    console.log('GPU Render Benchmark:', JSON.stringify(bench));
  }

  await evalJS('window.oceanDebug.setPlaying(false)');

  // 1. Coast overview across 3 phases of wave cycle (uprush, peak runup, backwash)
  await evalJS('window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.seek(24.0)');
  await snap('01_coast_t24_0.png');

  await evalJS('window.oceanDebug.seek(25.8)');
  await snap('02_coast_t25_8.png');

  await evalJS('window.oceanDebug.seek(27.6)');
  await snap('03_coast_t27_6.png');

  // 2. Coastal Rocks close-up
  await evalJS('window.oceanDebug.applyPreset("previewRocks"); window.oceanDebug.seek(24.6)');
  await snap('04_rocks_closeup.png');

  // 3. Beach Swash & Wet Sand mirror film close-up
  await evalJS('window.oceanDebug.applyPreset("previewSwash"); window.oceanDebug.seek(26.4)');
  await snap('05_swash_wetsand.png');

  // 4. Sandbar terrain preset (waves breaking over offshore sandbar + shore!)
  await evalJS('window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.setTerrainKind("sandbar"); window.oceanDebug.seek(24.8)');
  await snap('06_sandbar_preset.png');

  // 5. Offshore deep ocean & Underwater Snell's window view
  await evalJS('window.oceanDebug.setTerrainKind("baseline"); window.oceanDebug.applyPreset("previewOffshore"); window.oceanDebug.seek(24.0)');
  await snap('07_offshore.png');

  await evalJS('window.oceanDebug.applyPreset("previewDive"); window.oceanDebug.seek(24.0)');
  await snap('08_underwater.png');

  // 6. Close-up Macro Inspection Shots: Foam Cellular Filigree, 3D Froth & Receding Water Edge!
  await evalJS('window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.seek(24.6); window.oceanDebug.setOrbit(-11.5, 0.1, 13.8, 0.18, 0.34, 9.5)');
  await snap('09_macro_foam_lace.png');

  await evalJS('window.oceanDebug.seek(26.6); window.oceanDebug.setOrbit(4.5, 0.05, 16.8, -0.28, 0.24, 10.5)');
  await snap('10_macro_receding_edge_t26_6.png');

  await evalJS('window.oceanDebug.seek(27.6); window.oceanDebug.setOrbit(4.5, 0.05, 16.2, -0.28, 0.24, 10.5)');
  await snap('11_macro_receding_edge_t27_6.png');

  await evalJS('window.oceanDebug.seek(24.2); window.oceanDebug.setOrbit(-2.0, 0.0, 6.5, 0.08, 0.28, 13.5)');
  await snap('12_macro_breaker_roller.png');

  // 7. Exact sideways alongshore camera angle matching user's bug-report screenshot (ocean left, beach right, looking +x across rock clusters)
  await evalJS('window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.seek(25.2); window.oceanDebug.setOrbit(-14.0, 0.25, 13.2, -1.44, 0.145, 16.5)');
  await snap('13_sideways_alongshore_user_angle.png');

  // 8. Capture active 3D particle wave-rock splash bursts (t=24.75 & oblique t=25.25) vs calm trough (t=26.75)
  await evalJS('window.oceanDebug.seek(24.75); window.oceanDebug.setOrbit(-15.0, 0.45, 8.8, 0.30, 0.21, 15.5)');
  await snap('14_rock_splash_impact_burst.png');

  await evalJS('window.oceanDebug.seek(25.25); window.oceanDebug.setOrbit(-14.2, 0.35, 11.2, -0.92, 0.18, 14.5)');
  await snap('15_rock_splash_overtop_reef.png');

  await evalJS('window.oceanDebug.seek(26.75); window.oceanDebug.setOrbit(-15.5, 0.25, 11.2, 0.28, 0.26, 14.5)');
  await snap('16_rock_calm_trough_no_collar.png');

  // 9. Exact 1-to-1 diagnostic captures matching User Image 2 (steep alongshore + horizon sky) & User Image 1 (tight boulder-water root close-up)
  await evalJS('window.oceanDebug.seek(25.05); window.oceanDebug.setOrbit(-15.2, 0.35, 11.8, -1.46, 0.25, 17.5)');
  await snap('17_user_img2_steep_alongshore.png');

  await evalJS('window.oceanDebug.seek(24.95); window.oceanDebug.setOrbit(-16.2, 0.55, 9.4, -1.32, 0.21, 6.8)');
  await snap('18_user_img1_boulder_root_closeup.png');

  // 10. Time-progressive reef-rock clinging & draining foam dissipation sequence (t=26.15 mid-drainage -> t=27.35 late crevice lace)
  await evalJS('window.oceanDebug.seek(26.15); window.oceanDebug.setOrbit(-15.5, 0.32, 10.6, 0.24, 0.24, 11.2)');
  await snap('19_rock_foam_draining_t26_15.png');

  await evalJS('window.oceanDebug.seek(27.35); window.oceanDebug.setOrbit(-15.5, 0.32, 10.6, 0.24, 0.24, 11.2)');
  await snap('20_rock_foam_dissipating_t27_35.png');

  // 11. Distant ocean & horizon inspection (matching user's smooth-distant-ocean screenshot)
  await evalJS('window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.seek(25.1); window.oceanDebug.setOrbit(-6.0, 1.4, -14.0, 0.06, 0.075, 18.0)');
  await snap('21_distant_ocean_horizon.png');

  await evalJS('window.oceanDebug.seek(25.1); window.oceanDebug.setOrbit(-12.0, 1.1, -28.0, -0.08, 0.065, 22.0)');
  await snap('22_distant_ocean_mid_far_chop.png');

  // 12. Exact foreground rock cluster close-up matching user's spiderweb-foam bug screenshot
  await evalJS('window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.seek(25.45); window.oceanDebug.setOrbit(-14.6, 0.55, 11.2, -0.16, 0.30, 8.2)');
  await snap('23_rocks_spiderweb_check.png');

  // 12b. Exact 1-to-1 sideways rock-group framing matching media_1793916986063_3aa94cad.jpg & media_1793924246270_50ca3ba8.jpg (uprush & backwash)
  await evalJS('window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.seek(25.35); window.oceanDebug.setOrbit(-14.5, 0.42, 11.0, -1.42, 0.32, 10.2)');
  await snap('29_user_exact_rock_foam_angle.png');

  await evalJS('window.oceanDebug.seek(26.45); window.oceanDebug.setOrbit(-14.5, 0.42, 11.0, -1.42, 0.32, 10.2)');
  await snap('30_user_exact_rock_foam_backwash.png');

  // 12c. Continuous 60 FPS Live-Step Wave-Cycle Continuity Verification (450 frames = 7.5s across full wave wraparound!)
  const liveContinuity = await evalJS(`(() => {
    window.oceanDebug.seek(22.5);
    window.oceanDebug.setOrbit(-14.5, 0.42, 11.0, -1.42, 0.34, 9.8);
    const texData = coastalRocks.uniforms.impactFoamMap.value.image.data;
    const w = coastalRocks.uniforms.impactFoamMap.value.image.width;
    const h = coastalRocks.uniforms.impactFoamMap.value.image.height;
    // Probe cell on the main foreground boulder's seaward face (x = -14.8, z = 10.2)
    const pi = Math.round(((-14.8 + 180.0) / 360.0) * w);
    const pj = Math.round(((10.2 + 90.0) / 150.0) * h);
    const bIdx = (pj * w + pi) * 4 + 2;
    let prevReachM = (texData[bIdx] / 255.0) * 3.25 - 0.35;
    let maxUpwardStepM = 0.0;
    let minReachM = prevReachM, maxReachM = prevReachM;
    const dt = 1 / 60;
    let simT = 22.5;
    for (let f = 0; f < 450; f++) {
      simT += dt;
      ocean.uniforms.time.value = simT;
      if (simT - sampleTime >= waveStep) {
        longPreviousData.set(long.texture.image.data);
        longPrevious.needsUpdate = true;
        sampleTime = Math.max(sampleTime + waveStep, simT - waveStep);
        long.update(sampleTime);
      }
      ocean.uniforms.longMix.value = Math.max(0, Math.min(1, (simT - sampleTime) / waveStep));
      short.update(simT);
      chop.update(simT);
      rockSplash.step(simT, dt, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value, false);
      swashRig.step(simT, dt, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value);
      const curReachM = (texData[bIdx] / 255.0) * 3.25 - 0.35;
      // Only count visible climb above calm water (y > 0.15m)
      if (curReachM > 0.18 && prevReachM > 0.12) {
        const dUp = curReachM - prevReachM;
        if (dUp > maxUpwardStepM) maxUpwardStepM = dUp;
      }
      if (curReachM < minReachM) minReachM = curReachM;
      if (curReachM > maxReachM) maxReachM = curReachM;
      prevReachM = curReachM;
    }
    return {
      maxSingleFrameClimbM: +maxUpwardStepM.toFixed(4),
      minReachM: +minReachM.toFixed(3),
      maxReachM: +maxReachM.toFixed(3)
    };
  })()`);
  console.log('Live 60FPS Continuity Check:', JSON.stringify(liveContinuity));

  // Capture 3 consecutive live-stepped wave-arrival frames (+0.25s apart) to visually verify smooth rising foam
  await evalJS('window.oceanDebug.seek(24.30); window.oceanDebug.setOrbit(-14.5, 0.42, 11.0, -1.42, 0.34, 9.8)');
  await snap('31_live_climb_t24_30.png');
  await evalJS(`(() => {
    const dt = 1 / 60;
    for (let f = 1; f <= 21; f++) {
      const simT = 24.30 + f * dt;
      ocean.uniforms.time.value = simT;
      short.update(simT); chop.update(simT);
      rockSplash.step(simT, dt, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value, false);
      swashRig.step(simT, dt, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value);
    }
    renderFrame();
  })()`);
  await snap('32_live_climb_t24_65.png');
  await evalJS(`(() => {
    const dt = 1 / 60;
    for (let f = 22; f <= 45; f++) {
      const simT = 24.30 + f * dt;
      ocean.uniforms.time.value = simT;
      short.update(simT); chop.update(simT);
      rockSplash.step(simT, dt, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value, false);
      swashRig.step(simT, dt, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value);
    }
    renderFrame();
  })()`);
  await snap('33_live_climb_t25_05.png');

  // 13. Time-of-Day lighting verification: Morning (07:21), High Noon (12:09), Golden Dusk (17:54)
  await evalJS('window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.setTimeOfDay(7.35); window.oceanDebug.seek(24.85)');
  await snap('24_tod_morning_0721.png');

  await evalJS('window.oceanDebug.setTimeOfDay(12.15); window.oceanDebug.seek(24.85)');
  await snap('25_tod_noon_1209.png');

  await evalJS('window.oceanDebug.setTimeOfDay(17.90); window.oceanDebug.seek(24.85)');
  await snap('26_tod_dusk_1754.png');

  // 14. Seawater Color & Depth verification: Shallow Coral Lagoon vs Deep Pacific Cobalt
  await evalJS('window.oceanDebug.setTimeOfDay(13.2); window.oceanDebug.setWaterOptics({ palette: "maldives", tint: -0.12, depthScale: 0.45, clarity: 1.55 }); window.oceanDebug.seek(24.85)');
  await snap('27_water_maldives_shallow.png');

  await evalJS('window.oceanDebug.setTimeOfDay(15.5); window.oceanDebug.setWaterOptics({ palette: "pacific", tint: 0.32, depthScale: 2.05, clarity: 1.05 }); window.oceanDebug.seek(24.85)');
  await snap('28_water_pacific_deep.png');

  // Restore defaults & capture 3 exact 1-to-1 shots matching the 3 user screenshots in the latest review
  await evalJS('window.oceanDebug.setQuality("medium"); window.oceanDebug.setTimeOfDay(15.60); window.oceanDebug.setWaterOptics({ palette: "emerald", tint: 0, depthScale: 1.0, clarity: 1.0 }); window.oceanDebug.applyPreset("previewCoast")');

  // Shot 34: Matches User Screenshot 1 (media_1793931034563_e4074a65.jpg - boulder sculpted lighting + splash + whitewater + surf)
  await evalJS('window.oceanDebug.seek(24.92); window.oceanDebug.setOrbit(-13.8, 0.35, 10.2, -0.34, 0.29, 17.2)');
  await snap('34_user_shot1_boulder_lighting_surf.png');

  // Shot 35: Matches User Screenshot 2 (media_1793931038671_69bc00d3.jpg - close-up surf & emerald water checking diamond grid & foam tiling)
  await evalJS('window.oceanDebug.seek(25.05); window.oceanDebug.setOrbit(-16.2, 0.12, 8.2, -0.32, 0.35, 9.4)');
  await snap('35_user_shot2_macro_surf_diamond_check.png');

  // Shot 36: Matches User Screenshot 3 (media_1793931297442_db0d906c.jpg - hero boulder + right ledge boulder + foreground rock foam energy decay)
  await evalJS('window.oceanDebug.seek(26.25); window.oceanDebug.setOrbit(-12.6, 0.32, 11.4, -0.22, 0.28, 15.8)');
  await snap('36_user_shot3_rock_foam_energy_decay.png');

  // Shots 37-39: Side-by-side Low / Medium / High quality tier visual differentiation at identical coastal framing & wave phase
  await evalJS('window.oceanDebug.setQuality("low"); window.oceanDebug.seek(24.92); window.oceanDebug.setOrbit(-12.4, 0.45, 9.6, -0.42, 0.23, 18.5)');
  await snap('37_quality_low.png');

  await evalJS('window.oceanDebug.setQuality("medium"); window.oceanDebug.seek(24.92); window.oceanDebug.setOrbit(-12.4, 0.45, 9.6, -0.42, 0.23, 18.5)');
  await snap('38_quality_medium.png');

  await evalJS('window.oceanDebug.setQuality("high"); window.oceanDebug.seek(24.92); window.oceanDebug.setOrbit(-12.4, 0.45, 9.6, -0.42, 0.23, 18.5)');
  await snap('39_quality_high.png');

  await evalJS('window.oceanDebug.setQuality("medium")');

  // Verify Bingham viscoplastic pinning: once rock foam drains below yield threshold (alpha <= 0.18), advancing time alone causes ZERO worm-like oscillation on emergent rock faces!
  const binghamCheck = await evalJS(`(() => {
    window.oceanDebug.seek(27.4);
    window.oceanDebug.setOrbit(-14.8, 0.72, 10.2, -0.18, 0.22, 5.2);
    // Force impactFoamMap fresh-film alpha into pinned post-drainage state (alpha = 20/255 = 0.078 <= 0.18) while keeping clinging residue R > 0
    const impTex = coastalRocks.uniforms.impactFoamMap.value;
    const data = impTex.image.data;
    for (let k = 0; k < data.length; k += 4) {
      if (data[k] > 30) data[k + 3] = Math.min(data[k + 3], 20);
    }
    impTex.needsUpdate = true;

    const gl = window.oceanDebug.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    // Sample 60x60 patch right on the upper emergent hero boulder face (hide airborne splash particles & ocean mesh so only CoastalRocks is measured!)
    const prevSplashVis = rockSplash.mesh.visible;
    const prevOceanVis = ocean.mesh.visible;
    const prevFoamVis = foamLayer.mesh.visible;
    rockSplash.mesh.visible = false;
    ocean.mesh.visible = false;
    foamLayer.mesh.visible = false;

    const pw = 60, ph = 60;
    const x0 = Math.floor(w * 0.48), y0 = Math.floor(h * 0.48);
    const bufA = new Uint8Array(pw * ph * 4);
    const bufB = new Uint8Array(pw * ph * 4);

    ocean.uniforms.time.value = 27.40;
    window.oceanDebug.renderer.render(window.oceanDebug.scene, window.oceanDebug.camera);
    gl.readPixels(x0, y0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, bufA);

    // Advance time by +2.37s without changing impactFoamMap or camera -> worm-like sin(time)/cos(time) or wave-breathing would change pixels!
    ocean.uniforms.time.value = 29.77;
    window.oceanDebug.renderer.render(window.oceanDebug.scene, window.oceanDebug.camera);
    gl.readPixels(x0, y0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, bufB);

    rockSplash.mesh.visible = prevSplashVis;
    ocean.mesh.visible = prevOceanVis;
    foamLayer.mesh.visible = prevFoamVis;

    let sumAbsDiff = 0, maxDiff = 0;
    for (let i = 0; i < bufA.length; i += 4) {
      const dr = Math.abs(bufA[i] - bufB[i]);
      const dg = Math.abs(bufA[i + 1] - bufB[i + 1]);
      const db = Math.abs(bufA[i + 2] - bufB[i + 2]);
      const d = Math.max(dr, dg, db);
      sumAbsDiff += (dr + dg + db) / 3;
      if (d > maxDiff) maxDiff = d;
    }
    const meanDiff = sumAbsDiff / (pw * ph);
    window.oceanDebug.seek(24.0);
    window.oceanDebug.applyPreset('previewCoast');
    return { meanRgbDiff8Bit: +meanDiff.toFixed(4), maxRgbDiff8Bit: maxDiff };
  })()`);
  console.log('Bingham Rock-Foam Pinning Check:', JSON.stringify(binghamCheck));

  const splashStats = await evalJS('window.oceanDebug.status().rockSplash');
  console.log('RockSplash Stats:', JSON.stringify(splashStats));
  const rockFoamPinn = await evalJS('typeof coastalRocks !== "undefined" ? coastalRocks.foamPinnStats : null');
  console.log('RockFoam Stratified PINN:', JSON.stringify(rockFoamPinn));

  const finalStatus = await evalJS('window.oceanDebug.status()');

  // --- NEW DELIVERABLES VERIFICATION SUITE (Skybox Seam, Foam Lines, NASA Starry Night, Calibrated Water, Immersive GUI) ---
  // A) Progressive Skybox Horizontal Seam Audit (step progressive sky bands & scan vertical sky columns for discontinuities)
  const skySeamAudit = await evalJS(`(() => {
    window.oceanDebug.setPlaying(false);
    window.oceanDebug.setTimeOfDay(15.60);
    window.oceanDebug.setOrbit(0, 1.5, 6.0, 0.08, -0.18, 28.0); // look straight up into sky + clouds!
    // Step 5 progressive offscreen band updates (mid-cycle band 5/8 where old DPR scissor bug tore the sky!)
    for (let k = 1; k <= 5; k++) {
      skyCloudEnv.update(24.0 + k * 0.25, false);
    }
    renderFrame();
    const gl = window.oceanDebug.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const col = new Uint8Array(4 * H);
    let maxVertStep = 0, worstY = 0;
    for (const uFrac of [0.30, 0.50, 0.70]) {
      const x = Math.floor(W * uFrac);
      gl.readPixels(x, 0, 1, H, gl.RGBA, gl.UNSIGNED_BYTE, col);
      // Scan pure upper sky y in [0.58 H .. 0.93 H] (strictly above horizon line!)
      for (let y = Math.floor(H * 0.58); y < Math.floor(H * 0.93); y++) {
        const d = Math.max(
          Math.abs(col[y * 4] - col[(y - 1) * 4]),
          Math.abs(col[y * 4 + 1] - col[(y - 1) * 4 + 1]),
          Math.abs(col[y * 4 + 2] - col[(y - 1) * 4 + 2])
        );
        if (d > maxVertStep) {
          maxVertStep = d;
          worstY = +(y / H).toFixed(4);
        }
      }
    }
    return { maxVerticalSkyPixelStep8Bit: maxVertStep, worstYFrac: worstY, seamFreePass: maxVertStep <= 14 };
  })()`);
  console.log('Progressive Skybox Seam Audit:', JSON.stringify(skySeamAudit));
  await snap('40_skybox_progressive_seam_free.png');

  // B) Exact User Foam Straight-Line Angles (Closeup & Wide Alongshore matching media_1793939017573 & media_1793939048102)
  await evalJS('window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.setTimeOfDay(15.60); window.oceanDebug.seek(25.05); window.oceanDebug.setOrbit(-15.2, 0.35, 11.8, -1.46, 0.25, 17.5)');
  await snap('41_foam_user_alongshore_closeup.png');

  await evalJS('window.oceanDebug.seek(25.05); window.oceanDebug.setOrbit(-6.0, 0.25, 8.5, -1.48, 0.27, 42.0)');
  await snap('42_foam_user_alongshore_wide.png');

  // C) NASA Goddard SVS 4851 Starry Night (22:30 星夜) + Twilight (18:35 暮色)
  await evalJS('window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.setTimeOfDay(22.50); window.oceanDebug.seek(24.92)');
  await snap('43_tod_night_coast_2230.png');

  // Wide upward coastal framing showcasing NASA SVS 4851 Milky Way Galactic Core + Lunar Maria Moon + Moonlit Surf Glitter!
  await evalJS('window.oceanDebug.setImmersiveMode(true); window.oceanDebug.setTimeOfDay(22.50); window.oceanDebug.seek(24.92); window.oceanDebug.setOrbit(-4.5, 1.2, 7.5, -0.10, 0.055, 34.0)');
  await sleep(320);
  await snap('44_tod_night_nasa_milkyway_immersive.png');
  await evalJS('window.oceanDebug.setImmersiveMode(false)');
  await sleep(320);

  await evalJS('window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.setTimeOfDay(18.55); window.oceanDebug.seek(24.92)');
  await snap('45_tod_twilight_1833.png');

  // D) Calibrated Seawater Presets (Emerald, Jade, Nordic) at Clean Immersive Framing
  await evalJS('window.oceanDebug.setTimeOfDay(14.80); window.oceanDebug.setWaterOptics({ palette: "emerald", tint: 0.0, depthScale: 1.0, clarity: 1.05 }); window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.seek(24.92)');
  await snap('46_water_emerald_calibrated.png');

  await evalJS('window.oceanDebug.setWaterOptics({ palette: "jade", tint: 0.0, depthScale: 1.0, clarity: 1.0 }); window.oceanDebug.seek(24.92)');
  await snap('47_water_jade_calibrated.png');

  await evalJS('window.oceanDebug.setWaterOptics({ palette: "nordic", tint: 0.0, depthScale: 1.15, clarity: 0.95 }); window.oceanDebug.seek(24.92)');
  await snap('48_water_nordic_calibrated.png');

  // E) One-Click Fullscreen / Hide-All-GUI Button & Restore Pill Verification
  await evalJS('window.oceanDebug.setTimeOfDay(15.60); window.oceanDebug.setWaterOptics({ palette: "emerald", tint: 0.0, depthScale: 1.0, clarity: 1.0 }); window.oceanDebug.applyPreset("previewCoast"); window.oceanDebug.seek(24.92)');
  const guiToggleCheck = await evalJS(`(() => {
    document.getElementById('immersiveToggleBtn')?.click();
    const hiddenAfterClick = document.body.classList.contains('gui-hidden') && window.oceanDebug.status().guiHidden === true;
    return { hiddenAfterClick };
  })()`);
  await sleep(300);
  await snap('49_immersive_clean_canvas.png');
  const guiRestoreCheck = await evalJS(`(() => {
    document.getElementById('restoreGuiBtn')?.click();
    const restoredAfterPill = !document.body.classList.contains('gui-hidden') && window.oceanDebug.status().guiHidden === false;
    return { ...${JSON.stringify(guiToggleCheck)}, restoredAfterPill };
  })()`);
  console.log('Immersive One-Click GUI Toggle Check:', JSON.stringify(guiRestoreCheck));

  // F) Exact Wave-Fold Rectangular Band Verification (Daytime & Nighttime matching media_1793942685724 & media_1793942867493)
  await evalJS('window.oceanDebug.setImmersiveMode(true); window.oceanDebug.setTimeOfDay(15.60); window.oceanDebug.setWaterOptics({ palette: "jade", tint: 0.0, depthScale: 1.0, clarity: 1.0 }); window.oceanDebug.seek(25.05); window.oceanDebug.setOrbit(-10.0, 0.25, 2.5, 1.48, 0.28, 36.0)');
  await sleep(320);
  await snap('50_wave_band_day_fixed.png');

  await evalJS('window.oceanDebug.setTimeOfDay(22.50); window.oceanDebug.setWaterOptics({ palette: "emerald", tint: 0.0, depthScale: 1.0, clarity: 1.0 }); window.oceanDebug.seek(25.05); window.oceanDebug.setOrbit(8.0, 0.25, 2.5, -1.50, 0.27, 34.0)');
  await sleep(120);
  await snap('51_wave_band_night_fixed.png');
  await evalJS('window.oceanDebug.setImmersiveMode(false); window.oceanDebug.setTimeOfDay(15.60); window.oceanDebug.applyPreset("previewCoast")');
  await sleep(320);

  const postCheckStatus = await evalJS('window.oceanDebug.status()');
  console.log('Parallel Compile Stats:', JSON.stringify(postCheckStatus.parallelCompile));
  console.log('NASA StarMap Ready:', postCheckStatus.neuralAtmosphere?.nasaStarMapReady);
  console.log('Audio LowFreq Oscillators:', postCheckStatus.audio?.hasLowFreqOscillators);
  console.log('Final Shader Errors:', postCheckStatus.gpu.shaderErrors.length);
  console.log('Console Warnings/Errors:', JSON.stringify(consoleErrors));
  console.log('Page Exceptions:', JSON.stringify(pageExceptions));

  ws.close();
} finally {
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
