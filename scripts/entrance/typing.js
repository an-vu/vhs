function createTypingEntrance(brand, onComplete = () => { }, options = {}) {
  const t = { ...createTypingEntrance.defaults, ...options };
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

    function blinkThen(next, iterations = t.before) {
      if (!iterations) { next(); return; }
      blinking = cursor.animate([
        { opacity: 0, offset: 0, easing: "steps(1, end)" },
        { opacity: 1, offset: .45 },
        { opacity: 1, offset: 1 }
      ], { duration: t.blink, iterations, easing: "linear" });
      blinking.onfinish = () => {
        blinking = null;
        next();
      };
    }
    function erase() {
      text.textContent = fullName.slice(0, --count);
      if (count > finalName.length) timer = setTimeout(erase, t.erase);
      else blinkThen(dismissCursor, t.afterDelete);
    }
    function dismissCursor() {
      blinking = cursor.animate([
        { transform: "scaleY(1)", opacity: 1 },
        { transform: "scaleY(0)", opacity: 0 }
      ], { duration: t.dismiss, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
      blinking.onfinish = finish;
    }
    function type() {
      text.textContent = fullName.slice(0, ++count);
      if (count === fullName.length) blinkThen(erase, t.beforeDelete);
      else timer = setTimeout(type, count === finalName.length ? t.wordPause : t.type);
    }
    timer = setTimeout(() => {
      brand.classList.add("typing-ready");
      blinkThen(type);
    }, t.blank);
  }

  return { start, finish };
}

createTypingEntrance.defaults = Object.freeze({"blank": 400, "blink": 900, "before": 3, "beforeDelete": 2, "afterDelete": 2, "type": 120, "wordPause": 550, "erase": 100, "dismiss": 500});
createTypingEntrance.duration = t => t.blank + t.blink * (t.before + t.beforeDelete + t.afterDelete) + 12 * t.type + t.wordPause + 7 * t.erase + t.dismiss;
