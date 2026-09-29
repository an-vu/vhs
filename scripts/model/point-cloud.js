import { createPointMaterial } from "./point-material.js";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import {
  GLTFLoader
} from "three/addons/loaders/GLTFLoader.js";

import {
  MeshSurfaceSampler
} from "three/addons/math/MeshSurfaceSampler.js";

import {
  POINT_COUNT,
  TWINKLE_CHANCE
} from "./config.js";

export function createModelPointCloud(
  aircraft,
  renderer,
  modelPath
) {
  return new Promise(
    (resolve, reject) => {
      const loader =
        new GLTFLoader();

      loader.load(
        modelPath,
        (gltf) => {
          // Bake every static mesh into one surface. The sampler distributes points
          // by triangle area, keeping one fixed point budget across all parts.
          gltf.scene.updateMatrixWorld(true);
          const parts = [];
          gltf.scene.traverse(object => {
            if (!object.isMesh) return;
            const geometry = object.geometry.index
              ? object.geometry.toNonIndexed() : object.geometry.clone();
            geometry.applyMatrix4(object.matrixWorld);
            if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
            for (const name of Object.keys(geometry.attributes)) {
              if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
            }
            geometry.morphAttributes = {};
            parts.push(geometry);
          });
          if (!parts.length) { reject(new Error("No mesh found in model GLB.")); return; }
          const merged = mergeGeometries(parts);
          parts.forEach(part => part.dispose());
          if (!merged) { reject(new Error("Could not combine model surfaces.")); return; }
          const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial());

          // --------------------------------------------
          // Center model
          // --------------------------------------------

          mesh.geometry.computeBoundingBox();

          const center =
            new THREE.Vector3();

          mesh.geometry.boundingBox.getCenter(
            center
          );

          mesh.geometry.translate(
            -center.x,
            -center.y,
            -center.z
          );

          // --------------------------------------------
          // Normalize model size
          // --------------------------------------------

          mesh.geometry.computeBoundingBox();

          const size =
            new THREE.Vector3();

          mesh.geometry.boundingBox.getSize(
            size
          );

          const largestDimension =
            Math.max(
              size.x,
              size.y,
              size.z
            );

          const targetSize = 3.5;

          if (!(largestDimension > 0)) {
            mesh.geometry.dispose(); mesh.material.dispose();
            reject(new Error("Model has no usable surface size.")); return;
          }
          const scale = targetSize / largestDimension;

          mesh.geometry.scale(
            scale,
            scale,
            scale
          );

          // Make sure contour calculations
          // always have normals available.
          if (
            !mesh.geometry.getAttribute(
              "normal"
            )
          ) {
            mesh.geometry.computeVertexNormals();
          }

          // --------------------------------------------
          // Surface sampler
          // --------------------------------------------

          const sampler =
            new MeshSurfaceSampler(
              mesh
            ).build();

          const positions =
            new Float32Array(
              POINT_COUNT * 3
            );

          const normals =
            new Float32Array(
              POINT_COUNT * 3
            );

          const sizes =
            new Float32Array(
              POINT_COUNT
            );

          const tones =
            new Float32Array(
              POINT_COUNT
            );

          const twinkles =
            new Float32Array(
              POINT_COUNT
            );

          const phases =
            new Float32Array(
              POINT_COUNT
            );

          const speeds =
            new Float32Array(
              POINT_COUNT
            );

          const point =
            new THREE.Vector3();

          const normal =
            new THREE.Vector3();

          for (
            let i = 0;
            i < POINT_COUNT;
            i++
          ) {
            sampler.sample(
              point,
              normal
            );

            const index =
              i * 3;

            positions[index] =
              point.x;

            positions[index + 1] =
              point.y;

            positions[index + 2] =
              point.z;

            normals[index] =
              normal.x;

            normals[index + 1] =
              normal.y;

            normals[index + 2] =
              normal.z;

            // Wider size variation.
            const sizeRandom =
              Math.pow(
                Math.random(),
                1.25
              );

            sizes[i] =
              0.55 +
              sizeRandom *
                1.20;

            tones[i] =
              0.65 +
              Math.random() *
                0.65;

            twinkles[i] =
              Math.random() <
              TWINKLE_CHANCE
                ? 1
                : 0;

            phases[i] =
              Math.random() *
              Math.PI *
              2;

            speeds[i] =
              1.8 +
              Math.random() *
                2.4;
          }

          mesh.geometry.dispose();
          mesh.material.dispose();
          gltf.scene.traverse(object => {
            object.geometry?.dispose();
            const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
            materials.forEach(material => {
              Object.values(material).forEach(value => { if (value?.isTexture) value.dispose(); });
              material.dispose();
            });
          });

          // --------------------------------------------
          // Point geometry
          // --------------------------------------------

          const geometry =
            new THREE.BufferGeometry();

          geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(
              positions,
              3
            )
          );

          geometry.setAttribute(
            "aNormal",
            new THREE.BufferAttribute(
              normals,
              3
            )
          );

          geometry.setAttribute(
            "aSize",
            new THREE.BufferAttribute(
              sizes,
              1
            )
          );

          geometry.setAttribute(
            "aTone",
            new THREE.BufferAttribute(
              tones,
              1
            )
          );

          geometry.setAttribute(
            "aTwinkle",
            new THREE.BufferAttribute(
              twinkles,
              1
            )
          );

          geometry.setAttribute(
            "aPhase",
            new THREE.BufferAttribute(
              phases,
              1
            )
          );

          geometry.setAttribute(
            "aSpeed",
            new THREE.BufferAttribute(
              speeds,
              1
            )
          );

          // --------------------------------------------
          // Shader
          // --------------------------------------------

          const material = createPointMaterial(renderer);

          const points =
            new THREE.Points(
              geometry,
              material
            );

          aircraft.add(
            points
          );

          resolve(material);
        },

        undefined,

        reject
      );
    }
  );
}
