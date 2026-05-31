import { t } from '../../i18n';
import type { SongMeasure, SongMeasureMarkers } from './song-types';

/** 小節編集 UI のトグルボタン順（全記号） */
export const SONG_MARKER_UI_KEYS: (keyof SongMeasureMarkers)[] = [
  'repeatStart',
  'repeatEnd',
  'firstEnding',
  'secondEnding',
  'thirdEnding',
  'segno',
  'fine',
  'coda',
  'toCoda',
  'daCapoAlFine',
  'dalSegnoAlFine',
  'daCapoAlCoda',
  'dalSegnoAlCoda',
];

/** @deprecated SONG_MARKER_UI_KEYS を使用 */
export const SONG_MARKER_QUICK_KEYS = SONG_MARKER_UI_KEYS;

export const SONG_MARKER_KEYS: (keyof SongMeasureMarkers)[] = [
  ...SONG_MARKER_UI_KEYS,
];

/** Noto Music フォントで描画する Unicode 楽譜記号 */
export const SONG_MARKER_MUSIC_FONT_KEYS: ReadonlySet<
  keyof SongMeasureMarkers
> = new Set(['segno']);

/** 小節線の手前（左側）に表示する記号 */
export const SONG_MARKER_BEFORE_MEASURE_KEYS: (keyof SongMeasureMarkers)[] = [
  'repeatStart',
  'firstEnding',
  'secondEnding',
  'thirdEnding',
  'segno',
  'coda',
];

/** 小節線の後（右側）に表示する記号 */
export const SONG_MARKER_AFTER_MEASURE_KEYS: (keyof SongMeasureMarkers)[] = [
  'repeatEnd',
  'fine',
  'toCoda',
  'daCapoAlFine',
  'dalSegnoAlFine',
  'daCapoAlCoda',
  'dalSegnoAlCoda',
];

export function songMarkerUsesMusicFont(
  key: keyof SongMeasureMarkers,
): boolean {
  return SONG_MARKER_MUSIC_FONT_KEYS.has(key);
}

export function songMarkerLabel(key: keyof SongMeasureMarkers): string {
  return t(`library.song.marker.${key}`);
}

export function formatActiveMarkerLabels(
  markers: SongMeasureMarkers | undefined,
): string {
  if (!markers) {
    return '';
  }
  return SONG_MARKER_KEYS.filter((key) => markers[key])
    .map((key) => songMarkerLabel(key))
    .join(', ');
}

export function createDefaultSongMeasure(): SongMeasure {
  return {
    events: [{ offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' }],
  };
}
