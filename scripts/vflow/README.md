# vFlow

A lightweight, dependency-free image gallery with angled side cards, looping navigation,
and edge-on transitions for long jumps. Uses native JavaScript modules and Web Animations.

## Use on another page

Copy this folder and `styles/vflow.css`. Serve the page over HTTP (ES modules
do not reliably load when opening an HTML file directly from disk).

```html
<link rel="stylesheet" href="styles/vflow.css">
<div id="gallery"></div>
<script type="module">
  import { createVFlow } from "./scripts/vflow/vflow.js";

  const gallery = createVFlow([
    { src: "images/front.jpg", alt: "Front view" },
    { src: "images/detail.jpg", alt: "Detail view", caption: "The details" },
    { caption: "More images coming soon" }
  ], "Project name", { loop: true, duration: 1000 });

  document.querySelector("#gallery").append(gallery);
  // In a client-rendered app, call gallery.destroy() before discarding it.
</script>
```

Image URLs resolve relative to the page. Omit `src` for a placeholder.
At least one entry is required; one image hides navigation.
Each instance has independent state. Navigation requests during movement are ignored,
not queued. Reduced-motion preferences skip the transition.

## Where to edit

- **settings.js**: duration (milliseconds), loop, layer handoff, perspective,
  dimming, dot widths and swipe distance. The optional third argument overrides
  defaults for one gallery.
- **motion.js**: golden-ratio angle, scale and spacing calculations; edge-on poses.
- **vflow.js**: markup, timeline generation, clicks, keyboard, swipes and lifecycle.
- **styles/vflow.css**: dimensions, corners, shadows, blur and navigation styling.

The default motion is one second with an ease-in/out quadratic curve.
The timeline's inverse calculations depend on that curve; changing the curve also
requires updating those calculations. Dot and image motion share one timeline.

Optional CSS variables: `--bg`, `--fg`, `--nav-fg`, `--muted`,
`--image-border`, and `--image-radius`. Each has a fallback.
Override `--gallery-height` on your gallery to change its height.
