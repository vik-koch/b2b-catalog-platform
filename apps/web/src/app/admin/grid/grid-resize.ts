import { GridWidths } from './grid-widths';

/**
 * Moving one boundary between two neighbouring columns, which is the whole of
 * the resize gesture (FR-ADM-05).
 *
 * The table always fills its container: a drag takes width from one column and
 * gives it to the one beside it, so nothing else on the row moves and no grid
 * ever grows a horizontal scrollbar the admin has to reach into to see the last
 * column. The alternative — a column that grows and pushes the table wider — is
 * how a spreadsheet behaves, but a spreadsheet is the document and this is a
 * panel inside a page.
 *
 * Both sides keep their minimum, so a boundary dragged to the far edge stops
 * where the narrower of the two would disappear.
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

/** Content-derived widths, as fractions: what the browser laid the table out
 * to before it was frozen. */
export function measuredWidths(
  keys: readonly string[],
  pixels: readonly number[],
): GridWidths | null {
  const total = pixels.reduce((sum, px) => sum + px, 0);
  if (keys.length !== pixels.length || total <= 0) return null;
  return Object.fromEntries(keys.map((key, i) => [key, pixels[i] / total]));
}

/**
 * The measured widths, fitted to the room there actually is.
 *
 * A percentage column in a fixed-layout table is a share of the *table*, so
 * once the shares add up to more than the table can give, every column is
 * scaled down together — including the ones already at their minimum, which is
 * how a column headed by a filter ended up too narrow to read the filter. The
 * surplus has to come from somewhere specific instead: from the columns with
 * slack above their minimum, in proportion to how much slack each has.
 *
 * Where even the minimums do not fit, they are kept anyway and the table is
 * left wider than its container — the grid scrolls, which is honest, rather
 * than showing seven columns of nothing.
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
