import type { SongBlockDef, SongDef, SongMeasure } from './song-types';
import { cloneSongMeasure } from './measure-utils';

export function flattenSongParts(
  song: Pick<SongDef, 'parts'>,
  blocks: readonly SongBlockDef[],
): SongMeasure[] {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  const result: SongMeasure[] = [];

  for (const part of song.parts) {
    if (part.type === 'block') {
      const block = blockMap.get(part.blockId);
      if (!block) {
        continue;
      }
      for (const measure of block.measures) {
        result.push(cloneSongMeasure(measure));
      }
    } else {
      for (const measure of part.measures) {
        result.push(cloneSongMeasure(measure));
      }
    }
  }

  return result;
}

export function findBlockById(
  blocks: readonly SongBlockDef[],
  blockId: string,
): SongBlockDef | undefined {
  return blocks.find((block) => block.id === blockId);
}

/** 平坦化後の小節 index → パート先頭ラベル（ブロック名 / インライン） */
export function buildPartStartLabels(
  song: Pick<SongDef, 'parts'>,
  blocks: readonly SongBlockDef[],
): ReadonlyMap<number, string> {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  const labels = new Map<number, string>();
  let index = 0;

  for (const part of song.parts) {
    if (part.type === 'block') {
      const block = blockMap.get(part.blockId);
      labels.set(index, block?.label ?? part.blockId);
      index += block?.measures.length ?? 0;
    } else {
      labels.set(index, 'inline');
      index += part.measures.length;
    }
  }

  return labels;
}

/** 平坦化後の小節 index → parts 配列 index */
export function buildPartStartPartIndices(
  song: Pick<SongDef, 'parts'>,
  blocks: readonly SongBlockDef[],
): ReadonlyMap<number, number> {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  const indices = new Map<number, number>();
  let index = 0;

  song.parts.forEach((part, partIndex) => {
    if (part.type === 'block') {
      const block = blockMap.get(part.blockId);
      indices.set(index, partIndex);
      index += block?.measures.length ?? 0;
    } else {
      indices.set(index, partIndex);
      index += part.measures.length;
    }
  });

  return indices;
}

/** 平坦化後の小節 index のうち、各パート末尾の index 集合 */
export function buildPartEndSourceIndices(
  song: Pick<SongDef, 'parts'>,
  blocks: readonly SongBlockDef[],
): ReadonlySet<number> {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  const endIndices = new Set<number>();
  let index = 0;

  for (const part of song.parts) {
    const measureCount =
      part.type === 'block'
        ? (blockMap.get(part.blockId)?.measures.length ?? 0)
        : part.measures.length;
    if (measureCount > 0) {
      endIndices.add(index + measureCount - 1);
    }
    index += measureCount;
  }

  return endIndices;
}
