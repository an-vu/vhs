// Rest: after a quiet moment an element gets the class is-resting, so its CSS can
// fade away what's only there while it's in use (Work's project row keeps just the
// logo in its glass; a gallery on a phone keeps just its front picture). wake()
// takes the class away and starts the wait again. While ready() is false it never
// rests (say, before its entrance); while busy() is true it waits another round (a
// pointer resting on it, a move still running, keyboard focus in it).

// How long the quiet moment is: a second after a mouse or the keyboard, .7 s after
// a finger lifts, .4 s after the mouse leaves. The CSS fades in .7 s, out .9 s.
export const REST = 1000, REST_TOUCH = 700, REST_LEAVE = 400;

export function createRest(element, { ready = () => true, busy = () => false } = {}) {
  let timer = 0;
  function rest(delay) {
    if (!ready()) return;
    if (busy()) { timer = setTimeout(() => rest(delay), delay); return; }
    element.classList.add('is-resting');
  }
  function after(delay, retry = delay) {
    clearTimeout(timer);
    timer = setTimeout(() => rest(retry), delay);
  }
  return {
    // Show everything now, rest after delay.
    wake(delay) {
      element.classList.remove('is-resting');
      after(delay);
    },
    // Rest after delay without showing anything first (the first rest after an
    // entrance); if busy then, it tries again every retry.
    after
  };
}
