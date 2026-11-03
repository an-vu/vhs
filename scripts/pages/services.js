import { StudioPageScroll } from '../shared/page-scroll.js';
import { StudioIntroText } from '../shared/intro-text.js';
import { copyAddressOnClick, revealAddressOnHover } from '../shared/copy-address.js';
import { createPageMenu } from '../shared/page-menu.js';
import { driftLogoStrip } from './logo-strip.js';

const content = document.querySelector(".about-content");
StudioPageScroll(content);
createPageMenu();
// Contact at the end works like Home's: with a mouse, pointing at it shows the
// address and a click copies it ("Copied"); on a touch screen a tap shows it.
const contact = content.querySelectorAll('.main-nav a[href^="mailto:"]');
if (matchMedia('(hover: hover) and (pointer: fine)').matches) contact.forEach(revealAddressOnHover);
else copyAddressOnClick(contact);
StudioIntroText(content);

// Work's logo strip at the end (logo-strip.js), under its glass (scripts/glass):
// loaded after the page, and only where WebGL works. The lens opens as the glass
// grows in (--lens-grow, logo-strip.css); without glass it just shows.
const clients = document.querySelector(".work-clients");
driftLogoStrip(clients);
const open = grow => clients.style.setProperty('--lens-grow', grow.toFixed(3));
open(0);
clients.querySelector('.glass-spot').addEventListener('glassgrow', ({ detail }) => open(detail.grow));
import('../glass/glass.js').then(({ createGlass }) => createGlass())
  .catch(error => { console.warn('Glass unavailable:', error); return null; })
  .then(glass => { if (!glass) open(1); });
