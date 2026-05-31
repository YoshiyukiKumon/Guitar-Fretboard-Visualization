import { describe, expect, it } from 'vitest';
import {
  clampSongTranspose,
  formatSongTransposeLabel,
  transposeSongKeyId,
} from '../src/domain/song/song-transpose';

describe('song-transpose', () => {
  it('clamps to ±6 semitones', () => {
    expect(clampSongTranspose(-12)).toBe(-6);
    expect(clampSongTranspose(8)).toBe(6);
    expect(clampSongTranspose(2.7)).toBe(3);
  });

  it('transposes key ids with wraparound', () => {
    expect(transposeSongKeyId('C', 2)).toBe('D');
    expect(transposeSongKeyId('A', 3)).toBe('C');
    expect(transposeSongKeyId('C', -1)).toBe('B');
  });

  it('formats transpose labels for UI', () => {
    expect(formatSongTransposeLabel(0)).toBe('0');
    expect(formatSongTransposeLabel(3)).toBe('+3');
    expect(formatSongTransposeLabel(-2)).toBe('-2');
  });
});
