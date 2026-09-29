function createTypingEntrance(brand, onComplete = () => {}) {
  const fullName = "vHuman Studios", finalName = "vHuman";
  let started = false, timer = null, count = 0, blinking = null;

  function finish() {
    if (!started) return;
    clearTimeout(timer);
    timer = null;
    if (blinking) {
      blinking.onfinish = null;
      blinking.cancel();
      blinking = null;
    }
    brand.classList.remove("is-typing", "typing-ready");
    brand.classList.add("entrance-complete");
    brand.textContent = finalName;
    brand.removeAttribute("aria-label");
    onComplete();
  }

  function start() {
    if (started) return;
    started = true;
    brand.classList.add("is-typing");
    brand.setAttribute("aria-label", fullName);
    const text = document.createElement("span");
    text.setAttribute("aria-hidden", "true");
    const cursor = document.createElement("span");
    cursor.className = "intro-cursor";
    cursor.setAttribute("aria-hidden", "true");
    brand.replaceChildren(text, cursor);

    function blinkThen(next, iterations = 3) {
      blinking = cursor.animate([
        { opacity: 0, offset: 0, easing: "steps(1, end)" },
        { opacity: 1, offset: .45 },
        { opacity: 1, offset: 1 }
      ], { duration: 1000, iterations, easing: "linear" });
      blinking.onfinish = () => {
        blinking = null;
        next();
      };
    }
    function erase() {
      text.textContent = fullName.slice(0, --count);
      if (count > finalName.length) timer = setTimeout(erase, 110);
      else blinkThen(dismissCursor, 3);
    }
    function dismissCursor() {
      blinking = cursor.animate([
        { transform: "scaleY(1)", opacity: 1 },
        { transform: "scaleY(0)", opacity: 0 }
      ], { duration: 550, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
      blinking.onfinish = finish;
    }
    function type() {
      text.textContent = fullName.slice(0, ++count);
      if (count === fullName.length) blinkThen(erase, 3);
      else timer = setTimeout(type, count === finalName.length ? 600 : 140);
    }
    timer = setTimeout(() => {
      brand.classList.add("typing-ready");
      blinkThen(type);
    }, 400);
  }

  return { start, finish };
}
