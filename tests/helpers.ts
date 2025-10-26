/**
 * Test helpers and utilities
 */

import { vi } from 'vitest';
import { MockWebSocket } from './mocks/websocket.mock.js';
import { installMockFetch } from './mocks/fetch.mock.js';

/**
 * Setup mocks for CDPContext tests
 */
export function setupCDPMocks(options?: {
  autoRespond?: boolean;
  mockPages?: any[];
  failFetch?: boolean;
}): void {
  // Mock fetch for REST API calls
  installMockFetch({
    pages: options?.mockPages,
    failFetch: options?.failFetch
  });

  // Mock WebSocket
  vi.mock('ws', () => ({
    WebSocket: MockWebSocket
  }));
}

/**
 * Capture console output
 */
export function captureConsoleOutput(): {
  getLogs: () => string[];
  getErrors: () => string[];
  restore: () => void;
} {
  const logs: string[] = [];
  const errors: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: any[]) => {
    logs.push(args.map(String).join(' '));
  };

  console.error = (...args: any[]) => {
    errors.push(args.map(String).join(' '));
  };

  return {
    getLogs: () => logs,
    getErrors: () => errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    }
  };
}

/**
 * Parse NDJSON output
 */
export function parseNDJSON(output: string): any[] {
  return output
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

/**
 * Wait for async operations
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock process.exit that throws instead
 */
export function mockProcessExit(): {
  exitCode: number | null;
  restore: () => void;
} {
  const exitMock = { exitCode: null as number | null };
  const originalExit = process.exit;

  process.exit = ((code?: number) => {
    exitMock.exitCode = code ?? 0;
    throw new Error(`process.exit(${code})`);
  }) as any;

  return {
    get exitCode() {
      return exitMock.exitCode;
    },
    restore: () => {
      process.exit = originalExit;
    }
  };
}

/**
 * Simulate CDP events with delays
 */
export async function simulateCDPEvents(
  ws: MockWebSocket,
  events: any[],
  delayMs: number = 10
): Promise<void> {
  for (const event of events) {
    await waitFor(delayMs);
    ws.simulateMessage(event);
  }
}
