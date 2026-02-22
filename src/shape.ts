/**
 * Recursively extract the shape (key names + types) of an object.
 * Arrays show the shape of the first element; values become type strings.
 */
export function extractShape(obj: unknown, depth: number = 0): unknown {
  if (depth > 5) return 'object';
  if (obj === null || obj === undefined) return null;

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return [extractShape(obj[0], depth + 1)];
  }

  if (typeof obj === 'object') {
    const shape: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      shape[key] = extractShape(value, depth + 1);
    }
    return shape;
  }

  return typeof obj;
}

/**
 * Count records in response data.
 * Returns array length or 1 for objects, null for primitives.
 */
export function countRecords(data: unknown): number | null {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results.length;
    if (Array.isArray(obj.data)) return obj.data.length;
    if (Array.isArray(obj.items)) return obj.items.length;
    return 1;
  }
  return null;
}
