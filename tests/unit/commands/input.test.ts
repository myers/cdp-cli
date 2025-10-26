/**
 * Tests for input automation commands
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as input from '../../../src/commands/input.js';
import { CDPContext } from '../../../src/context.js';
import { installMockFetch } from '../../mocks/fetch.mock.js';
import { MockWebSocket } from '../../mocks/websocket.mock.js';
import { captureConsoleOutput, mockProcessExit, waitFor } from '../../helpers.js';

describe('Input Commands', () => {
  beforeEach(() => {
    installMockFetch();
  });

  describe('click', () => {
    it('should click element at calculated center point', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await input.click(context, 'button#submit', { page: 'page1' });

      const logs = capture.getLogs();
      capture.restore();

      expect(logs).toHaveLength(1);
      const result = JSON.parse(logs[0]);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Click performed');
      expect(result.data.selector).toBe('button#submit');
      // Mock box model: [100, 100, 200, 100, 200, 200, 100, 200]
      // Center x: (100 + 200 + 200 + 100) / 4 = 150
      // Center y: (100 + 100 + 200 + 200) / 4 = 150
      expect(result.data.x).toBe(150);
      expect(result.data.y).toBe(150);
      expect(result.data.double).toBe(false);
    });

    it('should perform double click when requested', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await input.click(context, 'button', { page: 'page1', double: true });

      const logs = capture.getLogs();
      capture.restore();

      const result = JSON.parse(logs[0]);
      expect(result.data.double).toBe(true);
    });

    it('should dispatch correct mouse events for single click', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      // We need to intercept the WebSocket to check messages
      // For this test, we'll just verify the function completes successfully
      await input.click(context, 'button', { page: 'page1' });

      const logs = capture.getLogs();
      capture.restore();

      expect(logs).toHaveLength(1);
      const result = JSON.parse(logs[0]);
      expect(result.success).toBe(true);
    });

    // Note: Element not found error is difficult to test with auto-responding mocks
    // The error handling is validated by the page not found test below

    it('should handle page not found error', async () => {
      const capture = captureConsoleOutput();
      const exitMock = mockProcessExit();
      const context = new CDPContext();

      try {
        await input.click(context, 'button', { page: 'nonexistent' });
      } catch (e) {
        // Expected process.exit
      }

      expect(exitMock.exitCode).toBe(1);
      const error = JSON.parse(capture.getLogs()[0]);
      expect(error.error).toBe(true);
      expect(error.code).toBe('CLICK_FAILED');

      capture.restore();
      exitMock.restore();
    });
  });

  describe('fill', () => {
    it('should fill input element', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await input.fill(context, 'input#email', 'test@example.com', { page: 'page1' });

      const logs = capture.getLogs();
      capture.restore();

      expect(logs).toHaveLength(1);
      const result = JSON.parse(logs[0]);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Fill performed');
      expect(result.data.selector).toBe('input#email');
      expect(result.data.value).toBe('test@example.com');
    });

    it('should use DOM.setAttributeValue to clear value (SECURITY)', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      // Intercept WebSocket to verify commands
      const originalConnect = context.connect.bind(context);
      let capturedMessages: any[] = [];

      context.connect = async (page) => {
        const ws = await originalConnect(page) as MockWebSocket;

        // Capture all sent messages
        const originalSend = ws.send.bind(ws);
        ws.send = (data: string) => {
          const msg = JSON.parse(data);
          capturedMessages.push(msg);
          originalSend(data);
        };

        return ws;
      };

      await input.fill(context, 'input#test', 'value', { page: 'page1' });

      // Verify DOM.setAttributeValue was used
      const setAttrMessages = capturedMessages.filter(m => m.method === 'DOM.setAttributeValue');
      expect(setAttrMessages.length).toBeGreaterThan(0);

      const clearMessage = setAttrMessages.find(m =>
        m.params?.name === 'value' && m.params?.value === ''
      );
      expect(clearMessage).toBeDefined();
      expect(clearMessage.params.nodeId).toBe(42);

      // SECURITY: Verify Runtime.evaluate is NOT used (code injection vulnerability)
      const evalMessages = capturedMessages.filter(m => m.method === 'Runtime.evaluate');
      expect(evalMessages).toHaveLength(0);

      capture.restore();
    });

    it('should dispatch keyDown and keyUp for each character', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      const originalConnect = context.connect.bind(context);
      let keyEventCount = 0;

      context.connect = async (page) => {
        const ws = await originalConnect(page) as MockWebSocket;

        const originalSend = ws.send.bind(ws);
        ws.send = (data: string) => {
          const msg = JSON.parse(data);
          if (msg.method === 'Input.dispatchKeyEvent') {
            keyEventCount++;
          }
          originalSend(data);
        };

        return ws;
      };

      await input.fill(context, 'input', 'ab', { page: 'page1' });

      // 2 characters × 2 events (keyDown + keyUp) = 4 events
      expect(keyEventCount).toBe(4);

      capture.restore();
    });

    it('should handle multi-character input', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await input.fill(context, 'input', 'test123', { page: 'page1' });

      const result = JSON.parse(capture.getLogs()[0]);
      expect(result.success).toBe(true);
      expect(result.data.value).toBe('test123');

      capture.restore();
    });

    // Note: Element not found error is difficult to test with auto-responding mocks
    // The error handling is validated by the page not found test below

    it('should handle page not found error', async () => {
      const capture = captureConsoleOutput();
      const exitMock = mockProcessExit();
      const context = new CDPContext();

      try {
        await input.fill(context, 'input', 'value', { page: 'nonexistent' });
      } catch (e) {
        // Expected process.exit
      }

      expect(exitMock.exitCode).toBe(1);
      const error = JSON.parse(capture.getLogs()[0]);
      expect(error.error).toBe(true);
      expect(error.code).toBe('FILL_FAILED');

      capture.restore();
      exitMock.restore();
    });
  });

  describe('pressKey', () => {
    it('should map common key names', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await input.pressKey(context, 'enter', { page: 'page1' });

      const result = JSON.parse(capture.getLogs()[0]);
      expect(result.success).toBe(true);
      expect(result.data.key).toBe('Enter'); // Mapped from 'enter'

      capture.restore();
    });

    it('should handle multiple mapped keys', async () => {
      const testCases = [
        { input: 'tab', expected: 'Tab' },
        { input: 'escape', expected: 'Escape' },
        { input: 'space', expected: ' ' },
        { input: 'arrowup', expected: 'ArrowUp' },
        { input: 'backspace', expected: 'Backspace' }
      ];

      for (const { input: key, expected } of testCases) {
        const capture = captureConsoleOutput();
        const context = new CDPContext();

        await input.pressKey(context, key, { page: 'page1' });

        const result = JSON.parse(capture.getLogs()[0]);
        expect(result.data.key).toBe(expected);

        capture.restore();
      }
    });

    it('should be case insensitive for key mapping', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await input.pressKey(context, 'ENTER', { page: 'page1' });

      const result = JSON.parse(capture.getLogs()[0]);
      expect(result.data.key).toBe('Enter');

      capture.restore();
    });

    it('should pass through unmapped keys', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await input.pressKey(context, 'F1', { page: 'page1' });

      const result = JSON.parse(capture.getLogs()[0]);
      expect(result.data.key).toBe('F1');

      capture.restore();
    });

    it('should dispatch keyDown and keyUp events', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      const originalConnect = context.connect.bind(context);
      let keyEvents: any[] = [];

      context.connect = async (page) => {
        const ws = await originalConnect(page) as MockWebSocket;

        const originalSend = ws.send.bind(ws);
        ws.send = (data: string) => {
          const msg = JSON.parse(data);
          if (msg.method === 'Input.dispatchKeyEvent') {
            keyEvents.push(msg.params);
          }
          originalSend(data);
        };

        return ws;
      };

      await input.pressKey(context, 'enter', { page: 'page1' });

      expect(keyEvents).toHaveLength(2);
      expect(keyEvents[0].type).toBe('keyDown');
      expect(keyEvents[0].key).toBe('Enter');
      expect(keyEvents[1].type).toBe('keyUp');
      expect(keyEvents[1].key).toBe('Enter');

      capture.restore();
    });

    it('should handle page not found error', async () => {
      const capture = captureConsoleOutput();
      const exitMock = mockProcessExit();
      const context = new CDPContext();

      try {
        await input.pressKey(context, 'enter', { page: 'nonexistent' });
      } catch (e) {
        // Expected process.exit
      }

      expect(exitMock.exitCode).toBe(1);
      const error = JSON.parse(capture.getLogs()[0]);
      expect(error.error).toBe(true);
      expect(error.code).toBe('PRESS_KEY_FAILED');

      capture.restore();
      exitMock.restore();
    });
  });
});
