/** RGB engineering approximation inspired by depth-dependent downwelling illumination.
 * Kd is NOT sigmaA+sigmaS. Values below are editable assumptions, not measured Jerlov data.
 * This does not reproduce the paper's eight-band spectral / froxel pipeline.
 */
export const underwaterLightingGLSL=`
${terrainGLSL}

uniform float kdActive,kdSurfaceIrradiance;
uniform vec3 kdAttenuation,kdBedReflectance;
float illuminationBed(vec2 p){return beachMode>.5?sharedTerrainBed(p):-4.;}
vec3 verticalObjectLight(vec3 p){return exp(-max(kdAttenuation,vec3(0.))*max(0.,-p.y));}
vec3 depthIrradiance(vec3 p){float y=max(0.,-p.y),yf=max(y,-illuminationBed(p.xz));vec3 kd=max(kdAttenuation,vec3(0.));return kdSurfaceIrradiance*(exp(-kd*y)+(kdBedReflectance/3.14159265)*exp(-kd*max(0.,2.*yf-y)));}
`;
