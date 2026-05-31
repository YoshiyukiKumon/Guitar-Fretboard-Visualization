import { KEYS } from '../domain/data/keys';
import { clampBpm, MAX_BPM, MIN_BPM } from '../domain/playback-bpm';
import { DEFAULT_STRUM_PATTERN_ID } from '../domain/strum-pattern/strum-pattern';
import { listStrumPatterns } from '../domain/music-library/registry';
import { generateCustomSongBlockId } from '../domain/music-library/generate-id';
import {
  getSongBlockById,
  getSongBlockSource,
  songsReferencingBlock,
} from '../domain/song/song-registry';
import { createDefaultSongMeasure } from '../domain/song/song-marker-labels';
import {
  isSectionLabelTaken,
  nextCopySectionLabel,
} from '../domain/song/section-label-utils';
import type {
  ExpandedMeasure,
  SongBlockDef,
  SongDef,
  SongMeasure,
  SongPart,
} from '../domain/song/song-types';
import { buildPartChartPreviewMeasures } from '../domain/song/expand-song-measures';
import { t } from '../i18n';
import { createMeasureListEditor } from './library-song-measure-editor';
import { createPlaybackToolbarField } from './playback-toolbar';
import {
  createSongChartView,
  mountSectionPreviewChartReflow,
  SECTION_PREVIEW_MEASURES_PER_ROW,
  unmountSectionPreviewChartReflow,
} from './song-chart-view';
import { createSectionPlayButton } from './song-section-play';

const SECTION_BTN_CLASS = 'library-view__btn library-song__measure-btn';

export interface SongPartOpenState {
  openIndices: Set<number>;
  pendingOpenIndex: number | null;
}

export interface SongPartsEditorOptions {
  getSong: () => SongDef;
  readonly: boolean;
  getBlock: (blockId: string) => SongBlockDef | undefined;
  /** 折りたたみの開閉状態（再描画後も保持） */
  partOpenState: SongPartOpenState;
  /** 構成（parts）の追加・削除・並べ替えなど */
  onStructureChange: (song: SongDef) => void;
  /** インライン小節の内容更新（再描画なし） */
  onInlineMeasuresChange: (
    partIndex: number,
    measures: SongMeasure[],
  ) => void;
  onBlockUpdate: (
    partIndex: number,
    blockId: string,
    block: SongBlockDef,
  ) => void;
  onBlockDraft: (block: SongBlockDef) => void;
  onPartPlay?: (partIndex: number) => void;
}

function cloneParts(parts: readonly SongPart[]): SongPart[] {
  return parts.map((part) =>
    part.type === 'inline'
      ? {
          type: 'inline' as const,
          measures: part.measures.map((measure) => ({
            ...measure,
            markers: measure.markers ? { ...measure.markers } : undefined,
            events: measure.events.map((event) => ({ ...event })),
          })),
        }
      : { ...part },
  );
}

function cloneBlockMeasures(block: SongBlockDef): SongBlockDef {
  return {
    ...block,
    measures: block.measures.map((measure) => ({
      ...measure,
      markers: measure.markers ? { ...measure.markers } : undefined,
      events: measure.events.map((event) => ({ ...event })),
    })),
  };
}

function appendSectionPlayButton(
  header: HTMLElement,
  partIndex: number,
  sectionLabel: string,
  onPartPlay: ((partIndex: number) => void) | undefined,
): void {
  if (!onPartPlay) {
    return;
  }
  const playBtn = createSectionPlayButton({
    partIndex,
    onPlay: () => onPartPlay(partIndex),
    sectionLabel,
  });
  playBtn.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  header.appendChild(playBtn);
}

function collectBlocksForSong(
  song: SongDef,
  getBlock: (blockId: string) => SongBlockDef | undefined,
): SongBlockDef[] {
  const blocks: SongBlockDef[] = [];
  const seen = new Set<string>();
  for (const part of song.parts) {
    if (part.type !== 'block' || seen.has(part.blockId)) {
      continue;
    }
    const block = getBlock(part.blockId);
    if (block) {
      blocks.push(block);
      seen.add(part.blockId);
    }
  }
  return blocks;
}

function partPreviewMeasures(
  song: SongDef,
  blocks: readonly SongBlockDef[],
  partIndex: number,
): ExpandedMeasure[] {
  return buildPartChartPreviewMeasures(song, blocks, partIndex);
}

function refreshSectionChartPreview(
  host: HTMLElement,
  song: SongDef,
  blocks: readonly SongBlockDef[],
  partIndex: number,
): void {
  unmountSectionPreviewChartReflow(host);
  host.replaceChildren(
    createSongChartView(
      partPreviewMeasures(song, blocks, partIndex),
      null,
      null,
      {
        singlePartPreview: true,
        isLastPartInSong: partIndex === song.parts.length - 1,
        sectionPreviewLayout: true,
        maxMeasuresPerRow: SECTION_PREVIEW_MEASURES_PER_ROW,
      },
    ),
  );
  mountSectionPreviewChartReflow(host, SECTION_PREVIEW_MEASURES_PER_ROW);
}

function formatSectionSummaryTitle(
  part: SongPart,
  block: SongBlockDef | undefined,
): string {
  if (part.type === 'block') {
    const label = block?.label ?? part.blockId;
    return `[${label}]`;
  }
  return t('library.song.inlinePart');
}

function shiftOpenPartIndices(
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

function swapOpenPartIndices(
  openIndices: Set<number>,
  a: number,
  b: number,
): void {
  const openA = openIndices.has(a);
  const openB = openIndices.has(b);
  if (openA) {
    openIndices.delete(a);
  }
  if (openB) {
    openIndices.delete(b);
  }
  if (openA) {
    openIndices.add(b);
  }
  if (openB) {
    openIndices.add(a);
  }
}

interface SectionSummaryContentOptions {
  part: SongPart;
  block: SongBlockDef | undefined;
  partIndex: number;
  editable: boolean;
  showClose: boolean;
  onClose?: () => void;
  getBlocks: () => SongBlockDef[];
  editor: SongPartsEditorOptions;
  song: SongDef;
}

function buildSectionSummaryContent(
  container: HTMLElement,
  options: SectionSummaryContentOptions,
): { titleEl: HTMLSpanElement; chartHost: HTMLElement } {
  const sectionLabel =
    options.part.type === 'block'
      ? (options.block?.label ?? options.part.blockId)
      : t('library.song.inlinePart');

  const summaryTop = document.createElement('div');
  summaryTop.className = 'library-song__part-summary-top';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'library-song__part-summary-title-group';

  const title = document.createElement('span');
  title.className = 'library-song__part-summary-title';
  title.textContent = formatSectionSummaryTitle(options.part, options.block);
  titleGroup.appendChild(title);

  if (options.editable) {
    const editIcon = document.createElement('span');
    editIcon.className = 'library-song__part-edit-icon';
    editIcon.setAttribute('aria-hidden', 'true');
    titleGroup.appendChild(editIcon);
  }

  summaryTop.appendChild(titleGroup);

  const summaryActions = document.createElement('div');
  summaryActions.className = 'library-song__part-summary-actions';
  appendSectionPlayButton(
    summaryActions,
    options.partIndex,
    sectionLabel,
    options.editor.onPartPlay,
  );

  if (options.showClose && options.onClose) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = `${SECTION_BTN_CLASS} library-song__close-section`;
    closeBtn.textContent = t('library.song.closeSectionEdit');
    closeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onClose!();
    });
    summaryActions.appendChild(closeBtn);
  }

  summaryTop.appendChild(summaryActions);
  container.appendChild(summaryTop);

  const chartHost = document.createElement('div');
  chartHost.className = 'library-song__part-summary-chart';
  refreshSectionChartPreview(
    chartHost,
    options.song,
    options.getBlocks(),
    options.partIndex,
  );
  container.appendChild(chartHost);

  return { titleEl: title, chartHost };
}

interface ReferenceSectionPartOptions {
  partIndex: number;
  getBlocks: () => SongBlockDef[];
  editor: SongPartsEditorOptions;
}

function createReferenceSectionPart(
  options: ReferenceSectionPartOptions,
): HTMLElement {
  const { partIndex, editor } = options;
  const song = editor.getSong();
  const part = song.parts[partIndex];
  if (!part || part.type !== 'block') {
    return document.createElement('div');
  }

  const block = editor.getBlock(part.blockId);

  const wrap = document.createElement('div');
  wrap.className =
    'library-song__part library-song__part--reference library-song__part--compact';

  buildSectionSummaryContent(wrap, {
    part,
    block,
    partIndex,
    editable: false,
    showClose: false,
    getBlocks: options.getBlocks,
    editor,
    song,
  });

  return wrap;
}

interface EditableSectionPartOptions {
  partIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openPartIndices: Set<number>;
  getBlocks: () => SongBlockDef[];
  editor: SongPartsEditorOptions;
}

function createEditableSectionPart(
  options: EditableSectionPartOptions,
): HTMLElement {
  const { partIndex, editor } = options;
  const song = editor.getSong();
  const part = song.parts[partIndex];
  if (!part) {
    return document.createElement('div');
  }

  const block =
    part.type === 'block' ? editor.getBlock(part.blockId) : undefined;

  const details = document.createElement('details');
  details.className =
    'library-song__part library-song__part--collapsible';
  details.open = options.open;

  details.addEventListener('toggle', () => {
    options.onOpenChange(details.open);
  });

  const summary = document.createElement('summary');
  summary.className = 'library-song__part-summary';

  const { titleEl: title, chartHost } = buildSectionSummaryContent(summary, {
    part,
    block,
    partIndex,
    editable: true,
    showClose: true,
    onClose: () => {
      details.open = false;
      options.onOpenChange(false);
    },
    getBlocks: options.getBlocks,
    editor,
    song,
  });

  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'library-song__part-body';

  const refreshPreview = (): void => {
    const currentSong = editor.getSong();
    title.textContent = formatSectionSummaryTitle(
      currentSong.parts[partIndex] ?? part,
      currentSong.parts[partIndex]?.type === 'block'
        ? editor.getBlock(currentSong.parts[partIndex].blockId)
        : undefined,
    );
    refreshSectionChartPreview(
      chartHost,
      currentSong,
      options.getBlocks(),
      partIndex,
    );
  };

  if (part.type === 'block') {
    const header = document.createElement('div');
    header.className = 'library-song__part-header-row';

    const sectionLabelEl = document.createElement('span');
    sectionLabelEl.className = 'library-song__part-header-label';
    sectionLabelEl.textContent = t('library.song.sectionLabel');
    header.appendChild(sectionLabelEl);

    const labelInput = document.createElement('input');
    labelInput.className =
      'library-view__input library-song__section-label';
    labelInput.value = block?.label ?? part.blockId;
    labelInput.setAttribute('aria-label', t('library.song.sectionLabel'));
    labelInput.addEventListener('change', () => {
      const currentPart = editor.getSong().parts[partIndex];
      if (currentPart?.type !== 'block') {
        return;
      }
      const currentBlock = editor.getBlock(currentPart.blockId);
      if (!currentBlock) {
        return;
      }
      const nextLabel = labelInput.value.trim();
      if (!nextLabel) {
        labelInput.value = currentBlock.label;
        return;
      }
      if (
        isSectionLabelTaken(
          nextLabel,
          editor.getSong(),
          editor.getBlock,
          currentPart.blockId,
        )
      ) {
        window.alert(
          t('library.song.sectionLabelDuplicate', { label: nextLabel }),
        );
        labelInput.value = currentBlock.label;
        return;
      }
      editor.onBlockUpdate(partIndex, currentPart.blockId, {
        ...currentBlock,
        label: nextLabel,
      });
      refreshPreview();
    });
    header.appendChild(labelInput);

    if (block) {
      const source = getSongBlockSource(block.id);
      if (source === 'builtin') {
        const hint = document.createElement('span');
        hint.className = 'library-song__part-hint';
        hint.textContent = t('library.song.sectionBuiltinHint');
        header.appendChild(hint);
      } else {
        const refs = songsReferencingBlock(block.id);
        if (refs.length > 1) {
          const hint = document.createElement('span');
          hint.className = 'library-song__part-hint';
          hint.textContent = t('library.song.sectionSharedHint');
          header.appendChild(hint);
        }
      }
    }

    body.appendChild(header);

    body.appendChild(
      createMeasureListEditor({
        measures: block?.measures ?? [],
        readonly: false,
        onChange: (measures) => {
          const currentPart = editor.getSong().parts[partIndex];
          if (currentPart?.type !== 'block') {
            return;
          }
          const currentBlock = editor.getBlock(currentPart.blockId);
          if (!currentBlock) {
            return;
          }
          editor.onBlockUpdate(partIndex, currentPart.blockId, {
            ...currentBlock,
            measures,
          });
          refreshPreview();
        },
      }),
    );
  } else {
    const header = document.createElement('div');
    header.className = 'library-song__part-header-row';

    const inlineTitle = document.createElement('span');
    inlineTitle.className = 'library-song__part-header-label';
    inlineTitle.textContent = t('library.song.inlinePart');
    header.appendChild(inlineTitle);
    body.appendChild(header);

    body.appendChild(
      createMeasureListEditor({
        measures: part.measures,
        readonly: false,
        onChange: (measures) => {
          editor.onInlineMeasuresChange(partIndex, measures);
          refreshPreview();
        },
      }),
    );
  }

  const actions = document.createElement('div');
  actions.className = 'library-song__part-actions';

  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.className = 'library-view__btn library-song__part-action-btn';
  upBtn.textContent = t('library.song.movePartUp');
  upBtn.disabled = partIndex === 0;
  upBtn.setAttribute('aria-label', t('library.song.movePartUp'));
  upBtn.addEventListener('click', () => {
    if (partIndex === 0) {
      return;
    }
    swapOpenPartIndices(options.openPartIndices, partIndex, partIndex - 1);
    const current = editor.getSong();
    const parts = cloneParts(current.parts);
    [parts[partIndex - 1], parts[partIndex]] = [
      parts[partIndex],
      parts[partIndex - 1],
    ];
    editor.onStructureChange({ ...current, parts });
  });
  actions.appendChild(upBtn);

  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.className = 'library-view__btn library-song__part-action-btn';
  downBtn.textContent = t('library.song.movePartDown');
  downBtn.disabled = partIndex === song.parts.length - 1;
  downBtn.setAttribute('aria-label', t('library.song.movePartDown'));
  downBtn.addEventListener('click', () => {
    if (partIndex >= song.parts.length - 1) {
      return;
    }
    swapOpenPartIndices(options.openPartIndices, partIndex, partIndex + 1);
    const current = editor.getSong();
    const parts = cloneParts(current.parts);
    [parts[partIndex], parts[partIndex + 1]] = [
      parts[partIndex + 1],
      parts[partIndex],
    ];
    editor.onStructureChange({ ...current, parts });
  });
  actions.appendChild(downBtn);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className =
    'library-view__btn library-view__btn--danger library-song__part-action-btn';
  removeBtn.textContent = t('library.song.removePart');
  removeBtn.addEventListener('click', () => {
    if (!window.confirm(t('library.song.removePartConfirm'))) {
      return;
    }
    options.openPartIndices.delete(partIndex);
    shiftOpenPartIndices(options.openPartIndices, partIndex + 1, -1);
    const current = editor.getSong();
    const parts = cloneParts(current.parts);
    parts.splice(partIndex, 1);
    editor.onStructureChange({ ...current, parts });
  });
  actions.appendChild(removeBtn);

  body.appendChild(actions);
  details.appendChild(body);

  return details;
}

export function createSongPartsEditor(
  options: SongPartsEditorOptions,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'library-song__parts';

  const { partOpenState } = options;

  const getBlocks = (): SongBlockDef[] =>
    collectBlocksForSong(options.getSong(), options.getBlock);

  const render = (): void => {
    root.replaceChildren();
    const { readonly } = options;
    if (readonly) {
      return;
    }
    const song = options.getSong();

    song.parts.forEach((part, partIndex) => {
      if (part.type === 'block' && part.reference) {
        root.appendChild(
          createReferenceSectionPart({
            partIndex,
            getBlocks,
            editor: options,
          }),
        );
        return;
      }
      root.appendChild(
        createEditableSectionPart({
          partIndex,
          open:
            partOpenState.openIndices.has(partIndex) ||
            (partOpenState.pendingOpenIndex !== null &&
              partOpenState.pendingOpenIndex === partIndex),
          onOpenChange: (open) => {
            if (open) {
              partOpenState.openIndices.add(partIndex);
            } else {
              partOpenState.openIndices.delete(partIndex);
            }
            if (partOpenState.pendingOpenIndex === partIndex) {
              partOpenState.pendingOpenIndex = null;
            }
          },
          openPartIndices: partOpenState.openIndices,
          getBlocks,
          editor: options,
        }),
      );
    });

    partOpenState.pendingOpenIndex = null;

    if (!readonly) {
      const addSection = document.createElement('div');
      addSection.className = 'library-song__part-add';

      const heading = document.createElement('h3');
      heading.className = 'library-song__part-add-heading';
      heading.textContent = t('library.song.addSectionGroup');
      addSection.appendChild(heading);

      const newSectionRow = document.createElement('div');
      newSectionRow.className = 'library-song__part-add-row';

      const addBlockBtn = document.createElement('button');
      addBlockBtn.type = 'button';
      addBlockBtn.className = 'library-view__btn library-song__part-action-btn';
      addBlockBtn.textContent = t('library.song.addNewSection');
      addBlockBtn.addEventListener('click', () => {
        const label =
          window.prompt(t('library.song.sectionLabelPrompt'), 'A')?.trim() ??
          '';
        if (!label) {
          return;
        }
        const current = options.getSong();
        if (isSectionLabelTaken(label, current, options.getBlock)) {
          window.alert(
            t('library.song.sectionLabelDuplicate', { label }),
          );
          return;
        }
        const id = generateCustomSongBlockId(label);
        const block: SongBlockDef = {
          id,
          label,
          measures: [createDefaultSongMeasure()],
        };
        options.onBlockDraft(block);
        partOpenState.pendingOpenIndex = current.parts.length;
        options.onStructureChange({
          ...current,
          parts: [...cloneParts(current.parts), { type: 'block', blockId: id }],
        });
      });
      newSectionRow.appendChild(addBlockBtn);
      addSection.appendChild(newSectionRow);

      const existingRow = document.createElement('div');
      existingRow.className =
        'library-song__part-add-row library-song__part-add-picker';

      const blockSelect = document.createElement('select');
      blockSelect.className =
        'library-view__input library-song__part-block-select library-song__part-add-select';
      blockSelect.setAttribute('aria-label', t('library.song.pickSectionToAdd'));
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = t('library.song.pickSectionToAdd');
      blockSelect.appendChild(placeholder);

      for (const block of collectBlocksForSong(
        options.getSong(),
        options.getBlock,
      )) {
        const opt = document.createElement('option');
        opt.value = block.id;
        const source = getSongBlockSource(block.id);
        opt.textContent =
          source === 'builtin'
            ? `${block.label} (${t('library.badge.builtin')})`
            : block.label;
        blockSelect.appendChild(opt);
      }
      existingRow.appendChild(blockSelect);

      const refBtn = document.createElement('button');
      refBtn.type = 'button';
      refBtn.className = 'library-view__btn library-song__part-action-btn';
      refBtn.textContent = t('library.song.addSectionReference');
      refBtn.addEventListener('click', () => {
        const blockId = blockSelect.value;
        if (!blockId) {
          return;
        }
        const current = options.getSong();
        options.onStructureChange({
          ...current,
          parts: [
            ...cloneParts(current.parts),
            { type: 'block', blockId, reference: true },
          ],
        });
      });
      existingRow.appendChild(refBtn);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'library-view__btn library-song__part-action-btn';
      copyBtn.textContent = t('library.song.addSectionCopy');
      copyBtn.addEventListener('click', () => {
        const blockId = blockSelect.value;
        if (!blockId) {
          return;
        }
        const source = getSongBlockById(blockId);
        if (!source) {
          return;
        }
        const current = options.getSong();
        const id = generateCustomSongBlockId(source.label);
        const newLabel = nextCopySectionLabel(
          source.label,
          current,
          options.getBlock,
        );
        const block = cloneBlockMeasures({
          ...source,
          id,
          label: newLabel,
        });
        options.onBlockDraft(block);
        partOpenState.pendingOpenIndex = current.parts.length;
        options.onStructureChange({
          ...current,
          parts: [...cloneParts(current.parts), { type: 'block', blockId: id }],
        });
      });
      existingRow.appendChild(copyBtn);
      addSection.appendChild(existingRow);

      const inlineRow = document.createElement('div');
      inlineRow.className = 'library-song__part-add-row';

      const addInlineBtn = document.createElement('button');
      addInlineBtn.type = 'button';
      addInlineBtn.className = 'library-view__btn library-song__part-action-btn';
      addInlineBtn.textContent = t('library.song.addInlinePart');
      addInlineBtn.addEventListener('click', () => {
        const current = options.getSong();
        partOpenState.pendingOpenIndex = current.parts.length;
        options.onStructureChange({
          ...current,
          parts: [
            ...cloneParts(current.parts),
            {
              type: 'inline',
              measures: [
                {
                  events: [
                    {
                      offsetBeats: 0,
                      chordRootKeyId: current.defaultKeyId,
                      chordId: 'major-triad',
                    },
                  ],
                },
              ],
            },
          ],
        });
      });
      inlineRow.appendChild(addInlineBtn);
      addSection.appendChild(inlineRow);

      root.appendChild(addSection);
    }
  };

  render();
  return root;
}

export function createSongMetaFields(
  song: SongDef,
  readonly: boolean,
  onChange: (song: SongDef) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'library-song__meta';

  const keySelect = document.createElement('select');
  keySelect.className =
    'playback-toolbar__select playback-toolbar__select--compact library-song__meta-key';
  keySelect.disabled = readonly;
  for (const key of KEYS) {
    const opt = document.createElement('option');
    opt.value = key.id;
    opt.textContent = key.id;
    opt.selected = song.defaultKeyId === key.id;
    keySelect.appendChild(opt);
  }
  keySelect.addEventListener('change', () => {
    onChange({ ...song, defaultKeyId: keySelect.value });
  });
  wrap.appendChild(
    createPlaybackToolbarField(
      t('library.field.defaultKey'),
      keySelect,
      'library-song__meta-field',
    ),
  );

  const tsInput = document.createElement('input');
  tsInput.className =
    'playback-toolbar__input playback-toolbar__input--compact library-song__meta-timesig';
  tsInput.value = song.defaultTimeSignature;
  tsInput.readOnly = readonly;
  tsInput.setAttribute('aria-label', t('library.field.timeSig'));
  tsInput.addEventListener('change', () => {
    onChange({ ...song, defaultTimeSignature: tsInput.value.trim() || '4/4' });
  });
  wrap.appendChild(
    createPlaybackToolbarField(
      t('library.field.timeSig'),
      tsInput,
      'library-song__meta-field',
    ),
  );

  const bpmInput = document.createElement('input');
  bpmInput.type = 'number';
  bpmInput.min = String(MIN_BPM);
  bpmInput.max = String(MAX_BPM);
  bpmInput.className =
    'playback-toolbar__input playback-toolbar__input--compact library-song__meta-bpm';
  bpmInput.value = String(song.bpm ?? 120);
  bpmInput.readOnly = readonly;
  bpmInput.setAttribute('aria-label', 'BPM');
  bpmInput.addEventListener('change', () => {
    onChange({ ...song, bpm: clampBpm(Number(bpmInput.value)) });
  });
  wrap.appendChild(
    createPlaybackToolbarField('BPM', bpmInput, 'library-song__meta-field'),
  );

  const strumSelect = document.createElement('select');
  strumSelect.className =
    'playback-toolbar__select playback-toolbar__select--compact library-song__meta-strum';
  strumSelect.disabled = readonly;
  for (const { def } of listStrumPatterns()) {
    const opt = document.createElement('option');
    opt.value = def.id;
    opt.textContent = def.name;
    opt.selected = song.strumPatternId === def.id;
    strumSelect.appendChild(opt);
  }
  strumSelect.addEventListener('change', () => {
    onChange({ ...song, strumPatternId: strumSelect.value });
  });
  wrap.appendChild(
    createPlaybackToolbarField(
      t('library.tabs.strum'),
      strumSelect,
      'library-song__meta-field library-song__meta-field--strum',
    ),
  );

  const playCountInput = document.createElement('input');
  playCountInput.type = 'number';
  playCountInput.min = '0';
  playCountInput.className =
    'playback-toolbar__input playback-toolbar__input--compact library-song__meta-playcount';
  playCountInput.value = String(song.playCount);
  playCountInput.readOnly = readonly;
  playCountInput.setAttribute('aria-label', t('library.song.playCount'));
  playCountInput.addEventListener('change', () => {
    onChange({
      ...song,
      playCount: Math.max(0, Math.floor(Number(playCountInput.value))),
    });
  });
  wrap.appendChild(
    createPlaybackToolbarField(
      t('library.song.playCount'),
      playCountInput,
      'library-song__meta-field',
    ),
  );

  return wrap;
}

export function confirmDeleteBlock(block: { id: string; label: string }): boolean {
  const refs = songsReferencingBlock(block.id);
  if (refs.length === 0) {
    return window.confirm(t('library.deleteConfirm', { name: block.label }));
  }
  const names = refs.map((song) => song.name).join(', ');
  return window.confirm(
    t('library.song.blockDeleteConfirm', { label: block.label, songs: names }),
  );
}

export function cloneSongBlockForDraft(block: SongBlockDef): SongBlockDef {
  return cloneBlockMeasures(block);
}

export function createEmptyDraftSong(): SongDef {
  return {
    id: '',
    name: 'New Song',
    defaultKeyId: KEYS[0].id,
    defaultTimeSignature: '4/4',
    strumPatternId: DEFAULT_STRUM_PATTERN_ID,
    playCount: 1,
    parts: [
      {
        type: 'inline',
        measures: [
          {
            events: [
              { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
            ],
          },
        ],
      },
    ],
  };
}

export function collectReferencedBlockIds(song: SongDef): string[] {
  const ids: string[] = [];
  for (const part of song.parts) {
    if (part.type === 'block') {
      ids.push(part.blockId);
    }
  }
  return ids;
}

export function resolveSongBlocksForSave(
  song: SongDef,
  blockDrafts: ReadonlyMap<string, SongBlockDef>,
): SongBlockDef[] {
  return collectReferencedBlockIds(song)
    .map((id) => blockDrafts.get(id) ?? getSongBlockById(id))
    .filter((block): block is SongBlockDef => block !== undefined);
}
