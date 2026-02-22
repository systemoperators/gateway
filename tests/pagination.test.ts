import { describe, it, expect } from '@jest/globals';
import { notionCursor, relayCursor, pageTokenCursor, offsetCursor } from '../src/pagination';

describe('notionCursor', () => {
  const strategy = notionCursor<{ id: string }>();

  it('returns page_size param on first call', () => {
    const params = strategy.getParams(null);
    expect(params).toEqual({ page_size: '100' });
  });

  it('includes start_cursor when cursor provided', () => {
    const params = strategy.getParams('abc-123');
    expect(params).toEqual({ page_size: '100', start_cursor: 'abc-123' });
  });

  it('extracts items from results key', () => {
    const items = strategy.getItems({ results: [{ id: '1' }, { id: '2' }] });
    expect(items).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('returns next cursor when has_more is true', () => {
    const cursor = strategy.getNextCursor({ has_more: true, next_cursor: 'xyz' });
    expect(cursor).toBe('xyz');
  });

  it('returns null when has_more is false', () => {
    const cursor = strategy.getNextCursor({ has_more: false, next_cursor: null });
    expect(cursor).toBeNull();
  });

  it('supports custom itemsKey', () => {
    const custom = notionCursor<{ id: string }>({ itemsKey: 'data' });
    const items = custom.getItems({ data: [{ id: '1' }] });
    expect(items).toEqual([{ id: '1' }]);
  });
});

describe('relayCursor', () => {
  const strategy = relayCursor<{ id: string }>();

  it('returns first param on initial call', () => {
    const params = strategy.getParams(null);
    expect(params).toEqual({ first: '50' });
  });

  it('includes after when cursor provided', () => {
    const params = strategy.getParams('cursor-abc');
    expect(params).toEqual({ first: '50', after: 'cursor-abc' });
  });

  it('extracts items from nodes', () => {
    const items = strategy.getItems({ nodes: [{ id: '1' }] });
    expect(items).toEqual([{ id: '1' }]);
  });

  it('extracts items from edges', () => {
    const items = strategy.getItems({ edges: [{ node: { id: '1' } }] });
    expect(items).toEqual([{ id: '1' }]);
  });

  it('returns next cursor from pageInfo', () => {
    const cursor = strategy.getNextCursor({
      pageInfo: { hasNextPage: true, endCursor: 'end-1' },
    });
    expect(cursor).toBe('end-1');
  });

  it('returns null when no more pages', () => {
    const cursor = strategy.getNextCursor({
      pageInfo: { hasNextPage: false },
    });
    expect(cursor).toBeNull();
  });
});

describe('pageTokenCursor', () => {
  const strategy = pageTokenCursor<{ id: string }>();

  it('returns maxResults param', () => {
    const params = strategy.getParams(null);
    expect(params).toEqual({ maxResults: '100' });
  });

  it('includes pageToken when cursor provided', () => {
    const params = strategy.getParams('token-xyz');
    expect(params).toEqual({ maxResults: '100', pageToken: 'token-xyz' });
  });

  it('extracts items', () => {
    const items = strategy.getItems({ items: [{ id: '1' }] });
    expect(items).toEqual([{ id: '1' }]);
  });

  it('returns next page token', () => {
    const cursor = strategy.getNextCursor({ nextPageToken: 'next-1' });
    expect(cursor).toBe('next-1');
  });

  it('returns null when no token', () => {
    const cursor = strategy.getNextCursor({ items: [] });
    expect(cursor).toBeNull();
  });
});

describe('offsetCursor', () => {
  const strategy = offsetCursor<{ id: string }>({ pageSize: 2 });

  it('starts at offset 0', () => {
    const params = strategy.getParams(null);
    expect(params).toEqual({ offset: '0', limit: '2' });
  });

  it('uses cursor as offset', () => {
    const params = strategy.getParams('4');
    expect(params).toEqual({ offset: '4', limit: '2' });
  });

  it('returns next offset when full page', () => {
    strategy.getParams('0'); // set currentOffset to 0
    const cursor = strategy.getNextCursor({ items: [{ id: '1' }, { id: '2' }] });
    expect(cursor).toBe('2');
  });

  it('returns null when partial page', () => {
    strategy.getParams('4'); // set currentOffset to 4
    const cursor = strategy.getNextCursor({ items: [{ id: '5' }] });
    expect(cursor).toBeNull();
  });
});
