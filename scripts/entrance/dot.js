// Homepage wordmark entrance. Start once; finish immediately when navigation takes over.
// Load timeline.js and dot-motion.js first; this file owns measurements, playback and cleanup.
function createDotEntrance(brand, onComplete = () => { }, options = {}, onDuration = () => { }) {
  const t = { ...createDotEntrance.defaults, ...options };
  let entranceStarted = false, finished = false, animationOffset = 0;
  const timeline = createEntranceTimeline();
  function animate(element, frames, timing) {
    return timeline.animate(element, frames, timing, animationOffset);
  }
  function finishEntrance() {
    if (!entranceStarted || finished) return;
    finished = true;
    timeline.stop();
    brand.classList.add("entrance-complete");
    brand.textContent = "vHuman";
    brand.removeAttribute("aria-label");
    onComplete();
  }
  function startEntrance() {
    if (entranceStarted) return;
    entranceStarted = true;
    brand.style.transition = 'none';
    timeline.animate(brand, [{ opacity: 0 }, { opacity: 1 }], { duration: t.fade, easing: 'cubic-bezier(.25,.55,.25,1)', fill: 'both' }, t.blank);
    // Split the actual glyph so the dot has exactly the same shape as the wordmark.
    const letter = document.createElement("span");
    letter.className = "intro-letter-i";
    letter.setAttribute("aria-hidden", "true");
    const stem = document.createElement("span");
    stem.className = "intro-i-stem";
    stem.textContent = "i";
    const baseline = document.createElement("span");
    baseline.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    stem.append(baseline);
    const dot = document.createElement("span");
    dot.className = "intro-i-dot";
    dot.textContent = "i";
    letter.append(stem, dot);
    brand.setAttribute("aria-label", "vHuman Studios");
    const stage = document.createElement("span");
    stage.className = "intro-dot-stage";
    const human = document.createElement("span");
    human.className = "intro-dot-word";
    human.textContent = "vHuman";
    const studios = document.createElement("span");
    studios.className = "intro-dot-word";
    studios.append(document.createTextNode(" Stud"), letter, document.createTextNode("os"));
    stage.append(human, studios);
    brand.replaceChildren(stage);

    function exitStudios() {
      if (finished) return;
      // Keep the dot independent while the rest of Studios drops through the ground.
      const bounds = stage.getBoundingClientRect();
      const glyph = letter.getBoundingClientRect();
      const font = getComputedStyle(brand);
      const size = parseFloat(font.fontSize);
      const textBaseline = baseline.getBoundingClientRect().top;
      const ground = textBaseline + size * .02;
      // Measure the dot's visible ink once, rather than its clipped element box.
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = Math.ceil(size * 2);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.font = `${font.fontStyle} ${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
      const inkBaseline = Math.ceil(size * 1.2);
      ctx.fillText("i", size * .25, inkBaseline);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let dotTop = 0, dotBottom = 0, foundInk = false;
      let inkLeft = canvas.width, inkRight = 0;
      for (let y = 0; y < inkBaseline; y++) {
        let ink = false;
        for (let x = 0; x < canvas.width; x++) {
          if (pixels[(y * canvas.width + x) * 4 + 3] > 16) {
            ink = true;
            inkLeft = Math.min(inkLeft, x);
            inkRight = Math.max(inkRight, x + 1);
          }
        }
        if (ink) { if (!foundInk) dotTop = y; foundInk = true; dotBottom = y + 1; }
        else if (foundInk) break;
      }
      stage.style.width = `${bounds.width}px`;
      stage.style.clipPath = `inset(-200vh -100vw ${bounds.bottom - ground}px)`;
      dot.style.inset = "auto";
      dot.style.lineHeight = "1";
      dot.style.left = `${glyph.left - bounds.left}px`;
      dot.style.top = `${glyph.top - bounds.top}px`;
      dot.style.width = `${glyph.width}px`;
      dot.style.height = `${glyph.height}px`;
      // Both the word and dot disappear behind exactly the same ground line.
      stage.append(dot);
      studios.style.transformOrigin = "left bottom";
      const floor = (foundInk ? inkBaseline - dotBottom : size * .6) + size * .02;
      const humanWidth = human.getBoundingClientRect().width;
      const shift = (bounds.width - humanWidth) / 2;
      const dotInkLeft = foundInk ? inkLeft - size * .25 : glyph.width * .25;
      const dotInkWidth = foundInk ? inkRight - inkLeft : glyph.width * .5;
      const dotLeft = glyph.left - bounds.left + dotInkLeft;
      // Range includes the DOM's kerning and negative letter spacing. Measure
      // only the final glyph's ink; measuring the whole word loses CSS tracking.
      const lastLetter = document.createRange();
      lastLetter.setStart(human.firstChild, human.textContent.length - 1);
      lastLetter.setEnd(human.firstChild, human.textContent.length);
      const humanRight = lastLetter.getBoundingClientRect().left - bounds.left
        + ctx.measureText("n").actualBoundingBoxRight;
      const studioBounds = studios.getBoundingClientRect();
      const dRange = document.createRange();
      dRange.setStart(studios.firstChild, 4);
      dRange.setEnd(studios.firstChild, 5);
      const dBox = dRange.getBoundingClientRect();
      const dInk = ctx.measureText("d");
      const dRect = {
        left: dBox.left - studioBounds.left - dInk.actualBoundingBoxLeft,
        right: dBox.left - studioBounds.left + dInk.actualBoundingBoxRight,
        top: textBaseline - studioBounds.bottom - dInk.actualBoundingBoxAscent,
        bottom: textBaseline - studioBounds.bottom + dInk.actualBoundingBoxDescent
      };
      const { studioFrames, dotFrames, wordFrames, letterFrames, playbackEnd } = createDotMotion(t, {
        size, floor, shift, dotLeft, dotInkWidth, dotHeight: dotBottom - dotTop, humanRight,
        studioWidth: studioBounds.width,
        pivotX: studioBounds.left - bounds.left,
        pivotY: studioBounds.bottom - bounds.top,
        restingY: ground - bounds.top - floor,
        dRect
      });
      onDuration(animationOffset + playbackEnd);
      animate(studios, studioFrames, { duration: t.studiosDrop, easing: "linear", fill: "forwards" });
      // Preserve the measured kerning while allowing each letter to move.
      const humanBounds = human.getBoundingClientRect();
      const positions = Array.from(human.textContent, (_, index) => {
        const range = document.createRange();
        range.setStart(human.firstChild, index);
        range.setEnd(human.firstChild, index + 1);
        return range.getBoundingClientRect().left - humanBounds.left;
      });
      const spacer = document.createElement("span");
      spacer.textContent = human.textContent;
      spacer.style.visibility = "hidden";
      human.style.position = "relative";
      human.replaceChildren(spacer);
      Array.from(spacer.textContent).forEach((character, index) => {
        const letter = document.createElement("span");
        letter.textContent = character;
        letter.style.cssText = `position:absolute;left:${positions[index]}px;top:0`;
        human.append(letter);
        const frames = letterFrames(index);
        animate(letter, frames, { duration: playbackEnd, easing: "linear", fill: "forwards" });
      });
      animate(dot, dotFrames, { duration: playbackEnd, easing: "linear", fill: "forwards" });
      animate(human, wordFrames, { duration: playbackEnd, easing: "linear", fill: "forwards" });
      timeline.at(animationOffset + playbackEnd, finishEntrance);
    }
    const drop = -(innerHeight + letter.getBoundingClientRect().height);
    animate(dot, [
      { transform: `translateY(${drop}px)`, offset: 0, easing: "cubic-bezier(.35,0,.65,1)" },
      { transform: "translateY(0)", offset: .54, easing: "cubic-bezier(0,0,.3,1)" },
      { transform: "translateY(-.23em)", offset: .73, easing: "cubic-bezier(.4,0,.7,1)" },
      { transform: "translateY(0)", offset: .89, easing: "ease-out" },
      { transform: "translateY(-.035em)", offset: .95, easing: "ease-in-out" },
      { transform: "translateY(0)", offset: 1 }
    ], { duration: t.drop, delay: t.dropDelay, fill: "both" });
    animationOffset = Math.max(t.blank + t.fade, t.dropDelay + t.drop) + t.landedHold;
    exitStudios();
    return timeline.start();
  }
  return { start: startEntrance, finish: finishEntrance };
}

createDotEntrance.defaults = Object.freeze({ "blank": 400, "fade": 1600, "dropDelay": 1300, "drop": 1100, "landedHold": 350, "studiosDrop": 850, "dotExit": 1400, "center": 700, "rollAway": 300 });
createDotEntrance.duration = t => Math.max(t.blank + t.fade, t.dropDelay + t.drop) + t.landedHold + Math.max(t.studiosDrop, Math.max(t.dotExit, t.dotExit * .72 + t.center) + t.rollAway);
