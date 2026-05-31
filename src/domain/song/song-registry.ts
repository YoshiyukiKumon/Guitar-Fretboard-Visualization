import {
  BUILTIN_SONG_BLOCKS,
  BUILTIN_SONGS,
  getBuiltinSongBlockById,
  getBuiltinSongById,
} from '../song/builtin-songs';
import type { SongBlockDef, SongDef } from '../song/song-types';
import { loadCustomLibrary } from '../music-library/storage';

export type MusicSource = 'builtin' | 'custom';

export interface ListedSongBlock {
  def: SongBlockDef;
  source: MusicSource;
}

export interface ListedSong {
  def: SongDef;
  source: MusicSource;
}

function customSongBlocks(): SongBlockDef[] {
  return loadCustomLibrary().songBlocks;
}

function customSongs(): SongDef[] {
  return loadCustomLibrary().songs;
}

export function listSongBlocks(): ListedSongBlock[] {
  const builtin: ListedSongBlock[] = BUILTIN_SONG_BLOCKS.map((def) => ({
    def,
    source: 'builtin' as const,
  }));
  const custom: ListedSongBlock[] = customSongBlocks().map((def) => ({
    def,
    source: 'custom' as const,
  }));
  return [...builtin, ...custom];
}

export function listSongs(): ListedSong[] {
  const builtin: ListedSong[] = BUILTIN_SONGS.map((def) => ({
    def,
    source: 'builtin' as const,
  }));
  const custom: ListedSong[] = customSongs().map((def) => ({
    def,
    source: 'custom' as const,
  }));
  return [...builtin, ...custom];
}

export function getAllSongBlocks(): SongBlockDef[] {
  return [...BUILTIN_SONG_BLOCKS, ...customSongBlocks()];
}

export function getSongBlockById(id: string): SongBlockDef | undefined {
  return getBuiltinSongBlockById(id) ?? customSongBlocks().find((b) => b.id === id);
}

export function getSongById(id: string): SongDef | undefined {
  return getBuiltinSongById(id) ?? customSongs().find((s) => s.id === id);
}

export function isKnownSongId(id: string): boolean {
  return getSongById(id) !== undefined;
}

export function getSongBlockSource(id: string): MusicSource | undefined {
  if (BUILTIN_SONG_BLOCKS.some((block) => block.id === id)) {
    return 'builtin';
  }
  if (customSongBlocks().some((block) => block.id === id)) {
    return 'custom';
  }
  return undefined;
}

export function getSongSource(id: string): MusicSource | undefined {
  if (BUILTIN_SONGS.some((song) => song.id === id)) {
    return 'builtin';
  }
  if (customSongs().some((song) => song.id === id)) {
    return 'custom';
  }
  return undefined;
}

export function songsReferencingBlock(blockId: string): SongDef[] {
  return listSongs()
    .map((item) => item.def)
    .filter((song) =>
      song.parts.some(
        (part) => part.type === 'block' && part.blockId === blockId,
      ),
    );
}
