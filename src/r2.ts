import type { ResponseStore } from './types.js';

// minimal R2 interface - compatible with Cloudflare R2Bucket
export interface R2BucketLike {
  put(
    key: string,
    value: string | ReadableStream | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
}

/**
 * Create a ResponseStore backed by an R2 bucket.
 * Stores responses at: {gateway}/{year}/{month}/{day}/{reqId}.json
 */
export function createR2ResponseStore(bucket: R2BucketLike): ResponseStore {
  return {
    async store(gatewayName: string, reqId: string, data: unknown): Promise<string | undefined> {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const key = `${gatewayName}/${year}/${month}/${day}/${reqId}.json`;

      await bucket.put(key, JSON.stringify(data), {
        httpMetadata: { contentType: 'application/json' },
      });

      return key;
    },
  };
}
