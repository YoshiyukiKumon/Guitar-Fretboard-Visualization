import type { SongBlockDef, SongDef } from './song-types';

function normalizeSectionLabel(label: string): string {
  return label.trim().toLowerCase();
}

/** 曲構成内のブロックセクション名が既に使われているか */
export function isSectionLabelTaken(
  label: string,
  song: Pick<SongDef, 'parts'>,
  getBlock: (blockId: string) => SongBlockDef | undefined,
  exceptBlockId?: string,
): boolean {
  const normalized = normalizeSectionLabel(label);
  if (!normalized) {
    return true;
  }
  for (const part of song.parts) {
    if (part.type !== 'block') {
      continue;
    }
    if (exceptBlockId && part.blockId === exceptBlockId) {
      continue;
    }
    const block = getBlock(part.blockId);
    if (block && normalizeSectionLabel(block.label) === normalized) {
      return true;
    }
  }
  return false;
}

/** コピー用: 既存と重ならない `A'` / `A''` … ラベルを生成 */
export function nextCopySectionLabel(
  baseLabel: string,
  song: Pick<SongDef, 'parts'>,
  getBlock: (blockId: string) => SongBlockDef | undefined,
): string {
  const trimmed = baseLabel.trim() || 'Section';
  let candidate = `${trimmed}'`;
  while (isSectionLabelTaken(candidate, song, getBlock)) {
    candidate = `${candidate}'`;
  }
  return candidate;
}
