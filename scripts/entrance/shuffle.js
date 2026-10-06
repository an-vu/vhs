function createShuffleEntrance(brand, onComplete = () => { }, options = {}) {
  const t = { ...createShuffleEntrance.defaults, ...options };
  const name = "vHuman Studios";
  let started = false, finished = false;
  const timeline = createEntranceTimeline();

  function finish() {
    if (!started || finished) return;
    finished = true;
    timeline.stop();
    brand.classList.remove("is-shuffling");
    brand.classList.add("entrance-complete");
    brand.textContent = "vHuman";
    brand.removeAttribute("aria-label");
    onComplete();
  }

  function start() {
    if (started) return;
    started = true;
    const ids = Array.from(name, (_, i) => i);
    function shuffled(source = ids) {
      const order = [...source];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      return order;
    }
    const first = [...ids];
    const available = [...ids];
    const second = Array.from("itsanvuduH oSm", letter => {
      const index = available.findIndex(id => name[id] === letter);
      return available.splice(index, 1)[0];
    });
    const final = ids.slice(0, 6);
    const stage = document.createElement("span");
    stage.className = "intro-shuffle";
    stage.setAttribute("aria-hidden", "true");
    brand.setAttribute("aria-label", name);
    brand.classList.add("is-shuffling");
    brand.replaceChildren(stage);

    // Measure real text once, retaining this font's kerning and letter spacing.
    const probe = document.createElement("span");
    probe.className = "intro-shuffle-probe";
    stage.append(probe);
    function measure(order) {
      probe.textContent = order.map(i => name[i]).join("");
      const bounds = probe.getBoundingClientRect();
      const range = document.createRange();
      const positions = new Map();
      order.forEach((id, index) => {
        range.setStart(probe.firstChild, index);
        range.setEnd(probe.firstChild, index + 1);
        positions.set(id, range.getBoundingClientRect().left - bounds.left);
      });
      return { width: bounds.width, positions };
    }
    const layouts = [first, second, final].map(measure);
    const intermediate = measure(shuffled());
    const remainingOrder = shuffled(final);
    if (remainingOrder.every((id, index) => id === final[index])) {
      remainingOrder.push(remainingOrder.shift());
    }
    const remainingShuffle = measure(remainingOrder);
    probe.remove();
    const width = Math.max(...[...layouts, intermediate, remainingShuffle].map(layout => layout.width));
    stage.style.width = `${width}px`;
    const x = (layout, id) => (width - layout.width) / 2 + layout.positions.get(id);
    const letters = ids.map(id => {
      const letter = document.createElement("span");
      letter.className = "intro-shuffle-letter";
      letter.textContent = name[id];
      letter.style.transform = `translateX(${x(layouts[0], id)}px)`;
      letter.style.opacity = 0;
      stage.append(letter);
      return letter;
    });

    let time = t.blank;
    function animate(group, frames, duration, easing = 'cubic-bezier(.45,0,.25,1)') {
      group.forEach(id => timeline.animate(letters[id], frames(id), { duration, easing, fill: 'forwards' }, time));
      time += duration;
    }
    function move(group, from, to, duration = t.move) {
      animate(group, id => [
        { transform: `translateX(${x(from, id)}px)`, opacity: 1 },
        { transform: `translateX(${x(to.positions.has(id) ? to : from, id)}px)`, opacity: to.positions.has(id) ? 1 : 0 }
      ], duration);
    }
    animate(ids, () => [{ opacity: 0 }, { opacity: 1 }], t.fade);
    time += t.hold;
    move(ids, layouts[0], intermediate);
    time += t.shufflePause;
    move(ids, intermediate, layouts[1]);
    time += t.holdScrambled;
    const studios = second.filter(id => id >= 6);
    animate(studios, () => [{ opacity: 1 }, { opacity: 0 }], t.fadeStudios);
    timeline.at(time, () => studios.forEach(id => letters[id].remove()));
    time += t.holdRemaining;
    move(final, layouts[1], remainingShuffle);
    time += t.remainingPause;
    move(final, remainingShuffle, layouts[2], t.finalMove);
    timeline.at(time, finish);
    return timeline.start();
  }

  return { start, finish };
}

createShuffleEntrance.defaults = Object.freeze({"blank": 400, "fade": 800, "hold": 800, "move": 350, "shufflePause": 100, "holdScrambled": 550, "fadeStudios": 700, "holdRemaining": 300, "finalMove": 650, "remainingPause": 100});
createShuffleEntrance.duration = t => t.blank + t.fade + t.hold + 3 * t.move + t.finalMove + t.shufflePause + t.holdScrambled + t.fadeStudios + t.holdRemaining + t.remainingPause;
