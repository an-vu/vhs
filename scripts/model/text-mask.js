// Letter-shaped exclusion shared by Home and About. Repaint only when layout changes.
export function createTextMask(container, text, onPaint) {
  const mask = document.createElement("canvas");
  const ctx = mask.getContext("2d");
  let maskKey = "";
  const glyphCache = new Map();
  function getGlyphs(element, rect, css, scale) {
    const key = JSON.stringify([element.textContent, css.fontSize, css.fontFamily,
    css.fontStyle, css.fontWeight, css.letterSpacing, css.lineHeight, element.clientWidth]);
    const cached = glyphCache.get(element);
    if (cached?.key === key) return cached;
    ctx.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
    const metrics = ctx.measureText("Hg");
    const ascent = metrics.fontBoundingBoxAscent ?? parseFloat(css.fontSize) * .8;
    const descent = metrics.fontBoundingBoxDescent ?? parseFloat(css.fontSize) * .2;
    const glyphs = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      for (let i = 0; i < node.length; i++) {
        if (/\s/.test(node.textContent[i])) continue;
        range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        glyphs.push({
          letter: node.textContent[i], x: (r.left - rect.left) / scale,
          y: (r.top - rect.top + r.height / 2) / scale + (ascent - descent) / 2
        });
      }
    }
    const entry = { key, glyphs };
    glyphCache.set(element, entry);
    return entry;
  }
  function paintTextMask() {
    const bounds = container.getBoundingClientRect();
    const rows = (typeof text === 'function' ? text() : text).map(element => ({ element, rect: element.getBoundingClientRect(), css: getComputedStyle(element) }));
    const key = JSON.stringify([bounds.x, bounds.y, bounds.width, bounds.height, ...rows.map(({ element, rect, css }) =>
      [element.textContent, rect.x, rect.y, rect.width, rect.height, css.fontSize, css.fontFamily,
      css.fontWeight, css.fontStyle, css.letterSpacing, css.opacity, css.transform])]);
    if (key === maskKey) return;
    maskKey = key;
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (mask.width !== width) mask.width = width;
    if (mask.height !== height) mask.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = ctx.strokeStyle = ctx.shadowColor = "white";
    ctx.shadowBlur = bounds.width <= 760 ? 9 : 12;
    ctx.lineWidth = bounds.width <= 760 ? 2 : 3;
    ctx.lineJoin = "round";
    ctx.textBaseline = "alphabetic";
    for (const { element, rect, css } of rows) {
      ctx.globalAlpha = Number(css.opacity);
      if (ctx.globalAlpha === 0) continue;
      const matrix = new DOMMatrixReadOnly(css.transform === "none" ? undefined : css.transform);
      const scale = Math.hypot(matrix.a, matrix.b);
      if (scale === 0) continue;
      const { glyphs } = getGlyphs(element, rect, css, scale);
      ctx.font = `${css.fontStyle} ${css.fontWeight} ${parseFloat(css.fontSize) * scale}px ${css.fontFamily}`;
      for (const { letter, x, y } of glyphs) {
        const left = rect.left - bounds.left + x * scale;
        const baseline = rect.top - bounds.top + y * scale;
        ctx.strokeText(letter, left, baseline);
        ctx.fillText(letter, left, baseline);
      }
    }
    onPaint(mask);
  }
  return { update: paintTextMask, invalidate() { glyphCache.clear(); maskKey = ""; } };
}
