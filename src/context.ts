/**
 * Chrome DevTools Protocol connection context
 * Manages connection to Chrome browser via CDP REST API and WebSocket
 */

import { WebSocket } from 'ws';

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
    const response = await fetch(`${this.cdpUrl}/json`);
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
    const page = pages.find(p =>
      p.id === idOrTitle || p.title.includes(idOrTitle)
    );

    if (!page) {
      throw new Error(`Page not found: ${idOrTitle}`);
    }

    return page;
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
        const text = args.map((arg: any) => {
          if (arg.value !== undefined) return String(arg.value);
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
        const consoleMsg: ConsoleMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          type: 'error',
          timestamp: timestamp || Date.now(),
          text: exceptionDetails.text,
          source: 'exception',
          line: exceptionDetails.lineNumber,
          url: exceptionDetails.url
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
    const response = await fetch(`${this.cdpUrl}/json/close/${page.id}`);
    if (!response.ok) {
      throw new Error(`Failed to close page: ${response.statusText}`);
    }
  }

  /**
   * Create a new page
   */
  async createPage(url?: string): Promise<Page> {
    const endpoint = url
      ? `${this.cdpUrl}/json/new?${encodeURIComponent(url)}`
      : `${this.cdpUrl}/json/new`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Failed to create page: ${response.statusText}`);
    }

    return await response.json() as Page;
  }

}
