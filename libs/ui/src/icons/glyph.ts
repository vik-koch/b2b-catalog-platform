/**
 * A glyph as data: the SVG's children on a 24×24 viewBox, drawn by Icon with
 * a round stroke in `currentColor`. Owned Lucide SVGs (ISC): each lives in
 * `glyphs/<lucide-name>.ts`, copied from the Lucide source with its elements
 * in the same order.
 *
 * Import a glyph from its own module, never through a barrel: chunks are cut
 * by module, so one module re-exporting them all would carry every glyph any
 * page names into the first load.
 */
export type GlyphNode =
  | { readonly tag: 'path'; readonly d: string }
  | {
      readonly tag: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly fill?: 'currentColor';
    }
  | {
      readonly tag: 'rect';
      readonly width: number;
      readonly height: number;
      readonly x: number;
      readonly y: number;
      readonly rx?: number;
      readonly ry?: number;
    }
  | {
      readonly tag: 'line';
      readonly x1: number;
      readonly x2: number;
      readonly y1: number;
      readonly y2: number;
    }
  | { readonly tag: 'polygon'; readonly points: string }
  | { readonly tag: 'polyline'; readonly points: string };

export type Glyph = readonly GlyphNode[];
