// Homepage wordmark entrance. Start once; finish immediately when navigation takes over.
function createDotEntrance(brand) {
  let entranceStarted = false, dotAnimation = null;
  function finishEntrance() {
    if (!entranceStarted) return;
    dotAnimation?.cancel();
    dotAnimation = null;
    brand.classList.add("entrance-complete");
    brand.textContent = "vHuman Studios";
    brand.removeAttribute("aria-label");
  }
  function startEntrance() {
    if (entranceStarted) return;
    entranceStarted = true;
    // Split the actual glyph so the dot has exactly the same shape as the wordmark.
    const letter = document.createElement("span");
    letter.className = "intro-letter-i";
    letter.setAttribute("aria-hidden", "true");
    const stem = document.createElement("span");
    stem.className = "intro-i-stem";
    stem.textContent = "i";
    const dot = document.createElement("span");
    dot.className = "intro-i-dot";
    dot.textContent = "i";
    letter.append(stem, dot);
    brand.setAttribute("aria-label", "vHuman Studios");
    brand.replaceChildren(document.createTextNode("vHuman Stud"), letter, document.createTextNode("os"));
    const drop = -(innerHeight + letter.getBoundingClientRect().height);
    dotAnimation = dot.animate([
      { transform: `translateY(${drop}px)`, offset: 0, easing: "cubic-bezier(.35,0,.65,1)" },
      { transform: "translateY(0)", offset: .54, easing: "cubic-bezier(0,0,.3,1)" },
      { transform: "translateY(-.23em)", offset: .73, easing: "cubic-bezier(.4,0,.7,1)" },
      { transform: "translateY(0)", offset: .89, easing: "ease-out" },
      { transform: "translateY(-.035em)", offset: .95, easing: "ease-in-out" },
      { transform: "translateY(0)", offset: 1 }
    ], { duration: 1100, delay: 1950, fill: "both" });
    dotAnimation.onfinish = finishEntrance;
  }
  return { start: startEntrance, finish: finishEntrance };
}
