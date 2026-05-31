import { isKeyId } from '../data/keys';
import { parseTimeSignature } from '../strum-pattern/strum-pattern';
import {
  getStrumPatternById,
  isKnownChordId,
  isKnownStrumPatternId,
} from '../music-library/registry';
import { flattenSongParts } from './flatten-song-parts';
import {
  findMarkerIndices,
  resolveEffectiveStrumPatternId,
  resolveEffectiveTimeSignature,
} from './measure-utils';
import type { SongBlockDef, SongDef, SongMeasure } from './song-types';

export interface SongValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function validateEvents(
  measure: SongMeasure,
  measureQuarterBeats: number,
  errors: string[],
  label: string,
): void {
  const offsets = new Set<number>();
  for (const event of measure.events) {
    if (!isKeyId(event.chordRootKeyId)) {
      errors.push(`${label}: invalid chord root ${event.chordRootKeyId}`);
    }
    if (!isKnownChordId(event.chordId)) {
      errors.push(`${label}: unknown chord ${event.chordId}`);
    }
    if (event.offsetBeats < 0 || event.offsetBeats >= measureQuarterBeats) {
      errors.push(`${label}: offsetBeats out of range`);
    }
    if (offsets.has(event.offsetBeats)) {
      errors.push(`${label}: duplicate offsetBeats`);
    }
    offsets.add(event.offsetBeats);
  }
}

function validateRepeatMarkers(
  measures: readonly SongMeasure[],
  errors: string[],
): void {
  let depth = 0;
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i]?.markers;
    if (m?.repeatStart) {
      depth++;
    }
    if (m?.repeatEnd) {
      if (depth === 0) {
        errors.push(`measure ${i + 1}: repeatEnd without repeatStart`);
      } else {
        depth--;
      }
    }
  }
  if (depth > 0) {
    errors.push('unclosed repeatStart');
  }
}

function validateMeasureMarkers(
  measures: readonly SongMeasure[],
  errors: string[],
): void {
  let codaCount = 0;
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i]?.markers;
    if (!m) {
      continue;
    }
    if (m.coda) {
      codaCount++;
    }
    const fineFlags = [m.daCapoAlFine, m.dalSegnoAlFine].filter(Boolean).length;
    const codaFlags = [m.daCapoAlCoda, m.dalSegnoAlCoda].filter(Boolean).length;
    if (fineFlags > 0 && codaFlags > 0) {
      errors.push(`measure ${i + 1}: fine and coda directives conflict`);
    }
  }
  if (codaCount > 1) {
    errors.push('multiple coda markers');
  }

  const indices = findMarkerIndices(measures);
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i]?.markers;
    if (!m) {
      continue;
    }
    if ((m.dalSegnoAlFine || m.dalSegnoAlCoda) && indices.segnoIndex < 0) {
      errors.push(`measure ${i + 1}: segno required for D.S.`);
    }
    if ((m.daCapoAlFine || m.dalSegnoAlFine) && indices.fineIndex < 0) {
      errors.push(`measure ${i + 1}: fine required for D.C./D.S. al Fine`);
    }
    if (
      (m.daCapoAlCoda || m.dalSegnoAlCoda) &&
      (indices.toCodaIndex < 0 || indices.codaIndex < 0)
    ) {
      errors.push(`measure ${i + 1}: toCoda and coda required for al Coda`);
    }
  }
}

function collectTimeSignatureWarnings(
  song: SongDef,
  flat: readonly SongMeasure[],
  warnings: string[],
): void {
  flat.forEach((measure, index) => {
    const effectiveStrumId = resolveEffectiveStrumPatternId(
      flat,
      index,
      song.strumPatternId,
    );
    const strum = getStrumPatternById(effectiveStrumId);
    const strumTs = strum?.timeSignature?.trim();
    if (!strumTs) {
      return;
    }

    const inheritedTs = resolveEffectiveTimeSignature(
      flat,
      index,
      song.defaultTimeSignature,
    );
    const measureTs = measure.timeSignature?.trim() || inheritedTs;
    if (measureTs !== strumTs) {
      warnings.push(
        `measure ${index + 1}: time signature ${measureTs} differs from strum ${strumTs}`,
      );
    }
  });
}

export function validateSongBlockDef(block: SongBlockDef): SongValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!block.label.trim()) {
    errors.push('label required');
  }
  if (block.measures.length === 0) {
    errors.push('at least one measure required');
  }
  block.measures.forEach((measure, index) => {
    const ts = measure.timeSignature?.trim() || '4/4';
    const parsed = parseTimeSignature(ts);
    const beats = parsed?.beats ?? 4;
    validateEvents(measure, beats, errors, `measure ${index + 1}`);
    if (
      measure.strumPatternId &&
      !isKnownStrumPatternId(measure.strumPatternId)
    ) {
      errors.push(`measure ${index + 1}: unknown strumPatternId`);
    }
  });
  validateMeasureMarkers(block.measures, errors);
  validateRepeatMarkers(block.measures, errors);
  return { ok: errors.length === 0, errors, warnings };
}

export function validateSongDef(
  song: SongDef,
  blocks: readonly SongBlockDef[],
): SongValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!song.name.trim()) {
    errors.push('name required');
  }
  if (!isKeyId(song.defaultKeyId)) {
    errors.push('invalid defaultKeyId');
  }
  if (!parseTimeSignature(song.defaultTimeSignature)) {
    errors.push('invalid defaultTimeSignature');
  }
  if (!isKnownStrumPatternId(song.strumPatternId)) {
    errors.push('unknown strumPatternId');
  }
  if (song.parts.length === 0) {
    errors.push('parts required');
  }
  if (!Number.isInteger(song.playCount) || song.playCount < 0) {
    errors.push('playCount must be >= 0');
  }
  if (song.bpm !== undefined && (song.bpm < 40 || song.bpm > 240)) {
    errors.push('bpm out of range');
  }

  for (const part of song.parts) {
    if (part.type === 'block') {
      const block = blocks.find((b) => b.id === part.blockId);
      if (!block) {
        errors.push(`unknown blockId ${part.blockId}`);
      }
    }
  }

  const flat = flattenSongParts(song, blocks);
  if (flat.length === 0) {
    errors.push('flattened measures empty');
  }

  flat.forEach((measure, index) => {
    const ts = measure.timeSignature?.trim() || song.defaultTimeSignature;
    const parsed = parseTimeSignature(ts);
    const beats = parsed?.beats ?? 4;
    validateEvents(measure, beats, errors, `flat measure ${index + 1}`);
    if (
      measure.strumPatternId &&
      !isKnownStrumPatternId(measure.strumPatternId)
    ) {
      errors.push(`flat measure ${index + 1}: unknown strumPatternId`);
    }
  });
  validateMeasureMarkers(flat, errors);
  validateRepeatMarkers(flat, errors);
  collectTimeSignatureWarnings(song, flat, warnings);

  return { ok: errors.length === 0, errors, warnings };
}

/** 保存前確認用: 拍子不一致などの警告メッセージ */
export function collectSongSaveWarnings(
  song: SongDef,
  blocks: readonly SongBlockDef[],
): string[] {
  return validateSongDef(song, blocks).warnings;
}
