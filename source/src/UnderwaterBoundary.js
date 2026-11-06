/** Local reflected-ray transport with confidence-weighted scene sampling.
 * No camera-wide blend; only the reflected radiance source transitions where
 * the projected scene sample loses validity. Original v4 remains selectable.
 */
export const underwaterBoundaryGLSL=`
uniform sampler2D boundaryHeightMap;uniform vec2 boundaryMapCenter;uniform float boundaryMapRadius;
float reflectedWaterCoverage(vec3 p){vec2 uv=(p.xz-boundaryMapCenter)/(2.*boundaryMapRadius)+.5;float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));float validity=smoothstep(0.,2./256.,edge);float height=textureLod(boundaryHeightMap,clamp(uv,0.,1.),0.).r;return mix(1.,smoothstep(-.06,.06,height-p.y),validity);}
vec3 occupancyTransport(vec3 origin,vec3 direction,float lengthRay,vec3 boundary,float boundaryWeight){
 vec3 ss=vec3(.025,.035,.045),extinction=max(absorption,vec3(0.))+ss,throughput=vec3(1.),accumulated=vec3(0.);float occupied=0.,weightedDepth=0.;
 vec3 endpoint=origin+direction*lengthRay;
 if(kdActive>.5)boundary*=verticalObjectLight(endpoint);
 int occSteps=boundaryClosure<.5?12:0;
 for(int i=0;i<occSteps;i++){float a=float(i)/12.,b=float(i+1)/12.,start=a*a*lengthRay,finish=b*b*lengthRay;vec3 q=origin+direction*((start+finish)*.5);float wet=reflectedWaterCoverage(q),dsWet=(finish-start)*wet;vec3 segmentT=exp(-extinction*dsWet);occupied+=dsWet;weightedDepth+=max(0.,origin.y-q.y)*dsWet;if(kdActive>.5)accumulated+=throughput*(ss/extinction)*(depthIrradiance(q)/(4.*PI))*(1.-segmentT);throughput*=segmentT;}
 if(kdActive<.5){float meanDepth=weightedDepth/max(occupied,.001);vec3 source=vec3(.10,.19,.23)*exp(-vec3(.09,.045,.025)*meanDepth)*ss/extinction;accumulated=source*(1.-throughput);}
 return boundary*boundaryWeight*throughput+accumulated;
}
float secondaryDebugConfidence=0.;float secondaryDebugF=0.;
float cachedBoundaryHeight(vec2 p){vec2 uv=(p-boundaryMapCenter)/(2.*boundaryMapRadius)+.5;return textureLod(boundaryHeightMap,clamp(uv,0.,1.),0.).r;}
float boundaryCacheConfidence(vec2 p){vec2 uv=(p-boundaryMapCenter)/(2.*boundaryMapRadius)+.5;float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));return smoothstep(1./256.,3./256.,edge);}
vec3 homogeneousTransport(vec3 origin,vec3 direction,float lengthRay,vec3 boundary,float boundaryWeight){
 vec3 ss=vec3(.025,.035,.045),extinction=max(absorption,vec3(0.))+ss,throughput=vec3(1.),result=vec3(0.);vec3 endpoint=origin+direction*lengthRay;if(kdActive>.5)boundary*=verticalObjectLight(endpoint);
 float ds=lengthRay/12.;vec3 st=exp(-extinction*ds);
 int homSteps=kdActive>.5?12:0;
 if(homSteps>0){for(int i=0;i<homSteps;i++){vec3 q=origin+direction*(float(i)+.5)*ds;result+=throughput*(ss/extinction)*(depthIrradiance(q)/(4.*PI))*(1.-st);throughput*=st;}}
 else{throughput=exp(-extinction*lengthRay);float meanDepth=max(0.,origin.y-endpoint.y)*.5;result=vec3(.10,.19,.23)*exp(-vec3(.09,.045,.025)*meanDepth)*ss/extinction*(1.-throughput);}
 return result+boundary*boundaryWeight*throughput;
}
float firstSecondaryExit(vec3 origin,vec3 direction,float maxDistance,out float exitDistance,out vec3 exitNormal,out vec3 exitPoint){
 exitDistance=maxDistance;exitNormal=vec3(0.,1.,0.);exitPoint=origin;
 float resultConfidence=0.,originConfidence=boundaryCacheConfidence(origin.xz),previous=0.;
 vec3 start=origin;bool searching=originConfidence>0.;
 if(searching){start.y=min(start.y,cachedBoundaryHeight(start.xz)-.015);float adjustment=origin.y-start.y;originConfidence*=1.-smoothstep(.04,.12,adjustment);searching=originConfidence>0.;}
 int maxExitSteps=boundaryClosure>.5?16:0;
 int maxBisect=boundaryClosure>.5?4:0;
 for(int i=1;i<=maxExitSteps;i++){
  if(searching){float t=float(i)/16.,distance=t*t*maxDistance;vec3 q=start+direction*distance;
   if(boundaryCacheConfidence(q.xz)<=0.){searching=false;}
   else{float signedDepth=cachedBoundaryHeight(q.xz)-q.y;
    if(signedDepth<0.){float lo=previous,hi=distance;for(int j=0;j<maxBisect;j++){float m=(lo+hi)*.5;vec3 r=start+direction*m;if(cachedBoundaryHeight(r.xz)-r.y>=0.)lo=m;else hi=m;}
     exitDistance=(lo+hi)*.5;vec3 hit=start+direction*exitDistance;exitPoint=hit;float e=(2.*boundaryMapRadius)/256.;float dx=(cachedBoundaryHeight(hit.xz+vec2(e,0.))-cachedBoundaryHeight(hit.xz-vec2(e,0.)))/(2.*e),dz=(cachedBoundaryHeight(hit.xz+vec2(0.,e))-cachedBoundaryHeight(hit.xz-vec2(0.,e)))/(2.*e);exitNormal=normalize(vec3(-dx,1.,-dz));resultConfidence=originConfidence*boundaryCacheConfidence(hit.xz)*smoothstep(0.,.025,-signedDepth);searching=false;
    }
    previous=distance;
   }
  }
 }
 return resultConfidence;
}
vec3 unresolvedSecondaryReflection(vec3 origin,vec3 direction,float remaining,vec3 originalDirection,vec3 originalBoundary,float originalWeight){
 float turn=smoothstep(.002,.20,1.-clamp(dot(direction,originalDirection),-1.,1.));float raw=max(.02,(origin.y-illuminationBed(origin.xz))/max(-direction.y,.0001)),distance=mix(remaining,min(raw,remaining),turn);vec3 hit=origin+direction*distance;float bedWeight=smoothstep(0.,.005,-direction.y)*(1.-smoothstep(max(0.,remaining-2.),max(remaining,.001),raw));float grain=textureLod(detailMap,hit.xz*.19,0.).r;vec3 sand=mix(vec3(.30,.245,.16),vec3(.50,.405,.265),grain);vec3 boundary=mix(originalBoundary,sand,turn);float weight=mix(originalWeight,bedWeight,turn);return homogeneousTransport(origin,direction,max(0.,distance),boundary,weight);
}
vec3 reflectedTransport(vec3 origin,vec3 direction,float lengthRay,vec3 boundary,float boundaryWeight){
 secondaryDebugConfidence=0.;secondaryDebugF=0.;
 // One initialized accumulator and one return: avoids ambiguous inlined return
 // temporaries on ANGLE/D3D without changing either optical model.
 vec3 result=vec3(0.);
 if(boundaryClosure<.5){result=occupancyTransport(origin,direction,lengthRay,boundary,boundaryWeight);}
 else{
  result=homogeneousTransport(origin,direction,lengthRay,boundary,boundaryWeight);
  float exitDistance=lengthRay;vec3 normal=vec3(0.,1.,0.),exitPoint=origin;
  float confidence=firstSecondaryExit(origin,direction,lengthRay,exitDistance,normal,exitPoint);
  if(confidence>0.){
   float ci=clamp(dot(direction,normal),0.,1.),eta=1.333,sin2=eta*eta*(1.-ci*ci),ct=sqrt(max(0.,1.-sin2));float rs=(eta*ci-ct)/max(eta*ci+ct,.0001),rp=(ci-eta*ct)/max(ci+eta*ct,.0001),F=sin2>=1.?1.:.5*(rs*rs+rp*rp);
   vec3 hit=exitPoint,airDirection=refract(direction,-normal,eta),returnDirection=reflect(direction,normal);
   confidence*=smoothstep(.01,.08,ci);secondaryDebugConfidence=confidence;secondaryDebugF=F;float remaining=max(0.,lengthRay-exitDistance);vec3 transmittedSky=sin2<1.?sky(airDirection):vec3(0.);vec3 incoming=(1.-F)*transmittedSky+F*unresolvedSecondaryReflection(hit,returnDirection,remaining,direction,boundary,boundaryWeight);
   vec3 extinction=max(absorption,vec3(0.))+vec3(.025,.035,.045);vec3 firstLeg=homogeneousTransport(hit-direction*exitDistance,direction,exitDistance,vec3(0.),0.);vec3 closed=firstLeg+exp(-extinction*exitDistance)*incoming;
   result=mix(result,closed,confidence);
  }
 }
 return result;
}
vec4 filteredReflectionColor(vec2 uv,vec3 expectedHit){
 vec2 pixel=uv*reflectionResolution-.5,base=floor(pixel),f=fract(pixel);vec3 total=vec3(0.);float weightSum=0.;
 float tolerance=max(.12,length(expectedHit-vWorld)*.025);
 for(int y=0;y<2;y++){for(int x=0;x<2;x++){vec2 tap=(base+vec2(float(x),float(y))+.5)/reflectionResolution;float depth=textureLod(reflectionDepth,tap,0.).r;vec4 q=reflectionInverseProjection*vec4(tap*2.-1.,depth*2.-1.,1.);q/=q.w;vec3 hit=(reflectionCameraWorld*q).xyz;float w=(x==0?1.-f.x:f.x)*(y==0?1.-f.y:f.y);float sameLayer=1.-smoothstep(tolerance*.5,tolerance,length(hit-expectedHit));if(depth<.999999){total+=textureLod(reflectionColor,tap,0.).rgb*w*sameLayer;weightSum+=w*sameLayer;}}}
 return vec4(total/max(weightSum,.00001),weightSum);
}
vec3 continuousReflection(vec3 origin,vec3 direction,out float confidence,out float opticalDistance){
 float floorY=illuminationBed(origin.xz),rawDistance=max(.02,(origin.y-floorY)/max(-direction.y,.0001)),distanceRay=clamp(rawDistance,.02,100.);
 vec3 target=origin+direction*distanceRay;
 if(beachMode>.5){for(int j=0;j<3;j++){floorY=illuminationBed(target.xz);rawDistance=max(.02,(origin.y-floorY)/max(-direction.y,.0001));distanceRay=clamp(rawDistance,.02,100.);target=origin+direction*distanceRay;}}
 float bedWeight=smoothstep(0.,.005,-direction.y)*(1.-smoothstep(70.,100.,rawDistance));
 float grain=textureLod(detailMap,target.xz*.19,0.).r;vec3 bedRadiance=mix(vec3(.30,.245,.16),vec3(.50,.405,.265),grain);
 confidence=0.;opticalDistance=distanceRay;
 vec3 effDir=direction,effBoundary=bedRadiance;float effDist=distanceRay,effWeight=bedWeight;
 vec4 clip=reflectionProjection*reflectionView*vec4(target,1.);vec2 uv=clip.xy/max(clip.w,.0001)*.5+.5;
 if(clip.w>0.&&all(greaterThan(uv,vec2(.003)))&&all(lessThan(uv,vec2(.997)))){
  float raw=textureLod(reflectionDepth,uv,0.).r;vec4 q=reflectionInverseProjection*vec4(uv*2.-1.,raw*2.-1.,1.);q/=q.w;vec3 hit=(reflectionCameraWorld*q).xyz,delta=hit-origin;float along=dot(delta,direction),offRay=length(delta-direction*along),tolerance=max(.22,along*.12);
  if(raw<.999999&&along>0.&&hit.y<origin.y+.12&&offRay<tolerance){
   float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));
   confidence=smoothstep(.003,.045,edge)*(1.-smoothstep(.5*tolerance,tolerance,offRay))*smoothstep(0.,.15,along)*(1.-smoothstep(70.,100.,along));
   confidence*=1.-smoothstep(origin.y-.08,origin.y+.12,hit.y);
   float hitDistance=clamp(length(delta),.02,100.);vec4 filtered=filteredReflectionColor(uv,hit);confidence*=smoothstep(0.,.65,filtered.a);
   effDir=normalize(mix(direction,normalize(delta),confidence));
   effDist=mix(distanceRay,hitDistance,confidence);
   effBoundary=mix(bedRadiance,filtered.rgb,confidence);
   effWeight=mix(bedWeight,1.,confidence);
   opticalDistance=effDist;
  }
 }
 return reflectedTransport(origin,effDir,effDist,effBoundary,effWeight);
}
`;
