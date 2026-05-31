import {
  parseTimeSignature,
  measureQuarterBeats as quarterBeatsFromSignature,
  STRUM_CHORD_LOOKUP_EPSILON,
  type StrumPatternHit,
} from '../strum-pattern/strum-pattern';
import type { SongChordEvent, SongMeasure } from './song-types';

export function cloneSongMeasure(measure: SongMeasure): SongMeasure {
  return {
    ...measure,
    markers: measure.markers ? { ...measure.markers } : undefined,
    events: measure.events.map((event) => ({ ...event })),
  };
}

export function measureQuarterBeats(
  measure: SongMeasure,
  defaultTimeSignature: string,
  inheritedTimeSignature: string,
): number {
  const ts =
    measure.timeSignature?.trim() ||
    inheritedTimeSignature ||
    defaultTimeSignature;
  const parsed = parseTimeSignature(ts);
  return parsed ? quarterBeatsFromSignature(parsed) : 4;
}

export function resolveEffectiveKeyId(
  measures: readonly SongMeasure[],
  measureIndex: number,
  defaultKeyId: string,
): string {
  for (let i = measureIndex; i >= 0; i--) {
    const keyId = measures[i]?.keyId?.trim();
    if (keyId) {
      return keyId;
    }
  }
  return defaultKeyId;
}

export function resolveEffectiveStrumPatternId(
  measures: readonly SongMeasure[],
  measureIndex: number,
  defaultStrumPatternId: string,
): string {
  for (let i = measureIndex; i >= 0; i--) {
    const strumPatternId = measures[i]?.strumPatternId?.trim();
    if (strumPatternId) {
      return strumPatternId;
    }
  }
  return defaultStrumPatternId;
}

export function resolveEffectiveTimeSignature(
  measures: readonly SongMeasure[],
  measureIndex: number,
  defaultTimeSignature: string,
): string {
  for (let i = measureIndex; i >= 0; i--) {
    const ts = measures[i]?.timeSignature?.trim();
    if (ts) {
      return ts;
    }
  }
  return defaultTimeSignature;
}

/** 小節内の指定拍で有効なコードイベント（最も近い過去の offset） */
export function activeChordEventAtBeat(
  events: readonly SongChordEvent[],
  beatOffset: number,
): SongChordEvent | undefined {
  if (events.length === 0) {
    return undefined;
  }
  const sorted = [...events].sort((a, b) => a.offsetBeats - b.offsetBeats);
  let active = sorted[0];
  for (const event of sorted) {
    if (event.offsetBeats <= beatOffset + 1e-6) {
      active = event;
    } else {
      break;
    }
  }
  return active;
}

/** UI 表示用: 内部 offsetBeats（0 始まり）→ 拍番号（1 始まり） */
export function offsetBeatsToDisplayBeat(offsetBeats: number): number {
  return offsetBeats + 1;
}

/** UI 入力用: 拍番号（1 始まり）→ 内部 offsetBeats（0 始まり） */
export function displayBeatToOffsetBeats(displayBeat: number): number {
  return displayBeat - 1;
}

/** 折りたたみチップ等のコード前ラベル（1 拍目は省略） */
export function formatChordEventBeatPrefix(offsetBeats: number): string {
  if (offsetBeats <= 1e-6) {
    return '';
  }
  return `${offsetBeatsToDisplayBeat(offsetBeats)}: `;
}

/** ストローク hit のコード解決（タイグループ内のコード変更は開始拍から適用） */
export function activeChordEventForStrumHit(
  events: readonly SongChordEvent[],
  hit: Pick<
    StrumPatternHit,
    'chordLookupBeats' | 'offsetBeats' | 'tieGroupEndBeats'
  >,
): SongChordEvent | undefined {
  const tieEnd = hit.tieGroupEndBeats;
  if (
    tieEnd !== undefined &&
    tieEnd > hit.offsetBeats + STRUM_CHORD_LOOKUP_EPSILON
  ) {
    const tieStart = hit.offsetBeats;
    let best = activeChordEventAtBeat(
      events,
      tieStart - STRUM_CHORD_LOOKUP_EPSILON,
    );
    for (const event of events) {
      if (
        event.offsetBeats >= tieStart - STRUM_CHORD_LOOKUP_EPSILON &&
        event.offsetBeats < tieEnd - STRUM_CHORD_LOOKUP_EPSILON
      ) {
        if (!best || event.offsetBeats >= best.offsetBeats) {
          best = event;
        }
      }
    }
    return best;
  }
  return activeChordEventAtBeat(events, hit.chordLookupBeats);
}

export interface MarkerIndices {
  segnoIndex: number;
  fineIndex: number;
  codaIndex: number;
  toCodaIndex: number;
}

export function findMarkerIndices(
  measures: readonly SongMeasure[],
): MarkerIndices {
  let segnoIndex = -1;
  let fineIndex = -1;
  let codaIndex = -1;
  let toCodaIndex = -1;

  for (let i = 0; i < measures.length; i++) {
    const m = measures[i]?.markers;
    if (!m) {
      continue;
    }
    if (m.segno && segnoIndex < 0) {
      segnoIndex = i;
    }
    if (m.fine && fineIndex < 0) {
      fineIndex = i;
    }
    if (m.coda && codaIndex < 0) {
      codaIndex = i;
    }
    if (m.toCoda && toCodaIndex < 0) {
      toCodaIndex = i;
    }
  }

  return { segnoIndex, fineIndex, codaIndex, toCodaIndex };
}
