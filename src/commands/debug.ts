/**
 * Debugging commands: console, snapshot, eval, screenshot
 */

import { CDPContext, ConsoleMessage, Page } from '../context.js';
import { outputLines, outputLine, outputError, outputSuccess, outputRaw } from '../output.js';
import { writeFileSync } from 'fs';
import { WebSocket } from 'ws';

/**
 * List console messages
 */
/**
 * Recursively expand an object/array via CDP Runtime.getProperties
 */
async function expandValue(
  context: CDPContext,
  ws: WebSocket,
  arg: any,
  depth: number = 0,
  maxDepth: number = 3
): Promise<any> {
  // Primitive values - return directly
  if (arg.value !== undefined) return arg.value;

  // Error objects - use description directly (contains message + stack trace)
  if (arg.subtype === 'error' && arg.description) {
    return arg.description;
  }

  // Don't recurse too deep
  if (depth >= maxDepth) {
    return arg.description || 'Object';
  }

  // Objects/arrays with objectId - fetch and expand properties
  if (arg.objectId) {
    try {
      const props = await context.sendCommand(ws, 'Runtime.getProperties', {
        objectId: arg.objectId,
        ownProperties: true
      });

      if (props.result && props.result.length > 0) {
        const isArray = arg.subtype === 'array' || arg.className === 'Array';
        const enumerable = props.result.filter((p: any) => p.enumerable !== false);

        if (isArray) {
          // For arrays, extract numeric indices and return as array
          const arrayEntries = enumerable
            .filter((p: any) => /^\d+$/.test(p.name))
            .sort((a: any, b: any) => parseInt(a.name) - parseInt(b.name));

          const values = await Promise.all(
            arrayEntries.map(async (p: any) => {
              if (p.value) {
                return await expandValue(context, ws, p.value, depth + 1, maxDepth);
              }
              return null;
            })
          );
          return values;
        } else {
          // For objects, return as object
          const obj: any = {};
          for (const p of enumerable) {
            if (p.value) {
              obj[p.name] = await expandValue(context, ws, p.value, depth + 1, maxDepth);
            }
          }
          return obj;
        }
      }
    } catch (error) {
      return arg.description || 'Object';
    }
  }

  // Fallback
  return arg.description || null;
}

export async function listConsole(
  context: CDPContext,
  options: {
    type?: string;
    page: string;
    duration?: number;
    tail: number;
    withType: boolean;
    withTimestamp: boolean;
    withSource: boolean;
    inspect?: boolean;
  }
): Promise<void> {
  let ws: WebSocket | undefined;
  const duration = options.duration ?? 0;
  try {
    // Get page to monitor
    const page = await context.findPage(options.page);

    // Connect and enable Runtime domain
    ws = await context.connect(page);

    // Streaming mode: output messages immediately as they arrive
    if (duration === 0) {
      context.setupConsoleCollection(ws, (message: ConsoleMessage) => {
        if (options.type && message.type !== options.type) {
          return;
        }

        outputLine({
          type: message.type,
          timestamp: message.timestamp,
          text: message.text,
          source: message.source,
          ...(message.line !== undefined && { line: message.line }),
          ...(message.url && { url: message.url })
        });
      });
      await context.sendCommand(ws, 'Runtime.enable');

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
    } else {
      // Batch mode: collect messages, format, filter, then output
      context.setupConsoleCollection(ws);
      await context.sendCommand(ws, 'Runtime.enable');

      // Collect for specified duration
      await new Promise(resolve => setTimeout(resolve, duration * 1000));

      // Get collected messages
      let messages = context.getConsoleMessages();

      // Fetch object properties for better formatting
      if (ws) {
        for (const msg of messages) {
          // For exceptions with -i, show full stack trace
          if (options.inspect && msg.stackTrace) {
            msg.text = msg.stackTrace;
            continue;
          }

          if (msg.args && msg.args.length > 0) {
            if (options.inspect) {
              // Full expansion mode - recursively expand all objects/arrays
              const expandedArgs = await Promise.all(
                msg.args.map(async (arg: any) => {
                  return await expandValue(context, ws!, arg, 0, 3);
                })
              );
              msg.text = expandedArgs.map(a => JSON.stringify(a)).join(' ');
            } else {
              // Default mode - shallow expansion with descriptions
              const formattedArgs = await Promise.all(
                msg.args.map(async (arg: any) => {
                  // Primitive values
                  if (arg.value !== undefined) return String(arg.value);

                  // Error objects - use description directly (contains message + stack trace)
                  if (arg.subtype === 'error' && arg.description) {
                    return arg.description;
                  }

                  // Objects with objectId - fetch properties
                  if (arg.objectId && ws) {
                    try {
                      const props = await context.sendCommand(ws, 'Runtime.getProperties', {
                        objectId: arg.objectId,
                        ownProperties: true
                      });

                      // Format as {key: value, ...}
                      if (props.result && props.result.length > 0) {
                        const entries = props.result
                          .filter((p: any) => p.enumerable !== false)
                          .slice(0, 10) // Limit to first 10 properties
                          .map((p: any) => {
                            const value = p.value?.value !== undefined
                              ? JSON.stringify(p.value.value)
                              : (p.value?.description || '...');
                            return `${p.name}: ${value}`;
                          })
                          .join(', ');
                        const overflow = props.result.length > 10 ? ', ...' : '';
                        return `{${entries}${overflow}}`;
                      }
                    } catch (error) {
                      // Fall back to description if property fetch fails
                      return arg.description || 'Object';
                    }
                  }

                  // Fallback to description
                  return arg.description || JSON.stringify(arg);
                })
              );

              // Update message text with formatted args
              msg.text = formattedArgs.join(' ');
            }
          }
        }
      }

      // Filter by type if specified
      if (options.type) {
        messages = messages.filter(m => m.type === options.type);
      }

      // Track total before truncation for stderr warning
      const totalMessages = messages.length;

      // Apply tail limit (last N messages)
      if (options.tail !== -1 && messages.length > options.tail) {
        messages = messages.slice(-options.tail);

        // Warn on stderr when truncating
        const skippedCount = totalMessages - messages.length;
        const suggestedTail = Math.min(totalMessages, 50);
        console.error(`(${skippedCount} messages skipped. Use --tail ${suggestedTail} or --all to see more)`);
      }

      // Output format depends on flags
      const needsObjectFormat = options.withType || options.withTimestamp || options.withSource;

      if (needsObjectFormat) {
        // Object format with requested fields
        const output = messages.map(msg => {
          const obj: any = { text: msg.text };

          if (options.withType) {
            obj.type = msg.type;
            obj.source = msg.source;
          }

          if (options.withTimestamp) {
            obj.timestamp = msg.timestamp;
          }

          if (options.withSource) {
            if (msg.line) obj.line = msg.line;
            if (msg.url) obj.url = msg.url;
          }

          return obj;
        });
        outputLines(output);
      } else {
        // Minimal format: bare strings
        messages.forEach(msg => {
          outputRaw(JSON.stringify(msg.text));
        });
      }
    }
  } catch (error) {
    outputError(
      (error as Error).message,
      'LIST_CONSOLE_FAILED',
      { page: options.page }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

/**
 * Take a snapshot of the page (DOM or accessibility tree)
 */
export async function snapshot(
  context: CDPContext,
  options: { format?: string; page: string }
): Promise<void> {
  let ws;
  try {
    // Get page
    const page = await context.findPage(options.page);

    ws = await context.connect(page);

    const format = options.format || 'text';

    if (format === 'text') {
      // Simple text snapshot
      await context.sendCommand(ws, 'Runtime.enable');
      const result = await context.sendCommand(ws, 'Runtime.evaluate', {
        expression: 'document.body.innerText',
        returnByValue: true
      });

      outputRaw(result.result?.value || '');
    } else if (format === 'dom') {
      // DOM snapshot
      await context.sendCommand(ws, 'DOM.enable');
      const doc = await context.sendCommand(ws, 'DOM.getDocument', {
        depth: -1,
        pierce: true
      });

      outputLine(doc);
    } else if (format === 'ax') {
      // Accessibility tree snapshot
      await context.sendCommand(ws, 'Accessibility.enable');
      const ax = await context.sendCommand(ws, 'Accessibility.getFullAXTree');

      outputLine(ax);
    } else {
      throw new Error(`Unknown snapshot format: ${format}`);
    }
  } catch (error) {
    outputError(
      (error as Error).message,
      'SNAPSHOT_FAILED',
      { format: options.format, page: options.page }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

/**
 * Evaluate JavaScript expression
 */
export async function evaluate(
  context: CDPContext,
  expression: string,
  options: { page: string }
): Promise<void> {
  let ws;
  try {
    // Get page
    const page = await context.findPage(options.page);

    ws = await context.connect(page);

    await context.sendCommand(ws, 'Runtime.enable');
    const result = await context.sendCommand(ws, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });

    if (result.exceptionDetails) {
      outputError(
        result.exceptionDetails.text,
        'EVAL_EXCEPTION',
        result.exceptionDetails
      );
      process.exit(1);
    }

    outputLine({
      success: true,
      value: result.result?.value,
      type: result.result?.type
    });
  } catch (error) {
    outputError(
      (error as Error).message,
      'EVAL_FAILED',
      { expression, page: options.page }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

/**
 * Take a screenshot
 */
export async function screenshot(
  context: CDPContext,
  options: { output: string; format?: string; page: string; quality?: number; scale?: number }
): Promise<void> {
  let ws;
  try {
    // Get page
    const page = await context.findPage(options.page);

    ws = await context.connect(page);

    const format = options.format || 'jpeg';
    const validFormats = ['jpeg', 'png', 'webp'];
    if (!validFormats.includes(format)) {
      throw new Error(`Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}`);
    }

    const quality = options.quality || 90;
    const scale = options.scale ?? 1;

    if (scale <= 0 || scale > 1) {
      throw new Error(`Invalid scale: ${scale}. Must be between 0 (exclusive) and 1 (inclusive).`);
    }

    const captureParams: Record<string, any> = {
      format,
      quality: format === 'jpeg' ? quality : undefined
    };

    if (scale !== 1) {
      const layoutMetrics = await context.sendCommand(ws, 'Page.getLayoutMetrics');
      const width =
        layoutMetrics?.cssContentSize?.width ??
        layoutMetrics?.contentSize?.width ??
        layoutMetrics?.layoutViewport?.clientWidth;
      const height =
        layoutMetrics?.cssContentSize?.height ??
        layoutMetrics?.contentSize?.height ??
        layoutMetrics?.layoutViewport?.clientHeight;

      if (!width || !height) {
        throw new Error('Unable to determine page dimensions for scaling.');
      }

      captureParams.clip = {
        x: 0,
        y: 0,
        width,
        height,
        scale
      };
    }

    const result = await context.sendCommand(ws, 'Page.captureScreenshot', captureParams);

    // Save to file
    const buffer = Buffer.from(result.data, 'base64');
    writeFileSync(options.output, buffer);

    outputSuccess('Screenshot saved', {
      file: options.output,
      format,
      size: buffer.length
    });
  } catch (error) {
    outputError(
      (error as Error).message,
      'SCREENSHOT_FAILED',
      { output: options.output, page: options.page }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}
