// The glass's fragment shader: one glass shape per draw (a superellipse-cornered
// rectangle, or a circle) bending a copy of the page (page-snapshot.js).
// It covers everything the site's looks use; a tuning tool can plug more in
// through `extra` (GLSL pieces dropped in at fixed spots):
//   functions  more uniforms and helpers, after page()
//   sheen      a replacement sheenHue(float) for the rim's hue
//   dispersed  first lines of dispersed(pos, spread) (e.g. another palette)
//   rainbow    first lines of rainbow(pos, spread) (other split styles)
//   outside    more see-through tints outside the glass (e.g. echoes)
//   modes      other edge-color modes, as "if (...) { ... } else"
// Shader lengths are device px.
export function glassShader(extra = {}) {
  return `
uniform float uVivid;
uniform sampler2D uScrollTex, uFixedTex, uLiveTex;
// Live canvas (the rover): 0 none, 1 behind the page's text, 2 in front of everything.
uniform float uLiveOn;
uniform vec2 uRes, uC, uHalf;
// Ring (texture width, rows, page scroll), the fixed layer's block (x, y from
// the top, width, height), the site's header bar (top, height, blur reach) and
// footer bar (top, bottom, reach, opacity).
uniform vec4 uRing, uFixed, uHeader, uFooter;
uniform vec3 uBg;
uniform float uDpr, uTime, uDark, uAppear;
uniform float uRadius, uSmooth, uBezel, uRefr, uZoom, uWarp, uChroma, uFold, uProfile, uRimGlow;
uniform float uReach, uSharp, uStreak, uStreakThin;
uniform float uRimLight, uRimWidth, uBevelShade, uShine, uInner, uInnerW, uShadow;
uniform float uBulge, uBulgeR, uBulgeSoft, uWall, uWallLight, uDeep;
uniform float uEdgePow, uRimBand, uBulgeRing;
// How big this glass is next to the one its settings were tuned on (see REF_SHORT).
uniform float uScale;
uniform float uCorners, uFocus, uQuiet, uSway, uAngle;

vec4 liveAt(vec2 px) {
  vec2 uv = (vec2(px.x, uRes.y - px.y) - uFixed.xy) / uFixed.zw;
  return uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ? vec4(0.0) : texture2D(uLiveTex, uv);
}
// The page under the header and footer glass: its color, the rover when it sits
// behind the text, then the see-through scrolling layer.
vec3 base(vec2 px) {
  vec3 c = uBg;
  if (uLiveOn > 0.5 && uLiveOn < 1.5) { vec4 live = liveAt(px); c = mix(c, live.rgb, live.a); }
  float row = mod(uRes.y - px.y + uRing.z, uRing.y);
  vec4 page = texture2D(uScrollTex, vec2(px.x / uRing.x, row / uRing.y));
  return mix(c, page.rgb, page.a);
}
float grain() { return 6.2831 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); }
vec3 blurred(vec2 px, float r) {
  vec3 acc = vec3(0.0); float wsum = 0.0, spin = grain();
  for (int i = 0; i < 16; i++) {
    float f = (float(i) + 0.5) / 16.0, a = spin + float(i) * 2.39996, w = exp(-2.0 * f);
    acc += base(px + vec2(cos(a), sin(a)) * r * 2.0 * sqrt(f)) * w; wsum += w;
  }
  return acc / wsum;
}
// The site's bar glass (site.css): a 2px blur with a paper tint that fades out
// over the blur reach, under 5px and 9px blurs on shorter fades. t runs from the
// bar's outer edge inward; returns the blur radius and the tint.
vec2 siteBlur(float t, float body, float reach) {
  float f = t / (body + reach), u = clamp((t - body) / reach, 0.0, 1.0) * 4.0;
  float edge = u < 1.0 ? mix(1.0, 0.85, u) : u < 2.0 ? mix(0.85, 0.5, u - 1.0) : u < 3.0 ? mix(0.5, 0.15, u - 2.0) : mix(0.15, 0.0, u - 3.0);
  float m2 = 1.0 - clamp((f - 0.55) / 0.4, 0.0, 1.0), m3 = 1.0 - clamp((f - 0.4) / 0.4, 0.0, 1.0);
  return vec2(sqrt(4.0 * edge + 25.0 * m2 + 81.0 * m3) * uDpr, mix(0.55, 0.3, clamp((f - 0.55) / 0.45, 0.0, 1.0)) * edge);
}
vec3 page(vec2 px) {
  float y = uRes.y - px.y;
  vec2 b = vec2(0.0);
  float th = y - uHeader.x;
  if (uHeader.y > 0.0 && th >= 0.0 && th < uHeader.y + uHeader.z) b = siteBlur(th, uHeader.y, uHeader.z);
  float tf = uFooter.y - y;
  if (uFooter.w > 0.0 && tf >= 0.0 && tf < uFooter.y - uFooter.x + uFooter.z) b = max(b, siteBlur(tf, uFooter.y - uFooter.x, uFooter.z) * uFooter.w);
  vec3 c = b.x > 0.5 ? blurred(px, b.x) : base(px);
  c = mix(c, uBg, b.y);
  vec2 uv = (vec2(px.x, uRes.y - px.y) - uFixed.xy) / uFixed.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return c;
  vec4 top = texture2D(uFixedTex, uv);
  c = mix(c, top.rgb, top.a);
  if (uLiveOn > 1.5) { vec4 live = texture2D(uLiveTex, uv); c = mix(c, live.rgb, live.a); }
  return c;
}
${extra.functions ?? ''}
// The rim's rainbow hue around the glass.
${extra.sheen ?? `vec3 sheenHue(float x) { return 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + x)); }`}
// Dispersion: each wavelength bends a little more than the last, so colors fan
// out where the glass stretches the page. Taps sit under a px apart, and the
// whole comb shifts by a different fraction of a tap on every pixel, so the
// copies melt into one smooth band (no stripes, no wavy copy edges). Each tap
// also steps a little sideways, plus a soft blur that grows toward the rim
// (rimSoft), so what the rim bends comes out rounded instead of pointy.
// The palette edge colors keep the shared smear.
float rimSoft = 0.0;
vec3 dispersed(vec2 pos, vec2 spread) {
  ${extra.dispersed ?? ''}
  vec3 c = page(pos);
  // Much longer and the taps would sit too far apart; cap it.
  spread *= min(1.0, 18.0 * uScale * uDpr / max(length(spread), 1e-3));
  float len = length(spread) * 2.0;
  if (len < 0.75 && rimSoft < 0.5) return c;
  float taps = clamp(ceil(max(len, rimSoft * 2.0) / (0.75 * uDpr)), 3.0, 48.0);
  float jitter = grain() / 6.2831;
  vec3 acc = vec3(0.0), wsum = vec3(0.0);
  vec2 across = length(spread) > 1e-3 ? normalize(vec2(-spread.y, spread.x)) : vec2(0.0, 1.0);
  vec2 side = vec2(-spread.y, spread.x) * 0.35 + across * rimSoft;
  for (int i = 0; i < 48; i++) {
    if (float(i) >= taps) break;
    float t = (float(i) + jitter) / taps;
    vec3 w = vec3(1.0 - t, 1.0 - abs(2.0 * t - 1.0), t);
    w *= w;
    acc += w * page(pos + spread * (t * 2.0 - 1.0) + side * (fract(float(i) * 0.618034 + jitter) * 2.0 - 1.0)); wsum += w;
  }
  return c + (acc / wsum - c) * uVivid;
}
// On a light page the glyph is dark on white, so a color channel that lands on
// the glyph goes missing and the fringe shows its opposite (no blue reads as
// yellow, no red as cyan), in reverse order. Splitting the other way round on
// light pages gives the dark page's order there too: cool inside, warm at the rim.
vec3 rainbow(vec2 pos, vec2 spread) {
  spread *= uDark > 0.5 ? 1.0 : -1.0;
  ${extra.rainbow ?? ''}
  return dispersed(pos, spread);
}

// Smooth corners: the corner arc is a superellipse with exponent uSmooth
// (2 = plain circle, about 5 = Apple's continuous corner).
float sdGlass(vec2 p) {
  vec2 q = abs(p) - uHalf + uRadius;
  vec2 m = max(q, 0.0) / uRadius;
  return uRadius * pow(pow(m.x, uSmooth) + pow(m.y, uSmooth), 1.0 / uSmooth) + min(max(q.x, q.y), 0.0) - uRadius;
}
vec2 glassNormal(vec2 p) {
  vec2 e = vec2(1.0, 0.0);
  vec2 g = vec2(sdGlass(p + e.xy) - sdGlass(p - e.xy), sdGlass(p + e.yx) - sdGlass(p - e.yx));
  return g / max(length(g), 1e-4);
}
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 p = px - uC;
  float d = uAppear > 0.0 ? sdGlass(p) : 1e4;
  // Outside: only see-through tints over the live page (premultiplied).
  vec4 outside = vec4(0.0);
  if (d > 0.0) {
    if (uShadow > 0.0) outside.a = uShadow * 0.35 * uAppear * exp(-max(sdGlass(p + vec2(0.0, 14.0 * uDpr)), 0.0) / (24.0 * uDpr));
    ${extra.outside ?? ''}
    if (d >= 1.0) { gl_FragColor = outside; return; }
  }
  float dist = max(-d, 0.0);
  float bez = max(uBezel, 1.0);
  // The bend starts where the side wall meets the top.
  float s = 1.0 - clamp(max(dist - uWall, 0.0) / bez, 0.0, 1.0);
  vec2 n = glassNormal(p);

  // Two-corner mode: the bend and the color gather on one diagonal pair of
  // corners (top right and bottom left, like the film); the other sides stay quiet.
  float lobe = 1.0;
  if (uCorners > 2.5) {
    // The tight diagonal: |cos(θ − 45°)|^focus.
    vec2 q = p / uHalf;
    float ang = atan(q.y, q.x) - uAngle - uSway * 0.785 * sin(uTime * 1.3);
    lobe = pow(abs(cos(ang - 0.7854)), uFocus);
  } else if (uCorners > 1.5) {
    // Opus's diagonal: full on the top-right / bottom-left line, zero on the
    // other two corners, fading smoothly between.
    vec2 q = p / uHalf;
    float ang = atan(q.y, q.x) - uAngle - uSway * 0.785 * sin(uTime * 1.3);
    lobe = pow(smoothstep(0.0, 1.0, abs(cos(ang - 0.7854))), uFocus);
  } else if (uCorners != 0.0) {
    vec2 q = p / uHalf;
    float ang = atan(q.y, q.x) - uAngle - uSway * 0.785 * sin(uTime * 1.3);
    lobe = pow(0.5 + 0.5 * uCorners * sin(2.0 * ang), uFocus);
  }

  // The body is a lens: zoom magnifies it, warp magnifies more toward the rim.
  // The two corners steer the warp too: on a short glass the letters never reach
  // the corner rims, so the warp is what drags them toward the corners.
  float rn = min(pow(pow(min(abs(p.x) / uHalf.x, 1.0), 4.0) + pow(min(abs(p.y) / uHalf.y, 1.0), 4.0), 0.25), 1.0);
  vec2 body = p * (1.0 - uWarp * mix(uQuiet, 1.0, lobe) * rn * rn) / uZoom;
  // The bevel shows content from further in. Sampled depth t + a(1 - t)^k only
  // ever grows, scaled to the body's own squeeze, so the rim never folds into a mirror.
  float squeeze = (1.0 - 3.0 * uWarp) / uZoom;
  // A low power (at most 2.2) rolls the bend in gently from well inside the edge,
  // so letters curve instead of shearing into a thin strip at the rim.
  float a = min(uRefr / bez, 0.85 * squeeze);
  float k = clamp(0.95 * squeeze / max(a, 1e-3), 1.05, 2.2);
  // Edge curve "sharp knee" (Original research): the bevel's height follows a
  // squircle, (1 - (1 - t)^4)^(1/4), so its slope stays near zero, then shoots
  // up right at the rim. Straight lines run straight, then bend hard along the
  // edge, and the outermost sliver folds like real glass.
  float knee = s * s * s * pow(max(1.0 - s * s * s * s, 1e-3), -0.75);
  // Edge curve "flat, then smooth": nothing until the bevel, then smoothstep^power.
  float shape = uProfile > 1.5 ? pow(smoothstep(0.0, 1.0, s), uEdgePow) : uProfile > 0.5 ? knee / (1.0 + knee) : pow(s, k);
  float depth = uProfile > 0.5 ? uRefr / bez : a;
  // Rim fold: real thick glass shows the rim content from deep inside, squeezed
  // and folded over (the film's beam becomes a white band hugging the edge).
  // It blends to a plain s^2 pull that may fold; the rim bend sets how deep.
  float pull = mix(depth * shape, min(uRefr / bez, 2.5) * s * s, uFold);
  vec2 off = -n * bez * pull * mix(uQuiet, 1.0, lobe);
  // Corner streak: in a narrow wedge on the top-right / bottom-left diagonal the
  // glass also stretches what sits where the bend starts out to the rim, so even a
  // round logo (which a bend only pushes outward) trails a thin stroke into the corner.
  if (uStreak > 0.0) {
    vec2 qs = p / uHalf;
    float angS = atan(qs.y, qs.x) - uAngle - uSway * 0.785 * sin(uTime * 1.3);
    // Thinness narrows the wedge: 0 a wide neck, 1 a thin, pointy line.
    off -= n * bez * s * uStreak * pow(abs(cos(angS - 0.7854)), 60.0 * pow(15.0, uStreakThin));
  }
  // Color splits only toward the rim (s squared), so the body bends clean like
  // the film; the sharp knee already keeps it at the rim, as Original research did.
  vec3 g;
  ${extra.modes ?? ''} {
    // Rainbow reach: the colors also split further in than the glass bends (up to
    // three bevels in), so they hug the glyph's edges while its shape stays put.
    float sr = 1.0 - clamp(max(dist - uWall, 0.0) / (bez * (1.0 + 2.0 * uReach)), 0.0, 1.0);
    vec2 reach = -n * uReach * smoothstep(0.0, 1.0, sr) * 14.0 * uScale * uDpr;
    // Toward the rim the glass softens what it bends (about 6 px at the border).
    rimSoft = s * s * s * 6.0 * uScale * uDpr;
    g = rainbow(uC + body + off, (off * (uProfile > 0.5 ? 1.0 : s * s) + reach) * uChroma * lobe);
    // Sharp logo: the colors are light in the glass, not the logo. Wherever the
    // page shows the logo (anything far from the page color) its own pixels win,
    // so it stays crisp and its color never changes; the rainbow only shows
    // around it. In the outer part of the bevel it lets go, so what the rim
    // bends is soft and rounded like the rest of the glass there.
    if (uSharp > 0.5) {
      vec2 q = uC + body + off;
      vec3 sharp = page(q);
      // How much of this pixel is logo: its ink against the strongest ink just
      // around it, so the logo's half-covered edge pixels go to the rainbow
      // instead of leaving a grey outline, whatever color the logo is.
      float ink = length(sharp - uBg), e = 1.5 * uDpr;
      float most = max(ink, max(max(length(page(q + vec2(e, 0.0)) - uBg), length(page(q - vec2(e, 0.0)) - uBg)),
                                max(length(page(q + vec2(0.0, e)) - uBg), length(page(q - vec2(0.0, e)) - uBg))));
      float cover = smoothstep(0.65, 0.98, ink / max(most, 1e-3)) * smoothstep(0.05, 0.2, most);
      g = mix(g, sharp, cover * (1.0 - smoothstep(0.55, 0.95, s)));
    }
  }
  // Border rainbow: a thin spectral band hugging the edge, strongest on the diagonal.
  if (uRimBand > 0.0) {
    float R = max(min(uHalf.x, uHalf.y), 1.0), tr = dist / R;
    float band = exp(-pow((tr - 0.025) / 0.02, 2.0));
    vec3 iri = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + atan(p.y, p.x) * 0.5 + (1.0 - tr) * 2.0));
    g = mix(g, iri, uRimBand * band * mix(lobe, 1.0, 0.35) * 0.8);
  }
  float lit = dot(n, normalize(vec2(-0.55, 0.83)));

  // Side wall: the slab's edge seen at an angle. It looks out at the page just
  // beside the glass, squeezed and dimmed, with a cool reflection on it and a
  // fine seam where it meets the top. On light pages it reads as a soft grey rim.
  // Mostly dark, like the film: light only streaks along it on the sides facing
  // the light.
  if (uWall > 0.5) {
    float wt = clamp(dist / uWall, 0.0, 1.0);
    vec3 w = mix(page(px + n * ((uWall - dist) * 2.0 + 2.0 * uDpr)), uBg, 0.6);
    float facing = max(lit, 0.0);
    w *= 1.0 - 0.1 * (1.0 - uDark);
    float streak = exp(-pow((wt - 0.35) / 0.18, 2.0));
    w += vec3(0.72, 0.82, 1.0) * uWallLight * (0.02 + 0.4 * facing * facing * streak) * mix(0.3, 1.0, uDark);
    g = mix(w, g, smoothstep(0.75, 1.0, wt));
    float seam = exp(-pow((dist - uWall) / (1.1 * uDpr), 2.0));
    g = mix(g, vec3(1.0), seam * uWallLight * (0.04 + 0.4 * facing * facing) * mix(0.4, 1.0, uDark));
  }

  // Rainbow light in a band along the rim.
  vec3 hue = sheenHue(atan(p.y, p.x) / 6.2831);
  float band = pow(1.0 - clamp(dist / max(uRimWidth, 1.0), 0.0, 1.0), 1.5) * uRimLight * lobe;
  g = mix(g, g * (0.35 + hue), band) + hue * band * uDark * 0.6;
  // Bevel: on light paper it darkens a little and only a thin line catches the light.
  g *= 1.0 - s * s * uBevelShade * (0.7 - 0.3 * lit);
  // Rim glow (Original research's rim light): broad across the bevel, mostly from the top left.
  float rimS = s * s * s;
  g += rimS * (0.12 + 0.88 * max(lit, 0.0) + 0.35 * max(-lit, 0.0)) * 0.7 * uRimGlow;
  float shine = pow(max(1.0 - dist / (max(5.0 * uScale, 2.0) * uDpr), 0.0), 2.0);
  g += shine * uShine * (0.1 + 0.9 * max(lit, 0.0) + 0.3 * max(-lit, 0.0));

  // Bulge: the edge is a rounded 3D lip (a quarter circle of radius uBulgeR) that
  // meets the flat top. A broad soft light reflects in it where the lip tilts
  // about 29 degrees, so one thin line runs parallel to the rim, partway in, like
  // the film's icon: full along the sides facing the top left, a shorter arc
  // facing the bottom right. It lives in the quiet corners and fades out where
  // the rainbow corners take over, faint and thin like the film's.
  if (uBulge > 0.0 && uBulgeRing > 0.5) {
    // Ring bulge: a soft light ring just inside the rim, bright toward the
    // top left, a touch darker toward the bottom right.
    float g2 = exp(-0.5 * pow((dist - uBulgeR * 0.9) / max(uBulgeR * (0.25 + 1.1 * uBulgeSoft), 1e-3), 2.0));
    float litR = dot(n, normalize(vec2(-0.55, 0.84)));
    g += vec3(uBulge * g2 * (0.22 + 0.78 * max(litR, 0.0))) * 0.9;
    g -= vec3(uBulge * g2 * 0.10 * max(-litR, 0.0));
  } else if (uBulge > 0.0) {
    float c = clamp(1.0 - max(dist - uWall, 0.0) / max(uBulgeR, 1.0), 0.0, 0.995);
    float lineWidth = 0.06 * uBulgeSoft;
    vec3 n3 = normalize(vec3(n * c / sqrt(1.0 - c * c), 1.0));
    vec3 key = normalize(vec3(-0.6, 0.6, 0.55));
    float facing = pow(max(dot(n, normalize(vec2(-1.0, 1.0))), 0.0), 2.0)
                 + 0.6 * pow(max(dot(n, normalize(vec2(1.0, -1.0))), 0.0), 3.0);
    float quietSide = uCorners != 0.0 ? 1.0 - lobe : 1.0;
    float spec = exp(-pow((asin(c) - 0.5) / lineWidth, 2.0)) * facing * quietSide;
    // Slopes facing the key light brighten, the ones facing away dim: the lip reads as thick.
    g *= 1.0 + (dot(n3, key) - key.z) * 0.12 * uBulge * quietSide;
    vec3 tone = mix(vec3(1.0), 0.3 + hue, lobe * min(uChroma, 1.0));
    g = mix(g, tone, clamp(spec * uBulge * mix(0.5, 0.9, uDark), 0.0, 1.0));
  }

  // Glass tint: a deep navy on dark pages like the film; barely cooler on light
  // ones, where the film's white glass stays neutral.
  g = mix(g, g * vec3(0.9, 0.95, 1.04) + vec3(0.006, 0.01, 0.026) * uDark, uDeep * mix(0.15, 1.0, uDark));

  // Inner rims: white along the top and bottom edges, like Safari's toolbar.
  float rim = 1.0 - smoothstep(0.0, max(uInnerW, 1.0), dist);
  // Dark mode: the light comes from below, so the bottom rim is the brighter one.
  float side = mix(1.0, n.y < 0.0 ? 1.3 : 0.55, uDark);
  g = mix(g, vec3(1.0), clamp(rim * uInner * mix(0.35, 1.0, abs(n.y)) * side, 0.0, 1.0));

  float cover = clamp(0.5 - d, 0.0, 1.0) * uAppear;
  gl_FragColor = vec4(g * cover, cover) + outside * (1.0 - cover);
}`;
}
