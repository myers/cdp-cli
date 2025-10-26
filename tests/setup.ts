/**
 * Vitest setup file
 * Runs before all tests
 */

import { vi } from 'vitest';
import { MockWebSocket } from './mocks/websocket.mock.js';

// Mock the ws module globally
vi.mock('ws', () => ({
  WebSocket: MockWebSocket
}));

// Mock fs module for screenshot tests
vi.mock('fs', () => ({
  writeFileSync: vi.fn()
}));
