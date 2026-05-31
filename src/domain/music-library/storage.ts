import type { ChordDef } from '../data/chords';
import type { ScaleDef } from '../data/scales';
import type { StrumPatternDef } from '../strum-pattern/strum-pattern';
import type { SongBlockDef, SongDef } from '../song/song-types';

const STORAGE_KEY = 'guitar-practice-custom-library';

export interface CustomMusicLibrary {
  scales: ScaleDef[];
  chords: ChordDef[];
  strumPatterns: StrumPatternDef[];
  songBlocks: SongBlockDef[];
  songs: SongDef[];
}

const EMPTY_LIBRARY: CustomMusicLibrary = {
  scales: [],
  chords: [],
  strumPatterns: [],
  songBlocks: [],
  songs: [],
};

/** 組み込み曲へ昇格した旧カスタム曲 ID のみ除外（ラベル由来 ID は除外しない） */
const PROMOTED_CUSTOM_SONG_IDS = new Set([
  'custom-song-ii-v-i-repeat',
  'custom-song-pop-i-v-vi-iv-copy',
  'custom-song-smpsdbpz3',
]);

/** @deprecated 昇格時の一回限りクリーンアップ用。`custom-song-block-a` 等は複製時に再生成されるため含めない */
const PROMOTED_CUSTOM_SONG_BLOCK_IDS = new Set<string>([]);

function stripPromotedCustomLibrary(
  library: CustomMusicLibrary,
): CustomMusicLibrary {
  return {
    ...library,
    songBlocks: library.songBlocks.filter(
      (block) => !PROMOTED_CUSTOM_SONG_BLOCK_IDS.has(block.id),
    ),
    songs: library.songs.filter(
      (song) => !PROMOTED_CUSTOM_SONG_IDS.has(song.id),
    ),
  };
}

export function loadCustomLibrary(): CustomMusicLibrary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...EMPTY_LIBRARY, songBlocks: [], songs: [] };
    }
    const parsed = JSON.parse(raw) as Partial<CustomMusicLibrary>;
    const library: CustomMusicLibrary = {
      scales: Array.isArray(parsed.scales) ? parsed.scales : [],
      chords: Array.isArray(parsed.chords) ? parsed.chords : [],
      strumPatterns: Array.isArray(parsed.strumPatterns)
        ? parsed.strumPatterns
        : [],
      songBlocks: Array.isArray(parsed.songBlocks) ? parsed.songBlocks : [],
      songs: Array.isArray(parsed.songs) ? parsed.songs : [],
    };
    const stripped = stripPromotedCustomLibrary(library);
    if (
      stripped.songBlocks.length !== library.songBlocks.length ||
      stripped.songs.length !== library.songs.length
    ) {
      saveCustomLibrary(stripped);
    }
    return stripped;
  } catch {
    return { ...EMPTY_LIBRARY, songBlocks: [], songs: [] };
  }
}

export function saveCustomLibrary(library: CustomMusicLibrary): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
}

export function resetCustomLibrary(): void {
  localStorage.removeItem(STORAGE_KEY);
}
