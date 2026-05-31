import { CHORDS } from '../data/chords';
import { SCALES } from '../data/scales';
import { BUILTIN_STRUM_PATTERNS } from '../strum-pattern/strum-pattern';
import { BUILTIN_SONG_BLOCKS, BUILTIN_SONGS } from '../song/builtin-songs';

export const BUILTIN_SCALE_IDS = new Set(SCALES.map((s) => s.id));
export const BUILTIN_CHORD_IDS = new Set(CHORDS.map((c) => c.id));
export const BUILTIN_STRUM_PATTERN_IDS = new Set(
  BUILTIN_STRUM_PATTERNS.map((pattern) => pattern.id),
);
export const BUILTIN_SONG_BLOCK_IDS = new Set(BUILTIN_SONG_BLOCKS.map((b) => b.id));
export const BUILTIN_SONG_IDS = new Set(BUILTIN_SONGS.map((s) => s.id));

export function isBuiltinScaleId(id: string): boolean {
  return BUILTIN_SCALE_IDS.has(id);
}

export function isBuiltinChordId(id: string): boolean {
  return BUILTIN_CHORD_IDS.has(id);
}

export function isBuiltinStrumPatternId(id: string): boolean {
  return BUILTIN_STRUM_PATTERN_IDS.has(id);
}

export function isBuiltinSongBlockId(id: string): boolean {
  return BUILTIN_SONG_BLOCK_IDS.has(id);
}

export function isBuiltinSongId(id: string): boolean {
  return BUILTIN_SONG_IDS.has(id);
}
