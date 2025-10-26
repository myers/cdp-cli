/**
 * Tests for network inspection commands
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as network from '../../../src/commands/network.js';
import { CDPContext } from '../../../src/context.js';
import { installMockFetch } from '../../mocks/fetch.mock.js';
import { MockWebSocket } from '../../mocks/websocket.mock.js';
import { captureConsoleOutput, mockProcessExit, simulateCDPEvents } from '../../helpers.js';
import { networkEvents } from '../../fixtures/cdp-responses.js';

describe('Network Commands', () => {
  beforeEach(() => {
    installMockFetch();
  });

  describe('listNetwork', () => {
    it('should collect and output network requests', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      // We need to simulate network events during collection
      const originalConnect = context.connect.bind(context);
      context.connect = async (page) => {
        const ws = await originalConnect(page) as MockWebSocket;

        // Simulate network events during the duration
        setTimeout(() => {
          ws.simulateMessage(networkEvents.requestWillBeSent);
          setTimeout(() => {
            ws.simulateMessage(networkEvents.responseReceived);
            setTimeout(() => {
              ws.simulateMessage(networkEvents.loadingFinished);
            }, 10);
          }, 10);
        }, 10);

        return ws;
      };

      await network.listNetwork(context, { page: 'page1', duration: 0.1 });

      const logs = capture.getLogs();
      capture.restore();

      expect(logs).toHaveLength(1);
      const request = JSON.parse(logs[0]);

      expect(request.url).toBe('https://api.example.com/data');
      expect(request.method).toBe('GET');
      expect(request.status).toBe(200);
      expect(request.type).toBe('fetch');
      expect(request.size).toBe(4567);
      expect(request.timestamp).toBeDefined();
    });

    it('should filter requests by type', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      const originalConnect = context.connect.bind(context);
      context.connect = async (page) => {
        const ws = await originalConnect(page) as MockWebSocket;

        // Simulate multiple request types
        setTimeout(() => {
          // Fetch request
          ws.simulateMessage(networkEvents.requestWillBeSent);
          ws.simulateMessage(networkEvents.responseReceived);

          // XHR request
          ws.simulateMessage({
            method: 'Network.requestWillBeSent',
            params: {
              requestId: 'req2',
              request: {
                url: 'https://api.example.com/xhr',
                method: 'POST',
                headers: {}
              },
              timestamp: 1698234568.0,
              type: 'xhr'
            }
          });
          ws.simulateMessage({
            method: 'Network.responseReceived',
            params: {
              requestId: 'req2',
              response: {
                url: 'https://api.example.com/xhr',
                status: 201,
                headers: {}
              }
            }
          });
        }, 10);

        return ws;
      };

      // Filter for fetch only
      await network.listNetwork(context, { page: 'page1', duration: 0.1, type: 'fetch' });

      const logs = capture.getLogs();
      capture.restore();

      expect(logs).toHaveLength(1);
      const request = JSON.parse(logs[0]);
      expect(request.type).toBe('fetch');
    });

    it('should respect duration parameter', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      const start = Date.now();
      await network.listNetwork(context, { page: 'page1', duration: 0.15 });
      const elapsed = Date.now() - start;

      // Should have waited at least 150ms (with some tolerance)
      expect(elapsed).toBeGreaterThanOrEqual(140);

      capture.restore();
    });

    it('should handle page not found error', async () => {
      const capture = captureConsoleOutput();
      const exitMock = mockProcessExit();
      const context = new CDPContext();

      try {
        await network.listNetwork(context, { page: 'nonexistent', duration: 0.1 });
      } catch (e) {
        // Expected process.exit
      }

      expect(exitMock.exitCode).toBe(1);
      const error = JSON.parse(capture.getLogs()[0]);
      expect(error.error).toBe(true);
      expect(error.code).toBe('LIST_NETWORK_FAILED');

      capture.restore();
      exitMock.restore();
    });

    it('should close WebSocket via try-finally', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      let wsClosed = false;
      const originalConnect = context.connect.bind(context);
      context.connect = async (page) => {
        const ws = await originalConnect(page) as MockWebSocket;
        const originalClose = ws.close.bind(ws);
        ws.close = () => {
          wsClosed = true;
          originalClose();
        };
        return ws;
      };

      await network.listNetwork(context, { page: 'page1', duration: 0.05 });

      expect(wsClosed).toBe(true);
      capture.restore();
    });
  });
});
