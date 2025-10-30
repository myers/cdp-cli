/**
 * Tests for launch command
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as launch from '../../../src/commands/launch.js';
import { captureConsoleOutput, mockProcessExit } from '../../helpers.js';
import * as fs from 'fs';
import * as child_process from 'child_process';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn()
  };
});

// Mock child_process module
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

describe('Launch Command', () => {
  let originalPlatform: string;

  beforeEach(() => {
    vi.clearAllMocks();
    originalPlatform = process.platform;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'platform', {
      value: originalPlatform
    });
  });

  describe('isMacOS', () => {
    it('should return true on darwin platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      });

      expect(launch.isMacOS()).toBe(true);
    });

    it('should return false on linux platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      expect(launch.isMacOS()).toBe(false);
    });

    it('should return false on win32 platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      expect(launch.isMacOS()).toBe(false);
    });
  });

  describe('launchChrome', () => {
    it('should launch Chrome on macOS with correct arguments', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const mockUnref = vi.fn();
      const mockProcess = { unref: mockUnref };
      vi.mocked(child_process.spawn).mockReturnValue(mockProcess as any);

      const capture = captureConsoleOutput();

      await launch.launchChrome({ port: 9223 });

      const logs = capture.getLogs();
      capture.restore();

      expect(child_process.spawn).toHaveBeenCalledWith(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        expect.arrayContaining([
          '--remote-debugging-port=9223',
          '--no-first-run',
          '--no-default-browser-check'
        ]),
        {
          detached: true,
          stdio: 'ignore'
        }
      );

      // Verify --user-data-dir is included
      const spawnArgs = vi.mocked(child_process.spawn).mock.calls[0][1];
      expect(spawnArgs).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/--user-data-dir=.*cdp-cli-chrome-9223/)
        ])
      );

      expect(mockUnref).toHaveBeenCalled();

      expect(logs).toHaveLength(1);
      const output = JSON.parse(logs[0]);
      expect(output).toMatchObject({
        success: true,
        message: 'Chrome launched',
        data: {
          port: 9223,
          url: 'http://localhost:9223'
        }
      });
    });

    it('should fail on non-macOS platforms', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      const capture = captureConsoleOutput();
      const exitMock = mockProcessExit();

      try {
        await launch.launchChrome({ port: 9223 });
      } catch (e) {
        // Expected process.exit
      }

      const logs = capture.getLogs();
      capture.restore();
      exitMock.restore();

      expect(exitMock.exitCode).toBe(1);
      expect(logs).toHaveLength(1);
      const output = JSON.parse(logs[0]);
      expect(output).toMatchObject({
        error: true,
        code: 'UNSUPPORTED_PLATFORM'
      });
    });

    it('should fail when Chrome not found', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const capture = captureConsoleOutput();
      const exitMock = mockProcessExit();

      try {
        await launch.launchChrome({ port: 9223 });
      } catch (e) {
        // Expected process.exit
      }

      const logs = capture.getLogs();
      capture.restore();
      exitMock.restore();

      expect(exitMock.exitCode).toBe(1);
      expect(logs).toHaveLength(1);
      const output = JSON.parse(logs[0]);
      expect(output).toMatchObject({
        error: true,
        code: 'CHROME_NOT_FOUND'
      });
    });

    it('should launch Chrome with custom port', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const mockUnref = vi.fn();
      const mockProcess = { unref: mockUnref };
      vi.mocked(child_process.spawn).mockReturnValue(mockProcess as any);

      const capture = captureConsoleOutput();

      await launch.launchChrome({ port: 9999 });

      capture.restore();

      expect(child_process.spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['--remote-debugging-port=9999']),
        expect.any(Object)
      );

      // Verify custom port is in user-data-dir
      const spawnArgs = vi.mocked(child_process.spawn).mock.calls[0][1];
      expect(spawnArgs).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/--user-data-dir=.*cdp-cli-chrome-9999/)
        ])
      );
    });
  });
});
