/**
 * Real-Time Zero-Stall GPU / CPU / VRAM / RAM / FPS Telemetry & Profiling Module (PerfMonitor.js).
 *
 * Features:
 *  1. Non-blocking WebGL2 Hardware GPU Timer (`EXT_disjoint_timer_query_webgl2`) using a 6-slot async query ring buffer.
 *  2. Rolling 120-frame FPS, 1% Low FPS (P99 frame time), and per-subsystem CPU execution breakdown.
 *  3. Exact GPU VRAM footprint estimator (Textures, Mipmaps, MSAA RenderTargets, Depth24, VBO/IBO/Instanced buffers).
 *  4. Live JS Heap RAM (`performance.memory`) + deterministic Engine TypedArray RAM accounting.
 *  5. Zero-GC HUD updater (4 Hz text throttling + lightweight 1px-scrolling 2D Canvas sparkline).
 */
export function createPerfMonitor(THREE, renderer) {
  const gl = renderer.getContext();
  const isWebGL2 = !!renderer.capabilities?.isWebGL2;
  const timerExt = isWebGL2 ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;

  // Enable full-frame multi-pass draw call & triangle accumulation across DepthCapture + Main + Bloom + Post
  if (renderer.info) {
    renderer.info.autoReset = false;
  }

  // 6-slot asynchronous GPU query ring buffer (prevents pipeline stalls!)
  const QUERY_RING_SIZE = 6;
  const queryRing = [];
  let queryWriteIdx = 0;
  let activeQuery = null;
  if (timerExt) {
    for (let i = 0; i < QUERY_RING_SIZE; i++) {
      queryRing.push({ query: gl.createQuery(), pending: false });
    }
  }

  // Rolling 120-frame history for accurate avg FPS & 1% Low FPS
  const HIST_LEN = 120;
  const frameDtHist = new Float32Array(HIST_LEN);
  const sortScratch = new Float32Array(HIST_LEN);
  let histIdx = 0;
  let histCount = 0;

  // Smoothed live telemetry accumulators & Max FPS / Frame-Cap state
  let smoothFrameMs = 16.67;
  let smoothCpuTotalMs = 0.0;
  let smoothCpuWavesMs = 0.0;
  let smoothCpuSplashMs = 0.0;
  let smoothCpuSwashMs = 0.0;
  let smoothCpuRenderMs = 0.0;
  let smoothGpuMs = 0.0;
  let gpuTimerValid = false;
  let peakFps = 0;
  let fpsCap = 0;
  let warmupFrames = 0;
  let lastQuerySampleNow = 0;
  let lastSparkDrawNow = 0;
  const SPARK_BARS = 117;
  const sparkCpuHist = new Float32Array(SPARK_BARS);
  const sparkFrameHist = new Float32Array(SPARK_BARS);
  let sparkHead = 0;
  let sparkFilled = 0;

  // Per-frame raw timestamps
  let lastBeginNow = -1;
  let frameStartNow = 0;
  let markNow = 0;
  let curWavesMs = 0;
  let curSplashMs = 0;
  let curSwashMs = 0;
  let curRenderMs = 0;
  let renderedInFrame = false;
  let lastDrawCalls = 0;
  let lastTriangles = 0;

  // Registered VRAM & Engine TypedArray registries (deduplicated)
  const trackedGeometries = new Set();
  const trackedTextures = new Set();
  const trackedRenderTargets = new Map(); // key -> { getTarget, label }
  let extraEngineTypedBytes = 0;
  let cachedVramMB = 0;
  let cachedVramTexMB = 0;
  let cachedVramGeoMB = 0;
  let cachedEngineTypedMB = 0;

  // Cache HUD DOM elements once
  const elHud = document.getElementById('perfHud');
  const elToggle = document.getElementById('perfToggleBtn');
  const elBody = document.getElementById('perfHudBody');
  const elFps = document.getElementById('perfFpsVal');
  const elFpsMax = document.getElementById('perfFpsMaxVal');
  const elFpsLow = document.getElementById('perfFpsLowVal');
  const elPotFps = document.getElementById('perfPotFpsVal');
  const elFpsCap = document.getElementById('perfFpsCap');
  const elFrameMs = document.getElementById('perfFrameMsVal');
  const elGpuMs = document.getElementById('perfGpuMsVal');
  const elVram = document.getElementById('perfVramVal');
  const elCpuMs = document.getElementById('perfCpuMsVal');
  const elCpuSub = document.getElementById('perfCpuSubVal');
  const elRam = document.getElementById('perfRamVal');
  const elRamSub = document.getElementById('perfRamSubVal');
  const elPipe = document.getElementById('perfPipeVal');
  const elCanvas = document.getElementById('perfSparkline');
  const ctx2d = elCanvas ? elCanvas.getContext('2d', { alpha: false }) : null;

  let collapsed = false;
  if (elToggle && elBody) {
    elToggle.onclick = () => {
      collapsed = !collapsed;
      elBody.hidden = collapsed;
      elToggle.textContent = collapsed ? '展開' : '收合';
    };
  }
  if (elFpsMax) {
    elFpsMax.onclick = () => {
      peakFps = 0;
      warmupFrames = 0;
      elFpsMax.textContent = '--';
    };
  }
  let onCapChangeCb = null;
  if (elFpsCap) {
    elFpsCap.onchange = () => {
      fpsCap = Math.max(0, Number(elFpsCap.value) || 0);
      peakFps = 0;
      warmupFrames = 0;
      histIdx = 0;
      histCount = 0;
      if (onCapChangeCb) onCapChangeCb(fpsCap);
    };
  }

  if (ctx2d && elCanvas) {
    ctx2d.fillStyle = '#071520';
    ctx2d.fillRect(0, 0, elCanvas.width, elCanvas.height);
  }

  function bytesPerPixel(format, type) {
    let channels = 4;
    if (format === THREE.RedFormat || format === THREE.AlphaFormat || format === THREE.DepthFormat) channels = 1;
    else if (format === THREE.RGFormat) channels = 2;
    else if (format === THREE.RGBFormat) channels = 3;

    if (type === THREE.FloatType) return channels * 4;
    if (type === THREE.HalfFloatType) return channels * 2;
    if (type === THREE.UnsignedIntType || type === THREE.UnsignedInt248Type) return 4;
    if (type === THREE.UnsignedShortType) return channels * 2;
    return channels * 1;
  }

  function estimateTextureBytes(tex) {
    if (!tex || !tex.image) return 0;
    const w = tex.image.width || tex.source?.data?.width || 0;
    const h = tex.image.height || tex.source?.data?.height || 0;
    const d = tex.image.depth || 1;
    if (w <= 0 || h <= 0) return 0;
    const bpp = bytesPerPixel(tex.format, tex.type);
    const mipFactor = tex.generateMipmaps ? 1.3333 : 1.0;
    return Math.round(w * h * d * bpp * mipFactor);
  }

  function estimateRenderTargetBytes(rt) {
    if (!rt || !rt.width || !rt.height) return 0;
    const w = rt.width, h = rt.height;
    const msaa = Math.max(1, rt.samples || 0);
    const colorBpp = bytesPerPixel(rt.texture?.format, rt.texture?.type);
    const mipFactor = rt.texture?.generateMipmaps ? 1.3333 : 1.0;
    let total = w * h * colorBpp * mipFactor * msaa;
    if (rt.depthBuffer) {
      total += w * h * 4 * msaa; // 24-bit depth / 8-bit stencil or 32-bit depth
    }
    if (msaa > 1) {
      // Resolved single-sample color attachment alongside MSAA renderbuffer
      total += w * h * colorBpp * mipFactor;
    }
    return Math.round(total);
  }

  function estimateGeometryBytes(geo) {
    if (!geo || !geo.attributes) return 0;
    let bytes = 0;
    const attrs = geo.attributes;
    for (const key in attrs) {
      const a = attrs[key];
      if (a?.array?.byteLength) bytes += a.array.byteLength;
    }
    if (geo.index?.array?.byteLength) {
      bytes += geo.index.array.byteLength;
    }
    return bytes;
  }

  function refreshMemoryEstimates() {
    let geoBytes = 0;
    for (const g of trackedGeometries) geoBytes += estimateGeometryBytes(g);

    let texBytes = 0;
    for (const t of trackedTextures) texBytes += estimateTextureBytes(t);

    for (const getter of trackedRenderTargets.values()) {
      const res = getter();
      if (!res) continue;
      if (Array.isArray(res)) {
        for (let i = 0; i < res.length; i++) texBytes += estimateRenderTargetBytes(res[i]);
      } else {
        texBytes += estimateRenderTargetBytes(res);
      }
    }

    // Account for screen drawing buffer (front + back + depth/MSAA)
    const dbW = gl.drawingBufferWidth || innerWidth;
    const dbH = gl.drawingBufferHeight || innerHeight;
    const backbufferBytes = dbW * dbH * 4 * 3; // front + back + depth24

    cachedVramGeoMB = geoBytes / (1024 * 1024);
    cachedVramTexMB = (texBytes + backbufferBytes) / (1024 * 1024);
    cachedVramMB = cachedVramGeoMB + cachedVramTexMB;
    cachedEngineTypedMB = (geoBytes + extraEngineTypedBytes) / (1024 * 1024);
  }

  function pollGpuQueries() {
    if (!timerExt) return;
    let checkedDisjoint = false;
    let disjoint = false;
    for (let i = 0; i < QUERY_RING_SIZE; i++) {
      const slot = queryRing[i];
      if (!slot.pending) continue;
      const available = gl.getQueryParameter(slot.query, gl.QUERY_RESULT_AVAILABLE);
      if (available) {
        if (!checkedDisjoint) {
          disjoint = !!gl.getParameter(timerExt.GPU_DISJOINT_EXT);
          checkedDisjoint = true;
        }
        if (!disjoint) {
          const ns = gl.getQueryParameter(slot.query, gl.QUERY_RESULT);
          const ms = ns / 1e6;
          if (ms > 0 && ms < 250) {
            smoothGpuMs = gpuTimerValid ? (smoothGpuMs * 0.82 + ms * 0.18) : ms;
            gpuTimerValid = true;
          }
        }
        slot.pending = false;
      }
    }
  }

  function beginFrame(isPlaying = true) {
    const now = performance.now();
    if (isPlaying && lastBeginNow > 0) {
      const dtMs = now - lastBeginNow;
      if (dtMs > 0.2 && dtMs < 500) {
        frameDtHist[histIdx] = dtMs;
        histIdx = (histIdx + 1) % HIST_LEN;
        if (histCount < HIST_LEN) histCount++;
        smoothFrameMs = smoothFrameMs * 0.88 + dtMs * 0.12;
        warmupFrames++;
        if (warmupFrames >= 75 && histCount >= 60) {
          const steadyFps = Math.min(999, Math.round(1000 / Math.max(1.0, getAverageFrameMs())));
          if (steadyFps > peakFps) peakFps = steadyFps;
        }
      }
    }
    lastBeginNow = isPlaying ? now : -1;
    frameStartNow = now;
    markNow = now;
    curWavesMs = 0;
    curSplashMs = 0;
    curSwashMs = 0;
    curRenderMs = 0;
    renderedInFrame = false;
  }

  function markSection(kind) {
    const now = performance.now();
    const elapsed = Math.max(0, now - markNow);
    markNow = now;
    if (kind === 'waves') curWavesMs += elapsed;
    else if (kind === 'splash') curSplashMs += elapsed;
    else if (kind === 'swash') curSwashMs += elapsed;
    else if (kind === 'render') curRenderMs += elapsed;
  }

  function beginGpuRender() {
    const now = performance.now();
    markNow = now;
    if (renderer.info) {
      renderer.info.reset();
    }
    if (!timerExt || activeQuery || now - lastQuerySampleNow < 75) return;
    pollGpuQueries();
    const slot = queryRing[queryWriteIdx];
    if (!slot.pending) {
      lastQuerySampleNow = now;
      gl.beginQuery(timerExt.TIME_ELAPSED_EXT, slot.query);
      activeQuery = slot;
      queryWriteIdx = (queryWriteIdx + 1) % QUERY_RING_SIZE;
    }
  }

  function endGpuRender() {
    if (timerExt && activeQuery) {
      gl.endQuery(timerExt.TIME_ELAPSED_EXT);
      activeQuery.pending = true;
      activeQuery = null;
    }
    if (renderer.info?.render) {
      lastDrawCalls = renderer.info.render.calls;
      lastTriangles = renderer.info.render.triangles;
    }
    renderedInFrame = true;
    markSection('render');
  }

  let lastDomUpdateNow = 0;
  let sparkTick = 0;

  function getAverageFrameMs() {
    if (histCount === 0) return smoothFrameMs;
    let sum = 0;
    for (let i = 0; i < histCount; i++) sum += frameDtHist[i];
    return sum / histCount;
  }

  function compute1PercentLowFps() {
    if (histCount < 8) return Math.round(1000 / Math.max(1, getAverageFrameMs()));
    for (let i = 0; i < histCount; i++) sortScratch[i] = frameDtHist[i];
    const sub = sortScratch.subarray(0, histCount);
    sub.sort();
    // P98/P99 worst frame duration -> 1% Low FPS
    const p99Idx = Math.min(histCount - 1, Math.floor(histCount * 0.98));
    const worstMs = Math.max(1.0, sub[p99Idx]);
    return Math.round(1000 / worstMs);
  }

  function recordSparkSample(cpuMs, gpuOrFrameMs) {
    sparkCpuHist[sparkHead] = Math.min(33.3, Math.max(0.2, cpuMs));
    sparkFrameHist[sparkHead] = Math.min(33.3, Math.max(0.4, gpuOrFrameMs));
    sparkHead = (sparkHead + 1) % SPARK_BARS;
    if (sparkFilled < SPARK_BARS) sparkFilled++;
  }

  function renderSparklineCanvas() {
    if (!ctx2d || !elCanvas || collapsed || sparkFilled === 0) return;
    const w = elCanvas.width, h = elCanvas.height;
    ctx2d.fillStyle = '#071520';
    ctx2d.fillRect(0, 0, w, h);

    // 16.67ms (60 FPS) subtle guide line at 50% height (scale 0..33.3ms)
    const y60 = Math.round(h - (16.67 / 33.33) * h);
    ctx2d.fillStyle = 'rgba(135, 195, 220, 0.22)';
    for (let x = 0; x < w; x += 6) ctx2d.fillRect(x, y60, 3, 1);

    const startSlot = sparkFilled === SPARK_BARS ? sparkHead : 0;
    const xOffset = (SPARK_BARS - sparkFilled) * 2;
    for (let k = 0; k < sparkFilled; k++) {
      const idx = (startSlot + k) % SPARK_BARS;
      const fVal = sparkFrameHist[idx];
      const cVal = sparkCpuHist[idx];
      const hFrame = Math.max(1, Math.round((fVal / 33.33) * (h - 2)));
      const hCpu = Math.max(1, Math.round((cVal / 33.33) * (h - 2)));
      const x = xOffset + k * 2;
      ctx2d.fillStyle = fVal > 18.0 ? 'rgba(255, 138, 101, 0.68)' : 'rgba(72, 206, 228, 0.52)';
      ctx2d.fillRect(x, h - hFrame, 2, hFrame);
      ctx2d.fillStyle = '#9ef3d8';
      ctx2d.fillRect(x, Math.max(0, h - hCpu - 1), 2, 2);
    }
  }

  function endFrame(sideFrameStatusEl = null) {
    const now = performance.now();
    if (renderedInFrame) {
      const totalCpu = Math.max(0, now - frameStartNow);
      smoothCpuTotalMs = smoothCpuTotalMs === 0 ? totalCpu : (smoothCpuTotalMs * 0.85 + totalCpu * 0.15);
      smoothCpuWavesMs = smoothCpuWavesMs * 0.85 + curWavesMs * 0.15;
      smoothCpuSplashMs = smoothCpuSplashMs * 0.85 + curSplashMs * 0.15;
      smoothCpuSwashMs = smoothCpuSwashMs * 0.85 + curSwashMs * 0.15;
      smoothCpuRenderMs = smoothCpuRenderMs * 0.85 + curRenderMs * 0.15;

      sparkTick++;
      if ((sparkTick & 1) === 0) {
        recordSparkSample(smoothCpuTotalMs, gpuTimerValid ? Math.max(smoothGpuMs, smoothCpuTotalMs) : smoothFrameMs);
      }
      if (now - lastSparkDrawNow >= 85) {
        lastSparkDrawNow = now;
        renderSparklineCanvas();
      }
    }

    // Throttle text DOM updates to 4 Hz (every 250ms) -> zero layout/GC overhead!
    if (now - lastDomUpdateNow >= 250) {
      lastDomUpdateNow = now;
      pollGpuQueries();
      refreshMemoryEstimates();

      const avgMs = getAverageFrameMs();
      const fps = Math.min(999, Math.round(1000 / Math.max(1.0, avgMs)));
      if (warmupFrames >= 75 && histCount >= 60 && fps > peakFps) peakFps = fps;
      const low1 = Math.min(fps, compute1PercentLowFps());
      const bottleneckMs = Math.max(0.4, smoothCpuTotalMs, gpuTimerValid ? smoothGpuMs : smoothCpuRenderMs);
      const potentialFps = Math.min(999, Math.max(fps, Math.round(1000 / bottleneckMs)));

      if (sideFrameStatusEl && renderedInFrame && histCount > 0) {
        sideFrameStatusEl.textContent = fpsCap > 0 ? `${fps}/${fpsCap} fps` : `${fps} fps`;
      }
      if (!elHud) return;

      if (renderedInFrame && histCount > 0) {
        if (elFps) {
          elFps.textContent = String(fps);
          const okThresh = fpsCap > 0 ? Math.min(55, Math.round(fpsCap * 0.90)) : 55;
          elFps.style.color = fps >= okThresh ? '#7ef4cc' : (fps >= 28 ? '#ffd479' : '#ff8e8e');
        }
        if (elFpsMax) elFpsMax.textContent = String(Math.max(peakFps, fps));
        if (elFpsLow) elFpsLow.textContent = String(low1);
        if (elPotFps) elPotFps.textContent = potentialFps + ' fps';
        if (elFrameMs) elFrameMs.textContent = avgMs.toFixed(1) + ' ms';

        if (elGpuMs) {
          elGpuMs.textContent = gpuTimerValid
            ? smoothGpuMs.toFixed(2) + ' ms'
            : smoothCpuRenderMs.toFixed(2) + ' ms*';
        }
        if (elCpuMs) {
          elCpuMs.textContent = smoothCpuTotalMs.toFixed(2) + ' ms';
        }
        if (elCpuSub) {
          elCpuSub.textContent = `波浪 ${smoothCpuWavesMs.toFixed(2)} · 浪花 ${smoothCpuSplashMs.toFixed(2)} · 渲染 ${smoothCpuRenderMs.toFixed(2)}`;
        }
      }
      if (elVram) {
        elVram.textContent = cachedVramMB.toFixed(1) + ' MB';
      }

      const mem = performance.memory;
      if (elRam) {
        if (mem && mem.usedJSHeapSize > 0) {
          const usedMB = mem.usedJSHeapSize / (1024 * 1024);
          const totMB = mem.totalJSHeapSize / (1024 * 1024);
          elRam.textContent = `${usedMB.toFixed(1)} / ${totMB.toFixed(0)} MB`;
          if (elRamSub) {
            elRamSub.textContent = `JS Heap · 引擎緩衝 ${cachedEngineTypedMB.toFixed(1)} MB`;
          }
        } else {
          elRam.textContent = `${cachedEngineTypedMB.toFixed(1)} MB`;
          if (elRamSub) {
            elRamSub.textContent = `引擎 TypedArray 緩衝區`;
          }
        }
      }

      if (elPipe) {
        const triK = (lastTriangles / 1000).toFixed(1);
        const texCnt = renderer.info?.memory?.textures ?? 0;
        elPipe.textContent = `${lastDrawCalls} Draws · ${triK}K Tris · ${texCnt} Tex`;
      }
    }
  }

  function getSnapshot() {
    refreshMemoryEstimates();
    const mem = performance.memory;
    const avgMs = getAverageFrameMs();
    const fps = +(1000 / Math.max(0.5, avgMs)).toFixed(1);
    const bottleneckMs = Math.max(0.4, smoothCpuTotalMs, gpuTimerValid ? smoothGpuMs : smoothCpuRenderMs);
    const fpsPotential = Math.min(999, Math.max(Math.round(fps), Math.round(1000 / bottleneckMs)));
    return {
      fps,
      fpsMax: Math.max(peakFps, Math.round(fps)),
      fpsPotential,
      fpsCap,
      fps1PercentLow: compute1PercentLowFps(),
      frameMs: +avgMs.toFixed(3),
      gpu: {
        hardwareTimerSupported: !!timerExt,
        hardwareTimerActive: gpuTimerValid,
        gpuMs: gpuTimerValid ? +smoothGpuMs.toFixed(3) : null,
        vramTotalMB: +cachedVramMB.toFixed(2),
        vramTexturesMB: +cachedVramTexMB.toFixed(2),
        vramGeometryMB: +cachedVramGeoMB.toFixed(2),
        drawCalls: lastDrawCalls,
        triangles: lastTriangles,
        programs: renderer.info?.programs?.length ?? 0,
        threeTextures: renderer.info?.memory?.textures ?? 0,
        threeGeometries: renderer.info?.memory?.geometries ?? 0
      },
      cpu: {
        totalMs: +smoothCpuTotalMs.toFixed(3),
        wavesFftMs: +smoothCpuWavesMs.toFixed(3),
        splashPinnMs: +smoothCpuSplashMs.toFixed(3),
        swashAudioMs: +smoothCpuSwashMs.toFixed(3),
        renderSubmitMs: +smoothCpuRenderMs.toFixed(3)
      },
      ram: {
        jsHeapSupported: !!(mem && mem.usedJSHeapSize > 0),
        jsHeapUsedMB: mem ? +(mem.usedJSHeapSize / (1024 * 1024)).toFixed(2) : null,
        jsHeapTotalMB: mem ? +(mem.totalJSHeapSize / (1024 * 1024)).toFixed(2) : null,
        jsHeapLimitMB: mem ? +(mem.jsHeapSizeLimit / (1024 * 1024)).toFixed(0) : null,
        engineTypedArraysMB: +cachedEngineTypedMB.toFixed(2)
      }
    };
  }

  return {
    beginFrame,
    markSection,
    beginGpuRender,
    endGpuRender,
    endFrame,
    getSnapshot,
    registerSceneResources(scene, extraTextures = [], renderTargetGetters = {}, typedByteCount = 0) {
      scene.traverse(obj => {
        if (obj.geometry) trackedGeometries.add(obj.geometry);
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        for (const m of mats) {
          if (!m.uniforms) continue;
          for (const uKey in m.uniforms) {
            const val = m.uniforms[uKey]?.value;
            if (val && val.isTexture && val.image) trackedTextures.add(val);
          }
        }
      });
      for (const t of extraTextures) {
        if (t && t.isTexture) trackedTextures.add(t);
      }
      for (const [k, fn] of Object.entries(renderTargetGetters)) {
        trackedRenderTargets.set(k, fn);
      }
      extraEngineTypedBytes = typedByteCount;
      refreshMemoryEstimates();
    },
    addGeometry(geo) {
      if (geo) trackedGeometries.add(geo);
    },
    removeGeometry(geo) {
      if (geo) trackedGeometries.delete(geo);
    },
    refreshMemory() {
      refreshMemoryEstimates();
      if (elVram) elVram.textContent = cachedVramMB.toFixed(1) + ' MB';
      if (elPipe) {
        const calls = renderer.info.render?.calls ?? lastDrawCalls;
        const tris = renderer.info.render?.triangles ?? lastTriangles;
        const texCount = renderer.info.memory?.textures ?? 0;
        elPipe.textContent = `${calls} Draws · ${(tris / 1000).toFixed(1)}K Tris · ${texCount} Tex`;
      }
    },
    resetHistory() {
      histIdx = 0;
      histCount = 0;
      peakFps = 0;
      warmupFrames = 0;
      lastBeginNow = -1;
    },
    getFpsCap: () => fpsCap,
    setFpsCap(cap) {
      fpsCap = Math.max(0, Math.round(Number(cap) || 0));
      if (elFpsCap && String(fpsCap) !== elFpsCap.value) {
        elFpsCap.value = String(fpsCap);
      }
      peakFps = 0;
      warmupFrames = 0;
      histIdx = 0;
      histCount = 0;
      if (onCapChangeCb) onCapChangeCb(fpsCap);
      return fpsCap;
    },
    onFpsCapChange(fn) {
      onCapChangeCb = fn;
    },
    dispose() {
      if (timerExt) {
        for (const slot of queryRing) gl.deleteQuery(slot.query);
      }
    }
  };
}
