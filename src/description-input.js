// Keep all text, dropping only line breaks beyond the agreed limits.
export function limitDescriptionLines(value) {
  let result = '', breaks = 0, consecutive = 0;
  for (const character of value.replace(/\r\n?/g, '\n')) {
    if (character === '\n') {
      if (breaks >= 9 || consecutive >= 2) continue;
      breaks++; consecutive++;
    } else consecutive = 0;
    result += character;
  }
  return result;
}

export function handleDescriptionInput(event, update) {
  const input = event.currentTarget;
  const original = input.value;
  const limited = limitDescriptionLines(original);
  if (limited !== original) {
    const start = limitDescriptionLines(original.slice(0, input.selectionStart)).length;
    const end = limitDescriptionLines(original.slice(0, input.selectionEnd)).length;
    input.value = limited;
    input.setSelectionRange(start, end);
  }
  update(limited);
}
