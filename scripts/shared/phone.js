// A phone, for the site's layout: a screen up to 760 px wide, or a phone on its
// side (short, with a touch screen), so turning a phone keeps its phone layout
// instead of getting the computer's squeezed into a phone's height. The
// stylesheets use the same queries in their @media rules; keep them in step.
export const SIDEWAYS = '(max-height: 500px) and (pointer: coarse)';
export const PHONE = `(max-width: 760px), ${SIDEWAYS}`;
export const phone = matchMedia(PHONE);
export const sideways = matchMedia(SIDEWAYS);
