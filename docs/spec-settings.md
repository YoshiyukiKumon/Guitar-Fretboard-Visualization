# 設定画面仕様

## 概要

ヘッダーの **練習 / ライブラリ / 設定**（アイコンタブ）から各画面に遷移する。設定項目は **セクション単位** で追加できる構成とする。

## 表示言語

- ヘッダー右端の言語ボタン（`JP` / `EN`）から **日本語 / English** を切り替え
- 永続化: `guitar-practice-settings` の `locale`（`ja` | `en`、既定 `ja`）
- ライブラリの組み込みスケール・コード名およびユーザー保存データの名前はローカライズしない（ストロークパターン組み込み名のみ英語表記）

## 永続化

| キー | フィールド | 説明 |
|------|------------|------|
| `guitar-practice-settings` | `appMode` | `practice` / `library` / `settings` |
| 同上 | `locale` | `ja` / `en` |
| 同上 | `instrumentId` | その他の再生楽器 ID（指板・スケール・コード同時など） |
| 同上 | `repeatInstrumentId` | コードリピートの楽器 ID |
| 同上 | `volume` | 0〜100（練習画面・設定画面で共通） |
| 同上 | `bpm` | 40〜240（構成音パネル再生テンポ、既定 120） |

## 楽器一覧（`instrumentId` / `repeatInstrumentId`）

- 設定画面では各行に **リピート** / **その他** のラジオボタンを並べ、音色を個別に指定する
- コードリピートはマスター音量に加え、内部ゲイン **35%**（その他再生比 50% の 70%）で再生

| ID | 表示名 | 再生方式 | 同梱 |
|----|--------|----------|------|
| `acoustic-steel` | アコースティック（スチール） | サンプル | ○ |
| `acoustic-nylon` | アコースティック（ナイロン） | サンプル | ○ |
| `electric-clean` | エレキ（クリーン） | サンプル | ○ |
| `electric-overdrive` | エレキ（オーバードライブ） | サンプル | ○ |
| `electric-distortion` | エレキ（ディストーション） | サンプル | ○ |
| `piano` | ピアノ | サンプル | ○ |
| `synth-tone` | シンセ | 合成音 | — |

- **シンセ** = 三角波オシレータ（Web Audio API）。**唯一の合成音**。
- サンプル楽器は `public/samples/<sampleDir>/manifest.json` を参照
- サンプル読込失敗時のみ、各楽器の合成フォールバックを使用
- **ナイロン弦**（Iowa MIS）: manifest は 1 ファイル 1 エントリ（`rootMidi` = ファイル名先頭音）。録音ピッチがやや低いため `samplePitchCents: 30` で補正

## 音色間の音量平準化

- **基準**: `acoustic-nylon` の pack 内で最もピークが大きいサンプル（`SAMPLE_PEAK_GAIN` 適用前のバッファ振幅）
- 各楽器 pack も同様に最大ピークを計測し、係数 `playbackGain = 基準ピーク / 当該 pack 最大ピーク` を乗算
- **シンセ**（`synth-tone`）はサンプルがないため、ナイロン基準の出力ピーク（`基準バッファピーク × SAMPLE_PEAK_GAIN`）に合わせて合成 `peakGain` を補正
- 係数定義: `src/domain/settings/instrument-playback-gain.ts`
- サンプル更新時は `node scripts/measure-sample-peaks.mjs` で再計測し、上記ファイルの定数を更新する

| ID | playbackGain（概算） |
|----|---------------------|
| `acoustic-nylon` | 1.00 |
| `acoustic-steel` | 1.03 |
| `electric-clean` | 1.03 |
| `piano` | 1.03 |
| `electric-distortion` | 1.23 |
| `electric-overdrive` | 1.62 |
| `synth-tone` | 4.07 |

## iOS Safari 向け AudioContext 復旧

- バックグラウンド復帰時（`visibilitychange` → `visible`、bfcache の `pageshow`）に再解放フラグを立てる
- ユーザー操作（タップ）の同期スタック内で `resume()` + 無音バッファを実行
- 再生前に `suspended` / `interrupted` を `await resume()`。失敗または `currentTime` が進まない場合は **AudioContext を再作成**
- 再作成時はサンプル `AudioBuffer` キャッシュを破棄し prefetch を再実行（manifest は保持）

## UI

- **設定 > 再生音**: 楽器ごとにリピート / その他のラジオ + ▶ 試聴
- **設定 > 音量**: 練習画面と同じスライダー
- **設定画面フッター**: リリースノート（`public/changelog.html`）へのリンク
- 新規セクションは `src/ui/settings-view.ts` の `SETTINGS_SECTIONS` に追加

## リリースノート

- Markdown: リポジトリ直下 `CHANGELOG.md`
- HTML: `public/changelog.html`（ビルド後 `dist/changelog.html`、スタンドアロン同梱）
- 設定画面から新規タブで開く（`changelogPageUrl()`）

## 関連コード

| ファイル | 役割 |
|----------|------|
| `src/domain/settings/instrument-catalog.ts` | 楽器定義レジストリ |
| `src/domain/settings/instrument-playback-gain.ts` | 音色間音量平準化係数 |
| `src/audio/tone-player.ts` | 楽器切替・サンプル/合成再生・iOS 向け AudioContext 復旧 |
| `src/audio/audio-context-state.ts` | AudioContext 一時停止状態の判定 |
| `src/audio/synth-presets.ts` | 合成音プリセット |
| `src/ui/settings-view.ts` | 設定 UI |

## 更新履歴

| 版 | 日付 | 内容 |
|----|------|------|
| 1.0 | 2026-05-23 | 設定タブ・楽器選択・音量セクション |
| 1.1 | 2026-05-23 | シンセ以外6楽器をサンプル再生に変更（FreePats / Iowa MIS） |
| 1.2 | 2026-05-23 | エレキ系サンプル減衰 0.5 秒、ピアノ 0.7 秒（アコースティックは 1.5 秒） |
| 1.3 | 2026-05-20 | ナイロン manifest 修正・`samplePitchCents` による音程補正 |
| 1.4 | 2026-05-20 | iOS Safari 向け AudioContext 解放・サンプル URL 正規化 |
| 1.5 | 2026-05-20 | iOS バックグラウンド復帰後の AudioContext 再解放・再作成 |
| 1.6 | 2026-05-24 | 構成音パネル BPM 設定（localStorage `bpm`） |
| 1.7 | 2026-05-20 | ナイロン基準の pack 最大ピーク平準化（`instrument-playback-gain.ts`） |
| 1.8 | 2026-05-30 | リリースノート（`CHANGELOG.md` / `changelog.html`）と設定画面リンク |
