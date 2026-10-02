import {
  clampFrame,
  filled,
  FITTED,
  outputSide,
  placement,
  ZOOM_MAX,
  ZOOM_MIN,
} from './image-frame';

describe('image frame', () => {
  it('fits a landscape picture across the square, centred', () => {
    expect(placement(400, 200, FITTED)).toEqual({
      left: 0,
      top: 0.25,
      width: 1,
      height: 0.5,
    });
  });

  it('fits a portrait picture down the square', () => {
    expect(placement(200, 400, FITTED)).toEqual({
      left: 0.25,
      top: 0,
      width: 0.5,
      height: 1,
    });
  });

  it('zooms out around the offset centre, leaving a white border', () => {
    const box = placement(100, 100, { zoom: 0.5, x: 0.1, y: -0.1 });
    expect(box.left).toBeCloseTo(0.35);
    expect(box.top).toBeCloseTo(0.15);
    expect(box.width).toBe(0.5);
  });

  it('fills the square with the shorter edge, centred', () => {
    expect(filled(400, 200)).toEqual({ zoom: 2, x: 0, y: 0 });
    expect(placement(400, 200, filled(400, 200))).toEqual({
      left: -0.5,
      top: 0,
      width: 2,
      height: 1,
    });
  });

  it('keeps the zoom in range and the centre inside the square', () => {
    expect(clampFrame({ zoom: 10, x: 2, y: -2 })).toEqual({
      zoom: ZOOM_MAX,
      x: 0.5,
      y: -0.5,
    });
    expect(clampFrame({ zoom: 0, x: 0, y: 0 }).zoom).toBe(ZOOM_MIN);
  });

  it('exports as many pixels as the picture has across the square', () => {
    expect(outputSide(800, 600, 1, 300, 1000)).toBe(800);
    // Zoomed in on half of it: the square spans 400 of its pixels.
    expect(outputSide(800, 600, 2, 300, 1000)).toBe(400);
  });

  it('caps the export within its bounds', () => {
    expect(outputSide(4000, 3000, 1, 300, 1000)).toBe(1000);
    expect(outputSide(200, 200, 4, 300, 1000)).toBe(300);
  });
});
