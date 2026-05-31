import { describe, expect, it } from 'vitest';
import {
  parseStrumPatternNotation,
  parseStrumPatternDef,
  parseTimeSignature,
  measureQuarterBeats,
  BUILTIN_STRUM_PATTERNS,
  strumHitGain,
  STRUM_ACCENT_GAIN,
  STRUM_NORMAL_GAIN,
} from '../src/domain/strum-pattern/strum-pattern';
import { validateStrumPatternDef } from '../src/domain/strum-pattern/validate';

describe('parseTimeSignature', () => {
  it('parses common time signatures', () => {
    expect(parseTimeSignature('4/4')?.label).toBe('4/4');
    expect(parseTimeSignature('3/4')?.label).toBe('3/4');
    expect(parseTimeSignature('12/8')?.label).toBe('12/8');
  });

  it('rejects invalid time signatures', () => {
    expect(parseTimeSignature('')).toBeNull();
    expect(parseTimeSignature('4-4')).toBeNull();
    expect(parseTimeSignature('4/3')).toBeNull();
  });

  it('computes quarter-note measure length', () => {
    expect(measureQuarterBeats(parseTimeSignature('4/4')!)).toBe(4);
    expect(measureQuarterBeats(parseTimeSignature('3/4')!)).toBe(3);
    expect(measureQuarterBeats(parseTimeSignature('12/8')!)).toBe(6);
  });
});

describe('parseStrumPatternNotation', () => {
  it('parses quarter note pattern with accents', () => {
    const parsed = parseStrumPatternNotation('4, 4(>), 4, 4(>)', '4/4');
    expect(parsed?.hits.map((hit) => hit.offsetBeats)).toEqual([0, 1, 2, 3]);
    expect(parsed?.hits.map((hit) => hit.accent)).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it('parses eighth note pattern with accents', () => {
    const parsed = parseStrumPatternNotation(
      '8, 8, 8(>), 8, 8, 8, 8(>), 8',
      '4/4',
    );
    expect(parsed?.hits.map((hit) => hit.offsetBeats)).toEqual([
      0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5,
    ]);
  });

  it('parses syncopation with tie and accent', () => {
    const parsed = parseStrumPatternNotation('4(>), 8, 8(>)-8, 8, 4', '4/4');
    expect(parsed?.hits.map((hit) => hit.offsetBeats)).toEqual([
      0, 1, 1.5, 2.5, 3,
    ]);
    expect(parsed?.hits[1]?.chordLookupBeats).toBeCloseTo(0.9999, 4);
    expect(parsed?.hits[2]?.chordLookupBeats).toBe(1.5);
  });

  it('defers chord lookup on eighth tied into 8-8 group', () => {
    const parsed = parseStrumPatternNotation('4, 8, 8-8, 8, 4', '4/4');
    expect(parsed?.hits.map((hit) => hit.offsetBeats)).toEqual([
      0, 1, 1.5, 2.5, 3,
    ]);
    expect(parsed?.hits[1]?.chordLookupBeats).toBeCloseTo(0.9999, 4);
    expect(parsed?.hits[2]?.chordLookupBeats).toBe(1.5);
    expect(parsed?.hits[2]?.tieGroupEndBeats).toBe(2.5);
  });

  it('marks tie group end for accented 8(>)-8 token', () => {
    const parsed = parseStrumPatternNotation('4(>), 8, 8(>)-8, 8, 4', '4/4');
    expect(parsed?.hits[2]?.offsetBeats).toBe(1.5);
    expect(parsed?.hits[2]?.tieGroupEndBeats).toBe(2.5);
    expect(parsed?.hits[2]?.accent).toBe(true);
  });

  it('parses 3/4 pattern', () => {
    const parsed = parseStrumPatternNotation('4(>), 4, 4', '3/4');
    expect(parsed?.measureBeats).toBe(3);
    expect(parsed?.hits.map((hit) => hit.offsetBeats)).toEqual([0, 1, 2]);
    expect(parsed?.hits.map((hit) => hit.accent)).toEqual([true, false, false]);
  });

  it('parses 12/8 pattern with rests', () => {
    const parsed = parseStrumPatternNotation(
      '8, 8(r), 8, 8(>), 8(r), 8, 8, 8(r), 8, 8(>), 8(r), 8',
      '12/8',
    );
    expect(parsed?.measureBeats).toBe(6);
    expect(parsed?.hits.map((hit) => hit.offsetBeats)).toEqual([
      0, 1, 1.5, 2.5, 3, 4, 4.5, 5.5,
    ]);
    expect(parsed?.hits.map((hit) => hit.accent)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      true,
      false,
    ]);
  });

  it('parses explicit rest length with note value', () => {
    const parsed = parseStrumPatternNotation('4, 4(r), 4, 4', '4/4');
    expect(parsed?.hits.map((hit) => hit.offsetBeats)).toEqual([0, 2, 3]);
  });

  it('rejects legacy bare r rest token', () => {
    expect(parseStrumPatternNotation('4, r, 4, 4', '4/4')).toBeNull();
  });

  it('rejects pattern that does not fill one measure', () => {
    expect(parseStrumPatternNotation('4, 4, 4', '4/4')).toBeNull();
    expect(parseStrumPatternNotation('4, 4, 4, 4, 4', '4/4')).toBeNull();
    expect(parseStrumPatternNotation('4(>), 4, 4', '4/4')).toBeNull();
  });

  it('rejects mixed note values in tie', () => {
    expect(parseStrumPatternNotation('4-8, 4, 4', '4/4')).toBeNull();
  });
});

describe('strumHitGain', () => {
  it('uses full gain for accent and reduced gain otherwise', () => {
    expect(strumHitGain(true)).toBe(STRUM_ACCENT_GAIN);
    expect(strumHitGain(false)).toBe(STRUM_NORMAL_GAIN);
    expect(STRUM_NORMAL_GAIN).toBeLessThan(STRUM_ACCENT_GAIN);
  });
});

describe('builtin strum patterns', () => {
  it('all builtins parse successfully', () => {
    for (const pattern of BUILTIN_STRUM_PATTERNS) {
      const parsed = parseStrumPatternDef(pattern);
      expect(parsed?.measureBeats).toBeGreaterThan(0);
      expect(parsed?.hits.length).toBeGreaterThan(0);
      expect(parsed?.timeSignature).toBe(pattern.timeSignature);
    }
  });

  it('builtin quarter notes accent beats 2 and 4', () => {
    const quarter = BUILTIN_STRUM_PATTERNS.find(
      (pattern) => pattern.id === 'builtin-strum-quarter',
    );
    const parsed = parseStrumPatternDef(quarter!);
    expect(parsed?.hits.map((hit) => hit.accent)).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });
});

describe('validateStrumPatternDef', () => {
  it('accepts valid custom pattern with accent and time signature', () => {
    const result = validateStrumPatternDef({
      id: 'custom-strum-test',
      name: 'Test',
      timeSignature: '3/4',
      notation: '4(>), 4, 4',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects builtin id', () => {
    const result = validateStrumPatternDef({
      id: 'builtin-strum-quarter',
      name: 'Fake',
      timeSignature: '4/4',
      notation: '4, 4, 4, 4',
    });
    expect(result.ok).toBe(false);
  });
});
