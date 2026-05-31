import { describe, expect, it } from 'vitest';
import {
  displayBeatToOffsetBeats,
  formatChordEventBeatPrefix,
  offsetBeatsToDisplayBeat,
} from '../src/domain/song/measure-utils';
import { buildSongScheduleHits } from '../src/domain/song/song-playback-plan';
import { parseStrumPatternNotation } from '../src/domain/strum-pattern/strum-pattern';
import { beatDurationSec } from '../src/domain/playback-bpm';

describe('song beat display helpers', () => {
  it('converts between internal offset and 1-based beat number', () => {
    expect(offsetBeatsToDisplayBeat(0)).toBe(1);
    expect(offsetBeatsToDisplayBeat(2)).toBe(3);
    expect(displayBeatToOffsetBeats(3)).toBe(2);
  });

  it('formats chip prefix with 1-based beat number', () => {
    expect(formatChordEventBeatPrefix(0)).toBe('');
    expect(formatChordEventBeatPrefix(2)).toBe('3: ');
  });
});

describe('quarter note chord timing', () => {
  it('applies beat-3 chord on third quarter strum when offsetBeats is 2', () => {
    const parsed = parseStrumPatternNotation('4, 4, 4, 4', '4/4')!;
    const measure = {
      sourceMeasureIndex: 0,
      playbackIndex: 0,
      cycleIndex: 0,
      events: [
        { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
        { offsetBeats: 2, chordRootKeyId: 'A', chordId: 'm' },
      ],
      timeSignature: '4/4',
      effectiveKeyId: 'C',
      effectiveStrumPatternId: 'custom',
      measureQuarterBeats: 4,
    };
    const hits = buildSongScheduleHits(
      [measure],
      'custom',
      beatDurationSec(120),
      () => parsed,
    );

    expect(hits.find((h) => h.hitOffsetBeats === 0)?.chordRootKeyId).toBe('C');
    expect(hits.find((h) => h.hitOffsetBeats === 1)?.chordRootKeyId).toBe('C');
    expect(hits.find((h) => h.hitOffsetBeats === 2)?.chordRootKeyId).toBe('A');
    expect(hits.find((h) => h.hitOffsetBeats === 3)?.chordRootKeyId).toBe('A');
  });
});
