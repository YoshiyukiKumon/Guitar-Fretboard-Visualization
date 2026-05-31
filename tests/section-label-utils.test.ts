import { describe, expect, it } from 'vitest';
import {
  isSectionLabelTaken,
  nextCopySectionLabel,
} from '../src/domain/song/section-label-utils';
import type { SongBlockDef, SongDef } from '../src/domain/song/song-types';
import {
  decodeSongPart,
  encodeSongPart,
} from '../src/domain/song/song-csv-codec';

const blocks: SongBlockDef[] = [
  { id: 'b-intro', label: 'Intro', measures: [] },
  { id: 'b-a', label: 'A', measures: [] },
];

const song: SongDef = {
  id: 's1',
  name: 'Test',
  defaultKeyId: 'C',
  defaultTimeSignature: '4/4',
  strumPatternId: 'p1',
  playCount: 1,
  parts: [
    { type: 'block', blockId: 'b-intro' },
    { type: 'block', blockId: 'b-a' },
  ],
};

describe('section-label-utils', () => {
  it('detects duplicate section labels case-insensitively', () => {
    const getBlock = (id: string) => blocks.find((b) => b.id === id);
    expect(isSectionLabelTaken('Intro', song, getBlock)).toBe(true);
    expect(isSectionLabelTaken('intro', song, getBlock)).toBe(true);
    expect(isSectionLabelTaken('B', song, getBlock)).toBe(false);
    expect(isSectionLabelTaken('Intro', song, getBlock, 'b-intro')).toBe(
      false,
    );
  });

  it('generates copy labels with apostrophes', () => {
    const getBlock = (id: string) => blocks.find((b) => b.id === id);
    expect(nextCopySectionLabel('A', song, getBlock)).toBe("A'");
    expect(nextCopySectionLabel('A', song, getBlock)).toBe("A'");
    const withPrime: SongDef = {
      ...song,
      parts: [
        ...song.parts,
        { type: 'block', blockId: 'b-a-prime' },
      ],
    };
    const blocksWithPrime = [
      ...blocks,
      { id: 'b-a-prime', label: "A'", measures: [] },
    ];
    const getBlockPrime = (id: string) =>
      blocksWithPrime.find((b) => b.id === id);
    expect(nextCopySectionLabel('A', withPrime, getBlockPrime)).toBe("A''");
  });
});

describe('song-csv-codec blockRef', () => {
  it('round-trips reference block parts', () => {
    const part = { type: 'block' as const, blockId: 'b-intro', reference: true };
    expect(decodeSongPart(encodeSongPart(part))).toEqual(part);
  });
});
