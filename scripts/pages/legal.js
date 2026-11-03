import { StudioPageScroll } from '../shared/page-scroll.js';
import { StudioIntroText } from '../shared/intro-text.js';
import { copyAddressOnClick } from '../shared/copy-address.js';
import { createPageMenu } from '../shared/page-menu.js';

const content = document.querySelector(".about-content");
StudioPageScroll(content);
createPageMenu();
// The addresses also copy when clicked, for a computer with no mail app set up.
copyAddressOnClick(content.querySelectorAll('a[href^="mailto:"]'));
StudioIntroText(content);
