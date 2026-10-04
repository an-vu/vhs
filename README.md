# vHuman Studios

Website for [vHuman Studios](https://vhumanstudios.com).

## Local Preview

From the project root, start a local server:

```bash
python3 -m http.server 6969
```

Open:

```text
http://localhost:6969
```

To view the site from another device on the same Wi-Fi, get the Mac's local IP:

```bash
ipconfig getifaddr en0
```

Then open:

```text
http://YOUR-IP:6969
```

Example:

```text
http://192.168.1.42:6969
```

Stop the server with:

```text
Ctrl + C
```
### Model playground

Open `http://localhost:6969/prototype/model-test.html` to select a GLB, glTF, or PLY from `models/`. With the Python server above, the dropdown discovers files automatically; reload after adding files. Hosts without directory listings use the fallback options in `prototype/model-test.html`.

Fine edges, points, and wireframe can be combined for meshes. Vertex-only PLY files use points; they have no faces to outline. F35 and RB18 reuse their homepage point shader and presets (25% and 35% of vertices respectively). Their Points panel exposes preview-only density, twinkle, size, opacity, palette, and orientation controls, with a reset button. All models share the homepage twinkle shader and full Points controls. Other models default to 35% density, 93% twinkling, 1.4× twinkle speed, and a 2.6× peak size multiplier; their exported orientation is preserved. The playground shows the settled model rather than the homepage entrance or text mask. Animation clips play one at a time, starting with the first. The older Curiosity test URL redirects to this page.

The model playground includes seven experimental studies: animated hierarchy markers, motion paths, temporal echoes, displacement shading, pivot probes, surface scanning, and hidden-line illustration. Effects use a sidebar on desktop and an effect selector on mobile, with independent enable controls. Select an animated part for paths, echoes, or arcs. Point-only files disable mesh studies; motion studies require animation tracks. History and opacity controls are shared across the study effects. These are visual studies, not validated mechanical measurements or CAD analysis.

The playground controls are grouped as **Dot, Line, Path, Phase, Scan**. Line includes optional lit surface shading. Path combines trails, pivot probes, markers, and reference-angle labels. Phase provides previous/future clip echoes, displacement shading, and a ghost shell. Scan offers section, false-color distance, depth, distance-from-plane, and normal visualization. Future poses use a separate animation copy; angle labels are unsigned reference-pose changes, and false color is not thermal data. Controls affect the preview only.

**Spectral** adds a separate surface-sampled color cloud to the model playground. Enable it and disable Line/Dot for a cloud-only view. It defaults to 100,000 samples, distributed by triangle area and parented to each rigid mesh component, with GPU twinkle, spread, drift, size variation, and an expressive blue-to-red palette. Density changes rebuild samples only on slider release. The GLB is unchanged. Vertex-only PLY, skinning, and morph-target deformation are not supported by this surface-sampling preview.

Curiosity also appears in the About page's bottom-right corner. Expand it below Work/Contact to rotate and zoom; close the view or press Escape to return. About and the playground share saved settings in `scripts/model/settings/curiosity.js` and rendering modules in `scripts/model/effects/`. Playground adjustments remain preview-only. Clips play forward and backward continuously. Spectral's **Vary through all three dimensions** checkbox enables the experimental volumetric scan; it is off by default. The About renderer pauses in hidden tabs and shows a static pose when reduced motion is requested.
