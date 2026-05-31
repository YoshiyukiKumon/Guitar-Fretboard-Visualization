import type {
  SongBlockDef,
  SongChordEvent,
  SongDef,
  SongMeasure,
  SongMeasureMarkers,
  SongPart,
} from './song-types';

const MEASURE_SEP = '||';
const MARKER_SEP = '+';
const EVENT_SEP = '+';
const EMPTY_FIELD = '_';

interface SplitMeasureFields {
  keyRaw: string;
  tsRaw: string;
  strumRaw: string | null;
  markersRaw: string;
  eventsRaw: string;
}

function splitMeasureFields(raw: string): SplitMeasureFields {
  const pipeIndices: number[] = [];
  let searchFrom = 0;
  for (let n = 0; n < 4; n++) {
    const idx = raw.indexOf('|', searchFrom);
    if (idx < 0) {
      break;
    }
    pipeIndices.push(idx);
    searchFrom = idx + 1;
  }

  if (pipeIndices.length === 0) {
    return {
      keyRaw: raw,
      tsRaw: '',
      strumRaw: null,
      markersRaw: '',
      eventsRaw: '',
    };
  }
  if (pipeIndices.length === 1) {
    return {
      keyRaw: raw.slice(0, pipeIndices[0]),
      tsRaw: raw.slice(pipeIndices[0] + 1),
      strumRaw: null,
      markersRaw: '',
      eventsRaw: '',
    };
  }
  if (pipeIndices.length === 2) {
    return {
      keyRaw: raw.slice(0, pipeIndices[0]),
      tsRaw: raw.slice(pipeIndices[0] + 1, pipeIndices[1]),
      strumRaw: null,
      markersRaw: raw.slice(pipeIndices[1] + 1),
      eventsRaw: '',
    };
  }
  if (pipeIndices.length === 3) {
    return {
      keyRaw: raw.slice(0, pipeIndices[0]),
      tsRaw: raw.slice(pipeIndices[0] + 1, pipeIndices[1]),
      strumRaw: null,
      markersRaw: raw.slice(pipeIndices[1] + 1, pipeIndices[2]),
      eventsRaw: raw.slice(pipeIndices[2] + 1),
    };
  }

  return {
    keyRaw: raw.slice(0, pipeIndices[0]),
    tsRaw: raw.slice(pipeIndices[0] + 1, pipeIndices[1]),
    strumRaw: raw.slice(pipeIndices[1] + 1, pipeIndices[2]),
    markersRaw: raw.slice(pipeIndices[2] + 1, pipeIndices[3]),
    eventsRaw: raw.slice(pipeIndices[3] + 1),
  };
}

function decodeOptionalField(raw: string): string | undefined {
  const value = raw.trim();
  if (!value || value === EMPTY_FIELD) {
    return undefined;
  }
  return value;
}

const MARKER_FIELD_NAMES = [
  'repeatStart',
  'repeatEnd',
  'segno',
  'fine',
  'coda',
  'toCoda',
  'firstEnding',
  'secondEnding',
  'thirdEnding',
  'daCapoAlFine',
  'dalSegnoAlFine',
  'daCapoAlCoda',
  'dalSegnoAlCoda',
] as const satisfies readonly (keyof SongMeasureMarkers)[];

export function encodeMeasureEvents(events: readonly SongChordEvent[]): string {
  return events
    .map((event) => `${event.offsetBeats}/${event.chordRootKeyId}/${event.chordId}`)
    .join(EVENT_SEP);
}

export function decodeMeasureEvents(raw: string): SongChordEvent[] {
  if (!raw.trim()) {
    return [];
  }
  return raw.split(EVENT_SEP).map((token) => {
    const [offsetRaw, chordRootKeyId, chordId] = token.split('/');
    return {
      offsetBeats: Number(offsetRaw),
      chordRootKeyId: chordRootKeyId ?? 'C',
      chordId: chordId ?? 'major-triad',
    };
  });
}

export function encodeMeasureMarkers(
  markers: SongMeasureMarkers | undefined,
): string {
  if (!markers) {
    return '';
  }
  return MARKER_FIELD_NAMES.filter((key) => markers[key]).join(MARKER_SEP);
}

export function decodeMeasureMarkers(raw: string): SongMeasureMarkers | undefined {
  if (!raw.trim()) {
    return undefined;
  }
  const markers: SongMeasureMarkers = {};
  for (const name of raw.split(MARKER_SEP).map((part) => part.trim())) {
    if (
      MARKER_FIELD_NAMES.includes(name as (typeof MARKER_FIELD_NAMES)[number])
    ) {
      markers[name as keyof SongMeasureMarkers] = true;
    }
  }
  return Object.keys(markers).length > 0 ? markers : undefined;
}

export function encodeSongMeasure(measure: SongMeasure): string {
  const key = measure.keyId?.trim() || EMPTY_FIELD;
  const timeSig = measure.timeSignature?.trim() || EMPTY_FIELD;
  const strum = measure.strumPatternId?.trim() || EMPTY_FIELD;
  const markers = encodeMeasureMarkers(measure.markers) || EMPTY_FIELD;
  const events = encodeMeasureEvents(measure.events) || EMPTY_FIELD;
  return `${key}|${timeSig}|${strum}|${markers}|${events}`;
}

export function decodeSongMeasure(raw: string): SongMeasure {
  const { keyRaw, tsRaw, strumRaw, markersRaw, eventsRaw } =
    splitMeasureFields(raw);
  const keyId = decodeOptionalField(keyRaw);
  const timeSignature = decodeOptionalField(tsRaw);
  const strumPatternId =
    strumRaw === null ? undefined : decodeOptionalField(strumRaw);
  const markers = decodeMeasureMarkers(
    markersRaw === EMPTY_FIELD ? '' : markersRaw,
  );
  const events = decodeMeasureEvents(
    eventsRaw === EMPTY_FIELD ? '' : eventsRaw,
  );
  return {
    keyId,
    timeSignature,
    strumPatternId,
    markers,
    events,
  };
}

export function encodeSongMeasures(measures: readonly SongMeasure[]): string {
  return measures.map(encodeSongMeasure).join(MEASURE_SEP);
}

export function decodeSongMeasures(raw: string): SongMeasure[] {
  if (!raw.trim()) {
    return [];
  }
  return raw.split(MEASURE_SEP).map(decodeSongMeasure);
}

export function encodeSongPart(part: SongPart): string {
  if (part.type === 'block') {
    return part.reference
      ? `blockRef:${part.blockId}`
      : `block:${part.blockId}`;
  }
  return `inline:${encodeSongMeasures(part.measures)}`;
}

export function decodeSongPart(raw: string): SongPart | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('blockRef:')) {
    return {
      type: 'block',
      blockId: trimmed.slice('blockRef:'.length).trim(),
      reference: true,
    };
  }
  if (trimmed.startsWith('block:')) {
    return { type: 'block', blockId: trimmed.slice('block:'.length).trim() };
  }
  if (trimmed.startsWith('inline:')) {
    return {
      type: 'inline',
      measures: decodeSongMeasures(trimmed.slice('inline:'.length)),
    };
  }
  return null;
}

export function encodeSongPayload(song: SongDef): string {
  const metaParts = [
    `defaultKeyId=${song.defaultKeyId}`,
    `defaultTimeSignature=${song.defaultTimeSignature}`,
    `strumPatternId=${song.strumPatternId}`,
    `playCount=${song.playCount}`,
  ];
  if (song.bpm !== undefined) {
    metaParts.push(`bpm=${song.bpm}`);
  }
  const parts = song.parts.map(encodeSongPart).join(MEASURE_SEP);
  return `${metaParts.join(',')}::${parts}`;
}

export function decodeSongPayload(payload: string): Omit<SongDef, 'id' | 'name'> {
  const sepIndex = payload.indexOf('::');
  const metaRaw = sepIndex >= 0 ? payload.slice(0, sepIndex) : payload;
  const partsRaw = sepIndex >= 0 ? payload.slice(sepIndex + 2) : '';

  const meta: Record<string, string> = {};
  for (const pair of metaRaw.split(',')) {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      meta[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }

  const parts: SongPart[] = [];
  if (partsRaw.trim()) {
    for (const token of partsRaw.split(MEASURE_SEP)) {
      const part = decodeSongPart(token);
      if (part) {
        parts.push(part);
      }
    }
  }

  const bpmRaw = meta.bpm;
  const bpm =
    bpmRaw !== undefined && bpmRaw !== '' ? Number(bpmRaw) : undefined;

  return {
    defaultKeyId: meta.defaultKeyId ?? 'C',
    defaultTimeSignature: meta.defaultTimeSignature ?? '4/4',
    strumPatternId: meta.strumPatternId ?? 'builtin-strum-syncopation',
    playCount: Number(meta.playCount ?? '1'),
    bpm: Number.isFinite(bpm) ? bpm : undefined,
    parts,
  };
}

export function encodeSongBlockPayload(block: SongBlockDef): string {
  return encodeSongMeasures(block.measures);
}

export function decodeSongBlockPayload(payload: string): SongMeasure[] {
  return decodeSongMeasures(payload);
}
