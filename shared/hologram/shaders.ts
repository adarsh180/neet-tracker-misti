// Extracted from the supplied Synapse_NEET_Interactive.html. No external assets.
export const vertexSource = `precision highp float;
attribute vec3 aOrbit; attribute vec3 aHelix; attribute vec3 aBloom; attribute vec3 aEclipse; attribute vec4 aData;
uniform float uStars; uniform float uStill; uniform vec4 uWeights; uniform vec2 uPointer; uniform vec2 uDrag; uniform float uTime; uniform float uAspect; uniform float uDpr; uniform float uBurst; uniform float uEnergy; uniform mediump float uDawn; uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uColorC;
varying mediump vec3 vColor; varying mediump float vAlpha;
vec3 rx(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);}
vec3 ry(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);}
vec3 rz(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c-p.y*s,p.x*s+p.y*c,p.z);}
void main(){if(uStars>.5){gl_Position=vec4(aOrbit.xy+uPointer*.006*aData.z,0.,1.);gl_PointSize=(.65+aData.z)*uDpr;vColor=mix(uColorA,uColorB,aData.x);vAlpha=(.12+aData.w*.22)*(.65+.35*sin(uTime*.6+aData.y*6.28));return;}vec3 p=aOrbit*uWeights.x+aHelix*uWeights.y+aBloom*uWeights.z+aEclipse*uWeights.w;
float wave=sin(aData.x*24.0+uTime*1.1)*.007*(1.0-uStill);
p+=vec3(sin(p.y*3.0+uTime),cos(p.x*3.0+uTime*.7),sin(p.x*2.0-uTime*.5))*(.012+uEnergy*.035)*(1.0-uStill);
p*=1.0+wave+uEnergy*.12;
p+=normalize(p+vec3(.001))*uBurst*(.20+aData.z*.32);
float spin=uTime*.115*(1.0-uWeights.z*.72-uWeights.w*.80)+uDrag.x;
p=rz(p,-.24+uWeights.y*.18+uWeights.w*.38);
p=ry(p,spin+uPointer.x*.25);
p=rx(p,.13+uPointer.y*.22+uDrag.y);
float depth=4.6-p.z;float scale=2.13/depth;gl_Position=vec4(p.x*scale/uAspect,p.y*scale,0.0,1.0);
gl_PointSize=clamp((1.7+aData.z*1.7)*uDpr*4.6/depth*(1.0+uEnergy*.25),1.0,8.0);
float mixValue=clamp(aData.x*.55+(p.y+1.7)/3.4*.5,0.0,1.0);
vColor=mix(uColorA,uColorB,smoothstep(.32,.77,mixValue));vColor=mix(vColor,uColorC,aData.w*.16);
float front=clamp((p.z+1.7)/3.4,0.0,1.0);vAlpha=(.38+front*.58)*(1.0-uDawn*.08);}
`;
export const fragmentSource = `precision mediump float; varying mediump vec3 vColor; varying mediump float vAlpha; uniform mediump float uDawn;
void main(){vec2 uv=gl_PointCoord-vec2(.5);float d=length(uv);if(d>.5)discard;float a=pow(1.0-smoothstep(.02,.50,d),1.6)*vAlpha;vec3 c=mix(vColor,vec3(1.0),pow(max(0.0,1.0-d*3.5),4.0)*.15*(1.0-uDawn));gl_FragColor=vec4(c,a);}
`;
