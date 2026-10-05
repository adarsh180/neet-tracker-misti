/**
 * Morphing point-cloud shader. Two forms are resident at once (`aFrom`/`aTo`);
 * `uMorph` eases between them while each side runs its own `deform()` branch,
 * so the transition is two living shapes meeting, not two frozen ones fading.
 *
 * The `deform()` branch here mirrors `formDeform()` in ./forms.ts.
 */
export const morphVertexSource = `precision highp float;
attribute vec3 aFrom;attribute vec3 aTo;attribute vec4 aIF;attribute vec4 aIT;attribute vec4 aMeta;
uniform float uFrom;uniform float uTo;uniform float uMorph;uniform float uTime;uniform float uAspect;uniform float uDpr;uniform float uEnergy;uniform float uPulse;uniform float uGlow;uniform float uStars;uniform mediump float uLight;uniform vec2 uRotation;uniform vec2 uPointer;uniform vec3 uA;uniform vec3 uB;uniform vec3 uC;
varying mediump vec3 vColor;varying mediump float vAlpha;
vec3 rx(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);}
vec3 ry(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);}
vec3 rz(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c-p.y*s,p.x*s+p.y*c,p.z);}
vec3 deform(vec3 p,vec4 d,float k,float t){
if(k<-.5)return p;
if(k<.5){p+=sin(t*.85+p.yzx*3.)*.012;p=ry(p,t*.105);}
else if(k<1.5){p=ry(p,t*.24);p.x+=sin(p.y*3.-t*1.8)*.014;}
else if(k<2.5){float a=atan(p.y,p.x),r=length(p.xy);p.z+=.09*sin(t+r*4.+a*2.);p=rz(p,.08*sin(t*.15));}
else if(k<3.5){p=rx(rz(p,t*.13),1.10);}
else if(k<4.5){p.y+=.15*sin(p.x*2.7-t*.9+d.x*.8);p.z+=.16*cos(p.x*1.8+t*.6+d.x);}
else if(k<5.5){if(d.x<.5){float z=1.+.065*sin(t*1.5);p.xz*=z;p.y+=.065*cos(t*1.5);}else{p.x+=.11*sin(d.y*7.-t*1.3+d.z)*d.y;p.z+=.10*cos(d.y*8.-t*1.1+d.z)*d.y;}p.y+=.045*sin(t*.75);}
else if(k<6.5){if(d.x<2.5){p=rx(p,.50+d.x*.86+t*(.13+d.x*.05));p=ry(p,d.x*.85+t*.10);}else p*=1.+.045*sin(t*1.6);}
else if(k<7.5){float r=1.+.05*sin(p.z*6.-t*2.);p.xy*=r;p=ry(rz(p,t*.12),-.30);}
else if(k<8.5){p=rx(p,.43+.22*sin(t*.3));p.z+=.026*sin(d.y*18.849556-t*1.2);}
else if(k<9.5){float beat=pow(max(0.,sin(t*1.3-d.y*2.)),6.);p*=1.+.1*beat;p=ry(p,t*.09);}
else if(k<10.5){float a=pow(max(0.,sin(t*3.2)),14.),b=pow(max(0.,sin(t*3.2-.72)),22.);p*=1.+.055*a+.03*b;p=ry(p,.18*sin(t*.23));}
else if(k<11.5){p=ry(p,.28+.20*sin(t*.23));p=rz(p,.05*sin(t*.3));}
else if(k<12.5){float breath=.055*sin(t*.85+d.x*.35);p.xz*=1.+breath;p.y-=breath*d.y;p=rx(ry(p,t*.06),.55);}
else if(k<13.5){if(d.x>.5)p.z+=.025*sin(d.y*13.-t*1.8+d.z);p=ry(p,.16*sin(t*.18));}
else if(k<14.5){float w=d.y,a=t*.19+.38,c=cos(a),s=sin(a),nx=p.x*c-w*s;w=p.x*s+w*c;p.x=nx;a=t*.13+.2;c=cos(a);s=sin(a);float ny=p.y*c-p.z*s;p.z=p.y*s+p.z*c;p.y=ny;a=t*.11;c=cos(a);s=sin(a);float nz=p.z*c-w*s;w=p.z*s+w*c;p.z=nz;p*=2.85/(2.85-w);}
else {p=ry(p,.24*sin(t*.30));}
return p;}
void main(){
if(uStars>.5){gl_Position=vec4(aFrom.xy+uPointer*.006*aMeta.z,0.,1.);gl_PointSize=(.65+aMeta.z)*uDpr;vColor=mix(uA,uB,aMeta.x);vAlpha=(.12+aMeta.w*.22)*(.65+.35*sin(uTime*.6+aMeta.y*6.28));return;}
vec3 p=mix(deform(aFrom,aIF,uFrom,uTime),deform(aTo,aIT,uTo,uTime),uMorph);
p+=sin(p.yzx*2.5+uTime*1.1+aMeta.w*2.)*(.006+uEnergy*.036);
p*=1.+.018*sin(uTime*.85)+uEnergy*.05;
p+=normalize(p+vec3(.0001))*uPulse*(.22+aMeta.z*.32);
p=ry(p,uRotation.x);p=rx(p,uRotation.y);
float depth=5.4-p.z;float projection=2.95/depth;float fit=min(1.,uAspect);
gl_Position=vec4(p.x*projection/uAspect*fit,p.y*projection*fit,0.,1.);
gl_PointSize=clamp((1.5+aMeta.z*1.75)*uDpr*5.4/depth*(1.+uEnergy*.15),1.,9.);
float gradient=clamp(.34*aMeta.x+(p.y+1.7)/3.4*.67,0.,1.);
vColor=mix(uA,uB,smoothstep(.15,.92,gradient));vColor=mix(vColor,uC,aMeta.w*.19);
float front=clamp((p.z+1.7)/3.4,0.,1.);float twinkle=.84+.16*sin(uTime*1.5+aMeta.w*39.);
float travel=pow(max(0.,sin(aMeta.x*22.-uTime*1.45)),14.);
if(uTo>12.5&&uTo<13.5)travel=pow(max(0.,sin(aIT.y*9.-uTime*2.7)),16.);
if(uTo>.5&&uTo<1.5)travel=pow(max(0.,sin(p.y*5.-uTime*2.1)),18.);
vAlpha=(.37+front*.38+travel*.26)*twinkle*(.55+uGlow*.9);
if(uLight>.5){vColor*=vec3(.25,.40,.45);vAlpha*=.90;}
}`;

export const morphFragmentSource = `precision mediump float;varying mediump vec3 vColor;varying mediump float vAlpha;uniform mediump float uLight;
void main(){vec2 q=gl_PointCoord-vec2(.5);float d=length(q);if(d>.5)discard;float soft=pow(1.-smoothstep(.01,.5,d),1.65);float core=pow(max(0.,1.-d*4.),4.);vec3 c=mix(vColor,vec3(1.),core*.27*(1.-uLight));gl_FragColor=vec4(c,soft*vAlpha);}`;
