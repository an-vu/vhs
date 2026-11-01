import { StudioContentList } from '../shared/content-list.js';
import { copyAddressOnClick } from '../shared/copy-address.js';
import { createPageMenu } from '../shared/page-menu.js';

// A link to a row (/services#id) opens it.
StudioContentList(document.querySelector(".services-content"), { deepLinks: true });
createPageMenu();
copyAddressOnClick(document.querySelectorAll('.services-content a[href^="mailto:"]'));
