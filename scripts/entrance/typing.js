function createTypingEntrance(brand, onComplete = () => { }, options = {}) {
  const t = { ...createTypingEntrance.defaults, ...options };
  const fullName = 'vHuman Studios', finalName = 'vHuman';
  const timeline = createEntranceTimeline();
  let started = false, finished = false;
  function finish() {
    if (!started || finished) return;
    finished = true; timeline.stop();
    brand.classList.remove('is-typing', 'typing-ready');
    brand.classList.add('entrance-complete');
    brand.textContent = finalName; brand.removeAttribute('aria-label');
    onComplete();
  }
  function start() {
    if (started) return;
    started = true;
    brand.classList.add('is-typing'); brand.setAttribute('aria-label', fullName);
    const text = document.createElement('span'), cursor = document.createElement('span');
    text.setAttribute('aria-hidden', 'true'); cursor.setAttribute('aria-hidden', 'true');
    cursor.className = 'intro-cursor'; brand.replaceChildren(text, cursor);
    let time = t.blank;
    timeline.at(time, () => brand.classList.add('typing-ready'));
    function blink(iterations) {
      if (iterations && t.blink) timeline.animate(cursor, [
        { opacity: 0, offset: 0, easing: 'steps(1, end)' },
        { opacity: 1, offset: .45 }, { opacity: 1, offset: 1 }
      ], { duration: t.blink, iterations, easing: 'linear' }, time);
      time += t.blink * iterations;
    }
    blink(t.before);
    for (let count = 1; count <= fullName.length; count++) {
      timeline.at(time, () => { text.textContent = fullName.slice(0, count); });
      if (count < fullName.length) time += count === finalName.length ? t.wordPause : t.type;
    }
    blink(t.beforeDelete);
    for (let count = fullName.length - 1; count >= finalName.length; count--) {
      timeline.at(time, () => { text.textContent = fullName.slice(0, count); });
      if (count > finalName.length) time += t.erase;
    }
    blink(t.afterDelete);
    timeline.animate(cursor, [
      { transform: 'scaleY(1)', opacity: 1 }, { transform: 'scaleY(0)', opacity: 0 }
    ], { duration: t.dismiss, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }, time);
    timeline.at(time + t.dismiss, finish);
    return timeline.start();
  }
  return { start, finish };
}

createTypingEntrance.defaults = Object.freeze({"blank": 400, "blink": 900, "before": 3, "beforeDelete": 2, "afterDelete": 2, "type": 120, "wordPause": 550, "erase": 100, "dismiss": 500});
createTypingEntrance.duration = t => t.blank + t.blink * (t.before + t.beforeDelete + t.afterDelete) + 12 * t.type + t.wordPause + 7 * t.erase + t.dismiss;
