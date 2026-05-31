import { KEYS } from '../domain/data/keys';
import { listChords, listStrumPatterns } from '../domain/music-library/registry';
import {
  cloneSongMeasure,
  displayBeatToOffsetBeats,
  formatChordEventBeatPrefix,
  offsetBeatsToDisplayBeat,
} from '../domain/song/measure-utils';
import {
  createDefaultSongMeasure,
  formatActiveMarkerLabels,
  SONG_MARKER_AFTER_MEASURE_KEYS,
  SONG_MARKER_BEFORE_MEASURE_KEYS,
  SONG_MARKER_KEYS,
  SONG_MARKER_UI_KEYS,
  songMarkerLabel,
  songMarkerUsesMusicFont,
} from '../domain/song/song-marker-labels';
import type { SongChordEvent, SongMeasure } from '../domain/song/song-types';
import { t } from '../i18n';
import { formatSongChordLabel } from './song-chart-view';

const MEASURE_FORM_INPUT_CLASS = 'library-view__input';
const MEASURE_BTN_CLASS = 'library-view__btn library-song__measure-btn';
const MEASURE_BTN_DANGER_CLASS =
  'library-view__btn library-view__btn--danger library-song__measure-btn';

export interface MeasureListEditorOptions {
  measures: SongMeasure[];
  readonly: boolean;
  onChange: (measures: SongMeasure[]) => void;
}

function cloneMeasures(measures: readonly SongMeasure[]): SongMeasure[] {
  return measures.map((measure) => cloneSongMeasure(measure));
}

/** 挿入・追加用: コードは引き継ぎ、記号はリセット */
function cloneMeasureForInsert(source: SongMeasure | undefined): SongMeasure {
  if (!source) {
    return createDefaultSongMeasure();
  }
  return {
    keyId: source.keyId,
    timeSignature: source.timeSignature,
    strumPatternId: source.strumPatternId,
    events: source.events.map((event) => ({ ...event })),
  };
}

function appendMeasureMarkerChips(
  container: HTMLElement,
  markers: SongMeasure['markers'],
  keys: readonly (keyof NonNullable<SongMeasure['markers']>)[],
): void {
  if (!markers) {
    return;
  }
  for (const key of keys) {
    if (!markers[key]) {
      continue;
    }
    const chip = document.createElement('span');
    chip.className = 'library-song__marker-chip';
    if (songMarkerUsesMusicFont(key)) {
      chip.classList.add('library-song__marker-chip--music');
    }
    chip.textContent = songMarkerLabel(key);
    chip.title = key;
    container.appendChild(chip);
  }
}

function appendMeasureSummaryPreview(
  container: HTMLElement,
  measure: SongMeasure,
): void {
  container.replaceChildren();
  const preview = document.createElement('div');
  preview.className = 'library-song__measure-summary-preview';

  appendMeasureMarkerChips(
    preview,
    measure.markers,
    SONG_MARKER_BEFORE_MEASURE_KEYS,
  );

  if (measure.events.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'library-song__measure-empty';
    empty.textContent = '—';
    preview.appendChild(empty);
  } else {
    const chords = document.createElement('div');
    chords.className = 'library-song__preview';
    for (const event of measure.events) {
      const chip = document.createElement('span');
      chip.className = 'library-song__chip';
    const label = formatSongChordLabel(event.chordRootKeyId, event.chordId);
    const prefix = formatChordEventBeatPrefix(event.offsetBeats);
    chip.textContent = `${prefix}${label}`;
    chip.title = `${t('library.song.offsetBeats')}: ${offsetBeatsToDisplayBeat(event.offsetBeats)}`;
      chords.appendChild(chip);
    }
    preview.appendChild(chords);
  }

  appendMeasureMarkerChips(
    preview,
    measure.markers,
    SONG_MARKER_AFTER_MEASURE_KEYS,
  );

  container.appendChild(preview);
}

function appendChordPreview(
  container: HTMLElement,
  measure: SongMeasure,
): void {
  appendMeasureSummaryPreview(container, measure);
}

function formatMeasureKeyLabel(keyId: string): string {
  return KEYS.find((key) => key.id === keyId)?.name ?? keyId;
}

function formatMeasureStrumLabel(strumPatternId: string): string {
  return (
    listStrumPatterns().find(({ def }) => def.id === strumPatternId)?.def
      .name ?? strumPatternId
  );
}

/** 小節で明示 override されたキー・ストロークを右端表示用に描画 */
function appendMeasureOverrideLabels(
  container: HTMLElement,
  measure: SongMeasure,
): void {
  container.replaceChildren();
  const keyId = measure.keyId?.trim();
  const strumPatternId = measure.strumPatternId?.trim();
  if (!keyId && !strumPatternId) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  if (keyId) {
    const badge = document.createElement('span');
    badge.className =
      'library-song__measure-override library-song__measure-override--key';
    badge.textContent = formatMeasureKeyLabel(keyId);
    badge.title = t('library.song.measureKey');
    container.appendChild(badge);
  }
  if (strumPatternId) {
    const badge = document.createElement('span');
    badge.className =
      'library-song__measure-override library-song__measure-override--strum';
    badge.textContent = formatMeasureStrumLabel(strumPatternId);
    badge.title = t('library.song.measureStrum');
    container.appendChild(badge);
  }
}

function shiftOpenIndices(
  openIndices: Set<number>,
  fromIndex: number,
  delta: number,
): void {
  const next = new Set<number>();
  for (const index of openIndices) {
    if (index >= fromIndex) {
      next.add(index + delta);
    } else {
      next.add(index);
    }
  }
  openIndices.clear();
  for (const index of next) {
    openIndices.add(index);
  }
}

export function createMeasureListEditor(
  options: MeasureListEditorOptions,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'library-song__measure-list';

  const openIndices = new Set<number>();
  let pendingOpenIndex: number | null = null;
  let measures = cloneMeasures(options.measures);

  const rowsHost = document.createElement('div');
  rowsHost.className = 'library-song__measure-rows';
  root.appendChild(rowsHost);

  let addBtn: HTMLButtonElement | null = null;

  const commit = (next: SongMeasure[]): void => {
    measures = next;
    options.onChange(next);
  };

  const renderMeasures = (): void => {
    rowsHost.replaceChildren();

    measures.forEach((measure, index) => {
      rowsHost.appendChild(
        createEditableMeasureEditor({
          measure,
          index,
          open:
            openIndices.has(index) ||
            (pendingOpenIndex !== null && pendingOpenIndex === index),
          onOpenChange: (open) => {
            if (open) {
              openIndices.add(index);
            } else {
              openIndices.delete(index);
            }
            if (pendingOpenIndex === index) {
              pendingOpenIndex = null;
            }
          },
          onUpdate: (next) => {
            const copy = cloneMeasures(measures);
            copy[index] = next;
            commit(copy);
          },
          onRemove: () => {
            const copy = cloneMeasures(measures);
            copy.splice(index, 1);
            openIndices.delete(index);
            shiftOpenIndices(openIndices, index + 1, -1);
            if (pendingOpenIndex !== null) {
              if (pendingOpenIndex === index) {
                pendingOpenIndex = null;
              } else if (pendingOpenIndex > index) {
                pendingOpenIndex -= 1;
              }
            }
            commit(copy);
            renderMeasures();
          },
          onInsertBefore: () => {
            const copy = cloneMeasures(measures);
            copy.splice(index, 0, cloneMeasureForInsert(measure));
            shiftOpenIndices(openIndices, index, 1);
            openIndices.add(index);
            pendingOpenIndex = index;
            commit(copy);
            renderMeasures();
          },
          onInsertAfter: () => {
            const copy = cloneMeasures(measures);
            copy.splice(index + 1, 0, cloneMeasureForInsert(measure));
            shiftOpenIndices(openIndices, index + 1, 1);
            openIndices.add(index + 1);
            pendingOpenIndex = index + 1;
            commit(copy);
            renderMeasures();
          },
        }),
      );
    });

    pendingOpenIndex = null;
  };

  if (!options.readonly) {
    addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = `${MEASURE_BTN_CLASS} library-song__add-measure-btn`;
    addBtn.textContent = t('library.song.addMeasure');
    addBtn.addEventListener('click', () => {
      const last = measures[measures.length - 1];
      const copy = cloneMeasures(measures);
      const newIndex = copy.length;
      copy.push(cloneMeasureForInsert(last));
      openIndices.add(newIndex);
      pendingOpenIndex = newIndex;
      commit(copy);
      renderMeasures();
    });
    root.appendChild(addBtn);
  } else {
    measures.forEach((measure, index) => {
      rowsHost.appendChild(createReadonlyMeasureRow(measure, index));
    });
  }

  if (!options.readonly) {
    renderMeasures();
  }

  return root;
}

interface EditableMeasureEditorOptions {
  measure: SongMeasure;
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (measure: SongMeasure) => void;
  onRemove: () => void;
  onInsertBefore: () => void;
  onInsertAfter: () => void;
}

function createEditableMeasureEditor(
  options: EditableMeasureEditorOptions,
): HTMLElement {
  let currentMeasure = options.measure;

  const details = document.createElement('details');
  details.className =
    'library-song__measure library-song__measure--collapsible';
  details.open = options.open;

  details.addEventListener('toggle', () => {
    options.onOpenChange(details.open);
  });

  const summary = document.createElement('summary');
  summary.className = 'library-song__measure-summary-row';

  const title = document.createElement('span');
  title.className = 'library-song__measure-title';
  title.textContent = t('library.song.measureTitle', { n: options.index + 1 });
  summary.appendChild(title);

  const summaryChips = document.createElement('div');
  summaryChips.className = 'library-song__measure-compact-chords';
  appendMeasureSummaryPreview(summaryChips, currentMeasure);
  summary.appendChild(summaryChips);

  const overrideHost = document.createElement('div');
  overrideHost.className = 'library-song__measure-override-host';
  appendMeasureOverrideLabels(overrideHost, currentMeasure);
  summary.appendChild(overrideHost);

  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'library-song__measure-body';

  const header = document.createElement('div');
  header.className = 'library-song__measure-header';

  const insertActions = document.createElement('div');
  insertActions.className = 'library-song__measure-insert-actions';

  const insertBeforeBtn = document.createElement('button');
  insertBeforeBtn.type = 'button';
  insertBeforeBtn.className =
    `${MEASURE_BTN_CLASS} library-song__insert-measure`;
  insertBeforeBtn.textContent = t('library.song.insertMeasureBefore');
  insertBeforeBtn.addEventListener('click', (event) => {
    event.preventDefault();
    options.onInsertBefore();
  });
  insertActions.appendChild(insertBeforeBtn);

  const insertAfterBtn = document.createElement('button');
  insertAfterBtn.type = 'button';
  insertAfterBtn.className =
    `${MEASURE_BTN_CLASS} library-song__insert-measure`;
  insertAfterBtn.textContent = t('library.song.insertMeasureAfter');
  insertAfterBtn.addEventListener('click', (event) => {
    event.preventDefault();
    options.onInsertAfter();
  });
  insertActions.appendChild(insertAfterBtn);

  header.appendChild(insertActions);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className =
    `${MEASURE_BTN_CLASS} library-song__close-measure`;
  closeBtn.textContent = t('library.song.closeMeasureEdit');
  closeBtn.addEventListener('click', (event) => {
    event.preventDefault();
    details.open = false;
    options.onOpenChange(false);
  });
  header.appendChild(closeBtn);

  body.appendChild(header);

  const applyUpdate = (next: SongMeasure): void => {
    currentMeasure = next;
    options.onUpdate(next);
    appendMeasureSummaryPreview(summaryChips, next);
    appendMeasureOverrideLabels(overrideHost, next);
  };

  const fieldsRow = document.createElement('div');
  fieldsRow.className = 'library-song__measure-fields';

  const keyLabel = document.createElement('label');
  keyLabel.className = 'library-view__field';
  const keyLabelText = document.createElement('span');
  keyLabelText.className = 'library-view__field-label';
  keyLabelText.textContent = t('library.song.measureKey');
  keyLabel.appendChild(keyLabelText);
  const keySelect = document.createElement('select');
  keySelect.className = MEASURE_FORM_INPUT_CLASS;
  const inheritOpt = document.createElement('option');
  inheritOpt.value = '';
  inheritOpt.textContent = t('library.song.inherit');
  keySelect.appendChild(inheritOpt);
  for (const key of KEYS) {
    const opt = document.createElement('option');
    opt.value = key.id;
    opt.textContent = key.name;
    opt.selected = currentMeasure.keyId === key.id;
    keySelect.appendChild(opt);
  }
  keySelect.addEventListener('change', () => {
    applyUpdate({
      ...currentMeasure,
      keyId: keySelect.value || undefined,
    });
  });
  keyLabel.appendChild(keySelect);
  fieldsRow.appendChild(keyLabel);

  const strumLabel = document.createElement('label');
  strumLabel.className = 'library-view__field library-song__measure-field--strum';
  const strumLabelText = document.createElement('span');
  strumLabelText.className = 'library-view__field-label';
  strumLabelText.textContent = t('library.song.measureStrum');
  strumLabel.appendChild(strumLabelText);
  const strumSelect = document.createElement('select');
  strumSelect.className = MEASURE_FORM_INPUT_CLASS;
  const strumInheritOpt = document.createElement('option');
  strumInheritOpt.value = '';
  strumInheritOpt.textContent = t('library.song.inherit');
  strumSelect.appendChild(strumInheritOpt);
  for (const { def } of listStrumPatterns()) {
    const opt = document.createElement('option');
    opt.value = def.id;
    opt.textContent = def.name;
    opt.selected = currentMeasure.strumPatternId === def.id;
    strumSelect.appendChild(opt);
  }
  strumSelect.addEventListener('change', () => {
    applyUpdate({
      ...currentMeasure,
      strumPatternId: strumSelect.value || undefined,
    });
  });
  strumLabel.appendChild(strumSelect);
  fieldsRow.appendChild(strumLabel);

  const tsLabel = document.createElement('label');
  tsLabel.className = 'library-view__field library-song__measure-field--timesig';
  const tsLabelText = document.createElement('span');
  tsLabelText.className = 'library-view__field-label';
  tsLabelText.textContent = t('library.field.timeSig');
  tsLabel.appendChild(tsLabelText);
  const tsInput = document.createElement('input');
  tsInput.className = MEASURE_FORM_INPUT_CLASS;
  tsInput.placeholder = '4/4';
  tsInput.value = currentMeasure.timeSignature ?? '';
  tsInput.addEventListener('change', () => {
    applyUpdate({
      ...currentMeasure,
      timeSignature: tsInput.value.trim() || undefined,
    });
  });
  tsLabel.appendChild(tsInput);
  fieldsRow.appendChild(tsLabel);

  body.appendChild(fieldsRow);

  const activeMarkerCount = SONG_MARKER_KEYS.filter(
    (key) => currentMeasure.markers?.[key] === true,
  ).length;
  const markersDetails = document.createElement('details');
  markersDetails.className = 'library-song__markers-panel';
  markersDetails.open = activeMarkerCount > 0;

  const markersSummary = document.createElement('summary');
  markersSummary.className = 'library-song__markers-summary';
  markersSummary.textContent =
    activeMarkerCount > 0
      ? t('library.song.markersActive', {
          count: activeMarkerCount,
          labels: formatActiveMarkerLabels(currentMeasure.markers ?? {}),
        })
      : t('library.song.markersSection');
  markersDetails.appendChild(markersSummary);

  const refreshMarkersSummary = (): void => {
    const count = SONG_MARKER_KEYS.filter(
      (key) => currentMeasure.markers?.[key] === true,
    ).length;
    markersSummary.textContent =
      count > 0
        ? t('library.song.markersActive', {
            count,
            labels: formatActiveMarkerLabels(currentMeasure.markers ?? {}),
          })
        : t('library.song.markersSection');
  };

  const quickWrap = document.createElement('div');
  quickWrap.className = 'library-song__marker-quick';
  quickWrap.setAttribute('role', 'group');
  quickWrap.setAttribute('aria-label', t('library.song.markersQuick'));

  const toggleMarker = (key: keyof NonNullable<SongMeasure['markers']>): void => {
    const markers = { ...(currentMeasure.markers ?? {}) };
    if (markers[key]) {
      delete markers[key];
    } else {
      markers[key] = true;
    }
    applyUpdate({
      ...currentMeasure,
      markers: Object.keys(markers).length > 0 ? markers : undefined,
    });
    refreshMarkersSummary();
    refreshMarkerControls();
  };

  const refreshMarkerControls = (): void => {
    for (const quickBtn of quickWrap.querySelectorAll('button')) {
      const key = quickBtn.title as keyof NonNullable<SongMeasure['markers']>;
      quickBtn.setAttribute(
        'aria-pressed',
        String(currentMeasure.markers?.[key] === true),
      );
      quickBtn.classList.toggle(
        'library-song__marker-quick-btn--active',
        currentMeasure.markers?.[key] === true,
      );
    }
  };

  for (const key of SONG_MARKER_UI_KEYS) {
    const quickBtn = document.createElement('button');
    quickBtn.type = 'button';
    quickBtn.className =
      'library-song__marker-quick-btn library-song__touch-target';
    if (songMarkerUsesMusicFont(key)) {
      quickBtn.classList.add('library-song__marker-quick-btn--music');
    }
    quickBtn.textContent = songMarkerLabel(key);
    quickBtn.title = key;
    quickBtn.setAttribute(
      'aria-pressed',
      String(currentMeasure.markers?.[key] === true),
    );
    quickBtn.classList.toggle(
      'library-song__marker-quick-btn--active',
      currentMeasure.markers?.[key] === true,
    );
    quickBtn.addEventListener('click', () => toggleMarker(key));
    quickWrap.appendChild(quickBtn);
  }
  markersDetails.appendChild(quickWrap);
  body.appendChild(markersDetails);

  const eventsWrap = document.createElement('div');
  eventsWrap.className = 'library-song__events';

  const renderEvents = (): void => {
    eventsWrap.replaceChildren();
    currentMeasure.events.forEach((event, eventIndex) => {
      eventsWrap.appendChild(
        createEventRow(
          event,
          (next) => {
            const events = currentMeasure.events.map((item, i) =>
              i === eventIndex ? next : item,
            );
            applyUpdate({ ...currentMeasure, events });
          },
          () => {
            applyUpdate({
              ...currentMeasure,
              events: currentMeasure.events.filter((_, i) => i !== eventIndex),
            });
            renderEvents();
          },
        ),
      );
    });
  };

  renderEvents();
  body.appendChild(eventsWrap);

  const footer = document.createElement('div');
  footer.className = 'library-song__measure-footer';

  const addEventBtnOuter = document.createElement('button');
  addEventBtnOuter.type = 'button';
  addEventBtnOuter.className = MEASURE_BTN_CLASS;
  addEventBtnOuter.textContent = t('library.song.addEvent');
  addEventBtnOuter.addEventListener('click', () => {
    applyUpdate({
      ...currentMeasure,
      events: [
        ...currentMeasure.events,
        { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
      ],
    });
    renderEvents();
  });
  footer.appendChild(addEventBtnOuter);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = MEASURE_BTN_DANGER_CLASS;
  removeBtn.textContent = t('library.song.removeMeasure');
  removeBtn.addEventListener('click', () => {
    if (
      !window.confirm(
        t('library.song.removeMeasureConfirm', { n: String(options.index + 1) }),
      )
    ) {
      return;
    }
    options.onRemove();
  });
  footer.appendChild(removeBtn);

  body.appendChild(footer);

  details.appendChild(body);
  return details;
}

function createReadonlyMeasureRow(
  measure: SongMeasure,
  index: number,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'library-song__measure library-song__measure--compact';

  const head = document.createElement('div');
  head.className = 'library-song__measure-compact-row';

  const num = document.createElement('span');
  num.className = 'library-song__measure-num';
  num.textContent = t('library.song.measureTitle', { n: index + 1 });
  head.appendChild(num);

  const chipsHost = document.createElement('div');
  chipsHost.className = 'library-song__measure-compact-chords';
  appendChordPreview(chipsHost, measure);
  head.appendChild(chipsHost);

  const overrideHost = document.createElement('div');
  overrideHost.className = 'library-song__measure-override-host';
  appendMeasureOverrideLabels(overrideHost, measure);
  head.appendChild(overrideHost);

  row.appendChild(head);

  const metaParts: string[] = [];
  if (measure.timeSignature) {
    metaParts.push(`${t('library.field.timeSig')}: ${measure.timeSignature}`);
  }
  if (measure.markers) {
    metaParts.push(formatActiveMarkerLabels(measure.markers));
  }
  if (metaParts.length > 0) {
    const meta = document.createElement('p');
    meta.className = 'library-song__measure-readonly-meta';
    meta.textContent = metaParts.join(' · ');
    row.appendChild(meta);
  }

  return row;
}

function readEventFromRow(
  offsetInput: HTMLInputElement,
  rootSelect: HTMLSelectElement,
  chordSelect: HTMLSelectElement,
): SongChordEvent {
  return {
    offsetBeats: displayBeatToOffsetBeats(Number(offsetInput.value)),
    chordRootKeyId: rootSelect.value,
    chordId: chordSelect.value,
  };
}

function createEventRow(
  event: SongChordEvent,
  onUpdate: (event: SongChordEvent) => void,
  onRemove: () => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'library-song__event-row';

  const offsetLabel = document.createElement('label');
  offsetLabel.className = 'library-view__field library-song__event-field';
  const offsetLabelText = document.createElement('span');
  offsetLabelText.className = 'library-view__field-label';
  offsetLabelText.textContent = t('library.song.offsetBeats');
  offsetLabel.appendChild(offsetLabelText);
  const offsetInput = document.createElement('input');
  offsetInput.type = 'number';
  offsetInput.min = '1';
  offsetInput.step = '0.5';
  offsetInput.className = `${MEASURE_FORM_INPUT_CLASS} library-song__offset`;
  offsetInput.value = String(offsetBeatsToDisplayBeat(event.offsetBeats));
  offsetInput.setAttribute('aria-label', t('library.song.offsetBeats'));
  offsetInput.addEventListener('change', () => {
    onUpdate(readEventFromRow(offsetInput, rootSelect, chordSelect));
  });
  offsetLabel.appendChild(offsetInput);
  row.appendChild(offsetLabel);

  const rootLabel = document.createElement('label');
  rootLabel.className = 'library-view__field library-song__event-field';
  const rootLabelText = document.createElement('span');
  rootLabelText.className = 'library-view__field-label';
  rootLabelText.textContent = t('library.song.chordRoot');
  rootLabel.appendChild(rootLabelText);
  const rootSelect = document.createElement('select');
  rootSelect.className = MEASURE_FORM_INPUT_CLASS;
  for (const key of KEYS) {
    const opt = document.createElement('option');
    opt.value = key.id;
    opt.textContent = key.id;
    opt.selected = event.chordRootKeyId === key.id;
    rootSelect.appendChild(opt);
  }
  rootSelect.addEventListener('change', () => {
    onUpdate(readEventFromRow(offsetInput, rootSelect, chordSelect));
  });
  rootLabel.appendChild(rootSelect);
  row.appendChild(rootLabel);

  const chordLabel = document.createElement('label');
  chordLabel.className =
    'library-view__field library-song__event-field library-song__event-field--chord';
  const chordLabelText = document.createElement('span');
  chordLabelText.className = 'library-view__field-label';
  chordLabelText.textContent = t('library.tabs.chord');
  chordLabel.appendChild(chordLabelText);
  const chordSelect = document.createElement('select');
  chordSelect.className = MEASURE_FORM_INPUT_CLASS;
  for (const { def } of listChords()) {
    const opt = document.createElement('option');
    opt.value = def.id;
    opt.textContent = def.name;
    opt.selected = event.chordId === def.id;
    chordSelect.appendChild(opt);
  }
  chordSelect.addEventListener('change', () => {
    onUpdate(readEventFromRow(offsetInput, rootSelect, chordSelect));
  });
  chordLabel.appendChild(chordSelect);
  row.appendChild(chordLabel);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className =
    `${MEASURE_BTN_CLASS} library-song__remove-event`;
  removeBtn.textContent = '×';
  removeBtn.setAttribute('aria-label', t('library.song.removeEvent'));
  removeBtn.addEventListener('click', onRemove);
  row.appendChild(removeBtn);

  return row;
}
