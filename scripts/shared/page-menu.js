// The header's page name ("Work ›") opens a menu of the site's other pages under
// it (site.css); "vHuman" still goes home. A tap outside, Esc or picking a page
// closes it. Contact goes to the Contact page (/contact); it doesn't turn into the
// address like Home's. Every .page-menu-toggle in the header opens the menu its
// aria-controls names, one at a time (Work also has its project, work-title.js).
export function createPageMenu() {
  const header = document.querySelector('.site-header');
  const toggles = [...(header?.querySelectorAll('.page-menu-toggle') ?? [])]
    .map(button => ({ button, menu: document.getElementById(button.getAttribute('aria-controls')) }))
    .filter(({ menu }) => menu);
  if (!toggles.length) return { close() {}, place() {} };
  let open = null;
  // A menu's column starts under its toggle (site.css). The header's blur
  // stretches down past the menu by what it adds to the bar: it ends as far under
  // the last item as the bar ends under the heading, so with the same fade
  // (site.css) every menu, short or long, sits in the blur like the heading.
  function place() {
    if (!open) return;
    const { button, menu } = open, bar = menu.parentElement, box = bar.getBoundingClientRect();
    header.style.setProperty('--menu-x', `${button.getBoundingClientRect().left - box.left}px`);
    const line = button.parentElement.getBoundingClientRect();
    const under = box.bottom - line.bottom;
    const bottom = menu.offsetTop + menu.offsetHeight - parseFloat(getComputedStyle(menu).paddingBottom);
    header.style.setProperty('--menu-height', `${bottom + under - bar.clientHeight}px`);
  }
  function set(next) {
    if (next === open) return;
    if (open) {
      open.button.setAttribute('aria-expanded', 'false');
      open.menu.classList.remove('is-open');
    }
    open = next;
    if (open) {
      // Each item follows the one before by .04 s (site.css).
      [...open.menu.querySelectorAll('a:not([hidden])')].forEach((link, i) => link.style.setProperty('--i', i));
      place();
      open.button.setAttribute('aria-expanded', 'true');
      open.menu.classList.add('is-open');
    }
    header.classList.toggle('is-menu-open', !!open);
  }
  for (const toggle of toggles) {
    toggle.button.addEventListener('click', () => set(open === toggle ? null : toggle));
    for (const link of toggle.menu.querySelectorAll('a')) link.addEventListener('click', () => set(null));
  }
  addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !open) return;
    const { button } = open;
    set(null);
    button.focus();
  });
  // Outside the header, or on a menu's row but not on an item.
  addEventListener('click', event => {
    if (open && (!header.contains(event.target) || event.target === open.menu)) set(null);
  });
  addEventListener('resize', place);
  return { close: () => set(null), place };
}
