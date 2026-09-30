// Homepage wordmark entrance. Start once; finish immediately when navigation takes over.
function createDotEntrance(brand, onComplete = () => { }, options = {}) {
  const t = { ...createDotEntrance.defaults, ...options };
  let entranceStarted = false, finished = false, completionTimer = null;
  const animations = new Set();
  function animate(element, frames, timing) {
    const animation = element.animate(frames, timing);
    animations.add(animation);
    return animation;
  }
  function finishEntrance() {
    if (!entranceStarted || finished) return;
    finished = true;
    clearTimeout(completionTimer);
    animations.forEach(animation => animation.cancel());
    animations.clear();
    brand.classList.add("entrance-complete");
    brand.textContent = "vHuman";
    brand.removeAttribute("aria-label");
    onComplete();
  }
  function startEntrance() {
    if (entranceStarted) return;
    entranceStarted = true;
    brand.style.transitionDuration = `${t.fade}ms`;
    brand.style.transitionDelay = `${t.blank}ms`;
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
      const approach = t.dotExit * .72;
      const centered = Math.max(t.dotExit, approach + t.center);
      const end = Math.max(t.studiosDrop, centered + t.rollAway);
      // Each impact retains a fraction of vertical speed; tiny rebounds settle.
      const restitution = .62;
      const rebounds = [];
      for (let speed = restitution; floor * speed * speed > size * .003; speed *= restitution) {
        rebounds.push(speed);
      }
      const firstLanding = t.dotExit / (1 + 2 * rebounds.reduce((sum, speed) => sum + speed, 0));
      const gravity = 2 * floor / Math.max(1, firstLanding) ** 2;
      // Tip on the left edge first, then release into the same gravity as the dot.
      // Longer Studios timing extends the tipping phase, not a floaty free fall.
      const studioFallTime = Math.sqrt(2 * size * 1.2 / gravity);
      const releaseTime = Math.max(0, t.studiosDrop - studioFallTime);
      const studioFrames = [];
      const steps = Math.max(1, Math.ceil(t.studiosDrop / 16));
      for (let step = 0; step <= steps; step++) {
        const progress = step / steps;
        const fallingTime = Math.max(0, progress * t.studiosDrop - releaseTime);
        studioFrames.push({
          transform: `translateY(${.5 * gravity * fallingTime * fallingTime}px) rotate(${24 * progress * progress}deg)`,
          offset: progress
        });
      }
      animate(studios, studioFrames, { duration: t.studiosDrop, easing: "linear", fill: "forwards" });
      const clamp = value => Math.max(0, Math.min(1, value));
      // Ease into the forward stroke, then let one spring brake and settle.
      const damping = .74, frequency = 7.8, drive = 1.65;
      const decay = damping * frequency;
      const oscillation = frequency * Math.sqrt(1 - damping * damping);
      const spring = u => 1 - Math.exp(-decay * u)
        * (Math.cos(oscillation * u) + decay / oscillation * Math.sin(oscillation * u));
      const springSpeed = u => Math.exp(-decay * u)
        * frequency * frequency / oscillation * Math.sin(oscillation * u);
      const residual = spring(1) - 1, residualSpeed = springSpeed(1) * drive;
      const motion = time => {
        const u = clamp((time - approach) / Math.max(1, t.center));
        const q = clamp((u - .75) / .25);
        const correction = residual * (3 * q * q - 2 * q ** 3)
          + residualSpeed * .25 * (q ** 3 - q * q);
        const correctionSpeed = residual * (6 * q - 6 * q * q) / .25
          + residualSpeed * (3 * q * q - 2 * q);
        return {
          x: shift * (spring(u ** drive) - correction),
          velocity: shift * (springSpeed(u ** drive) * drive * u ** (drive - 1)
            - correctionSpeed) / Math.max(1, t.center)
        };
      };
      const wordX = time => motion(time).x;
      // A moving support surface through the i-dot's resting point. The dot
      // stays above it until the tipping word accelerates away beneath it.
      const studioBounds = studios.getBoundingClientRect();
      const pivotX = studioBounds.left - bounds.left;
      const pivotY = studioBounds.bottom - bounds.top;
      const dotX = dotLeft + dotInkWidth / 2;
      const restingY = ground - bounds.top - floor;
      const support = (time, x) => {
        const progress = clamp(time / Math.max(1, t.studiosDrop));
        const angle = 24 * Math.PI / 180 * progress * progress;
        const fallingTime = Math.max(0, time - releaseTime);
        return pivotY + (restingY - pivotY) / Math.cos(angle)
          + Math.tan(angle) * (dotX + x - pivotX)
          + .5 * gravity * fallingTime * fallingTime - restingY;
      };
      // The d ascender is taller than the generic support. Give its actual
      // ink bounds a rotating collider so the dot cannot pass through its top.
      const dRange = document.createRange();
      dRange.setStart(studios.firstChild, 4);
      dRange.setEnd(studios.firstChild, 5);
      const dBox = dRange.getBoundingClientRect();
      const dInk = ctx.measureText("d");
      const radius = Math.max(.5, (dotBottom - dotTop) / 2);
      const dRect = {
        left: dBox.left - studioBounds.left - dInk.actualBoundingBoxLeft,
        right: dBox.left - studioBounds.left + dInk.actualBoundingBoxRight,
        top: textBaseline - studioBounds.bottom - dInk.actualBoundingBoxAscent,
        bottom: textBaseline - studioBounds.bottom + dInk.actualBoundingBoxDescent
      };
      const clearAscender = (time, x, y) => {
        const progress = clamp(time / Math.max(1, t.studiosDrop));
        const angle = 24 * Math.PI / 180 * progress * progress;
        const c = Math.cos(angle), s = Math.sin(angle);
        const fallTime = Math.max(0, time - releaseTime);
        const drop = .5 * gravity * fallTime * fallTime;
        const dx = dotX + x - pivotX, dy = restingY + y - radius - pivotY - drop;
        let lx = c * dx + s * dy, ly = -s * dx + c * dy;
        const nearX = Math.max(dRect.left, Math.min(dRect.right, lx));
        const nearY = Math.max(dRect.top, Math.min(dRect.bottom, ly));
        const nx = lx - nearX, ny = ly - nearY, distance = Math.hypot(nx, ny);
        if (distance >= radius) return { x, y };
        if (distance > .001) {
          lx = nearX + nx / distance * radius;
          ly = nearY + ny / distance * radius;
        } else {
          // Entering from the i side: resolve to the right of the ascender.
          lx = dRect.right + radius;
        }
        return {
          x: pivotX + c * lx - s * ly - dotX,
          y: pivotY + drop + s * lx + c * ly - restingY + radius
        };
      };
      // Fixed-step simulation is calculated once, never in the rendering loop.
      const trajectory = [{ x: 0, y: 0 }];
      const stepTime = 4;
      let x = 0, y = 0, velocityY = 0, supported = true, grounded = false;
      for (let time = stepTime; time <= end + stepTime; time += stepTime) {
        // A small leftward drift starts gently as the support tilts.
        const velocityX = -size * .00065 * clamp(time / Math.max(1, releaseTime));
        x += velocityX * stepTime;
        const previousSupport = support(time - stepTime, x - velocityX * stepTime);
        const nextSupport = support(time, x);
        const nextY = y + velocityY * stepTime + .5 * gravity * stepTime * stepTime;
        velocityY += gravity * stepTime;
        const overWord = dotX + x >= pivotX && dotX + x <= pivotX + studioBounds.width;
        if (overWord && nextSupport < floor && y <= previousSupport + .5 && nextY >= nextSupport) {
          y = nextSupport;
          velocityY = (nextSupport - previousSupport) / stepTime;
          supported = true;
        } else {
          y = nextY;
          supported = false;
        }
        const clear = clearAscender(time, x, y);
        if (clear.y < y) velocityY = Math.min(velocityY, (clear.y - trajectory.at(-1).y) / stepTime);
        x = clear.x;
        y = clear.y;
        if (grounded) { y = floor; velocityY = 0; }
        else if (!supported && y >= floor) {
          // Resolve the crossing within this step to avoid losing rebound energy.
          const previousY = trajectory.at(-1).y;
          const beforeVelocity = velocityY - gravity * stepTime;
          const hitTime = clamp((-beforeVelocity + Math.sqrt(Math.max(0, beforeVelocity ** 2 + 2 * gravity * (floor - previousY)))) / gravity / stepTime) * stepTime;
          const hitSpeed = beforeVelocity + gravity * hitTime;
          const rebound = hitSpeed * restitution;
          const remaining = stepTime - hitTime;
          grounded = rebound * rebound / (2 * gravity) < size * .003;
          y = grounded ? floor : floor - rebound * remaining + .5 * gravity * remaining * remaining;
          velocityY = grounded ? 0 : -rebound + gravity * remaining;
        }
        trajectory.push({ x, y });
      }
      const sample = time => {
        const index = Math.min(trajectory.length - 2, Math.floor(time / stepTime));
        const mix = clamp(time / stepTime - index);
        const a = trajectory[index], b = trajectory[index + 1];
        return { x: a.x + (b.x - a.x) * mix, y: a.y + (b.y - a.y) * mix };
      };
      const driftX = time => sample(time).x;
      // Find contact along the existing paths; do not aim the dot at a letter.
      let impact = null;
      for (let time = approach; time <= end; time += 4) {
        if (humanRight + wordX(time) >= dotLeft + driftX(time)) {
          let low = Math.max(approach, time - 4), high = time;
          for (let i = 0; i < 12; i++) {
            const middle = (low + high) / 2;
            if (humanRight + wordX(middle) >= dotLeft + driftX(middle)) high = middle;
            else low = middle;
          }
          impact = high;
          break;
        }
      }
      const contact = impact === null ? null : sample(impact);
      const incomingX = impact === null ? 0 : (contact.x - sample(Math.max(0, impact - 2)).x) / 2;
      const incomingY = impact === null ? 0 : (contact.y - sample(Math.max(0, impact - 2)).y) / 2;
      // A modest angled contact sends the dot right/up. No minimum throw,
      // delayed release, compression hold, or extra launch boost.
      const nx = Math.cos(Math.PI / 8), ny = -Math.sin(Math.PI / 8);
      const massRatio = .035, restitutionAtWord = .55;
      const relativeSpeed = impact === null ? 0 : (incomingX - motion(impact).velocity) * nx + incomingY * ny;
      const impulse = Math.max(0, -(1 + restitutionAtWord) * relativeSpeed / (1 + massRatio * nx * nx));
      const vx = incomingX + impulse * nx, vy = incomingY + impulse * ny;
      const recoilSpeed = -massRatio * impulse * nx;
      const exitDepth = Math.max(1, dotBottom - dotTop) + size * .02;
      const flightDuration = contact ? (-vy + Math.sqrt(vy * vy
        + 2 * gravity * Math.max(0, floor + exitDepth - contact.y))) / gravity : 0;
      const playbackEnd = Math.max(end, (impact ?? 0) + flightDuration);
      const wordPosition = time => {
        if (impact === null || time <= impact || time >= centered) return wordX(time);
        const duration = Math.max(1, centered - impact);
        const u = (time - impact) / duration;
        // One small impulse response; vanishes with zero speed at the center.
        return wordX(time) + recoilSpeed * duration * u * (1 - u) ** 3;
      };
      // Sample curved paths once. Playback remains a browser transform animation.
      const times = new Set([0, releaseTime, approach, centered, playbackEnd]);
      if (impact !== null) {
        times.add(impact);
        times.add(impact + Math.max(0, -vy / gravity));
        times.add(impact + flightDuration);
      }
      for (let time = 0; time < playbackEnd; time += 16) times.add(time);
      const dotFrames = [], wordFrames = [];
      for (const time of [...times].sort((a, b) => a - b)) {
        const elapsed = impact === null ? -1 : time - impact;
        const point = elapsed < 0 ? sample(time) : {
          x: contact.x + vx * elapsed,
          y: contact.y + vy * elapsed + .5 * gravity * elapsed * elapsed
        };
        const offset = time / Math.max(1, playbackEnd);
        dotFrames.push({ transform: `translate(${point.x}px, ${point.y}px)`, offset });
        wordFrames.push({ transform: `translateX(${wordPosition(time)}px)`, offset });
      }
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
      let braking = approach, peakSpeed = 0;
      for (let time = approach; time < centered; time += 4) {
        if (motion(time).velocity > peakSpeed) { peakSpeed = motion(time).velocity; braking = time; }
      }
      Array.from(spacer.textContent).forEach((character, index) => {
        const letter = document.createElement("span");
        letter.textContent = character;
        letter.style.cssText = `position:absolute;left:${positions[index]}px;top:0`;
        human.append(letter);
        const frames = wordFrames.map(frame => {
          const time = frame.offset * playbackEnd;
          const progress = clamp((time - braking) / Math.max(1, centered - braking));
          const compression = Math.sin(Math.PI * progress) ** 2;
          return { transform: `translateX(${(5 - index) * size * .0104 * compression}px)`, offset: frame.offset };
        });
        animate(letter, frames, { duration: playbackEnd, easing: "linear", fill: "forwards" });
      });
      const fall = animate(dot, dotFrames, { duration: playbackEnd, easing: "linear", fill: "forwards" });
      animate(human, wordFrames, { duration: playbackEnd, easing: "linear", fill: "forwards" });
      fall.onfinish = finishEntrance;
    }
    const drop = -(innerHeight + letter.getBoundingClientRect().height);
    const dotAnimation = animate(dot, [
      { transform: `translateY(${drop}px)`, offset: 0, easing: "cubic-bezier(.35,0,.65,1)" },
      { transform: "translateY(0)", offset: .54, easing: "cubic-bezier(0,0,.3,1)" },
      { transform: "translateY(-.23em)", offset: .73, easing: "cubic-bezier(.4,0,.7,1)" },
      { transform: "translateY(0)", offset: .89, easing: "ease-out" },
      { transform: "translateY(-.035em)", offset: .95, easing: "ease-in-out" },
      { transform: "translateY(0)", offset: 1 }
    ], { duration: t.drop, delay: t.dropDelay, fill: "both" });
    dotAnimation.onfinish = () => {
      completionTimer = setTimeout(exitStudios, Math.max(0, t.blank + t.fade - t.dropDelay - t.drop) + t.landedHold);
    };
  }
  return { start: startEntrance, finish: finishEntrance };
}

createDotEntrance.defaults = Object.freeze({"blank": 400, "fade": 1600, "dropDelay": 1300, "drop": 1100, "landedHold": 350, "studiosDrop": 850, "dotExit": 1400, "center": 700, "rollAway": 300});
createDotEntrance.duration = t => Math.max(t.blank + t.fade, t.dropDelay + t.drop) + t.landedHold + Math.max(t.studiosDrop, Math.max(t.dotExit, t.dotExit * .72 + t.center) + t.rollAway);
