/** ストロークパターン定義 */
export interface StrumPatternDef {
  id: string;
  name: string;
  /** 拍子（例: "4/4", "3/4", "12/8"） */
  timeSignature: string;
  /** 例: "4, 4(>), 4, 4(>)" / "8, 8(r), 8(>)"（`-` はタイ、`(>)` はアクセント、`8(r)` は休符） */
  notation: string;
}

export interface StrumPatternHit {
  /** 1 小節内のストローク位置（4 分音符拍単位） */
  offsetBeats: number;
  /** コード解決に使う拍位置（タイで前拍からつながる場合はタイ開始拍） */
  chordLookupBeats: number;
  /** タイ開始 hit のみ。半開区間 [offsetBeats, tieGroupEndBeats) 内のコード変更を開始拍から適用 */
  tieGroupEndBeats?: number;
  /** アクセント（強拍）かどうか */
  accent: boolean;
}

export interface ParsedTimeSignature {
  beats: number;
  beatUnit: number;
  label: string;
}

export interface ParsedStrumPattern {
  hits: readonly StrumPatternHit[];
  /** 1 小節の長さ（4 分音符拍単位。BPM の 1 拍に対応） */
  measureBeats: number;
  timeSignature: string;
}

/** アクセント時のゲイン倍率（従来 peak と同等） */
export const STRUM_ACCENT_GAIN = 1;
/** 非アクセント時のゲイン倍率（アクセント比） */
export const STRUM_NORMAL_GAIN = 0.5;

export const DEFAULT_TIME_SIGNATURE = '4/4';
export const DEFAULT_STRUM_PATTERN_ID = 'builtin-strum-syncopation';

export const BUILTIN_STRUM_PATTERNS: readonly StrumPatternDef[] = [
  {
    id: 'builtin-strum-quarter',
    name: 'Quarter notes',
    timeSignature: '4/4',
    notation: '4, 4(>), 4, 4(>)',
  },
  {
    id: 'builtin-strum-eighth',
    name: 'Eighth notes',
    timeSignature: '4/4',
    notation: '8, 8, 8(>), 8, 8, 8, 8(>), 8',
  },
  {
    id: 'builtin-strum-syncopation',
    name: 'Syncopation',
    timeSignature: '4/4',
    notation: '4(>), 8, 8(>)-8, 8, 4',
  },
  {
    id: 'builtin-strum-three-four',
    name: '3/4 time',
    timeSignature: '3/4',
    notation: '4(>), 4, 4',
  },
  {
    id: 'builtin-strum-twelve-eight',
    name: 'Shuffle',
    timeSignature: '12/8',
    notation: '8, 8(r), 8, 8(>), 8(r), 8, 8, 8(r), 8, 8(>), 8(r), 8',
  },
];

const ALLOWED_NOTE_VALUES = new Set([2, 4, 8, 16]);
const BEAT_EPSILON = 0.0001;
/** コード変更境界の排他比較用（拍単位） */
export const STRUM_CHORD_LOOKUP_EPSILON = 1e-4;
const TOKEN_PART_PATTERN = /^(\d+)(\(>\))?$/;
const REST_TOKEN_PART_PATTERN = /^(\d+)\(r\)$/;

function beatsForNoteValue(noteValue: number): number {
  return 4 / noteValue;
}

export function normalizeStrumPatternDef(def: StrumPatternDef): StrumPatternDef {
  return {
    ...def,
    timeSignature: def.timeSignature?.trim() || DEFAULT_TIME_SIGNATURE,
    notation: def.notation.trim(),
  };
}

/** 拍子文字列をパースする */
export function parseTimeSignature(value: string): ParsedTimeSignature | null {
  const match = value.trim().match(/^(\d+)\/(\d+)$/);
  if (!match) {
    return null;
  }
  const beats = Number(match[1]);
  const beatUnit = Number(match[2]);
  if (beats < 1 || beats > 32 || !ALLOWED_NOTE_VALUES.has(beatUnit)) {
    return null;
  }
  return {
    beats,
    beatUnit,
    label: `${beats}/${beatUnit}`,
  };
}

export function measureQuarterBeats(timeSignature: ParsedTimeSignature): number {
  return timeSignature.beats * beatsForNoteValue(timeSignature.beatUnit);
}

function parseNoteTokenPart(
  part: string,
): { noteValue: number; accent: boolean } | null {
  const match = part.match(TOKEN_PART_PATTERN);
  if (!match) {
    return null;
  }
  const noteValue = Number(match[1]);
  if (!ALLOWED_NOTE_VALUES.has(noteValue)) {
    return null;
  }
  return { noteValue, accent: match[2] === '(>)' };
}

function parseRestTokenPart(part: string): number | null {
  const match = part.match(REST_TOKEN_PART_PATTERN);
  if (!match) {
    return null;
  }
  const noteValue = Number(match[1]);
  if (!ALLOWED_NOTE_VALUES.has(noteValue)) {
    return null;
  }
  return noteValue;
}

export function strumHitGain(accent: boolean): number {
  return accent ? STRUM_ACCENT_GAIN : STRUM_NORMAL_GAIN;
}

/** パターン文字列を 1 小節分のストローク位置に変換する */
export function parseStrumPatternNotation(
  notation: string,
  timeSignature = DEFAULT_TIME_SIGNATURE,
): ParsedStrumPattern | null {
  const parsedTimeSignature = parseTimeSignature(timeSignature);
  if (!parsedTimeSignature) {
    return null;
  }

  const tokens = notation
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  const measureBeats = measureQuarterBeats(parsedTimeSignature);
  const hits: StrumPatternHit[] = [];
  let position = 0;

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex];
    const restNoteValue = parseRestTokenPart(token);
    if (restNoteValue !== null) {
      position += beatsForNoteValue(restNoteValue);
      continue;
    }

    const parts = token.split('-').map((part) => part.trim());
    const parsedParts = parts.map((part) => parseNoteTokenPart(part));
    if (parsedParts.some((part) => part === null)) {
      return null;
    }

    const noteValues = parsedParts.map((part) => part!.noteValue);
    const firstValue = noteValues[0];
    if (noteValues.some((value) => value !== firstValue)) {
      return null;
    }

    const hitOffset = position;
    const isTieToken = parts.length > 1;
    const tieDuration = beatsForNoteValue(firstValue) * noteValues.length;
    hits.push({
      offsetBeats: hitOffset,
      chordLookupBeats: hitOffset,
      tieGroupEndBeats: isTieToken ? hitOffset + tieDuration : undefined,
      accent: parsedParts[0]!.accent,
    });

    if (isTieToken && hits.length >= 2) {
      const prevToken = tokens[tokenIndex - 1];
      const prevRest = parseRestTokenPart(prevToken);
      if (prevRest === null) {
        const prevParts = prevToken.split('-').map((part) => part.trim());
        const prevParsed = prevParts.map((part) => parseNoteTokenPart(part));
        if (!prevParsed.some((part) => part === null)) {
          const prevFirstValue = prevParsed[0]!.noteValue;
          if (prevFirstValue === firstValue) {
            const prevHit = hits[hits.length - 2];
            const prevDuration =
              beatsForNoteValue(prevFirstValue) * prevParts.length;
            if (
              Math.abs(prevHit.offsetBeats + prevDuration - hitOffset) <
              BEAT_EPSILON
            ) {
              prevHit.chordLookupBeats =
                prevHit.offsetBeats - STRUM_CHORD_LOOKUP_EPSILON;
            }
          }
        }
      }
    }

    position += beatsForNoteValue(firstValue) * noteValues.length;
  }

  if (Math.abs(position - measureBeats) > BEAT_EPSILON) {
    return null;
  }

  return {
    hits,
    measureBeats,
    timeSignature: parsedTimeSignature.label,
  };
}

export function parseStrumPatternDef(
  def: Pick<StrumPatternDef, 'notation' | 'timeSignature'>,
): ParsedStrumPattern | null {
  const normalized = normalizeStrumPatternDef({
    id: '',
    name: '',
    timeSignature: def.timeSignature ?? DEFAULT_TIME_SIGNATURE,
    notation: def.notation,
  });
  return parseStrumPatternNotation(
    normalized.notation,
    normalized.timeSignature,
  );
}
