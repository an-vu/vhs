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

// A small egg in the footer (An, Nov 11): tapping "Cody, Wyoming" turns it into its
// coordinates for a moment, then back; tapping again turns it back sooner. Plain
// text, no link. The same soft swap and timing as Home's Contact (swap-text.js).
(() => {
  const town = document.querySelector('.footer-town');
  if (!town) return;
  const name = town.textContent.trim(), at = town.dataset.coordinates, HOLD = 2500;
  const show = swapText(town, { glide: true });
  let back = 0;
  town.addEventListener('click', () => {
    clearTimeout(back);
    if (back) { back = 0; show(name); return; }
    show(at);
    back = setTimeout(() => { back = 0; show(name); }, HOLD);
  });
})();
