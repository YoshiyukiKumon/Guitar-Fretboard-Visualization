import { describe, expect, it, beforeEach } from 'vitest';
import {
  exportLibraryCsv,
  parseLibraryCsv,
} from '../src/domain/music-library/csv';
import {
  resetLibraryToInitial,
  upsertCustomScale,
} from '../src/domain/music-library/custom-crud';
import { upsertCustomSongBlock } from '../src/domain/music-library/song-crud';
import { getScaleById, listScales } from '../src/domain/music-library/registry';
import { resetCustomLibrary } from '../src/domain/music-library/storage';
import { generateCustomScaleId } from '../src/domain/music-library/generate-id';
import { getToneLabelOptions } from '../src/domain/music-library/tone-label-options';
import {
  parseTonesInput,
  validateScaleDef,
} from '../src/domain/music-library/validate';

beforeEach(() => {
  resetCustomLibrary();
});

describe('custom scale library', () => {
  it('auto-generates id when id is empty', () => {
    const result = upsertCustomScale({
      id: '',
      name: 'My Auto Scale',
      tones: ['R', '3', '5'],
    });
    expect(result.ok).toBe(true);
    expect(result.id).toMatch(/^custom-scale-my-auto-scale/);
    expect(getScaleById(result.id!)).toBeDefined();
  });

  it('saves and lists custom scale', () => {
    const result = upsertCustomScale({
      id: 'my-test-scale',
      name: 'My Test',
      tones: ['R', '2 / 9', '3', '5', '6 / 13'],
    });
    expect(result.ok).toBe(true);
    const found = getScaleById('my-test-scale');
    expect(found?.name).toBe('My Test');
    expect(listScales().some((s) => s.source === 'custom')).toBe(true);
  });

  it('rejects builtin id for custom scale', () => {
    const result = upsertCustomScale({
      id: 'major',
      name: 'Fake Major',
      tones: ['R', '3', '5'],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid tone label', () => {
    const result = validateScaleDef({
      id: 'bad-tones',
      name: 'Bad',
      tones: ['R', 'not-a-tone'],
    });
    expect(result.ok).toBe(false);
  });
});

describe('library CSV', () => {
  it('round-trips custom scale via parse', () => {
    upsertCustomScale({
      id: 'csv-scale',
      name: 'CSV Scale',
      tones: ['R', 'm3 / #9', '5'],
    });
    const csv = exportLibraryCsv();
    expect(csv).toContain('csv-scale');
    resetLibraryToInitial();
    const preview = parseLibraryCsv(csv);
    expect(preview.errors).toEqual([]);
    expect(preview.scales.some((s) => s.id === 'csv-scale')).toBe(true);
  });

  it('rejects duplicate id in csv', () => {
    const csv = `type,id,name,tones
scale,a,Scale A,R|3|5
scale,a,Scale B,R|3|5`;
    const preview = parseLibraryCsv(csv);
    expect(preview.errors.length).toBeGreaterThan(0);
  });

  it('accepts legacy header without payload column', () => {
    const csv = `type,id,name,tones
scale,csv-scale,CSV Scale,R|3|5`;
    const preview = parseLibraryCsv(csv);
    expect(preview.errors).toEqual([]);
    expect(preview.scales).toHaveLength(1);
  });

  it('exports and imports custom song block', () => {
    upsertCustomSongBlock({
      id: 'csv-block',
      label: 'CSV Block',
      measures: [
        { events: [{ offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' }] },
      ],
    });
    const csv = exportLibraryCsv();
    expect(csv).toContain('song-block,csv-block');
    resetLibraryToInitial();
    const preview = parseLibraryCsv(csv);
    expect(preview.errors).toEqual([]);
    expect(preview.songBlocks.some((b) => b.id === 'csv-block')).toBe(true);
  });
});

describe('tone label options', () => {
  it('includes master labels used in chords', () => {
    const options = getToneLabelOptions();
    expect(options).toContain('R');
    expect(options).toContain('m3 / #9');
    expect(options).toContain('b9');
  });
});

describe('generateCustomScaleId', () => {
  it('creates slug from ascii name', () => {
    expect(generateCustomScaleId('Hello World')).toBe(
      'custom-scale-hello-world',
    );
  });
});

describe('parseTonesInput', () => {
  it('splits lines and trims', () => {
    expect(parseTonesInput('R\n 3 \n b7 ')).toEqual(['R', '3', 'b7']);
  });
});
