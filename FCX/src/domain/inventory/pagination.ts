export function appendUniqueInventoryItems<T extends Record<string, unknown>>(
  current: readonly T[],
  page: readonly T[],
): T[] {
  const result = [...current];
  const known = new Set(
    current
      .map((item) => Number(item.id ?? item.itemId ?? item._id))
      .filter((id) => Number.isFinite(id) && id > 0),
  );
  for (const item of page) {
    const id = Number(item.id ?? item.itemId ?? item._id);
    if (Number.isFinite(id) && id > 0) {
      if (known.has(id)) continue;
      known.add(id);
    }
    result.push(item);
  }
  return result;
}
