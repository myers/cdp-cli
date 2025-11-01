/**
 * Chrome DevTools Protocol connection context
 * Manages connection to Chrome browser via CDP REST API and WebSocket
 */

import { WebSocket } from 'ws';
import { cdpFetch } from './fetch-wrapper.js';

export interface Page {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
  devtoolsFrontendUrl?: string;
  description?: string;
}

export interface CDPMessage {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

export interface ConsoleMessage {
  id: string;
  type: string;
  timestamp: number;
  text: string;
  source: string;
  line?: number;
  url?: string;
  args?: any[];
  stackTrace?: string;
}

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  status?: number;
  type?: string;
  size?: number;
  timestamp: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

/**
 * CDP Context manages connection to Chrome
 */
export class CDPContext {
  private cdpUrl: string;
  // CDP message ID counter (resets to 1 for each new context/command)
  private messageId = 1;

  // Collected data
  private consoleMessages: Map<string, ConsoleMessage> = new Map();
  private networkRequests: Map<string, NetworkRequest> = new Map();

  constructor(cdpUrl: string = 'http://localhost:9222') {
    this.cdpUrl = cdpUrl;
  }

  /**
   * Get list of all open pages
   */
  async getPages(): Promise<Page[]> {
    const response = await cdpFetch(`${this.cdpUrl}/json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch pages: ${response.statusText}`);
    }
    const pages = await response.json() as Page[];
    return pages.filter(p => p.type === 'page');
  }

  /**
   * Find a page by ID or title
   */
  async findPage(idOrTitle: string): Promise<Page> {
    const pages = await this.getPages();

    // Prefer exact ID match, which guarantees uniqueness.
    const byId = pages.find((page) => page.id === idOrTitle);
    if (byId) {
      return byId;
    }

    const titleMatches = pages.filter((page) =>
      page.title.includes(idOrTitle)
    );

    if (titleMatches.length === 0) {
      // Provide helpful error with available pages
      let errorMsg = `Page not found: '${idOrTitle}'.`;

      if (pages.length > 0) {
        // Show first 3 pages
        const displayPages = pages.slice(0, 3);
        const pageList = displayPages
          .map(p => `'${p.title}' (${p.id})`)
          .join(', ');
        errorMsg += ` Available: ${pageList}`;

        if (pages.length > 3) {
          errorMsg += `, and ${pages.length - 3} more`;
        }
        errorMsg += `.`;
      }

      errorMsg += ` Use 'cdp-cli tabs' for full list.`;

      throw new Error(errorMsg);
    }

    if (titleMatches.length > 1) {
      const summary = titleMatches
        .map((page) => `"${page.title}" (${page.id})`)
        .join(', ');
      throw new Error(
        `Multiple pages matched "${idOrTitle}". Use an exact page ID or refine the title. Matches: ${summary}`
      );
    }

    return titleMatches[0];
  }

  /**
   * Connect to a page via WebSocket
   */
  async connect(page: Page): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);

      ws.on('open', () => {
        resolve(ws);
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Send a CDP command and wait for response
   */
  async sendCommand(
    ws: WebSocket,
    method: string,
    params?: any
  ): Promise<any> {
    const id = this.messageId++;

    return new Promise((resolve, reject) => {
      const messageHandler = (data: Buffer) => {
        const message: CDPMessage = JSON.parse(data.toString());

        if (message.id === id) {
          clearTimeout(timeout);
          ws.off('message', messageHandler);

          if (message.error) {
            reject(new Error(message.error.message || 'CDP command failed'));
          } else {
            resolve(message.result);
          }
        }
      };

      const timeout = setTimeout(() => {
        ws.off('message', messageHandler);
        reject(new Error(`Command timeout: ${method}`));
      }, 30000);

      ws.on('message', messageHandler);

      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Setup console message collection
   */
  setupConsoleCollection(ws: WebSocket): void {
    ws.on('message', (data: Buffer) => {
      const message: CDPMessage = JSON.parse(data.toString());

      if (message.method === 'Runtime.consoleAPICalled') {
        const { type, args, timestamp } = message.params;

        // Generate initial text representation (will be enhanced by property fetching in listConsole)
        const text = args.map((arg: any) => {
          // Primitive values
          if (arg.value !== undefined) return String(arg.value);

          // Fallback to description for objects (will be replaced with actual properties later)
          if (arg.description !== undefined) return arg.description;
          return JSON.stringify(arg);
        }).join(' ');

        const consoleMsg: ConsoleMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          type,
          timestamp: timestamp || Date.now(),
          text,
          source: 'console-api',
          args
        };

        this.consoleMessages.set(consoleMsg.id, consoleMsg);
      }

      if (message.method === 'Runtime.exceptionThrown') {
        const { exceptionDetails, timestamp } = message.params;
        const exception = exceptionDetails.exception;
        const fullDescription = exception?.description || '';

        // First line is the error message, rest is stack trace
        const firstLine = fullDescription.split('\n')[0] || exceptionDetails.text;
        const shortText = `${exceptionDetails.text} ${firstLine}`.trim();

        const consoleMsg: ConsoleMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          type: 'error',
          timestamp: timestamp || Date.now(),
          text: shortText,
          source: 'exception',
          line: exceptionDetails.lineNumber,
          url: exceptionDetails.url,
          stackTrace: fullDescription || undefined
        };

        this.consoleMessages.set(consoleMsg.id, consoleMsg);
      }
    });
  }

  /**
   * Setup network request collection
   */
  setupNetworkCollection(ws: WebSocket): void {
    // Local map for assembling multi-event request data before final storage
    const requests = new Map<string, Partial<NetworkRequest>>();

    ws.on('message', (data: Buffer) => {
      const message: CDPMessage = JSON.parse(data.toString());

      if (message.method === 'Network.requestWillBeSent') {
        const { requestId, request, timestamp, type } = message.params;
        const existing = requests.get(requestId);

        if (existing) {
          // Update existing request (in case responseReceived arrived first)
          existing.url = request.url;
          existing.method = request.method;
          existing.timestamp = timestamp * 1000;
          existing.type = type;
          existing.requestHeaders = request.headers;
        } else {
          requests.set(requestId, {
            id: requestId,
            url: request.url,
            method: request.method,
            timestamp: timestamp * 1000,
            type: type,
            requestHeaders: request.headers
          });
        }
      }

      if (message.method === 'Network.responseReceived') {
        const { requestId, response } = message.params;
        let req = requests.get(requestId);

        // Handle race condition: responseReceived can arrive before requestWillBeSent
        if (!req) {
          req = {
            id: requestId,
            url: response.url || '',
            method: 'GET', // Default, will be updated if requestWillBeSent arrives
            timestamp: Date.now()
          };
          requests.set(requestId, req);
        }

        req.status = response.status;
        req.responseHeaders = response.headers;

        // Calculate size if available
        if (response.encodedDataLength !== undefined) {
          req.size = response.encodedDataLength;
        }

        this.networkRequests.set(requestId, req as NetworkRequest);
      }

      if (message.method === 'Network.loadingFinished') {
        const { requestId, encodedDataLength } = message.params;
        const req = this.networkRequests.get(requestId);
        if (req) {
          req.size = encodedDataLength;
        }
      }
    });
  }

  /**
   * Get all console messages collected in THIS context session only.
   * Note: Messages are NOT persisted across CLI commands.
   */
  getConsoleMessages(): ConsoleMessage[] {
    return Array.from(this.consoleMessages.values());
  }

  /**
   * Get all network requests collected in THIS context session only.
   * Note: Requests are NOT persisted across CLI commands.
   */
  getNetworkRequests(): NetworkRequest[] {
    return Array.from(this.networkRequests.values());
  }

  /**
   * Close a page
   */
  async closePage(page: Page): Promise<void> {
    const response = await cdpFetch(`${this.cdpUrl}/json/close/${page.id}`);
    if (!response.ok) {
      throw new Error(`Failed to close page: ${response.statusText}`);
    }
  }

  /**
   * Get browser WebSocket URL for Target domain commands
   */
  async getBrowserWebSocketUrl(): Promise<string> {
    const response = await cdpFetch(`${this.cdpUrl}/json/version`);
    if (!response.ok) {
      throw new Error(`Failed to get browser info: ${response.statusText}`);
    }
    const version = await response.json() as { webSocketDebuggerUrl?: string };
    if (!version.webSocketDebuggerUrl) {
      throw new Error('Browser WebSocket URL not available');
    }
    return version.webSocketDebuggerUrl;
  }

  /**
   * Create a new page using Target.createTarget (fallback method)
   */
  async createPageViaTarget(url?: string): Promise<Page> {
    const browserWsUrl = await this.getBrowserWebSocketUrl();

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(browserWsUrl);
      let messageId = 1;

      ws.on('open', () => {
        // Send Target.createTarget command
        ws.send(JSON.stringify({
          id: messageId,
          method: 'Target.createTarget',
          params: { url: url || 'about:blank' }
        }));
      });

      ws.on('message', async (data) => {
        const message = JSON.parse(data.toString());

        if (message.id === messageId) {
          ws.close();

          if (message.error) {
            reject(new Error(`Target.createTarget failed: ${message.error.message}`));
            return;
          }

          const targetId = message.result?.targetId;
          if (!targetId) {
            reject(new Error('Target.createTarget did not return targetId'));
            return;
          }

          // Fetch page list to get full page info
          try {
            const pages = await this.getPages();
            const page = pages.find(p => p.id === targetId);
            if (page) {
              resolve(page);
            } else {
              reject(new Error(`Created page ${targetId} not found in page list`));
            }
          } catch (error) {
            reject(error);
          }
        }
      });

      ws.on('error', (error) => {
        reject(new Error(`WebSocket error: ${error.message}`));
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        ws.close();
        reject(new Error('Target.createTarget timed out'));
      }, 10000);
    });
  }

  /**
   * Create a new page
   */
  async createPage(url?: string): Promise<Page> {
    const endpoint = url
      // Chrome expects the literal URL after '?', so use encodeURI to keep protocol delimiters while escaping spaces; fragments must still be escaped.
      ? `${this.cdpUrl}/json/new?${encodeURI(url).replace(/#/g, '%23')}`
      : `${this.cdpUrl}/json/new`;

    const response = await cdpFetch(endpoint, { method: 'PUT' });

    // If HTTP endpoint works, use it
    if (response.ok) {
      return await response.json() as Page;
    }

    // If Method Not Allowed, try Target.createTarget fallback
    if (response.status === 405) {
      return await this.createPageViaTarget(url);
    }

    throw new Error(`Failed to create page: ${response.statusText}`);
  }

}
