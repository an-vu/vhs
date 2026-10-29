import { copyAddressOnClick } from './copy-address.js';

// The header's page name ("Work ›") opens a menu of the site's other pages under
// it (site.css); "vHuman" still goes home. A tap outside, Esc or picking a page
// closes it. Contact copies the address like everywhere else, so the menu stays
// open to show it.
export function createPageMenu() {
  const header = document.querySelector('.site-header');
  const button = header?.querySelector('.page-menu-toggle');
  const menu = header?.querySelector('.page-menu');
  if (!button || !menu) return;
  const isOpen = () => button.getAttribute('aria-expanded') === 'true';
  // The menu's column starts under the page name; what's left of the row past it
  // is the room an address gets (site.css).
  function place() {
    const x = button.getBoundingClientRect().left - menu.parentElement.getBoundingClientRect().left;
    header.style.setProperty('--menu-x', `${x}px`);
    header.style.setProperty('--menu-room', `${menu.parentElement.clientWidth - x}px`);
  }
  function set(open) {
    if (open === isOpen()) return;
    place();
    // The header's blur stretches down past the menu (beyond the bar's own height).
    // Its blur fades out over the lower part of its height (site.css), so it reaches
    // 1.8 times as far as the menu's last page: the pages sit in the full blur and
    // the fade happens below them.
    const bottom = menu.offsetTop + menu.offsetHeight - parseFloat(getComputedStyle(menu).paddingBottom);
    header.style.setProperty('--menu-height', `${bottom * 1.8 - menu.parentElement.clientHeight}px`);
    header.classList.toggle('is-menu-open', open);
    button.setAttribute('aria-expanded', String(open));
  }
  button.addEventListener('click', () => set(!isOpen()));
  addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isOpen()) return;
    set(false);
    button.focus();
  });
  // Outside the header, or on the menu's row but not on a page.
  addEventListener('click', event => { if (!header.contains(event.target) || event.target === menu) set(false); });
  addEventListener('resize', place);
  for (const link of menu.querySelectorAll('a:not([href^="mailto:"])')) link.addEventListener('click', () => set(false));
  copyAddressOnClick(menu.querySelectorAll('a[href^="mailto:"]'));
}
