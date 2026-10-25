import { StudioContentList } from '../shared/content-list.js';

// A link to a section (/legal#privacy, #cookies, #terms) opens it.
StudioContentList(document.querySelector(".legal-content"), { deepLinks: true });
