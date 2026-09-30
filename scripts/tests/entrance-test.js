(() => {
  const factories = { dot: createDotEntrance, typing: createTypingEntrance, shuffle: createShuffleEntrance };
  const settings = Object.fromEntries(Object.entries(factories).map(([key, factory]) => [key, { ...factory.defaults }]));
  const labels = { 
    blank: 'Blank screen',

    fade: 'Fade in',
    dropDelay: 'Drop starts after',
    drop: 'Drop and bounce',
    landedHold: 'Hold after dot lands',
    studiosDrop: '"Studios" falls out',
    dotExit: 'Dot falls and settles through bounces',
    center: 'Slide vHuman to center',
    rollAway: 'Dot rolls away and falls',

    blink: 'One blink',
    before: 'Blinks before typing',
    beforeDelete: 'Blinks before deleting',
    afterDelete: 'Blinks after deleting',
    type: 'Time between letters',
    wordPause: 'Pause after "vHuman"',
    erase: 'Time between deletions',
    dismiss: 'Cursor shrink',

    hold: 'Hold "vHuman Studios""',
    move: 'Each shuffle',
    finalMove: 'Final shuffle into "vHuman"',
    shufflePause: 'Pause after first shuffle',
    holdScrambled: 'Hold “itsanvuduH oSm”',
    fadeStudios: '"Studios" fade out',
    holdRemaining: 'Hold remaining letters',
    remainingPause: 'Pause before final shuffle' };
  const counts = new Set(['before', 'beforeDelete', 'afterDelete']);
  const preview = document.getElementById('preview');
  const form = document.getElementById('timings');
  const status = document.getElementById('test-status');
  const choices = document.getElementById('choices');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let selected = 'typing', entrance, generation = 0;
  function totals() {
    for (const button of choices.children) {
      const key = button.dataset.name;
      button.textContent = `${key} · ${(factories[key].duration(settings[key]) / 1000).toFixed(2)}s`;
    }
  }
  function fields() {
    form.replaceChildren();
    for (const [key, value] of Object.entries(settings[selected])) {
      const label = document.createElement('label');
      label.textContent = labels[key];
      const input = document.createElement('input');
      input.type = 'number'; input.name = key;
      input.min = '0'; input.max = counts.has(key) ? '10' : '30';
      input.step = counts.has(key) ? '1' : '.01';
      input.value = counts.has(key) ? value : value / 1000;
      input.addEventListener('input', () => {
        if (!input.checkValidity() || input.value === '') return;
        settings[selected][key] = Number(input.value) * (counts.has(key) ? 1 : 1000);
        totals();
      });
      label.append(input); form.append(label);
    }
    [...choices.children].forEach(button => button.setAttribute('aria-pressed', String(button.dataset.name === selected)));
    totals();
  }
  function replay() {
    if (!form.reportValidity()) return;
    const token = ++generation;
    entrance?.finish();
    const brand = document.createElement('div');
    brand.id = 'introBrand'; brand.className = 'brand intro-brand'; brand.textContent = 'vHuman Studios';
    preview.replaceChildren(brand);
    brand.style.fontSize = '100px';
    const factor = brand.getBoundingClientRect().width / 100 * 1.08;
    brand.style.fontSize = `${Math.min(200, preview.clientHeight * .25, (preview.clientWidth - 40) / factor)}px`;
    if (reduced.matches) {
      brand.classList.add('entrance-complete'); status.textContent = 'Reduced motion enabled; preview is static.'; return;
    }
    let began;
    entrance = factories[selected](brand, () => {
      if (token !== generation) return;
      status.textContent = `Finished in ${((performance.now() - began) / 1000).toFixed(2)}s (measured).`;
    }, settings[selected]);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (token !== generation) return;
      began = performance.now(); status.textContent = 'Playing…';
      // Configure dot fade before triggering its CSS transition.
      if (selected === 'dot') {
        brand.style.transitionDuration = `${settings.dot.fade}ms`;
        brand.style.transitionDelay = `${settings.dot.blank}ms`;
      }
      brand.classList.add('is-visible'); entrance.start();
    }));
  }
  for (const key of Object.keys(factories)) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = key; button.dataset.name = key;
    button.addEventListener('click', () => { selected = key; fields(); replay(); });
    choices.append(button);
  }
  form.addEventListener('submit', event => { event.preventDefault(); replay(); });
  document.getElementById('replay').addEventListener('click', replay);
  document.getElementById('reset').addEventListener('click', () => { settings[selected] = { ...factories[selected].defaults }; fields(); replay(); });
  reduced.addEventListener('change', replay);
  addEventListener('resize', () => { ++generation; entrance?.finish(); status.textContent = 'Resized — press Replay to fit the preview.'; });
  fields(); replay();
})();
