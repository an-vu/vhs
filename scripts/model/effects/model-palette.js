import * as THREE from 'three';

// One color treatment for Spectral particles and the shared Line/particle scan.
// Three.Color converts the CSS sRGB tokens to the shader's linear working space.
export function paletteColors() {
  const style = getComputedStyle(document.documentElement);
  const color = (token, fallback) => new THREE.Color(style.getPropertyValue(token).trim() || fallback);
  return {
    paper: color('--bg', '#F9F8F6'),
    ink: color('--fg', '#30302e'),
    gray: color('--nav-fg', '#62625e')
  };
}

export function paletteUniforms() {
  const colors = paletteColors();
  return {
    palettePaper: { value: colors.paper },
    paletteInk: { value: colors.ink },
    paletteGray: { value: colors.gray }
  };
}

export const paletteGLSL = `
uniform vec3 palettePaper, paletteInk, paletteGray;
vec3 studioColor(vec3 color){
  float lightness=dot(color,vec3(.2126,.7152,.0722));
  vec3 neutral=mix(paletteGray,palettePaper,lightness*.3);
  // Retain the hue while reducing neon saturation and grounding it in warm ink.
  return mix(mix(color,neutral,.25),paletteInk,.18);
}
`;
