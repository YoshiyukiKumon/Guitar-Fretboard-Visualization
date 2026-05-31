import { tonePlayer } from '../audio/tone-player';
import { expandSongPartMeasures } from '../domain/song/expand-song-measures';
import type { SongBlockDef, SongDef } from '../domain/song/song-types';
import { t } from '../i18n';

const SONG_PLAY_BTN_CLASS = 'playback-toolbar__play library-song__play-btn';

export function createSongPlayButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = SONG_PLAY_BTN_CLASS;
  return button;
}

export function syncSongPlayButtonState(
  btn: HTMLButtonElement,
  playing: boolean,
  playAria?: string,
  stopAria?: string,
): void {
  btn.textContent = playing ? t('song.stop') : t('song.play');
  if (playAria && stopAria) {
    btn.setAttribute('aria-label', playing ? stopAria : playAria);
  }
  btn.classList.toggle('playback-toolbar__play--active', playing);
}

export function playSongSection(
  song: SongDef,
  blocks: readonly SongBlockDef[],
  partIndex: number,
  strumPatternId: string,
  bpm?: number,
  transposeSemitones = 0,
): void {
  const expanded = expandSongPartMeasures(song, blocks, partIndex, 1);
  if (expanded.length === 0) {
    return;
  }
  void tonePlayer.playSong(expanded, strumPatternId, 1, bpm, {
    scope: 'section',
    partIndex,
    transposeSemitones,
  });
}

export interface SectionPlayButtonOptions {
  partIndex: number;
  onPlay: () => void;
  sectionLabel?: string;
}

export function createSectionPlayButton(
  options: SectionPlayButtonOptions,
): HTMLButtonElement {
  const btn = createSongPlayButton();
  btn.classList.add('library-song__section-play');
  btn.dataset.partIndex = String(options.partIndex);

  const sync = (): void => {
    const playing = tonePlayer.isSectionPlaybackActive(options.partIndex);
    syncSongPlayButtonState(
      btn,
      playing,
      options.sectionLabel
        ? t('library.song.playSectionNamed', { name: options.sectionLabel })
        : t('library.song.playSection'),
      t('song.stopAria'),
    );
  };

  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (tonePlayer.isSectionPlaybackActive(options.partIndex)) {
      tonePlayer.stopRepeat();
      return;
    }
    options.onPlay();
  });

  sync();
  const unsubPlayback = tonePlayer.subscribePlayback(sync);
  const observer = new MutationObserver(() => {
    if (!btn.isConnected) {
      unsubPlayback();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return btn;
}

export function syncSectionPlayButtonsIn(root: ParentNode): void {
  for (const btn of root.querySelectorAll<HTMLButtonElement>(
    '.library-song__section-play',
  )) {
    const partIndex = Number(btn.dataset.partIndex);
    if (!Number.isFinite(partIndex)) {
      continue;
    }
    const playing = tonePlayer.isSectionPlaybackActive(partIndex);
    syncSongPlayButtonState(
      btn,
      playing,
      t('library.song.playSection'),
      t('song.stopAria'),
    );
  }
}
