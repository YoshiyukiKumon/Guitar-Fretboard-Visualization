import { describe, expect, it } from 'vitest';
import {
  SONG_MARKER_AFTER_MEASURE_KEYS,
  SONG_MARKER_BEFORE_MEASURE_KEYS,
  SONG_MARKER_KEYS,
} from '../src/domain/song/song-marker-labels';

describe('song marker chart placement keys', () => {
  it('covers every marker exactly once between before and after', () => {
    const combined = [
      ...SONG_MARKER_BEFORE_MEASURE_KEYS,
      ...SONG_MARKER_AFTER_MEASURE_KEYS,
    ];
    expect(combined).toHaveLength(SONG_MARKER_KEYS.length);
    expect(new Set(combined).size).toBe(SONG_MARKER_KEYS.length);
  });

  it('places repeatEnd after the measure bar', () => {
    expect(SONG_MARKER_BEFORE_MEASURE_KEYS).toContain('repeatStart');
    expect(SONG_MARKER_AFTER_MEASURE_KEYS).toContain('repeatEnd');
    expect(SONG_MARKER_BEFORE_MEASURE_KEYS).not.toContain('repeatEnd');
  });
});
