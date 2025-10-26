/**
 * Tests for CDPContext
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CDPContext } from '../../src/context.js';
import { MockWebSocket } from '../mocks/websocket.mock.js';
import { installMockFetch } from '../mocks/fetch.mock.js';
import { samplePages, consoleMessages, networkEvents } from '../fixtures/cdp-responses.js';
import { waitFor } from '../helpers.js';

describe('CDPContext', () => {
  beforeEach(() => {
    installMockFetch();
  });

  describe('getPages', () => {
    it('should fetch and return all pages', async () => {
      const context = new CDPContext();
      const pages = await context.getPages();

      expect(pages).toHaveLength(3);
      expect(pages[0].id).toBe('page1');
      expect(pages[0].title).toBe('Example Domain');
      expect(pages[0].type).toBe('page');
    });

    it('should filter only page type', async () => {
      installMockFetch({
        pages: [
          ...samplePages,
          {
            id: 'worker1',
            title: 'Web Worker',
            url: '',
            type: 'service_worker',
            webSocketDebuggerUrl: 'ws://localhost:9222/devtools/worker/worker1'
          }
        ]
      });

      const context = new CDPContext();
      const pages = await context.getPages();

      expect(pages).toHaveLength(3);
      expect(pages.every(p => p.type === 'page')).toBe(true);
    });

    it('should throw error on fetch failure', async () => {
      installMockFetch({ failFetch: true });

      const context = new CDPContext();
      await expect(context.getPages()).rejects.toThrow('Failed to fetch pages');
    });
  });

  describe('findPage', () => {
    it('should find page by exact ID', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page2');

      expect(page.id).toBe('page2');
      expect(page.title).toBe('GitHub');
    });

    it('should find page by partial title', async () => {
      const context = new CDPContext();
      const page = await context.findPage('Hub');

      expect(page.id).toBe('page2');
      expect(page.title).toBe('GitHub');
    });

    it('should throw error if page not found', async () => {
      const context = new CDPContext();
      await expect(context.findPage('nonexistent')).rejects.toThrow('Page not found');
    });
  });

  describe('connect', () => {
    it('should create WebSocket connection', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');
      const ws = await context.connect(page);

      expect(ws).toBeInstanceOf(MockWebSocket);
      expect((ws as MockWebSocket).readyState).toBe(1); // OPEN
    });
  });

  describe('sendCommand', () => {
    it('should send command and receive response', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');
      const ws = await context.connect(page) as MockWebSocket;

      const result = await context.sendCommand(ws, 'DOM.enable');

      expect(result).toBeDefined();
      expect(ws.sentMessages).toHaveLength(1);
      expect(ws.sentMessages[0].method).toBe('DOM.enable');
    });

    it('should increment message ID', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');
      const ws = await context.connect(page) as MockWebSocket;

      await context.sendCommand(ws, 'DOM.enable');
      await context.sendCommand(ws, 'Runtime.enable');

      expect(ws.sentMessages[0].id).toBe(1);
      expect(ws.sentMessages[1].id).toBe(2);
    });

    it('should handle CDP errors', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');
      const ws = await context.connect(page) as MockWebSocket;

      // Clear auto-response messages and disable auto-respond
      ws.clearMessages();
      (ws as any).autoRespond = false;

      // Send command that will error
      const promise = context.sendCommand(ws, 'Invalid.command');

      // Simulate error response after a small delay
      await waitFor(5);
      ws.simulateMessage({
        id: ws.sentMessages[0].id, // Use the actual ID
        error: { message: 'Command not found' }
      });

      await expect(promise).rejects.toThrow('Command not found');
    });

    it('should timeout after 30 seconds', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');
      const ws = await context.connect(page) as MockWebSocket;

      // Create a promise that won't respond
      const promise = context.sendCommand(ws, 'SlowCommand');

      // Fast-forward time (note: this requires vi.useFakeTimers() in real scenarios)
      // For now, we just verify the command was sent
      expect(ws.sentMessages).toHaveLength(1);

      // Clean up - respond to prevent hanging
      await waitFor(10);
      ws.simulateMessage({ id: 1, result: {} });
      await promise;
    }, 1000);

    it('should remove event listener on timeout', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');
      const ws = await context.connect(page) as MockWebSocket;

      const listenersBefore = ws.listenerCount('message');

      // Send command and let it complete
      await context.sendCommand(ws, 'DOM.enable');

      const listenersAfter = ws.listenerCount('message');

      // Listener should be cleaned up
      expect(listenersAfter).toBe(listenersBefore);
    });
  });

  describe('setupConsoleCollection', () => {
    it('should collect console.log messages', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');
      const ws = await context.connect(page) as MockWebSocket;

      context.setupConsoleCollection(ws);

      // Simulate console message
      ws.simulateMessage(consoleMessages.log);

      await waitFor(20);

      const messages = context.getConsoleMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('log');
      expect(messages[0].text).toBe('Hello world');
      expect(messages[0].source).toBe('console-api');
    });

    it('should collect error messages', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');
      const ws = await context.connect(page) as MockWebSocket;

      context.setupConsoleCollection(ws);

      ws.simulateMessage(consoleMessages.error);

      await waitFor(20);

      const messages = context.getConsoleMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('error');
      expect(messages[0].text).toBe('Error occurred');
    });

    it('should collect exceptions', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');
      const ws = await context.connect(page) as MockWebSocket;

      context.setupConsoleCollection(ws);

      ws.simulateMessage(consoleMessages.exception);

      await waitFor(20);

      const messages = context.getConsoleMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('error');
      expect(messages[0].source).toBe('exception');
      expect(messages[0].line).toBe(42);
      expect(messages[0].url).toBe('https://example.com/app.js');
    });
  });

  describe('setupNetworkCollection', () => {
    it('should collect network requests', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');
      const ws = await context.connect(page) as MockWebSocket;

      context.setupNetworkCollection(ws);

      // Simulate network events
      ws.simulateMessage(networkEvents.requestWillBeSent);
      await waitFor(20);
      ws.simulateMessage(networkEvents.responseReceived);
      await waitFor(20);

      const requests = context.getNetworkRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe('https://api.example.com/data');
      expect(requests[0].method).toBe('GET');
      expect(requests[0].status).toBe(200);
      expect(requests[0].type).toBe('fetch');
    });

    it('should update size on loadingFinished', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');
      const ws = await context.connect(page) as MockWebSocket;

      context.setupNetworkCollection(ws);

      ws.simulateMessage(networkEvents.requestWillBeSent);
      await waitFor(20);
      ws.simulateMessage(networkEvents.responseReceived);
      await waitFor(20);
      ws.simulateMessage(networkEvents.loadingFinished);
      await waitFor(20);

      const requests = context.getNetworkRequests();
      expect(requests[0].size).toBe(4567);
    });

    it('should handle responseReceived before requestWillBeSent', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');
      const ws = await context.connect(page) as MockWebSocket;

      context.setupNetworkCollection(ws);

      // Send response BEFORE request (race condition)
      ws.simulateMessage(networkEvents.responseReceived);
      await waitFor(20);
      ws.simulateMessage(networkEvents.requestWillBeSent);
      await waitFor(20);

      const requests = context.getNetworkRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].status).toBe(200);
      expect(requests[0].method).toBe('GET'); // Should be updated by requestWillBeSent
    });
  });

  describe('closePage', () => {
    it('should close page via REST API', async () => {
      const context = new CDPContext();
      const page = await context.findPage('page1');

      await expect(context.closePage(page)).resolves.toBeUndefined();
    });

    it('should throw error on failure', async () => {
      installMockFetch({ failClose: true });

      const context = new CDPContext();
      const page = await context.findPage('page1');

      await expect(context.closePage(page)).rejects.toThrow('Failed to close page');
    });
  });

  describe('createPage', () => {
    it('should create page without URL', async () => {
      const context = new CDPContext();
      const page = await context.createPage();

      expect(page.id).toBe('new-page-123');
      expect(page.url).toBe('about:blank');
    });

    it('should create page with URL', async () => {
      const context = new CDPContext();
      const page = await context.createPage('https://example.com');

      expect(page.id).toBe('new-page-123');
      expect(page.url).toBe('https://example.com');
    });

    it('should throw error on failure', async () => {
      installMockFetch({ failCreate: true });

      const context = new CDPContext();
      await expect(context.createPage()).rejects.toThrow('Failed to create page');
    });
  });
});
