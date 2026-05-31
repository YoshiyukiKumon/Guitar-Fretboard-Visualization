import { tonePlayer } from '../audio/tone-player';
import {
  buildSongChartPreviewMeasures,
  expandSongMeasures,
  playbackLoopCountForExpandedMeasures,
} from '../domain/song/expand-song-measures';
import {
  buildPartEndSourceIndices,
  buildPartStartPartIndices,
} from '../domain/song/flatten-song-parts';
import { generateCustomSongBlockId } from '../domain/music-library/generate-id';
import {
  deleteCustomSong,
  duplicateSongAsCustom,
  duplicateSongBlockAsCustom,
  upsertCustomSong,
  upsertCustomSongBlock,
} from '../domain/music-library/song-crud';
import { cloneSongMeasure } from '../domain/song/measure-utils';
import {
  getAllSongBlocks,
  getSongBlockById,
  getSongBlockSource,
  listSongs,
} from '../domain/song/song-registry';
import type {
  SongBlockDef,
  SongDef,
  SongMeasure,
  SongMeasureMarkers,
} from '../domain/song/song-types';
import { SONG_MARKER_KEYS } from '../domain/song/song-marker-labels';
import { collectSongSaveWarnings } from '../domain/song/validate-song';
import { t } from '../i18n';
import { createSongPlayButton, syncSongPlayButtonState } from './song-section-play';
import {
  createEmptyDraftSong,
  createSongMetaFields,
  createSongPartsEditor,
  resolveSongBlocksForSave,
  collectReferencedBlockIds,
  type SongPartOpenState,
} from './library-song-parts-editor';
import { createListEditor } from './library-list-editor';
import type { LibraryViewCallbacks, LibraryViewState } from './library-view';
import { createSongChartView } from './song-chart-view';
import { playSongSection } from './song-section-play';

function createMessage(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'library-view__message';
  p.textContent = text;
  return p;
}

function normalizeSnapshotMarkers(
  markers: SongMeasureMarkers | undefined,
): string[] {
  if (!markers) {
    return [];
  }
  return SONG_MARKER_KEYS.filter((key) => markers[key] === true);
}

function normalizeSnapshotMeasure(measure: SongMeasure) {
  return {
    keyId: measure.keyId ?? null,
    timeSignature: measure.timeSignature ?? null,
    strumPatternId: measure.strumPatternId ?? null,
    markers: normalizeSnapshotMarkers(measure.markers),
    events: measure.events.map((event) => ({ ...event })),
  };
}

function createSongFormSnapshot(
  song: SongDef,
  name: string,
  blockDrafts: Map<string, SongBlockDef>,
  resolveBlock: (blockId: string) => SongBlockDef | undefined,
): string {
  const blocks = collectReferencedBlockIds(song)
    .map((blockId) => blockDrafts.get(blockId) ?? resolveBlock(blockId))
    .filter((block): block is SongBlockDef => block !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((block) => ({
      id: block.id,
      label: block.label,
      measures: block.measures.map((measure) => normalizeSnapshotMeasure(measure)),
    }));

  const normalizedSong = {
    id: song.id,
    name,
    defaultKeyId: song.defaultKeyId,
    defaultTimeSignature: song.defaultTimeSignature,
    bpm: song.bpm,
    strumPatternId: song.strumPatternId,
    playCount: song.playCount,
    parts: song.parts.map((part) =>
      part.type === 'inline'
        ? {
            type: 'inline' as const,
            measures: part.measures.map((measure) =>
              normalizeSnapshotMeasure(measure),
            ),
          }
        : {
            type: 'block' as const,
            blockId: part.blockId,
            reference: part.reference,
          },
    ),
  };

  return JSON.stringify({ song: normalizedSong, blocks });
}

function createReadonlyStructureChart(
  song: SongDef,
  blocks: readonly SongBlockDef[],
  onPartPlay: (partIndex: number) => void,
): HTMLElement {
  const expanded = buildSongChartPreviewMeasures(song, blocks);
  const wrap = document.createElement('div');
  wrap.className = 'library-song__structure-chart';

  const heading = document.createElement('h3');
  heading.className = 'library-song__structure-heading';
  heading.textContent = t('library.song.structurePreview');
  wrap.appendChild(heading);

  wrap.appendChild(
    createSongChartView(expanded, null, null, {
      partIndexBySourceMeasure: buildPartStartPartIndices(song, blocks),
      partEndSourceIndices: buildPartEndSourceIndices(song, blocks),
      onPartPlay,
    }),
  );
  return wrap;
}

export function renderSongPanel(
  body: HTMLElement,
  state: LibraryViewState,
  callbacks: LibraryViewCallbacks,
): void {
  const items = listSongs();
  const selectedId =
    state.selectedSongId === '__new__'
      ? '__new__'
      : (state.selectedSongId ?? items[0]?.def.id ?? null);
  const selected =
    selectedId === '__new__'
      ? undefined
      : items.find((item) => item.def.id === selectedId) ?? items[0];

  const isNew = state.selectedSongId === '__new__';
  const defForTitle =
    isNew
      ? (state.draftSong ?? createEmptyDraftSong())
      : selected?.def;

  body.appendChild(
    createListEditor(
      {
        items: items.map((item) => ({
          id: item.def.id,
          label: item.def.name,
          badge:
            item.source === 'builtin' ? t('library.badge.builtin') : null,
        })),
        selectedId: selected?.def.id ?? null,
        detailTitle:
          state.selectedSongId === '__new__' || selected || isNew
            ? (defForTitle?.name ?? t('library.song.newSong'))
            : null,
        onSelect: (id) => {
          callbacks.onStateChange({
            ...state,
            selectedSongId: id,
            draftSong: null,
            draftSongBlocks: null,
          });
        },
        onAdd: () => {
          callbacks.onStateChange({
            ...state,
            tab: 'song',
            selectedSongId: '__new__',
            draftSong: createEmptyDraftSong(),
            draftSongBlocks: null,
          });
        },
        renderForm: () => {
          if (!selected && state.selectedSongId !== '__new__') {
            return createMessage(t('library.empty.song'));
          }
          const isNew = state.selectedSongId === '__new__';
          const def = isNew
            ? (state.draftSong ?? createEmptyDraftSong())
            : selected!.def;
          const readonly = !isNew && selected!.source === 'builtin';
          return createSongForm(def, readonly, isNew, callbacks, state);
        },
        mobileDetailWhenSelected: true,
      },
      'song',
    ),
  );
}

function createSongForm(
  def: SongDef,
  readonly: boolean,
  isNew: boolean,
  callbacks: LibraryViewCallbacks,
  state: LibraryViewState,
): HTMLElement {
  const form = document.createElement('div');
  form.className = 'library-view__form library-song__form';

  const blockDrafts = new Map<string, SongBlockDef>();
  for (const block of state.draftSongBlocks ?? []) {
    blockDrafts.set(block.id, {
      ...block,
      measures: block.measures.map((measure) => cloneSongMeasure(measure)),
    });
  }
  for (const blockId of collectReferencedBlockIds(def)) {
    if (blockDrafts.has(blockId)) {
      continue;
    }
    const fromState = state.draftSongBlocks?.find((block) => block.id === blockId);
    if (fromState) {
      blockDrafts.set(blockId, {
        ...fromState,
        measures: fromState.measures.map((measure) => cloneSongMeasure(measure)),
      });
    }
  }

  let draft: SongDef = {
    ...def,
    parts: def.parts.map((part) =>
      part.type === 'inline'
        ? {
            type: 'inline' as const,
            measures: part.measures.map((measure) => ({
              ...measure,
              events: measure.events.map((event) => ({ ...event })),
            })),
          }
        : { ...part },
    ),
  };

  const resolveBlock = (blockId: string): SongBlockDef | undefined =>
    blockDrafts.get(blockId) ?? getSongBlockById(blockId);

  const initialSnapshot = createSongFormSnapshot(
    draft,
    draft.name,
    blockDrafts,
    resolveBlock,
  );
  let updateSaveButtonState = (): void => {};

  const forkBuiltinBlock = (
    partIndex: number,
    blockId: string,
    block: SongBlockDef,
  ): { song: SongDef; block: SongBlockDef } => {
    const forked = duplicateSongBlockAsCustom(blockId);
    if (!forked) {
      return { song: draft, block };
    }
    const newId = generateCustomSongBlockId(block.label);
    const nextBlock: SongBlockDef = {
      ...forked,
      id: newId,
      label: block.label.trim() || forked.label,
      measures: block.measures.map((measure) => cloneSongMeasure(measure)),
    };
    blockDrafts.set(newId, nextBlock);
    const parts = draft.parts.map((part, index) =>
      index === partIndex && part.type === 'block'
        ? { ...part, blockId: newId }
        : part,
    );
    return { song: { ...draft, parts }, block: nextBlock };
  };

  const handleBlockUpdate = (
    partIndex: number,
    blockId: string,
    block: SongBlockDef,
  ): void => {
    if (readonly) {
      return;
    }
    if (getSongBlockSource(blockId) === 'builtin') {
      const forked = forkBuiltinBlock(partIndex, blockId, block);
      draft = forked.song;
      blockDrafts.set(forked.block.id, {
        ...forked.block,
        measures: forked.block.measures.map((measure) =>
          cloneSongMeasure(measure),
        ),
      });
    } else {
      blockDrafts.set(blockId, {
        ...block,
        measures: block.measures.map((measure) => cloneSongMeasure(measure)),
      });
    }
    updateSaveButtonState();
  };

  const handleInlineMeasuresChange = (
    partIndex: number,
    measures: SongMeasure[],
  ): void => {
    if (readonly) {
      return;
    }
    draft = {
      ...draft,
      parts: draft.parts.map((part, index) =>
        index === partIndex && part.type === 'inline'
          ? { ...part, measures }
          : part,
      ),
    };
    updateSaveButtonState();
  };

  const handleStructureChange = (next: SongDef): void => {
    draft = next;
    renderParts();
    updateSaveButtonState();
  };

  const duplicateAsCustom = (): void => {
    const result = duplicateSongAsCustom(def.id);
    if (result) {
      callbacks.onStateChange({
        ...state,
        tab: 'song',
        selectedSongId: '__new__',
        draftSong: result.song,
        draftSongBlocks: result.blocks,
      });
    }
  };

  if (readonly) {
    const banner = document.createElement('div');
    banner.className = 'library-song__readonly-banner';
    banner.setAttribute('role', 'status');

    const bannerText = document.createElement('p');
    bannerText.className = 'library-song__readonly-banner-text';
    bannerText.textContent = t('library.song.builtinReadonlyBanner');
    banner.appendChild(bannerText);
    form.appendChild(banner);
  }

  const nameRow = document.createElement('div');
  nameRow.className = 'library-song__name-row';

  const nameInput = document.createElement('input');
  nameInput.className = 'library-view__input';
  nameInput.value = draft.name;
  nameInput.readOnly = readonly;
  nameInput.addEventListener('input', () => {
    draft = { ...draft, name: nameInput.value };
    updateSaveButtonState();
  });
  nameRow.appendChild(nameInput);

  const previewBtn = createSongPlayButton();
  previewBtn.setAttribute('aria-label', t('song.playAria'));

  const syncPreviewButton = (): void => {
    syncSongPlayButtonState(
      previewBtn,
      tonePlayer.isPlaybackActive('song:play'),
      t('song.playAria'),
      t('song.stopAria'),
    );
  };

  previewBtn.addEventListener('click', () => {
    if (tonePlayer.isPlaybackActive('song:play')) {
      tonePlayer.stopRepeat();
      return;
    }
    const blocksById = new Map(getAllSongBlocks().map((block) => [block.id, block]));
    for (const block of resolveSongBlocksForSave(draft, blockDrafts)) {
      blocksById.set(block.id, block);
    }
    const expanded = expandSongMeasures(
      draft,
      [...blocksById.values()],
      draft.playCount,
    );
    void tonePlayer.playSong(
      expanded,
      draft.strumPatternId,
      playbackLoopCountForExpandedMeasures(draft.playCount),
      draft.bpm,
      { scope: 'full' },
    );
  });
  tonePlayer.subscribePlayback(syncPreviewButton);
  syncPreviewButton();
  nameRow.appendChild(previewBtn);
  form.appendChild(nameRow);

  const bodyHost = document.createElement('div');
  form.appendChild(bodyHost);

  const metaHost = document.createElement('div');
  const partsHost = document.createElement('div');
  bodyHost.appendChild(metaHost);
  if (!readonly) {
    bodyHost.appendChild(partsHost);
  }

  const renderMeta = (): void => {
    metaHost.replaceChildren();
    metaHost.appendChild(
      createSongMetaFields(draft, readonly, (next) => {
        draft = next;
        updateSaveButtonState();
      }),
    );
    if (readonly) {
      const blocksById = new Map(
        getAllSongBlocks().map((block) => [block.id, block]),
      );
      for (const block of resolveSongBlocksForSave(draft, blockDrafts)) {
        blocksById.set(block.id, block);
      }
      metaHost.appendChild(
        createReadonlyStructureChart(
          draft,
          [...blocksById.values()],
          (partIndex) => {
            playSongSection(
              draft,
              [...blocksById.values()],
              partIndex,
              draft.strumPatternId,
              draft.bpm,
            );
          },
        ),
      );
    }
  };

  const partOpenState: SongPartOpenState = {
    openIndices: new Set<number>(),
    pendingOpenIndex: null,
  };

  const renderParts = (): void => {
    partsHost.replaceChildren();
    if (readonly) {
      return;
    }
    partsHost.appendChild(
      createSongPartsEditor({
        getSong: () => draft,
        readonly,
        partOpenState,
        getBlock: resolveBlock,
        onStructureChange: handleStructureChange,
        onInlineMeasuresChange: handleInlineMeasuresChange,
        onBlockUpdate: handleBlockUpdate,
        onBlockDraft: (block) => {
          blockDrafts.set(block.id, {
            ...block,
            measures: block.measures.map((measure) => cloneSongMeasure(measure)),
          });
          updateSaveButtonState();
        },
        onPartPlay: (partIndex) => {
          const blocksById = new Map(
            getAllSongBlocks().map((block) => [block.id, block]),
          );
          for (const block of resolveSongBlocksForSave(draft, blockDrafts)) {
            blocksById.set(block.id, block);
          }
          playSongSection(
            draft,
            [...blocksById.values()],
            partIndex,
            draft.strumPatternId,
            draft.bpm,
          );
        },
      }),
    );
  };

  renderMeta();
  renderParts();

  const errorsEl = document.createElement('div');
  errorsEl.className = 'library-view__errors';

  const actions = document.createElement('div');
  actions.className = 'library-view__actions library-song__form-actions';

  if (!readonly) {
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'library-view__btn library-view__btn--primary';
    saveBtn.textContent = t('library.save');
    updateSaveButtonState = () => {
      const dirty =
        isNew ||
        createSongFormSnapshot(
          draft,
          nameInput.value,
          blockDrafts,
          resolveBlock,
        ) !== initialSnapshot;
      saveBtn.disabled = !dirty;
      saveBtn.classList.toggle('library-view__btn--primary', dirty);
      saveBtn.classList.toggle('library-view__btn--saved', !dirty);
    };
    updateSaveButtonState();
    saveBtn.addEventListener('click', () => {
      errorsEl.textContent = '';
      const toSave = { ...draft, name: nameInput.value };
      const blocksById = new Map(
        getAllSongBlocks().map((block) => [block.id, block]),
      );
      for (const block of blockDrafts.values()) {
        blocksById.set(block.id, block);
      }
      const blocksForValidation = [...blocksById.values()];
      const warnings = collectSongSaveWarnings(toSave, blocksForValidation);
      if (
        warnings.length > 0 &&
        !window.confirm(
          t('library.song.saveWarningsConfirm', {
            warnings: warnings.join('\n'),
          }),
        )
      ) {
        return;
      }

      const draftBlockLookup = new Map(blockDrafts);
      for (const block of state.draftSongBlocks ?? []) {
        if (!draftBlockLookup.has(block.id)) {
          draftBlockLookup.set(block.id, block);
        }
      }
      const blocksToPersist = [
        ...new Map(
          resolveSongBlocksForSave(toSave, draftBlockLookup).map((block) => [
            block.id,
            block,
          ]),
        ).values(),
      ];

      const blockErrors: string[] = [];
      for (const block of blocksToPersist) {
        if (getSongBlockSource(block.id) === 'builtin') {
          continue;
        }
        const blockResult = upsertCustomSongBlock(block);
        if (!blockResult.ok) {
          blockErrors.push(...blockResult.errors);
          continue;
        }
        if (blockResult.id && blockResult.id !== block.id) {
          const oldId = block.id;
          toSave.parts = toSave.parts.map((part) =>
            part.type === 'block' && part.blockId === oldId
              ? { ...part, blockId: blockResult.id! }
              : part,
          );
          for (const draftBlock of blocksToPersist) {
            if (draftBlock.id === oldId) {
              draftBlock.id = blockResult.id;
            }
          }
        }
      }
      if (blockErrors.length > 0) {
        errorsEl.textContent = blockErrors.join('\n');
        return;
      }

      const result = upsertCustomSong(toSave, blocksToPersist);
      if (result.ok) {
        callbacks.onLibraryChanged();
        callbacks.onStateChange({
          ...state,
          selectedSongId: result.id ?? draft.id,
          draftSong: null,
          draftSongBlocks: null,
        });
        return;
      }
      errorsEl.textContent = result.errors.join('\n');
    });
    actions.appendChild(saveBtn);
  }

  if (readonly || (!isNew && def.id)) {
    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = readonly
      ? 'library-view__btn library-view__btn--primary'
      : 'library-view__btn';
    dupBtn.textContent = readonly
      ? t('library.song.duplicateToEdit')
      : t('library.duplicate');
    dupBtn.addEventListener('click', duplicateAsCustom);
    actions.appendChild(dupBtn);
  }

  if (!readonly && !isNew && def.id) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'library-view__btn library-view__btn--danger';
    deleteBtn.textContent = t('library.delete');
    deleteBtn.addEventListener('click', () => {
      const songName = nameInput.value.trim() || def.name;
      if (!window.confirm(t('library.song.deleteConfirm', { name: songName }))) {
        return;
      }
      deleteCustomSong(def.id);
      callbacks.onLibraryChanged();
      callbacks.onStateChange({
        ...state,
        selectedSongId: null,
        draftSong: null,
        draftSongBlocks: null,
      });
    });
    actions.appendChild(deleteBtn);
  }

  const sticky = document.createElement('div');
  sticky.className = 'library-song__sticky-actions';
  sticky.appendChild(errorsEl);
  sticky.appendChild(actions);
  form.appendChild(sticky);

  return form;
}

export { createEmptyDraftSong };
