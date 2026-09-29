import * as THREE from "three";
import { POINT_SIZE, POINT_COLOR, POINT_DARK_COLOR, POINT_OPACITY } from "./config.js";

// Shared palette and text dissolve; loaders supply their own vertex behavior.
export function createPointMaterial(renderer, settings = {}, vertexShader) {
  return new THREE.ShaderMaterial({
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
                    settings.POINT_SIZE ?? POINT_SIZE
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
                    settings.POINT_OPACITY ?? POINT_OPACITY
                }
              },

              vertexShader: vertexShader ?? `

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
}
