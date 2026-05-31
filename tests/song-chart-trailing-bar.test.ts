import { describe, expect, it } from 'vitest';
import { buildPartEndSourceIndices } from '../src/domain/song/flatten-song-parts';
import type { ExpandedMeasure } from '../src/domain/song/song-types';
import { resolveTrailingPartBar } from '../src/ui/song-chart-view';

function measure(
  sourceMeasureIndex: number,
  playbackIndex: number,
): ExpandedMeasure {
  return {
    sourceMeasureIndex,
    playbackIndex,
    cycleIndex: 0,
    events: [],
    timeSignature: '4/4',
    effectiveKeyId: 'C',
    effectiveStrumPatternId: 'builtin-strum-syncopation',
    measureQuarterBeats: 4,
  };
}

describe('buildPartEndSourceIndices', () => {
  it('marks each part last flat measure index', () => {
    const indices = buildPartEndSourceIndices(
      {
        parts: [
          {
            type: 'block',
            blockId: 'a',
          },
          {
            type: 'inline',
            measures: [{ events: [] }, { events: [] }],
          },
        ],
      },
      [
        {
          id: 'a',
          label: 'A',
          measures: [{ events: [] }, { events: [] }, { events: [] }],
        },
      ],
    );

    expect([...indices]).toEqual([2, 4]);
  });
});

describe('resolveTrailingPartBar', () => {
  it('uses | between parts and || at chart end', () => {
    const measures = [measure(0, 0), measure(1, 1), measure(2, 2), measure(3, 3)];
    const partEnds = new Set([1, 3]);

    expect(
      resolveTrailingPartBar(measures, 1, { partEndSourceIndices: partEnds }),
    ).toBe('|');
    expect(
      resolveTrailingPartBar(measures, 3, { partEndSourceIndices: partEnds }),
    ).toBe('||');
  });

  it('uses preview rules for single-part slices', () => {
    const measures = [measure(0, 0), measure(1, 1)];

    expect(
      resolveTrailingPartBar(measures, 1, {
        singlePartPreview: true,
        isLastPartInSong: false,
      }),
    ).toBe('|');
    expect(
      resolveTrailingPartBar(measures, 1, {
        singlePartPreview: true,
        isLastPartInSong: true,
      }),
    ).toBe('||');
  });
});
