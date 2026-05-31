import { tonePlayer, type SongPlaybackPosition } from '../audio/tone-player';
import { buildFretboard } from '../domain/fretboard';
import { findChordById, MVP_CHORD } from '../domain/data/chords';
import { findKeyById, MVP_KEY } from '../domain/data/keys';
import { findScaleById, MVP_SCALE } from '../domain/data/scales';
import { clampBpm, DEFAULT_BPM, MAX_BPM, MIN_BPM } from '../domain/playback-bpm';
import {
  clampSongTranspose,
  formatSongTransposeLabel,
  MAX_SONG_TRANSPOSE,
  MIN_SONG_TRANSPOSE,
  transposeSongKeyId,
} from '../domain/song/song-transpose';
import {
  buildSongChartPreviewMeasures,
  expandSongMeasures,
  playbackLoopCountForExpandedMeasures,
} from '../domain/song/expand-song-measures';
import {
  buildPartEndSourceIndices,
  buildPartStartPartIndices,
} from '../domain/song/flatten-song-parts';
import {
  getAllSongBlocks,
  getSongById,
  getSongSource,
  listSongs,
} from '../domain/song/song-registry';
import { listStrumPatterns } from '../domain/music-library/registry';
import type { AppSettings } from '../app/storage';
import {
  FRETBOARD_VIEW_MODES,
  type FretboardViewMode,
} from '../domain/fretboard-view-mode';
import {
  LABEL_DISPLAY_MODES,
  type LabelDisplayMode,
} from '../domain/label-display-mode';
import {
  getLabelModeLabels,
  getViewModeLabels,
  t,
} from '../i18n';
import {
  createPlaybackToolbarField,
  createPlaybackToolbarPlayButton,
} from './playback-toolbar';
import { createSegmentSwitcher } from './segment-switcher';
import { renderFretboard } from './fretboard-view';
import {
  createSongChartView,
  formatSongChordLabel,
  updateSongChartActiveState,
} from './song-chart-view';
import { playSongSection, syncSectionPlayButtonsIn } from './song-section-play';

export interface SongViewCallbacks {
  onSongIdChange: (songId: string) => void;
  onBpmChange: (bpm: number) => void;
  onStrumPatternChange: (strumPatternId: string) => void;
  onViewModeChange: (mode: FretboardViewMode) => void;
  onLabelModeChange: (mode: LabelDisplayMode) => void;
  onEditSongInLibrary: (songId: string) => void;
}

const SESSION_PLAY_COUNT_OPTIONS = [1, 2, 3, 4, 5, 0] as const;

function playCountOptionLabel(count: number): string {
  if (count === 0) {
    return t('song.playCountInfinite');
  }
  return t('song.playCountTimes', { count: String(count) });
}

export function createSongView(
  settings: AppSettings,
  callbacks: SongViewCallbacks,
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'song-view';
  root.setAttribute('aria-label', t('song.ariaLabel'));

  let activePosition: SongPlaybackPosition | null = null;
  let sessionBpm = settings.bpm;
  let sessionStrumPatternId = settings.strumPatternId;

  const song = getSongById(settings.songId) ?? listSongs()[0]?.def;
  const songId = song?.id ?? '';
  const blocks = getAllSongBlocks();
  let sessionPlayCount = song?.playCount ?? 1;
  let sessionTranspose = 0;

  function getChartMeasures() {
    return song ? buildSongChartPreviewMeasures(song, blocks) : [];
  }

  function getPlaybackMeasures() {
    return song ? expandSongMeasures(song, blocks, sessionPlayCount) : [];
  }

  let chartMeasures = getChartMeasures();
  let playbackMeasures = getPlaybackMeasures();

  const toolbar = document.createElement('div');
  toolbar.className = 'playback-toolbar playback-toolbar--song';

  const songSelect = document.createElement('select');
  songSelect.className = 'playback-toolbar__select playback-toolbar__select--wide';
  songSelect.setAttribute('aria-label', t('song.selectAria'));
  for (const item of listSongs()) {
    const option = document.createElement('option');
    option.value = item.def.id;
    option.textContent = item.def.name;
    option.selected = item.def.id === songId;
    songSelect.appendChild(option);
  }
  songSelect.addEventListener('change', () => {
    callbacks.onSongIdChange(songSelect.value);
  });
  toolbar.appendChild(
    createPlaybackToolbarField(
      t('library.tabs.song'),
      songSelect,
      'playback-toolbar__field--song-row',
    ),
  );

  const bpmInput = document.createElement('input');
  bpmInput.type = 'number';
  bpmInput.min = String(MIN_BPM);
  bpmInput.max = String(MAX_BPM);
  bpmInput.step = '1';
  bpmInput.className = 'playback-toolbar__input playback-toolbar__input--compact';
  bpmInput.setAttribute('aria-label', t('song.bpmAria'));
  bpmInput.value = String(song?.bpm ?? sessionBpm ?? DEFAULT_BPM);
  bpmInput.addEventListener('change', () => {
    sessionBpm = clampBpm(Number(bpmInput.value));
    bpmInput.value = String(sessionBpm);
    callbacks.onBpmChange(sessionBpm);
  });
  bpmInput.addEventListener('blur', () => {
    sessionBpm = clampBpm(Number(bpmInput.value));
    bpmInput.value = String(sessionBpm);
    callbacks.onBpmChange(sessionBpm);
  });
  toolbar.appendChild(
    createPlaybackToolbarField(
      'BPM',
      bpmInput,
      'playback-toolbar__field--compact',
    ),
  );

  const strumSelect = document.createElement('select');
  strumSelect.className = 'playback-toolbar__select';
  strumSelect.setAttribute('aria-label', t('song.strumAria'));
  const initialStrumId = song?.strumPatternId ?? sessionStrumPatternId;
  for (const item of listStrumPatterns()) {
    const option = document.createElement('option');
    option.value = item.def.id;
    option.textContent = item.def.name;
    option.selected = item.def.id === initialStrumId;
    strumSelect.appendChild(option);
  }
  strumSelect.addEventListener('change', () => {
    sessionStrumPatternId = strumSelect.value;
    callbacks.onStrumPatternChange(sessionStrumPatternId);
  });
  toolbar.appendChild(
    createPlaybackToolbarField(t('tone.rhythm'), strumSelect),
  );

  const playCountSelect = document.createElement('select');
  playCountSelect.className =
    'playback-toolbar__select playback-toolbar__select--compact';
  playCountSelect.setAttribute('aria-label', t('song.playCountAria'));
  for (const count of SESSION_PLAY_COUNT_OPTIONS) {
    const option = document.createElement('option');
    option.value = String(count);
    option.textContent = playCountOptionLabel(count);
    option.selected = count === sessionPlayCount;
    playCountSelect.appendChild(option);
  }
  playCountSelect.addEventListener('change', () => {
    sessionPlayCount = Math.max(0, Math.floor(Number(playCountSelect.value)));
    playbackMeasures = getPlaybackMeasures();
  });
  toolbar.appendChild(
    createPlaybackToolbarField(
      t('song.playCountLabel'),
      playCountSelect,
      'playback-toolbar__field--compact',
    ),
  );

  const transposeSelect = document.createElement('select');
  transposeSelect.className =
    'playback-toolbar__select playback-toolbar__select--compact';
  transposeSelect.setAttribute('aria-label', t('song.transposeAria'));
  for (let semitones = MIN_SONG_TRANSPOSE; semitones <= MAX_SONG_TRANSPOSE; semitones++) {
    const option = document.createElement('option');
    option.value = String(semitones);
    option.textContent = formatSongTransposeLabel(semitones);
    option.selected = semitones === sessionTranspose;
    transposeSelect.appendChild(option);
  }
  transposeSelect.addEventListener('change', () => {
    sessionTranspose = clampSongTranspose(Number(transposeSelect.value));
    transposeSelect.value = String(sessionTranspose);
    renderChartAndFretboard(true);
  });
  toolbar.appendChild(
    createPlaybackToolbarField(
      t('song.transposeLabel'),
      transposeSelect,
      'playback-toolbar__field--compact',
    ),
  );

  const playBtn = createPlaybackToolbarPlayButton();
  playBtn.addEventListener('click', () => {
    if (tonePlayer.isPlaybackActive('song:play')) {
      tonePlayer.stopRepeat();
      return;
    }
    if (!song) {
      return;
    }
    playbackMeasures = getPlaybackMeasures();
    void tonePlayer.playSong(
      playbackMeasures,
      sessionStrumPatternId,
      playbackLoopCountForExpandedMeasures(sessionPlayCount),
      clampBpm(Number(bpmInput.value)),
      { scope: 'full', transposeSemitones: sessionTranspose },
    );
  });
  toolbar.appendChild(playBtn);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className =
    'library-view__btn library-song__touch-target song-view__edit-btn';
  const refreshEditLabel = (): void => {
    const currentId = songSelect.value;
    const isBuiltin = getSongSource(currentId) === 'builtin';
    editBtn.textContent = isBuiltin
      ? t('song.duplicateToEdit')
      : t('song.editSong');
    editBtn.disabled = !currentId;
  };
  refreshEditLabel();
  songSelect.addEventListener('change', refreshEditLabel);
  editBtn.addEventListener('click', () => {
    const currentId = songSelect.value;
    if (!currentId) {
      return;
    }
    callbacks.onEditSongInLibrary(currentId);
  });
  toolbar.appendChild(editBtn);

  root.appendChild(toolbar);

  function syncPlaybackControls(): void {
    const playing = tonePlayer.isPlaybackActive('song:play');
    strumSelect.disabled = playing;
    playCountSelect.disabled = playing;
    transposeSelect.disabled = playing;
    playBtn.textContent = playing ? t('song.stop') : t('song.play');
    playBtn.setAttribute(
      'aria-label',
      playing ? t('song.stopAria') : t('song.playAria'),
    );
    playBtn.classList.toggle('playback-toolbar__play--active', playing);
  }

  syncPlaybackControls();

  const chartHost = document.createElement('div');
  chartHost.className = 'song-view__chart-host';
  root.appendChild(chartHost);

  const status = document.createElement('div');
  status.className = 'song-view__status';
  root.appendChild(status);

  const controls = document.createElement('div');
  controls.className = 'app-controls song-view__controls';
  controls.appendChild(
    createSegmentSwitcher({
      className: 'segment-switcher view-switcher',
      ariaLabel: t('view.ariaLabel'),
      modes: FRETBOARD_VIEW_MODES,
      labels: getViewModeLabels(),
      active: settings.viewMode,
      onChange: callbacks.onViewModeChange,
    }),
  );
  controls.appendChild(
    createSegmentSwitcher({
      className: 'segment-switcher label-switcher',
      ariaLabel: t('label.ariaLabel'),
      modes: LABEL_DISPLAY_MODES,
      labels: getLabelModeLabels(),
      buttonAriaLabels: { kana: t('label.kanaAria') },
      active: settings.labelMode,
      onChange: callbacks.onLabelModeChange,
    }),
  );
  root.appendChild(controls);

  const fretboardHost = document.createElement('div');
  fretboardHost.className = 'song-view__fretboard-host';
  root.appendChild(fretboardHost);

  let chartMeasureCount = -1;
  let chartTranspose = sessionTranspose + 1;

  function chartHighlightIndex(measurePlaybackIndex: number | null): number | null {
    if (measurePlaybackIndex === null || chartMeasures.length === 0) {
      return null;
    }
    const playbackMeasure = playbackMeasures[measurePlaybackIndex];
    if (!playbackMeasure) {
      return null;
    }
    const previewIndex = chartMeasures.findIndex(
      (measure) =>
        measure.sourceMeasureIndex === playbackMeasure.sourceMeasureIndex,
    );
    return previewIndex >= 0 ? previewIndex : null;
  }

  function renderChartAndFretboard(forceChartRebuild = false): void {
    const needsChartRebuild =
      forceChartRebuild ||
      chartHost.children.length === 0 ||
      chartMeasureCount !== chartMeasures.length ||
      chartTranspose !== sessionTranspose;

    if (needsChartRebuild) {
      chartMeasureCount = chartMeasures.length;
      chartTranspose = sessionTranspose;
      const partIndexBySource = song
        ? buildPartStartPartIndices(song, blocks)
        : new Map<number, number>();
      const partEndSourceIndices = song
        ? buildPartEndSourceIndices(song, blocks)
        : new Set<number>();

      chartHost.replaceChildren(
        createSongChartView(
          chartMeasures,
          chartHighlightIndex(activePosition?.measurePlaybackIndex ?? null),
          activePosition?.hitOffsetBeats ?? null,
          song
            ? {
                partIndexBySourceMeasure: partIndexBySource,
                partEndSourceIndices,
                transposeSemitones: sessionTranspose,
                onPartPlay: (partIndex) => {
                  playSongSection(
                    song,
                    blocks,
                    partIndex,
                    sessionStrumPatternId,
                    clampBpm(Number(bpmInput.value)),
                    sessionTranspose,
                  );
                },
              }
            : { transposeSemitones: sessionTranspose },
        ),
      );
    } else {
      const chart = chartHost.querySelector('.song-chart');
      if (chart instanceof HTMLElement) {
        updateSongChartActiveState(
          chart,
          chartMeasures,
          chartHighlightIndex(activePosition?.measurePlaybackIndex ?? null),
          activePosition?.hitOffsetBeats ?? null,
          sessionTranspose,
        );
      }
    }

    const event =
      activePosition && song
        ? {
            chordRootKeyId: transposeSongKeyId(
              activePosition.chordRootKeyId,
              sessionTranspose,
            ),
            chordId: activePosition.chordId,
          }
        : undefined;

    const fallbackEvent = chartMeasures[0]?.events[0];
    const chordKey = event
      ? findKeyById(event.chordRootKeyId)
      : fallbackEvent
        ? findKeyById(
            transposeSongKeyId(fallbackEvent.chordRootKeyId, sessionTranspose),
          )
        : findKeyById(
            transposeSongKeyId(song?.defaultKeyId ?? MVP_KEY.id, sessionTranspose),
          );
    const chord = event
      ? findChordById(event.chordId)
      : fallbackEvent
        ? findChordById(fallbackEvent.chordId)
        : MVP_CHORD;

    if (activePosition && event) {
      const beatDisplay = Math.floor(activePosition.hitOffsetBeats) + 1;
      status.textContent = t('song.nowPlaying', {
        measure: activePosition.measurePlaybackIndex + 1,
        beat: String(beatDisplay),
        total: playbackMeasures.length,
        chord: formatSongChordLabel(event.chordRootKeyId, event.chordId),
      });
    } else {
      status.textContent = t('song.ready', {
        total: playbackMeasures.length,
      });
    }

    const scaleKey = findKeyById(settings.scaleKeyId) ?? MVP_KEY;
    const scale = findScaleById(settings.scaleId) ?? MVP_SCALE;

    if (chordKey && chord) {
      const model = buildFretboard(scaleKey, scale, chordKey, chord);
      fretboardHost.replaceChildren(
        renderFretboard(model, settings.viewMode, settings.labelMode),
      );
    }
  }

  renderChartAndFretboard(true);

  const unsubPosition = tonePlayer.subscribeSongPosition((position) => {
    activePosition = position;
    renderChartAndFretboard();
  });

  const unsubPlayback = tonePlayer.subscribePlayback(() => {
    syncPlaybackControls();
    const chart = chartHost.querySelector('.song-chart');
    if (chart) {
      syncSectionPlayButtonsIn(chart);
    }
  });

  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      unsubPosition();
      unsubPlayback();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return root;
}
