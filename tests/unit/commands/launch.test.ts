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
    existsSync: vi.fn(),
    mkdirSync: vi.fn()
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

  describe('isWindows', () => {
    it('should return true on win32 platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      expect(launch.isWindows()).toBe(true);
    });

    it('should return false on darwin platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      });

      expect(launch.isWindows()).toBe(false);
    });

    it('should return false on linux platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      expect(launch.isWindows()).toBe(false);
    });
  });

  describe('isLinux', () => {
    it('should return true on linux platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      expect(launch.isLinux()).toBe(true);
    });

    it('should return false on darwin platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      });

      expect(launch.isLinux()).toBe(false);
    });

    it('should return false on win32 platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      expect(launch.isLinux()).toBe(false);
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

    it('should launch Chrome on Windows with correct arguments', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      // Mock existsSync to return true for the first Windows path
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        return path === 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      });

      const mockUnref = vi.fn();
      const mockProcess = { unref: mockUnref };
      vi.mocked(child_process.spawn).mockReturnValue(mockProcess as any);

      const capture = captureConsoleOutput();

      await launch.launchChrome({ port: 9223 });

      const logs = capture.getLogs();
      capture.restore();

      expect(child_process.spawn).toHaveBeenCalledWith(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
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

    it('should try alternative Windows path if first not found', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      // Mock existsSync to return true only for the second Windows path
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        return path === 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
      });

      const mockUnref = vi.fn();
      const mockProcess = { unref: mockUnref };
      vi.mocked(child_process.spawn).mockReturnValue(mockProcess as any);

      const capture = captureConsoleOutput();

      await launch.launchChrome({ port: 9223 });

      const logs = capture.getLogs();
      capture.restore();

      expect(child_process.spawn).toHaveBeenCalledWith(
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        expect.any(Array),
        expect.any(Object)
      );

      expect(mockUnref).toHaveBeenCalled();
    });

    it('should launch Chrome on Linux with google-chrome', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      // Mock existsSync to return true for the first Linux path
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        return path === '/usr/bin/google-chrome';
      });

      const mockUnref = vi.fn();
      const mockProcess = { unref: mockUnref };
      vi.mocked(child_process.spawn).mockReturnValue(mockProcess as any);

      const capture = captureConsoleOutput();

      await launch.launchChrome({ port: 9223 });

      const logs = capture.getLogs();
      capture.restore();

      expect(child_process.spawn).toHaveBeenCalledWith(
        '/usr/bin/google-chrome',
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

    it('should try alternative Linux paths (chromium-browser)', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      // Mock existsSync to return true only for chromium-browser
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        return path === '/usr/bin/chromium-browser';
      });

      const mockUnref = vi.fn();
      const mockProcess = { unref: mockUnref };
      vi.mocked(child_process.spawn).mockReturnValue(mockProcess as any);

      const capture = captureConsoleOutput();

      await launch.launchChrome({ port: 9223 });

      const logs = capture.getLogs();
      capture.restore();

      expect(child_process.spawn).toHaveBeenCalledWith(
        '/usr/bin/chromium-browser',
        expect.any(Array),
        expect.any(Object)
      );

      expect(mockUnref).toHaveBeenCalled();
    });

    it('should try snap chromium path on Linux', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      // Mock existsSync to return true only for snap path
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        return path === '/snap/bin/chromium';
      });

      const mockUnref = vi.fn();
      const mockProcess = { unref: mockUnref };
      vi.mocked(child_process.spawn).mockReturnValue(mockProcess as any);

      const capture = captureConsoleOutput();

      await launch.launchChrome({ port: 9223 });

      const logs = capture.getLogs();
      capture.restore();

      expect(child_process.spawn).toHaveBeenCalledWith(
        '/snap/bin/chromium',
        expect.any(Array),
        expect.any(Object)
      );

      expect(mockUnref).toHaveBeenCalled();
    });

    it('should fail on unsupported platforms', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'freebsd' // Use an unsupported platform
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

    it('should fail when Chrome not found on macOS', async () => {
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

    it('should fail when Chrome not found on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      // Mock existsSync to return false for all Windows paths
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
      expect(output.details.expectedPaths).toBeDefined();
      expect(output.details.expectedPaths.length).toBe(2);
    });

    it('should fail when Chrome not found on Linux', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      // Mock existsSync to return false for all Linux paths
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
      expect(output.details.expectedPaths).toBeDefined();
      expect(output.details.expectedPaths.length).toBe(5);
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
