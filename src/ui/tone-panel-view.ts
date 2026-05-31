import { tonePlayer, type PlaybackButtonId, type TonePlaybackMode } from '../audio/tone-player';
import type { FretboardModel } from '../domain/fretboard';
import {
  formatChordName,
  formatScaleChordSummary,
  formatScaleName,
  noteNamesFromTones,
} from '../domain/tone-sequence';
import { clampBpm, MAX_BPM, MIN_BPM } from '../domain/playback-bpm';
import {
  displayStrumPatternName,
  listStrumPatterns,
} from '../domain/music-library/registry';
import { t } from '../i18n';
import {
  createPlaybackToolbarField,
  createPlaybackToolbarPlayButton,
} from './playback-toolbar';

export interface TonePanelOptions {
  bpm: number;
  strumPatternId: string;
  onBpmChange: (bpm: number) => void;
  onStrumPatternChange: (strumPatternId: string) => void;
}

const PLAYBACK_BUTTON_IDS: Record<
  Exclude<TonePlaybackMode, null>,
  PlaybackButtonId
> = {
  scale: 'tone-panel:scale',
  arpeggio: 'tone-panel:arpeggio',
  repeat: 'tone-panel:repeat',
};

function getPlayLabels(): Record<
  Exclude<TonePlaybackMode, null>,
  { play: string; stop: string; ariaPlay: string; ariaStop: string }
> {
  return {
    scale: {
      play: t('tone.play.scale'),
      stop: t('tone.stop'),
      ariaPlay: t('tone.aria.scalePlay'),
      ariaStop: t('tone.aria.scaleStop'),
    },
    arpeggio: {
      play: t('tone.play.arpeggio'),
      stop: t('tone.stop'),
      ariaPlay: t('tone.aria.arpeggioPlay'),
      ariaStop: t('tone.aria.arpeggioStop'),
    },
    repeat: {
      play: t('tone.play.repeat'),
      stop: t('tone.stop'),
      ariaPlay: t('tone.aria.repeatPlay'),
      ariaStop: t('tone.aria.repeatStop'),
    },
  };
}

export function createTonePanel(
  model: FretboardModel,
  options: TonePanelOptions,
): HTMLElement {
  const tones = document.createElement('aside');
  tones.className = 'tone-panel';

  const topRow = document.createElement('div');
  topRow.className = 'tone-panel__top';

  const summary = document.createElement('p');
  summary.className = 'tone-panel__summary';
  summary.textContent = formatScaleChordSummary(
    model.scaleKey,
    model.scale,
    model.chordKey,
    model.chord,
  );
  topRow.appendChild(summary);
  topRow.appendChild(
    createPlaybackControls(
      options.strumPatternId,
      options.bpm,
      options.onStrumPatternChange,
      options.onBpmChange,
    ),
  );
  tones.appendChild(topRow);

  const scaleBlock = document.createElement('div');
  scaleBlock.className = 'tone-panel__block';
  const scalePlayBtn = createPlaybackButton('scale');
  scaleBlock.appendChild(
    createToneBlockHeader(
      formatScaleName(model.scaleKey, model.scale),
      scalePlayBtn,
    ),
  );
  scaleBlock.appendChild(
    createToneLines(
      model.scale.tones.join(' · '),
      noteNamesFromTones(model.scaleKey, model.scale.tones, model.scaleKey),
    ),
  );
  scalePlayBtn.addEventListener('click', () => {
    if (tonePlayer.isPlaybackActive('tone-panel:scale')) {
      tonePlayer.stopOverlay();
      return;
    }
    void tonePlayer.playScale(model.scaleKey, model.scale);
  });
  tones.appendChild(scaleBlock);

  const chordBlock = document.createElement('div');
  chordBlock.className = 'tone-panel__block';
  const blockPlayBtn = createTonePlayButton(
    t('tone.play.chordBlock'),
    t('tone.aria.chordBlock'),
    () => {
      tonePlayer.stop();
      void tonePlayer.playChord(model.chordKey, model.chord);
    },
  );
  const arpeggioPlayBtn = createPlaybackButton('arpeggio');
  const repeatPlayBtn = createPlaybackButton('repeat');
  chordBlock.appendChild(
    createChordToneBlockHeader(
      formatChordName(model.chordKey, model.chord, model.scaleKey),
      blockPlayBtn,
      arpeggioPlayBtn,
      repeatPlayBtn,
    ),
  );
  chordBlock.appendChild(
    createToneLines(
      model.chord.tones.join(' · '),
      noteNamesFromTones(model.chordKey, model.chord.tones, model.scaleKey),
    ),
  );
  arpeggioPlayBtn.addEventListener('click', () => {
    if (tonePlayer.isPlaybackActive('tone-panel:arpeggio')) {
      tonePlayer.stopOverlay();
      return;
    }
    void tonePlayer.playChordArpeggio(model.chordKey, model.chord);
  });
  repeatPlayBtn.addEventListener('click', () => {
    if (tonePlayer.isPlaybackActive('tone-panel:repeat')) {
      tonePlayer.stopRepeat();
      return;
    }
    void tonePlayer.playChordRepeat(model.chordKey, model.chord);
  });
  tones.appendChild(chordBlock);

  const playbackButtons: Record<
    Exclude<TonePlaybackMode, null>,
    HTMLButtonElement
  > = {
    scale: scalePlayBtn,
    arpeggio: arpeggioPlayBtn,
    repeat: repeatPlayBtn,
  };

  const syncPlaybackButtons = (): void => {
    const playLabels = getPlayLabels();
    for (const mode of ['scale', 'arpeggio', 'repeat'] as const) {
      const btn = playbackButtons[mode];
      const labels = playLabels[mode];
      const buttonId = PLAYBACK_BUTTON_IDS[mode];
      const isActive = tonePlayer.isPlaybackActive(buttonId);
      btn.textContent = isActive ? labels.stop : labels.play;
      btn.setAttribute('aria-label', isActive ? labels.ariaStop : labels.ariaPlay);
      btn.classList.toggle('playback-toolbar__play--active', isActive);
    }
  };

  tonePlayer.subscribePlayback(syncPlaybackButtons);
  syncPlaybackButtons();

  return tones;
}

function createPlaybackControls(
  strumPatternId: string,
  bpm: number,
  onStrumPatternChange: (strumPatternId: string) => void,
  onBpmChange: (bpm: number) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'playback-toolbar';

  wrap.appendChild(
    createStrumPatternSelect(strumPatternId, onStrumPatternChange),
  );
  wrap.appendChild(createBpmControl(bpm, onBpmChange));
  return wrap;
}

function createStrumPatternSelect(
  selectedId: string,
  onChange: (strumPatternId: string) => void,
): HTMLElement {
  const select = document.createElement('select');
  select.className = 'playback-toolbar__select';
  select.setAttribute('aria-label', t('tone.strumSelectAria'));

  for (const item of listStrumPatterns()) {
    const option = document.createElement('option');
    option.value = item.def.id;
    option.textContent = displayStrumPatternName(item.def, item.source);
    select.appendChild(option);
  }

  select.value = selectedId;
  select.addEventListener('change', () => {
    onChange(select.value);
  });

  return createPlaybackToolbarField(t('tone.rhythm'), select);
}

function createBpmControl(bpm: number, onChange: (bpm: number) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'playback-toolbar__input';
  input.min = String(MIN_BPM);
  input.max = String(MAX_BPM);
  input.step = '1';
  input.value = String(bpm);
  input.setAttribute('aria-label', t('tone.bpmAria'));

  const commit = (): void => {
    const next = clampBpm(Number(input.value));
    input.value = String(next);
    onChange(next);
  };

  input.addEventListener('change', commit);
  input.addEventListener('blur', commit);

  return createPlaybackToolbarField('BPM', input);
}

function createToneLines(intervalLine: string, noteNameLine: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'tone-panel__lines';

  const intervals = document.createElement('p');
  intervals.className = 'tone-panel__tones';
  intervals.textContent = intervalLine;

  const noteNames = document.createElement('p');
  noteNames.className = 'tone-panel__note-names';
  noteNames.textContent = noteNameLine;

  wrap.appendChild(intervals);
  wrap.appendChild(noteNames);
  return wrap;
}

function createChordToneBlockHeader(
  title: string,
  blockBtn: HTMLButtonElement,
  arpeggioBtn: HTMLButtonElement,
  repeatBtn: HTMLButtonElement,
): HTMLElement {
  const head = document.createElement('div');
  head.className = 'tone-panel__head tone-panel__head--chord';

  const heading = document.createElement('h2');
  heading.className = 'tone-panel__heading';
  heading.textContent = title;

  const actions = document.createElement('div');
  actions.className = 'tone-panel__head-actions';
  actions.appendChild(blockBtn);
  actions.appendChild(arpeggioBtn);
  actions.appendChild(repeatBtn);

  head.appendChild(heading);
  head.appendChild(actions);
  return head;
}

function createPlaybackButton(mode: Exclude<TonePlaybackMode, null>): HTMLButtonElement {
  const labels = getPlayLabels()[mode];
  return createTonePlayButton(labels.play, labels.ariaPlay);
}

function createTonePlayButton(
  label: string,
  ariaLabel: string,
  onClick?: () => void,
): HTMLButtonElement {
  const playBtn = createPlaybackToolbarPlayButton();
  playBtn.setAttribute('aria-label', ariaLabel);
  playBtn.textContent = label;
  if (onClick !== undefined) {
    playBtn.addEventListener('click', onClick);
  }
  return playBtn;
}

function createToneBlockHeader(
  title: string,
  playBtn: HTMLButtonElement,
): HTMLElement {
  const head = document.createElement('div');
  head.className = 'tone-panel__head';

  const heading = document.createElement('h2');
  heading.className = 'tone-panel__heading';
  heading.textContent = title;

  head.appendChild(heading);
  head.appendChild(playBtn);
  return head;
}
