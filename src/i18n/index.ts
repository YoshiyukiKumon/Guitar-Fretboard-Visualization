import type { FretboardViewMode } from '../domain/fretboard-view-mode';
import type { LabelDisplayMode } from '../domain/label-display-mode';
import type { InstrumentId } from '../domain/settings/instrument-catalog';
import type { AppMode } from '../app/storage';
import { enMessages } from './messages/en';
import { jaMessages, type MessageKey } from './messages/ja';
import { type AppLocale, DEFAULT_LOCALE } from './locale';

const MESSAGE_TABLE: Record<AppLocale, Record<MessageKey, string>> = {
  ja: jaMessages,
  en: enMessages,
};

let currentLocale: AppLocale = DEFAULT_LOCALE;

export function setLocale(locale: AppLocale): void {
  currentLocale = locale;
}

export function getLocale(): AppLocale {
  return currentLocale;
}

export function t(
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const table = MESSAGE_TABLE[currentLocale];
  let message = table[key] ?? MESSAGE_TABLE.ja[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      message = message.replace(`{${name}}`, String(value));
    }
  }
  return message;
}

export function getAppModeLabels(): Record<AppMode, string> {
  return {
    practice: t('nav.practice'),
    library: t('nav.library'),
    song: t('nav.song'),
    settings: t('nav.settings'),
  };
}

export function getViewModeLabels(): Record<FretboardViewMode, string> {
  return {
    fretboard: t('view.fretboard'),
    scale: t('view.scale'),
    chord: t('view.chord'),
    composite: t('view.composite'),
  };
}

export function getLabelModeLabels(): Record<LabelDisplayMode, string> {
  return {
    interval: t('label.interval'),
    note: t('label.note'),
    kana: t('label.kana'),
    dot: t('label.dot'),
  };
}

export function getInstrumentLabel(instrumentId: InstrumentId): string {
  const key = `instrument.${instrumentId}` as MessageKey;
  return t(key);
}

export function getLanguageIcon(locale: AppLocale): string {
  return locale === 'ja' ? 'JP' : 'EN';
}
