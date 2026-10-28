import { GridWidths } from './grid-widths';

/**
 * Moves one boundary between neighbouring columns (FR-ADM-05): width passes
 * from one to the other, so the table always fills its container, and both
 * keep their minimum.
 */
export function resizeBoundary(
  widths: GridWidths,
  keys: readonly string[],
  index: number,
  deltaPx: number,
  tableWidth: number,
  minPx: readonly number[],
): GridWidths {
  const left = keys[index];
  const right = keys[index + 1];
  if (!left || !right || tableWidth <= 0) return widths;

  const leftPx = widths[left] * tableWidth;
  const rightPx = widths[right] * tableWidth;
  const clamped = Math.max(
    minPx[index] - leftPx,
    Math.min(rightPx - minPx[index + 1], deltaPx),
  );
  if (!Number.isFinite(clamped) || clamped === 0) return widths;

  return {
    ...widths,
    [left]: (leftPx + clamped) / tableWidth,
    [right]: (rightPx - clamped) / tableWidth,
  };
}

/** The browser's laid-out widths, as fractions. */
export function measuredWidths(
  keys: readonly string[],
  pixels: readonly number[],
): GridWidths | null {
  const total = pixels.reduce((sum, px) => sum + px, 0);
  if (keys.length !== pixels.length || total <= 0) return null;
  return Object.fromEntries(keys.map((key, i) => [key, pixels[i] / total]));
}

/**
 * The measured widths fitted to the room there is. A surplus comes from the
 * columns with slack above their minimum, in proportion: scaling all together
 * squeezed columns already at their minimum. Where even the minimums do not
 * fit they are kept, and the table scrolls.
 */
export function fitWidths(
  keys: readonly string[],
  measuredPx: readonly number[],
  minPx: readonly number[],
  availablePx: number,
): GridWidths | null {
  if (keys.length !== measuredPx.length || keys.length !== minPx.length) {
    return null;
  }
  const wanted = measuredPx.map((px, i) => Math.max(px, minPx[i]));
  const total = wanted.reduce((sum, px) => sum + px, 0);
  const surplus = total - availablePx;
  const slack = wanted.map((px, i) => px - minPx[i]);
  const slackTotal = slack.reduce((sum, px) => sum + px, 0);

  const fitted =
    surplus > 0 && slackTotal > 0
      ? wanted.map(
          (px, i) =>
            px - (slack[i] / slackTotal) * Math.min(surplus, slackTotal),
        )
      : wanted;

  return measuredWidths(keys, fitted);
}
