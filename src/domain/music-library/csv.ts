import type { ChordDef } from '../data/chords';
import type { ScaleDef } from '../data/scales';
import type { SongBlockDef, SongDef } from '../song/song-types';
import {
  decodeSongBlockPayload,
  decodeSongPayload,
  encodeSongBlockPayload,
  encodeSongPayload,
} from '../song/song-csv-codec';
import {
  isBuiltinChordId,
  isBuiltinScaleId,
  isBuiltinSongBlockId,
  isBuiltinSongId,
} from './builtin-ids';
import {
  getAllSongBlocks,
  listSongBlocks,
  listSongs,
} from '../song/song-registry';
import { listChords, listScales } from './registry';
import { validateSongBlockDef, validateSongDef } from '../song/validate-song';
import { loadCustomLibrary, type CustomMusicLibrary } from './storage';
import { validateChordDef, validateScaleDef } from './validate';

const HEADER_LEGACY = 'type,id,name,tones';
const HEADER = 'type,id,name,tones,payload';

export interface CsvImportPreview {
  scales: ScaleDef[];
  chords: ChordDef[];
  songBlocks: SongBlockDef[];
  songs: SongDef[];
  hasSongBlocks: boolean;
  hasSongs: boolean;
  errors: string[];
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const TONE_SEP = '|';

function encodeTones(tones: readonly string[]): string {
  return tones.join(TONE_SEP);
}

function decodeTones(raw: string): string[] {
  return raw
    .split(TONE_SEP)
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  fields.push(current.trim());
  return fields;
}

function normalizeHeader(headerLine: string): {
  ok: boolean;
  hasPayload: boolean;
  error?: string;
} {
  const header = headerLine.trim().toLowerCase();
  if (header === HEADER) {
    return { ok: true, hasPayload: true };
  }
  if (header === HEADER_LEGACY) {
    return { ok: true, hasPayload: false };
  }
  return {
    ok: false,
    hasPayload: false,
    error: `1 行目は "${HEADER}" または "${HEADER_LEGACY}" である必要があります`,
  };
}

function rowField(row: string[], index: number): string {
  return row[index]?.trim() ?? '';
}

export function exportLibraryCsv(): string {
  const lines = [HEADER];
  for (const { def } of listScales()) {
    lines.push(
      ['scale', def.id, def.name, encodeTones(def.tones), '']
        .map(escapeCsvField)
        .join(','),
    );
  }
  for (const { def } of listChords()) {
    lines.push(
      ['chord', def.id, def.name, encodeTones(def.tones), '']
        .map(escapeCsvField)
        .join(','),
    );
  }
  const sortedBlocks = [...listSongBlocks()].sort((a, b) =>
    a.def.id.localeCompare(b.def.id),
  );
  for (const { def } of sortedBlocks) {
    lines.push(
      ['song-block', def.id, def.label, '', encodeSongBlockPayload(def)]
        .map(escapeCsvField)
        .join(','),
    );
  }
  const sortedSongs = [...listSongs()].sort((a, b) =>
    a.def.id.localeCompare(b.def.id),
  );
  for (const { def } of sortedSongs) {
    lines.push(
      ['song', def.id, def.name, '', encodeSongPayload(def)]
        .map(escapeCsvField)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

export function parseLibraryCsv(text: string): CsvImportPreview {
  const scales: ScaleDef[] = [];
  const chords: ChordDef[] = [];
  const songBlocks: SongBlockDef[] = [];
  const songs: SongDef[] = [];
  const errors: string[] = [];
  let hasSongBlocks = false;
  let hasSongs = false;

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return {
      scales,
      chords,
      songBlocks,
      songs,
      hasSongBlocks,
      hasSongs,
      errors: ['CSV が空です'],
    };
  }

  const headerCheck = normalizeHeader(lines[0]);
  if (!headerCheck.ok) {
    return {
      scales,
      chords,
      songBlocks,
      songs,
      hasSongBlocks,
      hasSongs,
      errors: [headerCheck.error ?? 'invalid header'],
    };
  }

  const seenIds = new Set<string>();
  const pendingSongs: { line: number; id: string; name: string; payload: string }[] =
    [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length < 4) {
      errors.push(`${i + 1} 行目: 列が不足しています`);
      continue;
    }

    const type = rowField(row, 0);
    const id = rowField(row, 1);
    const name = rowField(row, 2);
    const tonesRaw = rowField(row, 3);
    const payload = headerCheck.hasPayload ? rowField(row, 4) : '';

    if (type === 'scale') {
      if (isBuiltinScaleId(id)) {
        continue;
      }
      if (seenIds.has(id)) {
        errors.push(`${i + 1} 行目: 重複 ID (${id})`);
        continue;
      }
      const def = { id, name, tones: decodeTones(tonesRaw) };
      const result = validateScaleDef(def);
      if (!result.ok) {
        errors.push(`${i + 1} 行目: ${result.errors.join(' / ')}`);
        continue;
      }
      seenIds.add(id);
      scales.push(def);
      continue;
    }

    if (type === 'chord') {
      if (isBuiltinChordId(id)) {
        continue;
      }
      if (seenIds.has(id)) {
        errors.push(`${i + 1} 行目: 重複 ID (${id})`);
        continue;
      }
      const def = { id, name, tones: decodeTones(tonesRaw) };
      const result = validateChordDef(def);
      if (!result.ok) {
        errors.push(`${i + 1} 行目: ${result.errors.join(' / ')}`);
        continue;
      }
      seenIds.add(id);
      chords.push(def);
      continue;
    }

    if (type === 'song-block') {
      hasSongBlocks = true;
      if (isBuiltinSongBlockId(id)) {
        continue;
      }
      if (seenIds.has(id)) {
        errors.push(`${i + 1} 行目: 重複 ID (${id})`);
        continue;
      }
      if (!payload) {
        errors.push(`${i + 1} 行目: song-block の payload が空です`);
        continue;
      }
      const def: SongBlockDef = {
        id,
        label: name,
        measures: decodeSongBlockPayload(payload),
      };
      const result = validateSongBlockDef(def);
      if (!result.ok) {
        errors.push(`${i + 1} 行目: ${result.errors.join(' / ')}`);
        continue;
      }
      seenIds.add(id);
      songBlocks.push(def);
      continue;
    }

    if (type === 'song') {
      hasSongs = true;
      if (isBuiltinSongId(id)) {
        continue;
      }
      if (seenIds.has(id)) {
        errors.push(`${i + 1} 行目: 重複 ID (${id})`);
        continue;
      }
      if (!payload) {
        errors.push(`${i + 1} 行目: song の payload が空です`);
        continue;
      }
      seenIds.add(id);
      pendingSongs.push({ line: i + 1, id, name, payload });
      continue;
    }

    errors.push(`${i + 1} 行目: 不明な type (${type})`);
  }

  const blocksForSongValidation = [
    ...getAllSongBlocks().filter(
      (block) => !songBlocks.some((custom) => custom.id === block.id),
    ),
    ...songBlocks,
  ];

  for (const pending of pendingSongs) {
    const def: SongDef = {
      id: pending.id,
      name: pending.name,
      ...decodeSongPayload(pending.payload),
    };
    const result = validateSongDef(def, blocksForSongValidation);
    if (!result.ok) {
      errors.push(`${pending.line} 行目: ${result.errors.join(' / ')}`);
      continue;
    }
    songs.push(def);
  }

  return { scales, chords, songBlocks, songs, hasSongBlocks, hasSongs, errors };
}

export function applyCustomLibraryImport(
  preview: CsvImportPreview,
): CustomMusicLibrary {
  const existing = loadCustomLibrary();
  return {
    scales: preview.scales,
    chords: preview.chords,
    strumPatterns: existing.strumPatterns,
    songBlocks: preview.hasSongBlocks ? preview.songBlocks : existing.songBlocks,
    songs: preview.hasSongs ? preview.songs : existing.songs,
  };
}

export function customLibraryFromStorage(): CustomMusicLibrary {
  return loadCustomLibrary();
}
