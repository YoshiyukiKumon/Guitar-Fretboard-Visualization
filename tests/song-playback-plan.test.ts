import { describe, expect, it } from 'vitest';
import { BUILTIN_SONG_BLOCKS, BUILTIN_SONGS } from '../src/domain/song/builtin-songs';
import { expandSongMeasures } from '../src/domain/song/expand-song-measures';
import {
  buildSongScheduleHits,
  songCycleDurationSec,
} from '../src/domain/song/song-playback-plan';
import {
  parseStrumPatternDef,
  parseStrumPatternNotation,
  BUILTIN_STRUM_PATTERNS,
} from '../src/domain/strum-pattern/strum-pattern';
import { beatDurationSec } from '../src/domain/playback-bpm';

describe('buildSongScheduleHits', () => {
  const song = BUILTIN_SONGS[0];
  const measures = expandSongMeasures(song, BUILTIN_SONG_BLOCKS);
  const beatSec = beatDurationSec(120);

  it('places eighth-note hits without gaps across measure boundaries', () => {
    const eighthId = 'builtin-strum-eighth';
    const eighth = BUILTIN_STRUM_PATTERNS.find((p) => p.id === eighthId)!;
    const parsed = parseStrumPatternDef(eighth)!;
    const testMeasures = measures.slice(0, 2).map((measure) => ({
      ...measure,
      effectiveStrumPatternId: eighthId,
    }));
    const hits = buildSongScheduleHits(testMeasures, eighthId, beatSec);

    const measure0Last = hits.filter((h) => h.measurePlaybackIndex === 0).at(-1);
    const measure1First = hits.find((h) => h.measurePlaybackIndex === 1);
    expect(measure0Last?.hitOffsetBeats).toBe(3.5);
    expect(measure1First?.hitOffsetBeats).toBe(0);
    expect(measure1First!.timeSec - measure0Last!.timeSec).toBeCloseTo(
      beatSec * 0.5,
      6,
    );
    expect(hits.every((h) => typeof h.accent === 'boolean')).toBe(true);
    expect(parsed.hits.length).toBeGreaterThan(0);
  });

  it('includes every strum hit for syncopation within a 4/4 bar', () => {
    const syncId = 'builtin-strum-syncopation';
    const sync = BUILTIN_STRUM_PATTERNS.find((p) => p.id === syncId)!;
    const parsed = parseStrumPatternDef(sync)!;
    const testMeasures = measures.slice(0, 1).map((measure) => ({
      ...measure,
      effectiveStrumPatternId: syncId,
    }));
    const hits = buildSongScheduleHits(testMeasures, syncId, beatSec);

    expect(hits.map((h) => h.hitOffsetBeats)).toEqual(
      parsed.hits.map((h) => h.offsetBeats),
    );
  });

  it('switches strum pattern at measure boundary', () => {
    const eighthId = 'builtin-strum-eighth';
    const quarterId = 'builtin-strum-quarter';
    const testMeasures = [
      {
        ...measures[0],
        effectiveStrumPatternId: eighthId,
      },
      {
        ...measures[1],
        effectiveStrumPatternId: quarterId,
      },
    ];
    const hits = buildSongScheduleHits(testMeasures, song.strumPatternId, beatSec);
    const m0Hits = hits.filter((h) => h.measurePlaybackIndex === 0);
    const m1Hits = hits.filter((h) => h.measurePlaybackIndex === 1);

    expect(m0Hits.length).toBe(8);
    expect(m1Hits.map((h) => h.hitOffsetBeats)).toEqual([0, 1, 2, 3]);
  });

  it('applies chord changes from tie group start when eighth ties into 8-8', () => {
    const parsed = parseStrumPatternNotation('4, 8, 8-8, 8, 4', '4/4')!;
    const measure = {
      ...measures[0],
      effectiveStrumPatternId: 'custom',
      events: [
        { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
        { offsetBeats: 1, chordRootKeyId: 'A', chordId: 'm' },
      ],
    };
    const hits = buildSongScheduleHits(
      [measure],
      'custom',
      beatSec,
      () => parsed,
    );
    const hitAt1 = hits.find((h) => h.hitOffsetBeats === 1);
    const hitAt15 = hits.find((h) => h.hitOffsetBeats === 1.5);

    expect(hitAt1?.chordRootKeyId).toBe('C');
    expect(hitAt1?.chordId).toBe('major-triad');
    expect(hitAt15?.chordRootKeyId).toBe('A');
    expect(hitAt15?.chordId).toBe('m');
  });

  it('applies beat-3 chord from tie group start on 8-8', () => {
    const parsed = parseStrumPatternNotation('4, 8, 8-8, 8, 4', '4/4')!;
    const measure = {
      ...measures[0],
      effectiveStrumPatternId: 'custom',
      events: [
        { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
        { offsetBeats: 2, chordRootKeyId: 'A', chordId: 'm' },
      ],
    };
    const hits = buildSongScheduleHits(
      [measure],
      'custom',
      beatSec,
      () => parsed,
    );
    const hitAt15 = hits.find((h) => h.hitOffsetBeats === 1.5);
    const hitAt25 = hits.find((h) => h.hitOffsetBeats === 2.5);
    const hitAt3 = hits.find((h) => h.hitOffsetBeats === 3);

    expect(hitAt15?.chordRootKeyId).toBe('A');
    expect(hitAt25?.chordRootKeyId).toBe('A');
    expect(hitAt3?.chordRootKeyId).toBe('A');
  });

  it('applies beat-3 chord from accented 8(>)-8 tie group start', () => {
    const parsed = parseStrumPatternNotation('4(>), 8, 8(>)-8, 8, 4', '4/4')!;
    const measure = {
      ...measures[0],
      effectiveStrumPatternId: 'custom',
      events: [
        { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' },
        { offsetBeats: 2, chordRootKeyId: 'A', chordId: 'm' },
      ],
    };
    const hits = buildSongScheduleHits(
      [measure],
      'custom',
      beatSec,
      () => parsed,
    );
    expect(hits.find((h) => h.hitOffsetBeats === 1.5)?.chordRootKeyId).toBe(
      'A',
    );
  });

  it('cycle duration matches sum of measure lengths', () => {
    const quarterId = 'builtin-strum-quarter';
    const testMeasures = measures.map((measure) => ({
      ...measure,
      effectiveStrumPatternId: quarterId,
    }));
    const hits = buildSongScheduleHits(testMeasures, quarterId, beatSec);
    const duration = songCycleDurationSec(measures, beatSec);
    const lastHit = hits.at(-1)!;

    expect(duration).toBeCloseTo(measures.length * 4 * beatSec, 6);
    expect(lastHit.timeSec).toBeLessThan(duration);
  });
});

/** スケジューラの fromTime 更新を模倣し、ヒットが取りこぼされないことを検証 */
describe('song scheduler window simulation', () => {
  it('does not skip hits when fromTime uses noteTime + hitDuration', () => {
    const eighthId = 'builtin-strum-eighth';
    const eighth = parseStrumPatternDef(
      BUILTIN_STRUM_PATTERNS.find((p) => p.id === eighthId)!,
    )!;
    const beatSec = beatDurationSec(120);
    const hitDuration = Math.min(1.5, beatSec * 0.95);
    const measures = expandSongMeasures(BUILTIN_SONGS[0], BUILTIN_SONG_BLOCKS);
    const testMeasure = {
      ...measures[0],
      effectiveStrumPatternId: eighthId,
    };
    const allHits = buildSongScheduleHits([testMeasure], eighthId, beatSec);
    const aheadSec = 1.5;

    function simulate(useHitDurationInCursor: boolean): number[] {
      const scheduled: number[] = [];
      let fromTime = 0;
      const epoch = 0;
      const toTimeLimit = 4 * beatSec;

      while (fromTime < toTimeLimit) {
        const toTime = fromTime + aheadSec;
        let scheduledUntil = fromTime;

        for (const hit of allHits) {
          const noteTime = epoch + hit.timeSec;
          if (noteTime < fromTime) {
            continue;
          }
          if (noteTime >= toTime) {
            break;
          }
          scheduled.push(hit.hitOffsetBeats);
          scheduledUntil = Math.max(
            scheduledUntil,
            useHitDurationInCursor
              ? noteTime + hitDuration
              : noteTime + 1e-9,
          );
        }

        if (scheduledUntil <= fromTime + 1e-6) {
          break;
        }
        fromTime = scheduledUntil;
      }

      return scheduled;
    }

    const withBug = simulate(true);
    const fixed = simulate(false);

    expect(withBug).not.toEqual(eighth.hits.map((h) => h.offsetBeats));
    expect(fixed).toEqual(eighth.hits.map((h) => h.offsetBeats));
  });
});
