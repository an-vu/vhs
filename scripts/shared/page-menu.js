// The header's page name ("Work ›") opens a menu of the site's other pages under
// it (site.css); "vHuman" still goes home. A tap outside, Esc or picking a page
// closes it. Contact is a plain link: the email for now, the Contact page (/contact)
// once it's built; it doesn't turn into the address like Home's.
export function createPageMenu() {
  const header = document.querySelector('.site-header');
  const button = header?.querySelector('.page-menu-toggle');
  const menu = header?.querySelector('.page-menu');
  if (!button || !menu) return;
  const isOpen = () => button.getAttribute('aria-expanded') === 'true';
  // The menu's column starts under the page name (site.css). The header's blur
  // stretches down past the menu by what it adds to the bar: it ends as far under
  // the last page as the bar ends under the heading, so with the same fade
  // (site.css) every menu, two pages or three, sits in the blur like the heading.
  function place() {
    const bar = menu.parentElement, box = bar.getBoundingClientRect();
    header.style.setProperty('--menu-x', `${button.getBoundingClientRect().left - box.left}px`);
    const under = box.bottom - button.closest('.page-heading').getBoundingClientRect().bottom;
    const bottom = menu.offsetTop + menu.offsetHeight - parseFloat(getComputedStyle(menu).paddingBottom);
    header.style.setProperty('--menu-height', `${bottom + under - bar.clientHeight}px`);
  }
  function set(open) {
    if (open === isOpen()) return;
    place();
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
  for (const link of menu.querySelectorAll('a')) link.addEventListener('click', () => set(false));
}
