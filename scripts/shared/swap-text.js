import { FADE } from './motion.js';

// Two texts in one spot cross-fade, soft: the new one fades in from a slight blur
// while the old one fades out into it, so there's never a gap and the overlap
// reads as a blend. Timing: the site's fade curve, over FADE.swap (motion.js).
// Home's Contact turning into the address (copy-address.js) and About's town
// turning into its coordinates (about.js) both use it.
//
// Each text is a span of its own, stacked in one grid cell (.is-swap, site.css).
// `glide`: the spot's width follows over the same fade, so a centred line it
// sits in (About's footer) moves over smoothly instead of jumping. `onChange`
// runs as each text arrives or leaves. Returns show(text).
const CROSSFADE = { duration: FADE.swap, easing: FADE.ease };
const SHARP = { opacity: 1, filter: 'blur(0)' }, SOFT = { opacity: 0, filter: 'blur(2px)' };

export function swapText(host, { glide = false, onChange = () => {} } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!host.querySelector(':scope > span')) {
    host.replaceChildren(Object.assign(document.createElement('span'), { textContent: host.textContent.trim() }));
  }
  const first = host.querySelector(':scope > span');
  let current = first.textContent;
  host.classList.add('is-swap');
  return function show(value) {
    if (value === current) return;
    current = value;
    const from = host.getBoundingClientRect().width;
    const incoming = Object.assign(document.createElement('span'), { textContent: value });
    if (first.hasAttribute('data-nosnippet')) incoming.setAttribute('data-nosnippet', '');
    for (const layer of host.querySelectorAll(':scope > span:not([data-leaving])')) {
      layer.dataset.leaving = '';
      if (reduced.matches) { layer.remove(); continue; }
      const { opacity, filter } = getComputedStyle(layer);
      layer.getAnimations().forEach(animation => animation.cancel());
      layer.animate([{ opacity, filter }, SOFT], { ...CROSSFADE, fill: 'forwards' })
        .finished.then(() => { layer.remove(); onChange(); }, () => {});
    }
    host.append(incoming);
    if (!reduced.matches) {
      incoming.animate([SOFT, SHARP], CROSSFADE);
      if (glide) {
        host.getAnimations().forEach(animation => animation.cancel());
        host.animate([{ width: `${from}px` }, { width: `${incoming.getBoundingClientRect().width}px` }], CROSSFADE);
      }
    }
    onChange();
  };
}
