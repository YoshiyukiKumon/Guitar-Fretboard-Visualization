import { t } from '../i18n';
import type { LibraryTab } from './library-view';

export interface ListEditorConfig {
  items: { id: string; label: string; badge: string | null }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  renderForm: () => HTMLElement;
  /** When true, narrow viewports hide the list pane (master-detail). */
  mobileDetailWhenSelected?: boolean;
  /** Shown under back button on mobile detail (e.g. current song name). */
  detailTitle?: string | null;
}

const libraryListScrollTop: Record<LibraryTab, number> = {
  scale: 0,
  chord: 0,
  strum: 0,
  song: 0,
};

/** Mobile master-detail: true = form pane visible, list hidden (<720px). */
const libraryMobileDetail: Record<LibraryTab, boolean> = {
  scale: false,
  chord: false,
  strum: false,
  song: false,
};

export function resetLibraryListScroll(): void {
  libraryListScrollTop.scale = 0;
  libraryListScrollTop.chord = 0;
  libraryListScrollTop.strum = 0;
  libraryListScrollTop.song = 0;
  libraryMobileDetail.scale = false;
  libraryMobileDetail.chord = false;
  libraryMobileDetail.strum = false;
  libraryMobileDetail.song = false;
}

function openMobileDetail(tab: LibraryTab, wrap: HTMLElement): void {
  libraryMobileDetail[tab] = true;
  wrap.dataset.mobileDetail = 'true';
}

function closeMobileDetail(tab: LibraryTab, wrap: HTMLElement): void {
  libraryMobileDetail[tab] = false;
  wrap.dataset.mobileDetail = 'false';
}

/** Open mobile master-detail (e.g. deep link from song mode). */
export function setLibraryMobileDetail(tab: LibraryTab, open: boolean): void {
  libraryMobileDetail[tab] = open;
}

export function createListEditor(
  config: ListEditorConfig,
  tab: LibraryTab,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'library-view__split';

  const listPane = document.createElement('div');
  listPane.className = 'library-view__list-pane';

  const list = document.createElement('ul');
  list.className = 'library-view__list';

  for (const item of config.items) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'library-view__list-btn';
    if (item.id === config.selectedId && config.selectedId !== '__new__') {
      btn.classList.add('library-view__list-btn--active');
    }
    btn.textContent = item.label;
    if (item.badge) {
      const badge = document.createElement('span');
      badge.className = 'library-view__badge';
      badge.textContent = item.badge;
      btn.appendChild(badge);
    }
    btn.addEventListener('click', () => {
      libraryListScrollTop[tab] = list.scrollTop;
      if (config.mobileDetailWhenSelected) {
        openMobileDetail(tab, wrap);
      }
      config.onSelect(item.id);
    });
    li.appendChild(btn);
    list.appendChild(li);
  }

  listPane.appendChild(list);
  bindLibraryListScroll(list, tab);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'library-view__add-btn';
  addBtn.textContent = t('library.add');
  addBtn.addEventListener('click', () => {
    if (config.mobileDetailWhenSelected) {
      openMobileDetail(tab, wrap);
    }
    config.onAdd();
  });
  listPane.appendChild(addBtn);

  const formPane = document.createElement('div');
  formPane.className = 'library-view__form-pane';

  if (config.mobileDetailWhenSelected) {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'library-view__mobile-back';
    backBtn.textContent = t('library.backToList');
    backBtn.addEventListener('click', () => {
      closeMobileDetail(tab, wrap);
    });
    formPane.appendChild(backBtn);

    if (config.detailTitle) {
      const titleEl = document.createElement('h2');
      titleEl.className = 'library-view__form-pane-title';
      titleEl.textContent = config.detailTitle;
      formPane.appendChild(titleEl);
    }
  }

  formPane.appendChild(config.renderForm());

  wrap.appendChild(listPane);
  wrap.appendChild(formPane);

  if (config.mobileDetailWhenSelected && libraryMobileDetail[tab]) {
    wrap.dataset.mobileDetail = 'true';
  }

  return wrap;
}

function bindLibraryListScroll(list: HTMLElement, tab: LibraryTab): void {
  list.addEventListener(
    'scroll',
    () => {
      libraryListScrollTop[tab] = list.scrollTop;
    },
    { passive: true },
  );
  const savedTop = libraryListScrollTop[tab];
  if (savedTop <= 0) {
    return;
  }
  requestAnimationFrame(() => {
    list.scrollTop = savedTop;
    requestAnimationFrame(() => {
      if (list.scrollTop !== savedTop) {
        list.scrollTop = savedTop;
      }
    });
  });
}
