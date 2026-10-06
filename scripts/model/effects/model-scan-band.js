import * as THREE from 'three';
import { paletteGLSL, paletteUniforms } from './model-palette.js';

export const scanPalettes = ['Spectrum', 'vHuman', 'Phosphor', 'Amber', 'Ice Blue'];

// Shared by the particle and line shaders: one moving scan field and spectral trail.
export const scanBandGLSL = `
${paletteGLSL}
uniform mat4 worldToScan;
uniform int scanPalette;
uniform float scanHeight, scanWidth, scanDirection, scanStrength, edgeInteraction, lineResponse;
uniform float scanTime, scanUneven, scanVolume;
float scanHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float scanNoise(vec3 p){
  vec3 cell=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  float lower=mix(mix(scanHash(cell),scanHash(cell+vec3(1.,0.,0.)),f.x),
    mix(scanHash(cell+vec3(0.,1.,0.)),scanHash(cell+vec3(1.,1.,0.)),f.x),f.y);
  float upper=mix(mix(scanHash(cell+vec3(0.,0.,1.)),scanHash(cell+vec3(1.,0.,1.)),f.x),
    mix(scanHash(cell+vec3(0.,1.,1.)),scanHash(cell+vec3(1.,1.,1.)),f.x),f.y);
  return mix(lower,upper,f.z);
}
// The flat mode only needs four samples, not a full eight-corner volume.
float scanNoiseFlat(vec2 p){
  vec2 cell=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(scanHash(vec3(cell.x,0.,cell.y)),scanHash(vec3(cell.x+1.,0.,cell.y)),f.x),
    mix(scanHash(vec3(cell.x,0.,cell.y+1.)),scanHash(vec3(cell.x+1.,0.,cell.y+1.)),f.x),f.y);
}
// Shared world-space coordinates keep line fading and particles in sync.
float scanCoordinate(vec3 p){
  p=(worldToScan*vec4(p,1.)).xyz;
  if(scanUneven<=0.)return p.y;
  if(scanVolume<.5){
    vec2 cell=p.xz/max(scanWidth,.001)*2.;
    float broad=scanNoiseFlat(cell+vec2(scanTime*.18,-scanTime*.12));
    float pulse=scanNoiseFlat(cell*2.7+vec2(-scanTime*.45,scanTime*.3));
    return p.y-scanWidth*scanUneven*((broad-.5)*1.6+(pulse-.5)*.4);
  }
  // A volume of staggered patches, rather than one height per X/Z column.
  // Vertical variation lets patches build and dissolve independently.
  vec3 cell=p/max(scanWidth,.001);
  float broad=scanNoise(cell*1.4+vec3(scanTime*.22,-scanTime*.16,scanTime*.13));
  float pulse=scanNoise(cell*3.1+vec3(-scanTime*.55,scanTime*.38,scanTime*.29));
  float build=smoothstep(.2,.8,broad);
  return p.y-scanWidth*scanUneven*((build-.5)*3.6+(pulse-.5)*1.2);
}
float scanEnvelope(float y){
  // Keep coverage continuous when the sweep reverses; only color changes direction.
  return 1.-smoothstep(scanWidth*.4,scanWidth*.56,abs(scanHeight-y));
}
float scanBand(float y){return scanStrength*scanEnvelope(y);}
vec3 scanColor(float y, float colorOffset){
  float age=clamp(.5+(scanHeight-y)*scanDirection/scanWidth+colorOffset,0.,1.);
  if(scanPalette==1)return age<.5?mix(scanPaper,scanGray,smoothstep(0.,.5,age)):mix(scanGray,scanInk,smoothstep(.5,1.,age));
  if(scanPalette==2)return studioColor(mix(vec3(.4,1.,.12),vec3(.015,.16,.035),age));
  if(scanPalette==3)return studioColor(mix(vec3(1.,.65,.08),vec3(.28,.065,.008),age));
  if(scanPalette==4)return studioColor(mix(vec3(.42,.85,1.),vec3(.025,.1,.38),age));
  // Keep the cool end visible before fading back into the base palette.
  vec3 orange=vec3(1.,.18,.003), yellow=vec3(1.,.85,.005);
  vec3 green=vec3(.025,.9,.005), cyan=vec3(0.,.7,.95), blue=vec3(.005,.025,.9);
  if(age<.2)return studioColor(mix(orange,yellow,smoothstep(0.,.2,age)));
  if(age<.4)return studioColor(mix(yellow,green,smoothstep(.2,.4,age)));
  if(age<.6)return studioColor(mix(green,cyan,smoothstep(.4,.6,age)));
  return studioColor(mix(cyan,blue,smoothstep(.6,.8,age)));
}
vec3 scanColor(float y){return scanColor(y,0.);}
`;
export function scanUniforms() {
  return { ...paletteUniforms(), worldToScan:{value:new THREE.Matrix4()}, scanVolume:{value:0}, scanTime:{value:0}, scanUneven:{value:0}, scanPalette:{value:0}, edgeInteraction:{value:0}, lineResponse:{value:0}, scanHeight:{value:0}, scanWidth:{value:.1}, scanDirection:{value:1}, scanStrength:{value:0} };
}
