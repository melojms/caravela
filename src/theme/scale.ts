/**
 * Designs are drawn on a 1920x1080 canvas. RN 0.83 on Vega lays out in
 * density-independent pixels (dp) on a 960x540 dp reference canvas, so a
 * 1080p design value maps to dp by dividing by the baseline scale factor (2).
 * Vega then scales dp to physical pixels for the active display, so the UI
 * keeps its proportions at 720p, 1080p and 4K. Don't multiply by
 * PixelRatio: Vega already does that.
 */
export const BASELINE_SCALE = 2;

/** Converts a value measured on the 1080p design into dp. */
export const px = (designPx: number): number => designPx / BASELINE_SCALE;
