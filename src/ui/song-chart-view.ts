import { findChordById } from '../domain/data/chords';
import { findKeyById } from '../domain/data/keys';
import { transposeSongKeyId } from '../domain/song/song-transpose';
import type { ExpandedMeasure } from '../domain/song/song-types';
import { activeChordEventAtBeat } from '../domain/song/measure-utils';
import {
  SONG_MARKER_AFTER_MEASURE_KEYS,
  SONG_MARKER_BEFORE_MEASURE_KEYS,
  songMarkerLabel,
  songMarkerUsesMusicFont,
} from '../domain/song/song-marker-labels';
import { t } from '../i18n';
import {
  appendMeasureGroupsToRows,
  resolveBalancedMeasuresPerRow,
  SECTION_PREVIEW_MEASURES_PER_ROW,
} from './song-chart-section-preview-layout';
import { createSectionPlayButton, syncSectionPlayButtonsIn } from './song-section-play';

export {
  SECTION_PREVIEW_MEASURES_PER_ROW,
} from './song-chart-section-preview-layout';
export {
  appendMeasureGroupsToRows,
  anySectionPreviewRowOverflows,
  measureRowWidthsFit,
  mountSectionPreviewChartReflow,
  reflowSectionPreviewChart,
  resolveBalancedMeasuresPerRow,
  resolveBalancedMeasuresPerRowWithRowCount,
  resolveMeasuresPerRowForWidth,
  unmountSectionPreviewChartReflow,
} from './song-chart-section-preview-layout';

export interface SongChartViewOptions {
  onPartPlay?: (partIndex: number) => void;
  partIndexBySourceMeasure?: ReadonlyMap<number, number>;
  /** 単一パートのプレビュー（セクション折りたたみ等） */
  singlePartPreview?: boolean;
  /** singlePartPreview 時、そのパートが曲の最後か */
  isLastPartInSong?: boolean;
  /** フル曲表示用。未指定時は measures から推定できないため呼び出し元で渡す */
  partEndSourceIndices?: ReadonlySet<number>;
  /** セクション折りたたみ進行プレビュー（小節単位・均等折り返し） */
  sectionPreviewLayout?: boolean;
  /** sectionPreviewLayout 時の 1 行あたり最大小節数 */
  maxMeasuresPerRow?: number;
  /** セッション移調（半音）。ソング画面の表示・再生用 */
  transposeSemitones?: number;
}

function appendChartBar(root: HTMLElement, text: '|' | '||'): void {
  const barEl = document.createElement('div');
  barEl.className = 'song-chart__bar';
  barEl.setAttribute('role', 'separator');
  barEl.setAttribute('aria-hidden', 'true');
  barEl.textContent = text;
  root.appendChild(barEl);
}

export function resolveTrailingPartBar(
  measures: readonly ExpandedMeasure[],
  measurePlaybackIndex: number,
  options?: SongChartViewOptions,
): '|' | '||' | null {
  const measure = measures[measurePlaybackIndex];
  if (!measure) {
    return null;
  }

  if (options?.singlePartPreview) {
    if (measurePlaybackIndex !== measures.length - 1) {
      return null;
    }
    return options.isLastPartInSong ? '||' : '|';
  }

  if (!options?.partEndSourceIndices?.has(measure.sourceMeasureIndex)) {
    return null;
  }

  return measurePlaybackIndex === measures.length - 1 ? '||' : '|';
}

export interface SongChartChip {
  measurePlaybackIndex: number;
  offsetBeats: number;
  durationBeats: number;
  label: string;
  shortLabel: string;
  tooltip: string;
  isActive: boolean;
}

export function formatSongChordLabel(
  chordRootKeyId: string,
  chordId: string,
  transposeSemitones = 0,
): string {
  const rootId =
    transposeSemitones !== 0
      ? transposeSongKeyId(chordRootKeyId, transposeSemitones)
      : chordRootKeyId;
  const chord = findChordById(chordId);
  const root = findKeyById(rootId);
  const rootName = root?.id ?? rootId;
  const chordName = chord?.name ?? chordId;
  return `${rootName}${chordName === 'major triad' ? '' : chordName}`;
}

function formatChipLabels(
  chordRootKeyId: string,
  chordId: string,
  transposeSemitones = 0,
): { label: string; shortLabel: string; tooltip: string } {
  const rootId =
    transposeSemitones !== 0
      ? transposeSongKeyId(chordRootKeyId, transposeSemitones)
      : chordRootKeyId;
  const full = formatSongChordLabel(chordRootKeyId, chordId, transposeSemitones);
  const chord = findChordById(chordId);
  const root = findKeyById(rootId);
  const rootName = root?.id ?? rootId;
  const chordName = chord?.name ?? chordId;
  const shortLabel =
    chordName === 'major triad' ? rootName : chordName;
  return { label: full, shortLabel, tooltip: full };
}

export function buildSongChartChips(
  measures: readonly ExpandedMeasure[],
  activeMeasureIndex: number | null,
  activeOffsetBeats: number | null,
  transposeSemitones = 0,
): SongChartChip[] {
  const chips: SongChartChip[] = [];

  for (let i = 0; i < measures.length; i++) {
    const measure = measures[i];
    const events = [...measure.events].sort(
      (a, b) => a.offsetBeats - b.offsetBeats,
    );
    if (events.length === 0) {
      chips.push({
        measurePlaybackIndex: i,
        offsetBeats: 0,
        durationBeats: measure.measureQuarterBeats,
        label: '—',
        shortLabel: '—',
        tooltip: '—',
        isActive: activeMeasureIndex === i,
      });
      continue;
    }

    for (let e = 0; e < events.length; e++) {
      const event = events[e];
      const nextOffset =
        e + 1 < events.length
          ? events[e + 1].offsetBeats
          : measure.measureQuarterBeats;
      const durationBeats = Math.max(0.25, nextOffset - event.offsetBeats);
      const isActive =
        activeMeasureIndex === i &&
        activeOffsetBeats !== null &&
        activeOffsetBeats >= event.offsetBeats &&
        activeOffsetBeats < nextOffset - 1e-6;
      const labels = formatChipLabels(
        event.chordRootKeyId,
        event.chordId,
        transposeSemitones,
      );
      chips.push({
        measurePlaybackIndex: i,
        offsetBeats: event.offsetBeats,
        durationBeats,
        label: labels.label,
        shortLabel: labels.shortLabel,
        tooltip: labels.tooltip,
        isActive,
      });
    }
  }

  return chips;
}

function formatPartLabel(partLabel: string): string {
  if (partLabel === 'inline') {
    return t('library.song.inlinePart');
  }
  return `[${partLabel}]`;
}

function appendMeasureMarkers(
  root: HTMLElement,
  markers: ExpandedMeasure['markers'],
  keys: readonly (keyof NonNullable<ExpandedMeasure['markers']>)[],
): void {
  if (!markers) {
    return;
  }
  for (const key of keys) {
    if (markers[key]) {
      const markerEl = document.createElement('div');
      markerEl.className = 'song-chart__marker';
      if (songMarkerUsesMusicFont(key)) {
        markerEl.classList.add('song-chart__marker--music');
      }
      markerEl.setAttribute('role', 'listitem');
      markerEl.title = key;
      markerEl.textContent = songMarkerLabel(key);
      root.appendChild(markerEl);
    }
  }
}

function appendSongChartChip(
  root: HTMLElement,
  chip: SongChartChip,
  compact: boolean,
): void {
  const el = document.createElement('div');
  el.className = 'song-chart__chip';
  el.setAttribute('role', 'listitem');
  el.dataset.measureIndex = String(chip.measurePlaybackIndex);
  if (!compact) {
    el.style.flexGrow = String(chip.durationBeats);
    el.style.flexBasis = `${chip.durationBeats * 2}rem`;
  }
  el.title = chip.tooltip;
  if (chip.isActive) {
    el.classList.add('song-chart__chip--active');
  }
  const shortSpan = document.createElement('span');
  shortSpan.className = 'song-chart__chip-short';
  shortSpan.textContent = chip.shortLabel;
  const fullSpan = document.createElement('span');
  fullSpan.className = 'song-chart__chip-full';
  fullSpan.textContent = chip.label;
  el.appendChild(shortSpan);
  el.appendChild(fullSpan);
  root.appendChild(el);
}

function buildMeasureGroupElement(
  measure: ExpandedMeasure,
  measurePlaybackIndex: number,
  measureChips: readonly SongChartChip[],
  measures: readonly ExpandedMeasure[],
  options: SongChartViewOptions | undefined,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'song-chart__measure-group';
  group.dataset.measureIndex = String(measurePlaybackIndex);

  if (measure.partLabel) {
    const partHeader = document.createElement('div');
    partHeader.className = 'song-chart__part-header';
    partHeader.setAttribute('role', 'listitem');

    const partEl = document.createElement('div');
    partEl.className = 'song-chart__part-label';
    partEl.textContent = formatPartLabel(measure.partLabel);
    partHeader.appendChild(partEl);

    const partIndex = options?.partIndexBySourceMeasure?.get(
      measure.sourceMeasureIndex,
    );
    if (options?.onPartPlay && partIndex !== undefined) {
      partHeader.appendChild(
        createSectionPlayButton({
          partIndex,
          onPlay: () => options.onPartPlay!(partIndex),
          sectionLabel: formatPartLabel(measure.partLabel),
        }),
      );
    }

    group.appendChild(partHeader);
  }

  appendMeasureMarkers(
    group,
    measure.markers,
    SONG_MARKER_BEFORE_MEASURE_KEYS,
  );
  appendChartBar(group, '|');

  for (const chip of measureChips) {
    appendSongChartChip(group, chip, false);
  }

  appendMeasureMarkers(
    group,
    measure.markers,
    SONG_MARKER_AFTER_MEASURE_KEYS,
  );

  const trailingBar = resolveTrailingPartBar(
    measures,
    measurePlaybackIndex,
    options,
  );
  if (trailingBar) {
    appendChartBar(group, trailingBar);
  }

  return group;
}

function createSectionPreviewChartView(
  measures: readonly ExpandedMeasure[],
  activeMeasureIndex: number | null,
  activeOffsetBeats: number | null,
  options: SongChartViewOptions,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'song-chart song-chart--rowed song-chart--section-preview';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', t('song.chartAria'));

  const maxMeasuresPerRow =
    options.maxMeasuresPerRow ?? SECTION_PREVIEW_MEASURES_PER_ROW;
  const transposeSemitones = options.transposeSemitones ?? 0;
  const chips = buildSongChartChips(
    measures,
    activeMeasureIndex,
    activeOffsetBeats,
    transposeSemitones,
  );
  const measureGroups: HTMLElement[] = [];

  for (let measureIndex = 0; measureIndex < measures.length; measureIndex++) {
    const measure = measures[measureIndex];
    if (!measure) {
      continue;
    }
    const measureChips = chips.filter(
      (chip) => chip.measurePlaybackIndex === measureIndex,
    );
    measureGroups.push(
      buildMeasureGroupElement(
        measure,
        measureIndex,
        measureChips,
        measures,
        options,
      ),
    );
  }

  appendMeasureGroupsToRows(
    root,
    measureGroups,
    resolveBalancedMeasuresPerRow(measures.length, maxMeasuresPerRow),
  );

  return root;
}

export function createSongChartView(
  measures: readonly ExpandedMeasure[],
  activeMeasureIndex: number | null,
  activeOffsetBeats: number | null,
  options?: SongChartViewOptions,
): HTMLElement {
  if (options?.sectionPreviewLayout) {
    return createSectionPreviewChartView(
      measures,
      activeMeasureIndex,
      activeOffsetBeats,
      options,
    );
  }

  const root = document.createElement('div');
  root.className = 'song-chart';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', t('song.chartAria'));

  const transposeSemitones = options?.transposeSemitones ?? 0;
  const chips = buildSongChartChips(
    measures,
    activeMeasureIndex,
    activeOffsetBeats,
    transposeSemitones,
  );

  let lastMeasureIndex = -1;
  const appendTarget: HTMLElement = root;

  for (let chipIndex = 0; chipIndex < chips.length; chipIndex++) {
    const chip = chips[chipIndex];
    if (chip.measurePlaybackIndex !== lastMeasureIndex) {
      const measure = measures[chip.measurePlaybackIndex];
      if (measure?.partLabel) {
        const partHeader = document.createElement('div');
        partHeader.className = 'song-chart__part-header';
        partHeader.setAttribute('role', 'listitem');

        const partEl = document.createElement('div');
        partEl.className = 'song-chart__part-label';
        partEl.textContent = formatPartLabel(measure.partLabel);
        partHeader.appendChild(partEl);

        const partIndex = options?.partIndexBySourceMeasure?.get(
          measure.sourceMeasureIndex,
        );
        if (options?.onPartPlay && partIndex !== undefined) {
          partHeader.appendChild(
            createSectionPlayButton({
              partIndex,
              onPlay: () => options.onPartPlay!(partIndex),
              sectionLabel: formatPartLabel(measure.partLabel),
            }),
          );
        }

        appendTarget.appendChild(partHeader);
      }

      appendMeasureMarkers(
        appendTarget,
        measure?.markers,
        SONG_MARKER_BEFORE_MEASURE_KEYS,
      );

      appendChartBar(appendTarget, '|');

      lastMeasureIndex = chip.measurePlaybackIndex;
    }

    appendSongChartChip(appendTarget, chip, false);

    const isLastChipOfMeasure =
      chipIndex + 1 >= chips.length ||
      chips[chipIndex + 1].measurePlaybackIndex !== chip.measurePlaybackIndex;
    if (isLastChipOfMeasure) {
      appendMeasureMarkers(
        appendTarget,
        measures[chip.measurePlaybackIndex]?.markers,
        SONG_MARKER_AFTER_MEASURE_KEYS,
      );

      const trailingBar = resolveTrailingPartBar(
        measures,
        chip.measurePlaybackIndex,
        options,
      );
      if (trailingBar) {
        appendChartBar(appendTarget, trailingBar);
      }
    }
  }

  const activeEl = root.querySelector('.song-chart__chip--active');
  if (activeEl instanceof HTMLElement) {
    activeEl.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  return root;
}

export function updateSongChartActiveState(
  root: HTMLElement,
  measures: readonly ExpandedMeasure[],
  activeMeasureIndex: number | null,
  activeOffsetBeats: number | null,
  transposeSemitones = 0,
): void {
  const chips = buildSongChartChips(
    measures,
    activeMeasureIndex,
    activeOffsetBeats,
    transposeSemitones,
  );
  const chipElements = root.querySelectorAll('.song-chart__chip');
  chipElements.forEach((element, index) => {
    const chip = chips[index];
    if (!chip) {
      return;
    }
    element.classList.toggle('song-chart__chip--active', chip.isActive);
  });

  const activeEl = root.querySelector('.song-chart__chip--active');
  if (activeEl instanceof HTMLElement) {
    activeEl.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  syncSectionPlayButtonsIn(root);
}

export function activeEventFromPosition(
  measures: readonly ExpandedMeasure[],
  measurePlaybackIndex: number,
  hitOffsetBeats: number,
) {
  const measure = measures[measurePlaybackIndex];
  if (!measure) {
    return undefined;
  }
  return activeChordEventAtBeat(measure.events, hitOffsetBeats);
}
