import { existsSync, readFileSync } from 'fs';
import { resolve, dirname, join, parse } from 'path';

interface Config {
  cdpPort?: number;
}

/**
 * Find .cdp-cli.json config file by traversing up from startDir
 */
export function findConfig(startDir: string = process.cwd()): Config | null {
  let currentDir = resolve(startDir);
  const root = parse(currentDir).root;

  while (true) {
    const configPath = join(currentDir, '.cdp-cli.json');
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse ${configPath}: ${(error as Error).message}`);
      }
    }

    if (currentDir === root) {
      break;
    }

    currentDir = dirname(currentDir);
  }

  return null;
}

/**
 * Get the default CDP port from config file or fallback to 9223
 */
export function getDefaultPort(): number {
  const config = findConfig();
  return config?.cdpPort ?? 9223;
}

/**
 * Get the default CDP URL
 */
export function getDefaultCdpUrl(): string {
  return `http://localhost:${getDefaultPort()}`;
}
