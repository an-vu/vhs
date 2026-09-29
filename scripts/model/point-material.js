import * as THREE from "three";
import { POINT_SIZE, POINT_COLOR, POINT_DARK_COLOR, POINT_OPACITY } from "./config.js";

// Shared palette and text dissolve for the PLY vertex shader.
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

    vertexShader,

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
