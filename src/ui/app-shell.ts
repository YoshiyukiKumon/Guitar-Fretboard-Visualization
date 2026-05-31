import { buildFretboard } from '../domain/fretboard';
import { resolveMusicSelection } from '../domain/resolve-music-selection';
import {
  FRETBOARD_VIEW_MODES,
  type FretboardViewMode,
} from '../domain/fretboard-view-mode';
import {
  LABEL_DISPLAY_MODES,
  type LabelDisplayMode,
} from '../domain/label-display-mode';
import type { AppMode, AppSettings } from '../app/storage';
import {
  getAppModeLabels,
  getLabelModeLabels,
  getViewModeLabels,
  t,
} from '../i18n';
import { APP_MODE_ICONS } from '../i18n/nav-icons';
import type { AppLocale } from '../i18n/locale';
import { createTonePanel } from './tone-panel-view';
import {
  createLibraryView,
  type LibraryViewCallbacks,
  type LibraryViewState,
} from './library-view';
import { createMusicSelectors } from './music-selectors';
import { createSegmentSwitcher } from './segment-switcher';
import { createVolumeControl } from './volume-control';
import { renderFretboard } from './fretboard-view';
import { createDiatonicChordsPanel } from './diatonic-chords-panel';
import type { DiatonicChordPlayPayload } from '../domain/diatonic-chords';
import type { InstrumentId } from '../domain/settings/instrument-catalog';
import {
  createSettingsView,
  type SettingsViewCallbacks,
} from './settings-view';
import { createLanguageSwitcher } from './language-switcher';
import { createSongView } from './song-view';

const APP_MODES: AppMode[] = ['practice', 'library', 'song', 'settings'];

export interface AppRenderOptions {
  onAppModeChange: (mode: AppMode) => void;
  onLocaleChange: (locale: AppLocale) => void;
  onViewModeChange: (mode: FretboardViewMode) => void;
  onLabelModeChange: (mode: LabelDisplayMode) => void;
  onScaleKeyChange: (keyId: string) => void;
  onScaleChange: (scaleId: string) => void;
  onChordKeyChange: (keyId: string) => void;
  onChordChange: (chordId: string) => void;
  onDiatonicChordApply: (chordKeyId: string, chordId: string) => void;
  onDiatonicChordPlay: (payload: DiatonicChordPlayPayload) => void;
  onDiatonicChordRepeatPlay: (payload: DiatonicChordPlayPayload) => void;
  onVolumeChange: (volume: number) => void;
  onBpmChange: (bpm: number) => void;
  onStrumPatternChange: (strumPatternId: string) => void;
  onPlaybackInstrumentChange: (instrumentId: InstrumentId) => void;
  onRepeatInstrumentChange: (instrumentId: InstrumentId) => void;
  onSongIdChange: (songId: string) => void;
  onEditSongInLibrary: (songId: string) => void;
  libraryState: LibraryViewState;
  onLibraryStateChange: (state: LibraryViewState) => void;
  onLibraryChanged: () => void;
}

export function renderApp(
  root: HTMLElement,
  settings: AppSettings,
  options: AppRenderOptions,
): void {
  const music = resolveMusicSelection(settings);
  const model = buildFretboard(
    music.scaleKey,
    music.scale,
    music.chordKey,
    music.chord,
  );

  root.replaceChildren();

  const header = document.createElement('header');
  header.className = 'app-header';
  const title = document.createElement('h1');
  title.className = 'app-header__title';
  title.textContent = t('app.title');
  header.appendChild(title);

  const headerTools = document.createElement('div');
  headerTools.className = 'app-header__tools';
  headerTools.appendChild(
    createSegmentSwitcher({
      className: 'segment-switcher app-header__mode',
      ariaLabel: t('nav.ariaAppMode'),
      modes: APP_MODES,
      labels: getAppModeLabels(),
      icons: APP_MODE_ICONS,
      active: settings.appMode,
      onChange: options.onAppModeChange,
    }),
  );
  headerTools.appendChild(
    createLanguageSwitcher(settings.locale, options.onLocaleChange),
  );
  header.appendChild(headerTools);
  root.appendChild(header);

  if (settings.appMode === 'library') {
    const libraryCallbacks: LibraryViewCallbacks = {
      onStateChange: options.onLibraryStateChange,
      onLibraryChanged: options.onLibraryChanged,
    };
    root.appendChild(createLibraryView(options.libraryState, libraryCallbacks));
    return;
  }

  if (settings.appMode === 'settings') {
    const settingsCallbacks: SettingsViewCallbacks = {
      onPlaybackInstrumentChange: options.onPlaybackInstrumentChange,
      onRepeatInstrumentChange: options.onRepeatInstrumentChange,
      onVolumeChange: options.onVolumeChange,
    };
    root.appendChild(createSettingsView(settings, settingsCallbacks));
    return;
  }

  if (settings.appMode === 'song') {
    root.appendChild(
      createSongView(settings, {
        onSongIdChange: options.onSongIdChange,
        onBpmChange: options.onBpmChange,
        onStrumPatternChange: options.onStrumPatternChange,
        onViewModeChange: options.onViewModeChange,
        onLabelModeChange: options.onLabelModeChange,
        onEditSongInLibrary: options.onEditSongInLibrary,
      }),
    );
    return;
  }

  root.appendChild(
    createMusicSelectors(
      {
        scaleKeyId: settings.scaleKeyId,
        scaleId: settings.scaleId,
        chordKeyId: settings.chordKeyId,
        chordId: settings.chordId,
      },
      {
        onScaleKeyChange: options.onScaleKeyChange,
        onScaleChange: options.onScaleChange,
        onChordKeyChange: options.onChordKeyChange,
        onChordChange: options.onChordChange,
      },
    ),
  );

  const controls = document.createElement('div');
  controls.className = 'app-controls';
  controls.appendChild(
    createViewSwitcher(settings.viewMode, options.onViewModeChange),
  );

  const toolsRow = document.createElement('div');
  toolsRow.className = 'app-controls__tools';
  toolsRow.appendChild(
    createLabelModeSwitcher(settings.labelMode, options.onLabelModeChange),
  );
  toolsRow.appendChild(
    createVolumeControl(settings.volume, options.onVolumeChange),
  );
  controls.appendChild(toolsRow);
  root.appendChild(controls);

  root.appendChild(createLegend(settings.viewMode));
  root.appendChild(renderFretboard(model, settings.viewMode, settings.labelMode));

  root.appendChild(
    createTonePanel(model, {
      bpm: settings.bpm,
      strumPatternId: settings.strumPatternId,
      onBpmChange: options.onBpmChange,
      onStrumPatternChange: options.onStrumPatternChange,
    }),
  );
  root.appendChild(
    createDiatonicChordsPanel(model, {
      chordKeyId: settings.chordKeyId,
      chordId: settings.chordId,
      onApply: options.onDiatonicChordApply,
      onPlay: options.onDiatonicChordPlay,
      onRepeatPlay: options.onDiatonicChordRepeatPlay,
    }),
  );
}

function createViewSwitcher(
  activeMode: FretboardViewMode,
  onChange: (mode: FretboardViewMode) => void,
): HTMLElement {
  const nav = createSegmentSwitcher({
    className: 'segment-switcher view-switcher',
    ariaLabel: t('view.ariaLabel'),
    modes: FRETBOARD_VIEW_MODES,
    labels: getViewModeLabels(),
    active: activeMode,
    onChange,
  });

  const title = document.createElement('span');
  title.className = 'view-switcher__title';
  title.textContent = t('view.title');
  nav.prepend(title);
  return nav;
}

function createLabelModeSwitcher(
  activeMode: LabelDisplayMode,
  onChange: (mode: LabelDisplayMode) => void,
): HTMLElement {
  const nav = createSegmentSwitcher({
    className: 'segment-switcher label-switcher',
    ariaLabel: t('label.ariaLabel'),
    modes: LABEL_DISPLAY_MODES,
    labels: getLabelModeLabels(),
    buttonAriaLabels: { kana: t('label.kanaAria') },
    active: activeMode,
    onChange,
  });

  const title = document.createElement('span');
  title.className = 'label-switcher__title';
  title.textContent = t('label.title');
  nav.prepend(title);

  for (const btn of nav.querySelectorAll('.segment-switcher__btn')) {
    if (btn.textContent === '●') {
      btn.classList.add('segment-switcher__btn--dot-tab');
    }
  }

  return nav;
}

function createLegend(viewMode: FretboardViewMode): HTMLElement {
  const legend = document.createElement('div');
  legend.className = 'legend';

  if (
    viewMode === 'fretboard' ||
    viewMode === 'scale' ||
    viewMode === 'composite'
  ) {
    const scaleItem = document.createElement('span');
    scaleItem.className = 'legend__item';
    const scaleLabel =
      viewMode === 'fretboard' ? t('legend.scaleOther') : t('legend.scaleTone');
    scaleItem.innerHTML = `<span class="legend__capsule legend__capsule--scale">2 / 9</span>${scaleLabel}`;
    legend.appendChild(scaleItem);
  }

  if (viewMode === 'chord' || viewMode === 'composite') {
    const chordItem = document.createElement('span');
    chordItem.className = 'legend__item';
    chordItem.innerHTML = `<span class="legend__capsule legend__capsule--chord">3</span>${t('legend.chordTone')}`;
    legend.appendChild(chordItem);
  }

  if (
    viewMode === 'fretboard' ||
    viewMode === 'scale' ||
    viewMode === 'composite'
  ) {
    const scaleRootItem = document.createElement('span');
    scaleRootItem.className = 'legend__item';
    scaleRootItem.innerHTML = `<span class="legend__capsule legend__capsule--scale-root">R</span>${t('legend.scaleRoot')}`;
    legend.appendChild(scaleRootItem);
  }

  if (viewMode === 'chord' || viewMode === 'composite') {
    const chordRootItem = document.createElement('span');
    chordRootItem.className = 'legend__item';
    chordRootItem.innerHTML = `<span class="legend__capsule legend__capsule--chord-root">R</span>${t('legend.chordRoot')}`;
    legend.appendChild(chordRootItem);
  }

  if (viewMode !== 'fretboard') {
    const mutedItem = document.createElement('span');
    mutedItem.className = 'legend__item';
    mutedItem.innerHTML = `<span class="legend__capsule legend__capsule--muted" aria-hidden="true">—</span>${t('legend.other')}`;
    legend.appendChild(mutedItem);
  }

  return legend;
}
