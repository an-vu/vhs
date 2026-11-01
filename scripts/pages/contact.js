import { StudioContentList } from '../shared/content-list.js';
import { copyAddressOnClick } from '../shared/copy-address.js';
import { createPageMenu } from '../shared/page-menu.js';

// A link to a row (/contact#id) opens it.
StudioContentList(document.querySelector(".contact-content"), { deepLinks: true });
createPageMenu();
copyAddressOnClick(document.querySelectorAll('.contact-content a[href^="mailto:"]'));
