import { describe, expect, it } from 'vitest';
import {
  measureRowWidthsFit,
  resolveBalancedMeasuresPerRow,
  resolveBalancedMeasuresPerRowWithRowCount,
  resolveMeasuresPerRowForWidth,
  SECTION_PREVIEW_MEASURES_PER_ROW,
} from '../src/ui/song-chart-section-preview-layout';

describe('section preview row layout', () => {
  it('balances measures evenly when exceeding max per row', () => {
    expect(
      resolveBalancedMeasuresPerRow(10, SECTION_PREVIEW_MEASURES_PER_ROW),
    ).toEqual([5, 5]);
    expect(
      resolveBalancedMeasuresPerRow(9, SECTION_PREVIEW_MEASURES_PER_ROW),
    ).toEqual([5, 4]);
    expect(
      resolveBalancedMeasuresPerRow(8, SECTION_PREVIEW_MEASURES_PER_ROW),
    ).toEqual([8]);
  });

  it('splits into more rows when container width is narrow', () => {
    const widths = [40, 40, 40, 40, 40, 40];
    expect(
      resolveMeasuresPerRowForWidth(
        widths,
        130,
        SECTION_PREVIEW_MEASURES_PER_ROW,
        4,
      ),
    ).toEqual([3, 3]);
  });

  it('keeps marker-bound measure groups intact via row packing units', () => {
    const widths = [80, 80, 80, 80, 80, 80, 80, 80, 80, 80];
    expect(
      resolveMeasuresPerRowForWidth(
        widths,
        420,
        SECTION_PREVIEW_MEASURES_PER_ROW,
        4,
      ),
    ).toEqual([5, 5]);
  });

  it('detects overflowing row widths', () => {
    expect(measureRowWidthsFit([100, 100], [2], 180, 4)).toBe(false);
    expect(measureRowWidthsFit([100, 100], [1, 1], 180, 4)).toBe(true);
  });

  it('distributes remainder to earlier rows', () => {
    expect(resolveBalancedMeasuresPerRowWithRowCount(10, 3)).toEqual([4, 3, 3]);
  });
});
