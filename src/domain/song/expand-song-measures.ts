import type { SongBlockDef, SongDef, SongMeasure } from './song-types';
import {
  buildPartStartLabels,
  findBlockById,
  flattenSongParts,
} from './flatten-song-parts';
import {
  findMarkerIndices,
  measureQuarterBeats,
  resolveEffectiveKeyId,
  resolveEffectiveStrumPatternId,
  resolveEffectiveTimeSignature,
} from './measure-utils';
import type { ExpandedMeasure } from './song-types';

interface RepeatFrame {
  startIndex: number;
  pass: 1 | 2 | 3;
  maxPass: number;
  /** 1./2./3. 括弧内の小節（括弧開始以降 repeatEnd まで / 曲末まで） */
  voltaRegion: 'body' | 'firstEnding' | 'secondEnding' | 'thirdEnding';
}

function repeatMaxPassFromIndex(
  raw: readonly SongMeasure[],
  startIndex: number,
): number {
  for (let i = startIndex; i < raw.length; i++) {
    if (raw[i]?.markers?.thirdEnding) {
      return 3;
    }
  }
  return 2;
}

interface WalkContext {
  raw: readonly SongMeasure[];
  defaultKeyId: string;
  defaultStrumPatternId: string;
  defaultTimeSignature: string;
  markers: ReturnType<typeof findMarkerIndices>;
  partStartLabels: ReadonlyMap<number, string>;
}

function repeatPass(stack: readonly RepeatFrame[]): number {
  return stack.length > 0 ? stack[stack.length - 1].pass : 0;
}

function applyVoltaRegionTransition(
  frame: RepeatFrame,
  measure: SongMeasure,
): void {
  const m = measure.markers;
  if (m?.firstEnding) {
    frame.voltaRegion = 'firstEnding';
  } else if (m?.secondEnding) {
    frame.voltaRegion = 'secondEnding';
  } else if (m?.thirdEnding) {
    frame.voltaRegion = 'thirdEnding';
  }
}

function shouldPlayVolta(
  _measure: SongMeasure,
  stack: readonly RepeatFrame[],
): boolean {
  if (stack.length === 0) {
    return true;
  }
  const frame = stack[stack.length - 1];
  const pass = frame.pass;

  if (frame.voltaRegion === 'firstEnding') {
    return pass === 1;
  }
  if (frame.voltaRegion === 'secondEnding') {
    return pass === 2;
  }
  if (frame.voltaRegion === 'thirdEnding') {
    return pass === 3;
  }
  return true;
}

function toExpandedMeasure(
  ctx: WalkContext,
  sourceIndex: number,
  playbackIndex: number,
  cycleIndex: number,
): ExpandedMeasure {
  const measure = ctx.raw[sourceIndex];
  const effectiveKeyId = resolveEffectiveKeyId(
    ctx.raw,
    sourceIndex,
    ctx.defaultKeyId,
  );
  const effectiveStrumPatternId = resolveEffectiveStrumPatternId(
    ctx.raw,
    sourceIndex,
    ctx.defaultStrumPatternId,
  );
  const inheritedTs = resolveEffectiveTimeSignature(
    ctx.raw,
    sourceIndex,
    ctx.defaultTimeSignature,
  );
  const timeSignature = measure.timeSignature?.trim() || inheritedTs;
  const quarterBeats = measureQuarterBeats(
    measure,
    ctx.defaultTimeSignature,
    inheritedTs,
  );

  const partLabel = ctx.partStartLabels.get(sourceIndex);

  return {
    sourceMeasureIndex: sourceIndex,
    playbackIndex,
    cycleIndex,
    events: measure.events.map((event) => ({ ...event })),
    timeSignature,
    effectiveKeyId,
    effectiveStrumPatternId,
    measureQuarterBeats: quarterBeats,
    markers: measure.markers ? { ...measure.markers } : undefined,
    partLabel,
  };
}

function walkRange(
  ctx: WalkContext,
  startIndex: number,
  endIndex: number,
  cycleIndex: number,
  playbackStartIndex: number,
  navDepth = 0,
): { measures: ExpandedMeasure[]; nextPlaybackIndex: number } {
  const output: ExpandedMeasure[] = [];
  const stack: RepeatFrame[] = [];
  let index = startIndex;
  let playbackIndex = playbackStartIndex;

  while (index <= endIndex && index >= 0 && index < ctx.raw.length) {
    const measure = ctx.raw[index];
    const m = measure.markers;
    const activeFrame = stack[stack.length - 1];
    if (activeFrame) {
      applyVoltaRegionTransition(activeFrame, measure);
    }

    if (!shouldPlayVolta(measure, stack)) {
      index++;
      continue;
    }

    output.push(toExpandedMeasure(ctx, index, playbackIndex, cycleIndex));
    playbackIndex++;

    if (m?.toCoda && repeatPass(stack) >= 2 && ctx.markers.codaIndex >= 0) {
      const codaResult = walkRange(
        ctx,
        ctx.markers.codaIndex,
        endIndex,
        cycleIndex,
        playbackIndex,
        navDepth + 1,
      );
      output.push(...codaResult.measures);
      return { measures: output, nextPlaybackIndex: codaResult.nextPlaybackIndex };
    }

    if (navDepth === 0 && m?.daCapoAlFine && ctx.markers.fineIndex >= 0) {
      const sub = walkRange(
        ctx,
        0,
        ctx.markers.fineIndex,
        cycleIndex,
        playbackIndex,
        navDepth + 1,
      );
      output.push(...sub.measures);
      return { measures: output, nextPlaybackIndex: sub.nextPlaybackIndex };
    }

    if (
      navDepth === 0 &&
      m?.dalSegnoAlFine &&
      ctx.markers.segnoIndex >= 0 &&
      ctx.markers.fineIndex >= 0
    ) {
      const sub = walkRange(
        ctx,
        ctx.markers.segnoIndex,
        ctx.markers.fineIndex,
        cycleIndex,
        playbackIndex,
        navDepth + 1,
      );
      output.push(...sub.measures);
      return { measures: output, nextPlaybackIndex: sub.nextPlaybackIndex };
    }

    if (
      navDepth === 0 &&
      m?.daCapoAlCoda &&
      ctx.markers.toCodaIndex >= 0 &&
      ctx.markers.codaIndex >= 0
    ) {
      const sub = walkRange(
        ctx,
        0,
        ctx.markers.toCodaIndex,
        cycleIndex,
        playbackIndex,
        navDepth + 1,
      );
      output.push(...sub.measures);
      const codaSub = walkRange(
        ctx,
        ctx.markers.codaIndex,
        endIndex,
        cycleIndex,
        playbackIndex + sub.measures.length,
        navDepth + 1,
      );
      output.push(...codaSub.measures);
      return { measures: output, nextPlaybackIndex: codaSub.nextPlaybackIndex };
    }

    if (
      navDepth === 0 &&
      m?.dalSegnoAlCoda &&
      ctx.markers.segnoIndex >= 0 &&
      ctx.markers.toCodaIndex >= 0 &&
      ctx.markers.codaIndex >= 0
    ) {
      const sub = walkRange(
        ctx,
        ctx.markers.segnoIndex,
        ctx.markers.toCodaIndex,
        cycleIndex,
        playbackIndex,
        navDepth + 1,
      );
      output.push(...sub.measures);
      const codaSub = walkRange(
        ctx,
        ctx.markers.codaIndex,
        endIndex,
        cycleIndex,
        playbackIndex + sub.measures.length,
        navDepth + 1,
      );
      output.push(...codaSub.measures);
      return { measures: output, nextPlaybackIndex: codaSub.nextPlaybackIndex };
    }

    if (m?.repeatEnd) {
      const frame = stack[stack.length - 1];
      if (frame && frame.pass < frame.maxPass) {
        frame.pass = (frame.pass + 1) as 1 | 2 | 3;
        frame.voltaRegion = 'body';
        index = frame.startIndex;
        continue;
      }
      if (frame) {
        stack.pop();
      }
      index++;
      continue;
    }

    if (m?.repeatStart) {
      const top = stack[stack.length - 1];
      if (!top || top.startIndex !== index) {
        stack.push({
          startIndex: index,
          pass: 1,
          maxPass: repeatMaxPassFromIndex(ctx.raw, index),
          voltaRegion: 'body',
        });
      }
    }

    index++;
  }

  return { measures: output, nextPlaybackIndex: playbackIndex };
}

function expandOneCycle(
  song: SongDef,
  raw: readonly SongMeasure[],
  partStartLabels: ReadonlyMap<number, string>,
): ExpandedMeasure[] {
  if (raw.length === 0) {
    return [];
  }

  const ctx: WalkContext = {
    raw,
    defaultKeyId: song.defaultKeyId,
    defaultStrumPatternId: song.strumPatternId,
    defaultTimeSignature: song.defaultTimeSignature,
    markers: findMarkerIndices(raw),
    partStartLabels,
  };

  const { measures } = walkRange(ctx, 0, raw.length - 1, 0, 0);
  return measures;
}

export function expandSongMeasures(
  song: SongDef,
  blocks: readonly SongBlockDef[],
  playCountOverride?: number,
): ExpandedMeasure[] {
  const raw = flattenSongParts(song, blocks);
  const partStartLabels = buildPartStartLabels(song, blocks);
  const cycle = expandOneCycle(song, raw, partStartLabels);
  const playCount = Math.max(
    0,
    Math.floor(playCountOverride ?? 1),
  );

  if (playCount === 0) {
    return cycle.map((measure, playbackIndex) => ({
      ...measure,
      playbackIndex,
      cycleIndex: 0,
    }));
  }

  const result: ExpandedMeasure[] = [];
  for (let cycleIndex = 0; cycleIndex < playCount; cycleIndex++) {
    for (const measure of cycle) {
      result.push({
        ...measure,
        playbackIndex: result.length,
        cycleIndex,
        partLabel: cycleIndex === 0 ? measure.partLabel : undefined,
      });
    }
  }
  return result;
}

/**
 * 展開済み小節列を `playSong` に渡すときのループ回数。
 * `expandSongMeasures` が playCount を反映済みのため、有限時は 1、無限時は 0。
 */
export function playbackLoopCountForExpandedMeasures(playCount: number): number {
  return playCount === 0 ? 0 : 1;
}

/** 指定セクション（part）のみ展開して再生用小節列を返す */
export function expandSongPartMeasures(
  song: SongDef,
  blocks: readonly SongBlockDef[],
  partIndex: number,
  playCountOverride = 1,
): ExpandedMeasure[] {
  const part = song.parts[partIndex];
  if (!part) {
    return [];
  }
  return expandSongMeasures(
    { ...song, parts: [part] },
    blocks,
    playCountOverride,
  );
}

function rawMeasuresForPart(
  part: SongDef['parts'][number],
  blocks: readonly SongBlockDef[],
): SongMeasure[] {
  if (part.type === 'inline') {
    return [...part.measures];
  }
  const block = findBlockById(blocks, part.blockId);
  return block ? [...block.measures] : [];
}

/**
 * セクション折りたたみ時の進行プレビュー用。
 * リピート展開は行わず、登録小節をそのまま 1 行表示する。
 */
export function buildPartChartPreviewMeasures(
  song: SongDef,
  blocks: readonly SongBlockDef[],
  partIndex: number,
): ExpandedMeasure[] {
  const part = song.parts[partIndex];
  if (!part) {
    return [];
  }

  const raw = rawMeasuresForPart(part, blocks);
  return raw.map((measure, index) => {
    const inheritedTs = resolveEffectiveTimeSignature(
      raw,
      index,
      song.defaultTimeSignature,
    );
    const timeSignature = measure.timeSignature?.trim() || inheritedTs;
    return {
      sourceMeasureIndex: index,
      playbackIndex: index,
      cycleIndex: 0,
      events: measure.events.map((event) => ({ ...event })),
      timeSignature,
      effectiveKeyId: resolveEffectiveKeyId(
        raw,
        index,
        song.defaultKeyId,
      ),
      effectiveStrumPatternId: resolveEffectiveStrumPatternId(
        raw,
        index,
        song.strumPatternId,
      ),
      measureQuarterBeats: measureQuarterBeats(
        measure,
        song.defaultTimeSignature,
        inheritedTs,
      ),
      markers: measure.markers ? { ...measure.markers } : undefined,
    };
  });
}

/**
 * 曲全体の進行チャート／ライブラリ readonly プレビュー用。
 * セクション折りたたみと同様、リピート展開せず登録小節をそのまま連結する。
 */
export function buildSongChartPreviewMeasures(
  song: SongDef,
  blocks: readonly SongBlockDef[],
): ExpandedMeasure[] {
  const partStartLabels = buildPartStartLabels(song, blocks);
  const result: ExpandedMeasure[] = [];
  let globalSourceIndex = 0;
  let playbackIndex = 0;

  for (let partIndex = 0; partIndex < song.parts.length; partIndex++) {
    const partMeasures = buildPartChartPreviewMeasures(song, blocks, partIndex);
    if (partMeasures.length === 0) {
      continue;
    }

    const partFlatStart = globalSourceIndex;
    const label = partStartLabels.get(partFlatStart);

    for (let i = 0; i < partMeasures.length; i++) {
      const measure = partMeasures[i]!;
      result.push({
        ...measure,
        sourceMeasureIndex: partFlatStart + i,
        playbackIndex,
        partLabel:
          i === 0 && label && label !== 'inline' ? label : undefined,
      });
      playbackIndex++;
    }

    globalSourceIndex += partMeasures.length;
  }

  return result;
}
