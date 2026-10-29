import { StudioContentList } from '../shared/content-list.js';
import { copyAddressOnClick } from '../shared/copy-address.js';
import { createPageMenu } from '../shared/page-menu.js';

// A link to a section (/legal#privacy, #cookies, #terms) opens it.
StudioContentList(document.querySelector(".legal-content"), { deepLinks: true });
createPageMenu();
// The address shows already; clicking it also copies it.
copyAddressOnClick(document.querySelectorAll('.legal-content a[href^="mailto:"]'));
