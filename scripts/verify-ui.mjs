/**
 * UI/UX 動作確認（Playwright）
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function resolveUrl(arg) {
  if (!arg || arg === 'standalone') {
    const htmlPath = path.join(rootDir, 'standalone', 'guitar-practice.html');
    return pathToFileURL(htmlPath).href;
  }
  return arg;
}

const baseUrl = resolveUrl(process.argv[2]);
const errors = [];

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

async function runChecks(page) {
  const title = await page.title();
  assert(title === 'ギター練習ツール', `title: ${title}`);

  const scaleKeySelect = page.locator('#scale-key-select');
  const toneSummary = page.locator('.tone-panel__summary');
  assert((await toneSummary.textContent())?.includes('Major'), 'tone summary missing scale name');
  assert((await toneSummary.textContent())?.includes('/'), 'tone summary should join scale and chord');

  const noteNameLines = page.locator('.tone-panel__note-names');
  assert((await noteNameLines.count()) === 2, 'expected note name lines for scale and chord');
  assert((await noteNameLines.first().textContent())?.includes('C'), 'scale note names expected');

  const playButtons = page.locator('.tone-panel .playback-toolbar__play');
  assert((await playButtons.count()) === 4, 'expected scale + chord block + arpeggio + repeat buttons');
  assert(
    (await playButtons.nth(0).textContent()) === '▶ 再生',
    'scale play button label',
  );
  assert(
    (await playButtons.nth(1).textContent()) === '▶ 同時',
    'chord block play button label',
  );
  assert(
    (await playButtons.nth(2).textContent()) === '▶ アルペジオ',
    'chord arpeggio play button label',
  );
  assert(
    (await playButtons.nth(3).textContent()) === '∞ リピート',
    'chord repeat play button label',
  );

  const bpmInput = page.locator('.tone-panel .playback-toolbar__input');
  assert((await bpmInput.count()) === 1, 'BPM input missing');
  assert((await bpmInput.inputValue()) === '90', 'default BPM should be 90');

  const strumSelect = page.locator('.tone-panel .playback-toolbar__select');
  assert((await strumSelect.count()) === 1, 'strum pattern select missing');
  assert(
    (await strumSelect.inputValue()) === 'builtin-strum-syncopation',
    'default strum pattern should be syncopation',
  );
  const strumOptions = await strumSelect.locator('option').allTextContents();
  assert(strumOptions.some((label) => label.includes('Quarter notes')), 'builtin quarter strum pattern missing');
  assert(strumOptions.some((label) => label.includes('Eighth notes')), 'builtin eighth strum pattern missing');
  assert(
    strumOptions.some((label) => label.includes('Syncopation')),
    'builtin syncopation strum pattern missing',
  );
  assert(strumOptions.some((label) => label.includes('3/4 time')), 'builtin 3/4 strum pattern missing');
  assert(strumOptions.some((label) => label.includes('Shuffle')), 'builtin shuffle strum pattern missing');

  await playButtons.nth(0).click();
  await page.waitForTimeout(80);
  assert(
    (await playButtons.nth(0).textContent()) === '■ 停止',
    'scale button should become stop while playing',
  );
  await playButtons.nth(0).click();
  await page.waitForTimeout(80);
  assert(
    (await playButtons.nth(0).textContent()) === '▶ 再生',
    'scale button should return to play after stop',
  );

  const scaleSelect = page.locator('#scale-select');
  const chordKeySelect = page.locator('#chord-key-select');
  const chordSelect = page.locator('#chord-select');
  const selectorRows = page.locator('.music-selectors__row');
  assert((await selectorRows.count()) === 2, 'expected scale and chord selector rows');

  assert((await scaleKeySelect.count()) === 1, 'scale key select missing');
  assert((await scaleSelect.count()) === 1, 'scale select missing');
  assert((await chordKeySelect.count()) === 1, 'chord key select missing');
  assert((await chordSelect.count()) === 1, 'chord select missing');
  assert((await scaleKeySelect.inputValue()) === 'C', 'default scale key should be C');
  assert((await chordKeySelect.inputValue()) === 'C', 'default chord key should be C');

  await scaleKeySelect.selectOption('Ab');
  const chordLabelsAb = await chordKeySelect.locator('option').allTextContents();
  assert(
    chordLabelsAb.includes('Gb'),
    `Ab key chord roots should spell Gb, got ${chordLabelsAb.join(',')}`,
  );
  assert(
    !chordLabelsAb.some((t) => t.includes('#')),
    'Ab key chord root labels should not use sharps',
  );

  await scaleKeySelect.selectOption('D');
  const chordLabelsD = await chordKeySelect.locator('option').allTextContents();
  assert(
    chordLabelsD.includes('F#'),
    `D key chord roots should spell F#, got ${chordLabelsD.join(',')}`,
  );
  assert(
    !chordLabelsD.some((t) => t.includes('b')),
    'D key chord root labels should not use flats',
  );

  await scaleKeySelect.selectOption('C');
  assert((await chordKeySelect.inputValue()) === 'C', 'chord key should stay on C pitch class');

  const viewTitle = page.locator('.view-switcher__title');
  assert((await viewTitle.textContent()) === '表示', 'view switcher title should be 表示');

  const viewTabs = page.locator('.view-switcher .segment-switcher__btn');
  assert((await viewTabs.count()) === 4, 'expected 4 view mode tabs');
  const scaleViewTab = page.locator('.view-switcher .segment-switcher__btn', {
    hasText: 'スケール',
  });
  assert(
    (await scaleViewTab.getAttribute('aria-selected')) === 'true',
    'scale should be default view mode',
  );

  const toolsRow = page.locator('.app-controls__tools');
  assert((await toolsRow.count()) === 1, 'label and volume should share one row');

  const labelSwitcherTitle = page.locator('.label-switcher__title');
  assert((await labelSwitcherTitle.textContent()) === '指板', 'label switcher title');

  const labelTabs = page.locator('.label-switcher .segment-switcher__btn');
  assert((await labelTabs.count()) === 4, 'expected 4 label mode tabs');
  assert((await labelTabs.nth(0).textContent()) === '●', 'first label tab should be dot');
  assert(
    (await labelTabs.nth(0).getAttribute('aria-selected')) === 'true',
    'dot should be default label mode',
  );
  assert(
    (await page.locator('.interval-capsule--dot-circle').count()) > 0,
    'dot mode should be active on first load',
  );

  await page
    .locator('.label-switcher .segment-switcher__btn', { hasText: 'インターバル' })
    .click();

  const volumeSlider = page.locator('#volume-slider');
  assert((await volumeSlider.count()) === 1, 'volume slider missing');
  assert((await volumeSlider.inputValue()) === '80', 'default volume should be 80');

  await page.locator('.fretboard').waitFor({ state: 'visible' });

  const stringLabels = page.locator('.fretboard__string-label');
  assert((await stringLabels.count()) === 6, 'expected 6 string labels');

  const stringNames = await page.locator('.fretboard__string-name').allTextContents();
  assert(stringNames[0] === 'E' && stringNames[1] === 'B', 'top should be 1st string E then B');
  assert(stringNames[4] === 'A' && stringNames[5] === 'E', 'bottom should be 5th A then 6th E');

  const intersections = page.locator('.fretboard__intersection');
  assert((await intersections.count()) === 150, 'expected 150 intersections (6×25)');

  const tapTargets = page.locator('button.fretboard__tap-target');
  assert((await tapTargets.count()) === 150, 'expected 150 fret tap targets (6×25)');
  assert(
    (await tapTargets.first().getAttribute('aria-label'))?.includes('再生'),
    'tap target should have play aria-label',
  );

  const hitProbe = await page.evaluate(() => {
    const btn = document.querySelector('button.fretboard__tap-target');
    if (!btn) {
      return null;
    }
    const r = btn.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const centerX = r.left + r.width / 2;
    const el = document.elementFromPoint(centerX, y);
    return {
      isButton: el === btn,
      className: el?.className ?? '',
    };
  });
  assert(hitProbe?.isButton === true, `center of tap target should hit button, got ${hitProbe?.className}`);

  const edgeHit = await page.evaluate(() => {
    const btn = document.querySelector('button.fretboard__tap-target');
    if (!btn) {
      return false;
    }
    const r = btn.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + 3, r.top + r.height / 2);
    return el === btn;
  });
  assert(edgeHit, 'left edge of fret tap target should be clickable');

  const capsules = page.locator('.interval-capsule--playable');
  assert((await capsules.count()) === 150, 'expected 150 visual capsules in interval mode');

  const borderRadius = await capsules.first().evaluate((el) => getComputedStyle(el).borderRadius);
  assert(
    borderRadius === '999px' || parseInt(borderRadius, 10) >= 50,
    `capsule should be pill shape, got ${borderRadius}`,
  );

  await page.locator('.view-switcher .segment-switcher__btn', { hasText: 'スケール' }).click();
  const scaleRootCapsule = page.locator('.interval-capsule--scale-root').first();
  const scaleRootBg = await scaleRootCapsule.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  const scaleRootColor = await scaleRootCapsule.evaluate(
    (el) => getComputedStyle(el).color,
  );
  assert(scaleRootBg !== 'rgba(0, 0, 0, 0)', 'scale root capsule background missing');
  assert(
    scaleRootColor === 'rgb(255, 255, 255)',
    `scale root text should be white, got ${scaleRootColor}`,
  );

  const mutedCapsule = page.locator('.interval-capsule--muted').first();
  const mutedStyles = await mutedCapsule.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      bg: s.backgroundColor,
      padding: s.paddingLeft,
      radius: s.borderRadius,
    };
  });
  assert(
    mutedStyles.bg === 'rgba(0, 0, 0, 0)' || mutedStyles.bg === 'transparent',
    `muted should have no background, got ${mutedStyles.bg}`,
  );
  assert(parseFloat(mutedStyles.padding) === 0, 'muted should have no capsule padding');

  const scaleCapsule = page.locator('.interval-capsule--scale').first();
  assert((await scaleCapsule.count()) > 0, 'scale capsules missing');

  const inlayDots = page.locator('.fretboard__inlay-dot');
  assert((await inlayDots.count()) === 10, `inlay dots: ${await inlayDots.count()}`);

  const inlayAlignment = await page.evaluate(() => {
    const headCells = [...document.querySelectorAll('.fretboard__head-cell--fret')];
    const markers = [...document.querySelectorAll('.fretboard__inlay-marker')];
    const cellMid = (fret) => {
      const cell = headCells[fret - 1];
      const r = cell.getBoundingClientRect();
      return (r.left + r.right) / 2;
    };
    const markerCx = (marker) => {
      const r = marker.getBoundingClientRect();
      return r.x + r.width / 2;
    };
    const checks = markers.map((marker) => {
      const col = Number(marker.style.gridColumn);
      const fret = col - 2;
      const mid = cellMid(fret);
      const cx = markerCx(marker);
      return { fret, cx, mid, delta: Math.abs(cx - mid) };
    });
    const nums = [...document.querySelectorAll(
      '.fretboard__head-cell--fret .fretboard__fret-num',
    )].map((el) => ({
      text: el.textContent,
      cx: el.getBoundingClientRect().x + el.getBoundingClientRect().width / 2,
    }));
    const inlay3 = markers.find((m) => Number(m.style.gridColumn) === 5);
    const f2 = nums.find((n) => n.text === '2');
    const f3 = nums.find((n) => n.text === '3');
    const cx3 = inlay3 ? markerCx(inlay3) : null;
    return { checks, cx3, f2cx: f2?.cx, f3cx: f3?.cx };
  });
  assert(inlayAlignment.checks.length === 9, 'expected 9 inlay markers');
  for (const row of inlayAlignment.checks) {
    assert(
      row.delta < 1,
      `fret ${row.fret} inlay should match column center (delta ${row.delta}px)`,
    );
  }
  assert(
    inlayAlignment.cx3 > inlayAlignment.f2cx &&
      inlayAlignment.cx3 < inlayAlignment.f3cx,
    `fret 3 inlay should be between fret 2 and 3 wires (${inlayAlignment.cx3} vs ${inlayAlignment.f2cx}-${inlayAlignment.f3cx})`,
  );

  const lastOpen = page.locator('.fretboard__intersection--open').nth(5);
  const firstInlayDot = inlayDots.first();
  const lastOpenBox = await lastOpen.boundingBox();
  const inlayBox = await firstInlayDot.boundingBox();
  assert(!!lastOpenBox && !!inlayBox, 'inlay position boxes missing');
  assert(
    inlayBox.y >= lastOpenBox.y + lastOpenBox.height - 2,
    'inlay dots should be below the lowest string row',
  );

  const boardBg = await page.locator('.fretboard__grid').evaluate((el) => {
    const before = getComputedStyle(el, '::before');
    const gridRect = el.getBoundingClientRect();
    const top = gridRect.top + parseFloat(before.top || '0');
    const height = parseFloat(before.height);
    return { bottom: top + height };
  });
  assert(
    inlayBox.y >= boardBg.bottom - 2,
    'inlay dots should be outside the brown fretboard area',
  );

  const dotSize = await firstInlayDot.evaluate((el) => {
    const s = getComputedStyle(el);
    return parseFloat(s.width);
  });
  assert(dotSize > 0 && dotSize < 12, `inlay dot size: ${dotSize}px`);

  const openIntersection = page.locator('.fretboard__intersection--open').first();
  const openCap = openIntersection.locator('.interval-capsule');
  const openIntBox = await openIntersection.boundingBox();
  const openCapBox = await openCap.boundingBox();
  assert(!!openIntBox && !!openCapBox, 'open intersection missing');
  assert(
    Math.abs(
      openCapBox.x + openCapBox.width / 2 - (openIntBox.x + openIntBox.width / 2),
    ) < 5,
    'open capsule should be centered in nut column (between string name and 0 fret)',
  );

  const openLabelOverlap = await page.evaluate(() => {
    const opens = [...document.querySelectorAll('.fretboard__intersection--open')];
    const labels = [...document.querySelectorAll('.fretboard__string-label')];
    return opens.map((open, i) => {
      const cap = open.querySelector('.interval-capsule');
      const cr = cap.getBoundingClientRect();
      const lr = labels[i].getBoundingClientRect();
      return cr.left >= lr.right - 1;
    });
  });
  assert(
    openLabelOverlap.every(Boolean),
    `open capsules should not overlap string labels: ${openLabelOverlap}`,
  );

  const capsuleInlayAlignment = await page.evaluate(() => {
    const headNums = [...document.querySelectorAll(
      '.fretboard__head-cell--fret .fretboard__fret-num',
    )];
    const wireRight = (fretNum) => {
      const el = headNums.find((n) => n.textContent === String(fretNum));
      const cell = el?.closest('.fretboard__head-cell--fret');
      return cell ? cell.getBoundingClientRect().right : 0;
    };
    const markerCx = (fret) => {
      const marker = [...document.querySelectorAll('.fretboard__inlay-marker')].find(
        (m) => Number(m.style.gridColumn) === 2 + fret,
      );
      const r = marker?.getBoundingClientRect();
      return r ? r.left + r.width / 2 : 0;
    };
    const grid = document.querySelector('.fretboard__grid');
    const cells = [...grid.children].filter(
      (c) => !c.classList.contains('fretboard__inlays'),
    );
    const headerCount = 2 + 24;
    const capCxAtFret = (fret) => {
      const caps = [];
      for (let s = 0; s < 6; s++) {
        const idx = headerCount + s * 26 + 1 + fret;
        const cell = cells[idx];
        const cap = cell?.querySelector('.interval-capsule');
        const r = cap?.getBoundingClientRect();
        if (r) {
          caps.push(r.left + r.width / 2);
        }
      }
      return caps.length ? caps.reduce((a, b) => a + b, 0) / caps.length : 0;
    };
    const fret = 3;
    const cx = capCxAtFret(fret);
    const inlay = markerCx(fret);
    const w2 = wireRight(2);
    const w3 = wireRight(3);
    return { fret, cx, inlay, w2, w3, deltaInlay: Math.abs(cx - inlay) };
  });
  assert(
    capsuleInlayAlignment.cx > capsuleInlayAlignment.w2 &&
      capsuleInlayAlignment.cx < capsuleInlayAlignment.w3,
    `fret ${capsuleInlayAlignment.fret} capsule should be between fret wires`,
  );
  assert(
    capsuleInlayAlignment.deltaInlay < 4,
    `fret ${capsuleInlayAlignment.fret} capsule should align with inlay (${capsuleInlayAlignment.deltaInlay}px)`,
  );

  const fretNum = page.locator('.fretboard__head-cell--fret .fretboard__fret-num').first();
  const fretHeadCell = page.locator('.fretboard__head-cell--fret').first();
  const numBox = await fretNum.boundingBox();
  const headBox = await fretHeadCell.boundingBox();
  assert(!!numBox && !!headBox, 'fret number boxes missing');
  assert(
    Math.abs(numBox.x + numBox.width / 2 - (headBox.x + headBox.width)) < 5,
    'fret number should align with fret wire',
  );

  const scroll = page.locator('.fretboard__scroll');
  const overflowX = await scroll.evaluate((el) => getComputedStyle(el).overflowX);
  assert(overflowX === 'auto' || overflowX === 'scroll', `overflow-x: ${overflowX}`);

  const gridWidth = await page.locator('.fretboard__grid').evaluate((el) => el.scrollWidth);
  const scrollWidth = await scroll.evaluate((el) => el.clientWidth);
  assert(gridWidth > scrollWidth, 'horizontal scroll required');

  const intersectionPointerEvents = await page
    .locator('.fretboard__intersection')
    .first()
    .evaluate((el) => getComputedStyle(el).pointerEvents);
  assert(
    intersectionPointerEvents === 'none',
    `intersection should pass pointer events for scroll, got ${intersectionPointerEvents}`,
  );

  await scroll.evaluate((el) => {
    el.scrollLeft = 0;
  });
  const tapTarget = page.locator('button.fretboard__tap-target').first();
  const tapBox = await tapTarget.boundingBox();
  assert(!!tapBox, 'tap target box missing for scroll test');
  await page.mouse.move(tapBox.x + tapBox.width / 2, tapBox.y + tapBox.height / 2);
  await page.mouse.wheel(120, 0);
  await page.waitForTimeout(50);
  const scrollAfterWheelOnTarget = await scroll.evaluate((el) => el.scrollLeft);
  assert(
    scrollAfterWheelOnTarget > 0,
    `wheel over tap target should scroll fretboard (${scrollAfterWheelOnTarget})`,
  );

  await scroll.evaluate((el) => {
    el.scrollLeft = 0;
  });
  const gapScroll = await page.evaluate(() => {
    const intersection = document.querySelector('.fretboard__intersection');
    const scrollEl = document.querySelector('.fretboard__scroll');
    if (!intersection || !scrollEl) {
      return null;
    }
    scrollEl.scrollLeft = 0;
    const r = intersection.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 2, r.top + r.height / 2);
    scrollEl.dispatchEvent(
      new WheelEvent('wheel', { deltaX: 120, bubbles: true, cancelable: true }),
    );
    return {
      hitClass: hit?.className ?? '',
      scrollLeft: scrollEl.scrollLeft,
    };
  });
  assert(
    typeof gapScroll?.hitClass === 'string' &&
      !gapScroll.hitClass.includes('fretboard__intersection'),
    `gap in intersection should pass through for scroll, hit ${gapScroll?.hitClass}`,
  );
  assert(
    (gapScroll?.scrollLeft ?? 0) > 0,
    `wheel in intersection gap should scroll fretboard (${gapScroll?.scrollLeft})`,
  );

  await scroll.evaluate((el) => {
    el.scrollLeft = 0;
  });
  const dragBox = await tapTarget.boundingBox();
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x - 80, dragBox.y + dragBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  const scrollAfterDrag = await scroll.evaluate((el) => el.scrollLeft);
  assert(
    scrollAfterDrag > 0,
    `drag over tap target should scroll fretboard (${scrollAfterDrag})`,
  );

  await page
    .locator('.label-switcher .segment-switcher__btn')
    .filter({ hasText: /^音名$/ })
    .click();
  const noteNameCount = await page.locator('.interval-capsule', { hasText: 'C' }).count();
  assert(noteNameCount > 0, 'note mode should show pitch names like C');

  await page
    .locator('.label-switcher .segment-switcher__btn', { hasText: 'カナ' })
    .click();
  const kanaRoot = page.locator('.interval-capsule--scale-root').first();
  assert((await kanaRoot.textContent()) === 'ド', 'kana mode should show ド for C root');

  await page.locator('.label-switcher .segment-switcher__btn', { hasText: '●' }).click();
  const dotCapsule = page.locator('.interval-capsule--dot-circle').first();
  assert((await dotCapsule.count()) > 0, 'dot mode should show circle capsules');
  const dotShape = await dotCapsule.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      w: parseFloat(s.width),
      h: parseFloat(s.height),
      radius: s.borderRadius,
      text: el.textContent,
    };
  });
  assert(dotShape.text === '', 'dot capsule should have no center character');
  assert(Math.abs(dotShape.w - dotShape.h) < 1, 'dot capsule should be square');
  assert(
    dotShape.radius === '50%' || parseFloat(dotShape.radius) >= dotShape.w / 2 - 1,
    `dot capsule should be circular, radius=${dotShape.radius}`,
  );
  const mutedInDot = await page.locator('.interval-capsule--muted').count();
  assert(mutedInDot === 0, 'dot mode should hide muted capsules');

  await page.locator('.label-switcher .segment-switcher__btn', { hasText: 'インターバル' }).click();
  const intervalCapsule = page.locator('.interval-capsule--scale-root').first();
  assert((await intervalCapsule.textContent()) === 'R', 'interval mode should show R');

  await page.locator('.view-switcher .segment-switcher__btn', { hasText: '指板' }).click();
  const fretboardRootCount = await page.locator('.interval-capsule--scale-root').count();
  const fretboardScaleCount = await page.locator('.interval-capsule--scale').count();
  const fretboardChordCount = await page.locator('.interval-capsule--chord').count();
  const fretboardMutedCount = await page.locator('.interval-capsule--muted').count();
  assert(fretboardRootCount > 0, 'fretboard view should show root capsules');
  assert(fretboardScaleCount > 0, 'fretboard view should show white capsules for non-root');
  assert(fretboardChordCount === 0, 'fretboard view should not show chord capsules');
  assert(fretboardMutedCount === 0, 'fretboard view should not show muted capsules');

  await page.locator('.view-switcher .segment-switcher__btn', { hasText: 'スケール' }).click();
  const scaleCount = await page.locator('.interval-capsule--scale').count();
  const scaleRootCount = await page.locator('.interval-capsule--scale-root').count();
  assert(scaleCount > 0, 'scale view should show scale capsules');
  assert(scaleRootCount > 0, 'scale view should show scale root capsules');

  await page.locator('.view-switcher .segment-switcher__btn', { hasText: 'コード' }).click();
  const chordCount = await page.locator('.interval-capsule--chord').count();
  const chordRootCount = await page.locator('.interval-capsule--chord-root').count();
  assert(chordCount > 0, 'chord view should show chord capsules');
  assert(chordRootCount > 0, 'chord view should show chord root capsules');

  await page.locator('.view-switcher .segment-switcher__btn', { hasText: '複合' }).click();

  await scaleKeySelect.selectOption('E');
  assert((await scaleKeySelect.inputValue()) === 'E', 'scale key should update to E');
  const bottomOpenCap = page.locator('.fretboard__intersection--open').last().locator('.interval-capsule');
  assert((await bottomOpenCap.textContent()) === 'R', '6th string open should be R for scale root E');

  await chordKeySelect.selectOption('A');
  await page.locator('.view-switcher .segment-switcher__btn', { hasText: '複合' }).click();
  assert(
    (await page.locator('.interval-capsule--scale-root').count()) > 0,
    'composite view scale roots (E)',
  );
  assert(
    (await page.locator('.interval-capsule--chord-root').count()) > 0,
    'composite view chord roots (A)',
  );

  await page.locator('.view-switcher .segment-switcher__btn', { hasText: 'コード' }).click();
  const open6ChordInterval = await page
    .locator('.fretboard__intersection--open')
    .first()
    .locator('.interval-capsule')
    .textContent();
  assert(
    open6ChordInterval === '5',
    `chord view should show chord-root interval (E vs A = 5), got ${open6ChordInterval}`,
  );
  const chordRootCapsules = page.locator('.interval-capsule--chord-root');
  assert((await chordRootCapsules.count()) >= 6, 'chord root A should appear on multiple strings');
  const chordRootBg = await chordRootCapsules.first().evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  assert(
    chordRootBg === 'rgb(224, 123, 57)',
    `chord root should be orange, got ${chordRootBg}`,
  );

  await page.locator('.view-switcher .segment-switcher__btn', { hasText: '複合' }).click();
  const compositeChordRootBg = await page
    .locator('.interval-capsule--chord-root')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const compositeScaleRootBg = await page
    .locator('.interval-capsule--scale-root')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  assert(
    compositeScaleRootBg === 'rgb(184, 84, 80)',
    `composite scale root should be red, got ${compositeScaleRootBg}`,
  );
  assert(
    compositeChordRootBg === 'rgb(224, 123, 57)',
    `composite chord root should be orange, got ${compositeChordRootBg}`,
  );

  await page.locator('.app-header__mode .segment-switcher__btn[data-mode="library"]').click();
  const libraryPlay = page.locator('.playback-toolbar__play');
  assert((await libraryPlay.count()) >= 1, 'library form should show preview play buttons');

  const libraryList = page.locator('.library-view__list');
  await libraryList.evaluate((el) => {
    el.scrollTop = 120;
  });
  const libraryScrollBefore = await libraryList.evaluate((el) => el.scrollTop);
  assert(libraryScrollBefore >= 100, 'library list should scroll for scroll test');
  await page.locator('.library-view__list-btn').nth(4).click();
  await page.waitForTimeout(50);
  const libraryScrollAfter = await libraryList.evaluate((el) => el.scrollTop);
  assert(
    Math.abs(libraryScrollAfter - libraryScrollBefore) < 2,
    `library list scroll should persist on selection (${libraryScrollBefore} -> ${libraryScrollAfter})`,
  );

  await page.locator('.app-header__mode .segment-switcher__btn[data-mode="settings"]').click();
  assert((await page.locator('.settings-view').count()) === 1, 'settings view missing');
  assert(
    (await page.locator('.settings-instrument-list__radio').count()) === 7,
    'settings should list 7 instruments',
  );
  assert(
    (await page.locator('.settings-instrument-list__radio:checked').count()) === 1,
    'one instrument should be selected by default',
  );
  const changelogLink = page.locator('.settings-view__changelog-link');
  assert((await changelogLink.count()) === 1, 'settings changelog link missing');
  assert(
    (await changelogLink.textContent()) === 'リリースノート',
    'settings changelog link label',
  );
  assert(
    (await changelogLink.getAttribute('href'))?.endsWith('changelog.html'),
    'settings changelog link href',
  );

  await page.locator('.app-header__mode .segment-switcher__btn[data-mode="practice"]').click();

  await scaleSelect.selectOption('dorian');
  const tonePanel = page.locator('.tone-panel__tones').first();
  assert((await tonePanel.textContent())?.includes('Dorian') === false, 'panel shows tone labels not scale name');
  assert((await tonePanel.textContent())?.includes('R'), 'scale tones panel should list R');

  const diatonicSection = page.locator('.diatonic-chords');
  assert((await diatonicSection.count()) === 1, 'diatonic chords section missing');
  const diatonicCells = page.locator('.diatonic-chords__cell');
  assert((await diatonicCells.count()) === 7, 'dorian should show 7 diatonic chord cells');
  assert(
    (await page.locator('.diatonic-chords__cell--playable').count()) === 7,
    'each diatonic cell should be playable',
  );
  assert(
    (await page.locator('.diatonic-chords__btn--play').count()) === 7,
    'each diatonic cell should show a play icon',
  );
  assert(
    (await page.locator('.diatonic-chords__btn--repeat').count()) === 7,
    'each diatonic cell should have a repeat button',
  );
  assert(
    (await page.locator('.diatonic-chords__btn--repeat').first().textContent()) === '∞',
    'diatonic repeat button should show infinity icon',
  );
  assert(
    (await page.locator('.diatonic-chords__btn--apply').count()) === 7,
    'each diatonic cell should have an apply button',
  );
  assert(
    (await page.locator('.diatonic-chords__relative').first().textContent()) === 'Im7',
    'A dorian I degree should be Im7',
  );

  await page.locator('.diatonic-chords__btn--apply').nth(3).click();
  assert((await chordKeySelect.inputValue()) === 'A', 'diatonic cell should set chord key');
  assert((await chordSelect.inputValue()) === '7', 'diatonic cell should set chord type');
  assert(
    (await page.locator('.diatonic-chords__cell--active').count()) === 1,
    'one diatonic cell should be active',
  );

  return {
    scaleKeyId: await scaleKeySelect.inputValue(),
    chordKeyId: await chordKeySelect.inputValue(),
    scaleRootBg,
    gridWidth,
    scrollWidth,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.removeItem('guitar-practice-settings');
  });

  await page.goto(baseUrl, { waitUntil: 'load', timeout: 30000 });
  const desktop = await runChecks(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: 'load', timeout: 30000 });
  const mobileGrid = await page.locator('.fretboard__grid').evaluate((el) => el.scrollWidth);
  const mobileClient = await page.locator('.fretboard__scroll').evaluate((el) => el.clientWidth);
  assert(mobileGrid > mobileClient, 'mobile scroll required');

  const scaleKeyField = page.locator('#scale-key-select').locator('..');
  const scaleField = page.locator('#scale-select').locator('..');
  const scaleKeyBox = await scaleKeyField.boundingBox();
  const scaleBox = await scaleField.boundingBox();
  assert(!!scaleKeyBox && !!scaleBox, 'scale selector fields missing on mobile');
  assert(
    Math.abs(scaleKeyBox.y - scaleBox.y) < 8,
    'scale root and scale should share one row on narrow viewport',
  );

  const chordKeyField = page.locator('#chord-key-select').locator('..');
  const chordField = page.locator('#chord-select').locator('..');
  const chordKeyBox = await chordKeyField.boundingBox();
  const chordBox = await chordField.boundingBox();
  assert(!!chordKeyBox && !!chordBox, 'chord selector fields missing on mobile');
  assert(
    Math.abs(chordKeyBox.y - chordBox.y) < 8,
    'chord root and chord should share one row on narrow viewport',
  );

  await browser.close();

  if (errors.length > 0) {
    console.error('UI verification FAILED:');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log('UI verification PASSED');
  console.log(`  URL: ${baseUrl}`);
  console.log(`  Scale key: ${desktop.scaleKeyId}, Chord key: ${desktop.chordKeyId}`);
  console.log(`  Scale root capsule bg: ${desktop.scaleRootBg}`);
  console.log(`  Desktop scroll: ${desktop.gridWidth}px > ${desktop.scrollWidth}px`);
  console.log(`  Mobile scroll: ${mobileGrid}px > ${mobileClient}px`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
