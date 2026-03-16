/**
 * Wrapper around fetch with better error messages for CDP connections
 */

import { fetch as undiciFetch } from 'undici';

/**
 * Fetch with helpful error messages for connection failures
 */
export async function cdpFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await (globalThis.fetch ?? undiciFetch)(url, init);
  } catch (error: any) {
    // Handle connection errors (ECONNREFUSED, ECONNRESET, etc)
    if (error.cause?.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNRESET') {
      const cdpUrl = new URL(url);
      const port = cdpUrl.port || '9222';
      const baseUrl = `${cdpUrl.protocol}//${cdpUrl.hostname}:${port}`;

      throw new Error(
        `Cannot connect to Chrome at ${baseUrl}. ` +
        `Is Chrome running with remote debugging? ` +
        `Try: cdp-cli launch --port ${port}`
      );
    }

    // Re-throw other errors as-is
    throw error;
  }
}
