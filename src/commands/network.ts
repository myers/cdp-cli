/**
 * Network inspection commands
 */

import { CDPContext, Page } from '../context.js';
import { outputLines, outputLine, outputError } from '../output.js';

/**
 * List network requests
 */
export async function listNetwork(
  context: CDPContext,
  options: { type?: string; page: string; duration: number }
): Promise<void> {
  let ws;
  try {
    // Get page to monitor
    const page = await context.findPage(options.page);

    // Connect and enable Network domain
    ws = await context.connect(page);
    context.setupNetworkCollection(ws);
    await context.sendCommand(ws, 'Network.enable');

    // Collect for specified duration (in milliseconds)
    await new Promise(resolve => setTimeout(resolve, options.duration * 1000));

    // Get collected requests
    let requests = context.getNetworkRequests();

    // Filter by type if specified
    if (options.type) {
      requests = requests.filter(r => r.type === options.type);
    }

    // Output as NDJSON
    const output = requests.map(req => ({
      url: req.url,
      method: req.method,
      ...(req.status && { status: req.status }),
      ...(req.type && { type: req.type }),
      ...(req.size && { size: req.size }),
      timestamp: req.timestamp
    }));

    outputLines(output);
  } catch (error) {
    outputError(
      (error as Error).message,
      'LIST_NETWORK_FAILED',
      { page: options.page }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

