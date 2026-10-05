import { scanBandGLSL, scanUniforms } from './model-scan-band.js';
import * as THREE from 'three';

export const linePresets = {
  fine: { threshold: 20, width: 1, silhouetteWeight: 1.2, surface: 'solid', surfaceOpacity: .03, hidden: 'off', hiddenOpacity: .05 },
  technical: { threshold: 40, width: 1, silhouetteWeight: 1.5, surface: 'ghost', surfaceOpacity: .03, hidden: 'off', hiddenOpacity: .05 },
  hidden: { threshold: 40, width: 1, silhouetteWeight: 1.5, surface: 'ghost', surfaceOpacity: .02, hidden: 'dashed', hiddenOpacity: .12 }
};
export const lineDefaults = { ...linePresets.fine, creases: true, creaseOpacity: 1, silhouettes: true, boundaries: true, triangles: false, triangleOpacity: 1, color: '#62625e', surfaceColor: '#b8b5af', dash: 5, gap: 4, shading: true, roughness: .8 };

// Weld coincident positions for adjacency; original mesh geometry stays untouched.
function edgeGeometry(source) {
  const pos = source.getAttribute('position'), index = source.index;
  const ids = new Map(), vertices = [], edges = new Map();
  const map = new Uint32Array(pos.count);
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const tolerance = Math.max(box.getSize(new THREE.Vector3()).length() * 1e-6, 1e-9);
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const key = [v.x, v.y, v.z].map(n => Math.round(n / tolerance)).join(',');
    if (!ids.has(key)) { ids.set(key, vertices.length); vertices.push(v); }
    map[i] = ids.get(key);
  }
  const count = index ? index.count : pos.count;
  for (let i = 0; i + 2 < count; i += 3) {
    const triangle = [0, 1, 2].map(j => map[index ? index.getX(i + j) : i + j]);
    const [a,b,c] = triangle.map(j => vertices[j]);
    const normal = new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
    if (!normal.lengthSq()) continue;
    for (let j = 0; j < 3; j++) {
      const x = triangle[j], y = triangle[(j + 1) % 3], key = `${Math.min(x,y)},${Math.max(x,y)}`;
      if (!edges.has(key)) edges.set(key, { a: vertices[x], b: vertices[y], normals: [] });
      edges.get(key).normals.push(normal);
    }
  }
  const data = { position: [], end: [], normalA: [], normalB: [], corner: [], boundary: [] };
  for (const {a,b,normals} of edges.values()) for (const [t,side] of [[0,-1],[1,-1],[1,1],[0,-1],[1,1],[0,1]]) {
    data.position.push(a.x,a.y,a.z); data.end.push(b.x,b.y,b.z);
    data.normalA.push(...normals[0].toArray()); data.normalB.push(...(normals[1] || normals[0]).toArray());
    data.corner.push(t,side); data.boundary.push(normals.length === 1 ? 1 : 0);
  }
  const geometry = new THREE.BufferGeometry();
  for (const [key, array] of Object.entries(data)) geometry.setAttribute(key, new THREE.Float32BufferAttribute(array, key === 'corner' ? 2 : key === 'boundary' ? 1 : 3));
  return geometry;
}
const vertexShader = `
attribute vec3 end, normalA, normalB;
attribute vec2 corner;
attribute float boundary;
uniform vec2 resolution;
uniform float width, silhouetteWeight, threshold, triangleOpacity, creaseOpacity, pixelRatio;
uniform bool creases, silhouettes, boundaries, triangles;
varying float visibleEdge, along, edgeOpacity, lineCoverage; varying vec3 scanPosition;
${scanBandGLSL}
void main(){
 vec4 a=modelViewMatrix*vec4(position,1.), b=modelViewMatrix*vec4(end,1.);
 vec3 n1=normalize(normalMatrix*normalA), n2=normalize(normalMatrix*normalB);
 vec3 viewDir=normalize(-(a.xyz+b.xyz)*.5);
 bool silhouette=boundary<.5 && dot(n1,viewDir)*dot(n2,viewDir)<=0.;
 bool crease=dot(normalize(normalA),normalize(normalB))<cos(radians(threshold));
 bool feature=(boundaries && boundary>.5) || (silhouettes && silhouette) || (creases && crease);
 visibleEdge=(triangles || feature)?1.:0.;
 edgeOpacity=feature?(crease && !silhouette && boundary<.5 ? creaseOpacity : 1.):triangleOpacity;
 vec4 p=projectionMatrix*a, q=projectionMatrix*b;
 vec2 delta=(q.xy/q.w-p.xy/p.w)*resolution*.5;
 float lengthPx=length(delta);
 vec2 normal=vec2(-delta.y,delta.x)/max(lengthPx,.001);
 scanPosition=(modelMatrix*vec4(mix(position,end,corner.x),1.)).xyz;
 gl_Position=mix(p,q,corner.x);
 float desired=width*(silhouette && silhouettes ? silhouetteWeight:1.);
 float rasterWidth=max(desired,1./pixelRatio);
 lineCoverage=desired/rasterWidth;
 gl_Position.xy+=normal*corner.y*rasterWidth/resolution*gl_Position.w;
 along=corner.x*lengthPx;
 if(a.z>=0. || b.z>=0.) visibleEdge=0.;
}`;
const fragmentShader = `

uniform vec3 color;
uniform float opacity,dash,gap;
uniform bool dashed, hiddenPass;
varying float visibleEdge,along,edgeOpacity,lineCoverage; varying vec3 scanPosition;
${scanBandGLSL}
void main(){if(visibleEdge<.5 || (dashed && mod(along,dash+gap)>dash)) discard; float band=scanBand(scanCoordinate(scanPosition));gl_FragColor=vec4(color,opacity*lineCoverage*(hiddenPass?1.:edgeOpacity)*(1.-clamp(band*lineResponse,0.,1.))); #include <colorspace_fragment>
}`.replace('; #include',';\n#include');
export function createModelLines(meshes, scene, entrance = null) {
  const root = new THREE.Group(); scene.add(root); root.visible = false;
  const options = { ...lineDefaults }, resources = new Set(), copies = [];
  const uniforms = {  ...scanUniforms(), pixelRatio:{value:1}, resolution:{value:new THREE.Vector2()}, color:{value:new THREE.Color(options.color)} };
  for (const key of ['width','triangleOpacity','creaseOpacity','silhouetteWeight','threshold','creases','silhouettes','boundaries','triangles','dash','gap']) uniforms[key]={value:options[key]};
  const material = hidden => {
    const mat = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { ...uniforms, opacity:{value:hidden?.12:1}, dashed:{value:hidden}, hiddenPass:{value:hidden} }, transparent:true, depthWrite:false, depthFunc:hidden?THREE.GreaterDepth:THREE.LessEqualDepth, side:THREE.DoubleSide });
    if (entrance) {
      mat.uniforms.entrance = entrance;
      mat.fragmentShader = 'uniform float entrance;\n' + mat.fragmentShader.replace('void main(){',
        'void main(){if(entrance < 999. && scanCoordinate(scanPosition) > entrance) discard;');
    }
    resources.add(mat); return mat;
  };
  const front=material(false), back=material(true);
  const depth=new THREE.MeshBasicMaterial({colorWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}); resources.add(depth);
  // Unlit surfaces should match their CSS/palette color without filmic remapping.
  const flat=new THREE.MeshBasicMaterial({color:options.surfaceColor,transparent:true,depthWrite:false,toneMapped:false}); resources.add(flat);
  const lit=new THREE.MeshStandardMaterial({color:options.surfaceColor,transparent:true,depthWrite:false,roughness:.8}); resources.add(lit);
  // Keep the complete depth surface, as in expanded mode, so the reveal does not
  // expose particles from the far side of the rover through the scan band.
  if (entrance) for (const mat of [flat, lit]) {
    mat.onBeforeCompile = shader => {
      shader.uniforms.entrance = entrance;
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'varying vec3 entrancePosition;\n' + shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nentrancePosition = (modelMatrix * vec4(transformed, 1.)).xyz;');
      shader.fragmentShader = 'uniform float entrance; varying vec3 entrancePosition;\n' + scanBandGLSL + shader.fragmentShader
        .replace('void main() {', 'void main() {\nif (entrance < 999. && scanCoordinate(entrancePosition) > entrance) discard;');
    };
    mat.customProgramCacheKey = () => 'rover-entrance';
  }
  let surface=lit;
  for (const source of meshes) {
    const geometry=edgeGeometry(source.geometry); resources.add(geometry);
    const make=(g,m,order)=>{const object=new THREE.Mesh(g,m);object.matrixAutoUpdate=false;object.frustumCulled=false;object.renderOrder=order;root.add(object);return object;};
    copies.push({source,depth:make(source.geometry,depth,-100),surface:make(source.geometry,surface,-50),front:make(geometry,front,20),back:make(geometry,back,10)});
  }
  return {
    options,
    setEnabled(value){root.visible=value;},
    update(renderer,scan,matricesCurrent=false,modelScale=1){
      if(!root.visible)return;
      if(scan?.worldToScan)uniforms.worldToScan.value.copy(scan.worldToScan.value);
      else uniforms.worldToScan.value.identity();
      for(const key of ['scanVolume','scanTime','scanUneven','scanHeight','scanWidth','scanDirection','scanStrength','edgeInteraction','lineResponse','scanPalette'])uniforms[key].value=scan?.[key].value??(key==='scanWidth'?.1:key==='scanDirection'?1:0);
      renderer.getSize(uniforms.resolution.value);
      for(const key of ['width','triangleOpacity','creaseOpacity','silhouetteWeight','threshold','creases','silhouettes','boundaries','triangles','dash','gap']) uniforms[key].value=options[key];
      // Match particle scaling: CSS-pixel dimensions at a 600px reference viewport.
      const scale=Math.max(1,Math.min(uniforms.resolution.value.x,uniforms.resolution.value.y))/600*modelScale;
      for(const key of ['width','dash','gap'])uniforms[key].value=options[key]*scale;
      uniforms.pixelRatio.value=renderer.getPixelRatio();
      uniforms.color.value.set(options.color);back.uniforms.opacity.value=options.hiddenOpacity;back.uniforms.dashed.value=options.hidden==='dashed';
      surface=options.shading?lit:flat; lit.roughness=options.roughness;
      surface.color.set(options.surfaceColor);surface.opacity=options.surface==='solid'?1:options.surfaceOpacity;
      for(const item of copies){if(!matricesCurrent)item.source.updateWorldMatrix(true,false);for(const key of ['depth','surface','front','back'])item[key].matrix.copy(item.source.matrixWorld);item.surface.material=surface;item.surface.visible=options.surface!=='none';item.back.visible=options.hidden!=='off';}
    },
    dispose(){scene.remove(root);resources.forEach(r=>r.dispose());}
  };
}
