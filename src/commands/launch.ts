import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { outputSuccess, outputError } from '../output.js';

const CHROME_PATH_MACOS = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

/**
 * Launch Chrome with remote debugging enabled
 */
export async function launchChrome(options: { port: number }): Promise<void> {
  // Only support macOS for now
  if (!isMacOS()) {
    outputError(
      'launch command is only supported on macOS',
      'UNSUPPORTED_PLATFORM',
      { platform: process.platform }
    );
    process.exit(1);
  }

  // Check if Chrome exists
  if (!existsSync(CHROME_PATH_MACOS)) {
    outputError(
      'Google Chrome not found at expected location',
      'CHROME_NOT_FOUND',
      { path: CHROME_PATH_MACOS }
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
    const chromeProcess = spawn(CHROME_PATH_MACOS, args, {
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
