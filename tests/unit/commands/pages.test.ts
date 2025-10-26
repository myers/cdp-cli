/**
 * Tests for page management commands
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as pages from '../../../src/commands/pages.js';
import { CDPContext } from '../../../src/context.js';
import { installMockFetch } from '../../mocks/fetch.mock.js';
import { MockWebSocket } from '../../mocks/websocket.mock.js';
import { captureConsoleOutput, mockProcessExit } from '../../helpers.js';

describe('Pages Commands', () => {
  beforeEach(() => {
    installMockFetch();
  });

  describe('listPages', () => {
    it('should output NDJSON list of pages', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await pages.listPages(context);

      const logs = capture.getLogs();
      capture.restore();

      expect(logs).toHaveLength(3);

      const page1 = JSON.parse(logs[0]);
      expect(page1).toEqual({
        id: 'page1',
        title: 'Example Domain',
        url: 'https://example.com',
        type: 'page'
      });
    });

    it('should exit on error', async () => {
      installMockFetch({ failFetch: true });
      const capture = captureConsoleOutput();
      const exitMock = mockProcessExit();
      const context = new CDPContext();

      try {
        await pages.listPages(context);
      } catch (e) {
        // Expected process.exit
      }

      expect(exitMock.exitCode).toBe(1);
      const logs = capture.getLogs();
      expect(logs.length).toBeGreaterThan(0);

      const error = JSON.parse(logs[0]);
      expect(error.error).toBe(true);

      capture.restore();
      exitMock.restore();
    });
  });

  describe('newPage', () => {
    it('should create page without URL', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await pages.newPage(context);

      const logs = capture.getLogs();
      capture.restore();

      expect(logs).toHaveLength(1);
      const result = JSON.parse(logs[0]);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('new-page-123');
      expect(result.data.url).toBe('about:blank');
    });

    it('should create page with URL', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await pages.newPage(context, 'https://example.com');

      const logs = capture.getLogs();
      capture.restore();

      const result = JSON.parse(logs[0]);
      expect(result.data.url).toBe('https://example.com');
    });
  });

  describe('navigate', () => {
    it('should navigate to URL', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await pages.navigate(context, 'https://example.com', 'page1');

      const logs = capture.getLogs();
      capture.restore();

      const result = JSON.parse(logs[0]);
      expect(result.success).toBe(true);
      expect(result.data.action).toBe('https://example.com');
    });

    it('should navigate back', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await pages.navigate(context, 'back', 'page1');

      const logs = capture.getLogs();
      capture.restore();

      const result = JSON.parse(logs[0]);
      expect(result.success).toBe(true);
    });

    it('should navigate forward', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await pages.navigate(context, 'forward', 'page1');

      const logs = capture.getLogs();
      capture.restore();

      const result = JSON.parse(logs[0]);
      expect(result.success).toBe(true);
    });

    it('should reload page', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await pages.navigate(context, 'reload', 'page1');

      const logs = capture.getLogs();
      capture.restore();

      const result = JSON.parse(logs[0]);
      expect(result.success).toBe(true);
    });

    it('should handle invalid page', async () => {
      const capture = captureConsoleOutput();
      const exitMock = mockProcessExit();
      const context = new CDPContext();

      try {
        await pages.navigate(context, 'reload', 'nonexistent');
      } catch (e) {
        // Expected process.exit
      }

      expect(exitMock.exitCode).toBe(1);
      const error = JSON.parse(capture.getLogs()[0]);
      expect(error.error).toBe(true);

      capture.restore();
      exitMock.restore();
    });
  });

  describe('closePage', () => {
    it('should close page by ID', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await pages.closePage(context, 'page1');

      const logs = capture.getLogs();
      capture.restore();

      const result = JSON.parse(logs[0]);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('page1');
    });

    it('should close page by title', async () => {
      const capture = captureConsoleOutput();
      const context = new CDPContext();

      await pages.closePage(context, 'GitHub');

      const logs = capture.getLogs();
      capture.restore();

      const result = JSON.parse(logs[0]);
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('GitHub');
    });
  });
});
