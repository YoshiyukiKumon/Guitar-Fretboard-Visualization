import type { SongBlockDef, SongDef } from './song-types';

export const BUILTIN_SONG_BLOCKS: readonly SongBlockDef[] = [
  {
    id: "builtin-song-block-a",
    label: "A",
    measures: [
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "C",
            chordId: "major-triad",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "G",
            chordId: "major-triad",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "A",
            chordId: "m",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "G",
            chordId: "major-triad",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "F",
            chordId: "major-triad",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "C",
            chordId: "major-triad",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "F",
            chordId: "major-triad",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "G",
            chordId: "major-triad",
          },
        ],
      },
    ],
  },
  {
    id: "builtin-song-block-sabi",
    label: "サビ",
    measures: [
      {
        strumPatternId: "builtin-strum-syncopation",
        markers: {
          repeatStart: true,
        },
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "C",
            chordId: "major-triad",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "G",
            chordId: "major-triad",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "A",
            chordId: "m",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "G",
            chordId: "major-triad",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "F",
            chordId: "major-triad",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "C",
            chordId: "major-triad",
          },
          {
            offsetBeats: 2,
            chordRootKeyId: "A",
            chordId: "m",
          },
        ],
      },
      {
        markers: {
          firstEnding: true,
        },
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "F",
            chordId: "major-triad",
          },
        ],
      },
      {
        markers: {
          repeatEnd: true,
        },
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "G",
            chordId: "major-triad",
          },
        ],
      },
      {
        markers: {
          secondEnding: true,
        },
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "D",
            chordId: "m7",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "F",
            chordId: "major-triad",
          },
        ],
      },
    ],
  },
  {
    id: "builtin-song-block-b",
    label: "B",
    measures: [
      {
        strumPatternId: "builtin-strum-quarter",
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "A",
            chordId: "m",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "E",
            chordId: "m",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "F",
            chordId: "major-triad",
          },
        ],
      },
      {
        strumPatternId: "builtin-strum-eighth",
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "G",
            chordId: "major-triad",
          },
        ],
      },
    ],
  },
  {
    id: "builtin-song-block-blues-a",
    label: "A",
    measures: [
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "A",
            chordId: "7",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "D",
            chordId: "7",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "A",
            chordId: "7",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "A",
            chordId: "7",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "D",
            chordId: "7",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "D",
            chordId: "7",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "A",
            chordId: "7",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "A",
            chordId: "7",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "E",
            chordId: "7",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "D",
            chordId: "7",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "A",
            chordId: "7",
          },
        ],
      },
      {
        events: [
          {
            offsetBeats: 0,
            chordRootKeyId: "E",
            chordId: "7",
          },
        ],
      },
    ],
  },
];

export const BUILTIN_SONGS: readonly SongDef[] = [
  {
    id: "builtin-song-ii-v-i-repeat",
    name: "ii-V-I repeat",
    defaultKeyId: "C",
    defaultTimeSignature: "4/4",
    strumPatternId: "builtin-strum-quarter",
    playCount: 12,
    bpm: 100,
    parts: [
      {
        type: "inline",
        measures: [
          {
            events: [
              {
                offsetBeats: 0,
                chordRootKeyId: "D",
                chordId: "m7",
              },
            ],
          },
          {
            events: [
              {
                offsetBeats: 0,
                chordRootKeyId: "G",
                chordId: "7",
              },
            ],
          },
          {
            events: [
              {
                offsetBeats: 0,
                chordRootKeyId: "C",
                chordId: "maj7",
              },
            ],
          },
          {
            events: [
              {
                offsetBeats: 0,
                chordRootKeyId: "C",
                chordId: "maj7",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "builtin-song-sample-pop",
    name: "Sample POP",
    defaultKeyId: "C",
    defaultTimeSignature: "4/4",
    strumPatternId: "builtin-strum-syncopation",
    playCount: 1,
    bpm: 103,
    parts: [
      {
        type: "block",
        blockId: "builtin-song-block-a",
      },
      {
        type: "block",
        blockId: "builtin-song-block-a",
        reference: true,
      },
      {
        type: "block",
        blockId: "builtin-song-block-b",
      },
      {
        type: "block",
        blockId: "builtin-song-block-sabi",
      },
    ],
  },
  {
    id: "builtin-song-blues-a",
    name: "12 Bar Blues",
    defaultKeyId: "A",
    defaultTimeSignature: "12/8",
    strumPatternId: "builtin-strum-twelve-eight",
    playCount: 1,
    bpm: 150,
    parts: [
      {
        type: "block",
        blockId: "builtin-song-block-blues-a",
      },
    ],
  },
];

export function getBuiltinSongBlockById(id: string): SongBlockDef | undefined {
  return BUILTIN_SONG_BLOCKS.find((block) => block.id === id);
}

export function getBuiltinSongById(id: string): SongDef | undefined {
  return BUILTIN_SONGS.find((song) => song.id === id);
}
