import { isBuiltinChordId, isBuiltinScaleId, isBuiltinStrumPatternId, isBuiltinSongBlockId, isBuiltinSongId } from './builtin-ids';
import { getChordById, getScaleById, getStrumPatternById } from './registry';
import { getSongBlockById, getSongById } from '../song/song-registry';

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  if (!slug || !ID_PATTERN.test(slug)) {
    return '';
  }
  return slug;
}

function nextUniqueId(
  prefix: string,
  base: string,
  exists: (id: string) => boolean,
): string {
  let id = `${prefix}-${base}`;
  if (!exists(id)) {
    return id;
  }
  let n = 2;
  while (exists(`${prefix}-${base}-${n}`)) {
    n++;
  }
  return `${prefix}-${base}-${n}`;
}

function scaleIdTaken(id: string): boolean {
  return getScaleById(id) !== undefined || isBuiltinScaleId(id);
}

function chordIdTaken(id: string): boolean {
  return getChordById(id) !== undefined || isBuiltinChordId(id);
}

function strumPatternIdTaken(id: string): boolean {
  return getStrumPatternById(id) !== undefined || isBuiltinStrumPatternId(id);
}

function songBlockIdTaken(id: string): boolean {
  return getSongBlockById(id) !== undefined || isBuiltinSongBlockId(id);
}

function songIdTaken(id: string): boolean {
  return getSongById(id) !== undefined || isBuiltinSongId(id);
}

/** 新規カスタムスケール用 ID（名前から生成、重複時は連番） */
export function generateCustomScaleId(name: string): string {
  const base = slugify(name) || `s${Date.now().toString(36)}`;
  return nextUniqueId('custom-scale', base, scaleIdTaken);
}

/** 新規カスタムコード用 ID（名前から生成、重複時は連番） */
export function generateCustomChordId(name: string): string {
  const base = slugify(name) || `c${Date.now().toString(36)}`;
  return nextUniqueId('custom-chord', base, chordIdTaken);
}

/** 新規カスタムストロークパターン用 ID（名前から生成、重複時は連番） */
export function generateCustomStrumPatternId(name: string): string {
  const base = slugify(name) || `p${Date.now().toString(36)}`;
  return nextUniqueId('custom-strum', base, strumPatternIdTaken);
}

export function generateCustomSongBlockId(label: string): string {
  const base = slugify(label) || `b${Date.now().toString(36)}`;
  return nextUniqueId('custom-song-block', base, songBlockIdTaken);
}

export function generateCustomSongId(name: string): string {
  const base = slugify(name) || `s${Date.now().toString(36)}`;
  return nextUniqueId('custom-song', base, songIdTaken);
}
