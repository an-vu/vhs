import * as THREE from 'three';

// One color treatment for Spectral particles and the shared Line/particle scan.
// Three.Color converts the CSS sRGB tokens to the shader's linear working space.
export const MODEL_THEME_EVENT = 'vhuman:themechange';

export function paletteColors() {
  const style = getComputedStyle(document.documentElement);
  const color = (token, fallback) => new THREE.Color(style.getPropertyValue(token).trim() || fallback);
  const paper = color('--model-surface', style.getPropertyValue('--bg').trim() || '#F9F8F6');
  const ink = color('--model-foreground', style.getPropertyValue('--fg').trim() || '#30302e');
  const gray = color('--model-detail', style.getPropertyValue('--nav-fg').trim() || '#62625e');
  return {
    paper, ink, gray,
    scanPaper: color('--model-scan-background', '#' + paper.getHexString()),
    scanInk: color('--model-scan-foreground', '#' + ink.getHexString()),
    scanGray: color('--model-scan-midtone', '#' + gray.getHexString())
  };
}

// Theme changes update existing materials; no geometry rebuild or animation reset.
export function watchModelPalette(update) {
  const refresh = () => update(paletteColors());
  addEventListener(MODEL_THEME_EVENT, refresh);
  refresh();
  return () => removeEventListener(MODEL_THEME_EVENT, refresh);
}

export function paletteUniforms() {
  const colors = paletteColors();
  return {
    palettePaper: { value: colors.paper }, paletteInk: { value: colors.ink }, paletteGray: { value: colors.gray },
    scanPaper: { value: colors.scanPaper }, scanInk: { value: colors.scanInk }, scanGray: { value: colors.scanGray }
  };
}

export function watchPaletteUniforms(uniforms, update = () => {}) {
  return watchModelPalette(colors => {
    for (const [key, role] of [['palettePaper', 'paper'], ['paletteInk', 'ink'], ['paletteGray', 'gray'],
      ['scanPaper', 'scanPaper'], ['scanInk', 'scanInk'], ['scanGray', 'scanGray']]) uniforms[key].value.copy(colors[role]);
    update(colors);
  });
}

export const paletteGLSL = `
uniform vec3 palettePaper, paletteInk, paletteGray;
uniform vec3 scanPaper, scanInk, scanGray;
vec3 studioColor(vec3 color){
  float lightness=dot(color,vec3(.2126,.7152,.0722));
  vec3 neutral=mix(paletteGray,palettePaper,lightness*.3);
  // Retain the hue while reducing neon saturation and grounding it in warm ink.
  return mix(mix(color,neutral,.25),paletteInk,.18);
}
`;
