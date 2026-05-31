import { isBuiltinStrumPatternId } from '../music-library/builtin-ids';
import {
  parseStrumPatternDef,
  parseTimeSignature,
  type StrumPatternDef,
} from './strum-pattern';

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  id?: string;
}

function validateId(id: string): string[] {
  const errors: string[] = [];
  if (!id.trim()) {
    errors.push('ID を入力してください');
    return errors;
  }
  if (!ID_PATTERN.test(id)) {
    errors.push(
      'ID は英小文字で始まり、英小文字・数字・ハイフンのみ使用できます',
    );
  }
  if (isBuiltinStrumPatternId(id)) {
    errors.push('組み込みストロークパターンと同じ ID は使えません');
  }
  return errors;
}

export function validateStrumPatternDef(
  def: Pick<StrumPatternDef, 'id' | 'name' | 'notation' | 'timeSignature'>,
): ValidationResult {
  const errors: string[] = [];
  errors.push(...validateId(def.id));
  if (!def.name.trim()) {
    errors.push('名前を入力してください');
  }
  if (!def.timeSignature?.trim()) {
    errors.push('拍子を入力してください');
  } else if (parseTimeSignature(def.timeSignature) === null) {
    errors.push('拍子は 4/4 や 3/4 の形式で指定してください');
  }
  if (!def.notation.trim()) {
    errors.push('パターンを入力してください');
  } else if (parseStrumPatternDef(def) === null) {
    errors.push(
      'パターン形式が不正です。拍子に合う長さになるよう、4・8・16、8-8 のタイ、4(>) のアクセント、8(r) の休符をカンマ区切りで指定してください',
    );
  }
  return { ok: errors.length === 0, errors };
}
