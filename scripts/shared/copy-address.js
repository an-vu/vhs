import { swapText } from './swap-text.js';

// An email link that also copies its address and shows it in the link's place, for
// a computer with no mail app set up (the email opens nothing there), and since no
// text on the site can be selected. The address stays once shown. A link's
// [data-nosnippet] span, if it has one, takes the address, so it stays out of
// Google's result text like the word it replaces.
const addressOf = link => decodeURIComponent(link.getAttribute('href').slice(7).split('?')[0]);
const textOf = link => link.querySelector('[data-nosnippet]') ?? link;

export function copyAddressOnClick(links) {
  for (const link of links) {
    link.addEventListener('click', () => {
      const address = addressOf(link);
      navigator.clipboard?.writeText(address).catch(() => {});
      textOf(link).textContent = address;
      link.classList.add('is-address');
    });
  }
}

// Home's Contact with a mouse: pointing at it shows the address, and clicking also
// copies it and says so for a moment ("Copied"), then shows the address again, or
// the word once the pointer has left. Touch screens keep copyAddressOnClick (a
// phone always has a mail app, and there's no pointing).
// The texts cross-fade in one spot (swap-text.js, shared with About's town). The
// room the dots behind Home's text make for each word fades with it
// (text-mask.js); "studio:text-change" starts that.
export function revealAddressOnHover(link) {
  const word = textOf(link).textContent, address = addressOf(link);
  let pointed = false, copied = 0;
  const swap = swapText(link, { onChange: () => dispatchEvent(new Event('studio:text-change')) });
  const show = value => {
    link.classList.toggle('is-address', value !== word);
    swap(value);
  };
  // Leaving, the address stays a moment before the word comes back; pointing again
  // in that moment keeps it.
  let leaving = 0;
  link.addEventListener('pointerenter', () => {
    pointed = true;
    clearTimeout(leaving);
    if (!copied) show(address);
  });
  link.addEventListener('pointerleave', () => {
    pointed = false;
    clearTimeout(leaving);
    leaving = setTimeout(() => { if (!copied && !pointed) show(word); }, 500);
  });
  link.addEventListener('click', () => {
    navigator.clipboard?.writeText(address).catch(() => {});
    show('Copied');
    clearTimeout(copied);
    copied = setTimeout(() => { copied = 0; show(pointed ? address : word); }, 1500);
  });
}
