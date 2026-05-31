import type { AppSettings } from '../app/storage';
import {
  INSTRUMENT_CATALOG,
  type InstrumentId,
} from '../domain/settings/instrument-catalog';
import { getInstrumentLabel, t } from '../i18n';
import { changelogPageUrl } from '../app/asset-url';
import { tonePlayer } from '../audio/tone-player';
import { createVolumeControl } from './volume-control';

export interface SettingsViewCallbacks {
  onPlaybackInstrumentChange: (instrumentId: InstrumentId) => void;
  onRepeatInstrumentChange: (instrumentId: InstrumentId) => void;
  onVolumeChange: (volume: number) => void;
}

export interface SettingsSectionContext {
  settings: AppSettings;
  callbacks: SettingsViewCallbacks;
}

export interface SettingsSectionDefinition {
  id: 'instrument' | 'volume';
  titleKey: 'settings.instrument.title' | 'settings.volume.title';
  render: (context: SettingsSectionContext) => HTMLElement;
}

function renderInstrumentSection(context: SettingsSectionContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'settings-section__body';

  const hint = document.createElement('p');
  hint.className = 'settings-section__hint';
  hint.textContent = t('settings.instrument.hint');
  body.appendChild(hint);

  const fieldset = document.createElement('fieldset');
  fieldset.className = 'settings-instrument-list';
  const legend = document.createElement('legend');
  legend.className = 'settings-section__legend';
  legend.textContent = t('settings.instrument.legend');
  fieldset.appendChild(legend);

  const header = document.createElement('div');
  header.className = 'settings-instrument-list__header';
  header.setAttribute('aria-hidden', 'true');
  header.innerHTML = `
    <span class="settings-instrument-list__header-name"></span>
    <span class="settings-instrument-list__header-col">${t('settings.instrument.columnRepeat')}</span>
    <span class="settings-instrument-list__header-col">${t('settings.instrument.columnPlayback')}</span>
    <span class="settings-instrument-list__header-preview"></span>
  `;
  fieldset.appendChild(header);

  for (const instrument of INSTRUMENT_CATALOG) {
    const row = document.createElement('div');
    row.className = 'settings-instrument-list__row';

    const name = document.createElement('span');
    name.className = 'settings-instrument-list__name';
    const instrumentLabel = getInstrumentLabel(instrument.id);
    name.textContent = instrumentLabel;
    if (instrument.kind === 'synth') {
      name.textContent += t('settings.instrument.synthSuffix');
    }

    const repeatLabel = document.createElement('label');
    repeatLabel.className = 'settings-instrument-list__choice';
    const repeatInput = document.createElement('input');
    repeatInput.type = 'radio';
    repeatInput.name = 'repeat-instrument-id';
    repeatInput.className = 'settings-instrument-list__radio';
    repeatInput.value = instrument.id;
    repeatInput.checked = context.settings.repeatInstrumentId === instrument.id;
    repeatInput.setAttribute(
      'aria-label',
      t('settings.instrument.repeatAria', { label: instrumentLabel }),
    );
    repeatInput.addEventListener('change', () => {
      if (repeatInput.checked) {
        context.callbacks.onRepeatInstrumentChange(instrument.id);
      }
    });
    repeatLabel.appendChild(repeatInput);

    const playbackLabel = document.createElement('label');
    playbackLabel.className = 'settings-instrument-list__choice';
    const playbackInput = document.createElement('input');
    playbackInput.type = 'radio';
    playbackInput.name = 'playback-instrument-id';
    playbackInput.className = 'settings-instrument-list__radio';
    playbackInput.value = instrument.id;
    playbackInput.checked = context.settings.instrumentId === instrument.id;
    playbackInput.setAttribute(
      'aria-label',
      t('settings.instrument.playbackAria', { label: instrumentLabel }),
    );
    playbackInput.addEventListener('change', () => {
      if (playbackInput.checked) {
        context.callbacks.onPlaybackInstrumentChange(instrument.id);
      }
    });
    playbackLabel.appendChild(playbackInput);

    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'settings-instrument-list__preview';
    preview.textContent = '▶';
    preview.setAttribute(
      'aria-label',
      t('settings.instrument.previewAria', { label: instrumentLabel }),
    );
    preview.addEventListener('click', () => {
      void tonePlayer.previewInstrument(instrument.id);
    });

    row.append(name, repeatLabel, playbackLabel, preview);
    fieldset.appendChild(row);
  }

  body.appendChild(fieldset);
  return body;
}

function renderVolumeSection(context: SettingsSectionContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'settings-section__body';
  body.appendChild(
    createVolumeControl(context.settings.volume, context.callbacks.onVolumeChange),
  );
  return body;
}

/** 将来の設定項目はここに追加する */
export const SETTINGS_SECTIONS: readonly SettingsSectionDefinition[] = [
  {
    id: 'instrument',
    titleKey: 'settings.instrument.title',
    render: renderInstrumentSection,
  },
  {
    id: 'volume',
    titleKey: 'settings.volume.title',
    render: renderVolumeSection,
  },
];

export function createSettingsView(
  settings: AppSettings,
  callbacks: SettingsViewCallbacks,
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'settings-view';
  root.setAttribute('aria-label', t('settings.ariaLabel'));

  const intro = document.createElement('p');
  intro.className = 'settings-view__intro';
  intro.textContent = t('settings.intro');
  root.appendChild(intro);

  const context: SettingsSectionContext = { settings, callbacks };

  for (const section of SETTINGS_SECTIONS) {
    const block = document.createElement('section');
    block.className = 'settings-section';
    block.dataset.settingsSection = section.id;

    const heading = document.createElement('h2');
    heading.className = 'settings-section__title';
    heading.textContent = t(section.titleKey);
    block.appendChild(heading);
    block.appendChild(section.render(context));

    root.appendChild(block);
  }

  const footer = document.createElement('footer');
  footer.className = 'settings-view__footer';

  const changelogLink = document.createElement('a');
  changelogLink.className = 'settings-view__changelog-link';
  changelogLink.href = changelogPageUrl();
  changelogLink.target = '_blank';
  changelogLink.rel = 'noopener noreferrer';
  changelogLink.textContent = t('settings.changelog.link');

  footer.appendChild(changelogLink);
  root.appendChild(footer);

  return root;
}
