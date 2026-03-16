import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { outputSuccess, outputError } from '../output.js';

const CHROME_PATH_MACOS = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_PATHS_WINDOWS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const CHROME_PATHS_LINUX = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium'
];

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return process.platform === 'linux';
}

/**
 * Get Chrome executable path for the current platform
 */
function getChromePath(): string | null {
  if (isMacOS()) {
    return existsSync(CHROME_PATH_MACOS) ? CHROME_PATH_MACOS : null;
  } else if (isWindows()) {
    // Try each Windows path in order
    for (const path of CHROME_PATHS_WINDOWS) {
      if (existsSync(path)) {
        return path;
      }
    }
    return null;
  } else if (isLinux()) {
    // Try each Linux path in order
    for (const path of CHROME_PATHS_LINUX) {
      if (existsSync(path)) {
        return path;
      }
    }
    return null;
  }
  return null;
}

/**
 * Launch Chrome with remote debugging enabled
 */
export async function launchChrome(options: { port: number }): Promise<void> {
  // Check if platform is supported
  if (!isMacOS() && !isWindows() && !isLinux()) {
    outputError(
      'launch command is only supported on macOS, Windows, and Linux',
      'UNSUPPORTED_PLATFORM',
      { platform: process.platform }
    );
    process.exit(1);
  }

  // Get Chrome path for current platform
  const chromePath = getChromePath();
  if (!chromePath) {
    const expectedPaths = isMacOS()
      ? [CHROME_PATH_MACOS]
      : isWindows()
      ? CHROME_PATHS_WINDOWS
      : CHROME_PATHS_LINUX;

    outputError(
      'Google Chrome not found at expected location',
      'CHROME_NOT_FOUND',
      { expectedPaths }
    );
    process.exit(1);
  }

  const { port } = options;

  // Create a separate user data directory to avoid using the default profile
  const userDataDir = join(tmpdir(), `cdp-cli-chrome-${port}`);
  if (!existsSync(userDataDir)) {
    mkdirSync(userDataDir, { recursive: true });
  }

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check'
  ];

  try {
    // Spawn Chrome in detached mode
    const chromeProcess = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore'
    });

    // Unref so CLI can exit without waiting for Chrome
    chromeProcess.unref();

    outputSuccess('Chrome launched', {
      port,
      url: `http://localhost:${port}`,
      userDataDir
    });
  } catch (error) {
    outputError(
      `Failed to launch Chrome: ${(error as Error).message}`,
      'LAUNCH_FAILED'
    );
    process.exit(1);
  }
}
