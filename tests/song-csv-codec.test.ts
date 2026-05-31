import { describe, expect, it } from 'vitest';
import { BUILTIN_SONGS } from '../src/domain/song/builtin-songs';
import {
  decodeSongBlockPayload,
  decodeSongMeasure,
  decodeSongPayload,
  encodeSongBlockPayload,
  encodeSongMeasure,
  encodeSongPayload,
} from '../src/domain/song/song-csv-codec';

describe('song-csv-codec', () => {
  it('round-trips a measure with markers and events', () => {
    const raw = encodeSongMeasure({
      keyId: 'C',
      timeSignature: '4/4',
      strumPatternId: 'builtin-strum-eighth',
      markers: { repeatStart: true, firstEnding: true },
      events: [
        { offsetBeats: 0, chordRootKeyId: 'C', chordId: 'maj7' },
        { offsetBeats: 2, chordRootKeyId: 'A', chordId: 'm7' },
      ],
    });
    const decoded = decodeSongMeasure(raw);
    expect(decoded.keyId).toBe('C');
    expect(decoded.strumPatternId).toBe('builtin-strum-eighth');
    expect(decoded.markers?.repeatStart).toBe(true);
    expect(decoded.events).toHaveLength(2);
  });

  it('decodes legacy 4-field measure format', () => {
    const legacy = '_|4/4|repeatStart|0/C/maj7';
    const decoded = decodeSongMeasure(legacy);
    expect(decoded.timeSignature).toBe('4/4');
    expect(decoded.strumPatternId).toBeUndefined();
    expect(decoded.markers?.repeatStart).toBe(true);
    expect(decoded.events[0]?.chordId).toBe('maj7');
  });

  it('round-trips song payload', () => {
    const song = BUILTIN_SONGS[0];
    const payload = encodeSongPayload(song);
    const decoded = decodeSongPayload(payload);
    expect(decoded.defaultKeyId).toBe(song.defaultKeyId);
    expect(decoded.parts.length).toBe(song.parts.length);
  });

  it('round-trips block measures payload', () => {
    const measures = [
      { events: [{ offsetBeats: 0, chordRootKeyId: 'C', chordId: 'major-triad' }] },
      { events: [{ offsetBeats: 0, chordRootKeyId: 'G', chordId: '7' }] },
    ];
    const payload = encodeSongBlockPayload({ id: 'b', label: 'A', measures });
    expect(decodeSongBlockPayload(payload)).toHaveLength(2);
  });
});
