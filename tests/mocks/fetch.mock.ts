/**
 * Mock fetch for testing CDP REST API calls
 */

import { samplePages } from '../fixtures/cdp-responses.js';

export class MockFetchResponse {
  constructor(
    private data: any,
    private status: number = 200,
    private statusText: string = 'OK'
  ) {}

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  async json(): Promise<any> {
    return this.data;
  }
}

/**
 * Mock fetch implementation for CDP REST API
 */
export function createMockFetch(options?: {
  pages?: any[];
  failFetch?: boolean;
  failCreate?: boolean;
  failClose?: boolean;
}): typeof fetch {
  const pages = options?.pages || samplePages;

  return async (url: string | URL | Request): Promise<Response> => {
    const urlString = typeof url === 'string' ? url : url.toString();

    // Simulate fetch failure
    if (options?.failFetch) {
      return new MockFetchResponse(null, 500, 'Internal Server Error') as any;
    }

    // GET /json - list pages
    if (urlString.endsWith('/json')) {
      return new MockFetchResponse(pages) as any;
    }

    // GET /json/new - create new page
    if (urlString.includes('/json/new')) {
      if (options?.failCreate) {
        return new MockFetchResponse(null, 500, 'Failed to create page') as any;
      }

      const urlParam = urlString.split('?')[1];
      const newPage = {
        id: 'new-page-123',
        title: 'New Tab',
        url: urlParam ? decodeURIComponent(urlParam) : 'about:blank',
        type: 'page',
        webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/new-page-123'
      };
      return new MockFetchResponse(newPage) as any;
    }

    // GET /json/close/:id - close page
    if (urlString.includes('/json/close/')) {
      if (options?.failClose) {
        return new MockFetchResponse(null, 500, 'Failed to close page') as any;
      }
      return new MockFetchResponse({ result: 'success' }) as any;
    }

    // Unknown endpoint
    return new MockFetchResponse(null, 404, 'Not Found') as any;
  };
}

/**
 * Install mock fetch globally
 */
export function installMockFetch(options?: Parameters<typeof createMockFetch>[0]): void {
  global.fetch = createMockFetch(options) as any;
}

/**
 * Restore original fetch
 */
export function restoreFetch(): void {
  // Note: In vitest, mocks are automatically restored between tests
  // This is here for manual cleanup if needed
  delete (global as any).fetch;
}
