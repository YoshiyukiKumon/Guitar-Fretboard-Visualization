import '@fontsource/noto-music/400.css';
import './styles/main.css';
import { diatonicRepeatButtonId, tonePlayer } from './audio/tone-player';
import { remapChordKeyIdForScaleKey } from './domain/chord-root-options';
import { findKeyById } from './domain/data/keys';
import { findChordById } from './domain/data/chords';
import {
  loadSettings,
  sanitizeMusicSelectionIds,
  saveSettings,
} from './app/storage';
import type { AppSettings } from './app/storage';
import { setLocale, t } from './i18n';
import { renderApp } from './ui/app-shell';
import type { LibraryViewState } from './ui/library-view';
import { setLibraryMobileDetail } from './ui/library-list-editor';
import { duplicateSongAsCustom } from './domain/music-library/song-crud';
import { getSongSource } from './domain/song/song-registry';

const appRootEl = document.querySelector('#app');
if (!(appRootEl instanceof HTMLDivElement)) {
  throw new Error('#app not found');
}
const appRoot = appRootEl;

let settings = loadSettings();
setLocale(settings.locale);
applyDocumentLocale(settings.locale);
let libraryState: LibraryViewState = {
  tab: 'scale',
  selectedScaleId: null,
  selectedChordId: null,
  selectedStrumPatternId: null,
};

tonePlayer.setVolume(settings.volume);
tonePlayer.setPlaybackInstrument(settings.instrumentId);
tonePlayer.setRepeatInstrument(settings.repeatInstrumentId);
tonePlayer.setBpm(settings.bpm);
tonePlayer.setStrumPatternId(settings.strumPatternId);

function installAudioUnlock(): void {
  const unlock = (): void => {
    tonePlayer.unlockFromUserGesture();
  };
  document.addEventListener('touchstart', unlock, { passive: true, capture: true });
  document.addEventListener('pointerdown', unlock, { capture: true });
}

function installAudioLifecycle(): void {
  installAudioUnlock();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tonePlayer.markNeedsGestureReunlock();
    }
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      tonePlayer.markNeedsGestureReunlock();
    }
  });
}

installAudioLifecycle();

function applyDocumentLocale(locale: AppSettings['locale']): void {
  document.documentElement.lang = locale;
  document.title = t('app.title');
}

function applySanitizedMusicIds(): void {
  const next = sanitizeMusicSelectionIds(settings);
  settings = { ...settings, ...next };
}

function refresh(partial?: Partial<AppSettings>): void {
  if (partial) {
    settings = { ...settings, ...partial };
  }
  if (partial?.volume !== undefined) {
    tonePlayer.setVolume(settings.volume);
  }
  if (partial?.instrumentId !== undefined) {
    tonePlayer.setPlaybackInstrument(settings.instrumentId);
  }
  if (partial?.repeatInstrumentId !== undefined) {
    tonePlayer.setRepeatInstrument(settings.repeatInstrumentId);
  }
  if (partial?.bpm !== undefined) {
    tonePlayer.setBpm(settings.bpm);
  }
  if (partial?.strumPatternId !== undefined) {
    tonePlayer.setStrumPatternId(settings.strumPatternId);
  }
  renderApp(appRoot, settings, {
    libraryState,
    onLibraryStateChange: (state) => {
      libraryState = state;
      refresh();
    },
    onLibraryChanged: () => {
      applySanitizedMusicIds();
      saveSettings(settings);
      refresh();
    },
    onAppModeChange: (appMode) => {
      saveSettings({ ...settings, appMode });
      refresh({ appMode });
    },
    onLocaleChange: (locale) => {
      setLocale(locale);
      applyDocumentLocale(locale);
      saveSettings({ ...settings, locale });
      refresh({ locale });
    },
    onViewModeChange: (viewMode) => {
      saveSettings({ ...settings, viewMode });
      refresh({ viewMode });
    },
    onLabelModeChange: (labelMode) => {
      saveSettings({ ...settings, labelMode });
      refresh({ labelMode });
    },
    onScaleKeyChange: (scaleKeyId) => {
      const scaleKey = findKeyById(scaleKeyId);
      const chordKeyId =
        scaleKey !== undefined
          ? remapChordKeyIdForScaleKey(settings.chordKeyId, scaleKey)
          : settings.chordKeyId;
      saveSettings({ ...settings, scaleKeyId, chordKeyId });
      refresh({ scaleKeyId, chordKeyId });
    },
    onScaleChange: (scaleId) => {
      saveSettings({ ...settings, scaleId });
      refresh({ scaleId });
    },
    onChordKeyChange: (chordKeyId) => {
      saveSettings({ ...settings, chordKeyId });
      refresh({ chordKeyId });
    },
    onChordChange: (chordId) => {
      saveSettings({ ...settings, chordId });
      refresh({ chordId });
    },
    onDiatonicChordApply: (chordKeyId, chordId) => {
      saveSettings({ ...settings, chordKeyId, chordId });
      refresh({ chordKeyId, chordId });
    },
    onDiatonicChordPlay: (payload) => {
      const chordKey = findKeyById(payload.chordKeyId);
      if (chordKey === undefined) {
        return;
      }
      if (payload.chordId !== null) {
        const chord = findChordById(payload.chordId);
        if (chord === undefined) {
          return;
        }
        void tonePlayer.playChord(chordKey, chord);
        return;
      }
      if (payload.playbackSemitones.length > 0) {
        void tonePlayer.playChordSemitonesFromRoot(
          chordKey,
          payload.playbackSemitones,
        );
      }
    },
    onDiatonicChordRepeatPlay: (payload) => {
      const chordKey = findKeyById(payload.chordKeyId);
      if (chordKey === undefined) {
        return;
      }
      const buttonId = diatonicRepeatButtonId(payload.degree);
      if (payload.chordId !== null) {
        const chord = findChordById(payload.chordId);
        if (chord === undefined) {
          return;
        }
        void tonePlayer.playChordRepeat(chordKey, chord, buttonId);
        return;
      }
      if (payload.playbackSemitones.length > 0) {
        void tonePlayer.playChordRepeatSemitonesFromRoot(
          chordKey,
          payload.playbackSemitones,
          buttonId,
        );
      }
    },
    onVolumeChange: (volume) => {
      settings = { ...settings, volume };
      tonePlayer.setVolume(volume);
      saveSettings(settings);
    },
    onBpmChange: (bpm) => {
      settings = { ...settings, bpm };
      tonePlayer.setBpm(bpm);
      saveSettings(settings);
    },
    onStrumPatternChange: (strumPatternId) => {
      settings = { ...settings, strumPatternId };
      tonePlayer.setStrumPatternId(strumPatternId);
      saveSettings(settings);
    },
    onPlaybackInstrumentChange: (instrumentId) => {
      saveSettings({ ...settings, instrumentId });
      refresh({ instrumentId });
    },
    onRepeatInstrumentChange: (repeatInstrumentId) => {
      saveSettings({ ...settings, repeatInstrumentId });
      refresh({ repeatInstrumentId });
    },
    onSongIdChange: (songId) => {
      saveSettings({ ...settings, songId });
      refresh({ songId });
    },
    onEditSongInLibrary: (songId) => {
      if (getSongSource(songId) === 'builtin') {
        const result = duplicateSongAsCustom(songId);
        libraryState = {
          ...libraryState,
          tab: 'song',
          selectedSongId: '__new__',
          draftSong: result?.song ?? null,
          draftSongBlocks: result?.blocks ?? null,
        };
      } else {
        libraryState = {
          ...libraryState,
          tab: 'song',
          selectedSongId: songId,
          draftSong: null,
        };
      }
      setLibraryMobileDetail('song', true);
      saveSettings({ ...settings, appMode: 'library' });
      refresh({ appMode: 'library' });
    },
  });
}

applySanitizedMusicIds();
refresh();
saveSettings(settings);
