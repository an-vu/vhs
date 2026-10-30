// An email link that also copies its address and shows it in the link's place, for
// a computer with no mail app set up (the email opens nothing there), and since no
// text on the site can be selected. The address stays once shown. A link's
// [data-nosnippet] span, if it has one, takes the address, so it stays out of
// Google's result text like the word it replaces.
const addressOf = link => decodeURIComponent(link.getAttribute('href').slice(7).split('?')[0]);
const textOf = link => link.querySelector('[data-nosnippet]') ?? link;

export function copyAddressOnClick(links) {
  for (const link of links) {
    link.addEventListener('click', () => {
      const address = addressOf(link);
      navigator.clipboard?.writeText(address).catch(() => {});
      textOf(link).textContent = address;
      link.classList.add('is-address');
    });
  }
}

// Home's Contact with a mouse: pointing at it shows the address, and clicking also
// copies it and says so for a moment ("Copied"), then shows the address again, or
// the word once the pointer has left. Touch screens keep copyAddressOnClick (a
// phone always has a mail app, and there's no pointing).
// The texts cross-fade in one spot (.is-swap, site.css), soft: the new one fades
// in from a slight blur while the old one fades out into it, so there's never a
// gap and the overlap reads as a blend. The room the dots behind Home's text make
// for each word fades with it (text-mask.js); "studio:text-change" starts that.
const CROSSFADE = { duration: 500, easing: 'ease-in-out' };
const SHARP = { opacity: 1, filter: 'blur(0)' }, SOFT = { opacity: 0, filter: 'blur(2px)' };
export function revealAddressOnHover(link) {
  const first = textOf(link), word = first.textContent, address = addressOf(link);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let pointed = false, copied = 0, current = word;
  link.classList.add('is-swap');
  const changed = () => dispatchEvent(new Event('studio:text-change'));
  const show = value => {
    if (value === current) return;
    current = value;
    link.classList.toggle('is-address', value !== word);
    const incoming = Object.assign(document.createElement('span'), { textContent: value });
    if (first.hasAttribute('data-nosnippet')) incoming.setAttribute('data-nosnippet', '');
    for (const layer of link.querySelectorAll(':scope > span:not([data-leaving])')) {
      layer.dataset.leaving = '';
      if (reduced.matches) { layer.remove(); continue; }
      const { opacity, filter } = getComputedStyle(layer);
      layer.getAnimations().forEach(animation => animation.cancel());
      layer.animate([{ opacity, filter }, SOFT], { ...CROSSFADE, fill: 'forwards' })
        .finished.then(() => { layer.remove(); changed(); }, () => {});
    }
    link.append(incoming);
    if (!reduced.matches) incoming.animate([SOFT, SHARP], CROSSFADE);
    changed();
  };
  // Leaving, the address stays a moment before the word comes back; pointing again
  // in that moment keeps it.
  let leaving = 0;
  link.addEventListener('pointerenter', () => {
    pointed = true;
    clearTimeout(leaving);
    if (!copied) show(address);
  });
  link.addEventListener('pointerleave', () => {
    pointed = false;
    clearTimeout(leaving);
    leaving = setTimeout(() => { if (!copied && !pointed) show(word); }, 1000);
  });
  link.addEventListener('click', () => {
    navigator.clipboard?.writeText(address).catch(() => {});
    show('Copied');
    clearTimeout(copied);
    copied = setTimeout(() => { copied = 0; show(pointed ? address : word); }, 1500);
  });
}
