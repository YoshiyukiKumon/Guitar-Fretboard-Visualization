import { findKeyById } from '../data/keys';
import { canonicalKeyIdForPitchClass } from '../chord-root-options';

export const MIN_SONG_TRANSPOSE = -6;
export const MAX_SONG_TRANSPOSE = 6;

export function clampSongTranspose(semitones: number): number {
  return Math.max(
    MIN_SONG_TRANSPOSE,
    Math.min(MAX_SONG_TRANSPOSE, Math.round(semitones)),
  );
}

/** コードルート keyId を半音数だけ移調（正規 keyId に正規化） */
export function transposeSongKeyId(
  keyId: string,
  semitones: number,
): string {
  if (semitones === 0) {
    return keyId;
  }
  const key = findKeyById(keyId);
  if (!key) {
    return keyId;
  }
  return canonicalKeyIdForPitchClass(key.pitchClass + semitones);
}

export function formatSongTransposeLabel(semitones: number): string {
  if (semitones > 0) {
    return `+${semitones}`;
  }
  return String(semitones);
}
