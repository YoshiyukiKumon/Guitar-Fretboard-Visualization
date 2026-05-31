import { isChordId, MVP_CHORD } from '../domain/data/chords';
import { isKeyId, MVP_KEY, normalizeKeyId } from '../domain/data/keys';
import { isScaleId, MVP_SCALE } from '../domain/data/scales';
import {
  type FretboardViewMode,
  isFretboardViewMode,
} from '../domain/fretboard-view-mode';
import {
  type LabelDisplayMode,
  isLabelDisplayMode,
} from '../domain/label-display-mode';

import {
  DEFAULT_INSTRUMENT_ID,
  normalizeInstrumentId,
  type InstrumentId,
} from '../domain/settings/instrument-catalog';
import { clampBpm, DEFAULT_BPM } from '../domain/playback-bpm';
import {
  DEFAULT_STRUM_PATTERN_ID,
} from '../domain/strum-pattern/strum-pattern';
import { isKnownStrumPatternId } from '../domain/music-library/registry';
import { isKnownSongId } from '../domain/song/song-registry';
import { BUILTIN_SONGS } from '../domain/song/builtin-songs';
import {
  type AppLocale,
  normalizeLocale,
} from '../i18n/locale';

const STORAGE_KEY = 'guitar-practice-settings';

export type AppMode = 'practice' | 'library' | 'song' | 'settings';

export interface AppSettings {
  appMode: AppMode;
  /** ソングモードで選択中の曲 ID */
  songId: string;
  instrumentId: InstrumentId;
  /** コードリピート再生の楽器 ID */
  repeatInstrumentId: InstrumentId;
  viewMode: FretboardViewMode;
  labelMode: LabelDisplayMode;
  scaleKeyId: string;
  scaleId: string;
  chordKeyId: string;
  chordId: string;
  /** 再生音量 0〜100 */
  volume: number;
  /** 構成音パネル再生テンポ */
  bpm: number;
  /** リピート再生のストロークパターン ID */
  strumPatternId: string;
  /** 表示言語 */
  locale: AppLocale;
}

const DEFAULT_SONG_ID = BUILTIN_SONGS[0]?.id ?? 'builtin-song-ii-v-i-repeat';

const DEFAULT_SETTINGS: AppSettings = {
  appMode: 'practice',
  songId: DEFAULT_SONG_ID,
  instrumentId: DEFAULT_INSTRUMENT_ID,
  repeatInstrumentId: DEFAULT_INSTRUMENT_ID,
  viewMode: 'scale',
  labelMode: 'dot',
  scaleKeyId: MVP_KEY.id,
  scaleId: MVP_SCALE.id,
  chordKeyId: MVP_KEY.id,
  chordId: MVP_CHORD.id,
  volume: 80,
  bpm: DEFAULT_BPM,
  strumPatternId: DEFAULT_STRUM_PATTERN_ID,
  locale: 'ja',
};

function isAppMode(value: unknown): value is AppMode {
  return (
    value === 'practice' ||
    value === 'library' ||
    value === 'song' ||
    value === 'settings'
  );
}

export function sanitizeSongId(songId: string): string {
  return isKnownSongId(songId) ? songId : DEFAULT_SONG_ID;
}

export function sanitizeMusicSelectionIds(
  settings: Pick<AppSettings, 'scaleId' | 'chordId' | 'strumPatternId'>,
): Pick<AppSettings, 'scaleId' | 'chordId' | 'strumPatternId'> {
  return {
    scaleId: isScaleId(settings.scaleId) ? settings.scaleId : MVP_SCALE.id,
    chordId: isChordId(settings.chordId) ? settings.chordId : MVP_CHORD.id,
    strumPatternId: isKnownStrumPatternId(settings.strumPatternId)
      ? settings.strumPatternId
      : DEFAULT_STRUM_PATTERN_ID,
  };
}

function clampVolume(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_SETTINGS.volume;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings> & {
      keyId?: string;
      showScaleLegend?: boolean;
      showChordLegend?: boolean;
    };

    const legacyKeyId = normalizeKeyId(
      parsed.scaleKeyId && isKeyId(parsed.scaleKeyId)
        ? parsed.scaleKeyId
        : parsed.keyId && isKeyId(parsed.keyId)
          ? parsed.keyId
          : DEFAULT_SETTINGS.scaleKeyId,
    );

    const chordKeyId = normalizeKeyId(
      parsed.chordKeyId && isKeyId(parsed.chordKeyId)
        ? parsed.chordKeyId
        : parsed.keyId && isKeyId(parsed.keyId)
          ? parsed.keyId
          : DEFAULT_SETTINGS.chordKeyId,
    );

    const base: AppSettings = {
      appMode:
        parsed.appMode && isAppMode(parsed.appMode)
          ? parsed.appMode
          : DEFAULT_SETTINGS.appMode,
      songId: sanitizeSongId(
        typeof parsed.songId === 'string' ? parsed.songId : DEFAULT_SONG_ID,
      ),
      instrumentId: normalizeInstrumentId(parsed.instrumentId),
      repeatInstrumentId: normalizeInstrumentId(
        parsed.repeatInstrumentId ?? parsed.instrumentId,
      ),
      viewMode:
        parsed.viewMode && isFretboardViewMode(parsed.viewMode)
          ? parsed.viewMode
          : DEFAULT_SETTINGS.viewMode,
      labelMode:
        parsed.labelMode && isLabelDisplayMode(parsed.labelMode)
          ? parsed.labelMode
          : DEFAULT_SETTINGS.labelMode,
      scaleKeyId: legacyKeyId,
      scaleId:
        parsed.scaleId && isScaleId(parsed.scaleId)
          ? parsed.scaleId
          : DEFAULT_SETTINGS.scaleId,
      chordKeyId,
      chordId:
        parsed.chordId && isChordId(parsed.chordId)
          ? parsed.chordId
          : DEFAULT_SETTINGS.chordId,
      volume: clampVolume(parsed.volume),
      bpm: clampBpm(parsed.bpm),
      strumPatternId:
        typeof parsed.strumPatternId === 'string' &&
        isKnownStrumPatternId(parsed.strumPatternId)
          ? parsed.strumPatternId
          : DEFAULT_SETTINGS.strumPatternId,
      locale: normalizeLocale(parsed.locale),
    };
    return { ...base, ...sanitizeMusicSelectionIds(base) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
