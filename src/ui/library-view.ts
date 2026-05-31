import { tonePlayer } from '../audio/tone-player';
import type { ChordDef } from '../domain/data/chords';
import { MVP_KEY } from '../domain/data/keys';
import type { ScaleDef } from '../domain/data/scales';
import { clampBpm, DEFAULT_BPM, MAX_BPM, MIN_BPM } from '../domain/playback-bpm';
import {
  applyCustomLibraryImport,
  exportLibraryCsv,
  parseLibraryCsv,
} from '../domain/music-library/csv';
import {
  deleteCustomChord,
  deleteCustomScale,
  deleteCustomStrumPattern,
  duplicateChordAsCustom,
  duplicateScaleAsCustom,
  duplicateStrumPatternAsCustom,
  resetLibraryToInitial,
  upsertCustomChord,
  upsertCustomScale,
  upsertCustomStrumPattern,
} from '../domain/music-library/custom-crud';
import {
  displayChordName,
  displayScaleName,
  displayStrumPatternName,
  listChords,
  listScales,
  listStrumPatterns,
} from '../domain/music-library/registry';
import { saveCustomLibrary } from '../domain/music-library/storage';
import { getToneLabelOptions } from '../domain/music-library/tone-label-options';
import { createSegmentSwitcher } from './segment-switcher';
import { createPlaybackToolbarField } from './playback-toolbar';
import type { StrumPatternDef } from '../domain/strum-pattern/strum-pattern';
import { parseStrumPatternDef } from '../domain/strum-pattern/strum-pattern';
import { t } from '../i18n';
import {
  renderSongPanel,
} from './library-song-panels';
import type { SongBlockDef, SongDef } from '../domain/song/song-types';

import {
  createListEditor,
  resetLibraryListScroll,
} from './library-list-editor';

export type LibraryTab = 'scale' | 'chord' | 'strum' | 'song';

export { resetLibraryListScroll };

export interface LibraryViewState {
  tab: LibraryTab;
  selectedScaleId: string | null;
  selectedChordId: string | null;
  selectedStrumPatternId: string | null;
  selectedSongId?: string | null;
  draftSong?: SongDef | null;
  /** Forked / edited blocks while composing a new song (not yet saved). */
  draftSongBlocks?: SongBlockDef[] | null;
  draftScale?: ScaleDef | null;
  draftChord?: ChordDef | null;
  draftStrumPattern?: StrumPatternDef | null;
}

export interface LibraryViewCallbacks {
  onStateChange: (state: LibraryViewState) => void;
  onLibraryChanged: () => void;
}

export function createLibraryView(
  state: LibraryViewState,
  callbacks: LibraryViewCallbacks,
): HTMLElement {
  const wrappedCallbacks: LibraryViewCallbacks = {
    ...callbacks,
    onLibraryChanged: () => {
      resetLibraryListScroll();
      callbacks.onLibraryChanged();
    },
  };

  const root = document.createElement('section');
  root.className = 'library-view';
  root.setAttribute('aria-label', t('library.ariaLabel'));

  const activeTab =
    (state.tab as string) === 'block' ? 'song' : state.tab;

  const tabBar = createSegmentSwitcher({
    className: 'segment-switcher library-view__tabs',
    ariaLabel: t('library.tabs.aria'),
    modes: ['scale', 'chord', 'strum', 'song'] as const,
    labels: {
      scale: t('library.tabs.scale'),
      chord: t('library.tabs.chord'),
      strum: t('library.tabs.strum'),
      song: t('library.tabs.song'),
    },
    active: activeTab,
    onChange: (tab) => {
      wrappedCallbacks.onStateChange({ ...state, tab });
    },
  });
  root.appendChild(tabBar);

  const body = document.createElement('div');
  body.className = 'library-view__body';
  root.appendChild(body);

  const toolbar = document.createElement('div');
  toolbar.className = 'library-view__toolbar';
  root.appendChild(toolbar);

  if (state.tab === 'scale') {
    renderScalePanel(body, state, wrappedCallbacks);
  } else if (state.tab === 'chord') {
    renderChordPanel(body, state, wrappedCallbacks);
  } else if (state.tab === 'strum') {
    renderStrumPanel(body, state, wrappedCallbacks);
  } else {
    renderSongPanel(body, state, wrappedCallbacks);
  }

  renderToolbar(toolbar, wrappedCallbacks);

  return root;
}

function renderScalePanel(
  body: HTMLElement,
  state: LibraryViewState,
  callbacks: LibraryViewCallbacks,
): void {
  const items = listScales();
  const selectedId =
    state.selectedScaleId === '__new__'
      ? '__new__'
      : (state.selectedScaleId ?? items[0]?.def.id ?? null);
  const selected =
    selectedId === '__new__'
      ? undefined
      : items.find((i) => i.def.id === selectedId) ?? items[0];

  body.appendChild(
    createListEditor(
      {
      items: items.map((item) => ({
        id: item.def.id,
        label: displayScaleName(item.def, item.source),
        badge: item.source === 'builtin' ? t('library.badge.builtin') : null,
      })),
      selectedId: selected?.def.id ?? null,
      onSelect: (id) => {
        callbacks.onStateChange({ ...state, selectedScaleId: id });
      },
      onAdd: () => {
        callbacks.onStateChange({
          ...state,
          selectedScaleId: '__new__',
          draftScale: null,
        });
      },
      renderForm: () => {
        if (!selected && state.selectedScaleId !== '__new__') {
          return createMessage(t('library.empty.scale'));
        }
        const isNew = state.selectedScaleId === '__new__';
        const def = isNew
          ? (state.draftScale ?? { id: '', name: '', tones: ['R'] })
          : selected!.def;
        const readonly = !isNew && selected!.source === 'builtin';
        return createScaleForm(def, readonly, isNew, callbacks, state);
      },
    },
      'scale',
    ),
  );
}

function renderChordPanel(
  body: HTMLElement,
  state: LibraryViewState,
  callbacks: LibraryViewCallbacks,
): void {
  const items = listChords();
  const selectedId =
    state.selectedChordId === '__new__'
      ? '__new__'
      : (state.selectedChordId ?? items[0]?.def.id ?? null);
  const selected =
    selectedId === '__new__'
      ? undefined
      : items.find((i) => i.def.id === selectedId) ?? items[0];

  body.appendChild(
    createListEditor(
      {
      items: items.map((item) => ({
        id: item.def.id,
        label: displayChordName(item.def, item.source),
        badge: item.source === 'builtin' ? t('library.badge.builtin') : null,
      })),
      selectedId: selected?.def.id ?? null,
      onSelect: (id) => {
        callbacks.onStateChange({ ...state, selectedChordId: id });
      },
      onAdd: () => {
        callbacks.onStateChange({
          ...state,
          selectedChordId: '__new__',
          draftChord: null,
        });
      },
      renderForm: () => {
        if (!selected && state.selectedChordId !== '__new__') {
          return createMessage(t('library.empty.chord'));
        }
        const isNew = state.selectedChordId === '__new__';
        const def = isNew
          ? (state.draftChord ?? { id: '', name: '', tones: ['R', '3', '5'] })
          : selected!.def;
        const readonly = !isNew && selected!.source === 'builtin';
        return createChordForm(def, readonly, isNew, callbacks, state);
      },
    },
      'chord',
    ),
  );
}

function renderStrumPanel(
  body: HTMLElement,
  state: LibraryViewState,
  callbacks: LibraryViewCallbacks,
): void {
  const items = listStrumPatterns();
  const selectedId =
    state.selectedStrumPatternId === '__new__'
      ? '__new__'
      : (state.selectedStrumPatternId ?? items[0]?.def.id ?? null);
  const selected =
    selectedId === '__new__'
      ? undefined
      : items.find((item) => item.def.id === selectedId) ?? items[0];

  body.appendChild(
    createListEditor(
      {
        items: items.map((item) => ({
          id: item.def.id,
          label: displayStrumPatternName(item.def, item.source),
          badge: item.source === 'builtin' ? t('library.badge.builtin') : null,
        })),
        selectedId: selected?.def.id ?? null,
        onSelect: (id) => {
          callbacks.onStateChange({ ...state, selectedStrumPatternId: id });
        },
        onAdd: () => {
          callbacks.onStateChange({
            ...state,
            selectedStrumPatternId: '__new__',
            draftStrumPattern: null,
          });
        },
        renderForm: () => {
          if (!selected && state.selectedStrumPatternId !== '__new__') {
            return createMessage(t('library.empty.strum'));
          }
          const isNew = state.selectedStrumPatternId === '__new__';
          const def = isNew
            ? (state.draftStrumPattern ?? {
                id: '',
                name: '',
                timeSignature: '4/4',
                notation: '4, 4(>), 4, 4(>)',
              })
            : selected!.def;
          const readonly = !isNew && selected!.source === 'builtin';
          return createStrumPatternForm(def, readonly, isNew, callbacks, state);
        },
      },
      'strum',
    ),
  );
}

function createStrumPatternForm(
  def: StrumPatternDef,
  readonly: boolean,
  isNew: boolean,
  callbacks: LibraryViewCallbacks,
  state: LibraryViewState,
): HTMLElement {
  const form = document.createElement('div');
  form.className = 'library-view__form';

  const errorsEl = document.createElement('div');
  errorsEl.className = 'library-view__errors';
  errorsEl.hidden = true;

  const nameInput = document.createElement('input');
  nameInput.className = 'library-view__input';
  nameInput.value = def.name;
  nameInput.readOnly = readonly;

  const timeSignatureInput = document.createElement('input');
  timeSignatureInput.className = 'library-view__input';
  timeSignatureInput.value = def.timeSignature || '4/4';
  timeSignatureInput.readOnly = readonly;
  timeSignatureInput.placeholder = '4/4';

  const notationInput = document.createElement('input');
  notationInput.className = 'library-view__input library-view__input--wide';
  notationInput.value = def.notation;
  notationInput.readOnly = readonly;
  notationInput.placeholder = '4, 4(>), 4, 4(>)';

  const notationHint = document.createElement('p');
  notationHint.className = 'library-view__hint';
  notationHint.textContent = t('library.strum.hint');

  const getPreviewDef = (): StrumPatternDef => ({
    id: def.id || '__preview__',
    name: nameInput.value.trim() || def.name,
    timeSignature: timeSignatureInput.value.trim() || '4/4',
    notation: notationInput.value.trim(),
  });

  const previewRow = createStrumPreviewRow(
    getPreviewDef,
    timeSignatureInput,
    notationInput,
  );

  form.appendChild(createField(t('library.field.name'), nameInput));
  form.appendChild(createField(t('library.field.timeSig'), timeSignatureInput));
  form.appendChild(createField(t('library.field.pattern'), notationInput));
  form.appendChild(notationHint);
  form.appendChild(previewRow);
  form.appendChild(errorsEl);

  const actions = document.createElement('div');
  actions.className = 'library-view__form-actions';

  if (!readonly) {
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'library-view__btn library-view__btn--primary';
    saveBtn.textContent = t('library.save');
    saveBtn.addEventListener('click', () => {
      const next = {
        id: isNew ? '' : def.id,
        name: nameInput.value.trim(),
        timeSignature: timeSignatureInput.value.trim(),
        notation: notationInput.value.trim(),
      };
      const result = upsertCustomStrumPattern(next);
      if (!result.ok) {
        errorsEl.textContent = result.errors.join('\n');
        errorsEl.hidden = false;
      } else {
        errorsEl.hidden = true;
        callbacks.onLibraryChanged();
        callbacks.onStateChange({
          ...state,
          selectedStrumPatternId: result.id ?? next.id,
          draftStrumPattern: null,
        });
      }
    });
    actions.appendChild(saveBtn);

    if (!isNew) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'library-view__btn library-view__btn--danger';
      delBtn.textContent = t('library.delete');
      delBtn.addEventListener('click', () => {
        if (window.confirm(t('library.deleteConfirm', { name: def.name }))) {
          deleteCustomStrumPattern(def.id);
          callbacks.onLibraryChanged();
          callbacks.onStateChange({
            ...state,
            selectedStrumPatternId: null,
            draftStrumPattern: null,
          });
        }
      });
      actions.appendChild(delBtn);
    }
  }

  if (readonly) {
    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = 'library-view__btn';
    dupBtn.textContent = t('library.duplicate');
    dupBtn.addEventListener('click', () => {
      const copy = duplicateStrumPatternAsCustom(def.id);
      if (copy) {
        callbacks.onStateChange({
          ...state,
          selectedStrumPatternId: '__new__',
          draftStrumPattern: copy,
        });
      }
    });
    actions.appendChild(dupBtn);
  }

  form.appendChild(actions);
  return form;
}

function createScaleForm(
  def: ScaleDef,
  readonly: boolean,
  isNew: boolean,
  callbacks: LibraryViewCallbacks,
  state: LibraryViewState,
): HTMLElement {
  return createDefForm({
    kind: 'scale',
    def,
    readonly,
    isNew,
    onSave: (next) => {
      const result = upsertCustomScale(next);
      if (!result.ok) {
        return result.errors;
      }
      callbacks.onLibraryChanged();
      callbacks.onStateChange({
        ...state,
        selectedScaleId: result.id ?? next.id,
        draftScale: null,
      });
      return [];
    },
    onDelete: () => {
      deleteCustomScale(def.id);
      callbacks.onLibraryChanged();
      callbacks.onStateChange({
        ...state,
        selectedScaleId: null,
        draftScale: null,
      });
    },
    onDuplicate: readonly
      ? () => {
          const copy = duplicateScaleAsCustom(def.id);
          if (copy) {
            callbacks.onStateChange({
              ...state,
              selectedScaleId: '__new__',
              draftScale: copy,
            });
          }
        }
      : undefined,
  });
}

function createChordForm(
  def: ChordDef,
  readonly: boolean,
  isNew: boolean,
  callbacks: LibraryViewCallbacks,
  state: LibraryViewState,
): HTMLElement {
  return createDefForm({
    kind: 'chord',
    def,
    readonly,
    isNew,
    onSave: (next) => {
      const result = upsertCustomChord(next);
      if (!result.ok) {
        return result.errors;
      }
      callbacks.onLibraryChanged();
      callbacks.onStateChange({
        ...state,
        selectedChordId: result.id ?? next.id,
        draftChord: null,
      });
      return [];
    },
    onDelete: () => {
      deleteCustomChord(def.id);
      callbacks.onLibraryChanged();
      callbacks.onStateChange({
        ...state,
        selectedChordId: null,
        draftChord: null,
      });
    },
    onDuplicate: readonly
      ? () => {
          const copy = duplicateChordAsCustom(def.id);
          if (copy) {
            callbacks.onStateChange({
              ...state,
              selectedChordId: '__new__',
              draftChord: copy,
            });
          }
        }
      : undefined,
  });
}

interface DefFormConfig {
  kind: 'scale' | 'chord';
  def: ScaleDef | ChordDef;
  readonly: boolean;
  isNew: boolean;
  onSave: (def: ScaleDef | ChordDef) => string[];
  onDelete: () => void;
  onDuplicate?: () => void;
}

function createTonePicker(
  initialTones: readonly string[],
  readonly: boolean,
): { element: HTMLElement; getTones: () => string[] } {
  const masterOptions = getToneLabelOptions();
  const tones = initialTones.length > 0 ? [...initialTones] : ['R'];

  const wrap = document.createElement('div');
  wrap.className = 'library-view__tones';

  function optionsForRow(current: string): string[] {
    if (masterOptions.includes(current)) {
      return [...masterOptions];
    }
    return [current, ...masterOptions];
  }

  function render(): void {
    wrap.replaceChildren();
    if (readonly) {
      const list = document.createElement('ul');
      list.className = 'library-view__tone-readonly';
      for (const tone of tones) {
        const li = document.createElement('li');
        li.textContent = tone;
        list.appendChild(li);
      }
      wrap.appendChild(list);
      return;
    }

    tones.forEach((tone, index) => {
      const row = document.createElement('div');
      row.className = 'library-view__tone-row';

      const select = document.createElement('select');
      select.className = 'library-view__input library-view__tone-select';
      for (const opt of optionsForRow(tone)) {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        option.selected = opt === tone;
        select.appendChild(option);
      }
      select.addEventListener('change', () => {
        tones[index] = select.value;
      });
      row.appendChild(select);

      if (tones.length > 1) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'library-view__tone-remove';
        removeBtn.textContent = t('library.removeTone');
        removeBtn.setAttribute('aria-label', t('library.removeToneAria'));
        removeBtn.addEventListener('click', () => {
          tones.splice(index, 1);
          render();
        });
        row.appendChild(removeBtn);
      }

      wrap.appendChild(row);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'library-view__add-tone-btn';
    addBtn.textContent = t('library.addTone');
    addBtn.addEventListener('click', () => {
      tones.push(masterOptions[0] ?? 'R');
      render();
    });
    wrap.appendChild(addBtn);
  }

  render();
  return {
    element: wrap,
    getTones: () => [...tones],
  };
}

function createDefForm(config: DefFormConfig): HTMLElement {
  const form = document.createElement('div');
  form.className = 'library-view__form';

  const errorsEl = document.createElement('div');
  errorsEl.className = 'library-view__errors';
  errorsEl.hidden = true;

  const nameInput = document.createElement('input');
  nameInput.className = 'library-view__input';
  nameInput.value = config.def.name;
  nameInput.readOnly = config.readonly;

  const tonePicker = createTonePicker(config.def.tones, config.readonly);

  const getPreviewDef = (): ScaleDef | ChordDef => ({
    ...config.def,
    id: config.def.id || '__preview__',
    name: nameInput.value.trim() || config.def.name,
    tones: tonePicker.getTones(),
  });

  form.appendChild(createField(t('library.field.name'), nameInput));
  form.appendChild(createPlaybackRow(config.kind, getPreviewDef));
  form.appendChild(createField(t('library.field.tones'), tonePicker.element));
  form.appendChild(errorsEl);

  const actions = document.createElement('div');
  actions.className = 'library-view__form-actions';

  if (!config.readonly) {
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'library-view__btn library-view__btn--primary';
    saveBtn.textContent = t('library.save');
    saveBtn.addEventListener('click', () => {
      const next = {
        id: config.isNew ? '' : config.def.id,
        name: nameInput.value.trim(),
        tones: tonePicker.getTones(),
      };
      const errors = config.onSave(next);
      if (errors.length > 0) {
        errorsEl.textContent = errors.join('\n');
        errorsEl.hidden = false;
      } else {
        errorsEl.hidden = true;
      }
    });
    actions.appendChild(saveBtn);

    if (!config.isNew) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'library-view__btn library-view__btn--danger';
      delBtn.textContent = t('library.delete');
      delBtn.addEventListener('click', () => {
        if (window.confirm(t('library.deleteConfirm', { name: config.def.name }))) {
          config.onDelete();
        }
      });
      actions.appendChild(delBtn);
    }
  }

  if (config.onDuplicate) {
    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = 'library-view__btn';
    dupBtn.textContent = t('library.duplicate');
    dupBtn.addEventListener('click', () => {
      config.onDuplicate?.();
    });
    actions.appendChild(dupBtn);
  }

  form.appendChild(actions);
  return form;
}

function createPlaybackRow(
  kind: 'scale' | 'chord',
  getPreviewDef: () => ScaleDef | ChordDef,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'playback-toolbar';

  if (kind === 'scale') {
    row.appendChild(
      createLibraryPlayButton(
        t('library.preview.play'),
        t('library.preview.scaleAria'),
        () => {
          tonePlayer.stop();
          void tonePlayer.playScale(MVP_KEY, getPreviewDef() as ScaleDef);
        },
      ),
    );
    return row;
  }

  row.appendChild(
    createLibraryPlayButton(
      t('library.preview.block'),
      t('library.preview.blockAria'),
      () => {
        void tonePlayer.playChord(MVP_KEY, getPreviewDef() as ChordDef);
      },
    ),
  );
  row.appendChild(
    createLibraryPlayButton(
      t('library.preview.arpeggio'),
      t('library.preview.arpeggioAria'),
      () => {
        tonePlayer.stop();
        void tonePlayer.playChordArpeggio(MVP_KEY, getPreviewDef() as ChordDef);
      },
    ),
  );
  return row;
}

function createStrumPreviewRow(
  getPreviewDef: () => StrumPatternDef,
  timeSignatureInput: HTMLInputElement,
  notationInput: HTMLInputElement,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'playback-toolbar library-view__strum-preview';

  const bpmInput = document.createElement('input');
  bpmInput.type = 'number';
  bpmInput.className = 'playback-toolbar__input';
  bpmInput.min = String(MIN_BPM);
  bpmInput.max = String(MAX_BPM);
  bpmInput.step = '1';
  bpmInput.value = String(tonePlayer.getBpm() || DEFAULT_BPM);
  bpmInput.setAttribute('aria-label', t('library.preview.bpmAria'));

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'playback-toolbar__play';

  const syncButton = (): void => {
    const isActive = tonePlayer.isPlaybackActive('library:strum-preview');
    playBtn.textContent = isActive
      ? t('library.preview.stop')
      : t('library.preview.strum');
    playBtn.setAttribute(
      'aria-label',
      isActive
        ? t('library.preview.strumStopAria')
        : t('library.preview.strumAria'),
    );
    playBtn.classList.toggle('playback-toolbar__play--active', isActive);
  };

  const commitBpm = (): void => {
    const next = clampBpm(Number(bpmInput.value));
    bpmInput.value = String(next);
    if (tonePlayer.isPlaybackActive('library:strum-preview')) {
      tonePlayer.setBpm(next);
    }
  };

  const resyncPreviewPattern = (): void => {
    if (!tonePlayer.isPlaybackActive('library:strum-preview')) {
      return;
    }
    const preview = getPreviewDef();
    if (parseStrumPatternDef(preview) === null) {
      tonePlayer.stopRepeat();
      return;
    }
    tonePlayer.updateStrumPatternPreview(preview);
  };

  playBtn.addEventListener('click', () => {
    if (tonePlayer.isPlaybackActive('library:strum-preview')) {
      tonePlayer.stopRepeat();
      return;
    }
    const preview = getPreviewDef();
    if (parseStrumPatternDef(preview) === null) {
      window.alert(t('library.preview.invalid'));
      return;
    }
    void tonePlayer.previewStrumPatternRepeat(
      preview,
      clampBpm(Number(bpmInput.value)),
    );
  });

  bpmInput.addEventListener('change', commitBpm);
  bpmInput.addEventListener('blur', commitBpm);
  timeSignatureInput.addEventListener('change', resyncPreviewPattern);
  notationInput.addEventListener('change', resyncPreviewPattern);

  tonePlayer.subscribePlayback(syncButton);
  syncButton();

  row.appendChild(createPlaybackToolbarField('BPM', bpmInput));
  row.appendChild(playBtn);
  return row;
}

function createLibraryPlayButton(
  label: string,
  ariaLabel: string,
  onPlay: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'playback-toolbar__play';
  btn.setAttribute('aria-label', ariaLabel);
  btn.textContent = label;
  btn.addEventListener('click', () => {
    onPlay();
  });
  return btn;
}

function createField(label: string, control: HTMLElement): HTMLElement {
  const field = document.createElement('label');
  field.className = 'library-view__field';
  const span = document.createElement('span');
  span.className = 'library-view__field-label';
  span.textContent = label;
  field.appendChild(span);
  field.appendChild(control);
  return field;
}

function createMessage(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'library-view__message';
  p.textContent = text;
  return p;
}

function renderToolbar(
  toolbar: HTMLElement,
  callbacks: LibraryViewCallbacks,
): void {
  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'library-view__btn';
  downloadBtn.textContent = t('library.csv.download');
  downloadBtn.addEventListener('click', () => {
    const csv = exportLibraryCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guitar-practice-library.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  const uploadLabel = document.createElement('label');
  uploadLabel.className = 'library-view__btn library-view__btn--upload';
  uploadLabel.textContent = t('library.csv.upload');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv,text/csv';
  fileInput.hidden = true;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) {
      return;
    }
    const text = await file.text();
    const preview = parseLibraryCsv(text);
    if (preview.errors.length > 0) {
      window.alert(
        `${t('library.csv.error')}\n${preview.errors.slice(0, 8).join('\n')}`,
      );
      return;
    }
    const msg = t('library.csv.confirmDetail', {
      scaleCount: preview.scales.length,
      chordCount: preview.chords.length,
      blockCount: preview.songBlocks.length,
      songCount: preview.songs.length,
    });
    if (!window.confirm(msg)) {
      return;
    }
    saveCustomLibrary(applyCustomLibraryImport(preview));
    callbacks.onLibraryChanged();
  });
  uploadLabel.appendChild(fileInput);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'library-view__btn library-view__btn--danger';
  resetBtn.textContent = t('library.reset');
  resetBtn.addEventListener('click', () => {
    if (!window.confirm(t('library.reset.confirm1'))) {
      return;
    }
    if (!window.confirm(t('library.reset.confirm2'))) {
      return;
    }
    resetLibraryToInitial();
    callbacks.onLibraryChanged();
  });

  toolbar.appendChild(downloadBtn);
  toolbar.appendChild(uploadLabel);
  toolbar.appendChild(resetBtn);
}
