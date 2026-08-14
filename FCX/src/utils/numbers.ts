export function padNumber(
  value: number | string,
  width: number,
  fill = "0",
): string {
  const text = String(value);
  return text.length >= width
    ? text
    : new Array(width - text.length + 1).join(fill) + text;
}

export function convertAbbreviatedNumber(value: string): number {
  const base = Number.parseFloat(value);
  if (/k/i.test(value)) return Math.round(base * 1_000);
  if (/m/i.test(value)) return Math.round(base * 1_000_000);
  return base;
}
