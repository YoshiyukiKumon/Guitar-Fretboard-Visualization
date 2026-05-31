import { describe, expect, it } from 'vitest';
import { BUILTIN_SONG_BLOCKS, BUILTIN_SONGS } from '../src/domain/song/builtin-songs';
import { validateSongBlockDef, validateSongDef } from '../src/domain/song/validate-song';

describe('validateSongBlockDef repeat markers', () => {
  it('rejects unclosed repeatStart', () => {
    const result = validateSongBlockDef({
      id: 'test',
      label: 'Test',
      measures: [
        {
          markers: { repeatStart: true },
          events: [{ offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' }],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('unclosed repeatStart');
  });

  it('rejects repeatEnd without repeatStart', () => {
    const result = validateSongBlockDef({
      id: 'test',
      label: 'Test',
      measures: [
        {
          markers: { repeatEnd: true },
          events: [{ offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' }],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('repeatEnd without repeatStart'))).toBe(
      true,
    );
  });
});

describe('validateSongDef warnings', () => {
  it('warns when measure time signature differs from strum', () => {
    const song = {
      ...BUILTIN_SONGS[1],
      strumPatternId: 'builtin-strum-quarter',
      parts: [
        {
          type: 'inline' as const,
          measures: [
            {
              timeSignature: '3/4',
              events: [{ offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' }],
            },
          ],
        },
      ],
    };
    const result = validateSongDef(song, BUILTIN_SONG_BLOCKS);
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
