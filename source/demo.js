const internalSettings = {};
const $ = id => document.getElementById(id) || (internalSettings[id] ??= { value: '', checked: false, style: {}, textContent: '', classList: { toggle() {}, add() {}, remove() {} } });

function shoreBed(x, z) {
  return shoreBedWithOffshoreSlope(x, z);
}

// --- Bilingual UI Localization (Traditional Chinese `zh` / English `en`) ---
const I18N = {
  zh: {
    loadingSub: '物理導向神經網路與多頻譜海岸流體光學模擬系統',
    loadingStageInit: '正在啟動 WebGL2 光學引擎…',
    shaderStageInit: '多執行緒著色器佇列待命…',
    loadingGpuDetect: '偵測硬體加速裝置中…',
    immersiveBtn: '沉浸畫面',
    immersiveTitle: '隱藏控制介面（快捷鍵 H｜全螢幕 F）',
    btnCollapse: '收合',
    btnExpand: '展開',
    panelSub: '物理導向神經網路・頻譜水動力學・水深輻射傳輸',
    presetCoast: '海岸全景',
    presetRocks: '礁石激浪',
    presetSwash: '沙灘拍岸',
    presetOffshore: '外海深浪',
    presetDive: '水下視角',
    lblTimeOfDay: '日夜時段（晨・午・暮・星夜）',
    todMorning: '晨光',
    todNoon: '正午',
    todAfternoon: '午後',
    todDusk: '黃昏',
    todNight: '星夜',
    todNightTitle: 'NASA SVS 4851 銀河星圖與月光海面',
    lblWaterPalette: '海域水色預設',
    palEmerald: '經典翡翠海岸（預設）',
    palMaldives: '珊瑚琉璃淺灣（蒂芬妮藍綠）',
    palPacific: '太平洋深邃鈷藍（黑潮深藍）',
    palJade: '花東碧玉礦物綠（海岸翠玉）',
    palNordic: '北歐冷冽墨海（冷灰鋼藍）',
    lblWaterTint: '海水色調微調（翠綠 ↔ 鈷藍）',
    lblWaterDepth: '海水深淺表現',
    lblWaterClarity: '海水清澈度',
    lblTerrain: '海岸地形（自動重算水深與折射）',
    terBaseline: '自然彎曲海灣（Baseline）',
    terSandbar: '離岸淺灘沙洲（Sandbar）',
    lblAmplitude: '海浪高度',
    lblFoamBoost: '碎浪與殘泡濃度',
    lblQuality: '渲染畫質等級',
    qualMobile: '行動極速（手機高幀率最佳化）',
    qualLow: '低品質（極速省顯存・核顯流暢）',
    qualMedium: '中品質（均衡標準・推薦）',
    qualHigh: '高品質（極致寫實・2x MSAA 超採樣）',
    lblAudioVol: '海浪與礁石空間音效',
    lblDiveElev: '潛水深度',
    lblDiveTilt: '水下仰俯角',
    btnPause: '暫停播放',
    btnResume: '繼續播放（已暫停）',
    statusPaused: '已暫停',
    audioOn: '音效：開啟',
    audioMuted: '音效：靜音',
    hintDesktop: '滑鼠旋轉・滾輪縮放・H 隱藏介面・F 全螢幕',
    hintMobile: '單指旋轉・雙指縮放視角',
    gpuBooting: '正在啟動 WebGL2 海景…',
    gpuLowSamplers: '警告：貼圖單元不足，部分光學效果可能受限',
    shaderErrPrefix: 'Shader 編譯錯誤：',
    perfAria: '即時效能計數器',
    perfMax: '最大',
    perfMaxTitle: '點擊重置最大峰值 FPS',
    perfCapLabel: '硬體極限',
    perfCapAria: 'FPS 鎖定上限',
    fpsUncapped: '不鎖定',
    perfGpuTime: 'GPU 渲染耗時',
    perfVram: 'GPU 顯存 VRAM',
    perfCpu: 'CPU 邏輯與提交',
    perfRam: 'RAM 記憶體',
    sponsorAria: 'C++ MMORPG 研發日誌與開源贊助',
    sponsorDesc: '本系統為開發中 C++ MMORPG 之海洋物理前瞻原型（正移植原生 C++ 版），以 MIT 開源回饋社群。',
    sponsorX: '追蹤 X 開發日誌 ↗',
    sponsorCta: '贊助 · Sponsor ↗',
    restoreGui: '顯示介面 (H)',
    restoreGuiTitle: '顯示控制面板與效能計數器（快捷鍵 H 或 Esc）',
    bootStage0: '正在啟動 WebGL2 光學管線…',
    shaderQueueStart: '啟動多執行緒 Sobolev-PINN 訓練與場景佇列…',
    bootStage1: '建構神經大氣散射與體積雲天穹…',
    bootStage2: '合成三頻譜 FFT 海洋波場與流體紋理佇列…',
    bootStage3: '雕刻風化海岸礁岩與淺水水深折射場…',
    bootStage4: '建構 3D 礁岩飛沫碰撞系統與後處理管線…',
    bootStage5: '多執行緒平行編譯 GPU 光學與流體著色器…',
    shaderDispatch: '派發非阻塞著色器佇列至 GPU 硬體編譯池…',
    progOffshore: '海洋頻譜與雙層水深折射核心 (Offshore)',
    progRocks: '海岸花崗岩多相水膜 PBR (CoastalRocks)',
    progSeabed: '濕沙水膜與動態色散焦散 (SeabedCaustics)',
    progSky: 'NASA 銀河星圖與天穹投影 (SkyDome)',
    progFoam: '碎浪白沫與捲浪飛沫層 (FoamShader)',
    progSplash: '26 萬介電質水滴折射粒子 (RockSplash)',
    bootStage6: '烘焙流體圖集並合成首幀海岸光學畫面…',
    bootDone: '載入完成・即將進入海岸全景'
  },
  en: {
    loadingSub: 'Physics-Informed Neural & Multi-Spectral Coastal Ocean Simulation',
    loadingStageInit: 'Initializing WebGL2 optical engine…',
    shaderStageInit: 'Multi-threaded shader queue standby…',
    loadingGpuDetect: 'Detecting hardware GPU…',
    immersiveBtn: 'Immersive',
    immersiveTitle: 'Hide UI panels (Shortcut H | Fullscreen F)',
    btnCollapse: 'Hide',
    btnExpand: 'Show',
    panelSub: 'PINN Hydrodynamics · Spectral Waves · Radiative Transfer',
    presetCoast: 'Coast View',
    presetRocks: 'Reef Surf',
    presetSwash: 'Beach Swash',
    presetOffshore: 'Offshore',
    presetDive: 'Underwater',
    lblTimeOfDay: 'Time of Day (Solar & Lunar)',
    todMorning: 'Dawn',
    todNoon: 'Noon',
    todAfternoon: 'Sunny',
    todDusk: 'Dusk',
    todNight: 'Night',
    todNightTitle: 'NASA SVS 4851 Milky Way Star Map & Moonlit Sea',
    lblWaterPalette: 'Seawater Bio-Optical Preset',
    palEmerald: 'Classic Emerald Coast (Default)',
    palMaldives: 'Coral Lagoon (Turquoise)',
    palPacific: 'Deep Pacific Cobalt (Kuroshio)',
    palJade: 'Mineral Jade Coast',
    palNordic: 'Nordic Slate Sea',
    lblWaterTint: 'Color Tint (Emerald ↔ Cobalt)',
    lblWaterDepth: 'Optical Depth Scale',
    lblWaterClarity: 'Water Clarity',
    lblTerrain: 'Coastal Bathymetry Preset',
    terBaseline: 'Natural Curved Bay (Baseline)',
    terSandbar: 'Offshore Sandbar',
    lblAmplitude: 'Wave Amplitude',
    lblFoamBoost: 'Surf & Foam Intensity',
    lblQuality: 'Render Quality',
    qualMobile: 'Mobile Fast (High-FPS Optimized)',
    qualLow: 'Low (VRAM Saver · iGPU)',
    qualMedium: 'Medium (Balanced · Recommended)',
    qualHigh: 'High (Ultra · 2x MSAA)',
    lblAudioVol: 'Spatial Ocean Audio',
    lblDiveElev: 'Dive Depth',
    lblDiveTilt: 'Look Pitch',
    btnPause: 'Pause',
    btnResume: 'Resume (Paused)',
    statusPaused: 'Paused',
    audioOn: 'Audio: On',
    audioMuted: 'Audio: Muted',
    hintDesktop: 'Orbit · Scroll Zoom · H Hide UI · F Full',
    hintMobile: '1-Finger Orbit · Pinch to Zoom',
    gpuBooting: 'Starting WebGL2 coastal engine…',
    gpuLowSamplers: 'Warning: Limited texture units; some optical effects reduced',
    shaderErrPrefix: 'Shader Compile Error: ',
    perfAria: 'Real-Time Performance Telemetry',
    perfMax: 'Max',
    perfMaxTitle: 'Click to reset peak FPS',
    perfCapLabel: 'HW Max',
    perfCapAria: 'FPS Cap Limit',
    fpsUncapped: 'Uncapped',
    perfGpuTime: 'GPU Time',
    perfVram: 'GPU VRAM',
    perfCpu: 'CPU Frame',
    perfRam: 'RAM Memory',
    sponsorAria: 'C++ MMORPG R&D Log & Open-Source Sponsorship',
    sponsorDesc: 'Ocean physics R&D prototype for an upcoming C++ MMORPG (porting to native C++), open-sourced under MIT.',
    sponsorX: 'Follow R&D on X ↗',
    sponsorCta: 'Sponsor R&D ↗',
    restoreGui: 'Show UI (H)',
    restoreGuiTitle: 'Show control panel & telemetry HUD (Shortcut H or Esc)',
    bootStage0: 'Initializing WebGL2 optical pipeline…',
    shaderQueueStart: 'Starting multi-threaded Sobolev-PINN training & scene queue…',
    bootStage1: 'Building neural atmospheric scattering & volumetric sky…',
    bootStage2: 'Synthesizing tri-band FFT wave spectra & fluid atlases…',
    bootStage3: 'Sculpting weathered coastal boulders & bathymetry field…',
    bootStage4: 'Building 3D wave-rock splash system & post-processing…',
    bootStage5: 'Compiling GPU optical & hydrodynamic shaders in parallel…',
    shaderDispatch: 'Dispatching non-blocking shader queue to GPU compiler pool…',
    progOffshore: 'Spectral Ocean & Dual-Layer Refraction (Offshore)',
    progRocks: 'Coastal Granite Wet-Film PBR (CoastalRocks)',
    progSeabed: 'Wet Quartz Sand & Chromatic Caustics (Seabed)',
    progSky: 'NASA Milky Way & Sky Dome Projection (SkyDome)',
    progFoam: 'Breaking Surf & Foam Filigree Layer (FoamShader)',
    progSplash: '260K Dielectric Spray Droplets (RockSplash)',
    bootStage6: 'Baking fluid atlases & rendering initial coastal frame…',
    bootDone: 'Ready · Entering Coastal Panorama'
  }
};

function detectInitialLanguage() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q) {
      const norm = q.toLowerCase();
      if (norm.startsWith('en')) return 'en';
      if (norm.startsWith('zh')) return 'zh';
    }
  } catch (_) {}
  try {
    const saved = localStorage.getItem('nso_lang');
    if (saved === 'en' || saved === 'zh') return saved;
  } catch (_) {}
  const navLang = (typeof navigator !== 'undefined' && (navigator.language || navigator.languages?.[0])) || '';
  if (/^zh\b/i.test(navLang)) return 'zh';
  if (typeof navigator !== 'undefined' && navigator.webdriver) return 'zh';
  return 'en';
}

let currentLang = detectInitialLanguage();
function t(key) {
  return I18N[currentLang]?.[key] ?? I18N.zh[key] ?? key;
}

// Left Control Panel collapse/expand toggle + One-Click Immersive Full-Canvas GUI Hide/Restore
let guiHidden = false;
let panelCollapsed = false;
function setImmersiveMode(hidden) {
  guiHidden = !!hidden;
  document.body.classList.toggle('gui-hidden', guiHidden);
  return guiHidden;
}
function toggleBrowserFullscreen() {
  if (!document.fullscreenElement) {
    setImmersiveMode(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
    setImmersiveMode(false);
  }
}
{
  const panelToggleBtn = document.getElementById('panelToggleBtn');
  const panelBody = document.getElementById('controlPanelBody');
  if (panelToggleBtn && panelBody) {
    panelToggleBtn.onclick = () => {
      panelCollapsed = !panelCollapsed;
      panelBody.hidden = panelCollapsed;
      panelToggleBtn.textContent = panelCollapsed ? t('btnExpand') : t('btnCollapse');
    };
  }
  const langToggleBtn = document.getElementById('langToggleBtn');
  if (langToggleBtn) {
    langToggleBtn.onclick = () => applyLanguage(currentLang === 'zh' ? 'en' : 'zh', true);
  }
  const immersiveBtn = document.getElementById('immersiveToggleBtn');
  const restoreBtn = document.getElementById('restoreGuiBtn');
  if (immersiveBtn) immersiveBtn.onclick = () => setImmersiveMode(true);
  if (restoreBtn) restoreBtn.onclick = () => setImmersiveMode(false);
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const tag = e.target?.tagName;
    if (tag === 'TEXTAREA' || (tag === 'INPUT' && e.target.type === 'text')) return;
    if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      setImmersiveMode(!guiHidden);
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleBrowserFullscreen();
    } else if (e.key === 'Escape' && guiHidden) {
      setImmersiveMode(false);
    }
  });
}

function setLoadingProgress(pct, stageText, gpuText) {
  const bar = document.getElementById('loadingBarFill');
  const pctEl = document.getElementById('loadingPct');
  const stEl = document.getElementById('loadingStage');
  const gpuEl = document.getElementById('loadingGpuSub');
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  if (bar) bar.style.width = clamped + '%';
  if (pctEl) pctEl.textContent = clamped + '%';
  if (stageText && stEl) stEl.textContent = stageText;
  if (gpuText && gpuEl) gpuEl.textContent = gpuText;
}

function setShaderCompileProgress(done, total, stageText, threadInfoText, active = true) {
  const box = document.getElementById('shaderCompileBox');
  const bar = document.getElementById('shaderBarFill');
  const pctEl = document.getElementById('shaderPct');
  const stEl = document.getElementById('shaderStage');
  const thEl = document.getElementById('shaderThreadInfo');
  const cntEl = document.getElementById('shaderCountBadge');
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
  if (box) box.classList.toggle('is-active', !!active);
  if (bar) bar.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
  if (stageText && stEl) stEl.textContent = stageText;
  if (threadInfoText && thEl) thEl.textContent = threadInfoText;
  if (cntEl && total >= 0) cntEl.textContent = `${done} / ${total} Programs`;
}

function runFnInWorkerThread(pureFn) {
  return new Promise(resolve => {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
      resolve({ result: pureFn(), threaded: false });
      return;
    }
    let blobUrl = '';
    let worker = null;
    const cleanup = () => {
      if (worker) {
        try { worker.terminate(); } catch (_) {}
        worker = null;
      }
      if (blobUrl) {
        try { URL.revokeObjectURL(blobUrl); } catch (_) {}
        blobUrl = '';
      }
    };
    try {
      const workerSrc = `"use strict";
const fn = (${pureFn.toString()});
self.onmessage = function () {
  try {
    const out = fn();
    const transfers = [];
    if (out && typeof out === "object") {
      for (const k of Object.keys(out)) {
        const v = out[k];
        if (ArrayBuffer.isView(v) && v.buffer instanceof ArrayBuffer) {
          transfers.push(v.buffer);
        }
      }
    }
    self.postMessage({ ok: true, out }, transfers);
  } catch (err) {
    self.postMessage({ ok: false, err: String(err) });
  }
};`;
      blobUrl = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }));
      worker = new Worker(blobUrl);
      worker.onmessage = ev => {
        cleanup();
        if (ev.data && ev.data.ok) {
          resolve({ result: ev.data.out, threaded: true });
        } else {
          resolve({ result: pureFn(), threaded: false });
        }
      };
      worker.onerror = () => {
        cleanup();
        resolve({ result: pureFn(), threaded: false });
      };
      worker.postMessage(1);
    } catch (_) {
      cleanup();
      resolve({ result: pureFn(), threaded: false });
    }
  });
}

function nextBrowserPaint() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

// --- Top-Level Engine State & Subsystem Handles ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6e9bb8);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.20));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
document.body.prepend(renderer.domElement);

const gl = renderer.getContext();
const floatLinearSupported = !!(renderer.capabilities?.isWebGL2 && gl.getExtension('OES_texture_float_linear'));
const khrParallelSupported = !!gl.getExtension('KHR_parallel_shader_compile');
const hardwareThreads = Math.max(2, Number(typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8) || 8);
const parallelCompileStats = {
  khrParallelSupported,
  hardwareThreads,
  workerThreadsUsed: 0,
  totalPrograms: 0,
  readyPrograms: 0,
  compileSubmitMs: 0,
  parallelCompileMs: 0,
  bakeWarmupMs: 0,
  totalBootMs: 0
};
const maxFragTextures = renderer.capabilities?.maxTextures ?? 16;
const gpuReport = {
  webgl2: renderer.capabilities?.isWebGL2 ?? false,
  floatLinear: floatLinearSupported,
  fragmentLimit: maxFragTextures,
  requiredFragmentSamplers: 16,
  rendererName: (() => {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  })(),
  shaderErrors: []
};

const gpuStatus = $('gpuStatus');

if (renderer.debug) {
  renderer.debug.onShaderError = (glCtx, program, vs, fs) => {
    const message = [glCtx.getProgramInfoLog(program), glCtx.getShaderInfoLog(vs), glCtx.getShaderInfoLog(fs)].filter(Boolean).join(' | ');
    gpuReport.shaderErrors.push(message);
    gpuStatus.style.color = '#ff9aa2';
    gpuStatus.textContent = t('shaderErrPrefix') + message;
  };
}
window.gpuDebug = { status: () => ({ ...gpuReport, shaderErrors: gpuReport.shaderErrors.slice() }) };

// Camera & orbital/target controls + smooth preset glide state + AWD orientation projection
const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
  || ((navigator.maxTouchPoints || 0) > 1 && Math.min(innerWidth, innerHeight) <= 920);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 5000);
function syncCameraProjection() {
  const aspect = Math.max(0.25, innerWidth / Math.max(1, innerHeight));
  camera.aspect = aspect;
  // Hor+ portrait adaptation: preserves exact 50 deg FOV in landscape, widens vertically in portrait so bay + rocks + swash stay framed
  camera.fov = aspect < 1.0
    ? Math.min(72, 50 / Math.pow(Math.max(0.40, aspect), 0.44))
    : 50;
  camera.updateProjectionMatrix();
}
syncCameraProjection();
const target = new THREE.Vector3(0, 0.05, 5.8);
let yaw = 0.11, pitch = 0.265, distance = 43.0;
let diveMode = false, diveY = -1.2, diveTilt = 0.06, diveNear = 0.05;
let cameraLift = 0, releaseLift = false, clearanceTime = 0;
const camGlide = { active: false, tx: 0, ty: 0.05, tz: 5.8, yaw: 0.11, pitch: 0.265, distance: 43.0 };

// Core subsystems (top-level for clean cross-function & test harness access)
let ocean, skyCloudEnv, oceanRing, offshoreGeometry, coastGeometry;
let activeCoastSegs = isMobileDevice ? 232 : 336;
let activeQualityTier = isMobileDevice ? 'mobile' : 'medium';
let long, short, chop, longPrevious;
let bathymetry, swashRig, rockSplash;
let detail, foamTexture, splashFlipbook, coastalRocks, rockShadow;
let foamField, foamLayer, oceanAudio;
let beach, seabedGroup, seabedMaterial, bottom, coastNaturalGeometry, coastPanel, hemiLight;
let depthCapture, underwaterReflection, underwaterPass, cinemaPost, perfMonitor;
let playing = true, phase = 0;

let sampleTime = 0, previousGradient = 0;
const waveStep = 1 / 45;
let requestedChop = 2.24;

// Smooth damped parameter goals (eliminates abrupt jumps on slider/chip/palette changes!)
let goalAmplitude = 0.64;
let goalFoamBoost = 0.94;
let currentTimeHours = 15.60;
let goalTimeHours = 15.60;
const goalAbsorption = new THREE.Vector3(0.68, 0.148, 0.068);
const goalScatter = new THREE.Vector3(0.012, 0.192, 0.228);
const goalWaterDeep = new THREE.Vector3(0.0026, 0.036, 0.124);
let goalDepthScale = 1.00;
let goalCaustics = 1.04;
let opticsSettled = true;
const lastShadowSunDir = new THREE.Vector3(-0.44, 0.32, -0.839).normalize();

const QUALITY_SPECS = {
  mobile: {
    label: '行動極速',
    labelEn: 'Mobile Fast',
    desc: '手機 TBDR 高幀率最佳化・512 陰影・智慧節流',
    descEn: 'TBDR High-FPS · 512 Shadow · Smart Throttle',
    maxDpr: 1.05,
    coastSegs: 232,
    oceanQuality: 0.5,
    refractionMicro: 0.0,
    envWidth: 512,
    envHeight: 256,
    cloudSteps: 12,
    envBandInterval: 0.095,
    shadowRes: 512,
    depthPixelScale: 0.46,
    splashScale: 0.52,
    msaaSamples: 0,
    halfResBloom: false,
    godRaySteps: 0,
    bloomStrength: 0.14,
    causticsQuality: 0.0,
    fastComposite: true,
    swashInterval: 1 / 32
  },
  low: {
    label: '低品質',
    labelEn: 'Low',
    desc: '極速省顯存・關閉陰影與焦散',
    descEn: 'VRAM Saver · Shadows & Caustics Off',
    maxDpr: 1.00,
    coastSegs: 224,
    oceanQuality: 0.0,
    refractionMicro: 0.0,
    envWidth: 480,
    envHeight: 240,
    cloudSteps: 10,
    envBandInterval: 0.080,
    shadowRes: 0,
    depthPixelScale: 0.45,
    splashScale: 0.38,
    msaaSamples: 0,
    halfResBloom: false,
    godRaySteps: 0,
    bloomStrength: 0.135,
    causticsQuality: 0.0,
    fastComposite: true,
    swashInterval: 1 / 32
  },
  medium: {
    label: '中品質',
    labelEn: 'Medium',
    desc: '1024 陰影・16 階雲層・均衡推薦',
    descEn: '1024 Shadow · 16-Step Clouds · Balanced',
    maxDpr: 1.20,
    coastSegs: 336,
    oceanQuality: 1.0,
    refractionMicro: 0.06,
    envWidth: 640,
    envHeight: 320,
    cloudSteps: 16,
    envBandInterval: 0.032,
    shadowRes: 1024,
    depthPixelScale: 0.60,
    splashScale: 0.76,
    msaaSamples: 0,
    halfResBloom: false,
    godRaySteps: 8,
    bloomStrength: 0.145,
    causticsQuality: 1.0,
    fastComposite: false,
    swashInterval: 0
  },
  high: {
    label: '高品質',
    labelEn: 'High',
    desc: '2048 陰影・26 階雲層・2x MSAA・半解析度星芒',
    descEn: '2048 Shadow · 26-Step Clouds · 2x MSAA',
    maxDpr: 1.45,
    coastSegs: 416,
    oceanQuality: 2.0,
    refractionMicro: 0.16,
    envWidth: 896,
    envHeight: 448,
    cloudSteps: 26,
    envBandInterval: 0.028,
    shadowRes: 2048,
    depthPixelScale: 0.74,
    splashScale: 1.05,
    msaaSamples: 2,
    halfResBloom: true,
    godRaySteps: 14,
    bloomStrength: 0.155,
    causticsQuality: 2.0,
    fastComposite: false,
    swashInterval: 0
  }
};

function normalizeQualityKey(raw) {
  if (raw === 'mobile') return 'mobile';
  if (raw === 'balanced' || raw === 'low') return 'low';
  if (raw === 'ultra' || raw === 'high') return 'high';
  return 'medium';
}

function buildCoastGeometry(segs) {
  const geo = new THREE.PlaneGeometry(350, 350, segs, segs);
  geo.rotateX(-Math.PI / 2);
  // Concentrate z-resolution around the surf & swash zone (z in -45..+38) while keeping ±175m boundary exact!
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getZ(i) / 175;
    const s = u - 0.21 * Math.sin(Math.PI * u);
    pos.setZ(i, Math.max(-175, Math.min(175, s * 175)));
  }
  pos.needsUpdate = true;
  // Checkerboard alternating diagonal triangulation eliminates '/' directional mesh normal & specular diamond bias!
  if (geo.index) {
    const idx = geo.index.array;
    const cols = segs + 1;
    let ptr = 0;
    for (let iz = 0; iz < segs; iz++) {
      for (let ix = 0; ix < segs; ix++) {
        const a = iz * cols + ix;
        const b = (iz + 1) * cols + ix;
        const c = (iz + 1) * cols + (ix + 1);
        const d = iz * cols + (ix + 1);
        if ((ix + iz) & 1) {
          idx[ptr++] = a; idx[ptr++] = b; idx[ptr++] = c;
          idx[ptr++] = a; idx[ptr++] = c; idx[ptr++] = d;
        } else {
          idx[ptr++] = a; idx[ptr++] = b; idx[ptr++] = d;
          idx[ptr++] = b; idx[ptr++] = c; idx[ptr++] = d;
        }
      }
    }
    geo.index.needsUpdate = true;
  }
  return geo;
}

function uploadLongPrevious() {
  long.syncPrevious();
  longPrevious = long.previousTexture;
  ocean.uniforms.longPrevious.value = longPrevious;
  ocean.uniforms.longWave.value = long.texture;
}

function sampleLong(x, z, channel = 0) {
  const mix = ocean.uniforms.longMix.value;
  const prevBuf = long.previousPixels;
  if (mix <= 0) return long.sampleHeight(x, z, channel, prevBuf);
  if (mix >= 1) return long.sampleHeight(x, z, channel);
  return long.sampleHeight(x, z, channel, prevBuf) * (1 - mix) + long.sampleHeight(x, z, channel) * mix;
}

function syncBound() {
  const bound = long.spectralGradientBound + short.spectralGradientBound;
  const limit = 0.80 / Math.max(1e-8, ocean.uniforms.amplitude.value * bound);
  ocean.uniforms.chop.value = Math.min(requestedChop, limit);
  const used = ocean.uniforms.amplitude.value * ocean.uniforms.chop.value * bound;
  ocean.uniforms.midScale.value = Math.min(1, Math.max(0, (0.85 - used) / Math.max(0.00001, ocean.uniforms.amplitude.value * 0.375)));
}

const surfMidOut3 = new Float32Array(3);
function smoothStep01(a, b, v) {
  const q = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return q * q * (3 - 2 * q);
}

function surfaceHeightAtWorld(x, z) {
  let qx = x, qz = z;
  const A = ocean.uniforms.amplitude.value, C = ocean.uniforms.chop.value, ms = A * ocean.uniforms.midScale.value;
  const bSample = bathymetry.sample(x, z);
  const d0 = Math.max(0, -bSample.bed);
  const chopAtten = ocean.uniforms.beachMode.value > 0.5 ? smoothStep01(0.04, 0.68, d0) : 1.0;
  const offshoreAtten = ocean.uniforms.beachMode.value > 0.5 ? smoothStep01(0.02, 0.88, d0) : 1.0;

  for (let it = 0; it < 6; it++) {
    let mdx = 0, mdz = 0;
    if (ms > 0) {
      mediumWaveOut(qx, qz, phase, surfMidOut3);
      mdx = surfMidOut3[1];
      mdz = surfMidOut3[2];
    }
    qx = x - (A * C * (sampleLong(qx, qz, 1) + short.sampleHeight(qx, qz, 1)) + ms * mdx) * chopAtten;
    qz = z - (A * C * (sampleLong(qx, qz, 2) + short.sampleHeight(qx, qz, 2)) + ms * mdz) * chopAtten;
  }
  let h = A * (sampleLong(qx, qz) + short.sampleHeight(qx, qz));
  h += ocean.uniforms.crestShape.value * (Math.sqrt(h * h + 0.09) - 0.3);
  if (ms > 0) h += ms * mediumWaveOut(qx, qz, phase, surfMidOut3)[0];
  h *= offshoreAtten;

  if (ocean.uniforms.beachMode.value > 0.5) {
    h += evaluateCoastalSurfaceJS(bathymetry.sample(qx, qz), qx, qz, phase, A);
  }
  return h;
}

// Offshore whitecap foam field helpers
let foamClock = 0;
const foamPrevX = new Float32Array(64 * 64), foamPrevZ = new Float32Array(64 * 64);
let foamFlowReady = false;
const foamMid0 = new Float32Array(3);
const foamMidX = new Float32Array(3);
const foamMidZ = new Float32Array(3);
const foamSampleOut = [0, 0, 0];
let foamActiveDt = 0.1;
let foamActiveAC = 0, foamActiveA = 0, foamActiveMs = 0;

function prepareFoamStepParams(elapsed) {
  foamActiveDt = Math.max(1e-3, elapsed);
  foamActiveA = ocean.uniforms.amplitude.value;
  foamActiveAC = foamActiveA * ocean.uniforms.chop.value;
  foamActiveMs = 0;
}

// Strictly 240m-periodic offshore Jacobian whitecap source (eliminates 28m/240m non-integer wrap seams & cuts CPU cost >65%!)
function evalOffshoreFoamCell(x, z, i, j) {
  const e = 3.75;
  const AC = foamActiveAC, A = foamActiveA;
  const idx = j * 64 + i;
  const dx = AC * sampleLong(x, z, 1);
  const dz = AC * sampleLong(x, z, 2);
  const vx = foamFlowReady ? Math.max(-3, Math.min(3, (dx - foamPrevX[idx]) / foamActiveDt)) : 0;
  const vz = foamFlowReady ? Math.max(-3, Math.min(3, (dz - foamPrevZ[idx]) / foamActiveDt)) : 0;
  foamPrevX[idx] = dx;
  foamPrevZ[idx] = dz;
  const dxx = (AC * sampleLong(x + e, z, 1) - dx) / e;
  const dxz = (AC * sampleLong(x, z + e, 1) - dx) / e;
  const dzx = (AC * sampleLong(x + e, z, 2) - dz) / e;
  const dzz = (AC * sampleLong(x, z + e, 2) - dz) / e;
  const J = (1 + dxx) * (1 + dzz) - dxz * dzx;
  const h = A * sampleLong(x, z);
  let gate = Math.max(0, Math.min(1, (h - 0.16) / 0.44));
  gate = gate * gate * (3 - 2 * gate);
  foamSampleOut[0] = Math.max(0, 0.92 - J) * 4.8 * gate;
  foamSampleOut[1] = vx + 0.12;
  foamSampleOut[2] = vz;
  return foamSampleOut;
}

function updateOffshoreFoam(elapsed) {
  prepareFoamStepParams(elapsed);
  foamField.update(elapsed, evalOffshoreFoamCell, [0.65, 0.18]);
  foamFlowReady = true;
}

function cam(dt = 0) {
  const near = diveMode ? diveNear : 0.1, far = diveMode ? 600 : 5000;
  if (camera.near !== near) {
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }
  if (diveMode) {
    const x = target.x + distance * Math.sin(yaw);
    const z = target.z + distance * Math.cos(yaw);
    const bed = ocean.uniforms.beachMode.value > 0.5 ? shoreBed(x, z) : -16;
    camera.position.set(x, Math.max(diveY, bed + 0.22), z);
    camera.lookAt(target.x, camera.position.y + diveTilt * distance, target.z);
    return;
  }
  const portraitDistMul = camera.aspect < 0.95
    ? Math.min(1.26, Math.pow(0.95 / Math.max(0.42, camera.aspect), 0.25))
    : 1.0;
  const effDist = distance * portraitDistMul;
  const x = target.x + effDist * Math.cos(pitch) * Math.sin(yaw);
  const z = target.z + effDist * Math.cos(pitch) * Math.cos(yaw);
  const floor = surfaceHeightAtWorld(x, z) + 0.45;
  const desired = target.y + effDist * Math.sin(pitch);
  const needed = Math.max(floor - desired, 0);
  if (dt <= 0) {
    cameraLift = Math.max(cameraLift, needed);
  } else {
    const rate = needed > cameraLift ? 9.0 : 2.2;
    cameraLift += (needed - cameraLift) * (1 - Math.exp(-rate * dt));
    if (cameraLift < 1e-4 && needed === 0) cameraLift = 0;
  }
  const land = ocean.uniforms.beachMode.value > 0.5 ? shoreBed(x, z) + 0.85 : -1e6;
  camera.position.set(x, Math.max(desired + cameraLift, land), z);
  camera.lookAt(target);
}

function syncOpticsMaterial() {
  const real = ocean.uniforms.opticsMode.value > 0.5 && ocean.uniforms.depthEnabled.value > 0.5;
  for (const mesh of [ocean.mesh, oceanRing.mesh]) {
    mesh.material.side = diveMode ? THREE.DoubleSide : THREE.FrontSide;
    mesh.material.forceSinglePass = true;
    mesh.material.transparent = !diveMode && !real && ocean.uniforms.beachMode.value > 0.5;
    mesh.material.depthWrite = diveMode || real || ocean.uniforms.beachMode.value < 0.5;
  }
  if (foamLayer?.mesh) {
    foamLayer.mesh.material.side = diveMode ? THREE.DoubleSide : THREE.FrontSide;
  }
}

function renderFrame() {
  perfMonitor.beginGpuRender();
  skyCloudEnv.update(phase);
  ocean.uniforms.swashStateMap.value = swashRig.texture;
  ocean.uniforms.kdActive.value = diveMode ? ocean.uniforms.kdLighting.value : 0;
  rockSplash.mesh.visible = !diveMode && ocean.uniforms.beachMode.value > 0.5 && rockSplash.hasActiveParticles();
  if (diveMode) underwaterReflection.capture(surfaceHeightAtWorld(camera.position.x, camera.position.z));
  if (ocean.uniforms.beachMode.value > 0.5 || ocean.uniforms.opticsMode.value > 0.5) {
    depthCapture.capture();
  } else {
    ocean.uniforms.depthEnabled.value = 0;
  }
  syncOpticsMaterial();
  if (diveMode) {
    underwaterPass.render(surfaceHeightAtWorld(camera.position.x, camera.position.z));
  } else {
    cinemaPost.render();
  }
  perfMonitor.endGpuRender();
}

const presetButtons = ['previewCoast', 'previewRocks', 'previewSwash', 'previewOffshore', 'previewDive'];
function highlightPreset(activeId) {
  for (const id of presetButtons) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === activeId);
  }
}

function setCoastMode(coast) {
  const on = coast ? 1 : 0;
  ocean.uniforms.beachMode.value = on;
  beach.mesh.visible = false;
  coastPanel.visible = !!on;
  bottom.visible = !on;
  coastalRocks.mesh.visible = !!on;
  rockSplash.mesh.visible = !!on && !diveMode;
  const activeGeo = on ? coastGeometry : offshoreGeometry;
  const activeSpacing = 350 / (on ? activeCoastSegs : 320);
  ocean.mesh.geometry = activeGeo;
  ocean.uniforms.gridSpacing.value = activeSpacing;
  foamLayer.setGeometry(activeGeo, activeSpacing);
}

function applyPreset(name, immediate = false) {
  highlightPreset(name);
  const diveBox = document.getElementById('diveControls');
  const prevDive = diveMode;
  const prevCoast = ocean.uniforms.beachMode.value > 0.5;
  releaseLift = false;
  clearanceTime = 0;

  let nextTx = target.x, nextTy = target.y, nextTz = target.z;
  let nextYaw = yaw, nextPitch = pitch, nextDist = distance;
  let nextCoast = true;

  if (name === 'previewCoast') {
    diveMode = false;
    if (diveBox) diveBox.hidden = true;
    nextCoast = true;
    nextTx = 0; nextTy = 0.05; nextTz = 5.8;
    nextYaw = 0.11; nextPitch = 0.265; nextDist = 43.0;
  } else if (name === 'previewRocks') {
    diveMode = false;
    if (diveBox) diveBox.hidden = true;
    nextCoast = true;
    nextTx = -14.5; nextTy = 0.18; nextTz = 9.5;
    nextYaw = 0.30; nextPitch = 0.24; nextDist = 20.5;
  } else if (name === 'previewSwash') {
    diveMode = false;
    if (diveBox) diveBox.hidden = true;
    nextCoast = true;
    nextTx = 2.0; nextTy = 0.05; nextTz = 16.5;
    nextYaw = -0.40; nextPitch = 0.185; nextDist = 18.8;
  } else if (name === 'previewOffshore') {
    diveMode = false;
    if (diveBox) diveBox.hidden = true;
    nextCoast = false;
    nextTx = 0; nextTy = 0; nextTz = 0;
    nextYaw = 0.12; nextPitch = 0.19; nextDist = 34.0;
  } else if (name === 'previewDive') {
    diveMode = true;
    if (diveBox) diveBox.hidden = false;
    nextCoast = true;
    setCoastMode(true);
    camGlide.active = false;
    cameraLift = 0;
    target.set(-12.5, -0.35, 4.0);
    yaw = Math.PI + 0.065;
    distance = 30;
    diveY = -1.10;
    diveTilt = 0.055;
    $('elevation').value = diveY;
    $('lookTilt').value = diveTilt;
    $('elevationValue').textContent = diveY.toFixed(2) + ' m';
    $('tiltValue').textContent = '+0.06';
    skyCloudEnv.update(phase, true);
    cam(0);
    if (!playing || immediate) renderFrame();
    return;
  }

  setCoastMode(nextCoast);
  if (!diveMode) {
    underwaterPass.release();
    underwaterReflection.release();
  }

  // Smooth exponential camera glide when playing in surface mode (snaps deterministically if immediate or mode changed!)
  if (!immediate && playing && !prevDive && prevCoast === nextCoast) {
    const dYaw = Math.atan2(Math.sin(nextYaw - yaw), Math.cos(nextYaw - yaw));
    camGlide.tx = nextTx;
    camGlide.ty = nextTy;
    camGlide.tz = nextTz;
    camGlide.yaw = yaw + dYaw;
    camGlide.pitch = nextPitch;
    camGlide.distance = nextDist;
    camGlide.active = true;
  } else {
    camGlide.active = false;
    cameraLift = 0;
    target.set(nextTx, nextTy, nextTz);
    yaw = nextYaw;
    pitch = nextPitch;
    distance = nextDist;
    skyCloudEnv.update(phase, immediate);
    cam(0);
    if (!playing || immediate) renderFrame();
  }
}

function setTerrainKind(kind) {
  if (!['baseline', 'sandbar'].includes(kind)) throw Error('unknown terrain preset');
  selectBakedTerrain(kind);
  {
    const p = coastNaturalGeometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, shoreBed(p.getX(i), p.getZ(i)));
    p.needsUpdate = true;
    coastNaturalGeometry.computeVertexNormals();
  }
  coastalRocks.refresh();
  rockShadow.bake();
  bathymetry.rebake(coastalRocks.records);
  rockSplash.rebuildSites();
  rockSplash.reset();
  swashRig.warmup(phase, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value, (simT, stepDt, amp, boost) => {
    rockSplash.step(simT, stepDt, amp, boost, false, false);
  });
  rockSplash.flush();
  ocean.uniforms.swashStateMap.value = swashRig.texture;
  $('terrainPreset').value = kind;
  skyCloudEnv.update(phase, true);
  cam(0);
  renderFrame();
  return { kind, time: phase };
}

function wrapHours24(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 15.60;
  if (n === 24) return 24.0;
  return ((n % 24) + 24) % 24;
}

function formatTimeOfDayLabel(hours) {
  const h = wrapHours24(hours) % 24;
  const totalMin = Math.round(h * 60) % 1440;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  if (currentLang === 'en') {
    let tag = 'Afternoon';
    if (h < 4.8 || h >= 19.3) tag = 'Night';
    else if (h < 6.4) tag = 'Daybreak';
    else if (h < 9.5) tag = 'Morning';
    else if (h < 11.3) tag = 'Forenoon';
    else if (h < 13.4) tag = 'Noon';
    else if (h < 16.5) tag = 'Afternoon';
    else if (h < 17.6) tag = 'Golden Hr';
    else if (h < 18.45) tag = 'Dusk';
    else tag = 'Twilight';
    return `${hh}:${mm} ${tag}`;
  }
  let tag = '午後';
  if (h < 4.8 || h >= 19.3) tag = '星夜';
  else if (h < 6.4) tag = '破曉';
  else if (h < 9.5) tag = '晨光';
  else if (h < 11.3) tag = '上午';
  else if (h < 13.4) tag = '正午';
  else if (h < 16.5) tag = '午後';
  else if (h < 17.6) tag = '夕照';
  else if (h < 18.45) tag = '黃昏';
  else tag = '暮色';
  return `${hh}:${mm} ${tag}`;
}

function syncTodChipUI(hours) {
  const h = wrapHours24(hours) % 24;
  const isNight = h >= 19.0 || h < 5.1;
  const chips = [
    ['todMorning', !isNight && Math.abs(h - 7.35) < 0.75],
    ['todNoon', !isNight && Math.abs(h - 12.15) < 0.85],
    ['todAfternoon', !isNight && Math.abs(h - 15.60) < 0.88],
    ['todDusk', !isNight && h >= 17.15 && h < 19.0],
    ['todNight', isNight]
  ];
  for (const [id, on] of chips) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', on);
  }
}

const solarDirTmp = new THREE.Vector3();
const lunarDirTmp = new THREE.Vector3();

function evaluateSolarUniforms(rawHours, forceBake = false, skipGpuBake = false) {
  const h = wrapHours24(rawHours);
  currentTimeHours = h;
  const h24 = h % 24;

  // Smooth C^1 civil/nautical twilight crossover into NASA SVS 4851 Starry Night (19:20 .. 04:48 = pure night)
  let nightMix = 0.0;
  if (h24 >= 17.90) {
    nightMix = smoothStep01(17.90, 19.25, h24);
  } else if (h24 <= 6.25) {
    nightMix = 1.0 - smoothStep01(4.80, 6.25, h24);
  }
  ocean.uniforms.uNightMix.value = nightMix;
  ocean.uniforms.uCelestialSpin.value = ((h24 - 22.50) / 24.0) * Math.PI * 2.0;

  // 1) Daytime / Twilight Solar Vector
  const u = (h24 - 12.10) / 6.35;
  const clampedU = Math.max(-1.22, Math.min(1.22, u));
  const cosArc = Math.max(0, Math.cos(Math.min(1.0, Math.abs(u)) * Math.PI * 0.5));
  const sunElevDeg = 1.45 + 58.65 * Math.pow(cosArc, 1.55);
  const sunElevRad = THREE.MathUtils.degToRad(sunElevDeg);
  const sunAzimRad = clampedU * 0.88;
  solarDirTmp.set(
    -Math.sin(sunAzimRad) * Math.cos(sunElevRad),
    Math.sin(sunElevRad),
    -Math.cos(sunAzimRad) * Math.cos(sunElevRad)
  ).normalize();

  // 2) Nocturnal Lunar Vector (framed gracefully over the offshore sea with silver-blue Cox-Munk glitter & boulder shadows!)
  const nightRel = h24 >= 12.0 ? (h24 - 24.0) : h24; // -6.0 at 18:00, -1.5 at 22:30, 0.0 at 00:00, +6.0 at 06:00
  const moonArc = Math.max(0, Math.cos(Math.max(-1, Math.min(1, (nightRel - 0.6) / 6.2)) * Math.PI * 0.5));
  const moonElevDeg = 5.2 + 9.8 * Math.pow(moonArc, 1.25); // ~8.2 deg at 22:30 (visible right in Coast Panorama sky!), ~15.0 deg at 00:36
  const moonElevRad = THREE.MathUtils.degToRad(moonElevDeg);
  const moonAzimRad = -0.22 + (nightRel + 1.5) * 0.085; // ~ -0.22 rad (open right-center sky) at 22:30
  lunarDirTmp.set(
    -Math.sin(moonAzimRad) * Math.cos(moonElevRad),
    Math.sin(moonElevRad),
    -Math.cos(moonAzimRad) * Math.cos(moonElevRad)
  ).normalize();

  ocean.uniforms.sunDirection.value.copy(solarDirTmp).lerp(lunarDirTmp, nightMix).normalize();
  const activeElevDeg = sunElevDeg * (1.0 - nightMix) + moonElevDeg * nightMix;

  const syDay = solarDirTmp.y;
  const dayFactor = Math.min(1, Math.max(0, (syDay - 0.05) / 0.42)) * (1.0 - nightMix);
  const goldenFactor = Math.pow(Math.max(0, 1 - Math.min(1, Math.max(0, (syDay - 0.02) / 0.30))), 1.45) * (1.0 - nightMix);
  const isMorning = u < 0 ? 1 : 0;

  const dayTopR = 0.016 * dayFactor + (isMorning ? 0.042 : 0.036) * goldenFactor + 0.010 * Math.max(0, 1 - dayFactor - nightMix);
  const dayTopG = 0.145 * dayFactor + (isMorning ? 0.088 : 0.058) * goldenFactor + 0.038 * Math.max(0, 1 - dayFactor - nightMix);
  const dayTopB = 0.485 * dayFactor + (isMorning ? 0.320 : 0.285) * goldenFactor + 0.165 * Math.max(0, 1 - dayFactor - nightMix);
  const topR = dayTopR * (1.0 - nightMix) + 0.0018 * nightMix;
  const topG = dayTopG * (1.0 - nightMix) + 0.0048 * nightMix;
  const topB = dayTopB * (1.0 - nightMix) + 0.0145 * nightMix;
  ocean.uniforms.skyTop.value.set(topR, topG, topB);

  const dayHorR = 0.24 * dayFactor + (isMorning ? 0.62 : 0.72) * goldenFactor + 0.14 * Math.max(0, 1 - dayFactor - nightMix);
  const dayHorG = 0.46 * dayFactor + (isMorning ? 0.40 : 0.31) * goldenFactor + 0.13 * Math.max(0, 1 - dayFactor - nightMix);
  const dayHorB = 0.69 * dayFactor + (isMorning ? 0.36 : 0.24) * goldenFactor + 0.20 * Math.max(0, 1 - dayFactor - nightMix);
  const horR = dayHorR * (1.0 - nightMix) + 0.0065 * nightMix;
  const horG = dayHorG * (1.0 - nightMix) + 0.0135 * nightMix;
  const horB = dayHorB * (1.0 - nightMix) + 0.0290 * nightMix;
  ocean.uniforms.skyHorizon.value.set(horR, horG, horB);

  hemiLight.color.setRGB(
    Math.min(1, (0.85 * dayFactor + 0.95 * goldenFactor) * (1 - nightMix) + 0.12 * nightMix),
    Math.min(1, (0.95 * dayFactor + (isMorning ? 0.72 : 0.60) * goldenFactor) * (1 - nightMix) + 0.18 * nightMix),
    Math.min(1, (1.00 * dayFactor + (isMorning ? 0.68 : 0.52) * goldenFactor) * (1 - nightMix) + 0.30 * nightMix)
  );
  hemiLight.groundColor.setRGB(
    (0.30 * dayFactor + 0.24 * goldenFactor) * (1 - nightMix) + 0.02 * nightMix,
    (0.24 * dayFactor + 0.15 * goldenFactor) * (1 - nightMix) + 0.03 * nightMix,
    (0.18 * dayFactor + 0.11 * goldenFactor) * (1 - nightMix) + 0.05 * nightMix
  );
  hemiLight.intensity = (1.35 + 0.95 * dayFactor) * (1.0 - 0.84 * nightMix);
  renderer.toneMappingExposure = 1.02 + 0.10 * goldenFactor + 0.16 * nightMix;
  scene.background.setRGB(
    Math.min(1, Math.pow(Math.max(0, horR), 0.45)),
    Math.min(1, Math.pow(Math.max(0, horG), 0.45)),
    Math.min(1, Math.pow(Math.max(0, horB), 0.45))
  );

  if (!skipGpuBake) {
    if (forceBake || lastShadowSunDir.distanceToSquared(ocean.uniforms.sunDirection.value) > 0.00022) {
      rockShadow.bake();
      lastShadowSunDir.copy(ocean.uniforms.sunDirection.value);
    }
    if (forceBake) {
      skyCloudEnv.update(phase, true);
    }
  }
  return activeElevDeg;
}

function applyTimeOfDay(hours, immediate = false) {
  const h = Math.max(0.0, Math.min(24.0, wrapHours24(hours)));
  goalTimeHours = h;
  $('timeOfDay').value = h.toFixed(2);
  $('timeOfDayValue').textContent = formatTimeOfDayLabel(h);
  syncTodChipUI(h);

  if (immediate || !playing) {
    const elevDeg = evaluateSolarUniforms(h, true);
    if (!playing) renderFrame();
    return {
      hours: h,
      nightMix: +ocean.uniforms.uNightMix.value.toFixed(3),
      elevationDeg: +elevDeg.toFixed(2),
      sunDirection: ocean.uniforms.sunDirection.value.toArray()
    };
  }
  return {
    hours: h,
    nightMix: +ocean.uniforms.uNightMix.value.toFixed(3),
    sunDirection: ocean.uniforms.sunDirection.value.toArray()
  };
}

// --- Physical Seawater Bio-Optical Presets, Color Tint, Depth Scale & Clarity ---
// Calibrated to Morel & Prieur (1977) & Jerlov (1976) Case-1/Case-2 spectral IOPs
const WATER_PALETTES = {
  emerald: {
    absorption: [0.68, 0.148, 0.068],
    scatter: [0.012, 0.192, 0.228],
    deep: [0.0026, 0.036, 0.124]
  },
  maldives: {
    absorption: [0.54, 0.092, 0.040],
    scatter: [0.018, 0.268, 0.305],
    deep: [0.0042, 0.068, 0.178]
  },
  pacific: {
    absorption: [0.86, 0.215, 0.046],
    scatter: [0.005, 0.096, 0.225],
    deep: [0.0014, 0.018, 0.118]
  },
  jade: {
    absorption: [0.66, 0.118, 0.112],
    scatter: [0.019, 0.228, 0.162],
    deep: [0.0030, 0.048, 0.082]
  },
  nordic: {
    absorption: [0.82, 0.245, 0.158],
    scatter: [0.010, 0.108, 0.142],
    deep: [0.0018, 0.020, 0.064]
  }
};

function syncKdAttenuation() {
  const abs = ocean.uniforms.absorption.value;
  const ds = ocean.uniforms.waterDepthScale.value;
  ocean.uniforms.kdAttenuation.value.set(abs.x * 0.22 * ds, abs.y * 0.34 * ds, abs.z * 0.48 * ds);
}

function formatWaterDepthLabel(depthScale) {
  const tag = currentLang === 'en'
    ? (depthScale < 0.72 ? 'Shallow' : (depthScale > 1.38 ? 'Deep' : 'Std'))
    : (depthScale < 0.72 ? '清淺' : (depthScale > 1.38 ? '深海' : '標準'));
  return `${depthScale.toFixed(2)}x ${tag}`;
}

function applyWaterOptics(overrides = null, immediate = false) {
  if (overrides) {
    if (overrides.palette && WATER_PALETTES[overrides.palette]) $('waterPalette').value = overrides.palette;
    if (overrides.tint !== undefined) $('waterTint').value = overrides.tint;
    if (overrides.depthScale !== undefined) $('waterDepthScale').value = overrides.depthScale;
    if (overrides.clarity !== undefined) $('waterClarity').value = overrides.clarity;
  }

  const palKey = WATER_PALETTES[$('waterPalette').value] ? $('waterPalette').value : 'emerald';
  const pal = WATER_PALETTES[palKey];
  const rawTint = Number($('waterTint').value);
  const tint = Math.max(-1, Math.min(1, Number.isFinite(rawTint) ? rawTint : 0));
  const rawDepth = Number($('waterDepthScale').value);
  const depthScale = Math.max(0.35, Math.min(2.40, Number.isFinite(rawDepth) && rawDepth > 0 ? rawDepth : 1.0));
  const rawClar = Number($('waterClarity').value);
  const clarity = Math.max(0.55, Math.min(1.75, Number.isFinite(rawClar) && rawClar > 0 ? rawClar : 1.0));

  $('waterTintValue').textContent = (tint >= 0 ? '+' : '') + tint.toFixed(2);
  $('waterDepthValue').textContent = formatWaterDepthLabel(depthScale);
  $('waterClarityValue').textContent = `${clarity.toFixed(2)}x`;

  const invClarity = 1.0 / clarity;
  const gAbsMod = Math.pow(1.42, tint);
  const bAbsMod = Math.pow(0.68, tint);

  goalAbsorption.set(
    pal.absorption[0] * invClarity,
    pal.absorption[1] * gAbsMod * invClarity,
    pal.absorption[2] * bAbsMod * invClarity
  );
  goalScatter.set(
    pal.scatter[0] * (tint < 0 ? 1.0 - 0.35 * tint : 1.0 - 0.25 * tint),
    pal.scatter[1] * (tint < 0 ? 1.0 - 0.28 * tint : Math.max(0.42, 1.0 - 0.42 * tint)),
    pal.scatter[2] * (tint > 0 ? 1.0 + 0.26 * tint : Math.max(0.55, 1.0 + 0.30 * tint))
  );
  goalWaterDeep.set(
    pal.deep[0],
    pal.deep[1] * (tint < 0 ? 1.0 - 0.55 * tint : Math.max(0.38, 1.0 - 0.48 * tint)),
    pal.deep[2] * (tint > 0 ? 1.0 + 0.28 * tint : Math.max(0.52, 1.0 + 0.34 * tint))
  );
  goalDepthScale = depthScale;
  goalCaustics = Math.min(1.35, 0.72 + 0.32 * clarity);

  if (immediate || !playing) {
    ocean.uniforms.absorption.value.copy(goalAbsorption);
    ocean.uniforms.scatterColor.value.copy(goalScatter);
    ocean.uniforms.waterDeep.value.copy(goalWaterDeep);
    ocean.uniforms.waterDepthScale.value = goalDepthScale;
    seabedMaterial.uniforms.caustics.value = goalCaustics;
    syncKdAttenuation();
    opticsSettled = true;
    if (!playing) renderFrame();
  } else {
    opticsSettled = false;
  }

  return {
    palette: palKey,
    tint,
    depthScale,
    clarity,
    absorption: goalAbsorption.toArray(),
    scatterColor: goalScatter.toArray(),
    waterDeep: goalWaterDeep.toArray()
  };
}

function updateGpuStatusBanner() {
  if (gpuReport.shaderErrors.length > 0) return;
  if (gpuReport.fragmentLimit < 16) {
    gpuStatus.textContent = t('gpuLowSamplers');
    return;
  }
  const spec = QUALITY_SPECS[activeQualityTier] || QUALITY_SPECS.medium;
  gpuStatus.textContent = currentLang === 'en'
    ? `WebGL2 Pure GPU | ${spec.labelEn} (${spec.descEn})`
    : `WebGL2 純 GPU｜${spec.label}（${spec.desc}）`;
}

function syncAudioUI() {
  const btn = document.getElementById('soundToggle');
  if (!btn) return;
  const enabled = oceanAudio ? oceanAudio.status().enabled : true;
  btn.textContent = enabled ? t('audioOn') : t('audioMuted');
  btn.classList.toggle('active', enabled);
}

function applyLanguage(nextLang, persist = false) {
  currentLang = nextLang === 'en' ? 'en' : 'zh';
  document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-Hant';
  if (persist) {
    try { localStorage.setItem('nso_lang', currentLang); } catch (_) {}
  }

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  }

  const langBtn = document.getElementById('langToggleBtn');
  if (langBtn) {
    langBtn.textContent = currentLang === 'en' ? '繁中' : 'EN';
    const label = currentLang === 'en' ? '切換為繁體中文介面' : 'Switch UI to English';
    langBtn.title = label;
    langBtn.setAttribute('aria-label', label);
  }

  const immBtn = document.getElementById('immersiveToggleBtn');
  if (immBtn) immBtn.title = t('immersiveTitle');
  const nightBtn = document.getElementById('todNight');
  if (nightBtn) nightBtn.title = t('todNightTitle');
  const hudEl = document.getElementById('perfHud');
  if (hudEl) hudEl.setAttribute('aria-label', t('perfAria'));
  const maxEl = document.getElementById('perfFpsMaxVal');
  if (maxEl) maxEl.title = t('perfMaxTitle');
  const capSel = document.getElementById('perfFpsCap');
  if (capSel) capSel.setAttribute('aria-label', t('perfCapAria'));
  const spEl = document.getElementById('sponsorCard');
  if (spEl) spEl.setAttribute('aria-label', t('sponsorAria'));
  const resBtn = document.getElementById('restoreGuiBtn');
  if (resBtn) resBtn.title = t('restoreGuiTitle');

  const panelToggleBtn = document.getElementById('panelToggleBtn');
  if (panelToggleBtn) {
    panelToggleBtn.textContent = panelCollapsed ? t('btnExpand') : t('btnCollapse');
  }
  const hintEl = document.getElementById('interactionHint');
  if (hintEl) {
    hintEl.textContent = isMobileDevice ? t('hintMobile') : t('hintDesktop');
  }
  const todOut = document.getElementById('timeOfDayValue');
  if (todOut) {
    todOut.textContent = formatTimeOfDayLabel(currentTimeHours);
  }
  const depthInput = document.getElementById('waterDepthScale');
  const depthOut = document.getElementById('waterDepthValue');
  if (depthInput && depthOut) {
    const rawD = Number(depthInput.value);
    const ds = Math.max(0.35, Math.min(2.40, Number.isFinite(rawD) && rawD > 0 ? rawD : 1.0));
    depthOut.textContent = formatWaterDepthLabel(ds);
  }
  const pauseBtn = document.getElementById('previewPause');
  if (pauseBtn) {
    pauseBtn.textContent = playing ? t('btnPause') : t('btnResume');
  }
  if (!playing) {
    const fsEl = document.getElementById('frameStatus');
    if (fsEl) fsEl.textContent = t('statusPaused');
  }
  syncAudioUI();
  if (ocean) {
    updateGpuStatusBanner();
  } else if (gpuReport.shaderErrors.length === 0) {
    gpuStatus.textContent = t('gpuBooting');
  }
  if (perfMonitor) {
    perfMonitor.setLanguage(currentLang);
  }
  return currentLang;
}

applyLanguage(currentLang, false);
setLoadingProgress(8, t('bootStage0'), gpuReport.rendererName || 'WebGL2 Hardware GPU');

function applyQualityTier(rawMode, doRender = true, skipBake = false) {
  const tier = normalizeQualityKey(rawMode);
  activeQualityTier = tier;
  const spec = QUALITY_SPECS[tier];
  const selEl = document.getElementById('quality');
  if (selEl && selEl.value !== tier) selEl.value = tier;

  renderer.setPixelRatio(Math.min(devicePixelRatio, spec.maxDpr));
  renderer.setSize(innerWidth, innerHeight);
  ocean.uniforms.captureSamples.value = 0;
  ocean.uniforms.uOceanQuality.value = spec.oceanQuality;
  ocean.uniforms.refractionMicro.value = spec.refractionMicro;
  seabedMaterial.uniforms.uCausticsQuality.value = spec.causticsQuality;

  // Rebuild nearshore-concentrated ocean mesh if segment count changed & dispose old VBO/IBO cleanly
  if (coastGeometry && activeCoastSegs !== spec.coastSegs) {
    const oldGeo = coastGeometry;
    activeCoastSegs = spec.coastSegs;
    coastGeometry = buildCoastGeometry(activeCoastSegs);
    if (ocean.uniforms.beachMode.value > 0.5) {
      const activeSpacing = 350 / activeCoastSegs;
      ocean.mesh.geometry = coastGeometry;
      ocean.uniforms.gridSpacing.value = activeSpacing;
      foamLayer.setGeometry(coastGeometry, activeSpacing);
    }
    if (perfMonitor) {
      perfMonitor.removeGeometry(oldGeo);
      perfMonitor.addGeometry(coastGeometry);
    }
    oldGeo.dispose();
  }

  skyCloudEnv.setQuality({
    width: spec.envWidth,
    height: spec.envHeight,
    steps: spec.cloudSteps,
    bandInterval: spec.envBandInterval || 0.032,
    doBake: !skipBake
  });
  rockShadow.setResolution(spec.shadowRes, !skipBake);
  if (!skipBake) lastShadowSunDir.copy(ocean.uniforms.sunDirection.value);
  depthCapture.setPixelScale(spec.depthPixelScale);
  rockSplash.setEmissionScale(spec.splashScale);
  cinemaPost.setQuality({
    msaaSamples: spec.msaaSamples,
    halfResBloom: spec.halfResBloom,
    godRaySteps: spec.godRaySteps,
    bloomStrength: spec.bloomStrength,
    fastComposite: !!spec.fastComposite
  });

  updateGpuStatusBanner();
  if (doRender) {
    renderFrame();
  }
  if (perfMonitor) {
    perfMonitor.refreshMemory();
    perfMonitor.resetHistory();
  }
  return tier;
}

function smoothParams(dt) {
  // 1. Wave amplitude & whitewater foam boost exponential damping
  const kFast = 1 - Math.exp(-9.0 * dt);
  const curAmp = ocean.uniforms.amplitude.value;
  if (Math.abs(goalAmplitude - curAmp) > 1e-4) {
    ocean.uniforms.amplitude.value = Math.abs(goalAmplitude - curAmp) < 5e-4
      ? goalAmplitude
      : curAmp + (goalAmplitude - curAmp) * kFast;
    syncBound();
  }
  const curFoam = ocean.uniforms.foamBoost.value;
  if (Math.abs(goalFoamBoost - curFoam) > 1e-4) {
    ocean.uniforms.foamBoost.value = Math.abs(goalFoamBoost - curFoam) < 5e-4
      ? goalFoamBoost
      : curFoam + (goalFoamBoost - curFoam) * kFast;
  }

  // 2. Smooth 24h solar/lunar arc & starry-night glide (shortest path across 00:00 midnight!)
  let hourDiff = ((goalTimeHours - currentTimeHours + 36.0) % 24.0) - 12.0;
  if (Math.abs(hourDiff) > 1e-4) {
    const kSun = 1 - Math.exp(-5.6 * dt);
    const nextH = Math.abs(hourDiff) < 1.2e-3
      ? goalTimeHours
      : wrapHours24(currentTimeHours + hourDiff * kSun);
    evaluateSolarUniforms(nextH, false);
    if (nextH === goalTimeHours && lastShadowSunDir.distanceToSquared(ocean.uniforms.sunDirection.value) > 1e-7) {
      rockShadow.bake();
      lastShadowSunDir.copy(ocean.uniforms.sunDirection.value);
    }
  }

  // 3. Smooth seawater bio-optical palette & clarity diffusion
  if (!opticsSettled) {
    const kOpt = 1 - Math.exp(-8.0 * dt);
    ocean.uniforms.absorption.value.lerp(goalAbsorption, kOpt);
    ocean.uniforms.scatterColor.value.lerp(goalScatter, kOpt);
    ocean.uniforms.waterDeep.value.lerp(goalWaterDeep, kOpt);
    ocean.uniforms.waterDepthScale.value += (goalDepthScale - ocean.uniforms.waterDepthScale.value) * kOpt;
    seabedMaterial.uniforms.caustics.value += (goalCaustics - seabedMaterial.uniforms.caustics.value) * kOpt;
    syncKdAttenuation();

    const err =
      ocean.uniforms.absorption.value.distanceToSquared(goalAbsorption) +
      ocean.uniforms.scatterColor.value.distanceToSquared(goalScatter) +
      ocean.uniforms.waterDeep.value.distanceToSquared(goalWaterDeep) +
      Math.abs(goalDepthScale - ocean.uniforms.waterDepthScale.value) +
      Math.abs(goalCaustics - seabedMaterial.uniforms.caustics.value);
    if (err < 2e-5) {
      ocean.uniforms.absorption.value.copy(goalAbsorption);
      ocean.uniforms.scatterColor.value.copy(goalScatter);
      ocean.uniforms.waterDeep.value.copy(goalWaterDeep);
      ocean.uniforms.waterDepthScale.value = goalDepthScale;
      seabedMaterial.uniforms.caustics.value = goalCaustics;
      syncKdAttenuation();
      opticsSettled = true;
    }
  }

  // 4. Smooth camera preset glide
  if (camGlide.active && !diveMode) {
    const kCam = 1 - Math.exp(-6.2 * dt);
    target.x += (camGlide.tx - target.x) * kCam;
    target.y += (camGlide.ty - target.y) * kCam;
    target.z += (camGlide.tz - target.z) * kCam;
    yaw += (camGlide.yaw - yaw) * kCam;
    pitch += (camGlide.pitch - pitch) * kCam;
    distance += (camGlide.distance - distance) * kCam;
    const rem =
      Math.abs(camGlide.tx - target.x) +
      Math.abs(camGlide.ty - target.y) +
      Math.abs(camGlide.tz - target.z) +
      Math.abs(camGlide.yaw - yaw) * 12 +
      Math.abs(camGlide.pitch - pitch) * 12 +
      Math.abs(camGlide.distance - distance);
    if (rem < 0.015) {
      target.set(camGlide.tx, camGlide.ty, camGlide.tz);
      yaw = camGlide.yaw;
      pitch = camGlide.pitch;
      distance = camGlide.distance;
      camGlide.active = false;
    }
  }
}

// Deterministic seek & debug API for automated visual verification
let foamSliceIdx = 0, foamSliceAccumDt = 0;
let lastShortWavePhase = -1e9, lastChopWavePhase = -1e9;
const FOAM_STEP_PERIOD = 0.10;

function seekTo(seconds) {
  phase = seconds;
  sampleTime = seconds;
  lastShortWavePhase = seconds;
  lastChopWavePhase = seconds - (1 / 120);
  long.update(seconds);
  uploadLongPrevious();
  previousGradient = long.maxGradient;
  short.update(seconds);
  chop.update(seconds);
  ocean.uniforms.longMix.value = 0;
  ocean.uniforms.time.value = seconds;
  syncBound();
  foamField.reset();
  foamPrevX.fill(0);
  foamPrevZ.fill(0);
  foamFlowReady = false;
  foamSliceIdx = 0;
  foamSliceAccumDt = 0;
  foamClock = 0;
  for (let i = 0; i < 16; i++) updateOffshoreFoam(0.1);
  foamField.syncMaterialHistory();
  rockSplash.reset();
  swashRig.warmup(seconds, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value, (simT, stepDt, amp, boost) => {
    rockSplash.step(simT, stepDt, amp, boost, false, false);
  });
  rockSplash.flush();
  ocean.uniforms.swashStateMap.value = swashRig.texture;
  skyCloudEnv.update(phase, true);
  cam(0);
  renderFrame();
  perfMonitor.resetHistory();
  return { phase };
}

const clock = new THREE.Clock();
let splashStepAccum = 0;
let swashStepAccum = 0;
let nextCapDeadlineMs = 0;
let lastRafNow = 0;

function loop(rafNow = performance.now()) {
  requestAnimationFrame(loop);

  if (lastRafNow > 0) {
    const rawRafDt = rafNow - lastRafNow;
    perfMonitor.recordRafInterval(rawRafDt);
  }
  lastRafNow = rafNow;

  // VSync-aware Bresenham phase-locked FPS limiter:
  // - Never skips ticks when native VSync already matches or is slower than fpsCap (e.g. 60Hz screen + 60 FPS cap!)
  // - Uses exact half-VSync-tick centered phase accumulation on high-refresh displays (e.g. 144Hz -> 2,3,2,3,2 = exact 60.0 FPS!)
  const fpsCap = perfMonitor.getFpsCap();
  if (playing && fpsCap > 0) {
    const targetIntervalMs = 1000 / fpsCap;
    const nativeVSyncMs = perfMonitor.getNativeVSyncMs();
    if (nativeVSyncMs < targetIntervalMs * 0.93) {
      if (nextCapDeadlineMs === 0 || Math.abs(rafNow - nextCapDeadlineMs) > Math.max(80, targetIntervalMs * 3.0)) {
        nextCapDeadlineMs = rafNow + targetIntervalMs;
      } else {
        const remainingMs = nextCapDeadlineMs - rafNow;
        const halfTickMs = Math.min(targetIntervalMs * 0.48, Math.max(1.8, nativeVSyncMs * 0.52));
        if (remainingMs > halfTickMs) return;
        nextCapDeadlineMs += targetIntervalMs;
      }
    } else {
      nextCapDeadlineMs = 0;
    }
  }

  perfMonitor.beginFrame(playing);
  const dt = Math.min(0.1, clock.getDelta());
  if (!playing) {
    oceanAudio.update(phase, camera, {
      playing: false,
      diveMode,
      beachMode: ocean.uniforms.beachMode.value,
      amplitude: ocean.uniforms.amplitude.value,
      foamBoost: ocean.uniforms.foamBoost.value
    });
    perfMonitor.endFrame(null);
    return;
  }

  smoothParams(dt);

  phase += dt;
  ocean.uniforms.time.value = phase;

  // Zero-copy ping-pong long-wave FFT stepping (0 bytes CPU memcpy & 0 duplicate GPU uploads for longPrevious!)
  if (phase - sampleTime >= waveStep) {
    if (phase - sampleTime >= waveStep * 2) {
      sampleTime = phase - waveStep;
      long.update(sampleTime);
    }
    long.advanceBracket();
    previousGradient = long.maxGradient;
    sampleTime += waveStep;
    long.update(sampleTime);
    longPrevious = long.previousTexture;
    ocean.uniforms.longPrevious.value = longPrevious;
    ocean.uniforms.longWave.value = long.texture;
  }
  ocean.uniforms.longMix.value = Math.max(0, Math.min(1, (phase - sampleTime) / waveStep));

  // Phase-staggered 60Hz updates for 64x64 Float32 short & chop bands (halves PCIe uploads & spreads CPU FFT across frames!)
  if (Math.abs(phase - lastShortWavePhase) >= 1 / 60) {
    lastShortWavePhase = phase;
    short.update(phase);
  }
  if (Math.abs(phase - lastChopWavePhase) >= 1 / 60) {
    lastChopWavePhase = phase;
    chop.update(phase);
  }

  // Exact phase-locked 4-slice offshore foam advection (atomic buffer swap right at foamClock == FOAM_STEP_PERIOD!)
  foamClock += dt;
  while (foamSliceIdx < 4 && foamClock >= (foamSliceIdx + 1) * (FOAM_STEP_PERIOD / 4)) {
    if (foamSliceIdx === 0) {
      foamSliceAccumDt = FOAM_STEP_PERIOD;
      prepareFoamStepParams(foamSliceAccumDt);
    }
    const done = foamField.updateSlice(foamSliceAccumDt, evalOffshoreFoamCell, foamSliceIdx, 4);
    if (done) {
      foamSliceIdx = 0;
      foamClock = Math.max(0, Math.min(FOAM_STEP_PERIOD * 0.25, foamClock - FOAM_STEP_PERIOD));
      foamFlowReady = true;
      break;
    } else {
      foamSliceIdx++;
    }
  }
  ocean.uniforms.foamTransportMix.value = Math.min(1, foamClock / FOAM_STEP_PERIOD);
  perfMonitor.markSection('waves');

  const curSpec = QUALITY_SPECS[activeQualityTier] || QUALITY_SPECS.medium;
  if (ocean.uniforms.beachMode.value > 0.5) {
    const splashStepInterval = curSpec.swashInterval > 0 ? (1 / 45) : (1 / 90);
    splashStepAccum += dt;
    if (splashStepAccum >= splashStepInterval) {
      const stepDt = Math.min(0.1, splashStepAccum);
      splashStepAccum = 0;
      rockSplash.step(phase, stepDt, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value, true);
    }
    perfMonitor.markSection('splash');
  }

  if (ocean.uniforms.beachMode.value > 0.5) {
    if (curSpec.swashInterval > 0) {
      swashStepAccum += dt;
      if (swashStepAccum >= curSpec.swashInterval) {
        const swDt = Math.min(0.08, swashStepAccum);
        swashStepAccum = 0;
        swashRig.step(phase, swDt, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value);
        ocean.uniforms.swashStateMap.value = swashRig.texture;
      }
    } else {
      swashStepAccum = 0;
      swashRig.step(phase, dt, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value);
      ocean.uniforms.swashStateMap.value = swashRig.texture;
    }
  }
  cam(dt);
  oceanAudio.update(phase, camera, {
    playing: true,
    diveMode,
    beachMode: ocean.uniforms.beachMode.value,
    amplitude: ocean.uniforms.amplitude.value,
    foamBoost: ocean.uniforms.foamBoost.value
  });
  perfMonitor.markSection('swash');

  renderFrame();
  perfMonitor.endFrame($('frameStatus'));
}

function bindUIControls() {
  const activePointers = new Map();
  let lastPinchDist = 0;

  const measurePinchDist = () => {
    const pts = Array.from(activePointers.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  };

  const releasePointer = e => {
    activePointers.delete(e.pointerId);
    lastPinchDist = activePointers.size >= 2 ? measurePinchDist() : 0;
  };

  renderer.domElement.addEventListener('pointerdown', e => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    camGlide.active = false;
    if (activePointers.size >= 2) {
      lastPinchDist = measurePinchDist();
    }
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
  });
  renderer.domElement.addEventListener('pointerup', releasePointer);
  renderer.domElement.addEventListener('pointercancel', releasePointer);
  renderer.domElement.addEventListener('lostpointercapture', releasePointer);
  renderer.domElement.addEventListener('pointermove', e => {
    const prev = activePointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;
    camGlide.active = false;
    releaseLift = true;

    if (activePointers.size === 1) {
      yaw -= dx * 0.0055;
      if (diveMode) {
        diveTilt = Math.max(-0.7, Math.min(1, diveTilt + dy * 0.0055));
        $('lookTilt').value = diveTilt;
        $('tiltValue').textContent = (diveTilt >= 0 ? '+' : '') + diveTilt.toFixed(2);
      } else {
        pitch = Math.max(0.03, Math.min(1.22, pitch + dy * 0.0055));
      }
    } else if (activePointers.size >= 2) {
      const curDist = measurePinchDist();
      if (lastPinchDist > 8 && curDist > 8) {
        const zoomRatio = lastPinchDist / curDist;
        distance = Math.max(8, Math.min(130, distance * Math.pow(zoomRatio, 1.05)));
      }
      lastPinchDist = curDist;
      yaw -= dx * 0.0022;
      if (!diveMode) {
        pitch = Math.max(0.03, Math.min(1.22, pitch + dy * 0.0022));
      }
    }
    cam(0);
    if (!playing) renderFrame();
  });
  renderer.domElement.addEventListener('wheel', e => {
    e.preventDefault();
    camGlide.active = false;
    releaseLift = true;
    distance = Math.max(8, Math.min(130, distance * Math.exp(e.deltaY * 0.001)));
    cam(0);
    if (!playing) renderFrame();
  }, { passive: false });
  const handleViewportChange = () => {
    syncCameraProjection();
    const spec = QUALITY_SPECS[activeQualityTier] || QUALITY_SPECS.medium;
    renderer.setPixelRatio(Math.min(devicePixelRatio, spec.maxDpr));
    renderer.setSize(innerWidth, innerHeight);
    cam(0);
    if (perfMonitor) perfMonitor.refreshMemory();
    if (!playing) renderFrame();
  };
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('orientationchange', () => {
    setTimeout(handleViewportChange, 60);
  });
  const hintEl = document.getElementById('interactionHint');
  if (hintEl) {
    hintEl.textContent = isMobileDevice ? t('hintMobile') : t('hintDesktop');
  }

  $('previewCoast').onclick = () => applyPreset('previewCoast', false);
  $('previewRocks').onclick = () => applyPreset('previewRocks', false);
  $('previewSwash').onclick = () => applyPreset('previewSwash', false);
  $('previewOffshore').onclick = () => applyPreset('previewOffshore', false);
  $('previewDive').onclick = () => applyPreset('previewDive', false);

  $('terrainPreset').onchange = () => setTerrainKind($('terrainPreset').value);

  $('amplitude').oninput = () => {
    const v = Number($('amplitude').value);
    goalAmplitude = v;
    $('amplitudeValue').textContent = v.toFixed(2) + ' m';
    if (!playing) {
      ocean.uniforms.amplitude.value = v;
      syncBound();
      cam(0);
      renderFrame();
    }
  };

  $('foamBoost').oninput = () => {
    const v = Number($('foamBoost').value);
    goalFoamBoost = v;
    $('foamBoostValue').textContent = v.toFixed(2) + 'x';
    if (!playing) {
      ocean.uniforms.foamBoost.value = v;
      renderFrame();
    }
  };

  $('quality').onchange = () => {
    applyQualityTier($('quality').value, true);
  };

  $('elevation').oninput = () => {
    diveMode = true;
    diveY = Number($('elevation').value);
    $('elevationValue').textContent = diveY.toFixed(2) + ' m';
    cam(0);
    if (!playing) renderFrame();
  };

  $('lookTilt').oninput = () => {
    diveTilt = Number($('lookTilt').value);
    $('tiltValue').textContent = (diveTilt >= 0 ? '+' : '') + diveTilt.toFixed(2);
    cam(0);
    if (!playing) renderFrame();
  };

  $('previewPause').onclick = () => {
    playing = !playing;
    $('previewPause').textContent = playing ? t('btnPause') : t('btnResume');
    if (!playing) $('frameStatus').textContent = t('statusPaused');
    oceanAudio.update(phase, camera, {
      playing,
      diveMode,
      beachMode: ocean.uniforms.beachMode.value,
      amplitude: ocean.uniforms.amplitude.value,
      foamBoost: ocean.uniforms.foamBoost.value
    });
  };

  $('soundToggle').onclick = () => {
    oceanAudio.toggle();
    syncAudioUI();
  };

  $('audioVolume').oninput = () => {
    const pct = Number($('audioVolume').value);
    $('audioVolumeValue').textContent = Math.round(pct) + '%';
    oceanAudio.setVolume(pct / 100);
    if (pct > 0 && !oceanAudio.status().enabled) {
      oceanAudio.setEnabled(true);
    }
    syncAudioUI();
  };

  const unlockAudioOnce = () => { oceanAudio.unlock(); };
  window.addEventListener('pointerdown', unlockAudioOnce, { passive: true });
  window.addEventListener('keydown', unlockAudioOnce, { passive: true });
  syncAudioUI();

  $('timeOfDay').oninput = () => applyTimeOfDay(Number($('timeOfDay').value), false);
  $('todMorning').onclick = () => applyTimeOfDay(7.35, false);
  $('todNoon').onclick = () => applyTimeOfDay(12.15, false);
  $('todAfternoon').onclick = () => applyTimeOfDay(15.60, false);
  $('todDusk').onclick = () => applyTimeOfDay(17.90, false);
  $('todNight').onclick = () => applyTimeOfDay(22.50, false);

  $('waterPalette').onchange = () => {
    $('waterTint').value = '0.00';
    applyWaterOptics(null, false);
  };
  $('waterTint').oninput = () => applyWaterOptics(null, false);
  $('waterDepthScale').oninput = () => applyWaterOptics(null, false);
  $('waterClarity').oninput = () => applyWaterOptics(null, false);

  document.addEventListener('visibilitychange', () => { clock.getDelta(); });
  perfMonitor.onFpsCapChange(() => {
    nextCapDeadlineMs = 0;
    clock.getDelta();
  });
}

// --- Multi-Threaded Progressive Async Boot Sequence Driving Dual Progress Bars (#loadingScreen) ---
async function bootNeuralSpecOcean() {
  const bootStartMs = performance.now();
  const threadBadgeText = `CPU ${Math.min(4, hardwareThreads)}-Thread Worker · ${khrParallelSupported ? 'KHR_parallel_shader_compile' : 'WebGL2 Async Queue'}`;
  setShaderCompileProgress(0, 0, t('shaderQueueStart'), threadBadgeText, false);

  // Spawn true OS Web Worker threads immediately so 518 epochs of Sobolev-PINN training run in parallel with Stages 1-2!
  const rockPinnJob = runFnInWorkerThread(trainCoastalRockFoamPINN);
  const splashPinnJob = runFnInWorkerThread(trainCoastalImpactPINNWeights);
  await nextBrowserPaint();

  // Stage 1: Ocean Surface, Neural Chapman-Ozone Atmosphere & Volumetric Sky
  setLoadingProgress(18, t('bootStage1'));
  await nextBrowserPaint();
  ocean = createOffshore(THREE, { size: 350, segments: isMobileDevice ? 240 : 320 });
  scene.add(ocean.mesh);
  ocean.uniforms.captureSamples.value = 0;
  ocean.uniforms.amplitude.value = goalAmplitude;
  ocean.uniforms.foamBoost.value = goalFoamBoost;

  skyCloudEnv = createSkyCloudEnv(THREE, renderer, ocean.uniforms);
  scene.add(skyCloudEnv.skyMesh);
  ocean.uniforms.skyEnvMap.value = skyCloudEnv.texture;
  ocean.uniforms.skyEnvReady = skyCloudEnv.readyUniform;

  oceanRing = createOceanRing(THREE, ocean.mesh.material, ocean.uniforms);
  scene.add(oceanRing.mesh);
  oceanRing.mesh.material.uniforms.skyEnvMap = ocean.uniforms.skyEnvMap;
  oceanRing.mesh.material.uniforms.skyEnvReady = ocean.uniforms.skyEnvReady;

  offshoreGeometry = ocean.mesh.geometry;
  coastGeometry = buildCoastGeometry(activeCoastSegs);

  // Stage 2: Tri-Band Spectral FFT Ocean Waves & Deferred Foam/Splash Atlases
  setLoadingProgress(36, t('bootStage2'));
  await nextBrowserPaint();
  const waveLinear = floatLinearSupported;
  long = createSpectralWaves(THREE, { size: 128, length: 240, wind: 16, seed: 84, band: 'long', geometrySpacing: 350 / 320, linearFilter: waveLinear, pingPong: true });
  short = createSpectralWaves(THREE, { size: 64, length: 28, wind: 11, seed: 601, band: 'short', geometrySpacing: 350 / 320, linearFilter: waveLinear });
  chop = createSpectralWaves(THREE, { size: 64, length: 11.3, wind: 12.5, seed: 1907, band: 'chop', geometrySpacing: 0, linearFilter: waveLinear });
  ocean.uniforms.uWaveLinear.value = waveLinear ? 1.0 : 0.0;
  ocean.uniforms.uIsDepthCapture = { value: 0.0 };

  let lastLongUpdateTime = NaN, lastShortUpdateTime = NaN, lastChopUpdateTime = NaN;
  const updateLongRaw = long.update;
  long.update = t => { if (t === lastLongUpdateTime) return; updateLongRaw(t); lastLongUpdateTime = t; };
  const updateShortRaw = short.update;
  short.update = t => { if (t === lastShortUpdateTime) return; updateShortRaw(t); lastShortUpdateTime = t; };
  const updateChopRaw = chop.update;
  chop.update = t => { if (t === lastChopUpdateTime) return; updateChopRaw(t); lastChopUpdateTime = t; };

  longPrevious = long.previousTexture;
  previousGradient = long.maxGradient;

  detail = createDetailTexture(THREE);
  foamTexture = createFoamTexture(THREE, renderer, { size: 512, deferBake: true });
  splashFlipbook = createSplashFlipbook(THREE, renderer, { size: 512, deferBake: true });

  // Stage 3: Sculpted Coastal Rocks (using Worker #1 PINN), Sun Shadow Map, Bathymetry & GPU Swash Solver
  setLoadingProgress(52, t('bootStage3'));
  await nextBrowserPaint();
  const rockPinnRes = await rockPinnJob;
  coastalRocks = createCoastalRocks(THREE, shoreBed, detail, ocean.uniforms, foamTexture.texture, renderer, {
    deferBake: true,
    precomputedPinn: rockPinnRes.result
  });
  scene.add(coastalRocks.mesh);

  rockShadow = createRockShadowPass(THREE, renderer, coastalRocks.mesh, ocean.uniforms.sunDirection);
  ocean.uniforms.rockShadowMap.value = rockShadow.depthTexture;
  ocean.uniforms.rockShadowMatrix.value = rockShadow.shadowMatrix;
  ocean.uniforms.rockShadowEnabled = rockShadow.shadowEnabled;
  coastalRocks.uniforms.rockShadowMap = ocean.uniforms.rockShadowMap;
  coastalRocks.uniforms.rockShadowMatrix = ocean.uniforms.rockShadowMatrix;
  coastalRocks.uniforms.rockShadowEnabled = ocean.uniforms.rockShadowEnabled;
  coastalRocks.uniforms.skyEnvMap = ocean.uniforms.skyEnvMap;
  coastalRocks.uniforms.skyEnvReady = ocean.uniforms.skyEnvReady;
  oceanRing.mesh.material.uniforms.rockShadowMap = ocean.uniforms.rockShadowMap;
  oceanRing.mesh.material.uniforms.rockShadowMatrix = ocean.uniforms.rockShadowMatrix;
  oceanRing.mesh.material.uniforms.rockShadowEnabled = ocean.uniforms.rockShadowEnabled;
  oceanRing.mesh.material.uniforms.uNightMix = ocean.uniforms.uNightMix;
  oceanRing.mesh.material.uniforms.uCelestialSpin = ocean.uniforms.uCelestialSpin;

  bathymetry = createBathymetryField(THREE, shoreBed, coastalRocks.records, floatLinearSupported);
  swashRig = createSwashRigGPU(THREE, renderer, bathymetry.texture, detail);
  swashRig.setCoastalContactMap(coastalRocks.contactTexture);
  ocean.uniforms.coastalContactMap = { value: coastalRocks.contactTexture };

  foamField = createFoamField(THREE, { renderer });
  ocean.uniforms.bathymetryMap.value = bathymetry.texture;
  ocean.uniforms.swashStateMap.value = swashRig.texture;
  ocean.uniforms.foamMap.value = foamField.texture;
  ocean.uniforms.foamMaterialMap.value = foamField.materialTexture;
  ocean.uniforms.longWave.value = long.texture;
  ocean.uniforms.longPrevious.value = longPrevious;
  ocean.uniforms.shortWave.value = short.texture;
  ocean.uniforms.chopWave.value = chop.texture;
  ocean.uniforms.detailMap.value = detail;

  oceanRing.mesh.material.uniforms.bathymetryMap = ocean.uniforms.bathymetryMap;
  oceanRing.mesh.material.uniforms.swashStateMap = ocean.uniforms.swashStateMap;
  oceanRing.mesh.material.uniforms.chopWave = ocean.uniforms.chopWave;
  oceanRing.mesh.material.uniforms.longPrevious = ocean.uniforms.longPrevious;
  oceanRing.mesh.material.uniforms.longMix = ocean.uniforms.longMix;
  oceanRing.mesh.material.uniforms.uOceanQuality = ocean.uniforms.uOceanQuality;

  foamLayer = createCoastalFoamLayer(
    THREE,
    coastGeometry,
    ocean.uniforms,
    foamTexture.texture,
    null,
    splashFlipbook.texture
  );
  scene.add(foamLayer.mesh);

  // Stage 4: Sobolev-PINN 3D Wave-Rock Splash System (using Worker #2 PINN), Wet Quartz Beach & Post-Processing
  setLoadingProgress(68, t('bootStage4'));
  await nextBrowserPaint();
  const splashPinnRes = await splashPinnJob;
  parallelCompileStats.workerThreadsUsed = (rockPinnRes.threaded ? 1 : 0) + (splashPinnRes.threaded ? 1 : 0);

  oceanAudio = createOceanAudio();
  let cachedExX = NaN, cachedExZ = NaN, cachedExPhase = NaN, cachedExAtten = 0, cachedExSpecBase = 0;
  const extraMidOut3 = new Float32Array(3);
  const extraOffshoreWaveAtRock = (x, z, t) => {
    if (x !== cachedExX || z !== cachedExZ || phase !== cachedExPhase) {
      cachedExX = x;
      cachedExZ = z;
      cachedExPhase = phase;
      const b0 = shoreBed(x, z);
      const d0 = Math.max(0, -b0);
      if (d0 <= 0.04) {
        cachedExAtten = 0;
        cachedExSpecBase = 0;
      } else {
        const q = Math.max(0, Math.min(1, (d0 - 0.02) / 1.53));
        cachedExAtten = q * q * (3 - 2 * q);
        cachedExSpecBase = sampleLong(x, z) + short.sampleHeight(x, z);
      }
    }
    if (cachedExAtten <= 0) return 0;
    const A = ocean.uniforms.amplitude.value;
    const ms = A * ocean.uniforms.midScale.value;
    const dtPhase = (t - phase) / 2.2;
    const liveBlend = dtPhase * dtPhase < 5.0 ? Math.exp(-dtPhase * dtPhase) : 0;
    const specH = liveBlend > 0.01 ? liveBlend * A * cachedExSpecBase : 0;
    const midH = ms > 0 ? ms * mediumWaveOut(x, z, t, extraMidOut3)[0] : 0;
    return (specH + midH) * cachedExAtten;
  };
  const extraMidOut2 = new Float32Array(2);
  const extraOffshoreWaveKinematicsAtRock = (x, z, t, out2) => {
    if (x !== cachedExX || z !== cachedExZ || phase !== cachedExPhase) {
      cachedExX = x;
      cachedExZ = z;
      cachedExPhase = phase;
      const b0 = shoreBed(x, z);
      const d0 = Math.max(0, -b0);
      if (d0 <= 0.04) {
        cachedExAtten = 0;
        cachedExSpecBase = 0;
      } else {
        const q = Math.max(0, Math.min(1, (d0 - 0.02) / 1.53));
        cachedExAtten = q * q * (3 - 2 * q);
        cachedExSpecBase = sampleLong(x, z) + short.sampleHeight(x, z);
      }
    }
    if (cachedExAtten <= 0) {
      out2[0] = 0;
      out2[1] = 0;
      return;
    }
    const A = ocean.uniforms.amplitude.value;
    const ms = A * ocean.uniforms.midScale.value;
    const dtPhase = (t - phase) / 2.2;
    const dtPhaseSq = dtPhase * dtPhase;
    const liveBlend = dtPhaseSq < 5.0 ? Math.exp(-dtPhaseSq) : 0;
    const specH = liveBlend > 0.01 ? liveBlend * A * cachedExSpecBase : 0;
    const dSpecDt = liveBlend > 0.01 ? specH * (-2.0 * dtPhase / 2.2) : 0;
    let midH = 0, dMidDt = 0;
    if (ms > 0) {
      mediumWaveHeightAndDeriv(x, z, t, extraMidOut2);
      midH = ms * extraMidOut2[0];
      dMidDt = ms * extraMidOut2[1];
    }
    out2[0] = (specH + midH) * cachedExAtten;
    out2[1] = (dSpecDt + dMidDt) * cachedExAtten;
  };

  rockSplash = createRockSplashSystem(
    THREE,
    coastalRocks,
    bathymetry,
    shoreBed,
    ocean.uniforms,
    foamTexture.texture,
    extraOffshoreWaveAtRock,
    splashFlipbook.texture,
    extraOffshoreWaveKinematicsAtRock,
    renderer,
    { precomputedPinn: splashPinnRes.result }
  );
  rockSplash.setAudioCallbacks(oceanAudio);
  scene.add(rockSplash.mesh);
  swashRig.setImpactFoamMap(rockSplash.impactFoamTexture);
  foamLayer.setImpactFoamMap(rockSplash.impactFoamTexture);
  coastalRocks.setImpactFoamMap(rockSplash.impactFoamTexture);

  const shoreDetail = { value: 1 }, shoreDebug = { value: 0 };
  beach = createBeach(
    THREE,
    detail,
    ocean.uniforms.swashStateMap,
    ocean.uniforms.bathymetryMap,
    ocean.uniforms.time,
    ocean.uniforms.amplitude,
    shoreDetail,
    shoreDebug,
    ocean.uniforms.foamScaleDebug,
    isMobileDevice ? 224 : 272
  );
  // Dispose unused beach.mesh.material immediately (coastPanel renders coastNaturalGeometry with seabedMaterial!)
  beach.mesh.material.dispose();

  seabedGroup = new THREE.Group();
  scene.add(seabedGroup);

  seabedMaterial = new THREE.ShaderMaterial({
    uniforms: {
      ...terrainUniforms,
      bathymetryMap: ocean.uniforms.bathymetryMap,
      swashStateMap: ocean.uniforms.swashStateMap,
      coastalContactMap: { value: coastalRocks.contactTexture },
      detailMap: ocean.uniforms.detailMap,
      foamMaterialMap: ocean.uniforms.foamMaterialMap,
      foamWorldDetail: ocean.uniforms.foamWorldDetail,
      foamFilamentMode: ocean.uniforms.foamFilamentMode,
      foamTransport: ocean.uniforms.foamTransport,
      foamTransportMix: ocean.uniforms.foamTransportMix,
      foamBoost: ocean.uniforms.foamBoost,
      longWave: ocean.uniforms.longWave,
      longPrevious: ocean.uniforms.longPrevious,
      shortWave: ocean.uniforms.shortWave,
      longMix: ocean.uniforms.longMix,
      amplitude: ocean.uniforms.amplitude,
      midScale: ocean.uniforms.midScale,
      time: ocean.uniforms.time,
      beachMode: ocean.uniforms.beachMode,
      sunDirection: ocean.uniforms.sunDirection,
      skyTop: ocean.uniforms.skyTop,
      skyHorizon: ocean.uniforms.skyHorizon,
      skyEnvMap: ocean.uniforms.skyEnvMap,
      skyEnvReady: ocean.uniforms.skyEnvReady,
      rockShadowMap: ocean.uniforms.rockShadowMap,
      rockShadowMatrix: ocean.uniforms.rockShadowMatrix,
      rockShadowEnabled: ocean.uniforms.rockShadowEnabled,
      uNightMix: ocean.uniforms.uNightMix,
      shoreDetail,
      shoreDebug,
      foamScaleDebug: ocean.uniforms.foamScaleDebug,
      naturalRevision: ocean.uniforms.naturalRevision,
      uWaveLinear: ocean.uniforms.uWaveLinear,
      waterDepthScale: ocean.uniforms.waterDepthScale,
      bedStyle: { value: 1 },
      caustics: { value: 1.04 },
      uCausticsQuality: { value: 1.0 },
      uIsDepthCapture: ocean.uniforms.uIsDepthCapture
    },
    vertexShader: `varying vec3 w;varying vec3 n;
void main(){
  w = (modelMatrix * vec4(position, 1.0)).xyz;
  n = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `varying vec3 w;varying vec3 n;
uniform sampler2D detailMap, longWave, longPrevious, shortWave;
uniform float longMix, amplitude, midScale, bedStyle, caustics, uCausticsQuality, beachMode, naturalRevision, shoreDetail, shoreDebug, foamScaleDebug, uWaveLinear, waterDepthScale, uIsDepthCapture;
${shoreVisualGLSL}
${coastalBackshoreGLSL}
${mediumWaveGLSL}

float opticalHash(float q){ return fract(sin(q * 127.1 + 17.7) * 43758.5453); }
void opticalMicro(vec2 p, float t, float amp, out vec2 slope, out vec3 curvature){
  slope = vec2(0.0); curvature = vec3(0.0);
  float ampScale = clamp(amp / 0.6, 0.0, 2.4);
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float angle = fi * 2.3999632 + 0.34 * (opticalHash(fi + 3.0) - 0.5);
    vec2 dir = vec2(cos(angle), sin(angle));
    vec2 q = vec2(-dir.y, dir.x) * (0.52 + 0.34 * opticalHash(fi + 14.0));
    vec2 r = vec2(cos(angle + 1.15), sin(angle + 1.15)) * 0.38;
    float wavelength = 0.52 + 1.18 * (fi / 8.0) + 0.12 * (opticalHash(fi + 8.0) - 0.5);
    float k = 6.2831853 / wavelength;
    float A = 0.0028 * pow(wavelength, 1.55) * (0.86 + 0.28 * opticalHash(fi + 23.0)) * ampScale;
    float seed = 6.2831853 * opticalHash(fi + 31.0);
    float psi = dot(q, p) - t * 0.21 + seed, chi = dot(r, p) + t * 0.13 + seed * 1.7;
    float ph = k * dot(dir, p) - sqrt(9.81 * k) * t + seed + 1.45 * sin(psi);
    float a = A * (0.62 + 0.38 * sin(chi));
    vec2 ga = A * 0.38 * cos(chi) * r, gp = k * dir + 1.45 * cos(psi) * q;
    vec3 ha = -A * 0.38 * sin(chi) * vec3(r.x * r.x, r.y * r.y, r.x * r.y);
    vec3 hp = -1.45 * sin(psi) * vec3(q.x * q.x, q.y * q.y, q.x * q.y);
    slope += ga * sin(ph) + a * cos(ph) * gp;
    curvature += ha * sin(ph) + cos(ph) * (vec3(2.0 * ga.x * gp.x, 2.0 * ga.y * gp.y, ga.x * gp.y + ga.y * gp.x) + a * hp) - a * sin(ph) * vec3(gp.x * gp.x, gp.y * gp.y, gp.x * gp.y);
  }
}

float waveSample(sampler2D tex, vec2 p, float len, float res){
  float outH;
  if (uWaveLinear > 0.5) {
    outH = texture2D(tex, p / len).r;
  } else {
    vec2 xy = fract(p / len) * res - 0.5, i = floor(xy), f = fract(xy);
    float a = texture2D(tex, fract((i + 0.5) / res)).r;
    float b = texture2D(tex, fract((i + vec2(1.5, 0.5)) / res)).r;
    float c = texture2D(tex, fract((i + vec2(0.5, 1.5)) / res)).r;
    float d = texture2D(tex, fract((i + 1.5) / res)).r;
    outH = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  return outH;
}

float wave(vec2 p){
  return amplitude * (mix(waveSample(longPrevious, p, 240.0, 128.0), waveSample(longWave, p, 240.0, 128.0), longMix)
    + waveSample(shortWave, p, 28.0, 64.0) + midScale * mediumWave(p, time).x);
}

void main(){
  // During DepthCapture, dry backshore sand & cliffs (>0.90m above MSL) are never underwater-refracted; skip wet-film/shadow/hydro!
  if (uIsDepthCapture > 0.5 && beachMode > 0.5 && w.y > 0.90) {
    float broadFast = texture2D(detailMap, w.xz * 0.08).r;
    vec3 fastSand = mix(vec3(0.45, 0.375, 0.265), vec3(0.65, 0.55, 0.395), broadFast);
    vec3 skyIrrF = pbrHemisphereIrradiance(vec3(0.0, 1.0, 0.0), skyTop, skyHorizon);
    vec3 tintF = clamp(pbrSunIrradiance(normalize(sunDirection)) * 0.24 + skyIrrF * 0.36, vec3(0.002), vec3(1.16));
    float diffF = 0.42 + 0.68 * max(dot(normalize(n), normalize(sunDirection)), 0.0);
    gl_FragColor = vec4(coastalBackshore(fastSand * diffF * tintF, w), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }

  float broad = texture2D(detailMap, w.xz * 0.08).r;
  float sediment = texture2D(detailMap, w.xz * 0.31 + vec2(2.1, 1.3)).r;
  float domainA = texture2D(detailMap, w.xz * 0.16 + vec2(0.7, 1.2)).r;

  float across = dot(w.xz, vec2(0.94, 0.34)) + 0.38 * sin(dot(w.xz, vec2(-0.34, 0.94)) * 0.65) + 0.19 * sin(dot(w.xz, vec2(0.61, -0.79)) * 1.07) + 1.1 * (domainA - 0.5);
  across += 0.32 * sin(w.x * 0.41 + w.z * 0.16) + 0.24 * sin(w.z * 0.33 - w.x * 0.27);
  float phi = 6.2831853 * across / 0.46;
  float aa = 1.0 - smoothstep(1.0, 3.14, fwidth(phi));
  float aa2 = 1.0 - smoothstep(1.0, 3.14, 2.0 * fwidth(phi));
  float coverage = smoothstep(0.40, 0.72, sediment + 0.26 * (broad - 0.5));
  float ridge = (sin(phi) * aa + 0.18 * sin(2.0 * phi) * aa2) * coverage;

  float pixelMeters = max(length(dFdx(w.xz)), length(dFdy(w.xz)));
  float grains = pixelMeters < 0.02 ? (texture2D(detailMap, w.xz * 36.0).r - 0.5) * (1.0 - smoothstep(0.004, 0.02, pixelMeters)) : 0.0;

  vec3 baseSand = mix(vec3(0.45, 0.375, 0.265), vec3(0.65, 0.55, 0.395), broad * 0.62 + sediment * 0.38) * (1.0 + ridge * 0.09 + grains * 0.08);
  float dPhi = cos(phi) * aa * coverage * (6.2831853 / 0.46);
  vec2 rippleGrad = vec2(0.94, 0.34) * dPhi * 0.0085 * (1.0 - smoothstep(12.0, 58.0, length(cameraPosition - w)));
  vec3 bedNormal = normalize(n + vec3(-rippleGrad.x, 0.0, -rippleGrad.y));
  float bedSunShadow = pbrEvaluateSunShadow(rockShadowMap, rockShadowMatrix, rockShadowEnabled, w, vec3(0.0, 0.038, 0.0), gl_FragCoord.xy);
  vec3 bedSkyIrr = pbrHemisphereIrradiance(vec3(0.0, 1.0, 0.0), skyTop, skyHorizon);
  vec3 minBedTint = mix(vec3(0.018), vec3(0.0016), clamp(uNightMix, 0.0, 1.0));
  vec3 sunTintBed = clamp(pbrSunIrradiance(normalize(sunDirection)) * 0.24 + bedSkyIrr * 0.36, minBedTint, vec3(1.16));
  float sunDiffuse = 0.42 + 0.68 * max(dot(bedNormal, normalize(sunDirection)), 0.0) * bedSunShadow;

  bool nearShoreBelt = beachMode > 0.5 && w.y > -1.15 && w.y < 1.25;
  float offshoreWaveH = nearShoreBelt ? wave(w.xz) * smoothstep(0.02, 0.88, max(0.0, -w.y)) : 0.0;
  float hydroX = nearShoreBelt ? evaluateCoastalHydro(w.xz, time, amplitude).x : 0.0;
  float liveColDepth = beachMode > 0.5 ? (offshoreWaveH + hydroX - w.y) : -w.y;
  float underwaterWeight = beachMode > 0.5 ? smoothstep(0.06, 0.68, max(0.0, liveColDepth)) : 1.0;
  vec3 subSandBase = beachMode > 0.5 ? pbrWetPorousAlbedo(baseSand, 0.72, 0.40) : baseSand;
  vec3 subSand = subSandBase * sunDiffuse * sunTintBed;
  vec3 c = subSand;

  // Skip evaluateBeachSand completely on deep submerged ocean floor (underwaterWeight >= 0.998) AND reuse bedSunShadow + liveColDepth!
  if (beachMode > 0.5 && underwaterWeight < 0.998) {
    float sandBed = (w.z > -88.0 && w.z < 58.0 && abs(w.x) < 178.0) ? sampleBathymetry(w.xz).r : w.y;
    vec3 beachShaded = evaluateBeachSandDirect(baseSand, w, bedNormal, underwaterWeight, ridge, offshoreWaveH + hydroX - sandBed, bedSunShadow);
    c = mix(beachShaded, subSand, underwaterWeight);
  }

  // Quality-scaled Dynamic Snell Refracted Solar Caustics (off in Low, fast Hessian in Med, full 9-wave chromatic in High!)
  float optBedDepth = max(0.06, -w.y) * waterDepthScale;
  if (uCausticsQuality > 0.5 && underwaterWeight > 0.01 && caustics > 0.01 && pixelMeters < 0.62 && optBedDepth < 8.6) {
    float depth = max(0.06, -w.y), e = 0.42;
    vec2 sunSlant = normalize(sunDirection.xz + vec2(1e-5, 0.0)) * (-depth * 0.36);
    vec2 p = w.xz + sunSlant;
    float h = wave(p);
    float xx = (wave(p + vec2(e, 0.0)) - 2.0 * h + wave(p - vec2(e, 0.0))) / (e * e);
    float zz = (wave(p + vec2(0.0, e)) - 2.0 * h + wave(p - vec2(0.0, e))) / (e * e);
    float xz = (wave(p + vec2(e, e)) - wave(p + vec2(e, -e)) - wave(p + vec2(-e, e)) + wave(p - vec2(e, e))) / (4.0 * e * e);
    if (uCausticsQuality > 1.5) {
      vec2 microSlope; vec3 microCurvature;
      opticalMicro(p, time, amplitude, microSlope, microCurvature);
      xx += microCurvature.x; zz += microCurvature.y; xz += microCurvature.z;
    }
    vec3 travelRGB = min(depth, 12.0) * vec3(1.0 - 1.0 / 1.331, 1.0 - 1.0 / 1.334, 1.0 - 1.0 / 1.339);
    vec3 detRGB = (1.0 + travelRGB * xx) * (1.0 + travelRGB * zz) - travelRGB * travelRGB * (xz * xz);
    float footprint = max(0.20, 0.68 * fwidth(detRGB.g));
    vec3 focusRGB = clamp(1.0 / max(abs(detRGB), vec3(footprint)), vec3(0.62), vec3(2.95));
    float contrast = 1.65 * exp(-optBedDepth * 0.34) / (1.0 + pow(optBedDepth / 2.4, 4.0))
                   * smoothstep(0.04, 0.24, depth) * (1.0 - smoothstep(0.15, 0.62, pixelMeters)) * bedSunShadow;
    c *= vec3(1.0) + caustics * underwaterWeight * contrast * (max(focusRGB - vec3(1.0), vec3(0.0)) - 0.40 * max(vec3(1.0) - focusRGB, vec3(0.0)));
  }

  if (beachMode > 0.5) {
    c = coastalBackshore(c, w);
    c = mix(pbrAerialPerspective(c, w, cameraPosition, sunDirection, skyTop, skyHorizon), c, underwaterWeight);
    if (shoreDebug > 0.5) c = shoreDebugColor(w, underwaterWeight);
  }
  if (foamScaleDebug > 0.5 && beachMode > 0.5) c = vec3(foamWorldDiagnostic(w.xz, foamScaleDebug));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
  });

  bottom = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), seabedMaterial);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -16;
  seabedGroup.add(bottom);

  coastNaturalGeometry = beach.mesh.geometry;
  coastPanel = new THREE.Mesh(coastNaturalGeometry, seabedMaterial);
  coastPanel.visible = true;
  seabedGroup.add(coastPanel);

  hemiLight = new THREE.HemisphereLight(0xdaf4ff, 0x4b3d2d, 2.2);
  scene.add(hemiLight);

  syncBound();

  depthCapture = createDepthCapture(THREE, renderer, scene, camera, [ocean.mesh, oceanRing.mesh], ocean.uniforms);
  underwaterReflection = createUnderwaterReflection(THREE, renderer, scene, camera, [ocean.mesh, oceanRing.mesh, foamLayer.mesh, rockSplash.mesh], ocean.uniforms);
  underwaterPass = createUnderwaterPass(THREE, renderer, scene, camera, ocean.uniforms);
  cinemaPost = createCinemaPostPass(THREE, renderer, scene, camera, ocean.uniforms);

  perfMonitor = createPerfMonitor(THREE, renderer);
  perfMonitor.setLanguage(currentLang);
  if ((innerHeight > innerWidth && innerWidth <= 760) || innerHeight <= 500) {
    perfMonitor.setCollapsed(true);
  }
  perfMonitor.addGeometry(offshoreGeometry);
  perfMonitor.addGeometry(coastGeometry);
  perfMonitor.registerSceneResources(
    scene,
    [
      long.texture,
      long.previousTexture,
      short.texture,
      chop.texture,
      detail,
      foamTexture.texture,
      splashFlipbook.texture,
      bathymetry.texture,
      foamField.texture,
      foamField.materialTexture,
      coastalRocks.contactTexture,
      rockSplash.impactFoamTexture,
      skyCloudEnv.starMapTexture
    ],
    {
      skyEnv: skyCloudEnv.getTarget,
      depthCapture: depthCapture.getTargets,
      cinemaPost: cinemaPost.getTargets,
      rockShadow: rockShadow.getTarget,
      underwaterPass: underwaterPass.getTargets,
      swashPingPongWrite: () => ({
        width: 512,
        height: 256,
        samples: 0,
        depthBuffer: false,
        texture: swashRig.texture
      })
    },
    (long.texture.image.data.byteLength * 1.75)
      + long.previousPixels.byteLength
      + (short.texture.image.data.byteLength * 1.75)
      + (chop.texture.image.data.byteLength * 1.75)
      + (bathymetry.texture.image?.data?.byteLength || 0)
      + (detail.image?.data?.byteLength || 0)
      + foamPrevX.byteLength + foamPrevZ.byteLength
      + (64 * 64 * 4 * 5)
      + (2048 * 16 * 4)
  );

  // Stage 5: True Multi-Threaded KHR_parallel_shader_compile Burst + Live Per-Program Progress Bar
  await skyCloudEnv.starReadyPromise;

  phase = 24.0;
  sampleTime = 24.0;
  lastShortWavePhase = 24.0;
  lastChopWavePhase = 24.0 - (1 / 120);
  ocean.uniforms.longMix.value = 0;
  ocean.uniforms.time.value = 24.0;

  if (isMobileDevice && $('quality')) {
    $('quality').value = 'mobile';
  }
  applyQualityTier($('quality').value || (isMobileDevice ? 'mobile' : 'medium'), false, true);
  applyWaterOptics(null, true);
  setCoastMode(true);
  highlightPreset('previewCoast');
  target.set(0, 0.05, 5.8);
  yaw = 0.11;
  pitch = 0.265;
  distance = 43.0;
  evaluateSolarUniforms(15.60, false, true);

  const hdrCompileRT = cinemaPost.ensureCompileTarget();
  depthCapture.ensureTargets();
  ocean.uniforms.depthEnabled.value = 1;
  syncOpticsMaterial();
  cam(0);
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  const offscreenSpecs = [
    ...foamTexture.getCompileSpecs(),
    ...splashFlipbook.getCompileSpecs(),
    ...coastalRocks.getCompileSpecs(),
    ...rockShadow.getCompileSpecs(),
    ...skyCloudEnv.getCompileSpecs(),
    ...swashRig.getCompileSpecs(),
    ...depthCapture.getCompileSpecs(),
    ...underwaterPass.getCompileSpecs(),
    ...cinemaPost.getCompileSpecs()
  ];

  setLoadingProgress(72, t('bootStage5'));
  setShaderCompileProgress(0, offscreenSpecs.length + 6, t('shaderDispatch'), threadBadgeText, true);
  await nextBrowserPaint();

  const submitStartMs = performance.now();
  const prevCompileTarget = renderer.getRenderTarget();
  const prevCompileTone = renderer.toneMapping;
  const seenProgramIds = new Set();
  const compileEntries = [];
  const registerCompiledMaterial = (mat, label) => {
    const prog = mat ? renderer.properties.get(mat)?.currentProgram : null;
    if (prog && !seenProgramIds.has(prog.id)) {
      seenProgramIds.add(prog.id);
      compileEntries.push({ label, program: prog });
    }
  };

  try {
    // 1) Submit all Linear HDR offscreen passes (exact NoToneMapping + LinearSRGBColorSpace cache keys!)
    renderer.setRenderTarget(hdrCompileRT);
    renderer.toneMapping = THREE.NoToneMapping;
    for (const spec of offscreenSpecs) {
      if (spec.targetMode !== 'hdr') continue;
      renderer.compile(spec.scene, spec.camera);
      for (const mat of spec.materials) registerCompiledMaterial(mat, spec.label);
    }

    // 2) Submit all 3D scene shaders under the exact HDR render target state used by DepthCapture & CinemaPost
    const prevSplashVis = rockSplash.mesh.visible;
    rockSplash.mesh.visible = true;
    renderer.compile(scene, camera);
    rockSplash.mesh.visible = prevSplashVis;

    registerCompiledMaterial(ocean.mesh.material, t('progOffshore'));
    registerCompiledMaterial(coastalRocks.material, t('progRocks'));
    registerCompiledMaterial(seabedMaterial, t('progSeabed'));
    registerCompiledMaterial(skyCloudEnv.skyMesh.material, t('progSky'));
    registerCompiledMaterial(foamLayer.mesh.material, t('progFoam'));
    registerCompiledMaterial(rockSplash.material, t('progSplash'));

    // 3) Submit canvas-output post-processing passes under exact canvas sRGB + tone-mapping states
    for (const spec of offscreenSpecs) {
      if (spec.targetMode === 'hdr') continue;
      renderer.setRenderTarget(null);
      renderer.toneMapping = spec.targetMode === 'canvasTone' ? prevCompileTone : THREE.NoToneMapping;
      renderer.compile(spec.scene, spec.camera);
      for (const mat of spec.materials) registerCompiledMaterial(mat, spec.label);
    }
    // Flush WebGL command ring buffer immediately so ANGLE/GPU driver worker threads start all FXC jobs right now!
    gl.flush();
  } finally {
    renderer.setRenderTarget(prevCompileTarget);
    renderer.toneMapping = prevCompileTone;
  }

  parallelCompileStats.compileSubmitMs = +(performance.now() - submitStartMs).toFixed(2);
  parallelCompileStats.totalPrograms = compileEntries.length;

  // Overlap CPU spectral FFT & offshore Jacobian foam equilibration while GPU background threads compile shaders!
  let cpuWarmStage = 0;
  const runNextCpuWarmupSlice = () => {
    if (cpuWarmStage === 0) {
      long.update(24.0);
      uploadLongPrevious();
      previousGradient = long.maxGradient;
      cpuWarmStage = 1;
    } else if (cpuWarmStage === 1) {
      short.update(24.0);
      chop.update(24.0);
      syncBound();
      cpuWarmStage = 2;
    } else if (cpuWarmStage >= 2 && cpuWarmStage < 5) {
      for (let i = 0; i < 4; i++) updateOffshoreFoam(0.12);
      cpuWarmStage++;
      if (cpuWarmStage === 5) foamField.syncMaterialHistory();
    }
  };

  const pollStartMs = performance.now();
  const totalProgs = Math.max(1, compileEntries.length);
  while (true) {
    runNextCpuWarmupSlice();
    let readyCount = 0;
    let activeLabel = '';
    for (let i = 0; i < compileEntries.length; i++) {
      const entry = compileEntries[i];
      if (entry.program.isReady()) {
        readyCount++;
      } else if (!activeLabel) {
        activeLabel = entry.label;
      }
    }
    parallelCompileStats.readyPrograms = readyCount;
    const ratio = readyCount / totalProgs;
    setLoadingProgress(
      72 + Math.round(23 * ratio),
      currentLang === 'en'
        ? `Parallel GPU shader compilation (${readyCount} / ${compileEntries.length})…`
        : `多執行緒平行編譯 GPU 著色器 (${readyCount} / ${compileEntries.length})…`
    );
    if (readyCount >= compileEntries.length) {
      setShaderCompileProgress(
        compileEntries.length,
        compileEntries.length,
        currentLang === 'en'
          ? `All ${compileEntries.length} GPU shader programs compiled`
          : `全部 ${compileEntries.length} 組 GPU 著色器平行編譯完成`,
        threadBadgeText,
        true
      );
      break;
    }
    setShaderCompileProgress(
      readyCount,
      compileEntries.length,
      currentLang === 'en' ? `Compiling: ${activeLabel}` : `平行編譯中：${activeLabel}`,
      threadBadgeText,
      true
    );
    await nextBrowserPaint();
  }
  parallelCompileStats.parallelCompileMs = +(performance.now() - pollStartMs).toFixed(1);

  // Stage 6: Instantaneous GPU Atlas Bakes, PDE Swash Warmup & First Optical Frame (0ms shader stall!)
  setLoadingProgress(97, t('bootStage6'));
  await nextBrowserPaint();

  const bakeStartMs = performance.now();
  while (cpuWarmStage < 5) runNextCpuWarmupSlice();
  foamTexture.bake();
  splashFlipbook.bake();
  coastalRocks.bakeSurface();
  swashRig.warmup(24.0, ocean.uniforms.amplitude.value, ocean.uniforms.foamBoost.value, (simT, stepDt, amp, boost) => {
    rockSplash.step(simT, stepDt, amp, boost, false, false);
  });
  rockSplash.flush();
  ocean.uniforms.swashStateMap.value = swashRig.texture;

  applyTimeOfDay(15.60, true);
  cam(0);
  renderFrame();
  parallelCompileStats.bakeWarmupMs = +(performance.now() - bakeStartMs).toFixed(1);
  parallelCompileStats.totalBootMs = +(performance.now() - bootStartMs).toFixed(1);
  perfMonitor.refreshMemory();
  perfMonitor.resetHistory();

  bindUIControls();

  window.oceanDebug = {
    seek: seekTo,
    applyPreset: name => applyPreset(name, true),
    setTerrainKind,
    setTimeOfDay: h => applyTimeOfDay(h, true),
    setWaterOptics: opts => applyWaterOptics(opts, true),
    setImmersiveMode,
    getLanguage: () => currentLang,
    setLanguage: (lang, persist = true) => applyLanguage(lang, persist),
    setFpsCap: cap => perfMonitor.setFpsCap(cap),
    setQuality(mode) {
      return applyQualityTier(mode, true);
    },
    setOrbit(tx, ty, tz, yawVal, pitchVal, distVal) {
      diveMode = false;
      camGlide.active = false;
      cameraLift = 0;
      releaseLift = false;
      target.set(tx, ty, tz);
      yaw = yawVal;
      pitch = pitchVal;
      distance = distVal;
      cam(0);
      renderFrame();
    },
    setPlaying(on) {
      playing = !!on;
      $('previewPause').textContent = playing ? t('btnPause') : t('btnResume');
      if (!playing) $('frameStatus').textContent = t('statusPaused');
    },
    oceanAudio,
    perf: () => perfMonitor.getSnapshot(),
    status: () => ({
      language: currentLang,
      phase,
      playing,
      guiHidden,
      quality: activeQualityTier,
      timeOfDay: currentTimeHours,
      nightMix: +ocean.uniforms.uNightMix.value.toFixed(3),
      waterPalette: $('waterPalette').value,
      waterDepthScale: ocean.uniforms.waterDepthScale.value,
      terrain: $('terrainPreset').value,
      amplitude: ocean.uniforms.amplitude.value,
      foamBoost: ocean.uniforms.foamBoost.value,
      diveMode,
      audio: oceanAudio.status(),
      rockSplash: rockSplash.getStats(),
      neuralAtmosphere: skyCloudEnv.stats(),
      parallelCompile: { ...parallelCompileStats },
      perf: perfMonitor.getSnapshot(),
      gpu: window.gpuDebug.status(),
      programs: renderer.info.programs?.length ?? 0
    }),
    renderer,
    scene,
    camera
  };

  setLoadingProgress(100, t('bootDone'));
  const loadingScreenEl = document.getElementById('loadingScreen');
  if (loadingScreenEl) {
    loadingScreenEl.classList.add('is-hidden');
  }
  clock.getDelta();
  loop();
}

bootNeuralSpecOcean();
