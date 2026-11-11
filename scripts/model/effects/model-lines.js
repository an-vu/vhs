import { scanBandGLSL, scanUniforms } from './model-scan-band.js';
import * as THREE from 'three';
import { paletteColors, watchPaletteUniforms } from './model-palette.js';

const colors = paletteColors();

export const linePresets = {
  fine: { threshold: 20, width: 1, silhouetteWeight: 1.2, surface: 'solid', surfaceOpacity: .03, hidden: 'off', hiddenOpacity: .05 },
  technical: { threshold: 40, width: 1, silhouetteWeight: 1.5, surface: 'ghost', surfaceOpacity: .03, hidden: 'off', hiddenOpacity: .05 },
  hidden: { threshold: 40, width: 1, silhouetteWeight: 1.5, surface: 'ghost', surfaceOpacity: .02, hidden: 'dashed', hiddenOpacity: .12 }
};
export const lineDefaults = { ...linePresets.fine, creases: true, creaseOpacity: 1, silhouettes: true, boundaries: true, triangles: false, triangleOpacity: 1, color: '#' + colors.gray.getHexString(), surfaceColor: '#' + colors.paper.getHexString(), dash: 5, gap: 4, shading: true, roughness: .8 };

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
    const [a, b, c] = triangle.map(j => vertices[j]);
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (!normal.lengthSq()) continue;
    for (let j = 0; j < 3; j++) {
      const x = triangle[j], y = triangle[(j + 1) % 3], key = `${Math.min(x, y)},${Math.max(x, y)}`;
      if (!edges.has(key)) edges.set(key, { a: vertices[x], b: vertices[y], normals: [] });
      edges.get(key).normals.push(normal);
    }
  }
  const data = { position: [], end: [], normalA: [], normalB: [], corner: [], boundary: [] };
  for (const { a, b, normals } of edges.values()) for (const [t, side] of [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]]) {
    data.position.push(a.x, a.y, a.z); data.end.push(b.x, b.y, b.z);
    data.normalA.push(...normals[0].toArray()); data.normalB.push(...(normals[1] || normals[0]).toArray());
    data.corner.push(t, side); data.boundary.push(normals.length === 1 ? 1 : 0);
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
void main(){if(visibleEdge<.5 || (dashed && mod(along,dash+gap)>dash)) discard; float band=scanBand(scanCoordinate(scanPosition));gl_FragColor=vec4(color,opacity*lineCoverage*(hiddenPass?1.:edgeOpacity)*(1.-clamp(band*lineResponse,0.,1.)));
#include <colorspace_fragment>
}`;
// Several geometries as one (`names`: the attributes to keep, in every one), indexed
// if any is, so parts that always move together cost one draw instead of many.
function combine(geometries, names) {
  const merged = new THREE.BufferGeometry();
  for (const name of names) {
    const first = geometries[0].getAttribute(name), size = first.itemSize;
    const array = new Float32Array(geometries.reduce((n, g) => n + g.getAttribute(name).count * size, 0));
    let at = 0;
    for (const g of geometries) { array.set(g.getAttribute(name).array, at); at += g.getAttribute(name).array.length; }
    merged.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  if (geometries.some(g => g.index)) {
    const indices = [];
    let offset = 0;
    for (const g of geometries) {
      const count = g.getAttribute(names[0]).count;
      if (g.index) for (let i = 0; i < g.index.count; i++) indices.push(g.index.getX(i) + offset);
      else for (let i = 0; i < count; i++) indices.push(i + offset);
      offset += count;
    }
    merged.setIndex(indices);
  }
  return merged;
}

// `groupOf(mesh)`, optional: the object a mesh always moves with (About's rover:
// its nearest animated part, or the model). Meshes with the same one are drawn as
// one, placed by that object, instead of four draws each (Nov 11: 70 rover parts
// in 33 moving groups, about 280 draws a frame down to about 132).
export function createModelLines(meshes, scene, entrance = null, { followTheme = false, groupOf = null } = {}) {
  const root = new THREE.Group(); scene.add(root); root.visible = false;
  const options = { ...lineDefaults }, resources = new Set(), copies = [];
  const uniforms = { ...scanUniforms(), pixelRatio: { value: 1 }, resolution: { value: new THREE.Vector2() }, color: { value: new THREE.Color(options.color) } };
  const optionUniforms = ['width', 'triangleOpacity', 'creaseOpacity', 'silhouetteWeight', 'threshold', 'creases', 'silhouettes', 'boundaries', 'triangles', 'dash', 'gap'];
  for (const key of optionUniforms) uniforms[key] = { value: options[key] };
  const material = hidden => {
    const mat = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { ...uniforms, opacity: { value: hidden ? .12 : 1 }, dashed: { value: hidden }, hiddenPass: { value: hidden } }, transparent: true, depthWrite: false, depthFunc: hidden ? THREE.GreaterDepth : THREE.LessEqualDepth, side: THREE.DoubleSide });
    if (entrance) {
      mat.uniforms.entrance = entrance;
      mat.fragmentShader = 'uniform float entrance;\n' + mat.fragmentShader.replace('void main(){',
        'void main(){if(entrance < 999. && scanCoordinate(scanPosition) > entrance) discard;');
    }
    resources.add(mat); return mat;
  };
  const front = material(false), back = material(true);
  const depth = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }); resources.add(depth);
  // Unlit surfaces should match their CSS/palette color without filmic remapping.
  const flat = new THREE.MeshBasicMaterial({ color: options.surfaceColor, transparent: true, depthWrite: false, toneMapped: false }); resources.add(flat);
  const lit = new THREE.MeshStandardMaterial({ color: options.surfaceColor, transparent: true, depthWrite: false, roughness: .8 }); resources.add(lit);
  // Clip only the visible surface during the reveal. The depth pass stays
  // complete, as in expanded mode, so far-side particles never show through the scan band.
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
  let surface = lit;
  const make = (g, m, order) => { const object = new THREE.Mesh(g, m); object.matrixAutoUpdate = false; object.frustumCulled = false; object.renderOrder = order; root.add(object); return object; };
  const groups = new Map();
  for (const mesh of meshes) {
    const anchor = groupOf?.(mesh) ?? mesh;
    if (!groups.has(anchor)) groups.set(anchor, []);
    groups.get(anchor).push(mesh);
  }
  for (const [source, members] of groups) {
    let body, geometry;
    if (members.length === 1 && members[0] === source) {
      body = source.geometry; geometry = edgeGeometry(body);
    } else {
      // Each member in its anchor's space, as it sits now; its edges found on its
      // own (as before), then joined.
      source.updateWorldMatrix(true, false);
      const toAnchor = source.matrixWorld.clone().invert();
      const parts = members.map(mesh => {
        mesh.updateWorldMatrix(true, false);
        const part = new THREE.BufferGeometry();
        part.setAttribute('position', mesh.geometry.getAttribute('position').clone());
        if (mesh.geometry.getAttribute('normal')) part.setAttribute('normal', mesh.geometry.getAttribute('normal').clone());
        if (mesh.geometry.index) part.setIndex(mesh.geometry.index.clone());
        return part.applyMatrix4(toAnchor.clone().multiply(mesh.matrixWorld));
      });
      const edges = parts.map(edgeGeometry);
      body = combine(parts, parts.every(part => part.getAttribute('normal')) ? ['position', 'normal'] : ['position']);
      geometry = combine(edges, ['position', 'end', 'normalA', 'normalB', 'corner', 'boundary']);
      [...parts, ...edges].forEach(g => g.dispose()); resources.add(body);
    }
    resources.add(geometry);
    copies.push({ source, depth: make(body, depth, -100), surface: make(body, surface, -50), front: make(geometry, front, 20), back: make(geometry, back, 10) });
  }
  const stopPalette = watchPaletteUniforms(uniforms, colors => {
    if (followTheme) {
      options.color = '#' + colors.ink.getHexString();
      options.surfaceColor = '#' + colors.paper.getHexString();
    }
  });
  return {
    options,
    setEnabled(value) { root.visible = value; },
    update(renderer, scan, matricesCurrent = false, modelScale = 1) {
      if (!root.visible) return;
      if (scan?.worldToScan) uniforms.worldToScan.value.copy(scan.worldToScan.value);
      else uniforms.worldToScan.value.identity();
      for (const key of ['scanVolume', 'scanTime', 'scanUneven', 'scanHeight', 'scanWidth', 'scanDirection', 'scanStrength', 'edgeInteraction', 'lineResponse', 'scanPalette']) uniforms[key].value = scan?.[key].value ?? (key === 'scanWidth' ? .1 : key === 'scanDirection' ? 1 : 0);
      renderer.getSize(uniforms.resolution.value);
      for (const key of optionUniforms) uniforms[key].value = options[key];
      // Match particle scaling: CSS-pixel dimensions at a 600px reference viewport.
      const scale = Math.max(1, Math.min(uniforms.resolution.value.x, uniforms.resolution.value.y)) / 600 * modelScale;
      for (const key of ['width', 'dash', 'gap']) uniforms[key].value = options[key] * scale;
      uniforms.pixelRatio.value = renderer.getPixelRatio();
      uniforms.color.value.set(options.color); back.uniforms.opacity.value = options.hiddenOpacity; back.uniforms.dashed.value = options.hidden === 'dashed';
      surface = options.shading ? lit : flat; lit.roughness = options.roughness;
      surface.color.set(options.surfaceColor); surface.opacity = options.surface === 'solid' ? 1 : options.surfaceOpacity;
      for (const item of copies) { if (!matricesCurrent) item.source.updateWorldMatrix(true, false); for (const key of ['depth', 'surface', 'front', 'back']) item[key].matrix.copy(item.source.matrixWorld); item.surface.material = surface; item.surface.visible = options.surface !== 'none'; item.back.visible = options.hidden !== 'off'; }
    },
    dispose() { stopPalette(); scene.remove(root); resources.forEach(r => r.dispose()); }
  };
}
