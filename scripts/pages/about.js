import { StudioPageScroll } from '../shared/page-scroll.js';
import { StudioIntroText } from '../shared/intro-text.js';
import { copyAddressOnClick } from '../shared/copy-address.js';
import { createPageMenu } from '../shared/page-menu.js';

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
