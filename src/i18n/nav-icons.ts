import type { AppMode } from '../app/storage';

const SVG_ATTRS =
  'class="segment-switcher__btn-icon" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"';

/** 練習: Dunlop Standard 型ピック（418R 系・高さ維持・先端 max y≈21.35） */
const PRACTICE_PICK_ICON = `<svg ${SVG_ATTRS}><path fill="currentColor" d="M7 3.75H17C19.2 3.75 20.3 5.6 19.3 7.1C18.85 9.35 17.15 12.85 13.25 20.35A2.5 1 0 0 1 10.75 20.35C6.85 12.85 5.15 9.35 4.7 7.1C4.2 5.6 5.3 3.75 7 3.75Z"/></svg>`;

export const APP_MODE_ICONS: Record<AppMode, string> = {
  practice: PRACTICE_PICK_ICON,
  library: `<svg ${SVG_ATTRS}><path fill="currentColor" d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v16h12V4H6Zm2 2h8v2H8V6Zm0 4h8v2H8v-2Zm0 4h5v2H8v-2Z"/></svg>`,
  song: `<svg ${SVG_ATTRS}><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z"/></svg>`,
  settings: `<svg ${SVG_ATTRS}><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.94 3a7.96 7.96 0 0 1 0 2l2.03 1.58a.5.5 0 0 1 .12.64l-1.92 3.32a.5.5 0 0 1-.6.22l-2.39-.96a8.06 8.06 0 0 1-1.73 1l-.36 2.54a.5.5 0 0 1-.5.43h-3.84a.5.5 0 0 1-.49-.42l-.36-2.55a8.06 8.06 0 0 1-1.73-1l-2.39.96a.5.5 0 0 1-.6-.22L2.91 15.2a.5.5 0 0 1 .12-.64L5.06 13a7.96 7.96 0 0 1 0-2L2.03 9.42a.5.5 0 0 1-.12-.64l1.92-3.32a.5.5 0 0 1 .6-.22l2.39.96a8.06 8.06 0 0 1 1.73-1l.36-2.54A.5.5 0 0 1 11.16 2h3.68a.5.5 0 0 1 .49.42l.36 2.55a8.06 8.06 0 0 1 1.73 1l2.39-.96a.5.5 0 0 1 .6.22l1.92 3.32a.5.5 0 0 1-.12.64L20.94 11Z"/></svg>`,
};
