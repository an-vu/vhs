import * as THREE from 'three';

export function createModelEffects({ model, meshes, clips, scene }) {
  const root = new THREE.Group(); scene.add(root);
  const resources = new Set(), layers = new Map();
  const own = value => (resources.add(value), value);
  const state = { skeleton:false, trails:false, echoes:false, displacement:false, arcs:false, scanner:false, shell:false };
  const nodes = [];
  for (const clip of clips) for (const track of clip.tracks) {
    const name = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
    const node = THREE.PropertyBinding.findNode(model, name);
    if (node && !nodes.includes(node)) nodes.push(node);
  }
  const options = { opacity: .45, history: 2, radius: .18, scanSpeed: .25, sensitivity: 2, target: 0, trailLength: 60, fade: 1, labels: false, echoCount: 3, spacing: .25, falloff: .65, pose: "previous", shell: false, scanMode: 0, sweep: true, plane: .5, colorMetric:0, colorPalette:0, colorAxis:1, colorRange:0, colorMin:0, colorMax:5, colorInvert:0, colorBands:0 };
  const references = new Map();
  const histories = new Map();
  let clock = 0, sampleTime = -1, lastClipTime = -1;
  const bounds = new THREE.Box3().setFromObject(model);
  const extent = Math.max(...bounds.getSize(new THREE.Vector3()).toArray()) || 1;
  const lineMaterial = () => own(new THREE.LineBasicMaterial({ color: 0x62625e, transparent: true, opacity: options.opacity, depthWrite: false }));
  function layer(id) {
    if (!layers.has(id)) { const g = new THREE.Group(); root.add(g); layers.set(id, g); }
    return layers.get(id);
  }
  function clear(group) {
    for (const child of [...group.children]) {
      group.remove(child);
      if(child.userData.ownedMaterial){child.material.dispose();resources.delete(child.material);}
      if (child.userData.ownedGeometry) { child.geometry.dispose(); resources.delete(child.geometry); }
    }
  }
  const commonLine = lineMaterial();
  const markerMaterial = own(new THREE.MeshBasicMaterial({ color: 0x30302e }));
  const markerGeometry = own(new THREE.SphereGeometry(extent * .004, 6, 4));
  const echoMaterials = Array.from({length:6}, () => own(new THREE.MeshBasicMaterial({ color: 0x62625e, transparent: true, opacity: .12, depthWrite: false })));
  const shellMaterial = own(new THREE.MeshStandardMaterial({ color: 0xb8b5af, transparent: true, opacity: .04, depthWrite: false, roughness:.8 }));
  const labels = new Map();
  let poseRoot, poseMixer, poseAction, poseClip;
  const predicted = new Map();
  function futurePose(time, clip) {
    if (!poseRoot) {
      const clone = model.clone(true), originalNodes = [], clonedNodes = [];
      model.traverse(n => originalNodes.push(n)); clone.traverse(n => clonedNodes.push(n));
      originalNodes.forEach((n,i) => { if(meshes.includes(n)) predicted.set(n,clonedNodes[i]); });
      poseRoot = new THREE.Group(); poseRoot.matrixAutoUpdate=false; poseRoot.add(clone);
      poseMixer = new THREE.AnimationMixer(clone);
    }
    if(poseClip!==clip){poseMixer.stopAllAction();poseClip=clip;poseAction=poseMixer.clipAction(clip);poseAction.play();}
    poseRoot.matrix.copy(model.parent.matrixWorld);
    poseMixer.setTime(Math.min(clip.duration, Math.max(0,time))); poseRoot.updateMatrixWorld(true);
  }
  function angleLabel(node, angle, position) {
    if(!labels.has(node)) {
      const canvas=document.createElement('canvas'); canvas.width=256;canvas.height=64;
      const texture=own(new THREE.CanvasTexture(canvas));
      const material=own(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
      const sprite=new THREE.Sprite(material); sprite.scale.set(extent*.14,extent*.035,1); root.add(sprite);
      labels.set(node,{canvas,texture,sprite,text:''});
    }
    const item=labels.get(node), text=angle.toFixed(1)+'° Δ';
    if(item.text!==text){const c=item.canvas.getContext('2d');c.clearRect(0,0,256,64);c.fillStyle='#30302e';c.font='32px sans-serif';c.fillText(text,8,43);item.texture.needsUpdate=true;item.text=text;}
    item.sprite.position.copy(position);item.sprite.position.y+=extent*.025;item.sprite.visible=true;
  }
  const scanMaterial = own(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { height: { value: 0 }, width: { value: extent * .025 }, opacity: { value: options.opacity }, mode:{value:0}, extent:{value:extent}, metric:{value:0}, palette:{value:0}, axis:{value:new THREE.Vector3(0,1,0)}, range:{value:new THREE.Vector2(0,5)}, invert:{value:0}, bands:{value:0}, planePosition:{value:0} },
    vertexShader: 'varying float y, depth; varying vec3 n, world; void main(){vec4 p=modelMatrix*vec4(position,1.); world=p.xyz;y=p.y; vec4 v=viewMatrix*p;depth=-v.z;n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*v;}',
    fragmentShader: `varying float y,depth; varying vec3 n,world; uniform float height,width,opacity,extent,planePosition; uniform int mode,metric,palette,bands,invert; uniform vec3 axis; uniform vec2 range;
    vec3 falseColor(float t){
      if(palette==3)return vec3(t);
      if(palette==1)return clamp(vec3(t*3.,t*3.-1.,t*3.-2.),0.,1.);
      if(palette==2){if(t<.5)return mix(vec3(.06,.02,.15),vec3(.65,.05,.35),t*2.);return mix(vec3(.65,.05,.35),vec3(1.,.95,.7),(t-.5)*2.);}
      return clamp(abs(mod(vec3(0.,4.,2.)+(1.-t)*4.,6.)-3.)-1.,0.,1.);
    }
    void main(){float d=y-height;float t=clamp(abs(d)/extent,0.,1.);vec3 color=vec3(.19);float alpha=opacity;
    if(mode==0){float band=1.-smoothstep(0.,width,abs(d));alpha*=max(d<0.?0.08:0.,band);}
    if(mode==1){float value=metric==0?depth:metric==1?dot(world,axis):abs(dot(world,axis)-planePosition);
      float f=clamp((value-range.x)/max(range.y-range.x,.00001),0.,1.);if(invert==1)f=1.-f;
      if(bands>0)f=min(float(bands-1),floor(f*float(bands)))/float(bands-1);
      color=falseColor(f);
    }
    if(mode==2)color=vec3(clamp(depth/(extent*3.),0.,1.));
    if(mode==3)color=vec3(t);
    if(mode==4)color=normalize(n)*.5+.5;
    gl_FragColor=vec4(color,alpha);
    #include <colorspace_fragment>
    }`

  }));
  function copyMesh(source, material, group) {
    const copy = new THREE.Mesh(source.geometry, material); copy.matrixAutoUpdate = false;
    copy.userData.source = source; group.add(copy); return copy;
  }
  function prepare(id) {
    const group = layer(id);
    if (group.userData.prepared) return;
    group.userData.prepared = true;
    if (id === 'skeleton') {
      for (const node of nodes) {
        const marker = new THREE.Mesh(markerGeometry, markerMaterial); marker.userData.node = node; group.add(marker);
        let parent = node.parent; while (parent && !nodes.includes(parent)) parent = parent.parent;
        if (parent) {
          const geometry = own(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
          const line = new THREE.Line(geometry, commonLine); line.userData.node = node; line.userData.parent = parent; group.add(line);
        }
      }
    }
    if (id === 'scanner' || id === 'displacement' || id === 'shell') {
      for (const mesh of meshes) {
        if (id === 'shell') copyMesh(mesh, shellMaterial, group);
        if (id === 'scanner') copyMesh(mesh, scanMaterial, group);
        if (id === 'displacement') copyMesh(mesh, own(new THREE.MeshBasicMaterial({ color: 0x62625e, transparent: true, opacity: .06, depthWrite: false })), group);
      }
    }
  }
  function reset() {
    histories.clear(); references.clear(); sampleTime = -1; lastClipTime = -1;
    model.updateWorldMatrix(true, true);
    for (const node of [...nodes, ...meshes]) references.set(node, { position: node.position.clone(), rotation: node.quaternion.clone() });
    for (const id of ['trails', 'echoes', 'arcs']) if (layers.has(id)) clear(layers.get(id));
  }
  function targets() {
    if (options.target === -1) return nodes;
    const node = nodes[options.target] || meshes[0];
    return node ? [node] : [];
  }
  const descendantMeshes = new Map();
  function selectedMeshes(node) {
    if (!descendantMeshes.has(node)) {
      const result = []; node.traverse(child => { if (meshes.includes(child)) result.push(child); });
      descendantMeshes.set(node, result);
    }
    return descendantMeshes.get(node);
  }
  function path(points, group) {
    if (points.length < 2) return;
    const geometry = own(new THREE.BufferGeometry().setFromPoints(points));
    const material = own(commonLine.clone()); material.vertexColors=true;
    const colors=[]; for(let i=0;i<points.length;i++){const strength=Math.pow((i+1)/points.length,options.fade);const color=new THREE.Color(0xf9f8f6).lerp(new THREE.Color(0x62625e),strength);colors.push(...color.toArray());}
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3)); material.color.set(0xffffff);
    const line = new THREE.Line(geometry, material); line.userData.ownedMaterial = true; line.userData.ownedGeometry = true; group.add(line);
  }
  function update(dt, clipTime, advance, clip, camera) {
    if (!Object.values(state).some(Boolean)) return;
    if (clipTime !== undefined && lastClipTime >= 0 && clipTime < lastClipTime) reset();
    lastClipTime = clipTime ?? -1;
    if (advance) clock += dt;
    model.updateWorldMatrix(true, true);
    commonLine.opacity = options.opacity;
    echoMaterials.forEach((m,i)=>m.opacity=options.opacity*.4*Math.pow(options.falloff,i));
    for(const item of labels.values())item.sprite.visible=false;
    if(options.labels && state.arcs)for(const node of targets()){const ref=references.get(node);if(ref)angleLabel(node,THREE.MathUtils.radToDeg(node.quaternion.angleTo(ref.rotation)),node.getWorldPosition(new THREE.Vector3()));}
    scanMaterial.uniforms.opacity.value = options.opacity;
    const selectedNodes = targets();
    if (selectedNodes.length && (state.trails || state.echoes || state.arcs) && (sampleTime < 0 || advance && clock - sampleTime >= .08)) {
      sampleTime = clock;
      for (const id of ['trails', 'arcs', 'echoes']) if (state[id]) clear(layer(id));
      // Animated parents can contain other animated parts. Capture each mesh once.
      const capturedMeshes = new Set();
      for (const selected of selectedNodes) {
        const center = selected.isMesh ? selected.geometry.boundingSphere?.center?.clone() ?? new THREE.Vector3() : new THREE.Vector3();
        const point = selected.localToWorld(center);
        const origin = selected.getWorldPosition(new THREE.Vector3());
        const rotation = selected.getWorldQuaternion(new THREE.Quaternion());
        const probe = new THREE.Vector3(options.radius * extent, 0, 0).applyQuaternion(rotation).add(origin);
        const history = histories.get(selected) || [];
        history.push({ time: clock, point, origin, probe, matrices: state.echoes ? selectedMeshes(selected)
          .filter(mesh => { if (capturedMeshes.has(mesh)) return false; capturedMeshes.add(mesh); return true; })
          .map(mesh => [mesh, mesh.matrixWorld.clone()]) : [] });
        while (history.length > 80 || history.length && clock - history[0].time > options.history) history.shift();
        histories.set(selected, history);
        if (state.trails) { const g = layer('trails'); path(history.slice(-options.trailLength).map(h => h.point), g); }
        if (state.arcs) { const g = layer('arcs'); path(history.slice(-options.trailLength).map(h => h.probe), g); path([origin, probe], g); }
        if (state.echoes) {
          const g = layer('echoes');
          for (let i=0;i<options.echoCount;i++) {
            const offset=(i+1)*options.spacing;
            if(options.pose==='future' && clip) {
              futurePose((clipTime??0)+offset,clip);
              for(const [mesh] of history.at(-1).matrices)copyMesh(mesh,echoMaterials[i],g).matrix.copy(predicted.get(mesh).matrixWorld);
            } else {
              const pose=[...history].reverse().find(h=>h.time<=clock-offset);
              for (const [mesh,matrix] of pose?.matrices || []) copyMesh(mesh,echoMaterials[i],g).matrix.copy(matrix);
            }
          }
        }
      }
    }
    if (state.skeleton) {
      for (const object of layer('skeleton').children) {
        const node = object.userData.node;
        const position = node.getWorldPosition(new THREE.Vector3());
        if (object.isLine) {
          const parent = object.userData.parent.getWorldPosition(new THREE.Vector3());
          const attr = object.geometry.getAttribute('position'); attr.setXYZ(0, position.x, position.y, position.z); attr.setXYZ(1, parent.x, parent.y, parent.z); attr.needsUpdate = true;
          object.geometry.computeBoundingSphere();
        } else {
          object.position.copy(position);
          const ref = references.get(node);
          object.scale.setScalar(1 + Math.min(1, ref ? node.quaternion.angleTo(ref.rotation) : 0));
        }
      }
    }
    if (state.scanner) {
      bounds.setFromObject(model);
      const u=scanMaterial.uniforms;
      u.metric.value=options.colorMetric;u.palette.value=options.colorPalette;u.invert.value=options.colorInvert;u.bands.value=options.colorBands;
      u.axis.value.set(0,0,0).setComponent(options.colorAxis,1);
      const low=bounds.min.getComponent(options.colorAxis),high=bounds.max.getComponent(options.colorAxis);
      const plane=THREE.MathUtils.lerp(low,high,options.sweep?(clock*options.scanSpeed)%1:options.plane);
      u.planePosition.value=plane;
      let minimum=low,maximum=high;
      if(options.colorMetric===0 && camera){
        minimum=Infinity;maximum=-Infinity;
        for(let i=0;i<8;i++){
          const v=new THREE.Vector3(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z).applyMatrix4(camera.matrixWorldInverse);
          minimum=Math.min(minimum,-v.z);maximum=Math.max(maximum,-v.z);
        }
      } else if(options.colorMetric===2){minimum=0;maximum=Math.max(Math.abs(low-plane),Math.abs(high-plane));}
      if(options.colorRange===1 && Number.isFinite(options.colorMin) && options.colorMax>options.colorMin){minimum=options.colorMin;maximum=options.colorMax;}
      u.range.value.set(minimum,Math.max(minimum+.00001,maximum));
      scanMaterial.uniforms.height.value = THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, options.sweep ? (clock * options.scanSpeed) % 1 : options.plane);
    }
    scanMaterial.uniforms.mode.value=options.scanMode;
    for (const id of ['scanner', 'displacement', 'shell']) if (state[id]) {
      for (const copy of layer(id).children) {
        const mesh = copy.userData.source; copy.matrix.copy(mesh.matrixWorld);
        if (id === 'displacement') {
          let amount = 0;
          for (let node = mesh; node && node !== model.parent; node = node.parent) {
            const ref = references.get(node);
            if (ref) amount += node.position.distanceTo(ref.position) / extent + node.quaternion.angleTo(ref.rotation);
          }
          copy.material.opacity = .04 + Math.min(1, amount * options.sensitivity) * options.opacity;
        }
      }
    }
  }
  reset();
  return {
    nodes, options,
    set(id, value) { if(id==='arcs' && !value)for(const item of labels.values())item.sprite.visible=false; if(state[id]!==value)sampleTime=-1; state[id] = value; if (value) prepare(id); if (layers.has(id)) layers.get(id).visible = value; },
    reset, update,
    refresh() { sampleTime=-1; },
    get scanning() { return state.scanner && options.sweep; },
    dispose() { poseMixer?.stopAllAction(); if(poseRoot)poseMixer?.uncacheRoot(poseRoot.children[0]); scene.remove(root); resources.forEach(r => r.dispose()); }
  };
}
