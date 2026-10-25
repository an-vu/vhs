// Copies what the live page shows, so the glass bends exactly what is there.
// Two layers: `scroll` is everything that moves with the page, in page
// coordinates, so scrolling only needs the strip that comes into view; `fixed`
// is the header and footer, in viewport coordinates, drawn above the header and
// footer glass; `live` is any fixed canvas (the rover), which redraws all the
// time. Each word is drawn at the position the browser gave it, so line breaks
// and spacing match the real page. Units are CSS px.
export function createSnapshot(onIconLoad) {
  const ascents = new Map(), icons = new Map();

  function ascent(context, font) {
    let value = ascents.get(font);
    if (value === undefined) {
      context.font = font;
      value = context.measureText('Hg').fontBoundingBoxAscent;
      ascents.set(font, value);
    }
    return value;
  }
  const radiusOf = (value, rect) => value.endsWith('%') ? parseFloat(value) / 100 * Math.min(rect.width, rect.height) : parseFloat(value) || 0;
  const visibleColor = color => color && color !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(color);

  // SVG icons are drawn from a copy, with hidden parts removed, made once in white
  // at twice their layout size (transforms ignored) and tinted to their current
  // color as they're painted. A logo that changes size and color as it slides
  // then reuses one image instead of making a new one every frame. Brand-color
  // logos ([data-color]) keep their colors, with the page's --logo-ink. Each one
  // is turned into a bitmap once it loads: drawing the SVG itself redraws every
  // path each time (big logos cost milliseconds a frame).
  function icon(element) {
    // Made once at 512 px on the long side, whatever its size on the page, so it
    // stays sharp when the Icon tab magnifies the Work dock.
    // Proportions from its laid-out box (computed width/height can read "auto").
    const box = element.getBoundingClientRect();
    const aspect = box.width && box.height ? box.width / box.height : 1;
    const w = aspect >= 1 ? 512 : 512 * aspect, h = aspect >= 1 ? 512 / aspect : 512;
    const ink = element.hasAttribute('data-color') ? element.ownerDocument.defaultView.getComputedStyle(element).getPropertyValue('--logo-ink').trim() : '';
    const key = `${aspect.toFixed(3)}|${ink}|${element.outerHTML}`;
    let entry = icons.get(key);
    if (!entry) {
      const copy = element.cloneNode(true);
      const live = [element, ...element.querySelectorAll('*')], copies = [copy, ...copy.querySelectorAll('*')];
      live.forEach((node, i) => {
        if (i && element.ownerDocument.defaultView.getComputedStyle(node).display === 'none') copies[i].remove();
      });
      copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      copy.setAttribute('width', w); copy.setAttribute('height', h);
      copy.setAttribute('color', '#fff');
      if (ink) copy.style.setProperty('--logo-ink', ink);
      entry = { raster: null };
      const image = new Image();
      image.onload = () => {
        const raster = document.createElement('canvas');
        raster.width = Math.ceil(w); raster.height = Math.ceil(h);
        raster.getContext('2d', { willReadFrequently: true }).drawImage(image, 0, 0, raster.width, raster.height);
        entry.raster = raster;
        onIconLoad();
      };
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
      icons.set(key, entry);
    }
    return entry.raster;
  }
  // Tinting happens on a scratch canvas kept in memory (like the page copies and
  // the icon bitmaps): mixing GPU and memory canvases made every tinted logo wait
  // for the GPU. It only grows, so painting a strip of logos doesn't reallocate it.
  const scratch = document.createElement('canvas'), tint = scratch.getContext('2d', { willReadFrequently: true });
  function drawTinted(context, op) {
    const { rect } = op, t = context.getTransform(), scale = Math.hypot(t.a, t.b);
    const w = Math.max(1, Math.ceil(rect.width * scale)), h = Math.max(1, Math.ceil(rect.height * scale));
    if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(scratch.width, w); scratch.height = Math.max(scratch.height, h); }
    tint.globalCompositeOperation = 'copy';
    tint.drawImage(op.source, 0, 0, w, h);
    tint.globalCompositeOperation = 'source-in';
    tint.fillStyle = op.tint; tint.fillRect(0, 0, w, h);
    context.drawImage(scratch, 0, 0, w, h, rect.left, rect.top, rect.width, rect.height);
  }


  // `areas.scroll` (page coordinates) and `areas.fixed` (viewport) limit what's
  // collected; either may be null to skip that layer.
  // The four screen corners of an element under a 3D transform (perspective,
  // rotateY), or null for flat ones. Its layout box goes through the matrix around
  // the transform origin, then the result is placed where the browser says it is.
  function quadOf(element, style) {
    const m = style.transform.match(/^matrix3d\(([^)]+)\)/);
    if (!m) return null;
    const v = m[1].split(',').map(Number);
    const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat);
    const w = element.offsetWidth, h = element.offsetHeight;
    const project = (x, y) => {
      const lx = x - ox, ly = y - oy, W = v[3] * lx + v[7] * ly + v[15];
      return [(v[0] * lx + v[4] * ly + v[12]) / W, (v[1] * lx + v[5] * ly + v[13]) / W];
    };
    const corners = [project(0, 0), project(w, 0), project(w, h), project(0, h)];
    const r = element.getBoundingClientRect();
    const minX = Math.min(...corners.map(p => p[0])), minY = Math.min(...corners.map(p => p[1]));
    return corners.map(([x, y]) => [x - minX + r.left, y - minY + r.top]);
  }
  // An image into a projected quad: thin vertical strips, each a flat (affine) piece,
  // cropped to cover like object-fit.
  function drawTilted(context, op) {
    const [a, b, c, d] = op.quad, source = op.source;
    const sw = source.naturalWidth, sh = source.naturalHeight;
    const boxW = Math.hypot(b[0] - a[0], b[1] - a[1]), boxH = Math.hypot(d[0] - a[0], d[1] - a[1]);
    const scale = Math.max(boxW / sw, boxH / sh), cw = boxW / scale, ch = boxH / scale, cx = (sw - cw) / 2, cy = (sh - ch) / 2;
    const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const strips = 24;
    for (let i = 0; i < strips; i++) {
      const u0 = i / strips, u1 = (i + 1.04) / strips;
      const top0 = lerp(a, b, u0), top1 = lerp(a, b, Math.min(u1, 1)), bottom0 = lerp(d, c, u0);
      const pw = cw * (Math.min(u1, 1) - u0);
      context.save();
      context.transform((top1[0] - top0[0]) / pw, (top1[1] - top0[1]) / pw, (bottom0[0] - top0[0]) / ch, (bottom0[1] - top0[1]) / ch, top0[0], top0[1]);
      context.drawImage(source, cx + cw * u0, cy, pw, ch, 0, 0, pw, ch);
      context.restore();
    }
  }

  function collect(doc, areas) {
    const win = doc.defaultView, ops = [], scrollY = win.scrollY;
    const range = doc.createRange();
    // The logo strip's layers keep to their side of the middle circle
    // ([data-glass-circle] inside or outside, radius --circle).
    let fixed = false, circle = null;
    const hits = r => {
      const area = fixed ? areas.fixed : areas.scroll, shift = fixed ? 0 : scrollY;
      return area && r.right > area.x && r.left < area.x + area.w && r.bottom + shift > area.y && r.top + shift < area.y + area.h;
    };

    function text(node, style, add) {
      const value = node.nodeValue;
      if (!value.trim()) return;
      range.selectNodeContents(node);
      const whole = range.getBoundingClientRect();
      if (!whole.width || !hits(whole)) return;
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const spacing = style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing);
      for (const word of value.matchAll(/\S+/g)) {
        range.setStart(node, word.index); range.setEnd(node, word.index + word[0].length);
        const r = range.getBoundingClientRect();
        if (r.width && hits(r)) add({ kind: 'text', value: word[0], x: r.left, top: r.top, width: r.width, font, spacing, color: style.color });
      }
    }

    function visit(element, opacity, z, tilt = null) {
      const wasFixed = fixed, wasCircle = circle;
      try { paintElement(element, opacity, z, tilt); } finally { fixed = wasFixed; circle = wasCircle; }
    }
    function paintElement(element, opacity, z, tilt) {
      // The glass's own canvas (and anything else marked) stays out of the copy.
      if (element.hasAttribute('data-glass-ignore')) return;
      const style = win.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      // Text kept for screen readers only (clipped away, or cut to a 1 px box) isn't on screen.
      if (style.clipPath === 'inset(50%)') return;
      if (/hidden|clip/.test(style.overflow)) {
        const box = element.getBoundingClientRect();
        if (box.width <= 1 || box.height <= 1) return;
      }
      // The header and footer glass is drawn by the shader.
      if (element.classList.contains('header-blur') || element.classList.contains('footer-blur')) return;
      opacity *= parseFloat(style.opacity);
      if (opacity < .005) return;
      fixed ||= style.position === 'fixed' || style.position === 'sticky';
      if (style.position !== 'static' && style.zIndex !== 'auto') z = parseInt(style.zIndex, 10) || 0;
      // Scrolling ops are stored in page coordinates.
      const layer = fixed ? 'fixed' : 'scroll', dy = fixed ? 0 : scrollY;
      // A 3D-turned element (vFlow's side cards): images inside are drawn into its projected corners.
      tilt = quadOf(element, style) ?? tilt;
      const side = element.dataset?.glassCircle;
      if (side) {
        const box = element.getBoundingClientRect();
        const r = parseFloat(style.getPropertyValue('--circle')) || (parseFloat(style.getPropertyValue('--select-size')) || 104) / 2;
        circle = { x: box.left + box.width / 2, y: box.top + box.height / 2 + dy, r, inside: side === 'inside' };
      }
      const add = op => {
        if (circle) op.circle = circle;
        if (op.rect) op.rect = { left: op.rect.left, top: op.rect.top + dy, width: op.rect.width, height: op.rect.height };
        if (op.quad) op.quad = op.quad.map(([x, y]) => [x, y + dy]);
        if (op.top !== undefined) op.top += dy;
        if (op.kind === 'glyph') op.y += dy;
        ops.push(Object.assign(op, { opacity, layer, z }));
      };
      const rect = element.getBoundingClientRect();
      const tag = element.tagName;
      const radius = radiusOf(style.borderTopLeftRadius, rect);
      const border = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none' ? [parseFloat(style.borderTopWidth), style.borderTopColor] : null;
      if (tag === 'IMG') {
        if (element.complete && element.naturalWidth && hits(rect)) add({ kind: 'image', source: element, rect, radius, border, fit: style.objectFit, quad: tilt });
        return;
      }
      if (tag === 'CANVAS') {
        if (rect.width && hits(rect)) add({ kind: 'image', source: element, rect, radius: 0, border: null, fit: 'fill', live: fixed });
        return;
      }
      if (tag.toLowerCase() === 'svg') {
        const image = rect.width && hits(rect) && icon(element);
        if (image) add({ kind: 'image', source: image, rect, radius: 0, border: null, fit: 'fill', tint: element.hasAttribute('data-color') ? null : style.color });
        return;
      }
      if (element !== doc.body && hits(rect) && (visibleColor(style.backgroundColor) || border)) {
        add({ kind: 'box', rect, radius, fill: visibleColor(style.backgroundColor) ? style.backgroundColor : null, border, clip: style.clipPath.startsWith('polygon(') ? style.clipPath : null });
      }
      for (const child of element.childNodes) {
        if (child.nodeType === 3) text(child, style, add);
        else if (child.nodeType === 1) {
          // A closed project only shows its title.
          if (tag === 'DETAILS' && !element.open && child.tagName !== 'SUMMARY') continue;
          visit(child, opacity, z, tilt);
        }
      }
      // The Work rows' "v" marker is a ::after on the summary, at its right end.
      if (tag === 'SUMMARY' && hits(rect)) {
        const after = win.getComputedStyle(element, '::after');
        if (after.content && after.content !== 'none' && after.content !== 'normal') {
          const width = parseFloat(after.width) || parseFloat(after.fontSize);
          add({
            kind: 'glyph', value: after.content.replace(/^["']|["']$/g, ''),
            x: rect.right - parseFloat(style.paddingRight) - (parseFloat(after.marginRight) || 0) - width / 2,
            y: rect.top + rect.height / 2, font: `${after.fontStyle} ${after.fontWeight} ${after.fontSize} ${after.fontFamily}`,
            color: after.color, matrix: after.transform
          });
        }
      }
    }
    visit(doc.body, 1, 0);
    // Later stacking layers (the rover sits above the text) paint last.
    ops.sort((a, b) => a.z - b.z);
    return ops;
  }

  // Paints ops into `canvas` for a block of device pixels starting at (x, y).
  function paint(canvas, ops, { x, y, w, h }, dpr, fill) {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, -x, -y);
    context.globalAlpha = 1;
    const area = [x / dpr, y / dpr, w / dpr, h / dpr];
    if (fill) { context.fillStyle = fill; context.fillRect(...area); } else context.clearRect(...area);
    let font = '';
    const draw = op => {
      context.globalAlpha = op.opacity;
      if (op.kind === 'text') {
        if (font !== op.font) { context.font = font = op.font; }
        if ('letterSpacing' in context) context.letterSpacing = `${op.spacing}px`;
        context.fillStyle = op.color;
        context.textAlign = 'left'; context.textBaseline = 'alphabetic';
        // Text under a CSS scale (a shrunk logo) measures smaller than its font says; draw it to match.
        const scale = op.width / (context.measureText(op.value).width || op.width);
        if (Math.abs(scale - 1) > .08) {
          context.save(); context.translate(op.x, op.top); context.scale(scale, scale);
          context.fillText(op.value, 0, ascent(context, op.font));
          context.restore();
        } else context.fillText(op.value, op.x, op.top + ascent(context, op.font));
        context.font = font;
      } else if (op.kind === 'glyph') {
        context.save();
        context.font = font = op.font;
        if ('letterSpacing' in context) context.letterSpacing = '0px';
        context.translate(op.x, op.y);
        const m = op.matrix.match(/matrix\(([^)]+)\)/);
        if (m) { const [a, b, c, d] = m[1].split(',').map(Number); context.transform(a, b, c, d, 0, 0); }
        context.fillStyle = op.color; context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(op.value, 0, 0);
        context.restore();
      } else {
        const { rect, radius } = op;
        if (op.kind === 'box' && op.fill) {
          context.beginPath();
          if (op.clip) {
            // clip-path: polygon(x% y%, ...), as placeholder logos use.
            for (const [i, point] of op.clip.slice(8, -1).split(',').entries()) {
              const [px, py] = point.trim().split(/\s+/).map(v => parseFloat(v) / 100);
              context[i ? 'lineTo' : 'moveTo'](rect.left + px * rect.width, rect.top + py * rect.height);
            }
            context.closePath();
          } else context.roundRect(rect.left, rect.top, rect.width, rect.height, radius);
          context.fillStyle = op.fill; context.fill();
        }
        if (op.kind === 'image' && op.quad) { drawTilted(context, op); return; }
        if (op.kind === 'image' && op.tint) { drawTinted(context, op); return; }
        if (op.kind === 'image') {
          context.save();
          context.beginPath(); context.roundRect(rect.left, rect.top, rect.width, rect.height, radius); context.clip();
          const source = op.source, sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
          if (op.fit === 'cover' && sw && sh) {
            const scale = Math.max(rect.width / sw, rect.height / sh), cw = rect.width / scale, ch = rect.height / scale;
            context.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, rect.left, rect.top, rect.width, rect.height);
          } else context.drawImage(source, rect.left, rect.top, rect.width, rect.height);
          context.restore();
        }
        if (op.border) {
          const [width, color] = op.border, inset = width / 2;
          context.beginPath();
          context.roundRect(rect.left + inset, rect.top + inset, rect.width - width, rect.height - width, Math.max(0, radius - inset));
          context.lineWidth = width; context.strokeStyle = color; context.stroke();
        }
      }
    };
    for (const op of ops) {
      if (!op.circle) { draw(op); continue; }
      const { x: cx, y: cy, r, inside } = op.circle;
      context.save();
      context.beginPath();
      if (!inside) context.rect(...area);
      context.arc(cx, cy, r, 0, Math.PI * 2);
      context.clip('evenodd');
      draw(op);
      context.restore();
      font = '';
    }
  }

  return {
    // Paints the page's scrolling layer for device rows y..y+h (page coordinates).
    // It's see-through: the shader lays it over the page color, with the rover
    // underneath when the page puts the rover behind the text.
    scroll(canvas, doc, block, dpr) {
      const ops = collect(doc, { scroll: { x: block.x / dpr, y: block.y / dpr, w: block.w / dpr, h: block.h / dpr }, fixed: null });
      paint(canvas, ops.filter(op => op.layer === 'scroll'), block, dpr, null);
    },
    // Paints the fixed layer (header, footer) or its live canvases for a viewport
    // block, see-through elsewhere. Returns null if nothing was drawn, otherwise
    // the highest stacking order drawn (the rover's z-index).
    fixed(canvas, doc, block, dpr, live = false) {
      const ops = collect(doc, { scroll: null, fixed: { x: block.x / dpr, y: block.y / dpr, w: block.w / dpr, h: block.h / dpr } })
        .filter(op => op.layer === 'fixed' && !op.live === !live);
      paint(canvas, ops, block, dpr, null);
      return ops.length ? Math.max(...ops.map(op => op.z)) : null;
    }
  };
}
