/**
 * Tests for config file handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { findConfig, getDefaultPort, getDefaultCdpUrl } from '../../src/config.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn()
  };
});

describe('Config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findConfig', () => {
    it('should return config when .cdp-cli.json exists in current directory', () => {
      const mockConfig = { cdpPort: 9224 };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const config = findConfig('/test/dir');

      expect(config).toEqual(mockConfig);
      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('.cdp-cli.json')
      );
    });

    it('should return null when no config file found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = findConfig('/test/dir');

      expect(config).toBeNull();
    });

    it('should search parent directories', () => {
      let callCount = 0;
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        callCount++;
        // Return true on second call (parent directory)
        return callCount === 2;
      });

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ cdpPort: 9225 }));

      const config = findConfig('/test/deep/dir');

      expect(config).toEqual({ cdpPort: 9225 });
      expect(fs.existsSync).toHaveBeenCalledTimes(2);
    });

    it('should throw error on invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      expect(() => findConfig('/test/dir')).toThrow('Failed to parse');
    });
  });

  describe('getDefaultPort', () => {
    it('should return port from config if available', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ cdpPort: 9999 }));

      const port = getDefaultPort();

      expect(port).toBe(9999);
    });

    it('should return 9223 if no config found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const port = getDefaultPort();

      expect(port).toBe(9223);
    });

    it('should return 9223 if config has no cdpPort', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const port = getDefaultPort();

      expect(port).toBe(9223);
    });
  });

  describe('getDefaultCdpUrl', () => {
    it('should return URL with port from config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ cdpPort: 8888 }));

      const url = getDefaultCdpUrl();

      expect(url).toBe('http://localhost:8888');
    });

    it('should return URL with default port 9223', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const url = getDefaultCdpUrl();

      expect(url).toBe('http://localhost:9223');
    });
  });
});
