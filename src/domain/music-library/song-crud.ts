import type { SongBlockDef, SongDef } from '../song/song-types';
import { validateSongBlockDef, validateSongDef } from '../song/validate-song';
import {
  generateCustomSongBlockId,
  generateCustomSongId,
} from './generate-id';
import {
  getAllSongBlocks,
  getSongBlockSource,
  getSongById,
} from '../song/song-registry';
import type { ValidationResult } from './validate';
import { loadCustomLibrary, saveCustomLibrary } from './storage';
import { cloneSongMeasure } from '../song/measure-utils';

function resolveSongBlockId(block: SongBlockDef): SongBlockDef {
  const id = block.id.trim()
    ? block.id.trim()
    : generateCustomSongBlockId(block.label);
  return {
    ...block,
    id,
    label: block.label.trim(),
    measures: block.measures.map((measure) => cloneSongMeasure(measure)),
  };
}

function resolveSongId(song: SongDef): SongDef {
  const id = song.id.trim() ? song.id.trim() : generateCustomSongId(song.name);
  return {
    ...song,
    id,
    name: song.name.trim(),
    parts: song.parts.map((part) =>
      part.type === 'inline'
        ? {
            type: 'inline' as const,
            measures: part.measures.map((measure) => cloneSongMeasure(measure)),
          }
        : { ...part },
    ),
  };
}

export function upsertCustomSongBlock(block: SongBlockDef): ValidationResult {
  const toSave = resolveSongBlockId(block);
  const result = validateSongBlockDef(toSave);
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }
  const library = loadCustomLibrary();
  const index = library.songBlocks.findIndex((b) => b.id === toSave.id);
  if (index >= 0) {
    library.songBlocks[index] = toSave;
  } else {
    library.songBlocks.push(toSave);
  }
  saveCustomLibrary(library);
  return { ok: true, errors: [], id: toSave.id };
}

export function deleteCustomSongBlock(id: string): void {
  const library = loadCustomLibrary();
  library.songBlocks = library.songBlocks.filter((block) => block.id !== id);
  saveCustomLibrary(library);
}

export function upsertCustomSong(
  song: SongDef,
  extraBlocks: readonly SongBlockDef[] = [],
): ValidationResult {
  const toSave = resolveSongId(song);
  const blocksById = new Map(getAllSongBlocks().map((block) => [block.id, block]));
  for (const block of extraBlocks) {
    blocksById.set(block.id, block);
  }
  const blocks = [...blocksById.values()];
  const result = validateSongDef(toSave, blocks);
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }
  const library = loadCustomLibrary();
  const index = library.songs.findIndex((s) => s.id === toSave.id);
  if (index >= 0) {
    library.songs[index] = toSave;
  } else {
    library.songs.push(toSave);
  }
  saveCustomLibrary(library);
  return { ok: true, errors: [], id: toSave.id };
}

export function deleteCustomSong(id: string): void {
  const library = loadCustomLibrary();
  library.songs = library.songs.filter((song) => song.id !== id);
  saveCustomLibrary(library);
}

export function duplicateSongBlockAsCustom(
  builtinId: string,
): SongBlockDef | undefined {
  const source = getAllSongBlocks().find((b) => b.id === builtinId);
  if (!source || getSongBlockSource(builtinId) !== 'builtin') {
    return undefined;
  }
  return {
    id: '',
    label: `${source.label} (copy)`,
    measures: source.measures.map((measure) => cloneSongMeasure(measure)),
  };
}

export function duplicateSongAsCustom(
  sourceId: string,
): { song: SongDef; blocks: SongBlockDef[] } | undefined {
  const source = getSongById(sourceId);
  if (!source) {
    return undefined;
  }

  const blocks: SongBlockDef[] = [];
  const blockIdMap = new Map<string, string>();

  for (const part of source.parts) {
    if (part.type !== 'block' || blockIdMap.has(part.blockId)) {
      continue;
    }
    const sourceBlock = getAllSongBlocks().find((b) => b.id === part.blockId);
    if (!sourceBlock) {
      continue;
    }
    const newId = generateCustomSongBlockId(sourceBlock.label);
    blockIdMap.set(part.blockId, newId);
    blocks.push({
      ...sourceBlock,
      id: newId,
      label: sourceBlock.label,
      measures: sourceBlock.measures.map((measure) => cloneSongMeasure(measure)),
    });
  }

  return {
    song: {
      ...source,
      id: '',
      name: `${source.name} (copy)`,
      parts: source.parts.map((part) =>
        part.type === 'inline'
          ? {
              type: 'inline' as const,
              measures: part.measures.map((measure) =>
                cloneSongMeasure(measure),
              ),
            }
          : {
              ...part,
              blockId: blockIdMap.get(part.blockId) ?? part.blockId,
            },
      ),
    },
    blocks,
  };
}
