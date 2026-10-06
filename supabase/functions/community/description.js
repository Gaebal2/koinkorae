export const lineLimitMessage = '최대 10줄, 연속 엔터 2회까지 입력할 수 있습니다.';
export function validDescription(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.replace(/\r\n?/g, '\n');
  return normalized.split('\n').length <= 10 && !/\n{3}/.test(normalized);
}
export function assertDescription(value) { if (!validDescription(value)) throw Error(lineLimitMessage); return value; }
