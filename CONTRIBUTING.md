# Contributing to NeuralSpecOcean

Contributions to **NeuralSpecOcean**—including numerical hydrodynamics, radiative transfer accuracy, physics-informed neural network formulations, shader optimization, and cross-platform compatibility—are welcome via GitHub Issues and Pull Requests.

歡迎對 **NeuralSpecOcean** 提交數值流體力學、海洋光學輻射傳輸、物理導向神經網路架構、WebGL2 著色器最佳化及跨平台相容性之 Issue 與 Pull Request。

---

## Build and Verification Workflow / 建置與驗證流程

NeuralSpecOcean maintains modular ES source files under [`source/src/`](./source/src/) and compiles them into a single self-contained HTML artifact ([`index.html`](./index.html)) using the Python standard library ([`source/build.py`](./source/build.py)).

1. Modify modular source files in `source/src/*.js`, `source/demo.js`, or `source/template.html`.
2. Rebuild the standalone artifact (requires Python 3.8+, standard library only):
   ```bash
   python source/build.py
   ```
3. Execute automated headless GPU verification and telemetry checks (optional; requires Google Chrome / Chromium and Node.js 20+):
   ```bash
   node tools/verify_gpu_render.mjs
   ```

---

## Engineering Standards / 工程準則

1. **Zero Per-Frame Heap Allocations**: Avoid instantiating objects (`THREE.Vector3`, `Array`, closures) inside per-frame simulation or rendering loops. Pre-allocate typed arrays and scratch vectors at module initialization.
2. **Parallel Shader Compilation Alignment**: Offscreen and post-processing passes must implement `getCompileSpecs()` with accurate `'hdr' | 'canvasNoTone' | 'canvasTone'` target descriptors so that Three.js `programCacheKey` hashes match runtime render states during `KHR_parallel_shader_compile` pre-compilation.
3. **Physical and Mathematical Consistency**: Modifications to hydrodynamics, optics, or neural surrogates must preserve physical conservation bounds (e.g., dielectric Fresnel reflectance within $`[0, 1]`$, non-negative Clausius–Duhem dissipation $`\mathcal{D} \ge 0`$, and strictly positive mesh Jacobians $`J \gt 0`$).

---

## License / 授權條款

By submitting a contribution, you agree that your contribution is licensed under the [MIT License](./LICENSE).
