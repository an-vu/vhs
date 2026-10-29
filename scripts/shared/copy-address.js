// An email link that also copies its address and shows it in the link's place, for
// a computer with no mail app set up (the email opens nothing there), and since no
// text on the site can be selected. The address stays once shown. A link's
// [data-nosnippet] span, if it has one, takes the address, so it stays out of
// Google's result text like the word it replaces.
export function copyAddressOnClick(links) {
  for (const link of links) {
    link.addEventListener('click', () => {
      const address = decodeURIComponent(link.getAttribute('href').slice(7).split('?')[0]);
      navigator.clipboard?.writeText(address).catch(() => {});
      (link.querySelector('[data-nosnippet]') ?? link).textContent = address;
      link.classList.add('is-address');
    });
  }
}
