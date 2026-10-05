// Shared by the About page and model playground.
export const curiositySettings = {
    line: { color: getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || '#30302e', creases: true, creaseOpacity: .55, silhouettes: true, boundaries: true, triangles: true, triangleOpacity: .3, width: .2, silhouetteWeight: 3, hidden: 'faint', hiddenOpacity: .05, surface: 'none', shading: false },
    spectral: { density: 45000, edgeDensity: .65, size: 3.5, variation: 1, spread: .05, twinkle: 1, twinkleSpeed: 3, drift: .01, driftSpeed: 2, intensity: 1, opacity: 1, palette: 5, scanPalette: 1, scanSpeed: .02, scanVisibility: 2, scanWidth: .2, scanHalo: 1.5, scanUneven: .1, scanVolume: 0, scanStrength: 1, edgeAttraction: 1, edgeReach: .08, lineResponse: 1 }
};
