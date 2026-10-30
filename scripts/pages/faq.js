import { StudioContentList } from '../shared/content-list.js';
import { copyAddressOnClick } from '../shared/copy-address.js';
import { createPageMenu } from '../shared/page-menu.js';

// A link to a question (/faq#vhuman-studios) opens it.
StudioContentList(document.querySelector(".faq-content"), { deepLinks: true });
createPageMenu();
copyAddressOnClick(document.querySelectorAll('.faq-content a[href^="mailto:"]'));
