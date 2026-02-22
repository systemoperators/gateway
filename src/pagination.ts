import type { PaginationStrategy } from './types.js';

/** Notion-style cursor pagination: start_cursor param, next_cursor in response */
export function notionCursor<T>(opts?: {
  pageSize?: number;
  itemsKey?: string;
}): PaginationStrategy<T> {
  const pageSize = opts?.pageSize ?? 100;
  const itemsKey = opts?.itemsKey ?? 'results';

  return {
    getParams(cursor) {
      const params: Record<string, string> = { page_size: String(pageSize) };
      if (cursor) params.start_cursor = cursor;
      return params;
    },
    getItems(response) {
      const obj = response as Record<string, unknown>;
      return (obj[itemsKey] as T[]) ?? [];
    },
    getNextCursor(response) {
      const obj = response as Record<string, unknown>;
      if (!obj.has_more) return null;
      return (obj.next_cursor as string) ?? null;
    },
  };
}

/** Relay-style cursor pagination for GraphQL (Linear, GitHub, etc.) */
export function relayCursor<T>(opts?: {
  pageSize?: number;
}): PaginationStrategy<T> {
  const pageSize = opts?.pageSize ?? 50;

  return {
    getParams(cursor) {
      const params: Record<string, string> = { first: String(pageSize) };
      if (cursor) params.after = cursor;
      return params;
    },
    getItems(response) {
      const obj = response as Record<string, unknown>;
      const nodes = (obj as { nodes?: T[] }).nodes;
      if (nodes) return nodes;
      const edges = (obj as { edges?: { node: T }[] }).edges;
      if (edges) return edges.map((e) => e.node);
      return [];
    },
    getNextCursor(response) {
      const obj = response as { pageInfo?: { hasNextPage?: boolean; endCursor?: string } };
      if (!obj.pageInfo?.hasNextPage) return null;
      return obj.pageInfo.endCursor ?? null;
    },
  };
}

/** Page token pagination (Gmail, Google APIs): nextPageToken in response */
export function pageTokenCursor<T>(opts?: {
  pageSize?: number;
  tokenKey?: string;
  itemsKey?: string;
}): PaginationStrategy<T> {
  const pageSize = opts?.pageSize ?? 100;
  const tokenKey = opts?.tokenKey ?? 'nextPageToken';
  const itemsKey = opts?.itemsKey ?? 'items';

  return {
    getParams(cursor) {
      const params: Record<string, string> = { maxResults: String(pageSize) };
      if (cursor) params.pageToken = cursor;
      return params;
    },
    getItems(response) {
      const obj = response as Record<string, unknown>;
      return (obj[itemsKey] as T[]) ?? [];
    },
    getNextCursor(response) {
      const obj = response as Record<string, unknown>;
      return (obj[tokenKey] as string) ?? null;
    },
  };
}

/** Offset-based pagination: offset + limit params */
export function offsetCursor<T>(opts?: {
  pageSize?: number;
  itemsKey?: string;
}): PaginationStrategy<T> {
  const pageSize = opts?.pageSize ?? 100;
  const itemsKey = opts?.itemsKey ?? 'items';
  let currentOffset = 0;

  return {
    getParams(cursor) {
      currentOffset = cursor ? parseInt(cursor, 10) : 0;
      return { offset: String(currentOffset), limit: String(pageSize) };
    },
    getItems(response) {
      const obj = response as Record<string, unknown>;
      if (Array.isArray(obj)) return obj as T[];
      return (obj[itemsKey] as T[]) ?? [];
    },
    getNextCursor(response) {
      const obj = response as Record<string, unknown>;
      const items = Array.isArray(obj) ? obj : (obj[itemsKey] as unknown[]) ?? [];
      if (items.length < pageSize) return null;
      return String(currentOffset + items.length);
    },
  };
}

export const paginators = {
  notion: notionCursor,
  relay: relayCursor,
  pageToken: pageTokenCursor,
  offset: offsetCursor,
} as const;
