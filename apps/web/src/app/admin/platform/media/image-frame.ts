/**
 * Where a picture sits in a white square: its zoom against the fitted size
 * (1 = the longer edge spans the square), and its centre's offset from the
 * square's, measured in square sides.
 */
export interface Frame {
  zoom: number;
  x: number;
  y: number;
}

export const FITTED: Frame = { zoom: 1, x: 0, y: 0 };
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 4;

/** Centred with the shorter edge spanning the square, cropping the longer. */
export function filled(width: number, height: number): Frame {
  return clampFrame({
    zoom: Math.max(width, height) / Math.min(width, height),
    x: 0,
    y: 0,
  });
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Keeps the zoom in range and the picture's centre inside the square, so it
 * can never be dragged out of reach. */
export function clampFrame(frame: Frame): Frame {
  return {
    zoom: clamp(frame.zoom, ZOOM_MIN, ZOOM_MAX),
    x: clamp(frame.x, -0.5, 0.5),
    y: clamp(frame.y, -0.5, 0.5),
  };
}

/** The picture's box in square sides, centred on its frame offset. */
export function placement(
  width: number,
  height: number,
  frame: Frame,
): { left: number; top: number; width: number; height: number } {
  const long = Math.max(width, height);
  const w = (width / long) * frame.zoom;
  const h = (height / long) * frame.zoom;
  return {
    left: 0.5 + frame.x - w / 2,
    top: 0.5 + frame.y - h / 2,
    width: w,
    height: h,
  };
}

/**
 * The exported square's side in pixels: as many as the picture has across the
 * square, so nothing is scaled up, within the given bounds.
 */
export function outputSide(
  width: number,
  height: number,
  zoom: number,
  min: number,
  max: number,
): number {
  return Math.round(clamp(Math.max(width, height) / zoom, min, max));
}
