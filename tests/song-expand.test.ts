import { describe, expect, it } from 'vitest';
import { BUILTIN_SONG_BLOCKS, BUILTIN_SONGS } from '../src/domain/song/builtin-songs';
import { flattenSongParts } from '../src/domain/song/flatten-song-parts';
import { expandSongMeasures, expandSongPartMeasures, buildPartChartPreviewMeasures, buildSongChartPreviewMeasures } from '../src/domain/song/expand-song-measures';
import { resolveEffectiveStrumPatternId } from '../src/domain/song/measure-utils';
import type { SongDef } from '../src/domain/song/song-types';

function builtinSong(id: string): SongDef {
  const song = BUILTIN_SONGS.find((entry) => entry.id === id);
  if (!song) {
    throw new Error(`Missing builtin song: ${id}`);
  }
  return song;
}

const II_V_I_REPEAT = builtinSong('builtin-song-ii-v-i-repeat');
const SAMPLE_POP = builtinSong('builtin-song-sample-pop');

describe('resolveEffectiveStrumPatternId', () => {
  const measures = [
    { events: [] },
    { strumPatternId: 'builtin-strum-eighth', events: [] },
    { events: [] },
    { strumPatternId: 'builtin-strum-quarter', events: [] },
    { events: [] },
  ];

  it('inherits song default before first override', () => {
    expect(
      resolveEffectiveStrumPatternId(measures, 0, 'builtin-strum-syncopation'),
    ).toBe('builtin-strum-syncopation');
  });

  it('uses nearest prior override', () => {
    expect(
      resolveEffectiveStrumPatternId(measures, 2, 'builtin-strum-syncopation'),
    ).toBe('builtin-strum-eighth');
    expect(
      resolveEffectiveStrumPatternId(measures, 4, 'builtin-strum-syncopation'),
    ).toBe('builtin-strum-quarter');
  });
});

describe('expandSongMeasures strum inheritance', () => {
  it('sets effectiveStrumPatternId on expanded measures', () => {
    const song = {
      ...BUILTIN_SONGS[1],
      parts: [
        {
          type: 'inline' as const,
          measures: [
            {
              events: [
                { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
              ],
            },
            {
              strumPatternId: 'builtin-strum-eighth',
              events: [
                { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
              ],
            },
            {
              events: [
                { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
              ],
            },
          ],
        },
      ],
    };
    const expanded = expandSongMeasures(song, BUILTIN_SONG_BLOCKS);
    expect(expanded[0]?.effectiveStrumPatternId).toBe(song.strumPatternId);
    expect(expanded[1]?.effectiveStrumPatternId).toBe('builtin-strum-eighth');
    expect(expanded[2]?.effectiveStrumPatternId).toBe('builtin-strum-eighth');
  });
});

describe('flattenSongParts', () => {
  it('expands block references in order', () => {
    const flat = flattenSongParts(SAMPLE_POP, BUILTIN_SONG_BLOCKS);
    expect(flat.length).toBe(30);
  });

  it('includes inline measures', () => {
    const flat = flattenSongParts(II_V_I_REPEAT, BUILTIN_SONG_BLOCKS);
    expect(flat.length).toBe(4);
    expect(flat[0]?.events[0]?.chordRootKeyId).toBe('D');
  });
});

describe('expandSongMeasures', () => {
  it('expands sample pop once by default', () => {
    const expanded = expandSongMeasures(SAMPLE_POP, BUILTIN_SONG_BLOCKS);
    expect(expanded.length).toBe(36);
  });

  it('honors playCount override', () => {
    const song = { ...II_V_I_REPEAT, playCount: 2 };
    const expanded = expandSongMeasures(song, BUILTIN_SONG_BLOCKS, song.playCount);
    expect(expanded.length).toBe(8);
    expect(expanded[4]?.cycleIndex).toBe(1);
  });

  it('honors playCountOverride for session playback', () => {
    const song = { ...II_V_I_REPEAT, playCount: 1 };
    const expanded = expandSongMeasures(song, BUILTIN_SONG_BLOCKS, 3);
    expect(expanded.length).toBe(12);
    expect(expanded[0]?.cycleIndex).toBe(0);
    expect(expanded[4]?.cycleIndex).toBe(1);
    expect(expanded[8]?.cycleIndex).toBe(2);
  });

  it('expands one cycle by default even when song playCount is greater than 1', () => {
    const expanded = expandSongMeasures(II_V_I_REPEAT, BUILTIN_SONG_BLOCKS);
    expect(expanded.length).toBe(4);
  });

  it('sets partLabel at block boundaries', () => {
    const expanded = expandSongMeasures(SAMPLE_POP, BUILTIN_SONG_BLOCKS);
    expect(expanded[0]?.partLabel).toBe('A');
    expect(expanded[8]?.partLabel).toBe('A');
    expect(expanded[16]?.partLabel).toBe('B');
  });

  it('expands a single part only', () => {
    const sectionA = expandSongPartMeasures(SAMPLE_POP, BUILTIN_SONG_BLOCKS, 0);
    const sectionARef = expandSongPartMeasures(SAMPLE_POP, BUILTIN_SONG_BLOCKS, 1);
    expect(sectionA.length).toBe(8);
    expect(sectionA[0]?.partLabel).toBe('A');
    expect(sectionARef.length).toBe(8);
    expect(sectionARef[0]?.partLabel).toBe('A');
  });

  it('handles repeat with first and second ending', () => {
    const song = {
      id: 'test-repeat',
      name: 'Repeat',
      defaultKeyId: 'C',
      defaultTimeSignature: '4/4',
      strumPatternId: 'builtin-strum-quarter',
      playCount: 1,
      parts: [
        {
          type: 'inline' as const,
          measures: [
            { markers: { repeatStart: true }, events: [{ offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' }] },
            { events: [{ offsetBeats: 0, chordRootKeyId: 'G', chordId: 'major-triad' }] },
            { markers: { firstEnding: true, repeatEnd: true }, events: [{ offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' }] },
            { markers: { secondEnding: true }, events: [{ offsetBeats: 0, chordRootKeyId: 'F', chordId: 'major-triad' }] },
            { events: [{ offsetBeats: 0, chordRootKeyId: 'A', chordId: 'm' }] },
          ],
        },
      ],
    };
    const expanded = expandSongMeasures(song, []);
    const roots = expanded.map((m) => m.events[0]?.chordRootKeyId);
    expect(roots).toEqual(['C', 'G', 'C', 'C', 'G', 'F', 'A']);
  });

  it('expands repeat with first, second, and third endings', () => {
    const song = {
      id: 'test-repeat-three',
      name: 'Repeat three',
      defaultKeyId: 'C',
      defaultTimeSignature: '4/4',
      strumPatternId: 'builtin-strum-quarter',
      playCount: 1,
      parts: [
        {
          type: 'inline' as const,
          measures: [
            {
              markers: { repeatStart: true },
              events: [
                { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
              ],
            },
            {
              events: [
                { offsetBeats: 0, chordRootKeyId: 'G', chordId: 'major-triad' },
              ],
            },
            {
              markers: { firstEnding: true, repeatEnd: true },
              events: [
                { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
              ],
            },
            {
              markers: { secondEnding: true, repeatEnd: true },
              events: [
                { offsetBeats: 0, chordRootKeyId: 'F', chordId: 'major-triad' },
              ],
            },
            {
              markers: { thirdEnding: true },
              events: [
                { offsetBeats: 0, chordRootKeyId: 'A', chordId: 'm' },
              ],
            },
            {
              events: [
                { offsetBeats: 0, chordRootKeyId: 'G', chordId: 'major-triad' },
              ],
            },
          ],
        },
      ],
    };
    const roots = expandSongMeasures(song, []).map(
      (m) => m.events[0]?.chordRootKeyId,
    );
    expect(roots).toEqual(['C', 'G', 'C', 'C', 'G', 'F', 'C', 'G', 'A', 'G']);
  });

  it('skips entire multi-measure first ending on second pass', () => {
    const song = {
      id: 'test-repeat-multi',
      name: 'Repeat multi',
      defaultKeyId: 'C',
      defaultTimeSignature: '4/4',
      strumPatternId: 'builtin-strum-quarter',
      playCount: 1,
      parts: [
        {
          type: 'inline' as const,
          measures: [
            {
              markers: { repeatStart: true },
              events: [
                { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
              ],
            },
            {
              events: [
                { offsetBeats: 0, chordRootKeyId: 'G', chordId: 'major-triad' },
              ],
            },
            {
              markers: { firstEnding: true },
              events: [
                { offsetBeats: 0, chordRootKeyId: 'F', chordId: 'major-triad' },
              ],
            },
            {
              markers: { repeatEnd: true },
              events: [
                { offsetBeats: 0, chordRootKeyId: 'G', chordId: 'major-triad' },
              ],
            },
            {
              markers: { secondEnding: true },
              events: [
                { offsetBeats: 0, chordRootKeyId: 'D', chordId: 'm7' },
              ],
            },
            {
              events: [
                { offsetBeats: 0, chordRootKeyId: 'F', chordId: 'major-triad' },
              ],
            },
          ],
        },
      ],
    };

    const roots = expandSongMeasures(song, []).map(
      (measure) => measure.events[0]?.chordRootKeyId,
    );
    expect(roots).toEqual([
      'C',
      'G',
      'F',
      'G',
      'C',
      'G',
      'D',
      'F',
    ]);
  });

  it('expands pop chorus style repeat with 10 measures', () => {
    const chorusMeasure = (
      root: string,
      chordId: string,
      markers?: SongMeasure['markers'],
    ) => ({
      markers,
      events: [{ offsetBeats: 0, chordRootKeyId: root, chordId }],
    });

    const song = {
      id: 'test-pop-chorus',
      name: 'Pop chorus',
      defaultKeyId: 'C',
      defaultTimeSignature: '4/4',
      strumPatternId: 'builtin-strum-quarter',
      playCount: 1,
      parts: [
        {
          type: 'inline' as const,
          measures: [
            chorusMeasure('C', 'major-triad', { repeatStart: true }),
            chorusMeasure('G', 'major-triad'),
            chorusMeasure('A', 'm'),
            chorusMeasure('G', 'major-triad'),
            chorusMeasure('F', 'major-triad'),
            chorusMeasure('C', 'major-triad'),
            chorusMeasure('A', 'm'),
            chorusMeasure('F', 'major-triad', { firstEnding: true }),
            chorusMeasure('G', 'major-triad', { repeatEnd: true }),
            chorusMeasure('D', 'm7', { secondEnding: true }),
            chorusMeasure('F', 'major-triad'),
          ],
        },
      ],
    };

    const roots = expandSongMeasures(song, []).map(
      (measure) => measure.events[0]?.chordRootKeyId,
    );
    expect(roots).toEqual([
      'C',
      'G',
      'A',
      'G',
      'F',
      'C',
      'A',
      'F',
      'G',
      'C',
      'G',
      'A',
      'G',
      'F',
      'C',
      'A',
      'D',
      'F',
    ]);
  });

  it('expands sample pop sabi without error', () => {
    const song = BUILTIN_SONGS.find((s) => s.id === 'builtin-song-sample-pop');
    expect(song).toBeDefined();
    const expanded = expandSongMeasures(song!, BUILTIN_SONG_BLOCKS);
    expect(expanded.length).toBeGreaterThan(0);
  });

  it('buildPartChartPreviewMeasures lists every source measure without repeat walk', () => {
    const song = {
      id: 'test-repeat',
      name: 'Repeat',
      defaultKeyId: 'C',
      defaultTimeSignature: '4/4',
      strumPatternId: 'builtin-strum-quarter',
      playCount: 1,
      parts: [
        {
          type: 'inline' as const,
          measures: [
            {
              markers: { repeatStart: true },
              events: [
                { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
              ],
            },
            {
              events: [
                { offsetBeats: 0, chordRootKeyId: 'G', chordId: 'major-triad' },
              ],
            },
            {
              markers: { firstEnding: true, repeatEnd: true },
              events: [
                { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
              ],
            },
            {
              markers: { secondEnding: true },
              events: [
                { offsetBeats: 0, chordRootKeyId: 'F', chordId: 'major-triad' },
              ],
            },
            {
              events: [
                { offsetBeats: 0, chordRootKeyId: 'D', chordId: 'm7' },
              ],
            },
            {
              events: [
                { offsetBeats: 0, chordRootKeyId: 'F', chordId: 'major-triad' },
              ],
            },
          ],
        },
      ],
    };
    const playback = expandSongMeasures(song, []);
    const preview = buildPartChartPreviewMeasures(song, [], 0);

    expect(playback.map((m) => m.events[0]?.chordRootKeyId)).toEqual([
      'C',
      'G',
      'C',
      'C',
      'G',
      'F',
      'D',
      'F',
    ]);
    expect(preview).toHaveLength(6);
    expect(preview.map((m) => m.events[0]?.chordRootKeyId)).toEqual([
      'C',
      'G',
      'C',
      'F',
      'D',
      'F',
    ]);
    expect(preview.some((m) => m.partLabel)).toBe(false);
  });

  it('buildSongChartPreviewMeasures lists source measures without repeat walk', () => {
    const preview = buildSongChartPreviewMeasures(SAMPLE_POP, BUILTIN_SONG_BLOCKS);
    const playback = expandSongMeasures(SAMPLE_POP, BUILTIN_SONG_BLOCKS);

    expect(preview).toHaveLength(30);
    expect(preview.length).toBeLessThan(playback.length);
    expect(preview.filter((m) => m.partLabel === 'サビ')).toHaveLength(1);

    const sabiPreview = buildPartChartPreviewMeasures(
      SAMPLE_POP,
      BUILTIN_SONG_BLOCKS,
      3,
    );
    expect(sabiPreview).toHaveLength(10);
    expect(
      preview.slice(-10).map((m) => m.events[0]?.chordRootKeyId),
    ).toEqual(sabiPreview.map((m) => m.events[0]?.chordRootKeyId));
  });
});
