/**
 * Network inspection commands
 */

import { CDPContext, NetworkRequest } from '../context.js';
import { outputLine, outputError } from '../output.js';

/**
 * List network requests
 */
export async function listNetwork(
  context: CDPContext,
  options: { type?: string; page: string; duration?: number }
): Promise<void> {
  let ws;
  const duration = options.duration ?? 0;
  try {
    // Get page to monitor
    const page = await context.findPage(options.page);

    // Connect and enable Network domain
    ws = await context.connect(page);
    context.setupNetworkCollection(
      ws,
      (request: NetworkRequest, event) => {
        if (options.type && request.type?.toLowerCase() !== options.type.toLowerCase()) {
          return;
        }

        outputLine({
          event,
          url: request.url,
          method: request.method,
          ...(request.status !== undefined && { status: request.status }),
          ...(request.type && { type: request.type }),
          ...(request.size !== undefined && { size: request.size }),
          timestamp: request.timestamp
        });
      }
    );
    await context.sendCommand(ws, 'Network.enable');

    if (duration > 0) {
      await new Promise(resolve => setTimeout(resolve, duration * 1000));
    } else {
      await new Promise<void>((resolve) => {
        function cleanup(): void {
          process.off('SIGINT', onSigint);
          process.off('SIGTERM', onSigterm);
        }

        function onSigint(): void {
          process.exitCode = 130;
          cleanup();
          resolve();
        }

        function onSigterm(): void {
          process.exitCode = 143;
          cleanup();
          resolve();
        }

        process.on('SIGINT', onSigint);
        process.on('SIGTERM', onSigterm);
      });
    }
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

