import { findKeyById } from '../data/keys';
import { findChordById } from '../data/chords';
import { orderedSemitonesForChordPlayback } from '../chord-playback';
import { getStrumPatternById } from '../music-library/registry';
import {
  parseStrumPatternDef,
  type ParsedStrumPattern,
} from '../strum-pattern/strum-pattern';
import { activeChordEventForStrumHit } from './measure-utils';
import { transposeSongKeyId } from './song-transpose';
import type { ExpandedMeasure } from './song-types';

export interface SongScheduleHit {
  /** repeatEpoch からの秒 */
  timeSec: number;
  measurePlaybackIndex: number;
  hitOffsetBeats: number;
  chordRootKeyId: string;
  chordId: string;
  accent: boolean;
}

function defaultParseStrumPattern(id: string): ParsedStrumPattern | null {
  const def = getStrumPatternById(id);
  return def ? parseStrumPatternDef(def) : null;
}

export function buildSongScheduleHits(
  measures: readonly ExpandedMeasure[],
  defaultStrumPatternId: string,
  beatSec: number,
  parseStrumPattern: (id: string) => ParsedStrumPattern | null = defaultParseStrumPattern,
): SongScheduleHit[] {
  const hits: SongScheduleHit[] = [];
  let timeSec = 0;

  for (let measureIndex = 0; measureIndex < measures.length; measureIndex++) {
    const measure = measures[measureIndex];
    const measureDuration = measure.measureQuarterBeats * beatSec;
    const patternId =
      measure.effectiveStrumPatternId?.trim() || defaultStrumPatternId;
    const strumPattern = parseStrumPattern(patternId);
    if (!strumPattern) {
      timeSec += measureDuration;
      continue;
    }

    for (const hit of strumPattern.hits) {
      if (hit.offsetBeats >= measure.measureQuarterBeats) {
        continue;
      }
      const event = activeChordEventForStrumHit(measure.events, hit);
      if (!event) {
        continue;
      }
      hits.push({
        timeSec: timeSec + hit.offsetBeats * beatSec,
        measurePlaybackIndex: measureIndex,
        hitOffsetBeats: hit.offsetBeats,
        chordRootKeyId: event.chordRootKeyId,
        chordId: event.chordId,
        accent: hit.accent,
      });
    }

    timeSec += measureDuration;
  }

  return hits;
}

export function resolveSongHitSemitones(
  chordRootKeyId: string,
  chordId: string,
  transposeSemitones = 0,
): { chordKey: ReturnType<typeof findKeyById>; semitones: number[] } | null {
  const rootId =
    transposeSemitones !== 0
      ? transposeSongKeyId(chordRootKeyId, transposeSemitones)
      : chordRootKeyId;
  const chordKey = findKeyById(rootId);
  const chord = findChordById(chordId);
  if (!chordKey || !chord) {
    return null;
  }
  const semitones = orderedSemitonesForChordPlayback(chord.tones, chord.name);
  if (semitones.length === 0) {
    return null;
  }
  return { chordKey, semitones };
}

export function songCycleDurationSec(
  measures: readonly ExpandedMeasure[],
  beatSec: number,
): number {
  return measures.reduce(
    (sum, measure) => sum + measure.measureQuarterBeats * beatSec,
    0,
  );
}

export function findActiveSongHitIndex(
  hits: readonly SongScheduleHit[],
  elapsedSec: number,
  cycleDurationSec: number,
): number {
  if (hits.length === 0) {
    return -1;
  }
  const inCycle =
    Number.isFinite(cycleDurationSec) && cycleDurationSec > 0
      ? ((elapsedSec % cycleDurationSec) + cycleDurationSec) % cycleDurationSec
      : elapsedSec;
  let active = 0;
  for (let i = 0; i < hits.length; i++) {
    if (hits[i].timeSec <= inCycle + 1e-6) {
      active = i;
    } else if (!Number.isFinite(cycleDurationSec)) {
      break;
    }
  }
  return active;
}
