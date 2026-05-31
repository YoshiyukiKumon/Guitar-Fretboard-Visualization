import { describe, expect, it, beforeEach } from 'vitest';
import {
  duplicateSongAsCustom,
  upsertCustomSong,
  upsertCustomSongBlock,
} from '../src/domain/music-library/song-crud';
import { resetCustomLibrary, loadCustomLibrary } from '../src/domain/music-library/storage';
import { getSongBlockById } from '../src/domain/song/song-registry';

beforeEach(() => {
  resetCustomLibrary();
});

describe('duplicateSongAsCustom', () => {
  it('forks builtin block references into custom blocks with measures', () => {
    const result = duplicateSongAsCustom('builtin-song-sample-pop');
    expect(result).toBeDefined();

    const { song, blocks } = result!;
    expect(song.id).toBe('');
    expect(song.name).toBe('Sample POP (copy)');
    expect(blocks.length).toBeGreaterThan(0);

    for (const part of song.parts) {
      if (part.type !== 'block') {
        continue;
      }
      expect(part.blockId.startsWith('custom-song-block-')).toBe(true);
      expect(getSongBlockById(part.blockId)).toBeUndefined();

      const block = blocks.find((b) => b.id === part.blockId);
      expect(block).toBeDefined();
      expect(block!.measures.length).toBeGreaterThan(0);
    }

    const sectionA = blocks.find((b) => b.label === 'A');
    const sabi = blocks.find((b) => b.label === 'サビ');
    expect(sectionA?.measures).toHaveLength(8);
    expect(sabi?.measures).toHaveLength(10);
  });

  it('clones inline-only builtin songs without forking blocks', () => {
    const result = duplicateSongAsCustom('builtin-song-ii-v-i-repeat');
    expect(result).toBeDefined();

    const { song, blocks } = result!;
    expect(song.id).toBe('');
    expect(song.name).toBe('ii-V-I repeat (copy)');
    expect(blocks).toHaveLength(0);
    expect(song.parts).toHaveLength(1);
    expect(song.parts[0]?.type).toBe('inline');
    if (song.parts[0]?.type === 'inline') {
      expect(song.parts[0].measures).toHaveLength(4);
    }
  });

  it('validates duplicated song with unsaved draft blocks via extraBlocks', () => {
    const result = duplicateSongAsCustom('builtin-song-sample-pop');
    expect(result).toBeDefined();

    const { song, blocks } = result!;
    const validation = upsertCustomSong(song, blocks);
    expect(validation.errors).not.toContain('unknown blockId custom-song-block-a');
    expect(validation.ok).toBe(true);
  });

  it('persists forked block ids like custom-song-block-a across loadCustomLibrary', () => {
    const result = duplicateSongAsCustom('builtin-song-sample-pop');
    expect(result).toBeDefined();

    for (const block of result!.blocks) {
      const saved = upsertCustomSongBlock(block);
      expect(saved.ok).toBe(true);
    }

    const sectionA = result!.blocks.find((block) => block.label === 'A');
    expect(sectionA).toBeDefined();
    expect(loadCustomLibrary().songBlocks.some((b) => b.id === sectionA!.id)).toBe(
      true,
    );
    expect(getSongBlockById(sectionA!.id)?.measures).toHaveLength(8);
  });

  it('supports duplicate after save (copy of copy)', () => {
    const first = duplicateSongAsCustom('builtin-song-sample-pop');
    expect(first).toBeDefined();

    for (const block of first!.blocks) {
      expect(upsertCustomSongBlock(block).ok).toBe(true);
    }
    const saved = upsertCustomSong(first!.song);
    expect(saved.ok).toBe(true);

    const second = duplicateSongAsCustom(saved.id!);
    expect(second).toBeDefined();

    for (const part of second!.song.parts) {
      if (part.type !== 'block') {
        continue;
      }
      const block = second!.blocks.find((b) => b.id === part.blockId);
      expect(block).toBeDefined();
      expect(block!.measures.length).toBeGreaterThan(0);
    }
  });
});
