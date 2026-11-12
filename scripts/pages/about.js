import { StudioPageScroll } from '../shared/page-scroll.js';
import { StudioIntroText } from '../shared/intro-text.js';
import { copyAddressOnClick } from '../shared/copy-address.js';
import { createPageMenu } from '../shared/page-menu.js';
import { swapText } from '../shared/swap-text.js';

(() => {
  const content = document.querySelector(".about-content");
  if (!content?.querySelector(".about-intro")) return;
  StudioPageScroll(content);
  createPageMenu();
  // Contact also copies the address and shows it in its place (copy-address.js).
  copyAddressOnClick([...content.querySelectorAll('.main-nav a[href^="mailto:"]')]);
  // Begin the rover as the visible text reaches the end of its bounce.
  StudioIntroText(content, {
    onSettled() {
      document.documentElement.dataset.aboutReady = 'true';
      dispatchEvent(new Event('about-ready'));
    }
  });
})();

// The place in the footer: a tap turns it into its coordinates for a moment, then
// back; tapping again turns it back sooner. Plain text, no link. The same soft swap
// and timing as Home's Contact (swap-text.js).
const COORDINATES = '44.60114° N, 109.52514° W', HOLD = 2500;

(() => {
  const place = document.querySelector('.footer-place');
  if (!place) return;
  const name = place.textContent.trim();
  const show = swapText(place, { glide: true });
  let back = 0;
  place.addEventListener('click', () => {
    clearTimeout(back);
    if (back) { back = 0; show(name); return; }
    show(COORDINATES);
    back = setTimeout(() => { back = 0; show(name); }, HOLD);
  });
})();
