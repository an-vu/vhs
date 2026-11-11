import { StudioPageScroll } from '../shared/page-scroll.js';
import { StudioIntroText } from '../shared/intro-text.js';
import { copyAddressOnClick } from '../shared/copy-address.js';
import { createPageMenu } from '../shared/page-menu.js';
import { driftLogoStrip, riseLogoStrip } from './logo-strip.js';

const content = document.querySelector(".about-content");
StudioPageScroll(content);
createPageMenu();
// The address at the end (and any in the text) opens an email and copies it,
// like FAQ's and Contact's.
copyAddressOnClick(content.querySelectorAll('a[href^="mailto:"]'));
// Text, then the logo strip rising in, then its glass (riseLogoStrip).
const text = StudioIntroText(content);

// Work's logo strip at the end (logo-strip.js), under its glass (scripts/glass):
// loaded after the page, and only where WebGL works. The lens opens as the glass
// grows in (--lens-grow, logo-strip.css); without glass it just shows.
const clients = document.querySelector(".work-clients");
driftLogoStrip(clients);
riseLogoStrip(clients, text.inPlace);
const open = grow => clients.style.setProperty('--lens-grow', grow.toFixed(3));
open(0);
clients.querySelector('.glass-spot').addEventListener('glassgrow', ({ detail }) => open(detail.grow));
import('../glass/glass.js').then(({ createGlass }) => createGlass())
  .catch(error => { console.warn('Glass unavailable:', error); return null; })
  .then(glass => { if (!glass) open(1); });
