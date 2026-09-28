import * as THREE from "three";

import {
  GLTFLoader
} from "three/addons/loaders/GLTFLoader.js";

import {
  MeshSurfaceSampler
} from "three/addons/math/MeshSurfaceSampler.js";

import {
  MODEL_PATH,
  POINT_COUNT,
  POINT_SIZE,
  POINT_COLOR,
  POINT_DARK_COLOR,
  POINT_OPACITY,
  TWINKLE_CHANCE
} from "./f35-config.js";

export function createF35PointCloud(
  aircraft,
  renderer
) {
  return new Promise(
    (resolve, reject) => {
      const loader =
        new GLTFLoader();

      loader.load(
        MODEL_PATH,

        (gltf) => {
          let sourceMesh = null;

          gltf.scene.traverse(
            (object) => {
              if (
                object.isMesh &&
                !sourceMesh
              ) {
                sourceMesh =
                  object;
              }
            }
          );

          if (!sourceMesh) {
            reject(
              new Error(
                "No mesh found in F-35 GLB."
              )
            );

            return;
          }

          sourceMesh.updateWorldMatrix(
            true,
            false
          );

          const mesh =
            new THREE.Mesh(
              sourceMesh.geometry.clone(),
              new THREE.MeshBasicMaterial()
            );

          mesh.geometry.applyMatrix4(
            sourceMesh.matrixWorld
          );

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

          const scale =
            targetSize /
            largestDimension;

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

          const material =
            new THREE.ShaderMaterial({
              transparent: true,
              depthWrite: false,

              uniforms: {
                uTextMask: { value: null },
                uTextEnabled: { value: 0 },
                uTextViewport: { value: new THREE.Vector2(1, 1) },
                uTextPixelRatio: { value: 1 },
                uTime: {
                  value: 0
                },

                uPointSize: {
                  value:
                    POINT_SIZE
                },

                uScale: {
                  value:
                    renderer
                      .domElement
                      .height /
                    2
                },

                uDarkColor: { value: POINT_DARK_COLOR },
                uColor: {
                  value:
                    POINT_COLOR
                },

                uOpacity: {
                  value:
                    POINT_OPACITY
                }
              },

              vertexShader: `

                attribute vec3 aNormal;
                attribute float aSize;
                attribute float aTone;
                attribute float aTwinkle;
                attribute float aPhase;
                attribute float aSpeed;

                uniform float uTime;
                uniform float uPointSize;
                uniform float uScale;

                varying float vTone;
                varying float vAlpha;

                void main() {

                  vec4 mvPosition =
                    modelViewMatrix *
                    vec4(
                      position,
                      1.0
                    );

                  vec3 viewNormal =
                    normalize(
                      normalMatrix *
                      aNormal
                    );

                  vec3 viewDirection =
                    normalize(
                      -mvPosition.xyz
                    );

                  float ndv =
                    abs(
                      dot(
                        viewNormal,
                        viewDirection
                      )
                    );

                  // ------------------------------
                  // Contour
                  // ------------------------------

                  float silhouette =
                    1.0 - ndv;

                  float contour =
                    smoothstep(
                      0.15,
                      0.74,
                      silhouette
                    );

                  float edgeTrace =
                    smoothstep(
                      0.66,
                      0.93,
                      silhouette
                    );

                  // ------------------------------
                  // Twinkle
                  // ------------------------------

                  float pulse =
                    pow(
                      0.5 +
                      0.5 *
                      sin(
                        uTime *
                        aSpeed +
                        aPhase
                      ),
                      2.0
                    );

                  // ------------------------------
                  // Opacity
                  // ------------------------------

                  float baseAlpha =
                    mix(
                      0.62,
                      0.96,
                      contour
                    );

                  baseAlpha +=
                    edgeTrace *
                    0.12;

                  baseAlpha =
                    clamp(
                      baseAlpha,
                      0.0,
                      1.0
                    );

                  float twinkleAlpha =
                    mix(
                      0.82,
                      1.0,
                      pulse
                    );

                  vAlpha =
                    baseAlpha *
                    mix(
                      1.0,
                      twinkleAlpha,
                      aTwinkle
                    );

                  // ------------------------------
                  // Tone
                  // ------------------------------

                  float contourTone =
                    mix(
                      0.62,
                      1.12,
                      contour
                    );

                  contourTone *=
                    mix(
                      1.0,
                      1.12,
                      edgeTrace
                    );

                  float darkestTwinkle =
                    mix(
                      0.28,
                      0.34,
                      contour
                    );

                  float twinkleTone =
                    mix(
                      darkestTwinkle,
                      1.08,
                      pulse
                    );

                  vTone =
                    aTone *
                    contourTone *
                    mix(
                      1.0,
                      twinkleTone,
                      aTwinkle
                    );

                  // ------------------------------
                  // Size
                  // ------------------------------

                  float perspectiveSize =
                    uPointSize *
                    aSize *
                    uScale /
                    max(
                      -mvPosition.z,
                      0.05
                    );

                  float contourSize =
                    mix(
                      1.0,
                      1.36,
                      contour
                    );

                  contourSize *=
                    mix(
                      1.0,
                      1.12,
                      edgeTrace
                    );

                  float twinkleSize =
                    mix(
                      0.68,
                      1.85,
                      pulse
                    );

                  float finalSize =
                    contourSize *
                    mix(
                      1.0,
                      twinkleSize,
                      aTwinkle
                    );

                  gl_PointSize =
                    clamp(
                      perspectiveSize *
                      finalSize,
                      1.0,
                      10.0
                    );

                  gl_Position =
                    projectionMatrix *
                    mvPosition;

                }
              `,

              fragmentShader: `
                uniform vec3 uColor;
                uniform vec3 uDarkColor;
                uniform float uOpacity;
                uniform sampler2D uTextMask;
                uniform float uTextEnabled;
                uniform vec2 uTextViewport;
                uniform float uTextPixelRatio;

                varying float vTone;
                varying float vAlpha;

                void main() {

                  vec2 point =
                    gl_PointCoord -
                    vec2(0.5);

                  float distanceFromCenter =
                    length(point);

                  if (
                    distanceFromCenter >
                    0.5
                  ) {
                    discard;
                  }

                  float edge =
                    1.0 -
                    smoothstep(
                      0.36,
                      0.5,
                      distanceFromCenter
                    );

                  vec3 finalColor =
                    mix(uDarkColor, uColor, clamp(vTone / 1.6, 0.0, 1.0));

                  float textAlpha = 1.0;
                  if (uTextEnabled > 0.5) {
                    vec2 uv = gl_FragCoord.xy / (uTextViewport * uTextPixelRatio);
                    textAlpha = 1.0 - smoothstep(0.01, 0.95, texture2D(uTextMask, uv).a);
                  }

                  gl_FragColor =
                    vec4(
                      finalColor,
                      uOpacity *
                      vAlpha *
                      edge * textAlpha
                    );
                  #include <colorspace_fragment>
                }
              `
            });

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
