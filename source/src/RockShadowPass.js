/* Zero-Runtime-Overhead Cached 2048x2048 Directional Sun Shadow Map for Coastal Sea-Stacks & Boulders.
 *
 * Renders static coastal rock formations once from sunDirection into a hardware 24-bit DepthTexture
 * (0.00 ms per-frame cost during playback; rebaked automatically on terrain preset switches).
 * Sampled across Rocks, Beach Sand, Wet Water Film, Ocean Surf, and Sea Foam via 6-tap Vogel-IGN soft penumbra!
 */
export function createRockShadowPass(THREE, renderer, rockMesh, sunDirUniform) {
  let currentRes = 1024;
  let shadowsActive = true;
  const depthTexture = new THREE.DepthTexture(currentRes, currentRes, THREE.UnsignedIntType);
  depthTexture.minFilter = THREE.NearestFilter;
  depthTexture.magFilter = THREE.NearestFilter;

  const target = new THREE.WebGLRenderTarget(currentRes, currentRes, {
    format: THREE.RedFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
    depthTexture
  });

  // Orthographic sun frustum tightly framing all coastal headlands, surf reefs & diagonal beach shadows
  const shadowCam = new THREE.OrthographicCamera(-178, 178, 60, -60, 2.0, 320.0);
  const shadowMatrix = new THREE.Matrix4();
  const shadowEnabled = { value: 0 };

  const depthScene = new THREE.Scene();
  const depthMat = new THREE.ShaderMaterial({
    colorWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `void main(){ gl_FragColor = vec4(0.0); }`
  });
  const shadowCaster = new THREE.Mesh(rockMesh.geometry, depthMat);
  shadowCaster.frustumCulled = false;
  depthScene.add(shadowCaster);
  const scratchSunDir = new THREE.Vector3();
  const scratchCenter = new THREE.Vector3(0, 0.5, 6.0);
  const scratchVp = new THREE.Vector4();
  const scratchSc = new THREE.Vector4();

  function bake() {
    if (!shadowsActive) {
      shadowEnabled.value = 0;
      return;
    }
    scratchSunDir.copy(sunDirUniform.value).normalize();
    shadowCam.position.copy(scratchCenter).addScaledVector(scratchSunDir, 120.0);
    shadowCam.up.set(0, 1, 0);
    shadowCam.lookAt(scratchCenter);
    shadowCam.updateProjectionMatrix();
    shadowCam.updateMatrixWorld(true);

    shadowMatrix.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse);
    shadowCaster.geometry = rockMesh.geometry;

    const oldTarget = renderer.getRenderTarget();
    const oldAuto = renderer.autoClear;
    renderer.getViewport(scratchVp);
    renderer.getScissor(scratchSc);
    const st = renderer.getScissorTest();
    try {
      renderer.autoClear = true;
      renderer.setScissorTest(false);
      renderer.setRenderTarget(target);
      renderer.clear(true, true, false);
      renderer.render(depthScene, shadowCam);
      shadowEnabled.value = 1;
    } finally {
      renderer.autoClear = oldAuto;
      renderer.setRenderTarget(oldTarget);
      renderer.setViewport(scratchVp);
      renderer.setScissor(scratchSc);
      renderer.setScissorTest(st);
    }
  }

  function setResolution(res, doBake = true) {
    const nextRes = res | 0;
    if (nextRes <= 0) {
      shadowsActive = false;
      shadowEnabled.value = 0;
      if (currentRes !== 4) {
        currentRes = 4;
        target.setSize(4, 4);
      }
      return;
    }
    shadowsActive = true;
    if (currentRes !== nextRes) {
      currentRes = nextRes;
      target.setSize(currentRes, currentRes);
    }
    if (doBake) bake();
  }

  return {
    depthTexture,
    getTarget: () => (shadowsActive ? target : null),
    shadowMatrix,
    shadowEnabled,
    bake,
    setResolution,
    getCompileSpecs: () => [{
      label: '海岸礁岩太陽深度陰影 (RockShadow)',
      scene: depthScene,
      camera: shadowCam,
      materials: [depthMat],
      targetMode: 'hdr'
    }],
    get resolution() { return shadowsActive ? currentRes : 0; },
    dispose() {
      target.dispose();
      depthTexture.dispose();
      depthMat.dispose();
    }
  };
}
