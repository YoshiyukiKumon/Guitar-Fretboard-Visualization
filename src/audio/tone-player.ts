import { midiNoteForFret } from '../domain/data/fretboard-matrix';
import {
  orderedSemitonesForChordArpeggio,
  orderedSemitonesForChordPlayback,
} from '../domain/chord-playback';
import {
  midiNoteNumberForScaleChordPlayback,
  orderedSemitonesFromTones,
} from '../domain/tone-sequence';
import type { ChordDef } from '../domain/data/chords';
import { MVP_CHORD } from '../domain/data/chords';
import type { KeyDef } from '../domain/data/keys';
import { MVP_KEY } from '../domain/data/keys';
import type { ScaleDef } from '../domain/data/scales';
import {
  DEFAULT_INSTRUMENT_ID,
  getInstrumentDefinition,
  instrumentUsesSamples,
  normalizeInstrumentId,
  sampleBaseUrlForInstrument,
  sampleMaxDurationSec,
  samplePitchRate,
  instrumentUsesGuitarStrum,
  type InstrumentDefinition,
  type InstrumentId,
} from '../domain/settings/instrument-catalog';
import { playbackGainForInstrument } from '../domain/settings/instrument-playback-gain';
import {
  createDistortionNode,
  getSynthPreset,
  type SynthPreset,
} from './synth-presets';
import {
  nearestSampleForMidi,
  playbackRateForMidi,
  type SampleManifest,
} from './guitar-samples';
import { isPausedAudioContextState } from './audio-context-state';
import {
  beatDurationSec,
  clampBpm,
  DEFAULT_BPM,
  eighthNoteDurationSec,
  eighthNoteLengthSec,
  nextEighthGridTime,
  realignRepeatEpochForBpmChange,
} from '../domain/playback-bpm';
import { getStrumPatternById } from '../domain/music-library/registry';
import {
  DEFAULT_STRUM_PATTERN_ID,
  parseStrumPatternDef,
  strumHitGain,
  type ParsedStrumPattern,
  type StrumPatternDef,
} from '../domain/strum-pattern/strum-pattern';
import type { ExpandedMeasure } from '../domain/song/song-types';
import {
  buildSongScheduleHits,
  findActiveSongHitIndex,
  resolveSongHitSemitones,
  songCycleDurationSec,
  type SongScheduleHit,
} from '../domain/song/song-playback-plan';
import { clampSongTranspose } from '../domain/song/song-transpose';

/** 構成音パネルで停止トグル対象の再生種別 */
export type TonePlaybackMode = 'scale' | 'arpeggio' | 'repeat' | null;

/** 再生中の停止ボタン表示対象（UI コンポーネント単位） */
export type PlaybackButtonId =
  | 'tone-panel:scale'
  | 'tone-panel:arpeggio'
  | 'tone-panel:repeat'
  | 'library:strum-preview'
  | 'song:play'
  | `diatonic-repeat:${number}`;

export interface SongPlaybackPosition {
  measurePlaybackIndex: number;
  hitOffsetBeats: number;
  chordRootKeyId: string;
  chordId: string;
}

/** 曲再生が全体かセクション単位か */
export type SongPlaybackScope = 'full' | 'section';

export interface PlaySongOptions {
  scope: SongPlaybackScope;
  /** scope が section のときの parts インデックス */
  partIndex?: number;
  /** セッション移調（半音、-6〜+6） */
  transposeSemitones?: number;
}

export function diatonicRepeatButtonId(degree: number): PlaybackButtonId {
  return `diatonic-repeat:${degree}`;
}

const CHORD_DURATION_SEC = 1.5;
/** ギター系コード同時再生の音間隔（秒） */
const GUITAR_STRUM_NOTE_GAP_SEC = 0.032;
/** リピート先読みスケジュール（秒） */
const REPEAT_SCHEDULE_AHEAD_SEC = 1.5;
const REPEAT_SCHEDULER_INTERVAL_MS = 50;
const FRET_TAP_DURATION_SEC = 1.5;
const SAMPLE_PEAK_GAIN = 0.92;
const PREVIEW_MIDI = 60;
/** コードリピート全体の音量（他の再生と重ねやすくする） */
const REPEAT_PLAYBACK_GAIN = 0.35;
/** iOS Safari: running でも currentTime が進まない壊れたコンテキストを検出 */
const CONTEXT_HEALTH_CHECK_MS = 50;

type SourceLayer = 'overlay' | 'repeat' | 'immediate';

interface InstrumentSampleState {
  manifest: SampleManifest | null;
  manifestPromise: Promise<SampleManifest | null> | null;
  bufferByFile: Map<string, AudioBuffer>;
  prefetchStarted: boolean;
}

export class TonePlayer {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sessionId = 0;
  private overlaySessionId = 0;
  private volume = 0.8;
  private playbackInstrumentId: InstrumentId = DEFAULT_INSTRUMENT_ID;
  private repeatInstrumentId: InstrumentId = DEFAULT_INSTRUMENT_ID;
  private sampleStateByInstrument = new Map<InstrumentId, InstrumentSampleState>();
  private needsGestureReunlock = false;
  private recoveryPromise: Promise<AudioContext> | null = null;
  private bpm = DEFAULT_BPM;
  private strumPatternId = DEFAULT_STRUM_PATTERN_ID;
  private playbackMode: TonePlaybackMode = null;
  private activePlaybackButtonId: PlaybackButtonId | null = null;
  private repeatActiveButtonId: PlaybackButtonId | null = null;
  private overlayMode: 'scale' | 'arpeggio' | null = null;
  private overlayActiveButtonId: PlaybackButtonId | null = null;
  private playbackEndTimer: ReturnType<typeof setTimeout> | null = null;
  private repeatSchedulerTimer: ReturnType<typeof setInterval> | null = null;
  private repeatScheduledUntil = 0;
  /** リピート再生の 1 小節目開始時刻（スケジュール位置の基準） */
  private repeatEpoch = 0;
  private repeatSession = 0;
  private repeatChordKey: KeyDef | null = null;
  private repeatPlaybackSemitones: number[] | null = null;
  private repeatUseGuitarStrum = false;
  /** ライブラリプレビュー用の未保存ストロークパターン */
  private repeatPreviewPattern: ParsedStrumPattern | null = null;
  private pendingRepeatPreviewPattern: ParsedStrumPattern | null = null;
  private songHits: SongScheduleHit[] = [];
  private songCycleDurationSec = 0;
  private songInfinite = false;
  private songPlayCount = 1;
  private songEndTimeSec = 0;
  private songPlaybackScope: SongPlaybackScope | null = null;
  private songPlaybackPartIndex: number | null = null;
  private songTransposeSemitones = 0;
  private songPositionListeners = new Set<
    (position: SongPlaybackPosition | null) => void
  >();
  private playbackListeners = new Set<() => void>();
  private overlaySources = new Set<AudioScheduledSourceNode>();
  private repeatSources = new Set<AudioScheduledSourceNode>();
  private immediateSources = new Set<AudioScheduledSourceNode>();

  setBpm(value: number): void {
    const next = clampBpm(value);
    if (next === this.bpm) {
      return;
    }

    if (this.isRepeatActive() && this.context && this.repeatEpoch > 0) {
      this.applyRepeatBpmChange(next);
      return;
    }

    this.bpm = next;
  }

  getBpm(): number {
    return this.bpm;
  }

  setStrumPatternId(id: string): void {
    if (getStrumPatternById(id) === undefined || id === this.strumPatternId) {
      return;
    }
    this.strumPatternId = id;
    if (this.isRepeatActive() && this.context && this.repeatEpoch > 0) {
      this.applyRepeatPatternChange();
    }
  }

  getStrumPatternId(): string {
    return this.strumPatternId;
  }

  private getActiveStrumPattern(): ParsedStrumPattern {
    if (this.repeatPreviewPattern) {
      return this.repeatPreviewPattern;
    }
    const def =
      getStrumPatternById(this.strumPatternId) ??
      getStrumPatternById(DEFAULT_STRUM_PATTERN_ID);
    const parsed = def ? parseStrumPatternDef(def) : null;
    if (parsed) {
      return parsed;
    }
    return {
      hits: [
        { offsetBeats: 0, chordLookupBeats: 0, accent: false },
        { offsetBeats: 1, chordLookupBeats: 1, accent: true },
        { offsetBeats: 2, chordLookupBeats: 2, accent: false },
        { offsetBeats: 3, chordLookupBeats: 3, accent: true },
      ],
      measureBeats: 4,
      timeSignature: '4/4',
    };
  }

  getPlaybackMode(): TonePlaybackMode {
    return this.playbackMode;
  }

  getActivePlaybackButtonId(): PlaybackButtonId | null {
    return this.activePlaybackButtonId;
  }

  isPlaybackActive(buttonId: PlaybackButtonId): boolean {
    return (
      this.repeatActiveButtonId === buttonId ||
      this.overlayActiveButtonId === buttonId
    );
  }

  getSongPlaybackScope(): SongPlaybackScope | null {
    return this.isSongActive() ? this.songPlaybackScope : null;
  }

  isSectionPlaybackActive(partIndex: number): boolean {
    return (
      this.isSongActive() &&
      this.songPlaybackScope === 'section' &&
      this.songPlaybackPartIndex === partIndex
    );
  }

  private isRepeatActive(): boolean {
    return this.repeatActiveButtonId !== null;
  }

  subscribePlayback(listener: () => void): () => void {
    this.playbackListeners.add(listener);
    return () => {
      this.playbackListeners.delete(listener);
    };
  }

  subscribeSongPosition(
    listener: (position: SongPlaybackPosition | null) => void,
  ): () => void {
    this.songPositionListeners.add(listener);
    return () => {
      this.songPositionListeners.delete(listener);
    };
  }

  private notifySongPosition(position: SongPlaybackPosition | null): void {
    for (const listener of this.songPositionListeners) {
      listener(position);
    }
  }

  private isSongActive(): boolean {
    return this.repeatActiveButtonId === 'song:play';
  }

  private notifyPlaybackChange(): void {
    for (const listener of this.playbackListeners) {
      listener();
    }
  }

  private setPlaybackState(
    mode: TonePlaybackMode,
    buttonId: PlaybackButtonId | null,
  ): void {
    if (mode === 'repeat') {
      this.repeatActiveButtonId = buttonId;
    } else if (mode === 'scale' || mode === 'arpeggio') {
      this.overlayMode = mode;
      this.overlayActiveButtonId = buttonId;
    } else {
      this.repeatActiveButtonId = null;
      this.overlayMode = null;
      this.overlayActiveButtonId = null;
    }
    this.syncLegacyPlaybackFields();
  }

  private syncLegacyPlaybackFields(): void {
    if (this.overlayActiveButtonId !== null) {
      this.playbackMode = this.overlayMode;
      this.activePlaybackButtonId = this.overlayActiveButtonId;
    } else if (this.repeatActiveButtonId !== null) {
      this.playbackMode = 'repeat';
      this.activePlaybackButtonId = this.repeatActiveButtonId;
    } else {
      this.playbackMode = null;
      this.activePlaybackButtonId = null;
    }
    this.notifyPlaybackChange();
  }

  private clearRepeatScheduler(): void {
    if (this.repeatSchedulerTimer !== null) {
      clearInterval(this.repeatSchedulerTimer);
      this.repeatSchedulerTimer = null;
    }
    this.repeatScheduledUntil = 0;
    this.repeatEpoch = 0;
    this.repeatSession = 0;
    this.repeatChordKey = null;
    this.repeatPlaybackSemitones = null;
    this.repeatUseGuitarStrum = false;
    this.repeatPreviewPattern = null;
    this.pendingRepeatPreviewPattern = null;
    this.songHits = [];
    this.songCycleDurationSec = 0;
    this.songInfinite = false;
    this.songPlayCount = 1;
    this.songEndTimeSec = 0;
    this.songPlaybackScope = null;
    this.songPlaybackPartIndex = null;
    this.songTransposeSemitones = 0;
    this.notifySongPosition(null);
  }

  private stopSourcesIn(set: Set<AudioScheduledSourceNode>): void {
    for (const source of set) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    set.clear();
  }

  private stopRepeatSourcesOnly(): void {
    this.stopSourcesIn(this.repeatSources);
  }

  private stopOverlayPlayback(): void {
    this.overlaySessionId += 1;
    this.clearPlaybackEndTimer();
    this.stopSourcesIn(this.overlaySources);
    this.overlayMode = null;
    this.overlayActiveButtonId = null;
    this.syncLegacyPlaybackFields();
  }

  private stopRepeatPlayback(): void {
    this.repeatSession += 1;
    this.repeatActiveButtonId = null;
    this.clearPlaybackEndTimer();
    this.clearRepeatScheduler();
    this.stopSourcesIn(this.repeatSources);
    this.syncLegacyPlaybackFields();
  }

  /** スケール / アルペジオのみ停止 */
  stopOverlay(): void {
    this.stopOverlayPlayback();
  }

  /** コードリピートのみ停止 */
  stopRepeat(): void {
    this.stopRepeatPlayback();
  }

  /** リピート中の BPM 変更: 拍位置を保ちつめ、新テンポで再スケジュール */
  private applyRepeatBpmChange(nextBpm: number): void {
    const ctx = this.context;
    if (!ctx || this.repeatEpoch <= 0) {
      return;
    }

    const now = ctx.currentTime;
    const measureBeats = this.getActiveStrumPattern().measureBeats;
    this.repeatEpoch = realignRepeatEpochForBpmChange(
      this.repeatEpoch,
      now,
      this.bpm,
      nextBpm,
      measureBeats,
    );
    this.stopRepeatSourcesOnly();
    this.repeatScheduledUntil = now;
    this.bpm = nextBpm;
    this.runRepeatSchedulerTick(this.repeatSession);
  }

  /** リピート中のパターン変更: 小節頭から新パターンで再スケジュール */
  private applyRepeatPatternChange(): void {
    const ctx = this.context;
    if (!ctx || this.repeatEpoch <= 0) {
      return;
    }

    const now = ctx.currentTime;
    this.repeatEpoch = now;
    this.stopRepeatSourcesOnly();
    this.repeatScheduledUntil = now;
    this.runRepeatSchedulerTick(this.repeatSession);
  }

  private clearPlaybackEndTimer(): void {
    if (this.playbackEndTimer !== null) {
      clearTimeout(this.playbackEndTimer);
      this.playbackEndTimer = null;
    }
  }

  private schedulePlaybackEnd(totalSec: number): void {
    this.clearPlaybackEndTimer();
    this.playbackEndTimer = setTimeout(() => {
      this.playbackEndTimer = null;
      this.stopOverlayPlayback();
    }, totalSec * 1000 + 50);
  }

  private scheduleSongPlaybackEnd(totalSec: number): void {
    this.clearPlaybackEndTimer();
    this.playbackEndTimer = setTimeout(() => {
      this.playbackEndTimer = null;
      if (this.isSongActive()) {
        this.stopRepeatPlayback();
      }
    }, totalSec * 1000 + 50);
  }

  private registerSource(
    source: AudioScheduledSourceNode,
    layer: SourceLayer,
  ): void {
    const bucket =
      layer === 'overlay'
        ? this.overlaySources
        : layer === 'repeat'
          ? this.repeatSources
          : this.immediateSources;
    bucket.add(source);
    source.addEventListener('ended', () => {
      bucket.delete(source);
    });
  }

  private beatSec(): number {
    return beatDurationSec(this.bpm);
  }

  private eighthNoteSec(): number {
    return eighthNoteDurationSec(this.bpm);
  }

  private eighthNoteLength(): number {
    return eighthNoteLengthSec(this.bpm);
  }

  private nextOverlayStartTime(leadSec = 0.05): number {
    const ctx = this.context;
    if (!ctx) {
      return leadSec;
    }
    if (!this.isRepeatActive() || this.repeatEpoch <= 0) {
      return ctx.currentTime + leadSec;
    }
    return nextEighthGridTime(
      this.repeatEpoch,
      ctx.currentTime,
      this.bpm,
      leadSec,
    );
  }

  setVolume(percent: number): void {
    this.volume = Math.min(100, Math.max(0, percent)) / 100;
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  getVolume(): number {
    return Math.round(this.volume * 100);
  }

  setPlaybackInstrument(instrumentId: InstrumentId): void {
    const normalized = normalizeInstrumentId(instrumentId);
    if (normalized === this.playbackInstrumentId) {
      return;
    }
    this.stopOverlayPlayback();
    this.stopSourcesIn(this.immediateSources);
    if (!this.isRepeatActive()) {
      this.stopRepeatPlayback();
    }
    this.playbackInstrumentId = normalized;
    this.getSampleState(normalized).prefetchStarted = false;
  }

  setRepeatInstrument(instrumentId: InstrumentId): void {
    const normalized = normalizeInstrumentId(instrumentId);
    if (normalized === this.repeatInstrumentId) {
      return;
    }
    this.repeatInstrumentId = normalized;
    this.getSampleState(normalized).prefetchStarted = false;
    if (!this.isRepeatActive()) {
      return;
    }
    const ctx = this.context;
    this.stopRepeatSourcesOnly();
    if (ctx) {
      this.repeatScheduledUntil = ctx.currentTime;
      this.runRepeatSchedulerTick(this.repeatSession);
    }
  }

  /** @deprecated use setPlaybackInstrument */
  setInstrument(instrumentId: InstrumentId): void {
    this.setPlaybackInstrument(instrumentId);
  }

  getPlaybackInstrument(): InstrumentId {
    return this.playbackInstrumentId;
  }

  getRepeatInstrument(): InstrumentId {
    return this.repeatInstrumentId;
  }

  /** @deprecated use getPlaybackInstrument */
  getInstrument(): InstrumentId {
    return this.playbackInstrumentId;
  }

  /** バックグラウンド復帰後、次のユーザー操作で AudioContext を再解放する */
  markNeedsGestureReunlock(): void {
    this.needsGestureReunlock = true;
  }

  /** iOS Safari 向け: ユーザー操作の同期スタック内で AudioContext を解放する */
  unlockFromUserGesture(): void {
    this.kickAudioContextInUserGesture();
    void this.prefetchActiveInstruments();
  }

  private kickAudioContextInUserGesture(): void {
    let ctx = this.ensureContextSync();
    if (ctx.state === 'closed') {
      this.recreateAudioContext();
      ctx = this.ensureContextSync();
    }
    if (this.needsGestureReunlock || isPausedAudioContextState(ctx.state)) {
      void ctx.resume();
    }
    this.playSilentBuffer(ctx);
  }

  async previewInstrument(instrumentId: InstrumentId): Promise<void> {
    this.unlockFromUserGesture();
    const normalized = normalizeInstrumentId(instrumentId);
    const ctx = await this.prepareContext();
    this.scheduleNoteWithDefinition(
      ctx,
      PREVIEW_MIDI,
      ctx.currentTime + 0.01,
      FRET_TAP_DURATION_SEC,
      1,
      'immediate',
      getInstrumentDefinition(normalized),
    );
  }

  async playScale(scaleKey: KeyDef, scale: ScaleDef): Promise<void> {
    this.unlockFromUserGesture();
    const semitones = orderedSemitonesFromTones(scale.tones);
    await this.playOverlayMelody(
      scaleKey,
      semitones,
      'scale',
      'tone-panel:scale',
    );
  }

  private async playOverlayMelody(
    chordKey: KeyDef,
    semitones: number[],
    mode: 'scale' | 'arpeggio',
    buttonId: PlaybackButtonId,
  ): Promise<void> {
    if (semitones.length === 0) {
      return;
    }

    this.stopOverlayPlayback();
    if (!this.isRepeatActive()) {
      this.stopRepeatPlayback();
      this.stopSourcesIn(this.immediateSources);
    }

    const ctx = await this.prepareContext();
    const session = ++this.overlaySessionId;
    this.setPlaybackState(mode, buttonId);

    const startAt = this.nextOverlayStartTime(0.05);
    const step = this.eighthNoteSec();
    const noteDuration = this.eighthNoteLength();
    let time = startAt;
    let lastNoteStart = startAt;

    for (let i = 0; i < semitones.length; i++) {
      if (session !== this.overlaySessionId) {
        return;
      }
      const isLast = i === semitones.length - 1;
      const semitone = semitones[i];
      const midi = midiNoteNumberForScaleChordPlayback(
        chordKey.pitchClass,
        semitone,
      );
      lastNoteStart = time;
      this.scheduleNote(
        ctx,
        midi,
        time,
        isLast ? CHORD_DURATION_SEC : noteDuration,
        1,
        'overlay',
      );
      if (!isLast) {
        time += step;
      }
    }

    this.schedulePlaybackEnd(
      lastNoteStart - startAt + CHORD_DURATION_SEC,
    );
  }

  async playFret(stringIndex: number, fret: number): Promise<void> {
    this.unlockFromUserGesture();
    const ctx = await this.prepareContext();
    const midi = midiNoteForFret(stringIndex, fret);
    this.scheduleNote(
      ctx,
      midi,
      ctx.currentTime + 0.01,
      FRET_TAP_DURATION_SEC,
      1,
      'immediate',
    );
  }

  async playChord(chordKey: KeyDef, chord: ChordDef): Promise<void> {
    this.unlockFromUserGesture();
    this.stopScheduledPlayback();
    const semitones = orderedSemitonesForChordPlayback(
      chord.tones,
      chord.name,
    );
    await this.playChordSemitones(chordKey, semitones, 'block');
  }

  async playChordSemitonesFromRoot(
    chordKey: KeyDef,
    semitonesFromRoot: readonly number[],
  ): Promise<void> {
    this.unlockFromUserGesture();
    this.stopScheduledPlayback();
    await this.playChordSemitones(chordKey, [...semitonesFromRoot], 'block');
  }

  async playChordArpeggio(chordKey: KeyDef, chord: ChordDef): Promise<void> {
    this.unlockFromUserGesture();
    const semitones = orderedSemitonesForChordArpeggio(
      chord.tones,
      chord.name,
    );
    await this.playOverlayMelody(
      chordKey,
      semitones,
      'arpeggio',
      'tone-panel:arpeggio',
    );
  }

  /** 4/4 の 1 小節ストロークパターンを停止までループ再生 */
  async playChordRepeat(
    chordKey: KeyDef,
    chord: ChordDef,
    buttonId: PlaybackButtonId = 'tone-panel:repeat',
  ): Promise<void> {
    this.unlockFromUserGesture();
    const semitones = orderedSemitonesForChordPlayback(
      chord.tones,
      chord.name,
    );
    await this.playChordRepeatSemitones(chordKey, semitones, buttonId);
  }

  /** ライブラリ編集画面からストロークパターンをプレビュー（C ルート・ループ） */
  async previewStrumPatternRepeat(
    def: Pick<StrumPatternDef, 'notation' | 'timeSignature'>,
    bpm: number,
  ): Promise<void> {
    const parsed = parseStrumPatternDef({
      timeSignature: def.timeSignature,
      notation: def.notation,
    });
    if (!parsed) {
      return;
    }

    this.pendingRepeatPreviewPattern = parsed;
    this.setBpm(bpm);
    await this.playChordRepeat(MVP_KEY, MVP_CHORD, 'library:strum-preview');
  }

  /** プレビュー中に未保存パターンを差し替える */
  updateStrumPatternPreview(
    def: Pick<StrumPatternDef, 'notation' | 'timeSignature'>,
  ): void {
    const parsed = parseStrumPatternDef({
      timeSignature: def.timeSignature,
      notation: def.notation,
    });
    if (!parsed || !this.isPlaybackActive('library:strum-preview')) {
      return;
    }
    this.repeatPreviewPattern = parsed;
    this.applyRepeatPatternChange();
  }

  async playChordRepeatSemitonesFromRoot(
    chordKey: KeyDef,
    semitonesFromRoot: readonly number[],
    buttonId: PlaybackButtonId,
  ): Promise<void> {
    this.unlockFromUserGesture();
    await this.playChordRepeatSemitones(chordKey, [...semitonesFromRoot], buttonId);
  }

  private async playChordRepeatSemitones(
    chordKey: KeyDef,
    semitones: number[],
    buttonId: PlaybackButtonId,
  ): Promise<void> {
    if (semitones.length === 0) {
      return;
    }

    const previewPattern =
      buttonId === 'library:strum-preview'
        ? this.pendingRepeatPreviewPattern
        : null;
    this.pendingRepeatPreviewPattern = null;

    this.stopOverlayPlayback();
    this.stopRepeatPlayback();
    if (previewPattern) {
      this.repeatPreviewPattern = previewPattern;
    }
    this.setPlaybackState('repeat', buttonId);

    const ctx = await this.prepareContext();
    const session = ++this.sessionId;
    const startAt = ctx.currentTime + 0.05;
    const definition = getInstrumentDefinition(this.repeatInstrumentId);
    const useGuitarStrum = instrumentUsesGuitarStrum(definition);
    const playbackSemitones = useGuitarStrum
      ? [...semitones].sort((a, b) => a - b)
      : semitones;

    this.repeatSession = session;
    this.repeatChordKey = chordKey;
    this.repeatPlaybackSemitones = playbackSemitones;
    this.repeatUseGuitarStrum = useGuitarStrum;
    this.repeatScheduledUntil = startAt;
    this.repeatEpoch = startAt;
    this.startRepeatScheduler(session);
  }

  /** 展開済み小節列をストローク伴奏で再生 */
  async playSong(
    measures: readonly ExpandedMeasure[],
    strumPatternId: string,
    playCount: number,
    bpm?: number,
    options: PlaySongOptions = { scope: 'full' },
  ): Promise<void> {
    if (measures.length === 0) {
      return;
    }

    const def =
      getStrumPatternById(strumPatternId) ??
      getStrumPatternById(DEFAULT_STRUM_PATTERN_ID);
    const parsed = def ? parseStrumPatternDef(def) : null;
    if (!parsed) {
      return;
    }

    this.unlockFromUserGesture();
    this.stopOverlayPlayback();
    this.stopRepeatPlayback();

    if (bpm !== undefined) {
      this.bpm = clampBpm(bpm);
    }

    this.songInfinite = playCount === 0;
    this.songPlayCount = this.songInfinite
      ? 0
      : Math.max(1, Math.floor(playCount));
    const beat = this.beatSec();
    this.songHits = buildSongScheduleHits(measures, strumPatternId, beat);
    this.songCycleDurationSec = songCycleDurationSec(measures, beat);
    this.songEndTimeSec = this.songInfinite
      ? 0
      : this.songCycleDurationSec * this.songPlayCount;

    this.songPlaybackScope = options.scope;
    this.songPlaybackPartIndex =
      options.scope === 'section' ? (options.partIndex ?? null) : null;
    this.songTransposeSemitones = clampSongTranspose(
      options.transposeSemitones ?? 0,
    );

    this.setPlaybackState('repeat', 'song:play');

    const ctx = await this.prepareContext();
    const session = ++this.sessionId;
    const startAt = ctx.currentTime + 0.05;

    this.repeatSession = session;
    this.repeatScheduledUntil = startAt;
    this.repeatEpoch = startAt;
    this.repeatUseGuitarStrum = instrumentUsesGuitarStrum(
      getInstrumentDefinition(this.repeatInstrumentId),
    );
    this.startRepeatScheduler(session);
    this.notifySongPositionFromTime(ctx.currentTime);
    if (!this.songInfinite && this.songEndTimeSec > 0) {
      this.scheduleSongPlaybackEnd(this.songEndTimeSec);
    }
  }

  private startRepeatScheduler(session: number): void {
    const tick = (): void => {
      this.runRepeatSchedulerTick(session);
    };

    tick();
    this.repeatSchedulerTimer = setInterval(tick, REPEAT_SCHEDULER_INTERVAL_MS);
  }

  private runRepeatSchedulerTick(session: number): void {
    if (session !== this.repeatSession || !this.isRepeatActive()) {
      this.clearRepeatScheduler();
      return;
    }

    if (this.isSongActive()) {
      this.runSongSchedulerTick(session);
      return;
    }

    const ctx = this.context;
    const chordKey = this.repeatChordKey;
    const playbackSemitones = this.repeatPlaybackSemitones;
    if (!ctx || !chordKey || !playbackSemitones) {
      return;
    }

    const beat = this.beatSec();
    const hitDuration = Math.min(CHORD_DURATION_SEC, beat * 0.95);
    const target = ctx.currentTime + REPEAT_SCHEDULE_AHEAD_SEC;
    if (this.repeatScheduledUntil >= target) {
      return;
    }

    this.repeatScheduledUntil = this.scheduleRepeatThrough(
      ctx,
      session,
      chordKey,
      playbackSemitones,
      this.repeatUseGuitarStrum,
      beat,
      hitDuration,
      this.repeatScheduledUntil,
      target,
    );
  }

  /** [fromTime, toTime) の範囲に小節を配置し、最後にスケジュールした時刻を返す */
  private scheduleRepeatThrough(
    ctx: AudioContext,
    session: number,
    chordKey: KeyDef,
    playbackSemitones: number[],
    useGuitarStrum: boolean,
    beat: number,
    hitDuration: number,
    fromTime: number,
    toTime: number,
  ): number {
    const strumPattern = this.getActiveStrumPattern();
    const measureDuration = strumPattern.measureBeats * beat;
    const epoch = this.repeatEpoch > 0 ? this.repeatEpoch : fromTime;
    const measureIndex = Math.max(
      0,
      Math.floor((fromTime - epoch) / measureDuration + 1e-9),
    );
    let measureStart = epoch + measureIndex * measureDuration;

    while (measureStart < toTime) {
      if (session !== this.repeatSession) {
        break;
      }
      for (const hit of strumPattern.hits) {
        const beatStart = measureStart + hit.offsetBeats * beat;
        if (beatStart + 1e-6 < fromTime) {
          continue;
        }
        const gainMultiplier = strumHitGain(hit.accent);
        for (let i = 0; i < playbackSemitones.length; i++) {
          const semitone = playbackSemitones[i];
          const noteStart = useGuitarStrum
            ? beatStart + i * GUITAR_STRUM_NOTE_GAP_SEC
            : beatStart;
          const midi = midiNoteNumberForScaleChordPlayback(
            chordKey.pitchClass,
            semitone,
          );
          this.scheduleNote(
            ctx,
            midi,
            noteStart,
            hitDuration,
            gainMultiplier,
            'repeat',
          );
        }
      }
      measureStart += measureDuration;
    }
    return measureStart;
  }

  private runSongSchedulerTick(session: number): void {
    const ctx = this.context;
    if (!ctx || !this.isSongActive()) {
      return;
    }

    const beat = this.beatSec();
    const hitDuration = Math.min(CHORD_DURATION_SEC, beat * 0.95);
    const target = ctx.currentTime + REPEAT_SCHEDULE_AHEAD_SEC;
    if (this.repeatScheduledUntil >= target) {
      this.notifySongPositionFromTime(ctx.currentTime);
      return;
    }

    this.repeatScheduledUntil = this.scheduleSongThrough(
      ctx,
      session,
      hitDuration,
      this.repeatScheduledUntil,
      target,
    );
    this.notifySongPositionFromTime(ctx.currentTime);
  }

  private notifySongPositionFromTime(now: number): void {
    if (!this.isSongActive() || this.songHits.length === 0) {
      this.notifySongPosition(null);
      return;
    }
    const elapsed = now - this.repeatEpoch;
    if (elapsed < 0) {
      this.notifySongPosition(null);
      return;
    }
    if (!this.songInfinite && elapsed >= this.songEndTimeSec - 1e-6) {
      this.stopRepeatPlayback();
      return;
    }
    const searchElapsed =
      this.songInfinite || this.songPlayCount > 1
        ? ((elapsed % this.songCycleDurationSec) + this.songCycleDurationSec) %
          this.songCycleDurationSec
        : elapsed;
    const hitIndex = findActiveSongHitIndex(
      this.songHits,
      searchElapsed,
      this.songInfinite ? this.songCycleDurationSec : Number.POSITIVE_INFINITY,
    );
    const hit = hitIndex >= 0 ? this.songHits[hitIndex] : undefined;
    if (!hit) {
      this.notifySongPosition(null);
      return;
    }
    this.notifySongPosition({
      measurePlaybackIndex: hit.measurePlaybackIndex,
      hitOffsetBeats: hit.hitOffsetBeats,
      chordRootKeyId: hit.chordRootKeyId,
      chordId: hit.chordId,
    });
  }

  private scheduleSongThrough(
    ctx: AudioContext,
    session: number,
    hitDuration: number,
    fromTime: number,
    toTime: number,
  ): number {
    const epoch = this.repeatEpoch > 0 ? this.repeatEpoch : fromTime;
    const cycleDuration = this.songCycleDurationSec;
    if (cycleDuration <= 0 || this.songHits.length === 0) {
      return fromTime;
    }

    const definition = getInstrumentDefinition(this.repeatInstrumentId);
    const useGuitarStrum = instrumentUsesGuitarStrum(definition);
    let scheduledUntil = fromTime;
    let cycleIndex = Math.max(0, Math.floor((fromTime - epoch) / cycleDuration));

    while (scheduledUntil < toTime) {
      if (session !== this.repeatSession) {
        break;
      }

      const cycleStart = epoch + cycleIndex * cycleDuration;
      if (!this.songInfinite && cycleIndex >= this.songPlayCount) {
        break;
      }

      for (const hit of this.songHits) {
        const noteTime = cycleStart + hit.timeSec;
        if (noteTime < fromTime) {
          continue;
        }
        if (noteTime >= toTime) {
          break;
        }

        const resolved = resolveSongHitSemitones(
          hit.chordRootKeyId,
          hit.chordId,
          this.songTransposeSemitones,
        );
        if (!resolved?.chordKey) {
          continue;
        }

        const gainMultiplier = strumHitGain(hit.accent);

        const playbackSemitones = useGuitarStrum
          ? [...resolved.semitones].sort((a, b) => a - b)
          : resolved.semitones;

        for (let i = 0; i < playbackSemitones.length; i++) {
          const semitone = playbackSemitones[i];
          const noteStart = useGuitarStrum
            ? noteTime + i * GUITAR_STRUM_NOTE_GAP_SEC
            : noteTime;
          const midi = midiNoteNumberForScaleChordPlayback(
            resolved.chordKey.pitchClass,
            semitone,
          );
          this.scheduleNote(
            ctx,
            midi,
            noteStart,
            hitDuration,
            gainMultiplier,
            'repeat',
          );
        }
        scheduledUntil = Math.max(scheduledUntil, noteTime + 1e-9);
      }

      cycleIndex++;
      if (this.songInfinite && cycleStart + cycleDuration > toTime + cycleDuration) {
        break;
      }
    }

    return scheduledUntil;
  }

  private async playChordSemitones(
    chordKey: KeyDef,
    semitones: number[],
    style: 'block' | 'arpeggio',
  ): Promise<void> {
    if (semitones.length === 0) {
      return;
    }

    const ctx = await this.prepareContext();
    const session = ++this.sessionId;
    const startAt = ctx.currentTime + 0.05;
    const definition = this.getInstrumentDefinition();
    const useGuitarStrum =
      style === 'block' && instrumentUsesGuitarStrum(definition);
    const playbackSemitones = useGuitarStrum
      ? [...semitones].sort((a, b) => a - b)
      : semitones;

    if (style === 'block') {
      if (session !== this.sessionId) {
        return;
      }
      for (let i = 0; i < playbackSemitones.length; i++) {
        const semitone = playbackSemitones[i];
        const noteStart = useGuitarStrum
          ? startAt + i * GUITAR_STRUM_NOTE_GAP_SEC
          : startAt;
        const midi = midiNoteNumberForScaleChordPlayback(
          chordKey.pitchClass,
          semitone,
        );
        this.scheduleNote(ctx, midi, noteStart, CHORD_DURATION_SEC, 1, 'immediate');
      }
      return;
    }

    let time = startAt;
    const noteDuration = this.eighthNoteLength();
    const step = this.eighthNoteSec();
    let lastNoteStart = startAt;
    for (let i = 0; i < playbackSemitones.length; i++) {
      if (session !== this.sessionId) {
        return;
      }
      const isLast = i === playbackSemitones.length - 1;
      const semitone = playbackSemitones[i];
      const midi = midiNoteNumberForScaleChordPlayback(
        chordKey.pitchClass,
        semitone,
      );
      lastNoteStart = time;
      this.scheduleNote(
        ctx,
        midi,
        time,
        isLast ? CHORD_DURATION_SEC : noteDuration,
        1,
        'overlay',
      );
      if (!isLast) {
        time += step;
      }
    }

    if (style === 'arpeggio') {
      this.schedulePlaybackEnd(
        lastNoteStart - startAt + CHORD_DURATION_SEC,
      );
    }
  }

  stop(): void {
    this.stopAllPlayback();
  }

  private stopAllPlayback(): void {
    this.sessionId += 1;
    this.overlaySessionId += 1;
    this.clearPlaybackEndTimer();
    this.clearRepeatScheduler();
    this.stopSourcesIn(this.overlaySources);
    this.stopSourcesIn(this.repeatSources);
    this.stopSourcesIn(this.immediateSources);
    this.repeatActiveButtonId = null;
    this.overlayMode = null;
    this.overlayActiveButtonId = null;
    this.syncLegacyPlaybackFields();
  }

  private stopScheduledPlayback(): void {
    this.stopAllPlayback();
  }

  private getInstrumentDefinitionForLayer(
    layer: SourceLayer,
  ): InstrumentDefinition {
    if (layer === 'repeat') {
      return getInstrumentDefinition(this.repeatInstrumentId);
    }
    return getInstrumentDefinition(this.playbackInstrumentId);
  }

  private getPlaybackInstrumentDefinition(): InstrumentDefinition {
    return getInstrumentDefinition(this.playbackInstrumentId);
  }

  private getInstrumentDefinition(): InstrumentDefinition {
    return this.getPlaybackInstrumentDefinition();
  }

  private getSampleState(instrumentId: InstrumentId): InstrumentSampleState {
    let state = this.sampleStateByInstrument.get(instrumentId);
    if (state === undefined) {
      state = {
        manifest: null,
        manifestPromise: null,
        bufferByFile: new Map(),
        prefetchStarted: false,
      };
      this.sampleStateByInstrument.set(instrumentId, state);
    }
    return state;
  }

  private ensureContextSync(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.context.destination);
    }
    return this.context;
  }

  private playSilentBuffer(ctx: AudioContext): void {
    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const destination = this.masterGain ?? ctx.destination;
      source.connect(destination);
      source.start(0);
      source.stop(0);
    } catch {
      // ignore unlock failures
    }
  }

  private async prepareContext(): Promise<AudioContext> {
    if (this.recoveryPromise !== null) {
      return this.recoveryPromise;
    }

    this.recoveryPromise = this.recoverRunningContext();
    try {
      return await this.recoveryPromise;
    } finally {
      this.recoveryPromise = null;
    }
  }

  private async recoverRunningContext(): Promise<AudioContext> {
    let ctx = this.ensureContextSync();
    if (ctx.state === 'closed') {
      this.recreateAudioContext();
      ctx = this.ensureContextSync();
    }

    const mustRecover =
      this.needsGestureReunlock
      || isPausedAudioContextState(ctx.state)
      || ctx.state === 'closed';

    if (mustRecover) {
      ctx = await this.resumeOrRecreateContext(ctx);
      if (!(await this.isContextHealthy(ctx))) {
        this.recreateAudioContext();
        ctx = this.ensureContextSync();
        ctx = await this.resumeOrRecreateContext(ctx);
        this.playSilentBuffer(ctx);
      }
      this.needsGestureReunlock = false;
    }

    return ctx;
  }

  private async resumeOrRecreateContext(ctx: AudioContext): Promise<AudioContext> {
    if (ctx.state === 'closed') {
      this.recreateAudioContext();
      ctx = this.ensureContextSync();
    }

    if (isPausedAudioContextState(ctx.state)) {
      try {
        await ctx.resume();
      } catch {
        this.recreateAudioContext();
        ctx = this.ensureContextSync();
        await ctx.resume().catch(() => undefined);
      }
    }

    return ctx;
  }

  private async isContextHealthy(ctx: AudioContext): Promise<boolean> {
    if (ctx.state === 'closed' || isPausedAudioContextState(ctx.state)) {
      return false;
    }
    if (ctx.state !== 'running') {
      return false;
    }

    const startedAt = ctx.currentTime;
    await new Promise((resolve) => {
      setTimeout(resolve, CONTEXT_HEALTH_CHECK_MS);
    });
    if (ctx.state !== 'running') {
      return false;
    }
    return ctx.currentTime > startedAt;
  }

  private recreateAudioContext(): void {
    const previous = this.context;
    this.context = null;
    this.masterGain = null;
    this.sessionId += 1;

    if (previous !== null && previous.state !== 'closed') {
      void previous.close();
    }

    for (const state of this.sampleStateByInstrument.values()) {
      state.bufferByFile.clear();
      state.prefetchStarted = false;
    }
  }

  private async prefetchInstrument(instrumentId: InstrumentId): Promise<void> {
    const definition = getInstrumentDefinition(instrumentId);
    if (definition.kind !== 'sample') {
      return;
    }

    const state = this.getSampleState(definition.id);
    if (state.prefetchStarted) {
      return;
    }
    state.prefetchStarted = true;

    const manifest = await this.loadManifest(definition);
    if (manifest === null || !this.context) {
      return;
    }

    const ctx = this.context;
    const files = [...new Set(manifest.entries.map((entry) => entry.file))];
    await Promise.all(
      files.map((file) => this.loadBuffer(ctx, definition, file)),
    );
  }

  private async prefetchActiveInstruments(): Promise<void> {
    await this.prefetchInstrument(this.playbackInstrumentId);
    await this.prefetchInstrument(this.repeatInstrumentId);
  }

  private async prefetchSampleForMidi(
    definition: InstrumentDefinition,
    midi: number,
  ): Promise<void> {
    if (definition.kind !== 'sample' || !this.context) {
      return;
    }
    const manifest = await this.loadManifest(definition);
    if (manifest === null) {
      return;
    }
    const mapping = nearestSampleForMidi(midi, manifest.entries);
    if (mapping === undefined) {
      return;
    }
    await this.loadBuffer(this.context, definition, mapping.file);
  }

  private async loadManifest(
    definition: InstrumentDefinition,
  ): Promise<SampleManifest | null> {
    const sampleBase = sampleBaseUrlForInstrument(definition);
    if (sampleBase === undefined) {
      return null;
    }

    const state = this.getSampleState(definition.id);
    if (state.manifest !== null) {
      return state.manifest;
    }
    if (state.manifestPromise !== null) {
      return state.manifestPromise;
    }

    state.manifestPromise = (async () => {
      try {
        const response = await fetch(`${sampleBase}manifest.json`);
        if (!response.ok) {
          return null;
        }
        const data = (await response.json()) as SampleManifest;
        state.manifest = data;
        return data;
      } catch {
        return null;
      }
    })();

    return state.manifestPromise;
  }

  private async loadBuffer(
    ctx: AudioContext,
    definition: InstrumentDefinition,
    file: string,
  ): Promise<AudioBuffer | null> {
    const sampleBase = sampleBaseUrlForInstrument(definition);
    if (sampleBase === undefined) {
      return null;
    }

    const state = this.getSampleState(definition.id);
    const cached = state.bufferByFile.get(file);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const response = await fetch(`${sampleBase}${file}`);
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      state.bufferByFile.set(file, buffer);
      return buffer;
    } catch {
      return null;
    }
  }

  private scheduleNote(
    ctx: AudioContext,
    midi: number,
    start: number,
    duration: number,
    gainMultiplier = 1,
    layer: SourceLayer = 'immediate',
  ): void {
    const layerGain =
      layer === 'repeat' ? gainMultiplier * REPEAT_PLAYBACK_GAIN : gainMultiplier;
    this.scheduleNoteWithDefinition(
      ctx,
      midi,
      start,
      duration,
      layerGain,
      layer,
      this.getInstrumentDefinitionForLayer(layer),
    );
  }

  private scheduleNoteWithDefinition(
    ctx: AudioContext,
    midi: number,
    start: number,
    duration: number,
    gainMultiplier: number,
    layer: SourceLayer,
    definition: InstrumentDefinition,
  ): void {
    const instrumentGain = playbackGainForInstrument(definition);

    if (definition.kind === 'synth') {
      this.scheduleSynthNote(
        ctx,
        midi,
        start,
        duration,
        getSynthPreset(definition.synthPresetId),
        gainMultiplier,
        layer,
        instrumentGain,
      );
      return;
    }

    if (
      instrumentUsesSamples(definition)
      && this.tryScheduleCachedSampleNote(
        ctx,
        definition,
        midi,
        start,
        duration,
        gainMultiplier,
        layer,
      )
    ) {
      return;
    }

    const preset = getSynthPreset(definition.synthPresetId);
    this.scheduleSynthNote(
      ctx,
      midi,
      start,
      duration,
      preset,
      gainMultiplier,
      layer,
      instrumentGain,
    );
  }

  private tryScheduleCachedSampleNote(
    ctx: AudioContext,
    definition: InstrumentDefinition,
    midi: number,
    start: number,
    _duration: number,
    gainMultiplier = 1,
    layer: SourceLayer = 'immediate',
  ): boolean {
    const state = this.getSampleState(definition.id);
    const manifest = state.manifest;
    if (manifest === null) {
      void this.prefetchSampleForMidi(definition, midi);
      return false;
    }

    const mapping = nearestSampleForMidi(midi, manifest.entries);
    if (mapping === undefined) {
      return false;
    }

    const buffer = state.bufferByFile.get(mapping.file);
    if (buffer === undefined) {
      void this.prefetchSampleForMidi(definition, midi);
      return false;
    }

    this.scheduleSampleFromBuffer(
      ctx,
      definition,
      buffer,
      midi,
      mapping.rootMidi,
      start,
      gainMultiplier,
      layer,
    );
    return true;
  }

  private scheduleSampleFromBuffer(
    ctx: AudioContext,
    definition: InstrumentDefinition,
    buffer: AudioBuffer,
    midi: number,
    rootMidi: number,
    start: number,
    gainMultiplier = 1,
    layer: SourceLayer = 'immediate',
  ): void {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    const rate = playbackRateForMidi(midi, rootMidi) * samplePitchRate(definition);
    source.playbackRate.value = rate;

    const naturalDuration = buffer.duration / rate;
    const maxDuration = sampleMaxDurationSec(definition);
    const playDuration = Math.min(maxDuration, naturalDuration);
    const attack = 0.003;
    const tailFade = Math.min(
      maxDuration * 0.35,
      Math.max(0.08, playDuration * 0.25),
    );

    const instrumentGain = playbackGainForInstrument(definition);
    const peakGain = SAMPLE_PEAK_GAIN * gainMultiplier * instrumentGain;

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peakGain, start + attack);
    gain.gain.setValueAtTime(
      peakGain,
      start + playDuration - tailFade,
    );
    gain.gain.linearRampToValueAtTime(0, start + playDuration);

    const destination = this.masterGain ?? ctx.destination;
    source.connect(gain);
    gain.connect(destination);
    this.registerSource(source, layer);
    source.start(start);
    source.stop(start + playDuration + 0.02);
  }

  private scheduleSynthNote(
    ctx: AudioContext,
    midi: number,
    start: number,
    duration: number,
    preset: SynthPreset,
    gainMultiplier = 1,
    layer: SourceLayer = 'immediate',
    instrumentGain = 1,
  ): void {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = preset.oscillatorType;
    oscillator.frequency.value = frequency;

    const peakGain = preset.peakGain * gainMultiplier * instrumentGain;
    let outputNode: AudioNode = gain;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peakGain, start + preset.attackSec);
    gain.gain.setValueAtTime(
      peakGain,
      start + duration - preset.releaseSec,
    );
    gain.gain.linearRampToValueAtTime(0, start + duration);

    oscillator.connect(gain);

    if (preset.filterCutoffHz !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = preset.filterCutoffHz;
      filter.Q.value = preset.filterQ ?? 1;
      gain.connect(filter);
      outputNode = filter;
    }

    if (preset.distortionAmount !== undefined && preset.distortionAmount > 0) {
      const shaper = createDistortionNode(ctx, preset.distortionAmount);
      outputNode.connect(shaper);
      outputNode = shaper;
    }

    const destination = this.masterGain ?? ctx.destination;
    outputNode.connect(destination);
    this.registerSource(oscillator, layer);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }
}

export const tonePlayer = new TonePlayer();
