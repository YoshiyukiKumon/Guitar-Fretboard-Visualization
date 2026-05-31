/** セクション折りたたみ進行プレビューなど、1 行あたりの最大小節数 */
export const SECTION_PREVIEW_MEASURES_PER_ROW = 8;

const SECTION_PREVIEW_ROW_GAP_PX = 4;

/** 行数固定で小節数を均等配分（先頭行から +1） */
export function resolveBalancedMeasuresPerRowWithRowCount(
  measureCount: number,
  rowCount: number,
): number[] {
  if (measureCount <= 0 || rowCount <= 0) {
    return [];
  }
  const safeRowCount = Math.min(rowCount, measureCount);
  const base = Math.floor(measureCount / safeRowCount);
  const extra = measureCount % safeRowCount;
  return Array.from({ length: safeRowCount }, (_, index) =>
    base + (index < extra ? 1 : 0),
  );
}

/** 最大小節数以内で行数を最小にした均等配分 */
export function resolveBalancedMeasuresPerRow(
  measureCount: number,
  maxMeasuresPerRow: number,
): number[] {
  if (measureCount <= 0 || maxMeasuresPerRow <= 0) {
    return [];
  }
  if (measureCount <= maxMeasuresPerRow) {
    return [measureCount];
  }
  const rowCount = Math.ceil(measureCount / maxMeasuresPerRow);
  return resolveBalancedMeasuresPerRowWithRowCount(measureCount, rowCount);
}

export function measureRowWidthsFit(
  groupWidths: readonly number[],
  measuresPerRow: readonly number[],
  containerWidth: number,
  gap: number,
): boolean {
  if (containerWidth <= 0) {
    return false;
  }

  let groupIndex = 0;
  for (const rowSize of measuresPerRow) {
    let rowWidth = 0;
    for (let i = 0; i < rowSize; i++) {
      const width = groupWidths[groupIndex];
      if (width === undefined) {
        return false;
      }
      if (i > 0) {
        rowWidth += gap;
      }
      rowWidth += width;
      groupIndex++;
    }
    if (rowWidth > containerWidth + 0.5) {
      return false;
    }
  }
  return groupIndex === groupWidths.length;
}

/** 横幅に収まる最少行数で均等配分。収まらなければ行数を増やす */
export function resolveMeasuresPerRowForWidth(
  groupWidths: readonly number[],
  containerWidth: number,
  maxMeasuresPerRow: number,
  gap: number = SECTION_PREVIEW_ROW_GAP_PX,
): number[] {
  const measureCount = groupWidths.length;
  if (measureCount === 0) {
    return [];
  }
  if (containerWidth <= 0) {
    return resolveBalancedMeasuresPerRow(measureCount, maxMeasuresPerRow);
  }

  const minRows = Math.max(1, Math.ceil(measureCount / maxMeasuresPerRow));
  for (let rowCount = minRows; rowCount <= measureCount; rowCount++) {
    const sizes = resolveBalancedMeasuresPerRowWithRowCount(
      measureCount,
      rowCount,
    );
    if (sizes.some((size) => size > maxMeasuresPerRow)) {
      continue;
    }
    if (measureRowWidthsFit(groupWidths, sizes, containerWidth, gap)) {
      return sizes;
    }
  }

  return Array.from({ length: measureCount }, () => 1);
}

export function appendMeasureGroupsToRows(
  root: HTMLElement,
  groups: readonly HTMLElement[],
  measuresPerRow: readonly number[],
): void {
  root.replaceChildren();
  let groupIndex = 0;

  for (const rowSize of measuresPerRow) {
    const row = document.createElement('div');
    row.className = 'song-chart__row';
    row.setAttribute('role', 'list');

    for (let i = 0; i < rowSize && groupIndex < groups.length; i++) {
      row.appendChild(groups[groupIndex]!);
      groupIndex++;
    }

    root.appendChild(row);
  }
}

export function collectSectionPreviewMeasureGroups(
  root: HTMLElement,
): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(':scope > .song-chart__row > .song-chart__measure-group'),
  );
}

export function anySectionPreviewRowOverflows(root: HTMLElement): boolean {
  return Array.from(root.querySelectorAll<HTMLElement>('.song-chart__row')).some(
    (row) => row.scrollWidth > row.clientWidth + 1,
  );
}

export function reflowSectionPreviewChart(
  root: HTMLElement,
  maxMeasuresPerRow: number = SECTION_PREVIEW_MEASURES_PER_ROW,
): void {
  const groups = collectSectionPreviewMeasureGroups(root);
  if (groups.length === 0) {
    return;
  }

  const measureCount = groups.length;
  const minRows = Math.max(1, Math.ceil(measureCount / maxMeasuresPerRow));

  for (let rowCount = minRows; rowCount <= measureCount; rowCount++) {
    const measuresPerRow = resolveBalancedMeasuresPerRowWithRowCount(
      measureCount,
      rowCount,
    );
    if (measuresPerRow.some((size) => size > maxMeasuresPerRow)) {
      continue;
    }
    appendMeasureGroupsToRows(root, groups, measuresPerRow);
    if (!anySectionPreviewRowOverflows(root)) {
      return;
    }
  }

  appendMeasureGroupsToRows(
    root,
    groups,
    Array.from({ length: measureCount }, () => 1),
  );
}

const sectionPreviewReflowCleanups = new WeakMap<HTMLElement, () => void>();

export function mountSectionPreviewChartReflow(
  host: HTMLElement,
  maxMeasuresPerRow: number = SECTION_PREVIEW_MEASURES_PER_ROW,
): void {
  sectionPreviewReflowCleanups.get(host)?.();

  const chart = host.querySelector<HTMLElement>('.song-chart--section-preview');
  if (!chart) {
    return;
  }

  const runReflow = (): void => {
    reflowSectionPreviewChart(chart, maxMeasuresPerRow);
  };

  const observer = new ResizeObserver(() => {
    runReflow();
  });
  observer.observe(chart);
  if (chart.parentElement) {
    observer.observe(chart.parentElement);
  }

  requestAnimationFrame(runReflow);

  sectionPreviewReflowCleanups.set(host, () => {
    observer.disconnect();
  });
}

export function unmountSectionPreviewChartReflow(host: HTMLElement): void {
  sectionPreviewReflowCleanups.get(host)?.();
  sectionPreviewReflowCleanups.delete(host);
}
