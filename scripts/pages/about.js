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

// The town in the footer, in place of the source's "Wyoming": one of TOWNS picked
// at random on each visit, or RARE_TOWN once in a hundred. Tapping a town that has
// coordinates (`at`) turns it into them for a moment, then back; tapping again
// turns it back sooner. Plain text, no link. The same soft swap and timing as
// Home's Contact (swap-text.js).
const TOWNS = [
  { name: 'Cody, Wyoming', at: '44.60114° N, 109.52514° W' },
  { name: 'Venice, Los Angeles' },
  { name: 'Malibu, California' },
  { name: 'Aspen, Colorado' },
  { name: 'Hurricane, Utah' },
  { name: 'Moapa Valley, Nevada' }
];
const RARE_TOWN = { name: 'Omaha, Nebraska' }, RARE_CHANCE = .01;

(() => {
  const town = document.querySelector('.footer-town');
  if (!town) return;
  const { name, at } = Math.random() < RARE_CHANCE ? RARE_TOWN : TOWNS[Math.floor(Math.random() * TOWNS.length)];
  town.textContent = name;
  if (!at) return;
  const show = swapText(town, { glide: true }), HOLD = 2500;
  let back = 0;
  town.addEventListener('click', () => {
    clearTimeout(back);
    if (back) { back = 0; show(name); return; }
    show(at);
    back = setTimeout(() => { back = 0; show(name); }, HOLD);
  });
})();
