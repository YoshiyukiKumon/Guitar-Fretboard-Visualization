/** 小節内の 1 コード（拍位置付き） */
export interface SongChordEvent {
  /** 小節内開始位置（4 分音符拍単位、0 起点） */
  offsetBeats: number;
  /** コードのルート（例: Am7 なら A）。曲キー（転調）とは別 */
  chordRootKeyId: string;
  /** ライブラリのコード ID（組み込み + カスタム） */
  chordId: string;
}

/** 小節に付ける記号・指示 */
export interface SongMeasureMarkers {
  repeatStart?: boolean;
  repeatEnd?: boolean;
  segno?: boolean;
  fine?: boolean;
  coda?: boolean;
  toCoda?: boolean;
  firstEnding?: boolean;
  secondEnding?: boolean;
  thirdEnding?: boolean;
  daCapoAlFine?: boolean;
  dalSegnoAlFine?: boolean;
  daCapoAlCoda?: boolean;
  dalSegnoAlCoda?: boolean;
}

/** 1 小節 */
export interface SongMeasure {
  keyId?: string;
  timeSignature?: string;
  /** 伴奏ストローク override。未指定は曲既定 strumPatternId を継承 */
  strumPatternId?: string;
  markers?: SongMeasureMarkers;
  events: SongChordEvent[];
}

/** ブロック（マスター） */
export interface SongBlockDef {
  id: string;
  label: string;
  measures: SongMeasure[];
}

/** 曲構成の 1 要素 */
export type SongPart =
  | {
      type: 'block';
      blockId: string;
      /** true = 参照のみ（編集不可） */
      reference?: boolean;
    }
  | {
      type: 'inline';
      measures: SongMeasure[];
    };

/** 曲定義 */
export interface SongDef {
  id: string;
  name: string;
  defaultKeyId: string;
  defaultTimeSignature: string;
  bpm?: number;
  strumPatternId: string;
  parts: SongPart[];
  /** 0 = 無限ループ */
  playCount: number;
}

/** 展開後の 1 小節（再生・チャート用） */
export interface ExpandedMeasure {
  sourceMeasureIndex: number;
  playbackIndex: number;
  cycleIndex: number;
  events: SongChordEvent[];
  timeSignature: string;
  effectiveKeyId: string;
  effectiveStrumPatternId: string;
  measureQuarterBeats: number;
  markers?: SongMeasureMarkers;
  /** パート先頭小節のみ（チャートのブロック境界表示用） */
  partLabel?: string;
}
