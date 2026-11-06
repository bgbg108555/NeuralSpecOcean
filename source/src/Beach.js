export function createBeach(THREE, detailMap, swashStateUniform, bathymetryUniform, timeUniform, amplitudeUniform, shoreDetail, shoreDebug, foamScaleDebug, segs = 272) {
  const geo = new THREE.PlaneGeometry(350, 350, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const u = p.getZ(i) / 175;
    // Strictly monotonic coastal warp (ds/du = 1 - 0.23*pi*cos(pi*u) >= 0.277 > 0 — 35cm swash spacing with -294K tris/frame!)
    const z = Math.max(-175, Math.min(175, (u - 0.23 * Math.sin(Math.PI * u)) * 175));
    p.setXYZ(i, x, shoreBed(x, z), z);
  }
  p.needsUpdate = true;
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
  geo.computeVertexNormals();
  expandCoastalGround(geo, shoreBed);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...terrainUniforms,
      bathymetryMap: bathymetryUniform,
      swashStateMap: swashStateUniform,
      detailMap: { value: detailMap },
      time: timeUniform,
      amplitude: amplitudeUniform || { value: 0.6 },
      shoreDetail,
      shoreDebug,
      foamScaleDebug,
      foamWorldDetail: { value: 1 },
      foamFilamentMode: { value: 1 },
      foamTransport: { value: 0 },
      foamTransportMix: { value: 1 },
      foamBoost: { value: 1 },
      foamMaterialMap: { value: detailMap },
      skyEnvMap: { value: detailMap },
      skyEnvReady: { value: 0 },
      rockShadowMap: { value: detailMap },
      rockShadowMatrix: { value: new THREE.Matrix4() },
      rockShadowEnabled: { value: 0 },
      sunDirection: { value: new THREE.Vector3(-0.24, 0.39, -0.888).normalize() },
      skyTop: { value: new THREE.Vector3(0.042, 0.165, 0.44) },
      skyHorizon: { value: new THREE.Vector3(0.34, 0.49, 0.63) },
      uNightMix: { value: 0.0 }
    },
    vertexShader: `varying vec3 w;varying vec3 n;
void main(){
  w = (modelMatrix * vec4(position, 1.0)).xyz;
  n = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `uniform sampler2D detailMap;
uniform float amplitude, shoreDetail, shoreDebug, foamScaleDebug;
varying vec3 w, n;
${shoreVisualGLSL}
${coastalBackshoreGLSL}
void main(){
  float noise = texture2D(detailMap, w.xz * 0.24).r;
  float footprint = length(fwidth(w.xz * 1.5));
  float micro = texture2D(detailMap, w.xz * 1.6).r;
  float grainFade = 1.0 - smoothstep(0.18, 0.85, footprint);
  vec3 sand = mix(vec3(0.40, 0.325, 0.22), vec3(0.53, 0.445, 0.315), noise);
  float ripples = sin(dot(w.xz, normalize(vec2(0.31, 0.95))) * 6.5 + noise * 2.2) * grainFade;
  sand *= 1.0 + 0.032 * ripples + 0.09 * (micro - 0.5) * grainFade;
  float sunDiffuse = 0.72 + 0.32 * max(dot(normalize(n), normalize(vec3(-0.14, 0.46, -0.88))), 0.0);
  sand *= sunDiffuse;
  vec3 wetSand = evaluateBeachSand(sand, w, n, 0.0, ripples);
  sand = mix(sand, wetSand, shoreDetail);
  sand = coastalBackshore(sand, w);
  if (shoreDebug > 0.5) sand = shoreDebugColor(w, 0.0);
  if (foamScaleDebug > 0.5) sand = vec3(foamWorldDiagnostic(w.xz, foamScaleDebug));
  gl_FragColor = vec4(sand, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    }
  };
}
