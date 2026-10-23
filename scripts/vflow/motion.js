import { ease } from "./settings.js";

// Pure geometry shared by painting and precomputed animation keyframes.
export function createMotion(count, settings) {
  const loopEnabled = settings.loop;
  const handoffAt = settings.handoff;
  const phi = (1 + Math.sqrt(5)) / 2;
  const state = { direction: 0, journey: null, cardWidth: 0, centerFraction: .88 };
  const wrap = value => loopEnabled
    ? ((value % count) + count) % count
    : Math.max(0, Math.min(count - 1, value));
  function cardOffset(i, at) {
    if (!loopEnabled) return i - at;
    let offset = wrap(i - at);
    if (offset > count / 2) offset -= count;
    return offset;
  }
  function pose(i, at) {
    const offset = cardOffset(i, at);
    const distance = Math.abs(offset);
    const side = Math.sign(offset);
    // Only the departing/arriving page unfolds; passing pages stay folded.
    let fold = Math.min(1, distance);
    if (distance < 1 && state.direction) {
      fold = offset * state.direction < 0
        ? ease(Math.min(1, distance / settings.retreatFraction))
        : 1 - ease(1 - distance);
    }
    // Passing pages stay folded. Only the departure and destination open.
    const passing = state.journey && Math.abs(state.journey.to - state.journey.from) > settings.longJumpThreshold
      && i !== wrap(Math.round(state.journey.from)) && i !== wrap(state.journey.to);
    if (passing) fold = 1;
    const outer = Math.min(1, Math.max(0, distance - 1));
    const nearAngle = 90 / phi;
    const angle = (nearAngle + (90 - nearAngle) / (phi * phi) * outer) * fold;
    const nearScale = 1 - 1 / phi ** 4;
    const scale = 1 - ((1 - nearScale) * (1 + outer / phi)) * fold;
    // Near cards use 61.8% of the available side margin; far cards use all of it.
    // Account for perspective so their outer edges remain inside the gallery.
    const margin = (1 - state.centerFraction) / 2;
    const edge = state.centerFraction / 2 + margin * (1 / phi + outer / (phi * phi));
    const radians = angle * Math.PI / 180;
    const perspective = Math.max(settings.perspective, state.cardWidth * settings.perspectiveRatio);
    const projectedHalf = scale * Math.cos(radians) / 2
      / (1 - state.cardWidth * scale * Math.sin(radians) / (perspective * 2));
    const shift = (edge / state.centerFraction - projectedHalf) * fold * 100;
    // Passing pages travel across the center, turning edge-on there.
    // The two faces meet at 90 degrees rather than opening toward the viewer.
    if (passing && distance < 1) {
      const passAngle = 90 - (90 - nearAngle) * distance;
      return {
        transform: `translate(-50%, -50%) translateX(${offset * shift}%) perspective(${perspective}px) rotateY(${-side * passAngle}deg) scale(${scale})`,
        opacity: distance < 1e-7 ? 0 : 1,
        dot: Math.max(0, 1 - distance),
        main: 0,
        near: 1
      };
    }
    const recycling = loopEnabled && count > 2 && distance > count / 2 - .12;
    return {
      transform: `translate(-50%, -50%) translateX(${side * shift}%) perspective(${perspective}px) rotateY(${-side * angle}deg) scale(${scale})`,
      opacity: recycling ? 0 : 1,
      dot: Math.max(0, 1 - distance),
      main: 1 - fold,
      near: distance <= 1 ? 1 : 0
    };
  }
  function stackRank(i, at) {
    // Let the outgoing page fold before bringing the next page forward.
    const front = state.direction > 0 ? Math.floor(at + 1 - handoffAt)
      : state.direction < 0 ? Math.ceil(at - 1 + handoffAt) : Math.round(at);
    return count - Math.abs(cardOffset(i, front));
  }

  return { state, wrap, cardOffset, pose, stackRank };
}
